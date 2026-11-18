import { afterEach, describe, expect, it, vi } from "vitest";

import { validateEnv } from "./env";

// `validateEnv` reads `process.env` at call time. `vi.stubEnv` sets a variable
// for the duration of the test and is undone by `vi.unstubAllEnvs()` — this
// also handles `NODE_ENV`, which is otherwise typed read-only. Unset a variable
// by stubbing it to `undefined`.
afterEach(() => {
  vi.unstubAllEnvs();
});

function clearAll() {
  for (const key of [
    "AUTH_SECRET",
    "AUTH_GOOGLE_ID",
    "AUTH_GOOGLE_SECRET",
    "AUTH_URL",
    "NEXT_PHASE",
  ]) {
    vi.stubEnv(key, undefined as unknown as string);
  }
}

function setSecrets() {
  vi.stubEnv("AUTH_SECRET", "test-secret");
  vi.stubEnv("AUTH_GOOGLE_ID", "test-client-id");
  vi.stubEnv("AUTH_GOOGLE_SECRET", "test-client-secret");
}

describe("validateEnv", () => {
  it("passes when all always-required vars are present (non-production)", () => {
    clearAll();
    vi.stubEnv("NODE_ENV", "development");
    setSecrets();

    expect(() => validateEnv()).not.toThrow();
  });

  it("throws listing every missing var at once", () => {
    clearAll();
    vi.stubEnv("NODE_ENV", "development");

    // All three always-required names appear in the message (order preserved).
    expect(() => validateEnv()).toThrow(
      /AUTH_SECRET[\s\S]*AUTH_GOOGLE_ID[\s\S]*AUTH_GOOGLE_SECRET/,
    );
  });

  it("treats empty / whitespace-only values as missing", () => {
    clearAll();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", "   ");
    vi.stubEnv("AUTH_GOOGLE_ID", "");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "ok");

    expect(() => validateEnv()).toThrow(/AUTH_SECRET/);
    expect(() => validateEnv()).toThrow(/AUTH_GOOGLE_ID/);
  });

  it("requires AUTH_URL in production", () => {
    clearAll();
    vi.stubEnv("NODE_ENV", "production");
    setSecrets();
    // AUTH_URL intentionally absent.

    expect(() => validateEnv()).toThrow(/AUTH_URL/);
  });

  it("passes in production when AUTH_URL is also set", () => {
    clearAll();
    vi.stubEnv("NODE_ENV", "production");
    setSecrets();
    vi.stubEnv("AUTH_URL", "https://app.massflow.ai");

    expect(() => validateEnv()).not.toThrow();
  });

  it("does not require AUTH_URL outside production", () => {
    clearAll();
    vi.stubEnv("NODE_ENV", "development");
    setSecrets();

    expect(() => validateEnv()).not.toThrow();
  });

  it("skips all validation during the production build phase", () => {
    clearAll();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    // No secrets at all — build must still pass.

    expect(() => validateEnv()).not.toThrow();
  });
});
