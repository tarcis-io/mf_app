/**
 * Runtime validation of required environment variables.
 *
 * Auth.js needs `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET` to be
 * present, and when deployed behind a proxy (e.g. Cloud Run) it also needs
 * `AUTH_URL` (and usually `AUTH_TRUST_HOST=true`) — see DEPLOYMENT.md. Without
 * these, the app boots fine and then fails confusingly at the first sign-in.
 * This module turns that into an immediate, explicit failure at server start.
 *
 * Validation deliberately does NOT run during `next build`: the build step
 * only needs to compile and prerender static output, and in most CI pipelines
 * the real secrets are not present at build time (they're injected at deploy).
 * We detect the build phase via `NEXT_PHASE` and skip there.
 */

/** Variables required in every runtime environment. */
const ALWAYS_REQUIRED = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
] as const;

/**
 * Variables required only in production. `AUTH_URL` lets Auth.js build correct
 * OAuth callback URLs behind a proxy; locally it's inferred from the request.
 */
const PRODUCTION_REQUIRED = ["AUTH_URL"] as const;

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
}
