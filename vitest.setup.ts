// Global test setup, loaded before every test file (see vitest.config.ts).
// Registers jest-dom matchers (toBeInTheDocument, toHaveClass, ...) and
// cleans up the rendered DOM between tests.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom (31.x) doesn't implement <dialog>.showModal()/close(), which the shared
// Dialog (and every feature dialog built on it) relies on. Install a minimal
// polyfill once, globally, instead of repeating it in each dialog test file:
// showModal() reflects the `open` attribute, and close() clears it and fires the
// native `close` event the component listens for. Idempotent, so it's safe even
// if jsdom gains real support later.
const dialogProto = HTMLDialogElement.prototype;
if (!dialogProto.showModal) {
  dialogProto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
}
if (!dialogProto.close) {
  dialogProto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

// jsdom (31.x) ships a real UA stylesheet with `dialog:not([open]) { display:
// none }`, and its focus implementation refuses to focus an element inside a
// `display: none` subtree. The shared `Dialog` sets the `open` attribute from an
// effect (`showModal()`), which runs *after* React has already committed the
// form — so at the moment a field's `autoFocus` fires, the enclosing <dialog>
// still has no `open` attribute and is computed `display: none`, and the focus
// is silently dropped. That makes the dialogs' autofocus assertions (new-batch,
// edit-batch) fail under this jsdom. Neutralize just that one UA rule with an
// author stylesheet (author origin wins over UA), so a dialog's descendants are
// focusable regardless of when the `open` attribute lands. Test-environment
// only (this file is loaded solely by Vitest) and loaded once per file.
const dialogVisibilityOverride = document.createElement("style");
dialogVisibilityOverride.setAttribute("data-test-dialog-visibility", "");
dialogVisibilityOverride.textContent = "dialog:not([open]) { display: block; }";
document.head.appendChild(dialogVisibilityOverride);

afterEach(() => {
  cleanup();
});
