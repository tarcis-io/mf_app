/**
 * Server-side client for `mf_service`, the FastAPI backend this app calls for
 * batch data. See the `mf_service` README for the full API contract.
 *
 * This module is used only from Server Components / server code: it reads the
 * `MF_SERVICE_URL` environment variable and sends the caller's identity in a
 * request header. Do not import it into a Client Component — the base URL and
 * the per-user header must never be exposed to the browser. Callers today are
 * the home and `/batches` pages (Server Components) and the batch Server Actions
 * in `app/batches/actions.ts`; the About page also calls `getServiceInfo`.
 *
 * `mf_service` has no aggregate/stats endpoint, so callers that need counts
 * fetch the user's batches with `listBatches` and reduce them with
 * `summarizeBatches`.
 *
 * Service-to-service authentication: in production every request also carries a
 * Google-signed OIDC ID token in the `Authorization: Bearer` header (see
 * {@link authHeaders}), so `mf_service` can be deployed on Cloud Run with
 * authentication required and only accept calls from this app's service
 * account. This is a separate concern from the per-user `X-User-Id` header:
 * the ID token authenticates *the mf_app service* to Cloud Run's front end,
 * while `X-User-Id` identifies *the end user* to mf_service's own logic. Token
 * minting is skipped outside production (local dev talks to an unauthenticated
 * mf_service), so no Google credentials are needed to run locally. The token is
 * fetched directly from the Cloud Run metadata server (no external dependency);
 * see {@link authHeaders}.
 */

/**
 * The lifecycle states of a batch, from `mf_service`'s `BatchStatus` enum. The
 * order is the lifecycle order — first the upload phase (`creating` →
 * `created`), then the engine processing phase (`processing` → `processed`) —
 * with `error` (the shared terminal failure state) last. UI that lists every
 * status iterates this array, so the display order follows the lifecycle.
 */
export const BATCH_STATUSES = [
  "creating",
  "created",
  "processing",
  "processed",
  "error",
] as const;

/** One batch lifecycle state (e.g. `"processing"`). */
export type BatchStatus = (typeof BATCH_STATUSES)[number];

/**
 * A batch as returned by `GET /batches` (mf_service's `BatchResponse`). Only
 * the fields this app uses are typed; `error_message` is set only when
 * `status` is `"error"`.
 */
export interface Batch {
  id: string;
  user_id: string;
  name: string;
  created: string;
  status: BatchStatus;
  error_message: string | null;
}

/** A total plus a per-status count covering every `BatchStatus`. */
export interface BatchSummary {
  total: number;
  counts: Record<BatchStatus, number>;
}

/**
 * Narrow an arbitrary parsed JSON value to a {@link Batch}. A real batch is an
 * object carrying at least the `id` and `status` the app reads; that's enough
 * to tell a genuine `BatchResponse` apart from a misconfigured proxy's HTML or
 * an unexpected payload. The `status` string is not constrained to a known
 * `BatchStatus` here — the service owns that enum, and `summarizeBatches`
 * already tolerates an unknown value — so this guards the response *shape*, not
 * the lifecycle vocabulary.
 */
function isBatch(value: unknown): value is Batch {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).id === "string" &&
    typeof (value as Record<string, unknown>).status === "string"
  );
}

/**
 * Parse a single-batch response body and fail with a clear, diagnosable error
 * if it isn't a batch object. Shared by the endpoints that return one batch
 * ({@link createBatch}, {@link renameBatch}) so a 2xx with an unexpected body
 * (e.g. HTML from a misconfigured proxy) surfaces the same way the list/version
 * calls already handle it, rather than as a bare `SyntaxError` or a silent cast.
 */
async function parseBatchResponse(
  response: Response,
  context: string,
): Promise<Batch> {
  const body: unknown = await response.json();
  if (!isBatch(body)) {
    throw new Error(`${context} returned an unexpected body (not a batch object)`);
  }
  return body;
}

/**
 * How long (ms) to wait for `mf_service` before aborting the request. Without a
 * cap, a hung backend would stall the Server Component render (and the home
 * page's Suspense boundary) until the platform's own timeout fires. On abort the
 * fetch rejects with a `TimeoutError`, which the caller (`BatchesCard`) treats
 * like any other failure and renders its error state.
 */
const REQUEST_TIMEOUT_MS = 5000;

/** Resolve the configured `mf_service` base URL, or throw if it's unset. */
function baseUrl(): string {
  const url = process.env.MF_SERVICE_URL;
  if (!url || url.trim() === "") {
    throw new Error(
      "MF_SERVICE_URL is not set; cannot reach mf_service. " +
        "Set it to the service base URL (see .env.example / DEPLOYMENT.md).",
    );
  }
  // Trim any trailing slash(es) so `${base}/batches` never doubles up, even if
  // the configured URL ends in more than one.
  return url.trim().replace(/\/+$/, "");
}

/**
 * Whether to authenticate calls to mf_service with a Google ID token. Gated on
 * production only, matching the rest of the app's `NODE_ENV` convention (the
 * Docker image sets `NODE_ENV=production`; see env.ts / the Dockerfile). Locally
 * mf_service is unauthenticated, so token minting is skipped and no Google
 * credentials are needed to run `pnpm dev`.
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * The GCE/Cloud Run metadata server endpoint that mints an OIDC ID token for the
 * instance's attached service account. `?audience=` sets the token's `aud`
 * claim; `format=full` includes the service-account email / project claims. The
 * request MUST carry the `Metadata-Flavor: Google` header — the server rejects
 * requests without it (an SSRF guard). Available only on Google compute
 * platforms; unreachable locally, which is why token minting is gated to
 * production. No SDK is used — a plain fetch keeps this dependency-free.
 */
const METADATA_IDENTITY_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
const METADATA_HEADER = { "Metadata-Flavor": "Google" } as const;

/**
 * Refresh an ID token this many ms before it actually expires, so a token that's
 * about to lapse isn't handed to a request that then races the clock. ID tokens
 * are valid ~1h; a 5-minute skew is comfortably safe.
 */
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

/**
 * Fallback lifetime used only when a token's `exp` claim can't be parsed. The
 * token is almost certainly valid for ~1h, but without a trustworthy `exp` we
 * cache it conservatively and re-fetch sooner.
 */
const TOKEN_FALLBACK_TTL_MS = 10 * 60 * 1000;

/** A cached token and the epoch-ms moment it should be considered stale at. */
interface CachedToken {
  token: string;
  /** When to refresh — the real `exp` minus {@link TOKEN_REFRESH_SKEW_MS}. */
  refreshAt: number;
}

/**
 * Per-audience token cache. The metadata server would serve a fresh token on
 * every call, but that's a network round-trip per request; we hold the token
 * until shortly before it expires. Keyed by audience (one entry in practice —
 * the mf_service base URL — but correct if that ever varies).
 */
const tokenCache = new Map<string, CachedToken>();

/**
 * In-flight fetches, keyed by audience, so concurrent cache misses share a
 * single metadata request instead of stampeding the server.
 */
const inFlight = new Map<string, Promise<string>>();

/**
 * Read the `exp` (seconds since epoch) from a JWT without verifying it — we
 * trust it because it came straight from the metadata server; we only need to
 * know when to refresh. Returns the refresh deadline in epoch ms, or `null` if
 * the token isn't a parseable JWT with a numeric `exp`.
 */
function refreshDeadlineFromToken(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    // Base64url → JSON. `atob` handles the decoding; restore url-safe chars.
    const payloadJson = atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"));
    const payload: unknown = JSON.parse(payloadJson);
    const exp =
      typeof payload === "object" &&
      payload !== null &&
      typeof (payload as { exp?: unknown }).exp === "number"
        ? (payload as { exp: number }).exp
        : null;
    if (exp === null) return null;
    return exp * 1000 - TOKEN_REFRESH_SKEW_MS;
  } catch {
    return null;
  }
}

/**
 * Fetch a fresh ID token for `audience` from the metadata server. Capped at
 * `REQUEST_TIMEOUT_MS` like the service calls, so a wedged metadata server can't
 * hang the render. Throws on a non-2xx response or an empty body.
 */
async function fetchIdTokenFromMetadata(audience: string): Promise<string> {
  const url = `${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(
    audience,
  )}&format=full`;

  const response = await fetch(url, {
    headers: METADATA_HEADER,
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `metadata server returned ${response.status} ${response.statusText}`,
    );
  }

  const token = (await response.text()).trim();
  if (token === "") {
    throw new Error("metadata server returned an empty token");
  }
  return token;
}

/**
 * Return a valid ID token for `audience`, from cache when fresh, otherwise
 * fetched from the metadata server and cached until shortly before it expires.
 * Concurrent misses share one in-flight request.
 */
async function getIdToken(audience: string): Promise<string> {
  const cached = tokenCache.get(audience);
  if (cached && Date.now() < cached.refreshAt) {
    return cached.token;
  }

  const existing = inFlight.get(audience);
  if (existing) return existing;

  const request = (async () => {
    try {
      const token = await fetchIdTokenFromMetadata(audience);
      const refreshAt =
        refreshDeadlineFromToken(token) ?? Date.now() + TOKEN_FALLBACK_TTL_MS;
      tokenCache.set(audience, { token, refreshAt });
      return token;
    } finally {
      inFlight.delete(audience);
    }
  })();
  inFlight.set(audience, request);
  return request;
}

/**
 * Build the auth headers for a call to mf_service.
 *
 * Outside production: returns `{}` — no token, since local mf_service is
 * unauthenticated. In production: obtains a Google-signed OIDC ID token for
 * `audience` (the mf_service base URL — exactly what Cloud Run's front end
 * validates) from the metadata server and returns it as a Bearer `Authorization`
 * header.
 *
 * Fails loudly: if the token can't be obtained in production this rejects, so
 * the caller surfaces its error state rather than sending an unauthenticated
 * request that Cloud Run would reject with a 401/403 anyway. The thrown error is
 * wrapped with context so a misconfigured service account / metadata outage is
 * diagnosable in the logs.
 *
 * @param audience the OIDC audience for the token — pass the resolved mf_service
 *   base URL (see {@link baseUrl}).
 */
async function authHeaders(audience: string): Promise<Record<string, string>> {
  if (!isProduction()) return {};

  try {
    const token = await getIdToken(audience);
    return { Authorization: `Bearer ${token}` };
  } catch (error) {
    throw new Error(
      `Failed to obtain a Google ID token for mf_service (audience ${audience}). ` +
        `On Cloud Run, ensure the service runs with a service account that has ` +
        `the Cloud Run Invoker role on mf_service, and that the metadata server ` +
        `is reachable (see DEPLOYMENT.md).`,
      { cause: error },
    );
  }
}

/**
 * List the batches owned by `userId`, newest first, by calling
 * `GET {MF_SERVICE_URL}/batches`.
 *
 * The user's identity is sent in the `X-User-Id` header — the Google account id
 * (the OAuth `sub`, surfaced as `session.user.id`; see `@/auth`). `mf_service`
 * scopes every batch to that header and returns `422` if it's absent, so the
 * caller must pass a real id.
 *
 * Always fetched fresh (`cache: "no-store"`): the count is a live figure, and
 * the response is per-user, so it must never be cached across requests. The
 * request is capped at `REQUEST_TIMEOUT_MS`. Throws on a missing base URL, a
 * timeout, any non-2xx response, or a body that isn't a JSON array; the caller
 * (`BatchesCard`) catches that and renders an error state rather than failing
 * the page.
 *
 * Note: this is a server-to-server call (Next server → mf_service), so it is
 * not governed by the browser CSP `connect-src` in `proxy.ts` — that directive
 * only applies to fetches made by the browser.
 */
export async function listBatches(userId: string): Promise<Batch[]> {
  const base = baseUrl();
  // Resolve the auth headers first, so the fetch options (including the abort
  // signal) are then built and passed synchronously in one tick.
  const auth = await authHeaders(base);
  const response = await fetch(`${base}/batches`, {
    headers: {
      ...auth,
      "X-User-Id": userId,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `mf_service GET /batches failed: ${response.status} ${response.statusText}`,
    );
  }

  // A 2xx with a non-JSON or non-array body (e.g. a misconfigured proxy
  // returning HTML) would otherwise surface as a confusing parse error, or let
  // a non-array through to `summarizeBatches`. Fail with a clear message so the
  // caller's error state is diagnosable.
  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    throw new Error(
      `mf_service GET /batches returned a non-array body (got ${typeof body})`,
    );
  }

  return body as Batch[];
}

/**
 * The five files a new batch requires, in the exact shape `POST /batches`
 * expects (see the mf_service README). Each entry is one `multipart/form-data`
 * part:
 *   - `key`      — a stable identifier this app uses internally (form inputs,
 *                  the `createBatch` argument, tests). Not sent to the service.
 *   - `field`    — the multipart field name mf_service reads. Must match exactly.
 *   - `filename` — the filename mf_service stores the part under. The batch's
 *                  files are keyed by this name, so the upload MUST use it and
 *                  NOT the user's original filename (which is arbitrary).
 *   - `group`    — which tool the file comes from, for grouping in the UI.
 *   - `accept`   — the expected extension, used as the file picker hint and for
 *                  client-side validation.
 *
 * This is the single source of truth for the required-file contract: the new-
 * batch dialog renders one input per entry, and `createBatch` builds the body
 * from it, so the two can't drift from each other or from the service.
 */
export const BATCH_FILE_FIELDS = [
  {
    key: "mzmine_annotations",
    field: "mzmine_annotations",
    filename: "mzmine_annotations.csv",
    group: "mzmine",
    accept: ".csv",
  },
  {
    key: "mzmine_full_feature_table",
    field: "mzmine_full_feature_table",
    filename: "mzmine_full_feature_table.csv",
    group: "mzmine",
    accept: ".csv",
  },
  {
    key: "mzmine_metadata",
    field: "mzmine_metadata",
    filename: "mzmine_metadata.csv",
    group: "mzmine",
    accept: ".csv",
  },
  {
    key: "gnps_feature_table_reformated",
    field: "gnps_feature_table_reformated",
    filename: "gnps_feature_table_reformated.csv",
    group: "gnps",
    accept: ".csv",
  },
  {
    key: "gnps_merged_results",
    field: "gnps_merged_results",
    filename: "gnps_merged_results.tsv",
    group: "gnps",
    accept: ".tsv",
  },
] as const;

/** The `key` of one required batch file (e.g. `"mzmine_annotations"`). */
export type BatchFileKey = (typeof BATCH_FILE_FIELDS)[number]["key"];

/** The uploaded file for each required slot, keyed by {@link BatchFileKey}. */
export type BatchFiles = Record<BatchFileKey, File>;

/**
 * Thrown by {@link createBatch} when mf_service rejects the name as already
 * taken (HTTP `409`). A distinct type so callers can surface a specific "name
 * already exists" message on the name field rather than a generic failure,
 * without string-matching the message. Names are unique per user.
 */
export class DuplicateBatchNameError extends Error {
  constructor(name: string) {
    super(`A batch named "${name}" already exists.`);
    this.name = "DuplicateBatchNameError";
  }
}

/**
 * Create a batch and upload its five files via `POST {MF_SERVICE_URL}/batches`
 * (`multipart/form-data`). Returns the created `Batch`, which starts at status
 * `creating`; mf_service stores the files in a background task and advances it
 * to `created` (poll `GET /batches/{id}` to observe).
 *
 * The caller's identity goes in the `X-User-Id` header (the Google `sub`; see
 * `@/auth`), the same as `listBatches`. Every file is sent under its mf_service
 * field name and, critically, RENAMED to the expected upload filename from
 * {@link BATCH_FILE_FIELDS} — the user's original filenames are ignored, because
 * the service keys stored files by these fixed names.
 *
 * Throws {@link DuplicateBatchNameError} on `409` (name taken), and a generic
 * `Error` on any other non-2xx (e.g. `422` for a missing file). Capped at
 * `REQUEST_TIMEOUT_MS` like the other calls.
 */
export async function createBatch(
  userId: string,
  name: string,
  files: BatchFiles,
): Promise<Batch> {
  const form = new FormData();
  form.set("name", name);
  for (const { key, field, filename } of BATCH_FILE_FIELDS) {
    // Third arg is the part's filename: send the service's expected name, not
    // `files[key].name` (the user's arbitrary original filename).
    form.append(field, files[key], filename);
  }

  const base = baseUrl();
  const auth = await authHeaders(base);
  const response = await fetch(`${base}/batches`, {
    method: "POST",
    headers: {
      ...auth,
      "X-User-Id": userId,
      Accept: "application/json",
      // NOTE: do not set Content-Type — the runtime sets it to
      // `multipart/form-data` with the correct boundary from the FormData body.
    },
    body: form,
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 409) {
    throw new DuplicateBatchNameError(name);
  }

  if (!response.ok) {
    throw new Error(
      `mf_service POST /batches failed: ${response.status} ${response.statusText}`,
    );
  }

  return parseBatchResponse(response, "mf_service POST /batches");
}

/**
 * Thrown by {@link renameBatch} / {@link deleteBatch} when mf_service reports
 * the batch doesn't exist for this user (HTTP `404` — absent, or owned by
 * someone else, which reads as absent). A distinct type so callers can tell
 * "already gone" apart from a transient failure (e.g. offer to refresh the list
 * rather than ask the user to retry).
 */
export class BatchNotFoundError extends Error {
  constructor(id: string) {
    super(`Batch "${id}" was not found.`);
    this.name = "BatchNotFoundError";
  }
}

/**
 * Rename a batch via `PATCH {MF_SERVICE_URL}/batches/{id}` with a JSON
 * `{ name }` body. Returns the updated `Batch`. The name is the only mutable
 * field; all others are server-managed.
 *
 * Identity goes in `X-User-Id` (the Google `sub`; see `@/auth`), and the id is
 * scoped to that user — another user's batch reads as `404`. Throws
 * {@link DuplicateBatchNameError} on `409` (the new name is taken),
 * {@link BatchNotFoundError} on `404`, and a generic `Error` on any other
 * non-2xx. Capped at `REQUEST_TIMEOUT_MS`.
 */
export async function renameBatch(
  userId: string,
  id: string,
  name: string,
): Promise<Batch> {
  const base = baseUrl();
  const auth = await authHeaders(base);
  const response = await fetch(`${base}/batches/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      ...auth,
      "X-User-Id": userId,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 409) {
    throw new DuplicateBatchNameError(name);
  }
  if (response.status === 404) {
    throw new BatchNotFoundError(id);
  }
  if (!response.ok) {
    throw new Error(
      `mf_service PATCH /batches/${id} failed: ${response.status} ${response.statusText}`,
    );
  }

  return parseBatchResponse(response, `mf_service PATCH /batches/${id}`);
}

/**
 * Delete a batch via `DELETE {MF_SERVICE_URL}/batches/{id}`. Resolves on
 * success (mf_service replies `200`/`204`, which may carry no body, so nothing
 * is parsed or returned).
 *
 * Identity goes in `X-User-Id` (the Google `sub`; see `@/auth`), scoped to that
 * user. Throws {@link BatchNotFoundError} on `404` (absent or another user's),
 * and a generic `Error` on any other non-2xx. Capped at `REQUEST_TIMEOUT_MS`.
 */
export async function deleteBatch(userId: string, id: string): Promise<void> {
  const base = baseUrl();
  const auth = await authHeaders(base);
  const response = await fetch(`${base}/batches/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      ...auth,
      "X-User-Id": userId,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 404) {
    throw new BatchNotFoundError(id);
  }
  if (!response.ok) {
    throw new Error(
      `mf_service DELETE /batches/${id} failed: ${response.status} ${response.statusText}`,
    );
  }
}

/**
 * The service identity returned by `GET /version` (mf_service's version
 * payload): the service's own name/description/version, plus the version of the
 * `mf_engine` it's running against. Shown on the About page. Only the fields the
 * app uses are typed.
 */
export interface ServiceInfo {
  name: string;
  description: string;
  version: string;
  engine_version: string;
}

/**
 * Fetch mf_service's identity and versions via `GET {MF_SERVICE_URL}/version`.
 *
 * Unlike the batch endpoints this is not per-user, so it sends no `X-User-Id`.
 * Always fetched fresh (`cache: "no-store"`) and capped at `REQUEST_TIMEOUT_MS`,
 * like the other calls. Throws on a missing base URL, a timeout, any non-2xx
 * response, or a body missing the expected `version`/`engine_version` strings;
 * the caller (the About page) catches that and renders an "unavailable" state
 * rather than failing the page.
 */
export async function getServiceInfo(): Promise<ServiceInfo> {
  const base = baseUrl();
  const auth = await authHeaders(base);
  const response = await fetch(`${base}/version`, {
    headers: {
      ...auth,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `mf_service GET /version failed: ${response.status} ${response.statusText}`,
    );
  }

  // Guard the shape: a 2xx that isn't the expected object (e.g. a misconfigured
  // proxy returning HTML, or an older service without these fields) would
  // otherwise surface the wrong strings on the About card. Validate the two
  // fields the UI actually renders as versions.
  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).version !== "string" ||
    typeof (body as Record<string, unknown>).engine_version !== "string"
  ) {
    throw new Error(
      "mf_service GET /version returned an unexpected body (missing version/engine_version)",
    );
  }

  return body as ServiceInfo;
}

/**
 * Reduce a list of batches to a total and a per-status count. Every
 * `BatchStatus` is present in `counts` (zero when none), so callers can render
 * a stable set of rows without missing-key checks. An unexpected status value
 * from the service is ignored rather than throwing — the total still counts it.
 */
export function summarizeBatches(batches: Batch[]): BatchSummary {
  const counts = Object.fromEntries(
    BATCH_STATUSES.map((status) => [status, 0]),
  ) as Record<BatchStatus, number>;

  for (const batch of batches) {
    // `Object.hasOwn`, not `in`: `in` walks the prototype chain, so a status of
    // "toString"/"constructor"/etc. would pass the guard and corrupt `counts`
    // with an inherited key. Own-property check keeps unexpected values truly
    // ignored (still counted in the total below).
    if (Object.hasOwn(counts, batch.status)) {
      counts[batch.status] += 1;
    }
  }

  return { total: batches.length, counts };
}
