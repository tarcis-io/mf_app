/**
 * The app's Content-Security-Policy — the single canonical home for the policy
 * and the reasoning behind it.
 *
 * It lives in its own module (not in `next.config.ts`) for two reasons:
 *   1. Firebase App Hosting rewrites `next.config.ts` at deploy time into a
 *      generated wrapper that re-exports only the `default` config, dropping any
 *      named exports. Keeping `buildContentSecurityPolicy` here means neither the
 *      deploy wrapper nor the test depends on a named export surviving in
 *      `next.config.ts`.
 *   2. `next.config.ts` isn't straightforwardly unit-testable, but this is a
 *      security boundary whose directives the DEPLOYMENT.md troubleshooting table
 *      treats as load-bearing — so the policy is a pure, exported function that
 *      `content-security-policy.test.ts` (beside this file) asserts directly.
 *
 * The CSP is STATIC (no per-request nonce) so it's emitted at the framework
 * layer on every response — including the statically prerendered pages that
 * Partial Prerendering / `cacheComponents` generates at build time and that
 * Firebase App Hosting serves from its CDN.
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
 */

/**
 * Build the Content-Security-Policy header value. Pure, so the directives can be
 * asserted directly in a test. `dev` adds `'unsafe-eval'` to `script-src` only
 * (React's dev build needs it); everything else is identical in both
 * environments.
 *
 * Callers pass `dev` from `NODE_ENV` — `"development"` under `next dev`,
 * `"production"` for `next build`/`next start` (and the Docker image). See
 * `next.config.ts`, which wires the result into the static response headers.
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
