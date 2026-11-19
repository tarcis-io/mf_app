import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import UserLabel from "./user-label";

describe("UserLabel", () => {
  it("shows the signed-in user's name", () => {
    render(<UserLabel user={{ name: "Ada Lovelace" }} />);

    expect(screen.getByTestId("user-label")).toHaveTextContent("Ada Lovelace");
  });

  it("prefers the name over the email when both are present", () => {
    render(
      <UserLabel user={{ name: "Ada Lovelace", email: "ada@example.com" }} />,
    );

    const label = screen.getByTestId("user-label");
    expect(label).toHaveTextContent("Ada Lovelace");
    expect(label).not.toHaveTextContent("ada@example.com");
  });

  it("falls back to the email when no name is present", () => {
    render(<UserLabel user={{ email: "ada@example.com" }} />);

    expect(screen.getByTestId("user-label")).toHaveTextContent(
      "ada@example.com",
    );
  });

  it("renders nothing when there is no user", () => {
    const { container } = render(<UserLabel user={null} />);

    expect(screen.queryByTestId("user-label")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when name and email are both absent", () => {
    render(<UserLabel user={{}} />);

    expect(screen.queryByTestId("user-label")).toBeNull();
  });
});
