// src/generators/loops.ts
import type { GeneratorDef, Point, Polyline } from "./types";
import { makeRng, randInt, randRange } from "../util/random";
import { fitToCanvas } from "../util/path";
import { offsetPath, symmetricOffsets } from "../util/offset";

/**
 * Boustrophedon centerline: `runs` parallel straight runs of length `runLengthMm`,
 * stacked in +y at pitch `runSpacingMm`, joined by 180° caps (radius runSpacingMm/2)
 * on alternating sides. First run goes +x along y=0. runs=2 ⇒ capsule/racetrack.
 * Pure geometry (no RNG). One continuous open point list.
 */
export function serpentineCenterline(
  runs: number, runLengthMm: number, runSpacingMm: number, capSamples: number,
): Point[] {
  const L = runLengthMm;
  const rs = runSpacingMm;
  const r = rs / 2;
  const pts: Point[] = [];
  for (let i = 0; i < runs; i++) {
    const y = i * rs;
    const even = i % 2 === 0;
    const startX = even ? 0 : L;
    const endX = even ? L : 0;
    if (i === 0) pts.push([startX, y]);
    pts.push([endX, y]);
    if (i < runs - 1) {
      const cx = endX;            // right side (x=L) after even runs, left (x=0) after odd
      const cy = y + r;
      const a0 = -Math.PI / 2;
      // even: CCW +π sweep (−π/2→+π/2), bulges +x;  odd: CW −π sweep (−π/2→−3π/2), bulges −x
      const a1 = even ? Math.PI / 2 : (-3 * Math.PI) / 2;
      for (let k = 1; k <= capSamples; k++) {
        const t = a0 + ((a1 - a0) * k) / capSamples;
        pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
      }
    }
  }
  return pts;
}

/** Rotate points around pivot (cx,cy) by angleRad, then translate by (tx,ty). Pure. */
export function rotateTranslate(
  pts: Point[], angleRad: number, cx: number, cy: number, tx: number, ty: number,
): Point[] {
  const c = Math.cos(angleRad), s = Math.sin(angleRad);
  return pts.map(([x, y]): Point => {
    const dx = x - cx, dy = y - cy;
    return [cx + dx * c - dy * s + tx, cy + dx * s + dy * c + ty];
  });
}

const PALETTE = ["#4f86e0", "#e0584f", "#5fcaa8"];

/** Center of the bounding box of a point list. */
function boundsCenter(pts: Point[]): [number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

type Params = {
  shapes: number;
  runsMin: number;
  runsMax: number;
  runLenMinMm: number;
  runLenMaxMm: number;
  runSpacingMm: number;
  lanes: number;
  laneSpacingMm: number;
  numColors: number;
  capSamples: number;
  marginMm: number;
};

const DEFAULTS: Params = {
  shapes: 6, runsMin: 2, runsMax: 5, runLenMinMm: 40, runLenMaxMm: 110,
  runSpacingMm: 9, lanes: 14, laneSpacingMm: 0.5, numColors: 2, capSamples: 16, marginMm: 15,
};

export const loops: GeneratorDef<Params> = {
  id: "loops",
  name: "Loops",
  description:
    "Scattered overlapping serpentine ribbons (parallel runs + 180° caps) rendered as dense parallel bands; numColors pens overprint where shapes overlap (1+1=3). Reseed reshuffles placement.",
  defaults: DEFAULTS,
  schema: {
    shapes: { value: DEFAULTS.shapes, min: 1, max: 24, step: 1 },
    runsMin: { value: DEFAULTS.runsMin, min: 2, max: 12, step: 1 },
    runsMax: { value: DEFAULTS.runsMax, min: 2, max: 12, step: 1 },
    runLenMinMm: { value: DEFAULTS.runLenMinMm, min: 10, max: 250, step: 1 },
    runLenMaxMm: { value: DEFAULTS.runLenMaxMm, min: 10, max: 250, step: 1 },
    runSpacingMm: { value: DEFAULTS.runSpacingMm, min: 2, max: 30, step: 0.5 },
    lanes: { value: DEFAULTS.lanes, min: 2, max: 30, step: 1 },
    laneSpacingMm: { value: DEFAULTS.laneSpacingMm, min: 0.2, max: 3, step: 0.1 },
    numColors: { value: DEFAULTS.numColors, min: 1, max: 3, step: 1 },
    capSamples: { value: DEFAULTS.capSamples, min: 4, max: 32, step: 1 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
  },
  generate: (p, seed, canvas) => {
    const rng = makeRng(seed);
    const offsets = symmetricOffsets(p.lanes, p.laneSpacingMm);
    const runsLo = Math.min(p.runsMin, p.runsMax);
    const runsHi = Math.max(p.runsMin, p.runsMax);
    const lenLo = Math.min(p.runLenMinMm, p.runLenMaxMm);
    const lenHi = Math.max(p.runLenMinMm, p.runLenMaxMm);
    const numColors = Math.max(1, Math.min(PALETTE.length, Math.floor(p.numColors)));
    const all: Polyline[] = [];
    for (let i = 0; i < p.shapes; i++) {
      const runs = randInt(rng, runsLo, runsHi);
      const len = randRange(rng, lenLo, lenHi);
      const angle = randRange(rng, 0, Math.PI);
      const tx = randRange(rng, 0, canvas.wMm);
      const ty = randRange(rng, 0, canvas.hMm);
      const center = serpentineCenterline(runs, len, p.runSpacingMm, p.capSamples);
      const [cx, cy] = boundsCenter(center);
      // Note: placed bbox center lands at (cx+tx, cy+ty), not (tx, ty);
      // fitToCanvas normalises the whole artwork afterward, so the offset is harmless.
      const placed = rotateTranslate(center, angle, cx, cy, tx, ty);
      const stroke = PALETTE[i % numColors];
      for (const lane of offsetPath(placed, offsets, { minInnerRadiusMm: p.laneSpacingMm })) {
        all.push({ ...lane, stroke });
      }
    }
    const fitted = fitToCanvas(all, canvas.wMm, canvas.hMm, p.marginMm);
    return { polylines: fitted, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
