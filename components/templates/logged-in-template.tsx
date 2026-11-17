import type { ReactNode } from "react";

interface LoggedInTemplateProps {
  title: string;
  children: ReactNode;
}

/**
 * Shared shell for logged-in pages (home page, and future authenticated
 * pages). Renders a consistent header with the app name and page title,
 * followed by the page's own content.
 */
export default function LoggedInTemplate({
  title,
  children,
}: LoggedInTemplateProps) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-black/[.08] px-8 py-4 dark:border-white/[.145]">
        <span className="text-sm font-semibold tracking-tight text-black dark:text-zinc-50">
          MassFlow AI
        </span>
      </header>
      <main className="flex flex-1 flex-col gap-4 px-8 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          {title}
        </h1>
        <div className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          {children}
        </div>
      </main>
    </div>
  );
}
