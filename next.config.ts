import type { NextConfig } from "next";

// Relative (not the `@/` alias): Next loads this config file before the tsconfig
// path alias is necessarily applied, and Firebase App Hosting's generated
// wrapper imports the compiled config too — a relative path resolves in both.
import { buildContentSecurityPolicy } from "./lib/content-security-policy";

/**
 * The Content-Security-Policy and the full rationale behind it live in
 * `@/lib/content-security-policy` — a dedicated module so the policy survives
 * Firebase App Hosting's deploy-time rewrite of this file (its generated wrapper
 * re-exports only the `default` config, dropping named exports) and so it stays
 * unit-testable (see `lib/content-security-policy.test.ts`). The CSP is static and emitted here,
 * at the framework layer, on every response — including prerendered / CDN-cached
 * pages that `proxy.ts` never runs on.
 *
 * `NODE_ENV` is `"development"` under `next dev` and `"production"` for
 * `next build`/`next start` (and the Docker image); `dev` adds `'unsafe-eval'`
 * to `script-src` only (React's dev build needs it).
 */
const isDev = process.env.NODE_ENV !== "production";

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
