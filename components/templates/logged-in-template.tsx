import type { ReactNode } from "react";

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
 * This is the single place that reads the session for the logged-in chrome:
 * it calls `auth()` once and passes the user down to `UserMenu`, so adding
 * more session-aware header elements later doesn't multiply session reads.
 * The proxy (see `proxy.ts`) guarantees a session before any logged-in page
 * renders; we still render defensively if the user is somehow absent.
 */
export default async function LoggedInTemplate({
  title,
  children,
}: LoggedInTemplateProps) {
  const session = await auth();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <header className="flex items-center justify-between border-b border-foreground/[.08] px-8 py-4">
        <span className="text-sm font-semibold tracking-tight text-foreground">
          MassFlow AI
        </span>
        <UserMenu user={session?.user} />
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
