import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import UserLabel from "./user-label";

describe("UserLabel", () => {
  it("shows the signed-in user's name", () => {
    render(<UserLabel user={{ name: "Ada Lovelace" }} />);

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("prefers the name over the email when both are present", () => {
    render(
      <UserLabel user={{ name: "Ada Lovelace", email: "ada@example.com" }} />,
    );

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    // Only the name renders; the email is not shown as a fallback.
    expect(screen.queryByText("ada@example.com")).toBeNull();
  });

  it("falls back to the email when no name is present", () => {
    render(<UserLabel user={{ email: "ada@example.com" }} />);

    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });

  it("renders nothing when there is no user", () => {
    const { container } = render(<UserLabel user={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when name and email are both absent", () => {
    const { container } = render(<UserLabel user={{}} />);

    expect(container).toBeEmptyDOMElement();
  });
});
