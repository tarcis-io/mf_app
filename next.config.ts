import type { NextConfig } from "next";

/**
 * Static security headers applied to every response.
 *
 * The Content-Security-Policy is deliberately NOT here — it carries a
 * per-request nonce and is set in `proxy.ts`. Everything below is static and
 * belongs at the framework layer so it also covers responses the proxy's
 * matcher excludes (static assets, the Auth.js routes).
 */
const securityHeaders = [
  // Force HTTPS for two years, including subdomains, and allow preloading.
  // Safe on Cloud Run (always HTTPS at the edge). Only takes effect over HTTPS.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Disable MIME sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Legacy clickjacking protection; CSP `frame-ancestors 'none'` (in proxy.ts)
  // is the modern equivalent for browsers that honor it.
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
  // Apply the static security headers to every route. (CSP is per-request in
  // proxy.ts.)
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
