import { describe, expect, it, vi } from "vitest";

// Importing `@/auth` executes `NextAuth({...})` at module load, which spins up
// the full Auth.js runtime (and expects real OAuth env vars). We only want to
// test the pure `authorized` callback, so stub `next-auth` and the Google
// provider: the real `authorized` export still runs, but `NextAuth()` becomes
// a harmless no-op returning empty handlers.
vi.mock("next-auth", () => ({
  default: () => ({ handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() }),
}));
vi.mock("next-auth/providers/google", () => ({ default: () => ({}) }));

import { authorized } from "./auth";

/**
 * Build the minimal `{ auth, request }` argument the callback reads: the
 * session (or null) and a request exposing `nextUrl` (pathname + origin).
 */
function makeParams(pathname: string, loggedIn: boolean) {
  const nextUrl = new URL(`https://app.massflow.ai${pathname}`);
  return {
    auth: loggedIn ? { user: { name: "Ada Lovelace" } } : null,
    request: { nextUrl },
    // The callback only touches `auth` and `request.nextUrl`; cast through
    // unknown so we don't have to fabricate the full NextRequest/Session shape.
  } as unknown as Parameters<typeof authorized>[0];
}

describe("authorized callback", () => {
  it("allows an anonymous visitor to see the login page", () => {
    const result = authorized(makeParams("/login", false));

    expect(result).toBe(true);
  });

  it("redirects an authenticated user away from the login page to home", () => {
    const spy = vi.spyOn(Response, "redirect").mockReturnValue(
      new Response(null, { status: 307 }),
    );

    authorized(makeParams("/login", true));

    expect(spy).toHaveBeenCalledOnce();
    // Redirect target is the site root.
    const target = spy.mock.calls[0][0];
    expect(target.toString()).toBe("https://app.massflow.ai/");

    spy.mockRestore();
  });

  it("requires a session on a protected route (denies anonymous)", () => {
    const result = authorized(makeParams("/", false));

    expect(result).toBe(false);
  });

  it("allows an authenticated user on a protected route", () => {
    const result = authorized(makeParams("/", true));

    expect(result).toBe(true);
  });

  it("protects nested routes the same way", () => {
    expect(authorized(makeParams("/reports/2026", false))).toBe(false);
    expect(authorized(makeParams("/reports/2026", true))).toBe(true);
  });
});
