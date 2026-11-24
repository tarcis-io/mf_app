"use client";

import { useEffect, useRef } from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const NODE_COUNT = 90;
const LINK_DISTANCE = 160;
// Max per-frame drift (px) on each axis; nodes get a random velocity in
// [-NODE_SPEED, NODE_SPEED]. Kept low so the backdrop stays calm.
const NODE_SPEED = 0.5;

// The node/link hues come from the theme tokens (`--primary`, `--foreground`
// in globals.css) so the backdrop tracks the brand automatically; only the
// opacities — which keep the backdrop faint — live here. Fallbacks match the
// current token values in case the custom properties can't be read.
const NODE_OPACITY = 0.35;
const LINK_OPACITY = 0.08;
const NODE_FALLBACK = "#f97316";
const LINK_FALLBACK = "#000000";

/**
 * A subtle, animated neural-network backdrop: nodes drift slowly and draw a
 * faint line to nearby nodes, implying a living network. Rendered on a full-
 * bleed canvas, kept almost transparent so it never competes with foreground
 * content. Decorative only — not interactive.
 */
export default function NeuralNetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let nodes: Node[] = [];
    let animationFrame = 0;

    // Resolve the theme tokens to concrete colors with the opacities above
    // baked in. Read once on mount; `color-mix` keeps the hue sourced from the
    // CSS custom property while applying our alpha.
    const styles = getComputedStyle(canvas);
    const readToken = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback;
    const nodeHue = readToken("--primary", NODE_FALLBACK);
    const linkHue = readToken("--foreground", LINK_FALLBACK);
    const nodeColor = `color-mix(in srgb, ${nodeHue} ${NODE_OPACITY * 100}%, transparent)`;
    const linkColor = `color-mix(in srgb, ${linkHue} ${LINK_OPACITY * 100}%, transparent)`;

    const createNodes = () => {
      nodes = Array.from({ length: NODE_COUNT }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 2 * NODE_SPEED,
        vy: (Math.random() - 0.5) * 2 * NODE_SPEED,
      }));
    };

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      // `scale` multiplies the current transform; reset to identity first so
      // repeated resizes don't compound the dpr factor (2×, then 4×, …).
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      createNodes();
      // Resizing the backing store (`canvas.width`/`height` above) clears the
      // canvas. While animating, the next `step` repaints immediately; but in
      // the reduced-motion (static) state there is no loop, so repaint here or
      // the canvas would be left blank until the motion preference changes.
      // `animationFrame === 0` means the loop isn't running.
      if (animationFrame === 0) draw();
    };

    // Advance every node one frame: drift, then bounce off / clamp to the edges.
    const advance = () => {
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;

        if (node.x <= 0 || node.x >= width) node.vx *= -1;
        if (node.y <= 0 || node.y >= height) node.vy *= -1;

        node.x = Math.min(Math.max(node.x, 0), width);
        node.y = Math.min(Math.max(node.y, 0), height);
      }
    };

    // Paint the current node/link positions. Split from `advance` so the
    // reduced-motion path can render a single static frame without ever moving
    // the nodes (see below).
    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          // Both indices are in-bounds (loops are bounded by `nodes.length`);
          // the guard is only here to satisfy noUncheckedIndexedAccess.
          if (!a || !b) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < LINK_DISTANCE) {
            ctx.strokeStyle = linkColor;
            ctx.globalAlpha = 1 - distance / LINK_DISTANCE;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      ctx.globalAlpha = 1;
      ctx.fillStyle = nodeColor;
      for (const node of nodes) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = () => {
      advance();
      draw();
      animationFrame = requestAnimationFrame(step);
    };

    // Respect the OS "reduce motion" accessibility preference: users who enable
    // it (often for vestibular/motion sensitivity) should not get a perpetually
    // animating backdrop. When reduced motion is requested we still render the
    // network — a single static frame — but never start the rAF loop. The
    // preference is honored live: toggling it starts or stops the animation
    // without a reload.
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const start = () => {
      // Guard against a double-start (e.g. a `change` event firing while the
      // loop is already running): a leaked frame id would never be cancelled.
      if (animationFrame) return;
      animationFrame = requestAnimationFrame(step);
    };

    const stop = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };

    const applyMotionPreference = () => {
      if (reducedMotion.matches) {
        stop();
        draw(); // hold a static frame
      } else {
        start();
      }
    };

    resize();
    applyMotionPreference();
    window.addEventListener("resize", resize);
    reducedMotion.addEventListener("change", applyMotionPreference);

    return () => {
      stop();
      window.removeEventListener("resize", resize);
      reducedMotion.removeEventListener("change", applyMotionPreference);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
