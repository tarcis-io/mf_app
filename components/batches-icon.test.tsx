import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import BatchesIcon from "./batches-icon";

/**
 * `BatchesIcon` is the shared "batches" glyph used in the drawer link and the
 * card titles. It's decorative and always sits beside a text label, so the two
 * things worth guarding are that it stays hidden from assistive tech (or the
 * label would be announced twice) and that `className` controls its size/color
 * — the default differs from what the card passes (`h-4 w-4`).
 */
describe("BatchesIcon", () => {
  it("is hidden from assistive tech (decorative; the adjacent label carries meaning)", () => {
    const { container } = render(<BatchesIcon />);

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("defaults to the drawer's h-5 w-5 size", () => {
    const { container } = render(<BatchesIcon />);

    expect(container.querySelector("svg")).toHaveClass("h-5", "w-5");
  });

  it("applies a caller-supplied className (e.g. the card's h-4 w-4)", () => {
    const { container } = render(<BatchesIcon className="h-4 w-4" />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("h-4", "w-4");
    // The default size is replaced, not merged, so it isn't left oversized.
    expect(svg).not.toHaveClass("h-5");
  });

  it("inherits color via currentColor (stroke follows the parent)", () => {
    const { container } = render(<BatchesIcon />);

    expect(container.querySelector("svg")).toHaveAttribute(
      "stroke",
      "currentColor",
    );
  });
});
