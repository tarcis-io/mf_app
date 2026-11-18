import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Home renders inside LoggedInTemplate, whose header includes the async
// UserMenu Server Component (which reads the auth session). Stub it so this
// test stays focused on the home page's own content.
vi.mock("@/components/user-menu", () => ({
  default: () => <div data-testid="user-menu" />,
}));

import Home from "./page";

describe("Home page", () => {
  it('renders the "Home" heading', () => {
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
