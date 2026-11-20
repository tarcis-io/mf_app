import { Suspense } from "react";

import BatchesCard from "@/components/batches-card";
import LoggedInTemplate from "@/components/templates/logged-in-template";

export default function Home() {
  return (
    <LoggedInTemplate title="Home">
      <p>Welcome to MassFlow AI.</p>
      {/* The card fetches per-user, uncached data, so it's wrapped in Suspense
          to keep the rest of the home page prerenderable under PPR (same
          pattern as the header's user label). */}
      <div className="mt-8">
        <Suspense fallback={<BatchesCardFallback />}>
          <BatchesCard />
        </Suspense>
      </div>
    </LoggedInTemplate>
  );
}

/**
 * Placeholder matching the card's footprint while the batch data streams in, so
 * the layout doesn't jump when it resolves.
 */
function BatchesCardFallback() {
  return (
    <div
      className="h-56 w-full max-w-sm animate-pulse rounded-xl border border-foreground/[.08] bg-foreground/[.03]"
      aria-hidden="true"
    />
  );
}
