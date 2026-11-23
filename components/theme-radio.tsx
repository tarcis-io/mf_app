"use client";

import { useId, useSyncExternalStore } from "react";

import {
  applyThemeChoice,
  readThemeChoice,
  subscribeThemeChoice,
  type ThemeChoice,
} from "@/lib/theme";

/** Server/initial snapshot: the choice is unknowable without localStorage. */
const serverChoice = (): ThemeChoice => "system";

/** The radio options, in display order. "System" is first — it's the default. */
const OPTIONS: { value: ThemeChoice; label: string; hint: string }[] = [
  { value: "system", label: "System", hint: "Match your device" },
  { value: "light", label: "Light", hint: "Always light" },
  { value: "dark", label: "Dark", hint: "Always dark" },
];

/**
 * The theme selector for the Settings page: a radio group choosing between
 * System (follow the OS — the default), Light, and Dark. Selecting a theme
 * applies it to the whole app immediately (via `data-theme` on `<html>`) and
 * persists it; choosing System clears the saved preference. See `@/lib/theme`.
 *
 * Hydration: the server can't know the stored choice, so it renders "System"
 * (the `serverChoice` snapshot) on the server and the first client render, then
 * `useSyncExternalStore` swaps in the real stored choice — the store's own,
 * lint-clean way to read a client-only value without a mount effect. The store
 * also updates on changes from other tabs. The applied theme never flashes,
 * because the inline init script (see `app/layout.tsx`) has already set
 * `data-theme` before paint.
 */
export default function ThemeRadio() {
  const choice = useSyncExternalStore(
    subscribeThemeChoice,
    readThemeChoice,
    serverChoice,
  );
  const groupId = useId();

  const onSelect = (next: ThemeChoice) => {
    // Persist + apply; the store notifies subscribers, so `choice` above
    // re-reads and the selection updates. No local state needed.
    applyThemeChoice(next);
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={groupId}
      className="flex flex-col gap-2"
    >
      <span id={groupId} className="sr-only">
        Theme
      </span>
      {OPTIONS.map((option) => {
        const selected = choice === option.value;
        return (
          <label
            key={option.value}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm outline-none transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary motion-reduce:transition-none ${
              selected
                ? "border-primary bg-primary/[.06]"
                : "border-foreground/15 hover:border-foreground/25 hover:bg-foreground/[.03]"
            }`}
          >
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={selected}
              onChange={() => onSelect(option.value)}
              className="h-4 w-4 shrink-0 accent-primary"
            />
            <span className="flex flex-col">
              <span className="font-medium text-foreground">
                {option.label}
              </span>
              <span className="text-xs text-foreground/50">{option.hint}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
