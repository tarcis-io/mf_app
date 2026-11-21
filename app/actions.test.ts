import { beforeEach, describe, expect, it, vi } from "vitest";

// The actions delegate to Auth.js's `signIn` / `signOut`. Importing `@/auth`
// would spin up the full Auth.js runtime (and expects real OAuth env vars), so
// stub it: we assert only that each action calls the right primitive with the
// right redirect target. `signIn` / `signOut`'s own behavior is Auth.js's.
const { signIn, signOut, isDevLoginEnabled } = vi.hoisted(() => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  isDevLoginEnabled: vi.fn(() => false),
}));
vi.mock("@/auth", () => ({ signIn, signOut }));
// `signInDevAction` reads `isDevLoginEnabled()` as a safety gate; program it per
// test. (Its real behavior is covered in `env.test.ts`.)
vi.mock("@/env", () => ({ isDevLoginEnabled }));

import { signInAction, signInDevAction, signOutAction } from "./actions";

beforeEach(() => {
  signIn.mockReset();
  signOut.mockReset();
  isDevLoginEnabled.mockReset();
  isDevLoginEnabled.mockReturnValue(false);
});

describe("signInAction", () => {
  it("starts Google sign-in and redirects home on success", async () => {
    await signInAction();

    expect(signIn).toHaveBeenCalledOnce();
    expect(signIn).toHaveBeenCalledWith("google", { redirectTo: "/" });
  });
});

describe("signInDevAction", () => {
  it("starts the dev-login sign-in and redirects home when dev login is enabled", async () => {
    isDevLoginEnabled.mockReturnValue(true);

    await signInDevAction();

    expect(signIn).toHaveBeenCalledOnce();
    expect(signIn).toHaveBeenCalledWith("dev-login", { redirectTo: "/" });
  });

  it("refuses and never signs in when dev login is disabled (prod safety)", async () => {
    isDevLoginEnabled.mockReturnValue(false);

    await expect(signInDevAction()).rejects.toThrow(/not enabled/i);
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe("signOutAction", () => {
  it("signs out and redirects to the login page", async () => {
    await signOutAction();

    expect(signOut).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/login" });
  });
});
