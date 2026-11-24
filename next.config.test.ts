import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

/**
 * The CSP lives in next.config.ts (a static framework-layer header) rather than
 * the proxy, so it covers prerendered / CDN-cached responses too. These tests
 * pin the directives that matter so a regression (a dropped sink, or losing the
 * Google origin the sign-in form needs) is caught here.
 */
async function getCsp(): Promise<string> {
  const headerGroups = await nextConfig.headers!();
  const header = headerGroups
    .flatMap((group) => group.headers)
    .find((h) => h.key === "Content-Security-Policy");
  if (!header) throw new Error("no Content-Security-Policy header configured");
  return header.value;
}

describe("next.config Content-Security-Policy", () => {
  it("applies the security headers to every route", async () => {
    const groups = await nextConfig.headers!();
    expect(groups.some((g) => g.source === "/:path*")).toBe(true);
  });

  it("locks down the high-risk sinks", async () => {
    const directives = (await getCsp()).split(";").map((d) => d.trim());
    expect(directives).toContain("default-src 'self'");
    expect(directives).toContain("object-src 'none'");
    expect(directives).toContain("base-uri 'self'");
    expect(directives).toContain("frame-ancestors 'none'");
  });

  it("allows the Google OAuth origin for the sign-in form POST", async () => {
    const directives = (await getCsp()).split(";").map((d) => d.trim());
    // The sign-in flow posts to Google; without this, form-action 'self' blocks
    // it (observed in production). 'self' must remain for the app's own forms.
    expect(directives).toContain(
      "form-action 'self' https://accounts.google.com",
    );
  });

  it("allows inline scripts/styles (required for Next streaming under a static CSP)", async () => {
    const directives = (await getCsp()).split(";").map((d) => d.trim());
    // A static CSP can't nonce Next's unbounded inline streaming scripts, so
    // 'unsafe-inline' is a deliberate trade-off (documented in next.config.ts).
    const scriptSrc = directives.find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(directives).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("only allows 'unsafe-eval' in development (React dev debugging), never in production", async () => {
    const scriptSrc = (await getCsp())
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"))!;
    // Tests run under NODE_ENV=development, so eval is permitted here; the guard
    // in next.config.ts keeps it out of the production policy.
    if (process.env.NODE_ENV === "production") {
      expect(scriptSrc).not.toContain("'unsafe-eval'");
    } else {
      expect(scriptSrc).toContain("'unsafe-eval'");
    }
  });

  it("does not allow remote images or connections by default", async () => {
    const directives = (await getCsp()).split(";").map((d) => d.trim());
    expect(directives).toContain("img-src 'self' data:");
    expect(directives).toContain("connect-src 'self'");
  });
});
