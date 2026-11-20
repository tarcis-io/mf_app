import type { ReactNode } from "react";

import { auth } from "@/auth";
import {
  BATCH_STATUSES,
  listBatches,
  summarizeBatches,
  type BatchStatus,
} from "@/lib/mf-service";

/**
 * Human-readable label for each batch status, shown in the breakdown. Keyed by
 * every `BatchStatus` so the mapping is exhaustive (a new status won't compile
 * until it's labelled here).
 */
const STATUS_LABELS: Record<BatchStatus, string> = {
  creating: "Creating",
  created: "Created",
  processing: "Processing",
  processed: "Processed",
  error: "Error",
};

/**
 * Home-page card summarising the signed-in user's batches: the total, then a
 * per-status breakdown (all five states, including zeros).
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
  return <Card>{await BatchesContent()}</Card>;
}

/** Fetch + render the body; isolated so the fetch is the only thing that can throw. */
async function BatchesContent() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return <CardError />;
  }

  try {
    const summary = summarizeBatches(await listBatches(userId));
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
              <dt className="text-foreground/60">{STATUS_LABELS[status]}</dt>
              <dd className="font-medium tabular-nums text-foreground/80">
                {summary.counts[status]}
              </dd>
            </div>
          ))}
        </dl>
      </>
    );
  } catch (error) {
    // listBatches throws on a missing MF_SERVICE_URL or a non-2xx response.
    // Keep the failure contained to this card, but log it server-side so a
    // backend outage is diagnosable (status code / DNS / missing URL) rather
    // than silently rendering the error state with nothing in the logs.
    console.error("BatchesCard: failed to load batches", error);
    return <CardError />;
  }
}

/** The card shell: title + framed body. Shared by the data and error states. */
function Card({ children }: { children: ReactNode }) {
  return (
    <section
      aria-labelledby="batches-card-title"
      className="w-full max-w-sm rounded-xl border border-foreground/[.08] bg-background p-6 text-left shadow-sm"
    >
      <h2
        id="batches-card-title"
        className="text-sm font-semibold tracking-tight text-foreground"
      >
        Batches
      </h2>
      <div className="mt-4">{children}</div>
    </section>
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
