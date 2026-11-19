import Link from "next/link";
import type { ReactNode } from "react";

interface ErrorPageProps {
  /**
   * The HTTP-style status shown large and centered (e.g. `404`, `500`). Styled
   * with the login footer's palette — a vertical gradient from `foreground/60`
   * down to `foreground/40` (see `app/login/page.tsx`).
   */
  code: ReactNode;
  /** The explanatory line beneath the number. */
  message: ReactNode;
}

/**
 * Shared presentational shell for the app's full-page error states (`404` and
 * the generic `500`). Standalone and centered on the app background — it
 * deliberately does NOT use `LoggedInTemplate` (no drawer/header): the generic
 * error boundary can render before or outside the authenticated chrome, so both
 * error pages stay self-contained and look identical.
 *
 * Layout mirrors the login page's centered column (`app/login/page.tsx`): the
 * big status number, the message a gap below it, then a secondary "Back to
 * home" link. The number uses the login footer's grey palette via a
 * gradient clipped to the text.
 */
export default function ErrorPage({ code, message }: ErrorPageProps) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-6 bg-background px-8 text-center">
      <p className="bg-linear-to-b from-foreground/60 to-foreground/40 bg-clip-text text-8xl font-bold tracking-tight text-transparent sm:text-9xl">
        {code}
      </p>
      <p className="max-w-lg text-lg text-foreground/60">{message}</p>
      <Link
        href="/"
        className="mt-2 inline-flex h-12 items-center justify-center rounded-full border border-foreground/15 px-6 text-base font-medium text-foreground/80 outline-none transition-colors hover:border-foreground/25 hover:bg-foreground/[.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
      >
        Back to home
      </Link>
    </div>
  );
}
