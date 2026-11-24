import { NextResponse } from "next/server";

import { auth, authorized } from "@/auth";

/**
 * Build the Content-Security-Policy for a request, bound to a per-request
 * nonce. Notes on specific directives:
 *   - `script-src 'nonce-…' 'strict-dynamic'`: only scripts carrying this
 *     request's nonce (or loaded by one that does) may execute. This is the
 *     Next-native approach: Next stamps the nonce onto every inline script it
 *     emits — the bootstrap AND each streamed RSC-payload chunk
 *     (`self.__next_f.push(...)`) — when it reads the nonce off the request's
 *     CSP header (see the dual-write below). `'strict-dynamic'` lets those
 *     nonce'd scripts load the rest of the bundle. A hash-based policy was tried
 *     and abandoned: Next emits an unbounded, per-page/per-build set of inline
 *     streaming scripts, so no fixed hash list can cover them.
 *   - `style-src 'self' 'unsafe-inline'`: Next/React inject inline styles and
 *     style attributes that cannot carry a nonce; styles are a low-risk sink,
 *     so inline styles are allowed. (Scripts are not.)
 *   - `img-src 'self' data:`: same-origin images (e.g. the logo) and data: URIs
 *     (inlined SVG/icons). The app does not render remote images.
 *   - `connect-src 'self'`: the app makes same-origin requests only today. When
 *     wiring up mf_service (see DEPLOYMENT.md / README), add its origin here.
 *   - `frame-ancestors 'none'`: clickjacking protection (pairs with the static
 *     X-Frame-Options: DENY).
 *   - `form-action 'self'`: see the note in `proxy` below — this currently
 *     needs revisiting for the Google sign-in Server Action POST.
 *   - `upgrade-insecure-requests`: defense-in-depth for mixed content.
 */
export function buildCsp(nonce: string): string {
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    `upgrade-insecure-requests`,
  ];
  return directives.join("; ");
}

/**
 * Generate a fresh CSP nonce using only Web-standard APIs (`crypto` + `btoa`),
 * so it works in both the Edge and Node.js runtimes — `Buffer` is not reliably
 * available in middleware/proxy on Edge. 16 random bytes (128 bits of entropy),
 * base64url-encoded: the `+/=` of standard base64 are swapped for `-_` and the
 * padding dropped. The nonce is an opaque token (never decoded), and the
 * base64url charset avoids any layer that might mangle `+`, `/`, or `=` in an
 * HTTP header while staying within the CSP `base64-value` grammar.
 */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export default auth((req) => {
  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  // Re-run the shared gatekeeper against the session Auth.js attached to the
  // request (`req.auth`). `authorized` returns a Response (redirect) or a
  // boolean. We must enforce every outcome *here*: once a middleware function
  // is supplied, Auth.js no longer acts on the `authorized` callback's own
  // boolean, so a bare `false` would otherwise let the request through (see the
  // regression guard in `proxy.test.ts`).
  const decision = authorized({
    auth: req.auth,
    request: req,
  } as Parameters<typeof authorized>[0]);

  // `/login` while authenticated → the callback returns a redirect Response.
  // Honor it as-is (no CSP needed on a bare redirect).
  if (decision instanceof Response) {
    return decision;
  }

  // Protected route while anonymous → redirect to the sign-in page. We don't
  // preserve the original destination: after signing in, users always land on
  // the home page (see the `redirectTo: "/"` in `app/login/page.tsx`).
  if (!decision) {
    const signInUrl = req.nextUrl.clone();
    signInUrl.pathname = "/login";
    signInUrl.search = "";
    return NextResponse.redirect(signInUrl);
  }

  // Allowed through. Two things must happen for the nonce to work end-to-end:
  //
  // 1. The nonce travels on the *request's* `Content-Security-Policy` header —
  //    that is where Next reads it (see next/dist/.../get-script-nonce-from-
  //    header) to stamp its injected <script> tags, including every streamed
  //    `self.__next_f.push(...)` RSC chunk. Without it on the request, those
  //    scripts carry no nonce and `script-src 'nonce-…'` blocks them (a blank
  //    page). We also set the CSP on the *response* so the browser enforces it.
  //
  // 2. The HTML must NOT be CDN-cached. On Firebase App Hosting a cached HTML
  //    response would pin one request's nonce into the markup while every later
  //    request gets a fresh nonce in its header → permanent mismatch. `no-store`
  //    forces each page request to reach the server, which re-renders with that
  //    request's nonce. This only covers page HTML; the proxy matcher already
  //    excludes `/_next/static/*` and other assets, so they stay cacheable.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
});

export const config = {
  /**
   * Run the proxy on all routes except:
   *   - `/api/auth/*`      — the Auth.js endpoints themselves (OAuth flow)
   *   - `/_next/static/*`  — build assets
   *   - `/_next/image/*`   — the image optimizer
   *   - any request for a file — the trailing `…\.[^/]+$` clause excludes any
   *     path whose final segment has an extension (favicon.ico, icon.svg,
   *     icon.png, apple-icon.png, logo.svg, and any future public asset or
   *     file-based metadata route like robots.txt / sitemap.xml). Matching by
   *     convention instead of a hardcoded filename list means new static assets
   *     aren't accidentally run through auth + CSP.
   *
   * Everything else requires an authenticated session. App Router pages are
   * always extensionless, so protected routes are never matched by the file
   * clause; conversely, don't give an authenticated route a file extension.
   *
   * This is a security boundary: it decides which routes get auth + CSP. Keep
   * the pattern a bare inline string literal — Next extracts `config` by static
   * AST analysis and silently drops a matcher built from a referenced constant
   * (it only reads literals), which would run the proxy on *every* route. The
   * pattern is re-exported below as `MATCHER_PATTERN` (read back from here, so
   * they can't drift) for direct unit testing in `proxy.test.ts`.
   */
  matcher: ["/((?!api/auth|_next/static|_next/image|[^?]*\\.[^?/]+$).*)"],
};

/**
 * The matcher pattern (see `config` above), re-exported so the exact string can
 * be unit-tested directly. Derived from `config` rather than duplicated, so the
 * test guards the literal the framework actually uses. `config.matcher` is a
 * non-empty literal array, so `[0]` is always present; the check keeps the
 * export typed as `string` (not `string | undefined`) and fails loudly if the
 * matcher is ever emptied.
 */
const [matcherPattern] = config.matcher;
if (matcherPattern === undefined) {
  throw new Error("proxy config.matcher must contain at least one pattern");
}
export const MATCHER_PATTERN: string = matcherPattern;
