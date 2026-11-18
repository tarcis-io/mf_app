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
    "AUTH_TRUST_HOST",
    "NEXT_PHASE",
  ]) {
    vi.stubEnv(key, undefined as unknown as string);
  }
}

/** The production-only vars beyond the always-required secrets. */
function setProductionExtras() {
  vi.stubEnv("AUTH_URL", "https://app.massflow.ai");
  vi.stubEnv("AUTH_TRUST_HOST", "true");
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

  it("passes in production when AUTH_URL and AUTH_TRUST_HOST are also set", () => {
    clearAll();
    vi.stubEnv("NODE_ENV", "production");
    setSecrets();
    setProductionExtras();

    expect(() => validateEnv()).not.toThrow();
  });

  it("does not require AUTH_URL outside production", () => {
    clearAll();
    vi.stubEnv("NODE_ENV", "development");
    setSecrets();

    expect(() => validateEnv()).not.toThrow();
  });

  it("requires AUTH_TRUST_HOST in production", () => {
    clearAll();
    vi.stubEnv("NODE_ENV", "production");
    setSecrets();
    vi.stubEnv("AUTH_URL", "https://app.massflow.ai");
    // AUTH_TRUST_HOST intentionally absent.

    expect(() => validateEnv()).toThrow(/AUTH_TRUST_HOST/);
  });

  it("rejects a falsy AUTH_TRUST_HOST in production (present but not truthy)", () => {
    clearAll();
    vi.stubEnv("NODE_ENV", "production");
    setSecrets();
    vi.stubEnv("AUTH_URL", "https://app.massflow.ai");
    // A mere presence check would pass this; the value must be truthy.
    vi.stubEnv("AUTH_TRUST_HOST", "false");

    expect(() => validateEnv()).toThrow(/AUTH_TRUST_HOST/);
  });

  it('accepts "true"/"1" (any case, surrounding space) for AUTH_TRUST_HOST', () => {
    for (const value of ["true", "TRUE", "1", "  true  "]) {
      clearAll();
      vi.stubEnv("NODE_ENV", "production");
      setSecrets();
      vi.stubEnv("AUTH_URL", "https://app.massflow.ai");
      vi.stubEnv("AUTH_TRUST_HOST", value);

      expect(() => validateEnv(), `value: ${JSON.stringify(value)}`).not.toThrow();
    }
  });

  it("does not require AUTH_TRUST_HOST outside production", () => {
    clearAll();
    vi.stubEnv("NODE_ENV", "development");
    setSecrets();
    // AUTH_TRUST_HOST intentionally absent.

    expect(() => validateEnv()).not.toThrow();
  });

  it("does not require AUTH_URL when NODE_ENV is unset", () => {
    clearAll();
    // NODE_ENV intentionally left unset (not "production").
    setSecrets();
    // AUTH_URL intentionally absent.

    expect(() => validateEnv()).not.toThrow();
  });

  it("still validates outside the production build phase (dev-server phase)", () => {
    clearAll();
    vi.stubEnv("NODE_ENV", "production");
    // A NEXT_PHASE other than phase-production-build must NOT skip validation.
    vi.stubEnv("NEXT_PHASE", "phase-development-server");
    // No secrets at all — this should throw since we're not in the build phase.

    expect(() => validateEnv()).toThrow(/AUTH_SECRET/);
  });

  it("skips all validation during the production build phase", () => {
    clearAll();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    // No secrets at all — build must still pass.

    expect(() => validateEnv()).not.toThrow();
  });

  describe("single-pass aggregation", () => {
    /** Run validateEnv once and return the thrown Error's message. */
    function messageFrom(): string {
      try {
        validateEnv();
      } catch (err) {
        return (err as Error).message;
      }
      throw new Error("expected validateEnv to throw, but it did not");
    }

    it("reports secret and production problems together in a single throw", () => {
      clearAll();
      vi.stubEnv("NODE_ENV", "production");
      // Nothing set: all three secrets missing, AUTH_URL missing, and
      // AUTH_TRUST_HOST missing. A single validateEnv() call must surface every
      // problem at once — not just the always-required set, and not one per run.
      const message = messageFrom();

      expect(message).toContain("AUTH_SECRET");
      expect(message).toContain("AUTH_GOOGLE_ID");
      expect(message).toContain("AUTH_GOOGLE_SECRET");
      expect(message).toContain("AUTH_URL");
      expect(message).toContain("AUTH_TRUST_HOST");
    });

    it("aggregates a missing secret with a present-but-invalid AUTH_TRUST_HOST", () => {
      clearAll();
      vi.stubEnv("NODE_ENV", "production");
      // Two of three secrets present; one missing. AUTH_URL fine. AUTH_TRUST_HOST
      // present but falsy — the case a presence-only check would miss. Both the
      // missing secret and the bad AUTH_TRUST_HOST must appear in one message.
      vi.stubEnv("AUTH_GOOGLE_ID", "id");
      vi.stubEnv("AUTH_GOOGLE_SECRET", "secret");
      vi.stubEnv("AUTH_URL", "https://app.massflow.ai");
      vi.stubEnv("AUTH_TRUST_HOST", "false");
      // AUTH_SECRET intentionally missing.
      const message = messageFrom();

      expect(message).toContain("AUTH_SECRET");
      expect(message).toContain("AUTH_TRUST_HOST");
      // The actual bad value is echoed to aid debugging.
      expect(message).toContain('"false"');
    });

    it("does not report a variable that is valid", () => {
      clearAll();
      vi.stubEnv("NODE_ENV", "production");
      // Everything valid except AUTH_TRUST_HOST, which is absent. Only the
      // failing variable should appear as a problem line.
      setSecrets();
      vi.stubEnv("AUTH_URL", "https://app.massflow.ai");
      // AUTH_TRUST_HOST intentionally absent.
      const message = messageFrom();

      // Inspect the bulleted problem lines (`  - ...`) only. The trailing
      // remediation hint always names AUTH_SECRET ("Generate AUTH_SECRET with
      // ..."), so asserting on the whole message would give a false positive;
      // the problem lines are what actually report failures.
      const problemLines = message
        .split("\n")
        .filter((line) => line.trimStart().startsWith("- "));

      expect(problemLines).toHaveLength(1);
      expect(problemLines[0]).toContain("AUTH_TRUST_HOST");
      // The satisfied variables are not reported as problems.
      expect(problemLines[0]).not.toContain("AUTH_SECRET");
      expect(problemLines[0]).not.toContain("AUTH_URL");
    });

    it("still includes the remediation hint", () => {
      clearAll();
      vi.stubEnv("NODE_ENV", "development");
      // Missing secrets in dev — the hint about .env.local / npx auth secret
      // must survive the aggregated-message format.
      const message = messageFrom();

      expect(message).toContain(".env.local");
      expect(message).toContain("npx auth secret");
    });
  });
});
