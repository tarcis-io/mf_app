import Card from "@/components/card";
import BatchesCardError from "@/components/batches-card-error";
import BatchesIcon from "@/components/batches-icon";
import BatchesList, { type BatchListItem } from "@/components/batches-list";
import NewBatchDialog from "@/components/new-batch-dialog";
import { type Batch } from "@/lib/mf-service";
import { loadUserBatches } from "@/lib/user-batches";

/**
 * Formats a batch's created timestamp for display, on the server, so the string
 * is identical on prerender and hydration (a date formatted in the browser
 * during render can differ by locale/timezone and trip a hydration warning).
 * Fixed locale + UTC keep it deterministic: `2026-01-15T09:30:00Z` → `15 Jan
 * 2026`. An unparseable value falls back to the raw string rather than throwing.
 */
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatCreated(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}

/**
 * Sort newest-first by `created`, then project each `Batch` to the
 * {@link BatchListItem} the list renders (dropping `user_id`/`error_message`,
 * adding the server-formatted date label). Sorting here, server-side, means the
 * client list never has to reorder — it only filters.
 *
 * `created` is ISO 8601, so lexicographic string comparison already orders it
 * chronologically; we compare parsed timestamps anyway so a differently
 * formatted but valid timestamp still sorts correctly. A copy is sorted so the
 * input array isn't mutated.
 */
function toSortedItems(batches: Batch[]): BatchListItem[] {
  return [...batches]
    .sort((a, b) => Date.parse(b.created) - Date.parse(a.created))
    .map((batch) => ({
      id: batch.id,
      name: batch.name,
      status: batch.status,
      created: batch.created,
      createdLabel: formatCreated(batch.created),
    }));
}

/**
 * Card for the Batches page: the user's batches as a filterable list (name +
 * status), newest first.
 *
 * A Server Component, mirroring `BatchesCard`: it reads the session for the
 * user id (the Google `sub`, sent to `mf_service` as `X-User-Id`) and fetches
 * server-side via `@/lib/mf-service`, so the base URL and the per-user header
 * never reach the browser. It sorts + formats here and hands the finished list
 * to the `BatchesList` Client Component, which owns only the filter UI.
 *
 * On a missing session id or a failed service call it renders its own error
 * state (rather than throwing to `app/error.tsx`), so a backend hiccup degrades
 * just this card. It fetches per-user, uncached data, so the page wraps it in a
 * `<Suspense>` boundary (see `app/batches/page.tsx`) to stay prerenderable
 * under PPR.
 */
export default async function BatchesListCard() {
  return (
    <Card
      id="batches-list-title"
      title="Batches"
      icon={<BatchesIcon className="h-4 w-4" />}
      // The "+ New" trigger + its creation dialog live in the header (not the
      // body) so they're available even when the list itself fails to load.
      actions={<NewBatchDialog />}
    >
      {await BatchesListContent()}
    </Card>
  );
}

/** Fetch + sort the batches. Session read, fetch, and error handling live in the
 *  shared `loadUserBatches` helper; this just sorts + projects the result. */
async function BatchesListContent() {
  const result = await loadUserBatches("BatchesListCard");
  if ("error" in result) {
    return <BatchesCardError />;
  }

  return <BatchesList batches={toSortedItems(result.batches)} />;
}
