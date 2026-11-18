import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Control the session returned by `auth()` per test, and stub `signOut` so the
// server action in the component is a harmless no-op.
const auth = vi.fn();
vi.mock("@/auth", () => ({
  auth: () => auth(),
  signOut: vi.fn(),
}));

import UserMenu from "./user-menu";

// UserMenu is an async Server Component. Awaiting it yields the rendered
// element, which we can then hand to Testing Library's `render`.
async function renderUserMenu() {
  render(await UserMenu());
}

describe("UserMenu", () => {
  afterEach(() => {
    auth.mockReset();
  });

  it("shows the signed-in user's name", async () => {
    auth.mockResolvedValue({ user: { name: "Ada Lovelace" } });

    await renderUserMenu();

    expect(screen.getByTestId("user-label")).toHaveTextContent("Ada Lovelace");
  });

  it("falls back to the email when no name is present", async () => {
    auth.mockResolvedValue({ user: { email: "ada@example.com" } });

    await renderUserMenu();

    expect(screen.getByTestId("user-label")).toHaveTextContent(
      "ada@example.com",
    );
  });

  it("always renders a sign-out button", async () => {
    auth.mockResolvedValue({ user: { name: "Ada Lovelace" } });

    await renderUserMenu();

    expect(
      screen.getByRole("button", { name: /sign out/i }),
    ).toBeInTheDocument();
  });

  it("omits the user label when there is no session", async () => {
    auth.mockResolvedValue(null);

    await renderUserMenu();

    expect(screen.queryByTestId("user-label")).toBeNull();
    // The sign-out control is still rendered.
    expect(
      screen.getByRole("button", { name: /sign out/i }),
    ).toBeInTheDocument();
  });
});
