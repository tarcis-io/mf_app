import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Home composes the shared LoggedInTemplate (an async Server Component that
// reads the session). Stub it with a minimal shell that surfaces the `title`
// prop and children, so this test verifies Home's own content wiring without
// pulling in auth. LoggedInTemplate has its own tests.
//
// `templateSpy` is created via `vi.hoisted` so it's available inside the
// (hoisted) `vi.mock` factory and in the assertions below — letting us verify
// that Home actually *delegates* to LoggedInTemplate (and with which props),
// not merely that some heading and text render. Without this, replacing the
// `<LoggedInTemplate>` wrapper with a hand-rolled `<div><h1>…` would still pass.
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

import Home from "./page";

describe("Home page", () => {
  it("renders inside the shared LoggedInTemplate shell", () => {
    render(<Home />);

    // The home page must live in the authenticated shell (header, user menu,
    // sign-out) rather than render its content bare — so assert it delegates to
    // LoggedInTemplate. This is the guard that fails if the wrapper is removed.
    expect(screen.getByTestId("logged-in-template")).toBeInTheDocument();
    expect(templateSpy).toHaveBeenCalledOnce();
  });

  it('passes the "Home" title to the template', () => {
    render(<Home />);

    expect(templateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Home" }),
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Home" }),
    ).toBeInTheDocument();
  });

  it("renders the welcome message as the template's content", () => {
    render(<Home />);

    expect(screen.getByText("Welcome to MassFlow AI.")).toBeInTheDocument();
  });
});
