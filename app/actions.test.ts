import { beforeEach, describe, expect, it, vi } from "vitest";

// The actions delegate to Auth.js's `signIn` / `signOut`. Importing `@/auth`
// would spin up the full Auth.js runtime (and expects real OAuth env vars), so
// stub it: we assert only that each action calls the right primitive with the
// right redirect target. `signIn` / `signOut`'s own behavior is Auth.js's.
const { signIn, signOut } = vi.hoisted(() => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/auth", () => ({ signIn, signOut }));

import { signInAction, signOutAction } from "./actions";

beforeEach(() => {
  signIn.mockReset();
  signOut.mockReset();
});

describe("signInAction", () => {
  it("starts Google sign-in and redirects home on success", async () => {
    await signInAction();

    expect(signIn).toHaveBeenCalledOnce();
    expect(signIn).toHaveBeenCalledWith("google", { redirectTo: "/" });
  });
});

describe("signOutAction", () => {
  it("signs out and redirects to the login page", async () => {
    await signOutAction();

    expect(signOut).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/login" });
  });
});
