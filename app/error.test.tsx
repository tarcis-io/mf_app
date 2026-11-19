import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Stub next/link to a plain anchor (App Router navigation isn't wired up in
// jsdom); we only assert the href.
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import Error from "./error";

// Next hands error.tsx `{ error, reset }`, but this boundary declares neither
// (it renders a static message + a back-to-home link), so render it bare.
function renderError() {
  return render(<Error />);
}

describe("Error (500)", () => {
  it("shows the 500 code", () => {
    renderError();

    expect(screen.getByText("500")).toBeInTheDocument();
  });

  it("shows the generic error message", () => {
    renderError();

    expect(
      screen.getByText("Something went wrong on our end. We're working to fix it."),
    ).toBeInTheDocument();
  });

  it("offers a back-to-home link to /", () => {
    renderError();

    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
