import { NextResponse } from "next/server";

import { auth, authorized } from "@/auth";

/**
 * Route-protection proxy (Next 16 proxy / middleware). It runs the shared
 * `authorized` gatekeeper on every matched request and enforces its decision.
 *
 * It does NOT set the Content-Security-Policy. The CSP is static and lives in
 * `next.config.ts` (applied via `headers()` at the framework layer), so it
 * works on the statically prerendered / CDN-cached responses that this proxy's
 * matcher never even runs on. (A per-request nonce CSP was tried here and
 * abandoned: it can't match prerendered / Firebase App Hosting CDN-cached HTML.)
 */
export default auth((req) => {
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

  // Allowed through unchanged.
  return NextResponse.next();
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
