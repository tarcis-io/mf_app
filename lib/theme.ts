/**
 * Theme preference: the light/dark selection shown on the Settings page,
 * applied app-wide via a `data-theme` attribute on `<html>` and persisted in
 * `localStorage`.
 *
 * How the pieces fit:
 *   - `globals.css` defines the light palette on `:root`, the dark palette under
 *     `@media (prefers-color-scheme: dark)` (the "System" case — no JS needed),
 *     and explicit `html[data-theme="light"|"dark"]` overrides.
 *   - The init script below runs inline in `<head>` (see `app/layout.tsx`),
 *     before first paint, and applies any stored explicit choice so there's no
 *     flash of the wrong theme.
 *   - The Settings radio (`components/theme-radio.tsx`) reads the current choice
 *     and writes new ones through the helpers here.
 */

/**
 * `localStorage` key for the saved theme. Config keys are namespaced with
 * {@link CONFIG_PREFIX}; this is the first such key.
 */
export const THEME_STORAGE_KEY = "massflowai-theme";

/**
 * Prefix for every persisted client config key (the convention all settings
 * follow). {@link THEME_STORAGE_KEY} is `` `${CONFIG_PREFIX}theme` ``.
 */
export const CONFIG_PREFIX = "massflowai-";

/**
 * The three options the Settings radio offers:
 *   - `"system"` — follow the OS preference (the default; nothing is stored).
 *   - `"light"` / `"dark"` — an explicit override, saved to `localStorage`.
 */
export type ThemeChoice = "system" | "light" | "dark";

/** The concrete palettes a choice can resolve to (what `data-theme` can hold). */
export type ResolvedTheme = "light" | "dark";

/** The explicit (non-system) choices — those that get persisted. */
const EXPLICIT_THEMES: readonly ResolvedTheme[] = ["light", "dark"];

/** Narrow an arbitrary string to an explicit theme (`"light"`/`"dark"`). */
function isExplicitTheme(value: string | null): value is ResolvedTheme {
  return value !== null && (EXPLICIT_THEMES as readonly string[]).includes(value);
}

/**
 * The inline theme-init script, as a string for a `<script>` in `<head>`. It
 * runs before first paint and, for an explicit saved choice, sets
 * `data-theme` on `<html>` so the right palette applies with no flash. For the
 * "System" choice (no stored value) it leaves the attribute off, letting the
 * `prefers-color-scheme` media query in `globals.css` decide — which also tracks
 * live OS changes for free.
 *
 * Kept tiny and dependency-free (it runs before the bundle), wrapped in
 * try/catch because `localStorage` access can throw (private mode, disabled
 * storage) — a theme preference must never break the page load.
 *
 * NOTE: this executes inline, so under the app's strict CSP the `<script>` must
 * be authorized by its SHA-256 hash in `script-src` — see
 * {@link THEME_INIT_SCRIPT_HASH} and `proxy.ts`. (A hash, not a per-request
 * nonce: the pages this renders on are statically prerendered / CDN-cached, and
 * a per-request nonce can't match the nonce baked into cached HTML.)
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (t === "light" || t === "dark") {
      document.documentElement.setAttribute("data-theme", t);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  } catch (e) {}
})();
`.trim();

/**
 * The CSP `script-src` source that authorizes {@link THEME_INIT_SCRIPT} as an
 * inline script: the base64 SHA-256 of the script's exact bytes, in the
 * `'sha256-…'` form the CSP grammar expects.
 *
 * Hardcoded (not computed at runtime) so `proxy.ts` can include it in the CSP
 * synchronously and in any runtime (the proxy runs under Web APIs, not Node).
 * It CANNOT drift from the script: `lib/theme.test.ts` recomputes the hash from
 * `THEME_INIT_SCRIPT` and fails if this constant no longer matches — so editing
 * the script forces updating this value (the test prints the new one).
 */
export const THEME_INIT_SCRIPT_HASH =
  "'sha256-JVbKmlCrMq1h+zB4Kg4rhtAkYYnyW+igFaqTsC2Aw/A='";

/**
 * Read the persisted choice. Returns `"light"`/`"dark"` when an explicit
 * override is stored, else `"system"` (the default — the absence of a stored
 * value *is* the System choice). Safe on the server and when storage throws:
 * returns `"system"`.
 */
export function readThemeChoice(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isExplicitTheme(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

/**
 * Apply a choice: update `<html data-theme>` to match and persist per the rules
 * — an explicit `"light"`/`"dark"` is saved; `"system"` *removes* the key (the
 * default is represented by absence, not a stored `"system"`) and drops the
 * attribute so the media query governs again. Storage errors are swallowed (the
 * attribute still updates, so the current session reflects the choice).
 */
export function applyThemeChoice(choice: ThemeChoice): void {
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    if (choice === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", choice);
    }
  }

  if (typeof window !== "undefined") {
    try {
      if (choice === "system") {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, choice);
      }
    } catch {
      // Persisting is best-effort; the attribute above already reflects the
      // choice for this session.
    }
  }

  // Notify in-page subscribers (e.g. the Settings radio via useSyncExternal
  // store). A same-tab localStorage write fires no `storage` event, so we push
  // the change ourselves.
  notifyThemeSubscribers();
}

// --- Subscription, for `useSyncExternalStore` in the Settings radio. Lets the
// radio reflect the stored choice (including the hydration-safe initial read)
// and react to changes — both its own writes and changes from other tabs. ---

const subscribers = new Set<() => void>();

function notifyThemeSubscribers(): void {
  for (const callback of subscribers) callback();
}

/**
 * Subscribe to theme-choice changes. Invokes `callback` whenever the choice is
 * updated via {@link applyThemeChoice} in this tab, or when `localStorage`
 * changes in another tab (the `storage` event). Returns an unsubscribe
 * function. No-op on the server. Designed for `useSyncExternalStore` paired
 * with {@link readThemeChoice} (snapshot) — avoiding a mount effect that would
 * otherwise set state from a client-only value.
 */
export function subscribeThemeChoice(callback: () => void): () => void {
  subscribers.add(callback);

  const onStorage = (event: StorageEvent) => {
    // Only our key (or a full clear, where `key` is null) is relevant.
    if (event.key === THEME_STORAGE_KEY || event.key === null) callback();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    subscribers.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}
