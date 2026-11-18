import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LoggedInTemplate from "./logged-in-template";

describe("LoggedInTemplate", () => {
  it("renders the page title as a level-1 heading", () => {
    render(
      <LoggedInTemplate title="Dashboard">
        <p>content</p>
      </LoggedInTemplate>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeInTheDocument();
  });

  it("renders the app name in the header", () => {
    render(
      <LoggedInTemplate title="Dashboard">
        <p>content</p>
      </LoggedInTemplate>,
    );

    expect(screen.getByText("MassFlow AI")).toBeInTheDocument();
  });

  it("renders its children", () => {
    render(
      <LoggedInTemplate title="Dashboard">
        <p>hello world</p>
      </LoggedInTemplate>,
    );

    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("exposes a single main landmark containing the heading", () => {
    render(
      <LoggedInTemplate title="Reports">
        <p>content</p>
      </LoggedInTemplate>,
    );

    const main = screen.getByRole("main");
    expect(main).toContainElement(
      screen.getByRole("heading", { level: 1, name: "Reports" }),
    );
  });
});
