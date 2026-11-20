/**
 * The "batches" glyph — stacked layers — used wherever batches are represented:
 * the navigation drawer's Batches link (see `AppShell`) and the home Batches
 * card title (see `BatchesCard`). Kept in one place so the two stay identical.
 *
 * Decorative by default (`aria-hidden`): it always sits beside a text label, so
 * the label carries the meaning. Size/color come from `className` (defaults to
 * the drawer's `h-5 w-5`); the stroke follows `currentColor`.
 */
export default function BatchesIcon({
  className = "h-5 w-5 shrink-0",
}: {
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" />
      <path d="m3 12 9 4.5L21 12" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </svg>
  );
}
