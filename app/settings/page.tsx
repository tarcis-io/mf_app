import type { ReactNode } from "react";

import LoggedInTemplate from "@/components/templates/logged-in-template";
import ThemeRadio from "@/components/theme-radio";

export default function Settings() {
  return (
    <LoggedInTemplate title="Settings">
      <div className="flex flex-col gap-6">
        <Card id="settings-theme" title="Theme" icon={<ThemeIcon />}>
          <p className="mb-4 text-sm leading-6 text-foreground/60">
            Choose how MassFlow AI looks. System follows your device&apos;s
            appearance.
          </p>
          <ThemeRadio />
        </Card>
      </div>
    </LoggedInTemplate>
  );
}

/**
 * The shared card shell: a full-width framed `<section>` with an icon + title
 * heading, matching the home Batches card. The heading carries the given `id`
 * and the section is `aria-labelledby` it, so the card is a labelled region.
 */
function Card({
  id,
  title,
  icon,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="w-full rounded-xl border border-foreground/[.08] bg-background p-6 text-left shadow-sm"
    >
      <h2
        id={id}
        className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground"
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-primary">
          {icon}
        </span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * A half-filled circle — the conventional "appearance / theme" glyph (the split
 * reads as light/dark). Decorative; the title names the card. Inherits
 * `text-primary` via `currentColor`.
 */
function ThemeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <circle cx="12" cy="12" r="9" />
      {/* Fill the right half to suggest light/dark contrast. */}
      <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
