import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyThemeChoice,
  CONFIG_PREFIX,
  readThemeChoice,
  subscribeThemeChoice,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from "./theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("config key naming", () => {
  it("uses the massflowai- prefix for the theme key", () => {
    expect(THEME_STORAGE_KEY).toBe("massflowai-theme");
    expect(THEME_STORAGE_KEY.startsWith(CONFIG_PREFIX)).toBe(true);
    expect(CONFIG_PREFIX).toBe("massflowai-");
  });
});

describe("readThemeChoice", () => {
  it("defaults to 'system' when nothing is stored", () => {
    expect(readThemeChoice()).toBe("system");
  });

  it("returns the stored explicit choice", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(readThemeChoice()).toBe("dark");

    localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(readThemeChoice()).toBe("light");
  });

  it("falls back to 'system' for an unrecognized stored value", () => {
    // A stray/old value must never select a bogus theme.
    localStorage.setItem(THEME_STORAGE_KEY, "solarized");
    expect(readThemeChoice()).toBe("system");
  });
});

describe("applyThemeChoice", () => {
  it("sets data-theme and persists an explicit choice", () => {
    applyThemeChoice("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    applyThemeChoice("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("clears storage and the attribute when choosing System", () => {
    // Start from an explicit choice...
    applyThemeChoice("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    // ...then go back to System: the key must be REMOVED (not set to
    // "system"), and the attribute dropped so the media query governs again.
    applyThemeChoice("system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("round-trips through readThemeChoice", () => {
    applyThemeChoice("light");
    expect(readThemeChoice()).toBe("light");

    applyThemeChoice("system");
    expect(readThemeChoice()).toBe("system");
  });
});

describe("THEME_INIT_SCRIPT", () => {
  it("references the storage key and only sets the attribute for explicit themes", () => {
    // The inline script reads the namespaced key and applies light/dark.
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
    expect(THEME_INIT_SCRIPT).toContain("data-theme");
    expect(THEME_INIT_SCRIPT).toContain('"light"');
    expect(THEME_INIT_SCRIPT).toContain('"dark"');
    // Must be resilient to localStorage throwing (private mode, etc.).
    expect(THEME_INIT_SCRIPT).toContain("try");
    expect(THEME_INIT_SCRIPT).toContain("catch");
  });

  it("applies a stored theme when executed in the document", () => {
    // Prove the script actually does what the <head> injection relies on.
    // Indirect eval runs it in global scope, where `localStorage`/`document`
    // live (the script is an IIFE, not a module).
    const run = () => (0, eval)(THEME_INIT_SCRIPT);

    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    run();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    // With no stored value (System) it removes the attribute.
    localStorage.removeItem(THEME_STORAGE_KEY);
    run();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});

describe("subscribeThemeChoice", () => {
  it("notifies subscribers when the choice changes, and stops after unsubscribe", () => {
    let calls = 0;
    const unsubscribe = subscribeThemeChoice(() => {
      calls += 1;
    });

    // A same-tab apply must push a notification (no native `storage` event
    // fires in the writing tab) — this is what drives the radio's re-read.
    applyThemeChoice("dark");
    expect(calls).toBe(1);

    applyThemeChoice("system");
    expect(calls).toBe(2);

    // After unsubscribing, further changes don't call back.
    unsubscribe();
    applyThemeChoice("light");
    expect(calls).toBe(2);
  });
});
