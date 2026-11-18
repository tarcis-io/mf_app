import type { ReactNode } from "react";

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
 */
export default function LoggedInTemplate({
  title,
  children,
}: LoggedInTemplateProps) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-white font-sans">
      <header className="flex items-center justify-between border-b border-black/[.08] px-8 py-4">
        <span className="text-sm font-semibold tracking-tight text-black">
          MassFlow AI
        </span>
        <UserMenu />
      </header>
      <main className="flex flex-1 flex-col gap-4 px-8 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-black">
          {title}
        </h1>
        <div className="text-lg leading-8 text-black/70">{children}</div>
      </main>
    </div>
  );
}
