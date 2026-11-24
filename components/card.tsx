import type { ReactNode } from "react";

interface CardProps {
  /**
   * The id put on the heading; the `<section>` is `aria-labelledby` it, so the
   * card is a labelled landmark region. Must be unique on the page.
   */
  id: string;
  /** The card heading text. */
  title: ReactNode;
  /**
   * The heading icon. Rendered inside a 16px, `text-primary` box, so pass a bare
   * icon sized to fill it (e.g. `className="h-4 w-4"`); it inherits the brand
   * color via `currentColor`.
   */
  icon: ReactNode;
  /**
   * Optional content aligned to the right of the heading (e.g. a "New" button).
   * When present the header becomes a space-between row. Kept in the header (not
   * the body) so it stays available even when the body content fails to load.
   */
  actions?: ReactNode;
  /**
   * Optional footer below the body (e.g. a "View all" link). Separated from the
   * body so it's always present regardless of the body's state.
   */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * The shared card shell used across the app (home Batches card, the Batches
 * list, Settings, About): a full-width framed `<section>` with an icon + title
 * heading, an optional right-aligned `actions` slot in the header, the body, and
 * an optional `footer`. Centralizing it keeps every card visually identical and
 * is the single place the frame/heading styling lives.
 */
export default function Card({
  id,
  title,
  icon,
  actions,
  footer,
  children,
}: CardProps) {
  return (
    <section
      aria-labelledby={id}
      className="w-full rounded-xl border border-foreground/[.08] bg-background p-6 text-left shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id={id}
          className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground"
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-primary">
            {icon}
          </span>
          {title}
        </h2>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
      {footer}
    </section>
  );
}
