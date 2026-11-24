import Link from "next/link";

import Card from "@/components/card";
import BatchesIcon from "@/components/batches-icon";
import { STATUS_COLORS, STATUS_LABELS } from "@/components/batch-status";
import { BATCH_STATUSES, summarizeBatches } from "@/lib/mf-service";
import { loadUserBatches } from "@/lib/user-batches";

/**
 * Home-page card summarising the signed-in user's batches: the total, then a
 * per-status breakdown (all five states, including zeros), and a link to the
 * full Batches page.
 *
 * A Server Component. It reads the session to get the user id (the Google
 * `sub`, sent to `mf_service` as `X-User-Id`) and fetches server-side via
 * `@/lib/mf-service`. `mf_service` has no counts endpoint, so the totals are
 * derived from the user's batch list.
 *
 * It renders its own error state (rather than throwing to `app/error.tsx`) when
 * the session lacks an id or the service call fails, so a backend hiccup
 * degrades just this card and leaves the rest of the home page working. Because
 * it fetches per-user, uncached data, the home page renders it inside a
 * `<Suspense>` boundary (see `app/page.tsx`) to stay prerenderable under PPR.
 */
export default async function BatchesCard() {
  return (
    <Card
      id="batches-card-title"
      title="Batches"
      icon={<BatchesIcon className="h-4 w-4" />}
      footer={
        <Link
          href="/batches"
          // Full-width on mobile; shrinks to its content (fixed/intrinsic size,
          // left-aligned in this text-left card) on lg+.
          className="mt-6 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-foreground/15 px-4 text-sm font-medium text-foreground/80 outline-none transition-colors hover:border-foreground/25 hover:bg-foreground/[.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none lg:inline-flex lg:w-auto"
        >
          View all batches
          <span aria-hidden="true">&rarr;</span>
        </Link>
      }
    >
      {await BatchesContent()}
    </Card>
  );
}

/** Fetch + render the body. Session read, fetch, and error handling live in the
 *  shared `loadUserBatches` helper; this just shapes the result into a summary. */
async function BatchesContent() {
  const result = await loadUserBatches("BatchesCard");
  if ("error" in result) {
    return <CardError />;
  }

  const summary = summarizeBatches(result.batches);

  return (
    <>
      <div className="flex items-baseline gap-3">
        <span className="text-4xl font-semibold tabular-nums tracking-tight text-foreground">
          {summary.total}
        </span>
        <span className="text-sm text-foreground/50">
          {summary.total === 1 ? "batch" : "batches"} total
        </span>
      </div>

      <dl className="mt-5 flex flex-col gap-2">
        {BATCH_STATUSES.map((status) => (
          <div
            key={status}
            className="flex items-center justify-between text-sm"
          >
            <dt className="flex items-center gap-2 text-foreground/60">
              {/* Colored indicator for the status. Decorative — the label text
                  beside it carries the meaning — so hidden from assistive tech. */}
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: STATUS_COLORS[status] }}
                aria-hidden="true"
              />
              {STATUS_LABELS[status]}
            </dt>
            <dd className="font-medium tabular-nums text-foreground/80">
              {summary.counts[status]}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

/** Shown when the session has no user id or the service call fails. */
function CardError() {
  return (
    <p className="text-sm text-foreground/50">
      Couldn&apos;t load batches right now.
    </p>
  );
}
