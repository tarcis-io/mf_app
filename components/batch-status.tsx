import type { BatchStatus } from "@/lib/mf-service";

/**
 * Shared presentation for a batch's {@link BatchStatus}: the human-readable
 * label, the indicator color, and the `StatusBadge` pill. Kept in one module so
 * the home summary card (`BatchesCard`, which shows a colored dot per status)
 * and the Batches list (`BatchesList`, which shows a badge per row) stay
 * visually identical and derive from a single source of truth — a new status
 * won't compile until it's given a label and a color here.
 */

/**
 * Human-readable label for each batch status. Keyed by every `BatchStatus` so
 * the mapping is exhaustive (a new status won't compile until it's labelled).
 */
export const STATUS_LABELS: Record<BatchStatus, string> = {
  creating: "Creating",
  created: "Created",
  processing: "Processing",
  processed: "Processed",
  error: "Error",
};

/**
 * Indicator color for each status, following the lifecycle with conventional
 * traffic-light semantics: the pre-processing phase is neutral/cool (slate →
 * blue), active work is amber, success is green, and failure is red. Keyed by
 * every `BatchStatus` so a new status won't compile until it's given a color.
 * Hex values (not Tailwind classes) are applied inline — these are one-off
 * indicator colors, not part of the app's theme tokens in globals.css. Used
 * directly as the dot color on the home card, and as the seed color the
 * `StatusBadge` tints its background/text/border from.
 */
export const STATUS_COLORS: Record<BatchStatus, string> = {
  creating: "#94a3b8", // slate
  created: "#3b82f6", // blue
  processing: "#f59e0b", // amber
  processed: "#22c55e", // green
  error: "#ef4444", // red
};

/**
 * A small status pill: the status label on a faint tint of its own indicator
 * color. The background and text are derived from the one `STATUS_COLORS` hex
 * via `color-mix`, blended against the theme tokens rather than hardcoded
 * black/white: the background is a light wash over `--background` and the text
 * is the hue pulled toward `--foreground`. In light mode (`--foreground` black,
 * `--background` white) this matches the original look; in dark mode it flips to
 * a light tint on a dark wash, so the pill stays legible in both themes instead
 * of rendering near-black text on a dark surface. A color change in one place
 * updates the whole badge. The color is conveyed by the label text too, never
 * by color alone, so it's accessible; the badge is an ordinary inline element
 * with no ARIA role.
 */
export function StatusBadge({ status }: { status: BatchStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 16%, var(--background))`,
        color: `color-mix(in srgb, ${color} 55%, var(--foreground))`,
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
