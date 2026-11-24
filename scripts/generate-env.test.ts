import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateAuthSecret, generateEnvLocal } from "./generate-env.mjs";

/**
 * The project root. Vitest runs with its working directory at the repo root, so
 * resolve the real `.env.example` from there. (Avoids `import.meta.url` +
 * `fileURLToPath`, which throws under the test bundler when the module URL isn't
 * a `file:` scheme.)
 */
const projectRoot = process.cwd();

// A minimal `.env.example` fixture carrying the two lines the script transforms
// (the bare AUTH_SECRET assignment and the commented dev-login flag), plus a
// prose mention of the flag and the Google placeholders — so we can prove the
// script touches only the intended lines.
const EXAMPLE_FIXTURE = `# Copy this file to .env.local.
AUTH_SECRET=

# Required unless AUTH_DEV_LOGIN=true (see below), it lets you skip Google.
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# AUTH_DEV_LOGIN=true
`;

let dir: string;
let examplePath: string;
let localPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mf-genenv-"));
  examplePath = join(dir, ".env.example");
  localPath = join(dir, ".env.local");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Write the given `.env.example` contents into the temp dir. */
function writeExample(contents = EXAMPLE_FIXTURE) {
  writeFileSync(examplePath, contents, "utf8");
}

describe("generateAuthSecret", () => {
  it("matches `npx auth secret` / `openssl rand -base64 33` (33 bytes, base64)", () => {
    const secret = generateAuthSecret();
    expect(Buffer.from(secret, "base64")).toHaveLength(33);
    // 33 bytes encode to 44 base64 chars with no padding.
    expect(secret).toHaveLength(44);
    expect(secret).not.toContain("=");
  });

  it("is different each call", () => {
    const seen = new Set(
      Array.from({ length: 20 }, () => generateAuthSecret()),
    );
    expect(seen.size).toBe(20);
  });
});

describe("generateEnvLocal", () => {
  it("creates .env.local: fills AUTH_SECRET and enables dev-login", () => {
    writeExample();

    const result = generateEnvLocal({
      examplePath,
      localPath,
      secret: "TEST_SECRET_VALUE",
    });

    expect(result).toEqual({ status: "created" });

    const out = readFileSync(localPath, "utf8");
    // AUTH_SECRET filled with the injected value...
    expect(out).toMatch(/^AUTH_SECRET=TEST_SECRET_VALUE$/m);
    // ...dev-login uncommented (exactly the setting line)...
    expect(out).toMatch(/^AUTH_DEV_LOGIN=true$/m);
    // ...and the Google placeholders left blank for a later switch.
    expect(out).toMatch(/^AUTH_GOOGLE_ID=$/m);
    expect(out).toMatch(/^AUTH_GOOGLE_SECRET=$/m);
  });

  it("uncomments only the setting line, not the prose mention of the flag", () => {
    writeExample();

    generateEnvLocal({ examplePath, localPath, secret: "s" });

    const out = readFileSync(localPath, "utf8");
    // The comment sentence that happens to contain "AUTH_DEV_LOGIN=true" stays a
    // comment; only the dedicated setting line is activated.
    expect(out).toContain("# Required unless AUTH_DEV_LOGIN=true (see below)");
    const active = out
      .split("\n")
      .filter((line) => line === "AUTH_DEV_LOGIN=true");
    expect(active).toHaveLength(1);
  });

  it("defaults to a real generated secret when none is injected", () => {
    writeExample();

    generateEnvLocal({ examplePath, localPath });

    const value = readFileSync(localPath, "utf8").match(
      /^AUTH_SECRET=(.+)$/m,
    )?.[1];
    expect(value).toBeDefined();
    expect(Buffer.from(value as string, "base64")).toHaveLength(33);
  });

  it("does not overwrite an existing .env.local", () => {
    writeExample();
    writeFileSync(localPath, "AUTH_SECRET=do-not-touch\n", "utf8");

    const result = generateEnvLocal({ examplePath, localPath, secret: "x" });

    expect(result).toEqual({ status: "exists" });
    // The pre-existing file is byte-for-byte preserved.
    expect(readFileSync(localPath, "utf8")).toBe("AUTH_SECRET=do-not-touch\n");
  });

  it("reports a missing template without writing anything", () => {
    // No .env.example written.
    const result = generateEnvLocal({ examplePath, localPath, secret: "x" });

    expect(result).toEqual({ status: "no-template" });
    expect(() => readFileSync(localPath, "utf8")).toThrow();
  });

  describe("template drift (writes nothing, reports which line is missing)", () => {
    it("detects a missing AUTH_SECRET line", () => {
      writeExample("AUTH_GOOGLE_ID=\n# AUTH_DEV_LOGIN=true\n");

      const result = generateEnvLocal({ examplePath, localPath, secret: "x" });

      expect(result.status).toBe("drift");
      expect(result).toMatchObject({ detail: expect.stringContaining("AUTH_SECRET") });
      expect(() => readFileSync(localPath, "utf8")).toThrow();
    });

    it("detects a missing commented dev-login line", () => {
      // AUTH_SECRET present, but no `# AUTH_DEV_LOGIN=true` to uncomment.
      writeExample("AUTH_SECRET=\nAUTH_GOOGLE_ID=\n");

      const result = generateEnvLocal({ examplePath, localPath, secret: "x" });

      expect(result.status).toBe("drift");
      expect(result).toMatchObject({
        detail: expect.stringContaining("AUTH_DEV_LOGIN"),
      });
      // A missing dev-login line must not leave a half-written file.
      expect(() => readFileSync(localPath, "utf8")).toThrow();
    });
  });

  it("stays in sync with the real .env.example (guards against drift)", () => {
    // Point at the committed template; if either anchored line is ever renamed
    // or removed, this fails here instead of silently shipping a broken setup.
    const realExample = join(projectRoot, ".env.example");

    const result = generateEnvLocal({
      examplePath: realExample,
      localPath,
      secret: "REAL_TEMPLATE_CHECK",
    });

    expect(result).toEqual({ status: "created" });
    const out = readFileSync(localPath, "utf8");
    expect(out).toMatch(/^AUTH_SECRET=REAL_TEMPLATE_CHECK$/m);
    expect(out).toMatch(/^AUTH_DEV_LOGIN=true$/m);
  });
});
