import { NextResponse } from "next/server";

import { auth, authorized } from "@/auth";
import { THEME_INIT_SCRIPT_HASH } from "@/lib/theme";

/**
 * Build the app's Content-Security-Policy. It is STATIC (no per-request nonce):
 * most pages are statically prerendered under Partial Prerendering and served
 * from a CDN (Firebase App Hosting), so a per-request nonce can't match the
 * nonce baked into the cached HTML — it would block every script. A static
 * policy is identical on prerender, CDN hit, and dynamic render.
 *
 * Notes on specific directives:
 *   - `script-src 'self' '<theme-hash>'`: same-origin scripts (all of Next's
 *     `/_next/static/...` chunks load from our own origin) plus the one inline
 *     script we emit — the theme-init snippet — authorized by its SHA-256 hash
 *     ({@link THEME_INIT_SCRIPT_HASH}). No `'unsafe-inline'`, no nonce,
 *     deliberately no `'strict-dynamic'` (which would ignore `'self'` and defeat
 *     the point on prerendered HTML).
 *   - `style-src 'self' 'unsafe-inline'`: Next/React inject inline styles and
 *     style attributes that can't carry a hash; styles are a low-risk sink.
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
export function buildCsp(): string {
  const directives = [
    `default-src 'self'`,
    `script-src 'self' ${THEME_INIT_SCRIPT_HASH}`,
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

  // Allowed through. The CSP is static (hash-based, no nonce — see `buildCsp`),
  // so it only needs to go on the *response* for the browser to enforce it;
  // there's nothing per-request for Next to read off the request headers. A
  // static policy is what lets prerendered + CDN-cached pages keep a strict CSP
  // without a nonce mismatch.
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", buildCsp());
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
