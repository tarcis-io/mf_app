/**
 * Server-side client for `mf_service`, the FastAPI backend this app calls for
 * batch data. See the `mf_service` README for the full API contract.
 *
 * This module is used only from Server Components / server code: it reads the
 * `MF_SERVICE_URL` environment variable and sends the caller's identity in a
 * request header. Do not import it into a Client Component — the base URL and
 * the per-user header must never be exposed to the browser. (The one caller
 * today is the home page's `BatchesCard`, a Server Component.)
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

/** Resolve the configured `mf_service` base URL, or throw if it's unset. */
function baseUrl(): string {
  const url = process.env.MF_SERVICE_URL;
  if (!url || url.trim() === "") {
    throw new Error(
      "MF_SERVICE_URL is not set; cannot reach mf_service. " +
        "Set it to the service base URL (see .env.example / DEPLOYMENT.md).",
    );
  }
  // Trim a trailing slash so `${base}/batches` never doubles up.
  return url.trim().replace(/\/$/, "");
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
 * the response is per-user, so it must never be cached across requests. Throws
 * on a missing base URL or any non-2xx response; the caller (`BatchesCard`)
 * catches that and renders an error state rather than failing the page.
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
  });

  if (!response.ok) {
    throw new Error(
      `mf_service GET /batches failed: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as Batch[];
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
    if (batch.status in counts) {
      counts[batch.status] += 1;
    }
  }

  return { total: batches.length, counts };
}
