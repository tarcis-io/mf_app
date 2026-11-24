import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy } from "@/lib/content-security-policy";

/**
 * Guards the Content-Security-Policy directives. The CSP is a static response
 * header (wired up in `next.config.ts`), built by `buildContentSecurityPolicy`
 * here; `proxy.test.ts` only asserts the proxy no longer sets one, so without
 * this a dropped/typo'd directive (a missing `connect-src`, a loosened
 * `object-src`) would ship invisibly. The directives here are the ones
 * DEPLOYMENT.md's troubleshooting table treats as load-bearing.
 */
describe("buildContentSecurityPolicy", () => {
  const parse = (csp: string) => {
    const map = new Map<string, string>();
    for (const directive of csp.split(";")) {
      const trimmed = directive.trim();
      if (trimmed === "") continue;
      const sep = trimmed.indexOf(" ");
      if (sep === -1) {
        map.set(trimmed, ""); // valueless directive, e.g. upgrade-insecure-requests
      } else {
        map.set(trimmed.slice(0, sep), trimmed.slice(sep + 1));
      }
    }
    return map;
  };

  it("locks down the always-strict directives in both environments", () => {
    for (const dev of [false, true]) {
      const csp = parse(buildContentSecurityPolicy(dev));
      expect(csp.get("default-src"), `dev=${dev}`).toBe("'self'");
      // The hardening directives that block clickjacking, base-tag injection,
      // and plugin/object embedding must never loosen.
      expect(csp.get("object-src"), `dev=${dev}`).toBe("'none'");
      expect(csp.get("frame-ancestors"), `dev=${dev}`).toBe("'none'");
      expect(csp.get("frame-src"), `dev=${dev}`).toBe("'none'");
      expect(csp.get("base-uri"), `dev=${dev}`).toBe("'self'");
      expect(csp.get("connect-src"), `dev=${dev}`).toBe("'self'");
      // The sign-in flow POSTs to Google's OAuth endpoint, so form-action must
      // allow it alongside 'self' — and nothing wider.
      expect(csp.get("form-action"), `dev=${dev}`).toBe(
        "'self' https://accounts.google.com",
      );
      // Defense-in-depth for mixed content; a valueless directive.
      expect(csp.has("upgrade-insecure-requests"), `dev=${dev}`).toBe(true);
    }
  });

  it("allows inline (but not eval) scripts in production", () => {
    const csp = parse(buildContentSecurityPolicy(false));
    // 'unsafe-inline' is the deliberate trade-off that lets a static CSP work
    // with prerendering + CDN; 'unsafe-eval' must NOT be present in prod.
    expect(csp.get("script-src")).toBe("'self' 'unsafe-inline'");
    expect(csp.get("script-src")).not.toContain("'unsafe-eval'");
    expect(csp.get("style-src")).toBe("'self' 'unsafe-inline'");
  });

  it("adds 'unsafe-eval' to script-src only in development", () => {
    // React's dev build uses eval() for debugging; this is gated out of prod.
    const csp = parse(buildContentSecurityPolicy(true));
    expect(csp.get("script-src")).toBe("'self' 'unsafe-inline' 'unsafe-eval'");
    // The dev-only relaxation must not leak into any other directive.
    expect(csp.get("style-src")).toBe("'self' 'unsafe-inline'");
  });

  it("only script-src differs between dev and prod", () => {
    const dev = parse(buildContentSecurityPolicy(true));
    const prod = parse(buildContentSecurityPolicy(false));
    expect(dev.size).toBe(prod.size);
    for (const key of prod.keys()) {
      if (key === "script-src") continue;
      expect(dev.get(key), key).toBe(prod.get(key));
    }
  });
});
