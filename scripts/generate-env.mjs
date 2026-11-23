#!/usr/bin/env node
/**
 * Scaffold `.env.local` for local development.
 *
 * Copies `.env.example` to `.env.local` and produces a file the dev server can
 * boot from immediately:
 *   - fills in a freshly generated `AUTH_SECRET`, and
 *   - enables the dev-only login (`AUTH_DEV_LOGIN=true`), so `pnpm dev` works
 *     with no Google OAuth setup (the login page shows "Continue as dev user").
 *
 * To use real Google sign-in instead, paste `AUTH_GOOGLE_ID` /
 * `AUTH_GOOGLE_SECRET` into `.env.local` and comment `AUTH_DEV_LOGIN` back out.
 * (`AUTH_DEV_LOGIN` is ignored in production regardless — see env.ts — so this
 * convenience can never weaken a deploy.)
 *
 * Safe to re-run: if `.env.local` already exists it is left untouched (your real
 * secrets are never overwritten).
 *
 * Run with: `pnpm setup`  (see package.json). No dependencies — Node built-ins
 * only, so it works the same on macOS, Linux, and Windows.
 *
 * The core logic is exported as {@link generateEnvLocal} (pure w.r.t. I/O
 * messaging — it returns a result rather than printing/exiting) so it can be
 * unit-tested; the CLI wrapper at the bottom runs it only when this file is
 * invoked directly.
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Generate an `AUTH_SECRET` the same way `npx auth secret` does: 33 random bytes
 * base64-encoded (also what `openssl rand -base64 33` produces; see
 * DEPLOYMENT.md). 33 bytes avoids base64 `=` padding and gives ~264 bits.
 */
export function generateAuthSecret() {
  return randomBytes(33).toString("base64");
}

/**
 * Result of {@link generateEnvLocal}:
 *   - `{ status: "created" }`       — wrote a fresh `.env.local`.
 *   - `{ status: "exists" }`        — `.env.local` already present; untouched.
 *   - `{ status: "no-template" }`   — `.env.example` not found.
 *   - `{ status: "drift", detail }` — the template didn't contain an expected
 *                                     line (so nothing was written).
 * @typedef {{ status: "created" | "exists" | "no-template" }
 *   | { status: "drift", detail: string }} GenerateEnvResult
 */

/**
 * Create `.env.local` from `.env.example`, filling `AUTH_SECRET` and enabling
 * dev-login. Does not overwrite an existing `.env.local`. Returns a structured
 * {@link GenerateEnvResult}; never throws for the expected cases, and never
 * writes a partial file (the template is fully transformed in memory first, and
 * a missing expected line aborts before writing).
 *
 * @param {{ examplePath: string, localPath: string, secret?: string }} opts
 *   `secret` is injectable for deterministic tests; defaults to a fresh one.
 */
export function generateEnvLocal({ examplePath, localPath, secret }) {
  if (existsSync(localPath)) return { status: "exists" };
  if (!existsSync(examplePath)) return { status: "no-template" };

  const authSecret = secret ?? generateAuthSecret();
  let contents = readFileSync(examplePath, "utf8");

  // 1. Fill the one value we can generate. The template has a bare, empty
  //    `AUTH_SECRET=` line; replace exactly that line (anchored, multiline) so
  //    nothing else — including the commented guidance — is disturbed.
  const afterSecret = contents.replace(
    /^AUTH_SECRET=$/m,
    `AUTH_SECRET=${authSecret}`,
  );
  if (afterSecret === contents) {
    return { status: "drift", detail: "an empty `AUTH_SECRET=` line" };
  }
  contents = afterSecret;

  // 2. Enable dev-login so `pnpm dev` boots without Google creds. The template
  //    ships it commented (`# AUTH_DEV_LOGIN=true`); uncomment exactly that
  //    line. Anchored to the whole line so the prose mention of the flag higher
  //    up ("Required unless AUTH_DEV_LOGIN=true …") is not touched.
  const afterDevLogin = contents.replace(
    /^# AUTH_DEV_LOGIN=true$/m,
    "AUTH_DEV_LOGIN=true",
  );
  if (afterDevLogin === contents) {
    return { status: "drift", detail: "a commented `# AUTH_DEV_LOGIN=true` line" };
  }
  contents = afterDevLogin;

  writeFileSync(localPath, contents, { encoding: "utf8", mode: 0o600 });
  return { status: "created" };
}

/** Repo-root-relative default paths (this file lives in `<repo>/scripts/`). */
export function defaultPaths() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  return {
    examplePath: join(repoRoot, ".env.example"),
    localPath: join(repoRoot, ".env.local"),
  };
}

/** CLI entry: run the generator against the repo paths; print + set exit code. */
function main() {
  const result = generateEnvLocal(defaultPaths());

  switch (result.status) {
    case "created":
      console.log(
        "Created .env.local — ready for `pnpm dev`.\n\n" +
          "  • AUTH_SECRET: generated.\n" +
          "  • AUTH_DEV_LOGIN=true: the login page offers 'Continue as dev user'\n" +
          "    (no Google setup needed; ignored in production).\n\n" +
          "To use real Google sign-in instead, paste AUTH_GOOGLE_ID /\n" +
          "AUTH_GOOGLE_SECRET and comment AUTH_DEV_LOGIN back out.",
      );
      return;
    case "exists":
      console.log(
        ".env.local already exists — leaving it untouched.\n" +
          "Delete it first if you want to regenerate from .env.example.",
      );
      return;
    case "no-template":
      console.error(
        "Could not find .env.example next to this script; cannot scaffold .env.local.",
      );
      process.exitCode = 1;
      return;
    case "drift":
      console.error(
        `Expected ${result.detail} in .env.example but didn't find one.\n` +
          "The template may have changed — update scripts/generate-env.mjs to match.",
      );
      process.exitCode = 1;
      return;
  }
}

// Run only when invoked directly (`node scripts/generate-env.mjs` / `pnpm
// setup`), not when imported by the test.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
