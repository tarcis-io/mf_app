// Global test setup, loaded before every test file (see vitest.config.ts).
// Registers jest-dom matchers (toBeInTheDocument, toHaveClass, ...) and
// cleans up the rendered DOM between tests.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
