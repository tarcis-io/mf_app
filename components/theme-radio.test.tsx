import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { THEME_STORAGE_KEY } from "@/lib/theme";
import ThemeRadio from "./theme-radio";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

/** The radio input for a given option label. */
function radio(name: RegExp): HTMLInputElement {
  return screen.getByRole("radio", { name }) as HTMLInputElement;
}

describe("ThemeRadio", () => {
  it("offers exactly System, Light, and Dark", () => {
    render(<ThemeRadio />);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radio(/system/i)).toBeInTheDocument();
    expect(radio(/light/i)).toBeInTheDocument();
    expect(radio(/dark/i)).toBeInTheDocument();
  });

  it("defaults to System when nothing is stored (first visit)", () => {
    render(<ThemeRadio />);

    expect(radio(/system/i)).toBeChecked();
    expect(radio(/light/i)).not.toBeChecked();
    expect(radio(/dark/i)).not.toBeChecked();
  });

  it("reflects a stored explicit choice after mount", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    render(<ThemeRadio />);

    // The effect syncs the stored choice in after mount.
    expect(radio(/dark/i)).toBeChecked();
    expect(radio(/system/i)).not.toBeChecked();
  });

  it("applies and persists an explicit selection", () => {
    render(<ThemeRadio />);

    fireEvent.click(radio(/dark/i));

    expect(radio(/dark/i)).toBeChecked();
    // Applied app-wide via <html data-theme> and saved under the namespaced key.
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("clears the saved preference when switching back to System", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<ThemeRadio />);
    expect(radio(/light/i)).toBeChecked();

    fireEvent.click(radio(/system/i));

    expect(radio(/system/i)).toBeChecked();
    // Back to System removes the key (default = absence) and drops the attribute.
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("switches directly between two explicit themes", () => {
    render(<ThemeRadio />);

    fireEvent.click(radio(/light/i));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

    fireEvent.click(radio(/dark/i));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
});
