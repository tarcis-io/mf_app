import type { NextConfig } from "next";

/**
 * The app's Content-Security-Policy. STATIC and defined here (not in `proxy.ts`)
 * so it's emitted at the framework layer on every response — including the
 * statically prerendered pages that Partial Prerendering / `cacheComponents`
 * generates at build time and that Firebase App Hosting serves from its CDN.
 *
 * Why not a per-request nonce? It was tried and fails on this stack: a nonce
 * minted per request in middleware can't match the nonce baked into
 * prerendered / CDN-cached HTML, and Next emits an unbounded, per-build set of
 * inline streaming scripts (`self.__next_f.push(...)`) that no fixed hash list
 * can enumerate. So `script-src` allows `'unsafe-inline'` — a deliberate
 * trade-off to keep a working CSP alongside static rendering + CDN caching. The
 * other directives stay strict, so clickjacking (`frame-ancestors`), base-tag
 * injection (`base-uri`), plugin/object embedding (`object-src`), and
 * cross-origin form posts are all still locked down.
 *
 * Notes on specific directives:
 *   - `script-src`: adds `'unsafe-eval'` IN DEVELOPMENT ONLY. React's dev build
 *     uses `eval()` for debugging features (e.g. reconstructing server error
 *     stacks in the browser); without it `next dev` logs CSP `eval` violations.
 *     Neither React nor Next uses `eval` in production, so it's gated out of the
 *     prod policy. (See Next's own CSP guide.)
 *   - `style-src 'self' 'unsafe-inline'`: Next/React inject inline styles.
 *   - `img-src 'self' data:`: same-origin images + inlined data: URIs.
 *   - `connect-src 'self'`: same-origin requests only. mf_service is called
 *     server-side (see lib/mf-service.ts), which the browser CSP never governs,
 *     so no mf_service origin is needed here. Add one only if a Client Component
 *     is ever introduced that fetches mf_service (or another origin) directly
 *     from the browser.
 *   - `form-action 'self' https://accounts.google.com`: the sign-in flow posts
 *     to Google's OAuth endpoint, so it must be allowed alongside 'self'.
 *   - `frame-ancestors 'none'`: clickjacking protection (pairs with the static
 *     X-Frame-Options: DENY).
 *   - `upgrade-insecure-requests`: defense-in-depth for mixed content.
 *
 * `NODE_ENV` is `"development"` under `next dev` and `"production"` for
 * `next build`/`next start` (and the Docker image), so this reads it at config
 * evaluation time to pick the right policy.
 */
const isDev = process.env.NODE_ENV !== "production";

/**
 * Build the Content-Security-Policy header value. Pure and exported (Next reads
 * only the default config export, so the extra named export is inert at the
 * framework layer) so the directives can be asserted directly in a test —
 * `next.config.ts` isn't otherwise unit-testable, and the CSP is a security
 * boundary whose directives the DEPLOYMENT.md troubleshooting table treats as
 * load-bearing. `dev` adds `'unsafe-eval'` to `script-src` only (React's dev
 * build needs it); everything else is identical in both environments.
 */
export function buildContentSecurityPolicy(dev: boolean): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self' https://accounts.google.com`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

const CONTENT_SECURITY_POLICY = buildContentSecurityPolicy(isDev);

/**
 * Static security headers applied to every response (via `headers()` below).
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  // Force HTTPS for two years, including subdomains, and allow preloading.
  // Safe on Cloud Run (always HTTPS at the edge). Only takes effect over HTTPS.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Disable MIME sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Legacy clickjacking protection; the CSP `frame-ancestors 'none'` above is
  // the modern equivalent for browsers that honor it.
  { key: "X-Frame-Options", value: "DENY" },
  // Don't leak full URLs (Auth.js endpoints can carry callback params) to
  // other origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Deny access to powerful features the app doesn't use. Only standardized
  // feature tokens are listed: `browsing-topics` is intentionally omitted — it's
  // a non-standard Chrome token that browsers log as "Unrecognized feature",
  // cluttering the console without reliably opting out of the Topics API.
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), " +
      "accelerometer=(), gyroscope=(), magnetometer=()",
  },
  // Isolate the browsing context from cross-origin windows.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // Emit a self-contained production server under `.next/standalone/` (minimal
  // server.js + only the node_modules actually used).
  output: "standalone",
  // Don't advertise the framework (drops the `X-Powered-By: Next.js` header).
  poweredByHeader: false,
  // The only images are local static SVGs (the logo), which the optimizer
  // doesn't process anyway. Disabling it avoids invoking the on-the-fly
  // optimizer at runtime (pairs with `sharp: false` in pnpm-workspace.yaml); add
  // `remotePatterns` here if remote images are ever introduced.
  images: { unoptimized: true },
  // Enable Cache Components (`use cache`, `cacheLife`/`cacheTag`, Partial
  // Prerendering). Required for `partialPrefetching` below.
  cacheComponents: true,
  // `<Link prefetch>` prefetches only the static shell of a route, not its
  // dynamic data.
  partialPrefetching: true,
  // Apply the static security headers (including the CSP defined above) to
  // every route. `proxy.ts` sets no headers — it only does auth
  // route-protection.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  // Strip `data-testid` attributes from the production build. The drawer
  // backdrop carries the only `data-testid` in shipping markup — it's a
  // decorative, role-less, text-less element, so it's the one spot the tests
  // can't reach by role or text and must fall back to a test id; everything
  // else is queried by role/text and needs no hook. This keeps that lone hook
  // out of the shipped DOM. Applies to production builds only — dev and test
  // keep them, so the test suite is unaffected. `true` removes the default
  // `^data-testid$`.
  compiler: {
    reactRemoveProperties: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
