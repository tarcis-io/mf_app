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

/**
 * A single environment-variable requirement.
 *   - `name`     — the variable's name (used in error output).
 *   - `validate` — returns `true` when the current value is acceptable.
 *   - `describe` — a tailored one-line explanation of *this* variable's
 *     problem, shown when it fails. Kept per-check so each failure carries its
 *     own guidance (a bare "AUTH_TRUST_HOST is missing" would lose the Cloud
 *     Run / `UntrustedHost` context that trips people up).
 */
interface EnvCheck {
  name: string;
  validate: (value: string | undefined) => boolean;
  describe: (value: string | undefined) => string;
}

/** Present and non-empty (after trimming). The baseline for a required var. */
function isNonEmpty(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "";
}

/** Render a value for error messages: `undefined` unquoted, otherwise quoted. */
function show(value: string | undefined): string {
  return value === undefined ? "undefined" : `"${value}"`;
}

/**
 * Values accepted as "on" for `AUTH_TRUST_HOST`. Auth.js trusts the proxy's
 * forwarded Host header only when this is truthy; `"false"`/`"0"` leave the app
 * rejecting requests with `UntrustedHost` at sign-in. See DEPLOYMENT.md.
 */
const TRUTHY = new Set(["true", "1"]);

/**
 * Variables required in every runtime environment (presence + non-empty).
 * These are the OAuth/session secrets the app cannot function without.
 */
const ALWAYS_REQUIRED: EnvCheck[] = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
].map((name) => ({
  name,
  validate: isNonEmpty,
  describe: () => `${name} is required but missing or empty.`,
}));

/**
 * Variables required only in production. This is the single source of truth for
 * the production env contract (keep it in sync with DEPLOYMENT.md):
 *   - `AUTH_URL` lets Auth.js build correct OAuth callback URLs behind a proxy;
 *     locally it's inferred from the request. Presence + non-empty.
 *   - `AUTH_TRUST_HOST` must be present *and* truthy (`"true"`/`"1"`): its
 *     *value* matters, not just its presence, because `AUTH_TRUST_HOST=false`
 *     satisfies a mere presence check yet still breaks sign-in. Behind a
 *     TLS-terminating proxy like Cloud Run, Auth.js rejects every request with
 *     `UntrustedHost` unless this is enabled — the single most common "works
 *     locally, breaks in prod" failure.
 *   - `MF_SERVICE_URL` is the base URL of `mf_service`, the API this app calls
 *     server-side for batch data (see `lib/mf-service.ts`). Presence +
 *     non-empty. Not required locally — without it the batches card simply
 *     shows its error state and the rest of the app works — but a production
 *     deploy without it is a misconfiguration worth catching at startup.
 */
const PRODUCTION_REQUIRED: EnvCheck[] = [
  {
    name: "AUTH_URL",
    validate: isNonEmpty,
    describe: () =>
      `AUTH_URL is required in production but missing or empty. Set it to the ` +
      `deployed public origin (e.g. https://mf-app-xxxxx.a.run.app).`,
  },
  {
    name: "AUTH_TRUST_HOST",
    validate: (value) => {
      const normalized = value?.trim().toLowerCase();
      return normalized !== undefined && TRUTHY.has(normalized);
    },
    describe: (value) =>
      `AUTH_TRUST_HOST must be set to "true" in production (got ${show(value)}). ` +
      `Behind a reverse proxy (e.g. Cloud Run), Auth.js otherwise rejects ` +
      `requests with "UntrustedHost" at sign-in.`,
  },
  {
    name: "MF_SERVICE_URL",
    validate: isNonEmpty,
    describe: () =>
      `MF_SERVICE_URL is required in production but missing or empty. Set it to ` +
      `the base URL of mf_service (e.g. https://mf-service-xxxxx.a.run.app); ` +
      `the app calls it server-side for batch data.`,
  },
];

/** True during `next build` (static analysis / prerender), where secrets are absent. */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/**
 * Validate every required environment variable in a single pass. Throws one
 * descriptive error listing *all* problems at once (rather than failing one at
 * a time across restarts), with a remediation hint. Called once at module load
 * from `@/auth`.
 */
export function validateEnv(): void {
  //return;
  if (isBuildPhase()) return;

  const checks = [
    ...ALWAYS_REQUIRED,
    ...(process.env.NODE_ENV === "production" ? PRODUCTION_REQUIRED : []),
  ];

  const problems = checks
    .filter((check) => !check.validate(process.env[check.name]))
    .map((check) => check.describe(process.env[check.name]));

  if (problems.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n` +
        problems.map((p) => `  - ${p}`).join("\n") +
        `\n\nCopy .env.example to .env.local and fill them in for local dev, ` +
        `or inject them at deploy time (see DEPLOYMENT.md). ` +
        `Generate AUTH_SECRET with: npx auth secret`,
    );
  }
}
