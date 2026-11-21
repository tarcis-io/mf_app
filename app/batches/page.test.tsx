import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Batches composes the shared LoggedInTemplate (an async Server Component that
// reads the session) and renders BatchesListCard inside a Suspense boundary.
// Stub the template with a minimal shell that surfaces the `title` prop and
// children, so this test verifies the page's own wiring without pulling in
// auth. LoggedInTemplate has its own tests. The `templateSpy` (via vi.hoisted so
// it's reachable in the hoisted mock factory) lets us assert the page actually
// delegates to LoggedInTemplate, not just that a heading renders.
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

// BatchesListCard is an async Server Component that reads the session and calls
// mf_service; importing it would pull in the full Auth.js runtime. Stub it so
// this test stays focused on the page's own wiring. BatchesListCard has its own
// tests.
vi.mock("@/components/batches-list-card", () => ({
  default: () => <div data-testid="batches-list-card" />,
}));

import Batches from "./page";

describe("Batches page", () => {
  it("renders inside the shared LoggedInTemplate shell", () => {
    render(<Batches />);

    expect(screen.getByTestId("logged-in-template")).toBeInTheDocument();
    expect(templateSpy).toHaveBeenCalledOnce();
  });

  it('passes the "Batches" title to the template', () => {
    render(<Batches />);

    expect(templateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Batches" }),
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Batches" }),
    ).toBeInTheDocument();
  });

  it("renders the batches list card as the page content", () => {
    render(<Batches />);

    const template = screen.getByTestId("logged-in-template");
    expect(
      within(template).getByTestId("batches-list-card"),
    ).toBeInTheDocument();
  });

  it("no longer renders the old placeholder text", () => {
    render(<Batches />);

    // The page used to render a bare "<p>Batches</p>" body (distinct from the
    // "Batches" heading/title). Guard that the placeholder is gone — the card
    // replaced it.
    expect(screen.queryByText("Batches", { selector: "p" })).toBeNull();
  });
});
