import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The animated canvas background is decorative and relies on browser canvas
// APIs that jsdom does not implement. Stub it so these tests stay focused on
// the login UI itself.
vi.mock("@/components/neural-network-background", () => ({
  default: () => <div data-testid="neural-network-background" />,
}));

import Login from "./page";

describe("Login page", () => {
  it("renders the branded wordmark", () => {
    render(<Login />);

    // "MassFlow" and "AI" are separate nodes, so match the leading word loosely.
    expect(screen.getByText(/MassFlow/)).toBeInTheDocument();
  });

  it("renders the logo with accessible alt text", () => {
    render(<Login />);

    expect(screen.getByAltText("MassFlow AI")).toBeInTheDocument();
  });

  it('renders a "Continue with Google" button', () => {
    render(<Login />);

    expect(
      screen.getByRole("button", { name: /continue with google/i }),
    ).toBeInTheDocument();
  });

  it("renders the decorative background", () => {
    render(<Login />);

    expect(
      screen.getByTestId("neural-network-background"),
    ).toBeInTheDocument();
  });
});
