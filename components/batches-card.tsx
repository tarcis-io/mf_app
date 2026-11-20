import Link from "next/link";
import type { ReactNode } from "react";

import { auth } from "@/auth";
import BatchesIcon from "@/components/batches-icon";
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
 * Dot color for each status, following the lifecycle with conventional
 * traffic-light semantics: the pre-processing phase is neutral/cool (slate →
 * blue), active work is amber, success is green, and failure is red. Keyed by
 * every `BatchStatus` so a new status won't compile until it's given a color.
 * Hex values (not Tailwind classes) are applied inline on the dot — these are
 * one-off indicator colors, not part of the app's theme tokens in globals.css.
 */
const STATUS_DOT_COLORS: Record<BatchStatus, string> = {
  creating: "#94a3b8", // slate
  created: "#3b82f6", // blue
  processing: "#f59e0b", // amber
  processed: "#22c55e", // green
  error: "#ef4444", // red
};

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
              <dt className="flex items-center gap-2 text-foreground/60">
                {/* Colored indicator for the status. Decorative — the label text
                    beside it carries the meaning — so hidden from assistive tech. */}
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: STATUS_DOT_COLORS[status] }}
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
  } catch (error) {
    // listBatches throws on a missing MF_SERVICE_URL or a non-2xx response.
    // Keep the failure contained to this card, but log it server-side so a
    // backend outage is diagnosable (status code / DNS / missing URL) rather
    // than silently rendering the error state with nothing in the logs.
    console.error("BatchesCard: failed to load batches", error);
    return <CardError />;
  }
}

/**
 * The card shell: title (with the shared batches icon) + framed body + a link
 * to the full Batches page. Shared by the data and error states, so the link
 * out is always available even when the summary can't load.
 */
function Card({ children }: { children: ReactNode }) {
  return (
    <section
      aria-labelledby="batches-card-title"
      className="w-full rounded-xl border border-foreground/[.08] bg-background p-6 text-left shadow-sm"
    >
      <h2
        id="batches-card-title"
        className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground"
      >
        <BatchesIcon className="h-4 w-4 shrink-0 text-primary" />
        Batches
      </h2>
      <div className="mt-4">{children}</div>
      <Link
        href="/batches"
        className="mt-6 flex h-10 items-center justify-center gap-1.5 rounded-lg border border-foreground/15 px-4 text-sm font-medium text-foreground/80 outline-none transition-colors hover:border-foreground/25 hover:bg-foreground/[.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
      >
        View all batches
        <span aria-hidden="true">&rarr;</span>
      </Link>
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
