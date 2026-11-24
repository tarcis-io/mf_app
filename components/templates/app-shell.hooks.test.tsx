import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useDrawerDragToClose,
  useDrawerDismissAndLock,
} from "./app-shell.hooks";

// These hooks are also exercised end-to-end through AppShell (see
// app-shell.test.tsx). Here they're driven in isolation via minimal harnesses,
// so the hook-level branches — the drag threshold math, the clamp and gates,
// the scroll-lock/focus-trap mechanics — are pinned to the hooks themselves
// rather than only to the shell that composes them.

/**
 * The drag-to-close gate asks `matchMedia("(min-width: 1024px)")` whether the
 * drawer is a static desktop column (drag disabled) or a slide-over (enabled).
 * jsdom doesn't implement matchMedia, so install a controllable stub.
 */
function setViewport({ desktop }: { desktop: boolean }) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("min-width: 1024px") ? desktop : !desktop,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  );
}

// --- useDrawerDragToClose ---------------------------------------------------

/**
 * Harness binding the drag hook's handlers to a drawer element of a fixed
 * width, with an element inside it to prove a press on content still works.
 * `onClose` is a spy so tests assert when a drag crosses the dismissal
 * threshold.
 */
function DragHarness({
  width,
  onClose,
}: {
  width: number;
  onClose: () => void;
}) {
  const navRef = useRef<HTMLElement>(null);
  const { dragOffset, handlers } = useDrawerDragToClose(navRef, onClose);
  return (
    <nav
      ref={navRef}
      data-testid="drawer"
      // jsdom reports offsetWidth as 0; the threshold math needs a real width.
      style={{ width }}
      data-offset={dragOffset ?? "none"}
      {...handlers}
    >
      <button type="button">Inside</button>
    </nav>
  );
}

function drawer() {
  return screen.getByTestId("drawer");
}

describe("useDrawerDragToClose", () => {
  beforeEach(() => {
    // Default to the slide-over (mobile/narrow) viewport, where drag is active.
    setViewport({ desktop: false });
    if (!HTMLElement.prototype.setPointerCapture) {
      HTMLElement.prototype.setPointerCapture = vi.fn();
      HTMLElement.prototype.releasePointerCapture = vi.fn();
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  /** Give the harness drawer a real measured width (jsdom reports 0). */
  function renderDrag(width = 256, onClose = vi.fn()) {
    render(<DragHarness width={width} onClose={onClose} />);
    const nav = drawer();
    Object.defineProperty(nav, "offsetWidth", {
      value: width,
      configurable: true,
    });
    return { nav, onClose };
  }

  it("closes when dragged left past the one-third threshold", () => {
    const { nav, onClose } = renderDrag(256);

    // 150px of a 256px drawer → past the ~85px (1/3) threshold.
    fireEvent.pointerDown(nav, { isPrimary: true, button: 0, pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(nav, { pointerId: 1, clientX: 50 });
    fireEvent.pointerUp(nav, { pointerId: 1, clientX: 50 });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("snaps back (does not close) when the drag is under the threshold", () => {
    const { nav, onClose } = renderDrag(256);

    // Only 20px → under threshold.
    fireEvent.pointerDown(nav, { isPrimary: true, button: 0, pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(nav, { pointerId: 1, clientX: 180 });
    fireEvent.pointerUp(nav, { pointerId: 1, clientX: 180 });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("reports the live drag offset while dragging and clears it on release", () => {
    const { nav } = renderDrag(256);

    expect(nav.getAttribute("data-offset")).toBe("none");

    fireEvent.pointerDown(nav, { isPrimary: true, button: 0, pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(nav, { pointerId: 1, clientX: 120 });
    // Dragged 80px left → offset is -80 while the gesture is active.
    expect(nav.getAttribute("data-offset")).toBe("-80");

    fireEvent.pointerUp(nav, { pointerId: 1, clientX: 120 });
    // Released → control returns to the class-based transform (offset null).
    expect(nav.getAttribute("data-offset")).toBe("none");
  });

  it("clamps a rightward drag to zero (cannot be pulled past open)", () => {
    const { nav, onClose } = renderDrag(256);

    fireEvent.pointerDown(nav, { isPrimary: true, button: 0, pointerId: 1, clientX: 50 });
    fireEvent.pointerMove(nav, { pointerId: 1, clientX: 200 });
    // Positive delta is clamped to 0, not a positive offset.
    expect(nav.getAttribute("data-offset")).toBe("0");

    fireEvent.pointerUp(nav, { pointerId: 1, clientX: 200 });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores a non-primary button press (e.g. right-click)", () => {
    const { nav, onClose } = renderDrag(256);

    fireEvent.pointerDown(nav, { isPrimary: true, button: 2, pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(nav, { pointerId: 1, clientX: 20 });
    fireEvent.pointerUp(nav, { pointerId: 1, clientX: 20 });

    // No drag started, so no offset was ever applied and no close fired.
    expect(nav.getAttribute("data-offset")).toBe("none");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not drag when the drawer is a static desktop column (lg+)", () => {
    setViewport({ desktop: true });
    const { nav, onClose } = renderDrag(256);

    fireEvent.pointerDown(nav, { isPrimary: true, button: 0, pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(nav, { pointerId: 1, clientX: 20 });
    fireEvent.pointerUp(nav, { pointerId: 1, clientX: 20 });

    expect(onClose).not.toHaveBeenCalled();
    expect(nav.getAttribute("data-offset")).toBe("none");
  });

  it("does not close when width is unknown (offsetWidth 0) even on a long drag", () => {
    // Guards the `width > 0` condition: without a measurable width the
    // threshold is meaningless, so a drag must never dismiss.
    const onClose = vi.fn();
    render(<DragHarness width={0} onClose={onClose} />);
    const nav = drawer(); // offsetWidth stays 0 (not overridden)

    fireEvent.pointerDown(nav, { isPrimary: true, button: 0, pointerId: 1, clientX: 300 });
    fireEvent.pointerMove(nav, { pointerId: 1, clientX: 0 });
    fireEvent.pointerUp(nav, { pointerId: 1, clientX: 0 });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("treats a press with no movement as a click (never crosses the threshold)", () => {
    const { nav, onClose } = renderDrag(256);

    fireEvent.pointerDown(nav, { isPrimary: true, button: 0, pointerId: 1, clientX: 200 });
    // No pointermove, then release at the same spot — a tap on a link/button.
    fireEvent.pointerUp(nav, { pointerId: 1, clientX: 200 });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("works without pointer capture support (optional-chained call)", () => {
    // Some DOMs lack setPointerCapture; the hook calls it optionally
    // (`setPointerCapture?.(...)`), so a drag must still function when it's
    // absent. Temporarily stub it to undefined on the prototype (via a cast, so
    // this doesn't depend on the method being typed optional).
    const proto = HTMLElement.prototype as unknown as {
      setPointerCapture?: (id: number) => void;
    };
    const original = proto.setPointerCapture;
    proto.setPointerCapture = undefined;
    try {
      const { nav, onClose } = renderDrag(256);
      fireEvent.pointerDown(nav, { isPrimary: true, button: 0, pointerId: 1, clientX: 200 });
      fireEvent.pointerMove(nav, { pointerId: 1, clientX: 40 });
      fireEvent.pointerUp(nav, { pointerId: 1, clientX: 40 });
      expect(onClose).toHaveBeenCalledOnce();
    } finally {
      proto.setPointerCapture = original;
    }
  });
});

// --- useDrawerDismissAndLock ------------------------------------------------

/**
 * Harness for the dismiss/lock hook: a drawer with focusable items plus an
 * outside button (so focus-restore has somewhere to return to). `open` is a
 * prop so a test can mount opened or toggle it closed.
 */
function LockHarness({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navRef = useRef<HTMLElement>(null);
  useDrawerDismissAndLock(open, navRef, onClose);
  return (
    <div>
      <button type="button" data-testid="outside">
        Outside trigger
      </button>
      <nav ref={navRef} tabIndex={-1} data-testid="drawer">
        <a href="/a">First</a>
        <a href="/b">Middle</a>
        <button type="button">Last</button>
      </nav>
    </div>
  );
}

describe("useDrawerDismissAndLock", () => {
  afterEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = "";
  });

  it("locks body scroll while open and restores it on close", () => {
    const { rerender } = render(<LockHarness open onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<LockHarness open={false} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe("");
  });

  it("does nothing while closed (no scroll lock)", () => {
    render(<LockHarness open={false} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe("");
  });

  it("moves focus into the drawer on open", () => {
    render(<LockHarness open onClose={vi.fn()} />);
    expect(screen.getByTestId("drawer")).toHaveFocus();
  });

  it("restores focus to the previously-focused element on close", () => {
    const { rerender } = render(<LockHarness open={false} onClose={vi.fn()} />);
    // Focus the outside trigger first, as the menu button would be before open.
    const outside = screen.getByTestId("outside");
    outside.focus();
    expect(outside).toHaveFocus();

    rerender(<LockHarness open onClose={vi.fn()} />);
    // Focus moved into the drawer...
    expect(screen.getByTestId("drawer")).toHaveFocus();

    rerender(<LockHarness open={false} onClose={vi.fn()} />);
    // ...and returns to the trigger on close.
    expect(outside).toHaveFocus();
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(<LockHarness open onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose on Escape once closed (listener removed)", () => {
    const onClose = vi.fn();
    const { rerender } = render(<LockHarness open onClose={onClose} />);
    rerender(<LockHarness open={false} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("wraps Tab from the last focusable back to the first", () => {
    render(<LockHarness open onClose={vi.fn()} />);
    const last = screen.getByRole("button", { name: "Last" });
    const first = screen.getByRole("link", { name: "First" });

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();
  });

  it("wraps Shift+Tab from the first focusable to the last", () => {
    render(<LockHarness open onClose={vi.fn()} />);
    const first = screen.getByRole("link", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("treats the drawer container itself as 'before the first' for Shift+Tab", () => {
    render(<LockHarness open onClose={vi.fn()} />);
    // On open, focus is on the drawer container (tabIndex=-1).
    const drawerEl = screen.getByTestId("drawer");
    expect(drawerEl).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();
  });

  it("does not interfere with Tab in the middle of the focusables", () => {
    // Only the boundaries wrap; a Tab from a middle item is left to the browser
    // (the handler must not preventDefault / move focus itself).
    render(<LockHarness open onClose={vi.fn()} />);
    const middle = screen.getByRole("link", { name: "Middle" });
    middle.focus();

    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    // Not a boundary → the hook leaves the event alone for native handling.
    expect(event.defaultPrevented).toBe(false);
  });
});
