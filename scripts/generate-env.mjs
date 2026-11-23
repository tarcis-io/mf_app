#!/usr/bin/env node
/**
 * Scaffold `.env.local` for local development.
 *
 * Copies `.env.example` to `.env.local` and fills in a freshly generated
 * `AUTH_SECRET`, so a new checkout can start the dev server after only pasting
 * the Google OAuth credentials (or setting `AUTH_DEV_LOGIN=true` to skip Google
 * entirely — see the comments the template carries over).
 *
 * Safe to re-run: if `.env.local` already exists it is left untouched (your real
 * secrets are never overwritten) and the script exits successfully.
 *
 * Run with: `pnpm setup`  (see package.json). No dependencies — Node built-ins
 * only, so it works the same on macOS, Linux, and Windows.
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve paths relative to this script (it lives in `<repo>/scripts/`), so it
// works regardless of the directory `pnpm setup` is invoked from.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const examplePath = join(repoRoot, ".env.example");
const localPath = join(repoRoot, ".env.local");

/**
 * Generate an `AUTH_SECRET` the same way `npx auth secret` does: 33 random bytes
 * base64-encoded (also what `openssl rand -base64 33` produces; see
 * DEPLOYMENT.md). 33 bytes avoids base64 `=` padding and gives ~264 bits.
 */
function generateAuthSecret() {
  return randomBytes(33).toString("base64");
}

function main() {
  if (existsSync(localPath)) {
    console.log(
      ".env.local already exists — leaving it untouched.\n" +
        "Delete it first if you want to regenerate from .env.example.",
    );
    return;
  }

  if (!existsSync(examplePath)) {
    console.error(
      "Could not find .env.example next to this script; cannot scaffold .env.local.",
    );
    process.exitCode = 1;
    return;
  }

  const template = readFileSync(examplePath, "utf8");

  // Fill in the one value we can generate. The template has a bare, empty
  // `AUTH_SECRET=` line; replace exactly that line (anchored, multiline) so
  // nothing else — including the commented guidance — is disturbed.
  const secret = generateAuthSecret();
  let contents = template.replace(/^AUTH_SECRET=$/m, `AUTH_SECRET=${secret}`);

  // Guard against the template drifting: if the anchored replace didn't match,
  // don't silently write a file without a secret.
  if (!contents.includes(`AUTH_SECRET=${secret}`)) {
    console.error(
      "Expected an empty `AUTH_SECRET=` line in .env.example but didn't find one.\n" +
        "The template may have changed — update scripts/generate-env.mjs to match.",
    );
    process.exitCode = 1;
    return;
  }

  writeFileSync(localPath, contents, { encoding: "utf8", mode: 0o600 });

  console.log(
    "Created .env.local with a generated AUTH_SECRET.\n\n" +
      "Next:\n" +
      "  • Paste AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET (Google Cloud Console), or\n" +
      "  • set AUTH_DEV_LOGIN=true to run without Google (local dev only).\n" +
      "Then: pnpm dev",
  );
}

main();
