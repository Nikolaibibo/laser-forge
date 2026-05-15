import type { GeneratorDef, Point, Polyline } from "./types";
import { makeNoise2D } from "../util/noise";
import { makeRng } from "../util/random";

type Params = {
  noiseScale: number;
  stepSizeMm: number;
  lineCount: number;
  maxSteps: number;
  curlFactor: number;
  minSpacingMm: number;
  marginMm: number;
};

const DEFAULTS: Params = {
  noiseScale: 0.008,
  stepSizeMm: 0.6,
  lineCount: 400,
  maxSteps: 400,
  curlFactor: Math.PI * 2,
  minSpacingMm: 1.2,
  marginMm: 10,
};

export const flowField: GeneratorDef<Params> = {
  id: "flow-field",
  name: "Flow Field",
  description:
    "Particles follow a simplex-noise angle field (Tyler Hobbs). Lots of streaming lines, organic motion — signature look for wood engraving.",
  defaults: DEFAULTS,
  schema: {
    noiseScale: { value: DEFAULTS.noiseScale, min: 0.001, max: 0.05, step: 0.001 },
    stepSizeMm: { value: DEFAULTS.stepSizeMm, min: 0.2, max: 3, step: 0.1 },
    lineCount: { value: DEFAULTS.lineCount, min: 50, max: 2000, step: 10 },
    maxSteps: { value: DEFAULTS.maxSteps, min: 50, max: 1500, step: 10 },
    curlFactor: { value: DEFAULTS.curlFactor, min: Math.PI, max: Math.PI * 6, step: 0.1 },
    minSpacingMm: { value: DEFAULTS.minSpacingMm, min: 0.3, max: 5, step: 0.1 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
  },
  generate: (p, seed, canvas) => {
    const rng = makeRng(seed);
    const noise = makeNoise2D(seed + 1);

    // Grid of "claimed" cells. Each line gets an id; a line can enter its own
    // cells freely, but collides with cells claimed by other lines.
    const cell = Math.max(p.minSpacingMm, 0.3);
    const cols = Math.ceil(canvas.wMm / cell);
    const rows = Math.ceil(canvas.hMm / cell);
    const grid = new Int32Array(cols * rows); // 0 = free, else = lineId + 1

    const xMin = p.marginMm;
    const yMin = p.marginMm;
    const xMax = canvas.wMm - p.marginMm;
    const yMax = canvas.hMm - p.marginMm;

    const polylines: Polyline[] = [];

    for (let i = 0; i < p.lineCount; i++) {
      const lineId = i + 1;
      const start: Point = [
        xMin + rng() * (xMax - xMin),
        yMin + rng() * (yMax - yMin),
      ];
      // Don't start inside another line's territory
      {
        const cx = Math.floor(start[0] / cell);
        const cy = Math.floor(start[1] / cell);
        const idx = cy * cols + cx;
        if (grid[idx] && grid[idx] !== lineId) continue;
      }

      const pts: Point[] = [start];
      let x = start[0];
      let y = start[1];
      for (let s = 0; s < p.maxSteps; s++) {
        const n = noise(x * p.noiseScale, y * p.noiseScale);
        const angle = n * p.curlFactor;
        x += Math.cos(angle) * p.stepSizeMm;
        y += Math.sin(angle) * p.stepSizeMm;
        if (x < xMin || x > xMax || y < yMin || y > yMax) break;
        const cx = Math.floor(x / cell);
        const cy = Math.floor(y / cell);
        const idx = cy * cols + cx;
        const occ = grid[idx];
        if (occ && occ !== lineId) break;
        grid[idx] = lineId;
        pts.push([x, y]);
      }
      if (pts.length > 3) polylines.push({ points: pts, closed: false });
    }

    return { polylines, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
