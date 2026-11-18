import { describe, expect, it, vi, beforeEach } from "vitest";

// We unit-test the proxy's *enforcement + CSP* logic (the part this file owns),
// with the authorization *decision* injected. So:
//   - `auth` is stubbed as a pass-through wrapper: `auth(cb) => cb`, so the
//     module's `export default auth((req) => …)` becomes just that callback,
//     which we can call directly with a fabricated request.
//   - `authorized` is a mock we program per test (true / false / a redirect
//     Response). `authorized`'s own behavior is covered in `auth.test.ts`.
const authorized = vi.fn();
vi.mock("@/auth", () => ({
  auth: (cb: unknown) => cb,
  authorized,
}));

import proxy from "./proxy";

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
  it("redirects an anonymous user on a protected route to /login with callbackUrl", () => {
    authorized.mockReturnValue(false);

    const res = runProxy(makeRequest("/reports/2026", false));

    expect(res.status).toBe(307);
    const location = res.headers.get("Location")!;
    const target = new URL(location);
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("callbackUrl")).toBe(
      "https://app.massflow.ai/reports/2026",
    );
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
    // Strict script policy with a real nonce and strict-dynamic.
    const match = csp!.match(/script-src [^;]*'nonce-([A-Za-z0-9+/_-]+={0,2})'/);
    expect(match).not.toBeNull();
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

  it("does NOT allow an anonymous user through even though a middleware fn is present", () => {
    // Regression guard: Auth.js ignores a boolean `false` once a middleware
    // function is supplied, so the proxy must enforce the denial itself.
    authorized.mockReturnValue(false);

    const res = runProxy(makeRequest("/", false));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("Location")!).pathname).toBe("/login");
  });
});
