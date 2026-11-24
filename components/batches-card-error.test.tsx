import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import BatchesCardError from "./batches-card-error";

/**
 * The shared "couldn't load" body for the batches cards. The home and /batches
 * card tests assert this text appears in their error state; this pins the
 * shared component directly so the wording stays in one place.
 */
describe("BatchesCardError", () => {
  it("renders the quiet 'couldn't load batches' message", () => {
    render(<BatchesCardError />);

    expect(screen.getByText(/couldn't load batches right now/i)).toBeInTheDocument();
  });
});
