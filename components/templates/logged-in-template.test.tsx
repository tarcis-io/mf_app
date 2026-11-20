import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// LoggedInTemplate is a thin Server Component: it reads the session (behind a
// Suspense boundary) and composes AppShell, passing the title, children, and
// the user label through. Stub AppShell with a shell that surfaces those props
// so these tests verify the *wiring* without the client shell's internals
// (drawer, scroll shadow) — AppShell has its own tests.
const { appShellSpy } = vi.hoisted(() => ({ appShellSpy: vi.fn() }));
vi.mock("@/components/templates/app-shell", () => ({
  default: (props: {
    title: string;
    userLabel?: ReactNode;
    children: ReactNode;
  }) => {
    appShellSpy(props);
    return (
      <div data-testid="app-shell">
        <h1>{props.title}</h1>
        <div data-testid="user-label-slot">{props.userLabel}</div>
        <div>{props.children}</div>
      </div>
    );
  },
}));

// The user label reads the session via `auth()` inside the Suspense boundary.
// Stub it so these tests stay focused on the template's wiring.
vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { name: "Ada Lovelace" } }),
}));

vi.mock("@/components/user-label", () => ({
  default: () => <div data-testid="user-label" />,
}));

import LoggedInTemplate from "./logged-in-template";

describe("LoggedInTemplate", () => {
  it("composes AppShell", () => {
    render(
      <LoggedInTemplate title="Dashboard">
        <p>content</p>
      </LoggedInTemplate>,
    );

    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(appShellSpy).toHaveBeenCalledOnce();
  });

  it("passes the page title through to AppShell", () => {
    render(
      <LoggedInTemplate title="Reports">
        <p>content</p>
      </LoggedInTemplate>,
    );

    expect(appShellSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Reports" }),
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Reports" }),
    ).toBeInTheDocument();
  });

  it("renders its children as the shell content", () => {
    render(
      <LoggedInTemplate title="Home">
        <p>hello world</p>
      </LoggedInTemplate>,
    );

    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("provides a user-label slot to AppShell by default", () => {
    render(
      <LoggedInTemplate title="Home">
        <p>content</p>
      </LoggedInTemplate>,
    );

    // The template passes a `userLabel` node (the Suspense-wrapped session read)
    // into the shell.
    expect(appShellSpy.mock.calls[0][0].userLabel).toBeDefined();
    expect(screen.getByTestId("user-label-slot")).toBeInTheDocument();
  });

  it("omits the user label when showUserLabel is false", () => {
    render(
      <LoggedInTemplate title="Home" showUserLabel={false}>
        <p>content</p>
      </LoggedInTemplate>,
    );

    // The home page opts out so its "Hello, {name}" title isn't duplicated by
    // the right-side label; the shell then receives no `userLabel`.
    expect(appShellSpy.mock.calls[0][0].userLabel).toBeUndefined();
  });

  // Note: the user label resolves from an async Server Component (`await
  // auth()`) inside a Suspense boundary. React Testing Library's client renderer
  // can't resolve that through Suspense in jsdom, so the streamed label isn't
  // assertable here — it's an integration/e2e concern. UserLabel's own rendering
  // is covered in `components/user-label.test.tsx`.
});
