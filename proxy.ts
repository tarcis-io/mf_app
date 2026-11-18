import { NextResponse } from "next/server";

import { auth, authorized } from "@/auth";

/**
 * Build the Content-Security-Policy for a request, bound to a per-request
 * nonce. Notes on specific directives:
 *   - `script-src 'nonce-…' 'strict-dynamic'`: only scripts carrying this
 *     request's nonce (or loaded by one that does) may execute. `'strict-dynamic'`
 *     lets Next's nonce'd bootstrap script load the rest of the bundle.
 *   - `style-src 'self' 'unsafe-inline'`: Next/React inject inline styles and
 *     style attributes that cannot carry a nonce; styles are a low-risk sink,
 *     so inline styles are allowed. (Scripts are not.)
 *   - `img-src 'self' data:`: same-origin images (e.g. the logo) and data: URIs
 *     (inlined SVG/icons). The app does not render remote images.
 *   - `connect-src 'self'`: the app makes same-origin requests only today. When
 *     wiring up mf_service (see DEPLOYMENT.md / README), add its origin here.
 *   - `frame-ancestors 'none'`: clickjacking protection (pairs with the static
 *     X-Frame-Options: DENY).
 *   - `form-action 'self'`: the Google sign-in redirect is a server-issued
 *     navigation, not a form POST to Google, so 'self' is sufficient.
 *   - `upgrade-insecure-requests`: defense-in-depth for mixed content.
 */
function buildCsp(nonce: string): string {
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
function generateNonce(): string {
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

  // Allowed through. The nonce must travel on the *request's*
  // `Content-Security-Policy` header: that is where Next looks to extract it
  // and stamp it onto its own injected <script> tags (see
  // next/dist/.../get-script-nonce-from-header). Without it on the request,
  // `script-src 'nonce-…' 'strict-dynamic'` would block Next's hydration
  // scripts and render a blank page. We also set the CSP on the response so the
  // browser actually enforces it.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
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
   */
  matcher: [
    "/((?!api/auth|_next/static|_next/image|[^?]*\\.[^?/]+$).*)",
  ],
};
