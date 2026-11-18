/**
 * Runtime validation of required environment variables.
 *
 * Without the required vars the app boots fine and then fails confusingly at
 * the first sign-in; this module turns that into an immediate, explicit failure
 * at server start. The authoritative list of variables, which are required
 * where, and how to supply them lives in DEPLOYMENT.md — the names below must
 * stay in sync with it.
 *
 * Validation deliberately does NOT run during `next build`: the build step only
 * needs to compile and prerender static output, and the real secrets are
 * typically absent at build time (they're injected at deploy). We detect the
 * build phase via `NEXT_PHASE` and skip there.
 */

/** Variables required in every runtime environment. */
const ALWAYS_REQUIRED = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
] as const;

/**
 * Variables required only in production (presence + non-empty).
 *   - `AUTH_URL` lets Auth.js build correct OAuth callback URLs behind a proxy;
 *     locally it's inferred from the request.
 *
 * `AUTH_TRUST_HOST` is also production-required but is validated separately
 * (see `validateTrustHost`) because its *value* matters, not just its presence.
 */
const PRODUCTION_REQUIRED = ["AUTH_URL"] as const;

/**
 * Values accepted as "on" for `AUTH_TRUST_HOST`. Auth.js trusts the proxy's
 * forwarded Host header only when this is truthy; `"false"`/`"0"` leave the app
 * rejecting requests with `UntrustedHost` at sign-in. See DEPLOYMENT.md.
 */
const TRUTHY = new Set(["true", "1"]);

/** True during `next build` (static analysis / prerender), where secrets are absent. */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/**
 * Validate that all required environment variables are present and non-empty.
 * Throws a single, descriptive error listing every missing variable at once
 * (rather than failing one at a time). Called once at module load from
 * `@/auth`.
 */
export function validateEnv(): void {
  if (isBuildPhase()) return;

  const required = [
    ...ALWAYS_REQUIRED,
    ...(process.env.NODE_ENV === "production" ? PRODUCTION_REQUIRED : []),
  ];

  const missing = required.filter((name) => {
    const value = process.env[name];
    return value === undefined || value.trim() === "";
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}.\n` +
        `Copy .env.example to .env.local and fill them in for local dev, or ` +
        `inject them at deploy time (see DEPLOYMENT.md). ` +
        `Generate AUTH_SECRET with: npx auth secret`,
    );
  }

  validateTrustHost();
}

/**
 * In production, `AUTH_TRUST_HOST` must be present *and* set to a truthy value
 * (`"true"`/`"1"`). Behind a TLS-terminating proxy like Cloud Run, Auth.js
 * rejects every request with `UntrustedHost` unless this is enabled — the single
 * most common "works locally, breaks in prod" failure (see DEPLOYMENT.md). It's
 * checked separately from the presence-only vars because `AUTH_TRUST_HOST=false`
 * would satisfy a mere presence check yet still break sign-in.
 */
function validateTrustHost(): void {
  if (process.env.NODE_ENV !== "production") return;

  const value = process.env.AUTH_TRUST_HOST?.trim().toLowerCase();
  if (value && TRUTHY.has(value)) return;

  throw new Error(
    `AUTH_TRUST_HOST must be set to "true" in production (got ` +
      `${process.env.AUTH_TRUST_HOST === undefined ? "undefined" : `"${process.env.AUTH_TRUST_HOST}"`}).\n` +
      `Behind a reverse proxy (e.g. Cloud Run), Auth.js otherwise rejects ` +
      `requests with "UntrustedHost" at sign-in. See DEPLOYMENT.md.`,
  );
}
