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
  // Deny access to powerful features the app doesn't use.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // Isolate the browsing context from cross-origin windows.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // Emit a self-contained production server under `.next/standalone/` (minimal
  // server.js + only the node_modules actually used).
  output: "standalone",
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
