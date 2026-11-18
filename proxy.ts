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
 *   - `img-src` allows data: URIs (inlined SVG/icons) and Google's avatar CDN
 *     (user profile images from Google sign-in).
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
    `img-src 'self' data: https://lh3.googleusercontent.com`,
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
 * available in middleware/proxy on Edge. 16 random bytes, base64-encoded; the
 * resulting charset (`A–Za–z0–9+/=`) is within what Next's nonce parser accepts.
 */
function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export default auth((req) => {
  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  // Re-run the shared gatekeeper against the session Auth.js attached to the
  // request (`req.auth`). `authorized` returns a Response (redirect) or a
  // boolean. We enforce every outcome here (see the IMPORTANT note above).
  const decision = authorized({
    auth: req.auth,
    request: req,
  } as Parameters<typeof authorized>[0]);

  // `/login` while authenticated → the callback returns a redirect Response.
  // Honor it as-is (no CSP needed on a bare redirect).
  if (decision instanceof Response) {
    return decision;
  }

  // Protected route while anonymous → reproduce Auth.js's default behavior:
  // redirect to the sign-in page with a `callbackUrl` so the user returns to
  // where they were headed after signing in.
  if (!decision) {
    const signInUrl = req.nextUrl.clone();
    signInUrl.pathname = "/login";
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
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
   *   - static icon/metadata files (favicon, icons, logo, etc.)
   *
   * Everything else — pages and any future application API routes — requires
   * an authenticated session.
   */
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|icon.svg|icon.png|apple-icon.png|logo.svg).*)",
  ],
};
