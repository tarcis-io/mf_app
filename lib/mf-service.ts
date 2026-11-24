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
  const response = await fetch(`${baseUrl()}/batches`, {
    headers: {
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

  const response = await fetch(`${baseUrl()}/batches`, {
    method: "POST",
    headers: {
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

  return (await response.json()) as Batch;
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
  const response = await fetch(`${baseUrl()}/batches/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
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

  return (await response.json()) as Batch;
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
  const response = await fetch(`${baseUrl()}/batches/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
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
  const response = await fetch(`${baseUrl()}/version`, {
    headers: { Accept: "application/json" },
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
