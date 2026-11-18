import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// `signOut` is imported as a server action for the sign-out form; stub it so
// the action is a harmless no-op in tests.
vi.mock("@/auth", () => ({
  signOut: vi.fn(),
}));

import UserMenu from "./user-menu";

describe("UserMenu", () => {
  it("shows the signed-in user's name", () => {
    render(<UserMenu user={{ name: "Ada Lovelace" }} />);

    expect(screen.getByTestId("user-label")).toHaveTextContent("Ada Lovelace");
  });

  it("prefers the name over the email when both are present", () => {
    render(
      <UserMenu user={{ name: "Ada Lovelace", email: "ada@example.com" }} />,
    );

    const label = screen.getByTestId("user-label");
    expect(label).toHaveTextContent("Ada Lovelace");
    expect(label).not.toHaveTextContent("ada@example.com");
  });

  it("falls back to the email when no name is present", () => {
    render(<UserMenu user={{ email: "ada@example.com" }} />);

    expect(screen.getByTestId("user-label")).toHaveTextContent(
      "ada@example.com",
    );
  });

  it("always renders a sign-out button", () => {
    render(<UserMenu user={{ name: "Ada Lovelace" }} />);

    expect(
      screen.getByRole("button", { name: /sign out/i }),
    ).toBeInTheDocument();
  });

  it("omits the user label when there is no user", () => {
    render(<UserMenu user={null} />);

    expect(screen.queryByTestId("user-label")).toBeNull();
    // The sign-out control is still rendered.
    expect(
      screen.getByRole("button", { name: /sign out/i }),
    ).toBeInTheDocument();
  });
});
