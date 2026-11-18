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

// LoggedInTemplate is a synchronous component whose only async work (the
// session read) lives in a Suspense-wrapped child, so we can render it directly
// and assert on its static chrome.
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

  // Note: the user menu renders inside a Suspense boundary fed by the async
  // `UserMenuSlot` Server Component (`await auth()`). React Testing Library runs
  // the client renderer, which can't resolve an async component through
  // Suspense in jsdom, so that streamed output isn't assertable here — it's an
  // integration/e2e concern. UserMenu's own rendering is covered in
  // `components/user-menu.test.tsx`.
});
