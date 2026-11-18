import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The template reads the session via `auth()` (inside a Suspense boundary) to
// pass the user to UserMenu. Stub it so these tests stay focused on the
// template's layout.
vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { name: "Ada Lovelace" } }),
}));

// UserMenu has its own tests; stub it here so these tests stay focused on the
// template's layout rather than the header control's internals.
vi.mock("@/components/user-menu", () => ({
  default: () => <div data-testid="user-menu" />,
}));

import LoggedInTemplate from "./logged-in-template";

// LoggedInTemplate is now a synchronous component whose only async work (the
// session read) lives in a Suspense-wrapped child. We can render it directly;
// assertions on the streamed user menu use `findBy*` so Suspense can resolve.
function renderTemplate(title: string, children: ReactNode) {
  render(<LoggedInTemplate title={title}>{children}</LoggedInTemplate>);
}

describe("LoggedInTemplate", () => {
  it("renders the page title as a level-1 heading", () => {
    renderTemplate("Dashboard", <p>content</p>);

    expect(
      screen.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeInTheDocument();
  });

  it("renders the app name in the header", () => {
    renderTemplate("Dashboard", <p>content</p>);

    expect(screen.getByText("MassFlow AI")).toBeInTheDocument();
  });

  it("renders its children", () => {
    renderTemplate("Dashboard", <p>hello world</p>);

    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("exposes a single main landmark containing the heading", () => {
    renderTemplate("Reports", <p>content</p>);

    const main = screen.getByRole("main");
    expect(main).toContainElement(
      screen.getByRole("heading", { level: 1, name: "Reports" }),
    );
  });

  it("streams the user menu in once the session resolves", async () => {
    renderTemplate("Dashboard", <p>content</p>);

    // The user menu lives behind a Suspense boundary (the session read), so it
    // appears asynchronously.
    expect(await screen.findByTestId("user-menu")).toBeInTheDocument();
  });
});
