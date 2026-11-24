import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
// Stub it so these tests stay focused on the template's wiring. `authMock` is
// hoisted and untyped (the real `auth` is overloaded — session reader AND
// middleware — so a typed `vi.mocked` would resolve to the wrong overload).
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

// Stub UserLabel as a prop-capturing spy: UserLabelSlot's job is to read the
// session and forward `session.user` to UserLabel, so the test asserts the
// forwarded props. UserLabel's own rendering is covered in user-label.test.tsx.
const { userLabelSpy } = vi.hoisted(() => ({ userLabelSpy: vi.fn() }));
vi.mock("@/components/user-label", () => ({
  default: (props: { user?: unknown }) => {
    userLabelSpy(props);
    return <div data-testid="user-label" />;
  },
}));

import LoggedInTemplate, { UserLabelSlot } from "./logged-in-template";

beforeEach(() => {
  // Default session for the wiring tests; the UserLabelSlot cases override it.
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { name: "Ada Lovelace" } });
});

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
    expect(appShellSpy.mock.calls[0]![0].userLabel).toBeDefined();
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
    expect(appShellSpy.mock.calls[0]![0].userLabel).toBeUndefined();
  });

});

// UserLabelSlot resolves from an async Server Component (`await auth()`) inside
// a Suspense boundary, which RTL can't flush through <LoggedInTemplate> in
// jsdom. Render it directly (awaited) to assert it reads the session and
// forwards the user to UserLabel.
describe("UserLabelSlot", () => {
  afterEach(() => {
    userLabelSpy.mockClear();
  });

  it("forwards the signed-in user from the session to UserLabel", async () => {
    authMock.mockResolvedValue({
      user: { name: "Ada Lovelace", email: "ada@massflow.ai" },
      expires: "",
    });

    render(await UserLabelSlot());

    expect(userLabelSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { name: "Ada Lovelace", email: "ada@massflow.ai" },
      }),
    );
  });

  it("forwards undefined when there is no session", async () => {
    authMock.mockResolvedValue(null);

    render(await UserLabelSlot());

    // UserLabel renders nothing for an absent user (covered in its own test);
    // here we assert the slot passes through the missing user rather than throw.
    expect(userLabelSpy).toHaveBeenCalledWith(
      expect.objectContaining({ user: undefined }),
    );
  });
});
