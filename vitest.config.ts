import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Vitest configuration for component/unit tests. Runs in a jsdom environment
// so React components can render against a DOM. The `@/*` alias mirrors the
// one in tsconfig.json so test imports match application imports.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    css: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Only application code counts toward coverage. Config, type decls, the
      // Next route re-export, and build tooling carry no meaningful branches.
      include: ["app/**", "components/**", "lib/**", "auth.ts", "env.ts", "proxy.ts", "scripts/**"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        "app/api/**", // one-line handler re-export
        "app/**/layout.tsx",
        "**/*.config.*",
      ],
      // Floors, not targets — raise as coverage improves. Tuned to the current
      // suite; CI (or `pnpm test:coverage`) fails if coverage drops below these.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
