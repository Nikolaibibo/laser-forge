// src/generators/patternMaker.ts — tile a source motif across the canvas in
// grid / radial / spiral layouts with per-tile rotation, scale, jitter, color.
// Spec: docs/superpowers/specs/2026-06-17-pattern-maker-design.md
// Reads the imported motif from the app store (only impurity — same motif +
// same params + same seed → identical output). With no motif, tiles a built-in
// asterisk so the generator renders immediately on selection.
import type { GeneratorDef, Point, Polyline } from "./types";
import { makeRng, randRange, pick } from "../util/random";
import { polylineBounds } from "../util/path";
import { useApp } from "../state/store";

type Mode = "grid" | "radial" | "spiral";
type SpiralType = "archimedean" | "golden";
type ColorBy = "none" | "index" | "ring" | "random";

type Params = {
  mode: Mode;
  tileScale: number;
  // grid
  cols: number;
  rows: number;
  marginMm: number;
  brickOffset: number;
  // radial
  rings: number;
  perRing: number;
  innerRadiusMm: number;
  ringSpacingMm: number;
  // spiral
  count: number;
  spiralType: SpiralType;
  spacingMm: number;
  angleStepDeg: number;
  scaleFalloff: number;
  // radial + spiral
  faceCenter: boolean;
  // common (seeded)
  rotationStep: number;
  rotationJitter: number;
  scaleJitter: number;
  posJitterMm: number;
  colorBy: ColorBy;
  clipToCanvas: boolean;
};

const DEFAULTS: Params = {
  mode: "grid",
  tileScale: 0.8,
  cols: 6,
  rows: 8,
  marginMm: 12,
  brickOffset: 0,
  rings: 5,
  perRing: 0,
  innerRadiusMm: 10,
  ringSpacingMm: 16,
  count: 120,
  spiralType: "golden",
  spacingMm: 9,
  angleStepDeg: 24,
  scaleFalloff: 0,
  faceCenter: false,
  rotationStep: 0,
  rotationJitter: 0,
  scaleJitter: 0,
  posJitterMm: 0,
  colorBy: "none",
  clipToCanvas: true,
};

/** A 5-color ink palette for colorBy (editorial, plotter-friendly). */
const PALETTE = ["#1a3a52", "#b5544a", "#2f6b3f", "#caa83a", "#5b4a8a"];

/** Built-in fallback motif: 3 lines through the origin = 6-ray asterisk,
 *  already normalized to the unit cell ([-0.5,0.5]). */
const DEFAULT_MOTIF: Polyline[] = [
  { closed: false, points: [[-0.5, 0], [0.5, 0]] },
  { closed: false, points: [[-0.25, -0.433], [0.25, 0.433]] },
  { closed: false, points: [[0.25, -0.433], [-0.25, 0.433]] },
];

/** Center + uniformly scale a motif so its longest extent = 1, centered on origin. */
function normalize(lines: Polyline[]): Polyline[] {
  const b = polylineBounds(lines);
  const w = b.maxX - b.minX || 1;
  const h = b.maxY - b.minY || 1;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const s = 1 / Math.max(w, h);
  return lines.map((l) => ({
    closed: l.closed,
    points: l.points.map(([x, y]): Point => [(x - cx) * s, (y - cy) * s]),
  }));
}

/** Place a normalized motif: scale → rotate (deg) → translate to (cx,cy). */
function place(
  norm: Polyline[],
  cx: number,
  cy: number,
  size: number,
  rotDeg: number,
  stroke?: string,
): Polyline[] {
  const a = (rotDeg * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  return norm.map((l) => ({
    closed: l.closed,
    stroke,
    points: l.points.map(([x, y]): Point => {
      const sx = x * size;
      const sy = y * size;
      return [cx + sx * ca - sy * sa, cy + sx * sa + sy * ca];
    }),
  }));
}

export const patternMaker: GeneratorDef<Params> = {
  id: "pattern-maker",
  name: "Pattern Maker",
  description:
    "Tile a motif (loaded SVG, or a built-in asterisk) across the page. Grid / radial / spiral layouts with per-tile rotation, jitter, scale falloff and multi-color ink. Load an SVG via the Motif panel.",
  defaults: DEFAULTS,
  schema: {
    mode: { value: DEFAULTS.mode, options: ["grid", "radial", "spiral"] },
    tileScale: { value: DEFAULTS.tileScale, min: 0.1, max: 2, step: 0.05 },
    cols: { value: DEFAULTS.cols, min: 1, max: 60, step: 1 },
    rows: { value: DEFAULTS.rows, min: 1, max: 60, step: 1 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
    brickOffset: { value: DEFAULTS.brickOffset, min: 0, max: 1, step: 0.05 },
    rings: { value: DEFAULTS.rings, min: 1, max: 30, step: 1 },
    perRing: { value: DEFAULTS.perRing, min: 0, max: 60, step: 1 },
    innerRadiusMm: { value: DEFAULTS.innerRadiusMm, min: 0, max: 80, step: 1 },
    ringSpacingMm: { value: DEFAULTS.ringSpacingMm, min: 2, max: 60, step: 1 },
    count: { value: DEFAULTS.count, min: 1, max: 1000, step: 1 },
    spiralType: { value: DEFAULTS.spiralType, options: ["golden", "archimedean"] },
    spacingMm: { value: DEFAULTS.spacingMm, min: 1, max: 40, step: 0.5 },
    angleStepDeg: { value: DEFAULTS.angleStepDeg, min: 1, max: 180, step: 1 },
    scaleFalloff: { value: DEFAULTS.scaleFalloff, min: 0, max: 1, step: 0.05 },
    faceCenter: { value: DEFAULTS.faceCenter },
    rotationStep: { value: DEFAULTS.rotationStep, min: 0, max: 90, step: 1 },
    rotationJitter: { value: DEFAULTS.rotationJitter, min: 0, max: 180, step: 1 },
    scaleJitter: { value: DEFAULTS.scaleJitter, min: 0, max: 0.9, step: 0.05 },
    posJitterMm: { value: DEFAULTS.posJitterMm, min: 0, max: 20, step: 0.5 },
    colorBy: { value: DEFAULTS.colorBy, options: ["none", "index", "ring", "random"] },
    clipToCanvas: { value: DEFAULTS.clipToCanvas },
  },
  generate: (p, seed, canvas) => {
    const rng = makeRng(seed);
    const W = canvas.wMm;
    const H = canvas.hMm;
    const src = useApp.getState().motif;
    const norm = normalize(src && src.polylines.length ? src.polylines : DEFAULT_MOTIF);
    const out: Polyline[] = [];

    const colorFor = (i: number, ring: number): string | undefined => {
      if (p.colorBy === "index") return PALETTE[i % PALETTE.length];
      if (p.colorBy === "ring") return PALETTE[ring % PALETTE.length];
      if (p.colorBy === "random") return pick(rng, PALETTE);
      return undefined;
    };

    const pushTile = (
      cx: number,
      cy: number,
      size: number,
      rot: number,
      i: number,
      ring: number,
    ) => {
      // Jitter draws happen only when enabled — keeps "no jitter ⇒ seed-independent".
      const jr = p.rotationJitter > 0 ? randRange(rng, -p.rotationJitter, p.rotationJitter) : 0;
      const js = p.scaleJitter > 0 ? 1 + randRange(rng, -p.scaleJitter, p.scaleJitter) : 1;
      const jx = p.posJitterMm > 0 ? randRange(rng, -p.posJitterMm, p.posJitterMm) : 0;
      const jy = p.posJitterMm > 0 ? randRange(rng, -p.posJitterMm, p.posJitterMm) : 0;
      const stroke = colorFor(i, ring);
      const tile = place(norm, cx + jx, cy + jy, Math.max(0.01, size * js), rot + jr, stroke);
      if (p.clipToCanvas) {
        for (const l of tile) {
          for (const [x, y] of l.points) {
            if (x < 0 || x > W || y < 0 || y > H) return;
          }
        }
      }
      out.push(...tile);
    };

    if (p.mode === "grid") {
      const cols = Math.max(1, Math.floor(p.cols));
      const rows = Math.max(1, Math.floor(p.rows));
      const cellW = (W - 2 * p.marginMm) / cols;
      const cellH = (H - 2 * p.marginMm) / rows;
      const size = Math.min(cellW, cellH) * p.tileScale;
      let i = 0;
      for (let iy = 0; iy < rows; iy++) {
        const stagger = iy % 2 === 1 ? p.brickOffset * cellW : 0;
        for (let ix = 0; ix < cols; ix++) {
          const cx = p.marginMm + (ix + 0.5) * cellW + stagger;
          const cy = p.marginMm + (iy + 0.5) * cellH;
          pushTile(cx, cy, size, p.rotationStep * i, i, iy);
          i++;
        }
      }
    } else if (p.mode === "radial") {
      const cx0 = W / 2;
      const cy0 = H / 2;
      const size = p.ringSpacingMm * p.tileScale;
      const rings = Math.max(1, Math.floor(p.rings));
      let i = 0;
      for (let r = 0; r < rings; r++) {
        const radius = p.innerRadiusMm + r * p.ringSpacingMm;
        const count =
          p.perRing > 0
            ? Math.floor(p.perRing)
            : Math.max(1, Math.floor((2 * Math.PI * radius) / Math.max(1, size)));
        for (let k = 0; k < count; k++) {
          const ang = (2 * Math.PI * k) / count;
          const cx = cx0 + Math.cos(ang) * radius;
          const cy = cy0 + Math.sin(ang) * radius;
          const rot = p.faceCenter ? (ang * 180) / Math.PI + 90 : p.rotationStep * i;
          pushTile(cx, cy, size, rot, i, r);
          i++;
        }
      }
    } else {
      // spiral
      const cx0 = W / 2;
      const cy0 = H / 2;
      const count = Math.max(1, Math.floor(p.count));
      const baseSize = p.spacingMm * p.tileScale;
      const maxR = Math.min(W, H) / 2 || 1;
      const golden = Math.PI * (3 - Math.sqrt(5)); // ≈137.5°
      for (let k = 0; k < count; k++) {
        let ang: number;
        let radius: number;
        if (p.spiralType === "golden") {
          ang = k * golden;
          radius = p.spacingMm * Math.sqrt(k);
        } else {
          ang = (k * p.angleStepDeg * Math.PI) / 180;
          radius = p.innerRadiusMm + (p.spacingMm / (2 * Math.PI)) * ang;
        }
        const cx = cx0 + Math.cos(ang) * radius;
        const cy = cy0 + Math.sin(ang) * radius;
        const falloff =
          p.scaleFalloff > 0
            ? 1 - p.scaleFalloff + p.scaleFalloff * Math.min(1, radius / maxR)
            : 1;
        const rot = p.faceCenter ? (ang * 180) / Math.PI + 90 : p.rotationStep * k;
        pushTile(cx, cy, baseSize * falloff, rot, k, k);
      }
    }

    return { polylines: out, widthMm: W, heightMm: H };
  },
};
