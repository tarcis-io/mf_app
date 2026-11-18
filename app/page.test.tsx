import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home page", () => {
  it('renders the "Home" heading', () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Home" }),
    ).toBeInTheDocument();
  });

  it("renders the welcome message", () => {
    render(<Home />);

    expect(screen.getByText("Welcome to MassFlow AI.")).toBeInTheDocument();
  });
});
