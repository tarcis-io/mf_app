import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The animated canvas background is decorative and relies on browser canvas
// APIs that jsdom does not implement. Stub it so these tests stay focused on
// the login UI itself.
vi.mock("@/components/neural-network-background", () => ({
  default: () => <div data-testid="neural-network-background" />,
}));

// The sign-in control submits a Server Action (`signInAction`), which pulls in
// the full Auth.js runtime (and real OAuth config). The page only needs the
// action to exist as a `<form action>` reference, so stub the actions module.
vi.mock("@/app/actions", () => ({
  signInAction: vi.fn(),
}));

import Login from "./page";

describe("Login page", () => {
  it("renders the branded wordmark", () => {
    render(<Login />);

    // "MassFlow" and "AI" are separate nodes within the wordmark. Anchor on the
    // dimmed "AI" span and assert its parent reads the full wordmark, so this
    // stays specific to the wordmark and ignores other "MassFlow" text on the
    // page (e.g. the footer copyright line).
    expect(screen.getByText("AI").parentElement).toHaveTextContent(
      "MassFlow AI",
    );
  });

  it("renders the logo with accessible alt text", () => {
    render(<Login />);

    expect(screen.getByAltText("MassFlow AI")).toBeInTheDocument();
  });

  it('renders a "Continue with Google" button that submits the sign-in form', () => {
    render(<Login />);

    const button = screen.getByRole("button", {
      name: /continue with google/i,
    });
    expect(button).toBeInTheDocument();
    // The button triggers Google sign-in by submitting its enclosing form
    // (a server action), so it must be a submit button inside a <form>.
    expect(button).toHaveAttribute("type", "submit");
    expect(button.closest("form")).not.toBeNull();
  });

  it("renders the decorative background", () => {
    render(<Login />);

    expect(
      screen.getByTestId("neural-network-background"),
    ).toBeInTheDocument();
  });

  it("renders the footer with the current-year copyright and a contact email link", () => {
    render(<Login />);

    // Assert against the current year rather than a hardcoded one so the test
    // doesn't need an annual edit (the page computes it at module load).
    const year = new Date().getFullYear();
    expect(
      screen.getByText(`© ${year} MassFlow AI`),
    ).toBeInTheDocument();

    const contact = screen.getByRole("link", { name: "t@rcis.io" });
    expect(contact).toHaveAttribute("href", "mailto:t@rcis.io");
  });
});
