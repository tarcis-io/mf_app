import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Settings composes the shared LoggedInTemplate (an async Server Component that
// reads the session). Stub it with a minimal shell that surfaces the `title`
// prop and children, so this test verifies the page's own wiring without
// pulling in auth. LoggedInTemplate has its own tests. The `templateSpy` (via
// vi.hoisted so it's reachable in the hoisted mock factory) lets us assert the
// page actually delegates to LoggedInTemplate, not just that a heading renders.
const { templateSpy } = vi.hoisted(() => ({ templateSpy: vi.fn() }));

vi.mock("@/components/templates/logged-in-template", () => ({
  default: (props: { title: string; children: ReactNode }) => {
    templateSpy(props);
    return (
      <div data-testid="logged-in-template">
        <h1>{props.title}</h1>
        {props.children}
      </div>
    );
  },
}));

// ThemeRadio is a client component backed by localStorage; stub it so this test
// focuses on the page's own structure (the Theme card). Its behavior is covered
// in `components/theme-radio.test.tsx`.
vi.mock("@/components/theme-radio", () => ({
  default: () => <div data-testid="theme-radio" />,
}));

import Settings from "./page";

describe("Settings page", () => {
  it("renders inside the shared LoggedInTemplate shell", () => {
    render(<Settings />);

    expect(screen.getByTestId("logged-in-template")).toBeInTheDocument();
    expect(templateSpy).toHaveBeenCalledOnce();
  });

  it('passes the "Settings" title to the template', () => {
    render(<Settings />);

    expect(templateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Settings" }),
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Settings" }),
    ).toBeInTheDocument();
  });

  it("renders a Theme card (labelled region with an icon) containing the theme selector", () => {
    render(<Settings />);

    const card = screen.getByRole("region", { name: "Theme" });
    // Title is a level-2 heading with a decorative icon beside it.
    const heading = within(card).getByRole("heading", { level: 2, name: "Theme" });
    const icon = heading.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
    // The selector itself lives inside the card.
    expect(within(card).getByTestId("theme-radio")).toBeInTheDocument();
  });
});
