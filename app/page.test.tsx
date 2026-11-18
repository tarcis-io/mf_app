import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Home composes the shared LoggedInTemplate (an async Server Component that
// reads the session). Stub it with a minimal shell that surfaces the `title`
// prop and children, so this test verifies Home's own content wiring without
// pulling in auth. LoggedInTemplate has its own tests.
vi.mock("@/components/templates/logged-in-template", () => ({
  default: ({
    title,
    children,
  }: {
    title: string;
    children: ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

import Home from "./page";

describe("Home page", () => {
  it('passes the "Home" title to the template', () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Home" }),
    ).toBeInTheDocument();
  });

  it("renders the welcome message", () => {
    render(<Home />);

    expect(screen.getByText("Welcome to MassFlow AI.")).toBeInTheDocument();
  });
});
