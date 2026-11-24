import { describe, expect, it } from "vitest";

import { description as pkgDescription, version as pkgVersion } from "@/package.json";
import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_URL,
  APP_VERSION,
  DEVELOPER_EMAIL,
  REPOSITORY_URLS,
} from "./app-info";

/**
 * `app-info` is the single source of truth for the app's own identity, consumed
 * by the layout metadata, the login page, and the About page. There's no
 * branching here, so these assertions pin the two contracts that matter:
 *   1. `version`/`description` are sourced from `package.json` (so a version
 *      bump propagates everywhere) rather than hardcoded, and
 *   2. the repo map carries exactly the three MassFlow components the About
 *      page renders a link for.
 */
describe("app-info", () => {
  it("exposes the product display name (not the package id)", () => {
    // The package id is `mf_app`; the product name is what users see.
    expect(APP_NAME).toBe("MassFlow AI");
  });

  it("sources version and description from package.json (not a hardcoded copy)", () => {
    // Asserting equality with the manifest is what guarantees a `package.json`
    // version bump updates the About card / metadata without a second edit here.
    expect(APP_VERSION).toBe(pkgVersion);
    expect(APP_DESCRIPTION).toBe(pkgDescription);
  });

  it("exposes the public URL and developer contact", () => {
    expect(APP_URL).toBe("https://massflowai.com");
    expect(DEVELOPER_EMAIL).toBe("t@rcis.io");
  });

  it("maps exactly the three MassFlow component repositories to GitHub URLs", () => {
    // The About page pulls each repo link by key, so the set must be exactly
    // these three (no more, no fewer) and each must be a GitHub URL.
    expect(Object.keys(REPOSITORY_URLS).sort()).toEqual([
      "mf_app",
      "mf_engine",
      "mf_service",
    ]);
    for (const url of Object.values(REPOSITORY_URLS)) {
      expect(url).toMatch(/^https:\/\/github\.com\/tarcis-io\//);
    }
  });
});
