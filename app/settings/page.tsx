import Card from "@/components/card";
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
