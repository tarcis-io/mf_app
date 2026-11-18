import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NeuralNetworkBackground from "./neural-network-background";

// jsdom does not implement the 2D canvas context. Provide a minimal stub so
// the component's animation loop can run without throwing. Values are not
// asserted — we only verify the component mounts, is accessible, and cleans up.
function stubCanvasContext() {
  const ctx = {
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
});
