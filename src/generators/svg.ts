// src/generators/svg.ts — plot a loaded SVG directly. Reads the imported motif
// from the app store and returns it as Artwork, either fit-to-canvas (preserving
// aspect, with margin) or at its original mm size, optionally quarter-rotated.
// Same motif + same params → identical output; seed is unused (no randomness).
import type { GeneratorDef, Point, Polyline } from "./types";
import { fitToCanvas, polylineBounds } from "../util/path";
import { useApp } from "../state/store";

type Params = {
  /** Fit to the page (preserve aspect) vs. keep the SVG's original mm size, centered. */
  fitToPage: boolean;
  /** Margin (mm) when fitting to page. Ignored at original size. */
  marginMm: number;
  /** Quarter-turn rotation applied before fitting/placing. */
  rotation: 0 | 90 | 180 | 270;
};

const DEFAULTS: Params = {
  fitToPage: true,
  marginMm: 10,
  rotation: 0,
};

const ROT: Record<number, (p: Point) => Point> = {
  0: ([x, y]) => [x, y],
  90: ([x, y]) => [-y, x],
  180: ([x, y]) => [-x, -y],
  270: ([x, y]) => [y, -x],
};

/** Procedural fallback used when no motif is loaded (headless tests / render-demo). */
function fallbackGeometry(wMm: number, hMm: number): Polyline[] {
  const cx = wMm / 2;
  const cy = hMm / 2;
  const r = Math.min(wMm, hMm) * 0.3;
  return [
    { points: [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy], [cx, cy - r]], closed: false },
  ];
}

/** Center polylines (around their bounds midpoint) on the canvas at original scale. */
function centerOnCanvas(lines: Polyline[], wMm: number, hMm: number): Polyline[] {
  const b = polylineBounds(lines);
  const dx = wMm / 2 - (b.minX + b.maxX) / 2;
  const dy = hMm / 2 - (b.minY + b.maxY) / 2;
  return lines.map((l) => ({
    ...l,
    points: l.points.map(([x, y]): Point => [x + dx, y + dy]),
  }));
}

export const svg: GeneratorDef<Params> = {
  id: "svg",
  name: "Load SVG",
  description:
    "Plot a loaded SVG directly. Load a vpype-flat SVG (lines only) via the Motif panel, then fit it to the page or keep its original mm size. No SVG loaded ⇒ empty page.",
  defaults: DEFAULTS,
  schema: {
    fitToPage: { value: DEFAULTS.fitToPage },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 50, step: 1 },
    rotation: { value: DEFAULTS.rotation, options: [0, 90, 180, 270] },
  },
  generate: (p, _seed, canvas) => {
    const W = canvas.wMm;
    const H = canvas.hMm;
    const motif = useApp.getState().motif;
    const lines = motif && motif.polylines.length > 0 ? motif.polylines : fallbackGeometry(W, H);
    const rot = ROT[p.rotation] ?? ROT[0];
    const rotated = lines.map((l) => ({ ...l, points: l.points.map(rot) }));
    const placed = p.fitToPage
      ? fitToCanvas(rotated, W, H, p.marginMm)
      : centerOnCanvas(rotated, W, H);
    return { polylines: placed, widthMm: W, heightMm: H };
  },
};
