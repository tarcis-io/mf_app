import { Suspense, type ReactNode } from "react";

import { auth } from "@/auth";
import AppShell from "@/components/templates/app-shell";
import UserLabel from "@/components/user-label";

interface LoggedInTemplateProps {
  title: string;
  children: ReactNode;
}

/**
 * Shared shell for logged-in pages (the home page today, more to come). Renders
 * the app chrome — a fixed header carrying the page title, a responsive
 * navigation drawer, and a scrollable main region — around the page's own
 * content. The interactive parts live in `AppShell` (a Client Component); this
 * stays a Server Component.
 *
 * The chrome and page content are fully static and prerender at build time. The
 * only request-time dependency is the session read in `UserLabelSlot`, which
 * calls `auth()` (and therefore `cookies()`); it is isolated behind a
 * `<Suspense>` boundary so that, with Cache Components / Partial Prerendering
 * enabled (see `next.config.ts`), the static shell is still prerendered and only
 * the user label streams in dynamically. Reading request data outside a Suspense
 * boundary under `cacheComponents` throws "uncached or runtime data during
 * prerendering" at build time.
 *
 * This is the single place that reads the session for the logged-in chrome, so
 * adding more session-aware elements later doesn't multiply session reads. The
 * proxy (see `proxy.ts`) guarantees a session before any logged-in page renders;
 * we still render defensively if the user is somehow absent.
 */
export default function LoggedInTemplate({
  title,
  children,
}: LoggedInTemplateProps) {
  return (
    <AppShell
      title={title}
      userLabel={
        <Suspense fallback={<UserLabelFallback />}>
          <UserLabelSlot />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}

/**
 * Reads the session and renders the signed-in user's label. Split out so the
 * `auth()` call is the only thing inside the Suspense boundary — keeping the
 * rest of the shell statically prerenderable.
 */
async function UserLabelSlot() {
  const session = await auth();
  return <UserLabel user={session?.user} />;
}

/**
 * Placeholder shown while the session resolves. Matches the label's footprint
 * so the header doesn't shift when the real label streams in.
 */
function UserLabelFallback() {
  return (
    <div className="h-5 w-24 rounded-full bg-foreground/[.06]" aria-hidden="true" />
  );
}
