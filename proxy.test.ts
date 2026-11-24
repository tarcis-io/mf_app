import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// We unit-test the proxy's *enforcement + CSP* logic (the part this file owns),
// with the authorization *decision* injected. So:
//   - `auth` is stubbed as a pass-through wrapper: `auth(cb) => cb`, so the
//     module's `export default auth((req) => …)` becomes just that callback,
//     which we can call directly with a fabricated request.
//   - `authorized` is a mock we program per test (true / false / a redirect
//     Response). `authorized`'s own behavior is covered in `auth.test.ts`.
//
// `authorized` is created via `vi.hoisted` so it's initialized in the same
// hoisted phase as `vi.mock` (which Vitest lifts to the top of the file);
// referencing a plain top-level `const` from the factory throws "cannot access
// before initialization".
const { authorized } = vi.hoisted(() => ({ authorized: vi.fn() }));
vi.mock("@/auth", () => ({
  auth: (cb: unknown) => cb,
  authorized,
}));

import proxy, { MATCHER_PATTERN, config } from "./proxy";

// Minimal stand-in for the augmented NextRequest the proxy reads: `auth`,
// `headers`, `nextUrl`, and a `nextUrl.clone()` that yields a mutable URL.
function makeRequest(pathname: string, loggedIn: boolean) {
  const url = new URL(`https://app.massflow.ai${pathname}`);
  const nextUrl = Object.assign(url, {
    clone: () => new URL(url.href),
  });
  return {
    auth: loggedIn ? { user: { name: "Ada Lovelace" } } : null,
    headers: new Headers({ "x-existing": "kept" }),
    nextUrl,
  } as unknown as Parameters<typeof proxy>[0];
}

// The default export is typed as Auth.js middleware; in these tests it's the
// bare callback (see the `auth` stub above).
const runProxy = proxy as unknown as (
  req: ReturnType<typeof makeRequest>,
) => Response;

beforeEach(() => {
  authorized.mockReset();
});

describe("proxy", () => {
  it("redirects an anonymous user on a protected route to a clean /login", () => {
    authorized.mockReturnValue(false);

    const res = runProxy(makeRequest("/hello-world", false));

    expect(res.status).toBe(307);
    const target = new URL(res.headers.get("Location")!);
    expect(target.pathname).toBe("/login");
    // The original destination is not preserved: no callbackUrl (or any other
    // query) is carried over — users always land on home after sign-in.
    expect(target.search).toBe("");
    // A bare redirect carries no CSP.
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("honors a redirect Response from the authorized callback (logged-in on /login)", () => {
    const redirect = Response.redirect("https://app.massflow.ai/", 307);
    authorized.mockReturnValue(redirect);

    const res = runProxy(makeRequest("/login", true));

    expect(res).toBe(redirect);
  });

  it("allows an authenticated user through untouched", () => {
    authorized.mockReturnValue(true);

    const res = runProxy(makeRequest("/", true));

    // Not a redirect.
    expect(res.headers.get("Location")).toBeNull();
    // The proxy no longer sets the CSP — that's a static header from
    // next.config.ts (so it also covers prerendered / CDN-cached responses the
    // proxy's matcher never runs on). The proxy's only job here is auth.
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("forwards the request unchanged when allowed (no header rewriting)", () => {
    authorized.mockReturnValue(true);

    // The proxy used to rewrite request headers to carry a nonce; it no longer
    // does. Assert NextResponse.next is called with no request-header override.
    const nextSpy = vi.spyOn(NextResponse, "next");

    runProxy(makeRequest("/", true));

    expect(nextSpy).toHaveBeenCalledOnce();
    expect(nextSpy.mock.calls[0]![0]).toBeUndefined();

    nextSpy.mockRestore();
  });

  it("does NOT allow an anonymous user through even though a middleware fn is present", () => {
    // Regression guard: Auth.js ignores a boolean `false` once a middleware
    // function is supplied, so the proxy must enforce the denial itself.
    authorized.mockReturnValue(false);

    const res = runProxy(makeRequest("/", false));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("Location")!).pathname).toBe("/login");
  });
});

// The matcher is a security boundary: it decides which routes get run through
// the auth gatekeeper. A regression here (e.g. accidentally excluding a page,
// or newly running the Auth.js endpoints through the proxy) would be invisible
// in the behavioral tests above, which call the proxy fn directly and never
// exercise the matcher. So assert the pattern's routing decisions directly.
// (The CSP is a static header in next.config.ts and is tested there, not here.)
describe("config.matcher", () => {
  // Next.js applies the matcher body to the pathname. The pattern is
  // `/(<body>)`, so the capturing body is tested against the path with its
  // leading slash removed; the decisive part is the negative lookahead. Build
  // an anchored regex from the *exported* pattern (not a hand-copied duplicate)
  // so this test guards the real string shipped in `config`.
  const body = MATCHER_PATTERN.replace(/^\/\(/, "").replace(/\)$/, "");
  const matcherRe = new RegExp(`^${body}$`);
  const isMatched = (path: string) => matcherRe.test(path.replace(/^\//, ""));

  it("exports exactly the pattern used by the Next.js config", () => {
    // MATCHER_PATTERN is derived from config.matcher[0] (config holds the bare
    // literal Next's static analysis requires); assert they stay in lockstep so
    // the routing cases below are testing the string the framework actually uses.
    expect(config.matcher).toEqual([MATCHER_PATTERN]);
  });

  it.each([
    // Pages / app routes → protected (matched).
    ["/", true],
    ["/login", true],
    ["/dashboard", true],
    ["/dashboard/reports", true],
    // A non-auth API route is still protected.
    ["/api/batches", true],
    // Auth.js endpoints → excluded (the OAuth flow must not be gated).
    ["/api/auth/callback/google", false],
    ["/api/auth/session", false],
    // Next internals → excluded.
    ["/_next/static/chunk.js", false],
    ["/_next/image", false],
    // Any path ending in a file extension → excluded (assets + file-based
    // metadata routes), matched by convention, not a filename list.
    ["/favicon.ico", false],
    ["/icon.svg", false],
    ["/apple-icon.png", false],
    ["/logo.svg", false],
    ["/robots.txt", false],
    ["/sitemap.xml", false],
  ])("routes %s → runs proxy = %s", (path, expected) => {
    expect(isMatched(path)).toBe(expected);
  });
});
