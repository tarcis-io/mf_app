import { describe, expect, it, vi } from "vitest";

// Importing the layout module pulls in `next/font/google` (the top-level
// `Inter(...)` call), which isn't available under the test runner — stub it to a
// no-op returning the shape the module reads (`variable`). We only need the
// module to import so we can test the pure `extractNonce` helper.
vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-inter" }),
}));

import { extractNonce } from "./layout";

describe("extractNonce", () => {
  it("pulls the nonce out of a script-src directive", () => {
    const csp =
      "default-src 'self'; script-src 'self' 'nonce-abc123DEF_-' 'strict-dynamic'";
    expect(extractNonce(csp)).toBe("abc123DEF_-");
  });

  it("returns undefined when the header is null", () => {
    expect(extractNonce(null)).toBeUndefined();
  });

  it("returns undefined when there's no nonce in the header", () => {
    expect(extractNonce("default-src 'self'; script-src 'self'")).toBeUndefined();
  });

  it("extracts the first nonce when several are present", () => {
    const csp = "script-src 'nonce-first'; style-src 'nonce-second'";
    expect(extractNonce(csp)).toBe("first");
  });
});
