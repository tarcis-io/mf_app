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

afterEach(() => {
  cleanup();
});
