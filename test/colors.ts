/**
 * Shared test helper for asserting on inline `color-mix` styles.
 *
 * jsdom may serialize a seed hex (e.g. `#ef4444`) to its `rgb()` form inside a
 * stored inline style, so a test that only checks for the hex can miss a match.
 * Tests derive the expected `rgb()` from the imported seed color (never a
 * re-encoded literal) so they track the source palette rather than duplicating
 * it. Used by the batch-status and batches-list specs, which both assert the
 * `StatusBadge` tint derives from `STATUS_COLORS`.
 *
 * Lives under `test/` (not `components/`) so it's neither collected as a test
 * (the runner matches `*.{test,spec}.*`) nor counted toward coverage.
 */

/** Convert a 6-digit `#rrggbb` hex to the `rgb(r, g, b)` string jsdom may emit. */
export function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

/** True if an inline `style` string references `hex` as either hex or `rgb()`. */
export function styleReferencesColor(style: string, hex: string): boolean {
  return style.includes(hex) || style.includes(hexToRgb(hex));
}
