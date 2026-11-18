import { Suspense, type ReactNode } from "react";

import { auth } from "@/auth";
import UserMenu from "@/components/user-menu";

interface LoggedInTemplateProps {
  title: string;
  children: ReactNode;
}

/**
 * Shared shell for logged-in pages (home page, and future authenticated
 * pages). Renders a consistent header with the app name, the signed-in user
 * and a sign-out control, and the page title, followed by the page's own
 * content.
 *
 * The header chrome and page content are fully static and prerender at build
 * time. The only request-time dependency is the session read in
 * `UserMenuSlot`, which calls `auth()` (and therefore `cookies()`); it is
 * isolated behind a `<Suspense>` boundary so that, with Cache Components /
 * Partial Prerendering enabled (see `next.config.ts`), the static shell is
 * still prerendered and only the user label streams in dynamically. Reading
 * request data outside a Suspense boundary under `cacheComponents` throws
 * "uncached or runtime data during prerendering" at build time.
 *
 * This is the single place that reads the session for the logged-in chrome, so
 * adding more session-aware header elements later doesn't multiply session
 * reads. The proxy (see `proxy.ts`) guarantees a session before any logged-in
 * page renders; we still render defensively if the user is somehow absent.
 */
export default function LoggedInTemplate({
  title,
  children,
}: LoggedInTemplateProps) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <header className="flex items-center justify-between border-b border-foreground/[.08] px-8 py-4">
        <span className="text-sm font-semibold tracking-tight text-foreground">
          MassFlow AI
        </span>
        <Suspense fallback={<UserMenuFallback />}>
          <UserMenuSlot />
        </Suspense>
      </header>
      <main className="flex flex-1 flex-col gap-4 px-8 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <div className="text-lg leading-8 text-foreground/70">{children}</div>
      </main>
    </div>
  );
}

/**
 * Reads the session and renders the user menu. Split out from the shell so the
 * `auth()` call is the only thing inside the Suspense boundary — keeping the
 * rest of the template statically prerenderable.
 */
async function UserMenuSlot() {
  const session = await auth();
  return <UserMenu user={session?.user} />;
}

/**
 * Placeholder shown while the session resolves. Matches the sign-out button's
 * footprint so the header doesn't shift when the real menu streams in.
 */
function UserMenuFallback() {
  return (
    <div className="flex items-center gap-4" aria-hidden="true">
      <div className="h-7 w-24 rounded-full bg-foreground/[.04]" />
    </div>
  );
}
