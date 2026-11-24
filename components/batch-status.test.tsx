import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge, STATUS_COLORS, STATUS_LABELS } from "./batch-status";
import { BATCH_STATUSES } from "@/lib/mf-service";

/**
 * Direct tests for the shared status presentation (`StatusBadge` + the
 * `STATUS_LABELS` / `STATUS_COLORS` maps). The list and home-card tests exercise
 * this only transitively and only for a couple of statuses; here every
 * `BatchStatus` is asserted, so a missing/renamed label or a dropped color is
 * caught at the source even if a consumer stops using `StatusBadge`.
 */

// jsdom may serialize a seed hex to its rgb() form inside a stored inline
// style's `color-mix`, so accept either representation. Derived from the
// imported seed (not a re-encoded literal) so the test tracks the palette.
const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe("STATUS_LABELS / STATUS_COLORS", () => {
  it("has a label and a color for every BatchStatus (exhaustive, no extras)", () => {
    // Keyed exactly by the lifecycle statuses — nothing missing, nothing stray.
    expect(Object.keys(STATUS_LABELS).sort()).toEqual([...BATCH_STATUSES].sort());
    expect(Object.keys(STATUS_COLORS).sort()).toEqual([...BATCH_STATUSES].sort());
  });

  it("gives every status a non-empty hex color", () => {
    for (const status of BATCH_STATUSES) {
      expect(STATUS_COLORS[status], status).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("StatusBadge", () => {
  it("renders each status's human-readable label", () => {
    for (const status of BATCH_STATUSES) {
      const { unmount } = render(<StatusBadge status={status} />);
      expect(screen.getByText(STATUS_LABELS[status])).toBeInTheDocument();
      unmount();
    }
  });

  it("tints each status from its own seed color, blended against the theme tokens", () => {
    for (const status of BATCH_STATUSES) {
      const { unmount } = render(<StatusBadge status={status} />);
      const badge = screen.getByText(STATUS_LABELS[status]);
      const style = badge.getAttribute("style") ?? "";

      const hex = STATUS_COLORS[status];
      // The seed color appears in the inline style (as hex or rgb)...
      expect(
        style.includes(hex) || style.includes(hexToRgb(hex)),
        `${status} tints from its seed`,
      ).toBe(true);
      // ...blended against the theme tokens (not hardcoded black/white), which
      // is what keeps the pill legible in both light and dark mode.
      expect(style, status).toContain("var(--background)");
      expect(style, status).toContain("var(--foreground)");
      unmount();
    }
  });

  it("conveys status by text, not color alone (no ARIA role on the pill)", () => {
    // The label text carries the meaning, so the badge is an ordinary inline
    // element — it must not introduce a status/img role that a screen reader
    // would announce redundantly.
    render(<StatusBadge status="processing" />);
    const badge = screen.getByText("Processing");
    expect(badge).not.toHaveAttribute("role");
  });
});
