import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// next/link's real click handler hands off to the App Router, which isn't wired
// up in jsdom. The shared error shell only needs Link to render an anchor with
// its href, so stub it with a plain anchor (same approach as app-shell.test).
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

import ErrorPage from "./error-page";

describe("ErrorPage", () => {
  it("renders the status code and message passed in", () => {
    render(<ErrorPage code={404} message="Nothing here." />);

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText("Nothing here.")).toBeInTheDocument();
  });

  it("renders a 'Back to home' link pointing at the home route", () => {
    render(<ErrorPage code={500} message="Boom." />);

    const link = screen.getByRole("link", { name: "Back to home" });
    expect(link).toHaveAttribute("href", "/");
  });
});
