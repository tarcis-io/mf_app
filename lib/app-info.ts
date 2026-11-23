import { description, version } from "@/package.json";

/**
 * Single source of truth for the app's own identity — name, version,
 * description, public URL, and the repository links — so these aren't repeated
 * across the layout metadata, the login page, and the About page.
 *
 * `version` and `description` are read from `package.json` (the authoritative
 * source for both), so bumping the package version updates everywhere at once.
 * The display name lives here because `package.json`'s `name` is the package id
 * (`mf_app`), not the product name.
 *
 * Plain module constants (no runtime data), so this is safe to import from
 * Server or Client Components; importing the fields rather than the whole
 * `package.json` keeps the rest of the manifest out of any bundle.
 */

/** The product's display name (not the package id). */
export const APP_NAME = "MassFlow AI";

/** The app version, from `package.json` (e.g. `0.1.0`). */
export const APP_VERSION = version;

/** One-line description, from `package.json`. */
export const APP_DESCRIPTION = description;

/** The app's public URL. */
export const APP_URL = "https://massflowai.com";

/** The contact for "Developed by" (shared with the login page footer). */
export const DEVELOPER_EMAIL = "t@rcis.io";

/**
 * GitHub repository URLs for the three MassFlow components, keyed by name: this
 * frontend, the HTTP service it calls, and the engine the service wraps. Keyed
 * (not a list) so each About card can pull its own repo link directly.
 */
export const REPOSITORY_URLS = {
  mf_app: "https://github.com/tarcis-io/mf_app",
  mf_service: "https://github.com/tarcis-io/mf_service",
  mf_engine: "https://github.com/tarcis-io/mf_engine",
} as const;
