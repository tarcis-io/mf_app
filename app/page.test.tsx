import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
// Suspense, which RTL can't resolve in jsdom (see the note at the bottom).
vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { name: "Ada Lovelace" } }),
}));

// BatchesCard is an async Server Component that reads the session and calls
// mf_service; importing it would pull in the full Auth.js runtime. Stub it so
// this test stays focused on Home's own wiring. BatchesCard has its own tests.
vi.mock("@/components/batches-card", () => ({
  default: () => <div data-testid="batches-card" />,
}));

import Home from "./page";

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
    const { title } = templateSpy.mock.calls[0][0];
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

  // Note: the greeting text ("Hello, Ada Lovelace", or the email fallback)
  // resolves from an async Server Component (`await auth()`) inside a Suspense
  // boundary. React Testing Library's client renderer can't resolve that through
  // Suspense in jsdom, so the streamed greeting isn't assertable here — it's an
  // integration/e2e concern. The name/email resolution mirrors `UserLabel`,
  // whose rendering is covered in `components/user-label.test.tsx`.
});
