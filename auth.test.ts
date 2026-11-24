import { describe, expect, it, vi } from "vitest";

// Importing `@/auth` executes `NextAuth({...})` at module load, which spins up
// the full Auth.js runtime (and expects real OAuth env vars). We only want to
// test the pure callbacks and the config object we hand to `NextAuth`, so stub
// `next-auth` and the providers: the real `authorized`/`jwt`/`session` exports
// still run, and `NextAuth()` becomes a no-op that *captures* the config it was
// called with (see `nextAuthConfig`) and returns empty handlers.
//
// The providers are tagged (not bare `{}`) so a test can tell which ones ended
// up in the `providers` array — that's what distinguishes the Google-only path
// from the dev-login path.
const { nextAuthConfig } = vi.hoisted(() => ({
  nextAuthConfig: { current: undefined as unknown },
}));
vi.mock("next-auth", () => ({
  default: (config: unknown) => {
    nextAuthConfig.current = config;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  },
}));
// `auth.ts` uses the Google provider as a bare reference (`providers: [Google]`),
// so its default export must itself be the tagged provider object — not a
// function returning one. The Credentials provider, by contrast, is *called*
// (`Credentials({ id: "dev-login", … })`), so that default stays a function and
// echoes back the id it's given.
vi.mock("next-auth/providers/google", () => ({
  default: { id: "google" },
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: (options: { id?: string }) => ({ id: options?.id ?? "credentials" }),
}));
// Importing `@/auth` runs `validateEnv()` at module load, which would throw
// without real secrets in the environment; it also reads `isDevLoginEnabled()`
// to decide whether to register the dev provider. Stub both — `env.ts` has its
// own dedicated tests (see `env.test.ts`). Dev login off here keeps `@/auth` on
// its production-shaped path (Google only).
vi.mock("@/env", () => ({
  validateEnv: vi.fn(),
  isDevLoginEnabled: vi.fn(() => false),
}));

import { authorized, jwt, session } from "./auth";

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
    const target = spy.mock.calls[0]![0];
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
    expect(authorized(makeParams("/hello-world", false))).toBe(false);
    expect(authorized(makeParams("/hello-world", true))).toBe(true);
  });
});

/**
 * Build the `{ session, token }` argument the `session` callback reads. Only
 * `session.user` and `token.sub` matter here; cast through unknown so we don't
 * have to fabricate the full Session/JWT shape.
 */
function makeSessionParams(sub: string | undefined) {
  return {
    session: { user: { name: "Ada Lovelace" } },
    token: { sub },
  } as unknown as Parameters<typeof session>[0];
}

describe("session callback", () => {
  it("copies the token's sub onto session.user.id (the X-User-Id)", () => {
    const result = session(makeSessionParams("google-oauth-sub-123"));

    // The callback's return is the Session (the JWT branch of the union).
    expect((result as { user: { id?: string } }).user.id).toBe(
      "google-oauth-sub-123",
    );
  });

  it("leaves the session unchanged when the token has no sub", () => {
    const result = session(makeSessionParams(undefined));

    expect((result as { user: { id?: string } }).user.id).toBeUndefined();
  });
});

/**
 * Build the `{ token, user }` argument the `jwt` callback reads. `user` is
 * present only on the initial sign-in; on later calls it's undefined.
 */
function makeJwtParams(userId: string | undefined) {
  return {
    token: {},
    user: userId === undefined ? undefined : { id: userId },
  } as unknown as Parameters<typeof jwt>[0];
}

describe("jwt callback", () => {
  it("pins token.sub to the user id at sign-in (so session.user.id is set)", () => {
    const result = jwt(makeJwtParams("dev-user"));

    // This is what makes the Credentials provider's id flow through to
    // session.user.id (the X-User-Id), matching the OAuth path.
    expect((result as { sub?: string }).sub).toBe("dev-user");
  });

  it("leaves the token unchanged on later calls (no user)", () => {
    const result = jwt(makeJwtParams(undefined));

    expect((result as { sub?: string }).sub).toBeUndefined();
  });
});

/**
 * The `providers` array is the one piece of real branching in the config object
 * handed to `NextAuth`: the dev-only Credentials provider is appended *only*
 * when `isDevLoginEnabled()` is true. The callback tests above mock `NextAuth`
 * to a no-op, so this branch would otherwise go unexercised. We read the config
 * captured by the `NextAuth` stub (`nextAuthConfig`) and assert the provider ids
 * it carries.
 */
describe("NextAuth providers config", () => {
  /** Provider ids from a captured config (providers are tagged in the mocks). */
  function providerIds(config: unknown): string[] {
    const providers = (config as { providers: { id: string }[] }).providers;
    return providers.map((p) => p.id);
  }

  it("registers Google only when dev login is disabled", async () => {
    // Re-import `./auth` fresh under the default `@/env` mock
    // (`isDevLoginEnabled: () => false`) so this doesn't depend on test order or
    // on config another test may have captured. This is the production-shaped,
    // Google-only path.
    vi.resetModules();
    await import("./auth");

    expect(providerIds(nextAuthConfig.current)).toEqual(["google"]);
  });

  it("appends the dev-login Credentials provider when dev login is enabled", async () => {
    // Re-evaluate `@/auth` with dev login ON. Reset the module registry (so the
    // import side-effect `NextAuth({...})` runs again) and, before re-importing,
    // override just `@/env` for the next import via `vi.doMock` — it isn't
    // hoisted, so it applies only to imports made after this point. `validateEnv`
    // stays a no-op; only the gate flips.
    vi.resetModules();
    vi.doMock("@/env", () => ({
      validateEnv: vi.fn(),
      isDevLoginEnabled: () => true,
    }));

    try {
      await import("./auth");

      // Google stays first; the dev-login provider is appended after it.
      expect(providerIds(nextAuthConfig.current)).toEqual([
        "google",
        "dev-login",
      ]);
    } finally {
      // Undo the per-test override and registry reset so nothing leaks into
      // other test files (the top-of-file `vi.mock` for `@/env` is restored).
      vi.doUnmock("@/env");
      vi.resetModules();
    }
  });
});
