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

import proxy, { MATCHER_PATTERN, buildCsp, config, generateNonce } from "./proxy";

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

  it("allows an authenticated user through with a per-request nonce CSP", () => {
    authorized.mockReturnValue(true);

    const res = runProxy(makeRequest("/", true));

    // Not a redirect.
    expect(res.headers.get("Location")).toBeNull();

    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    // Strict script policy with a real nonce and strict-dynamic. The nonce is
    // base64url (see generateNonce): only A–Za–z0–9-_, no +, /, or = padding.
    const match = csp!.match(/script-src [^;]*'nonce-([A-Za-z0-9_-]+)'/);
    expect(match).not.toBeNull();
    const nonce = match![1]!;
    expect(nonce).not.toMatch(/[+/=]/);
    // 16 random bytes base64url-encode to 22 unpadded chars.
    expect(nonce.length).toBe(22);
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("uses a fresh nonce on each request", () => {
    authorized.mockReturnValue(true);

    const nonceOf = (res: Response) =>
      res.headers.get("Content-Security-Policy")!.match(/'nonce-([^']+)'/)![1];

    const first = nonceOf(runProxy(makeRequest("/", true)));
    const second = nonceOf(runProxy(makeRequest("/", true)));

    expect(first).not.toBe(second);
  });

  it("writes the same CSP onto the forwarded request headers, not just the response", () => {
    authorized.mockReturnValue(true);

    // Capture the options the proxy passes to NextResponse.next so we can
    // inspect the request headers it forwards. This dual-write is load-bearing:
    // Next extracts the nonce from the *request's* CSP header to stamp its
    // injected <script> tags (see the note in proxy.ts).
    const nextSpy = vi.spyOn(NextResponse, "next");

    const res = runProxy(makeRequest("/", true));

    expect(nextSpy).toHaveBeenCalledOnce();
    const requestHeaders = nextSpy.mock.calls[0]![0]?.request?.headers;
    const requestCsp = requestHeaders?.get("Content-Security-Policy");
    const responseCsp = res.headers.get("Content-Security-Policy");

    expect(requestCsp).toBeTruthy();
    // Request and response must carry the identical policy (same nonce).
    expect(requestCsp).toBe(responseCsp);
    // Pre-existing request headers are preserved, not dropped.
    expect(requestHeaders?.get("x-existing")).toBe("kept");

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

// Direct tests of the CSP builder. The end-to-end tests above assert a few
// directives via the response; these pin the exact policy so a stray
// 'unsafe-inline' (or a dropped directive) is caught at the source, not left to
// surface as a subtle production CSP regression.
describe("buildCsp", () => {
  const nonce = "test-nonce-value";
  const csp = buildCsp(nonce);
  const directives = csp.split(";").map((d) => d.trim());

  it("carries the given nonce with strict-dynamic and no inline/remote scripts", () => {
    expect(csp).toContain(
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    );
    // The whole point of the nonce approach: scripts may never be inline- or
    // host-allowlisted. 'strict-dynamic' ignores host/scheme allowlists, but an
    // 'unsafe-inline' here would still be a real hole — guard against it.
    const scriptSrc = directives.find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("http:");
    expect(scriptSrc).not.toContain("https:");
  });

  it("locks down the high-risk sinks", () => {
    // These three are the directives that most directly prevent injection /
    // clickjacking; assert them exactly.
    expect(directives).toContain("default-src 'self'");
    expect(directives).toContain("object-src 'none'");
    expect(directives).toContain("base-uri 'self'");
    expect(directives).toContain("frame-ancestors 'none'");
    expect(directives).toContain("form-action 'self'");
  });

  it("keeps style-src 'unsafe-inline' (required by Next/React — do not tighten)", () => {
    // Next/React inject un-nonce-able inline styles; removing this blanks the
    // page. Documented in proxy.ts and DEPLOYMENT.md. The test encodes the
    // intent so a well-meaning "tightening" trips here first.
    expect(directives).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("does not allow remote images or connections by default", () => {
    // The app renders no remote images and talks only to itself today. When
    // mf_service is wired up, connect-src changes and this test should be
    // updated deliberately (see the note in proxy.ts).
    expect(directives).toContain("img-src 'self' data:");
    expect(directives).toContain("connect-src 'self'");
  });

  it("interpolates the nonce rather than emitting a literal placeholder", () => {
    expect(buildCsp("abc123")).toContain("'nonce-abc123'");
    expect(buildCsp("abc123")).not.toContain("${nonce}");
  });
});

describe("generateNonce", () => {
  it("produces a 22-char base64url token (16 random bytes, no +/= padding)", () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(nonce).not.toMatch(/[+/=]/);
  });

  it("is unique across calls", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateNonce()));
    expect(seen.size).toBe(50);
  });
});

// The matcher is a security boundary: it decides which routes get run through
// auth + CSP. A regression here (e.g. accidentally excluding a page, or newly
// running the Auth.js endpoints through the proxy) would be invisible in the
// behavioral tests above, which call the proxy fn directly and never exercise
// the matcher. So assert the pattern's routing decisions directly.
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
