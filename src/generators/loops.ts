// src/generators/loops.ts
import type { GeneratorDef, Point, Polyline } from "./types";
import { makeRng, randInt, randRange, pick } from "../util/random";
import { fitToCanvas } from "../util/path";
import { offsetBand } from "../util/offset";

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
  gridCols: number;
  gridRows: number;
  cellJitter: number;      // 0..1 fraction of cell size
  angleJitterDeg: number;
  runsMin: number;
  runsMax: number;
  runLenMinMm: number;
  runLenMaxMm: number;
  runSpacingMm: number;
  lanes: number;
  laneSpacingMm: number;
  endCaps: boolean;
  numColors: number;
  capSamples: number;
  marginMm: number;
};

const DEFAULTS: Params = {
  gridCols: 3, gridRows: 4, cellJitter: 0.35, angleJitterDeg: 8,
  runsMin: 2, runsMax: 5, runLenMinMm: 60, runLenMaxMm: 150,
  runSpacingMm: 9, lanes: 14, laneSpacingMm: 0.5, endCaps: true, numColors: 2, capSamples: 16, marginMm: 15,
};

export const loops: GeneratorDef<Params> = {
  id: "loops",
  name: "Loops",
  description:
    "Serpentine ribbons placed on a jittered grid with angles quantized to {0,45,90,135}° for even coverage and an orthogonal woven plaid look.",
  defaults: DEFAULTS,
  schema: {
    gridCols: { value: DEFAULTS.gridCols, min: 1, max: 8, step: 1 },
    gridRows: { value: DEFAULTS.gridRows, min: 1, max: 8, step: 1 },
    cellJitter: { value: DEFAULTS.cellJitter, min: 0, max: 1, step: 0.05 },
    angleJitterDeg: { value: DEFAULTS.angleJitterDeg, min: 0, max: 45, step: 1 },
    runsMin: { value: DEFAULTS.runsMin, min: 2, max: 12, step: 1 },
    runsMax: { value: DEFAULTS.runsMax, min: 2, max: 12, step: 1 },
    runLenMinMm: { value: DEFAULTS.runLenMinMm, min: 10, max: 250, step: 1 },
    runLenMaxMm: { value: DEFAULTS.runLenMaxMm, min: 10, max: 250, step: 1 },
    runSpacingMm: { value: DEFAULTS.runSpacingMm, min: 2, max: 30, step: 0.5 },
    lanes: { value: DEFAULTS.lanes, min: 2, max: 30, step: 1 },
    laneSpacingMm: { value: DEFAULTS.laneSpacingMm, min: 0.2, max: 3, step: 0.1 },
    endCaps: { value: DEFAULTS.endCaps },
    numColors: { value: DEFAULTS.numColors, min: 1, max: 3, step: 1 },
    capSamples: { value: DEFAULTS.capSamples, min: 4, max: 32, step: 1 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
  },
  generate: (p, seed, canvas) => {
    const rng = makeRng(seed);
    const lanesK = Math.max(2, Math.floor(p.lanes));
    const runsLo = Math.min(p.runsMin, p.runsMax);
    const runsHi = Math.max(p.runsMin, p.runsMax);
    const lenLo = Math.min(p.runLenMinMm, p.runLenMaxMm);
    const lenHi = Math.max(p.runLenMinMm, p.runLenMaxMm);
    const numColors = Math.max(1, Math.min(PALETTE.length, Math.floor(p.numColors)));
    const cols = Math.max(1, Math.floor(p.gridCols));
    const rows = Math.max(1, Math.floor(p.gridRows));
    const cellW = canvas.wMm / cols;
    const cellH = canvas.hMm / rows;
    const angleJitter = (p.angleJitterDeg * Math.PI) / 180;
    const ANGLES = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
    const all: Polyline[] = [];
    let i = 0;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const runs = randInt(rng, runsLo, runsHi);
        const len = randRange(rng, lenLo, lenHi);
        const angle = pick(rng, ANGLES) + randRange(rng, -angleJitter, angleJitter);
        // jittered cell center (target placement)
        const tx = (gx + 0.5) * cellW + randRange(rng, -1, 1) * p.cellJitter * cellW * 0.5;
        const ty = (gy + 0.5) * cellH + randRange(rng, -1, 1) * p.cellJitter * cellH * 0.5;
        const center = serpentineCenterline(runs, len, p.runSpacingMm, p.capSamples);
        const [bx, by] = boundsCenter(center);
        // rotate about the shape's own bbox center, then move that center onto (tx,ty)
        const placed = rotateTranslate(center, angle, bx, by, tx - bx, ty - by);
        const stroke = PALETTE[i % numColors];
        const band = offsetBand(placed, lanesK, p.laneSpacingMm, {
          minInnerRadiusMm: p.laneSpacingMm,
          endCaps: p.endCaps,
          capSamples: p.capSamples,
        });
        for (const lane of band) {
          all.push({ ...lane, stroke });
        }
        i++;
      }
    }
    const fitted = fitToCanvas(all, canvas.wMm, canvas.hMm, p.marginMm);
    return { polylines: fitted, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
