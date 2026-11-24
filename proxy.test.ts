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

import proxy, { MATCHER_PATTERN, buildCsp, config } from "./proxy";
import { THEME_INIT_SCRIPT_HASH } from "@/lib/theme";

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

  it("allows an authenticated user through with the static hash-based CSP", () => {
    authorized.mockReturnValue(true);

    const res = runProxy(makeRequest("/", true));

    // Not a redirect.
    expect(res.headers.get("Location")).toBeNull();

    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    // Static policy (no per-request nonce, no strict-dynamic — those break on
    // prerendered/CDN-cached HTML): same-origin scripts plus the theme script
    // authorized by its hash.
    expect(csp).toContain(`script-src 'self' ${THEME_INIT_SCRIPT_HASH}`);
    expect(csp).not.toContain("nonce-");
    expect(csp).not.toContain("'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("serves the same static CSP on every request (no per-request variation)", () => {
    authorized.mockReturnValue(true);

    const cspOf = (res: Response) =>
      res.headers.get("Content-Security-Policy");

    // A static policy must be byte-identical across requests — that's what lets
    // a CDN cache a response without the CSP drifting from the cached HTML.
    expect(cspOf(runProxy(makeRequest("/", true)))).toBe(
      cspOf(runProxy(makeRequest("/", true))),
    );
  });

  it("does not mutate the forwarded request headers (CSP goes on the response only)", () => {
    authorized.mockReturnValue(true);

    // With a static CSP there's nothing per-request for Next to read off the
    // request headers, so the proxy must not rewrite them (it used to, to carry
    // a nonce). Assert NextResponse.next is called with no request-header
    // override.
    const nextSpy = vi.spyOn(NextResponse, "next");

    const res = runProxy(makeRequest("/", true));

    expect(nextSpy).toHaveBeenCalledOnce();
    // Called with no args (no `{ request: { headers } }` override).
    expect(nextSpy.mock.calls[0]![0]).toBeUndefined();
    // The CSP is still set on the response for the browser to enforce.
    expect(res.headers.get("Content-Security-Policy")).toContain("script-src");

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
  const csp = buildCsp();
  const directives = csp.split(";").map((d) => d.trim());

  it("authorizes same-origin scripts + the theme hash, with no nonce/inline/remote", () => {
    // Static, hash-based script policy: 'self' covers Next's /_next/ chunks,
    // the hash covers our one inline script. Deliberately no nonce and no
    // 'strict-dynamic' (they can't match prerendered/CDN-cached HTML).
    expect(directives).toContain(
      `script-src 'self' ${THEME_INIT_SCRIPT_HASH}`,
    );
    const scriptSrc = directives.find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("nonce-");
    expect(scriptSrc).not.toContain("http:");
    expect(scriptSrc).not.toContain("https:");
  });

  it("uses a real SHA-256 hash source for the inline theme script", () => {
    // Guard the shape so a blank/placeholder can't slip in and silently fall
    // back to blocking the script. lib/theme.test.ts proves the hash matches
    // the actual script bytes.
    expect(THEME_INIT_SCRIPT_HASH).toMatch(/^'sha256-[A-Za-z0-9+/]+=*'$/);
  });

  it("locks down the high-risk sinks", () => {
    // These directives most directly prevent injection / clickjacking.
    expect(directives).toContain("default-src 'self'");
    expect(directives).toContain("object-src 'none'");
    expect(directives).toContain("base-uri 'self'");
    expect(directives).toContain("frame-ancestors 'none'");
    expect(directives).toContain("form-action 'self'");
  });

  it("keeps style-src 'unsafe-inline' (required by Next/React — do not tighten)", () => {
    // Next/React inject inline styles that can't carry a hash; removing this
    // blanks the page. Documented in proxy.ts and DEPLOYMENT.md.
    expect(directives).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("does not allow remote images or connections by default", () => {
    // The app renders no remote images and talks only to itself today. When
    // mf_service is wired up, connect-src changes and this test should be
    // updated deliberately (see the note in proxy.ts).
    expect(directives).toContain("img-src 'self' data:");
    expect(directives).toContain("connect-src 'self'");
  });

  it("is a plain static string with no unresolved placeholders", () => {
    expect(csp).not.toContain("${");
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
