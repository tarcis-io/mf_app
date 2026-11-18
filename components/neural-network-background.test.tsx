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

describe("NeuralNetworkBackground", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
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
});
