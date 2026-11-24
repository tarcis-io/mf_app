import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Home composes the shared LoggedInTemplate (an async Server Component that
// reads the session). Stub it with a minimal shell that surfaces the props so
// this test verifies Home's own wiring without pulling in auth. LoggedInTemplate
// has its own tests.
//
// `templateSpy` is created via `vi.hoisted` so it's available inside the
// (hoisted) `vi.mock` factory and in the assertions below — letting us verify
// that Home actually *delegates* to LoggedInTemplate (and with which props),
// not merely that some heading and text render.
const { templateSpy } = vi.hoisted(() => ({ templateSpy: vi.fn() }));

vi.mock("@/components/templates/logged-in-template", () => ({
  default: (props: {
    title: ReactNode;
    showUserLabel?: boolean;
    children: ReactNode;
  }) => {
    templateSpy(props);
    return (
      <div data-testid="logged-in-template">
        <h1>{props.title}</h1>
        {props.children}
      </div>
    );
  },
}));

// Home now reads the session (via its GreetingTitle) for the header greeting.
// Stub `@/auth` so importing Home doesn't spin up the Auth.js runtime; the
// greeting's resolved text streams from an async Server Component through
// Suspense, which RTL can't resolve in jsdom. `authMock` is hoisted so the
// GreetingTitle tests can shape the session per case. (It's an untyped spy
// because the real `auth` is overloaded — session reader AND middleware — so a
// typed `vi.mocked` would resolve to the wrong overload.)
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

// BatchesCard is an async Server Component that reads the session and calls
// mf_service; importing it would pull in the full Auth.js runtime. Stub it so
// this test stays focused on Home's own wiring. BatchesCard has its own tests.
vi.mock("@/components/batches-card", () => ({
  default: () => <div data-testid="batches-card" />,
}));

import Home, { GreetingTitle } from "./page";

beforeEach(() => {
  // Default session for the Home-wiring tests; GreetingTitle cases override it.
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { name: "Ada Lovelace" } });
});

describe("Home page", () => {
  it("renders inside the shared LoggedInTemplate shell", () => {
    render(<Home />);

    // The home page must live in the authenticated shell (header, nav drawer,
    // sign-out) rather than render its content bare — so assert it delegates to
    // LoggedInTemplate. This is the guard that fails if the wrapper is removed.
    expect(screen.getByTestId("logged-in-template")).toBeInTheDocument();
    expect(templateSpy).toHaveBeenCalledOnce();
  });

  it("passes a (streamed) greeting title node, not a plain string", () => {
    render(<Home />);

    // The title is the personalized "Hello, {name}" greeting wrapped in its own
    // Suspense boundary, so it's a React node rather than the old static "Home"
    // string. Assert a node is passed (the resolved text is covered below).
    const { title } = templateSpy.mock.calls[0]![0];
    expect(title).toBeDefined();
    expect(typeof title).not.toBe("string");
  });

  it("hides the right-side user label (the greeting already shows the name)", () => {
    render(<Home />);

    expect(templateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ showUserLabel: false }),
    );
  });

  it("no longer renders the old welcome message", () => {
    render(<Home />);

    expect(screen.queryByText("Welcome to MassFlow AI.")).toBeNull();
  });

  it("renders the Batches summary card", () => {
    render(<Home />);

    expect(screen.getByTestId("batches-card")).toBeInTheDocument();
  });
});

// The greeting resolves from an async Server Component (`await auth()`) inside a
// Suspense boundary, which RTL can't flush through <Home> in jsdom. So render
// GreetingTitle directly (awaited) — the same technique BatchesCard's test uses
// — to assert the actual resolved greeting and its fallbacks.
describe("GreetingTitle", () => {
  it("greets the signed-in user by name", async () => {
    authMock.mockResolvedValue({
      user: { name: "Ada Lovelace", email: "ada@massflow.ai" },
      expires: "",
    });

    render(await GreetingTitle());

    expect(screen.getByText("Hello, Ada Lovelace")).toBeInTheDocument();
  });

  it("falls back to the email when there's no name", async () => {
    authMock.mockResolvedValue({
      user: { email: "ada@massflow.ai" },
      expires: "",
    });

    render(await GreetingTitle());

    expect(screen.getByText("Hello, ada@massflow.ai")).toBeInTheDocument();
  });

  it("falls back to 'Home' when the user has neither name nor email", async () => {
    authMock.mockResolvedValue({ user: {}, expires: "" });

    render(await GreetingTitle());

    expect(screen.getByText("Home")).toBeInTheDocument();
    // Never render a dangling "Hello, " with no name.
    expect(screen.queryByText(/hello,/i)).toBeNull();
  });

  it("falls back to 'Home' when there is no session at all", async () => {
    authMock.mockResolvedValue(null);

    render(await GreetingTitle());

    expect(screen.getByText("Home")).toBeInTheDocument();
  });
});
