import { Suspense } from "react";

import BatchesListCard from "@/components/batches-list-card";
import LoggedInTemplate from "@/components/templates/logged-in-template";

export default function Batches() {
  return (
    <LoggedInTemplate title="Batches">
      {/* The card fetches per-user, uncached data, so it's wrapped in Suspense
          to keep the rest of the page prerenderable under PPR (same pattern as
          the home page's BatchesCard). */}
      <Suspense fallback={<BatchesListCardFallback />}>
        <BatchesListCard />
      </Suspense>
    </LoggedInTemplate>
  );
}

/**
 * Placeholder matching the card's footprint while the batch list streams in, so
 * the layout doesn't jump when it resolves.
 */
function BatchesListCardFallback() {
  return (
    <div
      className="h-80 w-full animate-pulse rounded-xl border border-foreground/[.08] bg-foreground/[.03]"
      aria-hidden="true"
    />
  );
}
