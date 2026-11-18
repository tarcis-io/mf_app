import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NeuralNetworkBackground from "./neural-network-background";

// jsdom does not implement the 2D canvas context. Provide a minimal stub so
// the component's animation loop can run without throwing. Values are not
// asserted — we only verify the component mounts, is accessible, and cleans up.
function stubCanvasContext() {
  const ctx = {
    setTransform: vi.fn(),
    scale: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    globalAlpha: 1,
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  return ctx;
}

// jsdom does not implement `window.matchMedia`, and the component now calls it
// to honor `prefers-reduced-motion`. Install a controllable fake: `matches`
// fixes the initial preference, and the returned handle lets a test flip the
// preference and fire the `change` event the component listens for — so we can
// drive the reduced-motion path deterministically.
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: vi.fn((_: string, cb: (e: MediaQueryListEvent) => void) =>
      listeners.add(cb),
    ),
    removeEventListener: vi.fn(
      (_: string, cb: (e: MediaQueryListEvent) => void) =>
        listeners.delete(cb),
    ),
    // Legacy no-ops for API completeness (the component uses addEventListener).
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  };
  const matchMedia = vi.fn().mockReturnValue(mql);
  vi.stubGlobal("matchMedia", matchMedia);
  return {
    mql,
    /** Flip the preference and notify the component's `change` listener. */
    set(next: boolean) {
      mql.matches = next;
      for (const cb of listeners) {
        cb({ matches: next } as MediaQueryListEvent);
      }
    },
  };
}

describe("NeuralNetworkBackground", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    // Default: motion allowed. Individual tests override via stubMatchMedia.
    stubMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders a decorative canvas hidden from assistive tech", () => {
    stubCanvasContext();
    const { container } = render(<NeuralNetworkBackground />);

    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas).toHaveAttribute("aria-hidden", "true");
  });

  it("starts an animation frame on mount and cancels it on unmount", () => {
    stubCanvasContext();
    const { unmount } = render(<NeuralNetworkBackground />);

    expect(requestAnimationFrame).toHaveBeenCalled();

    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it("does not throw when the canvas context is unavailable", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    expect(() => render(<NeuralNetworkBackground />)).not.toThrow();
  });

  it("resets the transform to identity before scaling on each resize", () => {
    const ctx = stubCanvasContext();
    render(<NeuralNetworkBackground />);

    // Initial layout happens on mount: identity reset, then dpr scale.
    expect(ctx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    const callsAfterMount = ctx.setTransform.mock.calls.length;

    // A window resize re-runs layout. The transform must be reset again (so the
    // dpr factor never compounds across resizes), without throwing.
    expect(() => window.dispatchEvent(new Event("resize"))).not.toThrow();

    expect(ctx.setTransform.mock.calls.length).toBeGreaterThan(callsAfterMount);
    // Every reset is to the identity matrix, never an accumulating transform.
    for (const call of ctx.setTransform.mock.calls) {
      expect(call).toEqual([1, 0, 0, 1, 0, 0]);
    }
  });

  describe("prefers-reduced-motion", () => {
    it("does not start the animation loop when reduced motion is preferred", () => {
      stubMatchMedia(true);
      stubCanvasContext();

      render(<NeuralNetworkBackground />);

      // The rAF loop is the thing that animates; with reduced motion it must
      // never start.
      expect(requestAnimationFrame).not.toHaveBeenCalled();
    });

    it("still paints the network (a static frame) when reduced motion is preferred", () => {
      stubMatchMedia(true);
      const ctx = stubCanvasContext();

      render(<NeuralNetworkBackground />);

      // A frame is still drawn — nodes (arc) and a cleared canvas — so the
      // backdrop isn't blank; it just doesn't move. `arc` is only called from
      // the draw path. (We assert the draw happened, not how many times: on
      // mount `resize()` and the reduced-motion branch each paint once.)
      expect(ctx.clearRect).toHaveBeenCalled();
      expect(ctx.arc).toHaveBeenCalled();
    });

    it("repaints the static frame on resize without starting the loop", () => {
      stubMatchMedia(true);
      const ctx = stubCanvasContext();

      render(<NeuralNetworkBackground />);
      const clearsAfterMount = ctx.clearRect.mock.calls.length;

      // Resizing clears the canvas backing store; in the static state the
      // component must repaint so the backdrop doesn't vanish — and still must
      // not start animating.
      window.dispatchEvent(new Event("resize"));

      expect(ctx.clearRect.mock.calls.length).toBeGreaterThan(clearsAfterMount);
      expect(requestAnimationFrame).not.toHaveBeenCalled();
    });

    it("stops the running animation when the preference flips to reduced", () => {
      const media = stubMatchMedia(false);
      stubCanvasContext();

      render(<NeuralNetworkBackground />);
      // Motion allowed on mount → the loop is running.
      expect(requestAnimationFrame).toHaveBeenCalled();

      // User enables "reduce motion" mid-session.
      media.set(true);

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it("resumes animating when the preference flips back to allowed", () => {
      const media = stubMatchMedia(true);
      stubCanvasContext();

      render(<NeuralNetworkBackground />);
      // Reduced on mount → no loop yet.
      expect(requestAnimationFrame).not.toHaveBeenCalled();

      // User turns "reduce motion" back off.
      media.set(false);

      expect(requestAnimationFrame).toHaveBeenCalled();
    });

    it("removes the media-query listener on unmount", () => {
      const media = stubMatchMedia(false);
      stubCanvasContext();

      const { unmount } = render(<NeuralNetworkBackground />);
      unmount();

      expect(media.mql.removeEventListener).toHaveBeenCalledWith(
        "change",
        expect.any(Function),
      );
    });
  });
});
