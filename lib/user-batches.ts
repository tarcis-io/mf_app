import { auth } from "@/auth";
import { listBatches, type Batch } from "@/lib/mf-service";

/**
 * Result of {@link loadUserBatches}: either the signed-in user's batches, or an
 * `error` flag when they couldn't be loaded. A discriminated union so callers
 * branch once (`"error" in result`) instead of each repeating the session check
 * and the try/catch around `listBatches`.
 */
export type LoadUserBatchesResult =
  | { batches: Batch[] }
  | { error: true };

/**
 * Load the signed-in user's batches for a Server Component card. Shared by the
 * home `BatchesCard` and the `/batches` `BatchesListCard`, which previously
 * duplicated this exact scaffold: read the session for the user id (the Google
 * `sub`, sent to `mf_service` as `X-User-Id`), fetch server-side via
 * `listBatches` (so the base URL and the per-user header never reach the
 * browser), and turn any failure into an error result rather than throwing to
 * `app/error.tsx` — so a backend hiccup degrades just the card.
 *
 * Returns `{ error: true }` when the session has no user id *or* the service
 * call fails; the failure is logged server-side (with `label` identifying the
 * caller) so a backend outage is diagnosable (status code / DNS / missing URL)
 * rather than silently showing an error state with nothing in the logs. On
 * success returns `{ batches }`; the caller shapes them (summary vs. sorted
 * list) itself.
 *
 * Note for callers: do the throwing work (this call) outside the JSX you return,
 * then branch on the result — constructing JSX inside a try/catch is flagged by
 * `react-hooks/error-boundaries` (a try/catch can't catch a child's render-time
 * errors), and this call is the only thing that needs catching.
 *
 * @param label short caller name used only in the server-side error log
 *   (e.g. `"BatchesCard"`).
 */
export async function loadUserBatches(
  label: string,
): Promise<LoadUserBatchesResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: true };
  }

  try {
    return { batches: await listBatches(userId) };
  } catch (error) {
    console.error(`${label}: failed to load batches`, error);
    return { error: true };
  }
}
