import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The template reads the session via `auth()` to pass the user to UserMenu.
// Stub it so these tests stay focused on the template's layout.
vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { name: "Ada Lovelace" } }),
}));

// UserMenu has its own tests; stub it here so these tests stay focused on the
// template's layout rather than the header control's internals.
vi.mock("@/components/user-menu", () => ({
  default: () => <div data-testid="user-menu" />,
}));

import LoggedInTemplate from "./logged-in-template";

// LoggedInTemplate is an async Server Component. Awaiting it yields the
// rendered element, which we can then hand to Testing Library's `render`.
async function renderTemplate(title: string, children: ReactNode) {
  render(await LoggedInTemplate({ title, children }));
}

describe("LoggedInTemplate", () => {
  it("renders the page title as a level-1 heading", async () => {
    await renderTemplate("Dashboard", <p>content</p>);

    expect(
      screen.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeInTheDocument();
  });

  it("renders the app name in the header", async () => {
    await renderTemplate("Dashboard", <p>content</p>);

    expect(screen.getByText("MassFlow AI")).toBeInTheDocument();
  });

  it("renders its children", async () => {
    await renderTemplate("Dashboard", <p>hello world</p>);

    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("exposes a single main landmark containing the heading", async () => {
    await renderTemplate("Reports", <p>content</p>);

    const main = screen.getByRole("main");
    expect(main).toContainElement(
      screen.getByRole("heading", { level: 1, name: "Reports" }),
    );
  });
});
