import { Suspense } from "react";

import { auth } from "@/auth";
import BatchesCard from "@/components/batches-card";
import LoggedInTemplate from "@/components/templates/logged-in-template";

export default function Home() {
  return (
    <LoggedInTemplate
      // The title is a personalized greeting read from the session, so stream it
      // in behind its own Suspense boundary (like the header's user label) to
      // keep the static shell prerenderable under PPR. `showUserLabel={false}`
      // drops the redundant name on the right — the greeting already shows it.
      title={
        <Suspense fallback={<GreetingFallback />}>
          <GreetingTitle />
        </Suspense>
      }
      showUserLabel={false}
    >
      {/* The card fetches per-user, uncached data, so it's wrapped in Suspense
          to keep the rest of the home page prerenderable under PPR (same
          pattern as the title and the header's user label). */}
      <Suspense fallback={<BatchesCardFallback />}>
        <BatchesCard />
      </Suspense>
    </LoggedInTemplate>
  );
}

/**
 * The header greeting: "Hello, {name}", where the name is the signed-in user's
 * name, falling back to their email (the same resolution as the header's
 * `UserLabel`). A Server Component reading the session; isolated so `auth()` is
 * the only thing inside the title's Suspense boundary. If the user somehow has
 * neither a name nor an email, falls back to a plain "Home" so the header never
 * reads "Hello, ".
 */
async function GreetingTitle() {
  const session = await auth();
  const name = session?.user?.name ?? session?.user?.email ?? undefined;
  return <>{name ? `Hello, ${name}` : "Home"}</>;
}

/**
 * Placeholder shown while the session resolves, matching the title's footprint
 * so the header doesn't shift when the greeting streams in.
 */
function GreetingFallback() {
  return (
    <span
      className="inline-block h-5 w-40 animate-pulse rounded-full bg-foreground/[.06] align-middle"
      aria-hidden="true"
    />
  );
}

/**
 * Placeholder matching the card's footprint while the batch data streams in, so
 * the layout doesn't jump when it resolves.
 */
function BatchesCardFallback() {
  return (
    <div
      className="h-56 w-full animate-pulse rounded-xl border border-foreground/[.08] bg-foreground/[.03]"
      aria-hidden="true"
    />
  );
}
