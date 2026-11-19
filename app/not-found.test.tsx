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

import NotFound from "./not-found";

describe("NotFound (404)", () => {
  it("shows the 404 code", () => {
    render(<NotFound />);

    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("shows the not-found message", () => {
    render(<NotFound />);

    expect(
      screen.getByText("We can't find the page you're looking for."),
    ).toBeInTheDocument();
  });

  it("offers a back-to-home link to /", () => {
    render(<NotFound />);

    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
