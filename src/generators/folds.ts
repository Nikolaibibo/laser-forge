// src/generators/folds.ts
import type { GeneratorDef, Point, Polyline } from "./types";
import { makeNoise2D } from "../util/noise";
import { fitToCanvas, polylineLength, simplify } from "../util/path";
import { mergePaths } from "../util/mergePaths";

type Params = {
  gridU: number;        // points across (columns)
  gridV: number;        // points deep (rows)
  featureSize: number;  // fraction of the extent per noise feature
  amplitude: number;    // relief height (in % of extent)
  facetQuant: number;   // terrace levels; 0 = smooth surface
  azimuthDeg: number;   // rotation of the field around the vertical axis
  elevationDeg: number; // camera height: 0 = edge-on, 90 = top-down
  lines: "both" | "rows" | "cols";
  minSegMm: number;     // drop visible runs shorter than this (anti-confetti)
  marginMm: number;
};

const DEFAULTS: Params = {
  gridU: 56, gridV: 72, featureSize: 0.5, amplitude: 22, facetQuant: 5,
  azimuthDeg: 28, elevationDeg: 38, lines: "rows", minSegMm: 1.5, marginMm: 15,
};

/** Ground extent in working units; fitToCanvas rescales to the page. */
const EXTENT = 100;
/** Horizon raster resolution + sampling step along segments (working units). */
const COL_RES = 0.25;
/** Visibility tolerance: points within eps of the horizon still count as visible. */
const EPS = 0.15;

type Sample = { sx: number; sy: number };
type Seg = { a: Sample; b: Sample; depth: number };

export const folds: GeneratorDef<Params> = {
  id: "folds",
  name: "Folds",
  description:
    "Faceted height field rendered as a tilted grid with floating-horizon hidden-line removal — a paper-relief illusion from line density alone. featureSize sets fold scale, facetQuant the terrace sharpness (0 = smooth), azimuth/elevation the camera. lines picks grid direction (rows = Joy-Division style). Reseed reshapes the relief.",
  defaults: DEFAULTS,
  schema: {
    gridU: { value: DEFAULTS.gridU, min: 12, max: 140, step: 1 },
    gridV: { value: DEFAULTS.gridV, min: 12, max: 180, step: 1 },
    featureSize: { value: DEFAULTS.featureSize, min: 0.1, max: 1.5, step: 0.05 },
    amplitude: { value: DEFAULTS.amplitude, min: 0, max: 60, step: 1 },
    facetQuant: { value: DEFAULTS.facetQuant, min: 0, max: 16, step: 1 },
    azimuthDeg: { value: DEFAULTS.azimuthDeg, min: -60, max: 60, step: 1 },
    elevationDeg: { value: DEFAULTS.elevationDeg, min: 10, max: 85, step: 1 },
    lines: { value: DEFAULTS.lines, options: ["both", "rows", "cols"] },
    minSegMm: { value: DEFAULTS.minSegMm, min: 0, max: 6, step: 0.25 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
  },
  generate: (p, seed, canvas) => {
    const noise = makeNoise2D(seed);
    const nu = Math.max(2, Math.floor(p.gridU));
    const nv = Math.max(2, Math.floor(p.gridV));
    const freq = 1 / Math.max(0.05, p.featureSize);
    const amp = (p.amplitude / 100) * EXTENT;

    // Height field, optionally quantized into facets (sharp terraces = "folds").
    const height = (i: number, j: number): number => {
      let n = noise((i / (nu - 1)) * freq, (j / (nv - 1)) * freq);
      if (p.facetQuant > 0) n = Math.round(n * p.facetQuant) / p.facetQuant;
      return n * amp;
    };

    // Project grid → screen (ortho). Camera in front-above; screen y grows down.
    const az = (p.azimuthDeg * Math.PI) / 180;
    const el = (p.elevationDeg * Math.PI) / 180;
    const ca = Math.cos(az), sa = Math.sin(az);
    const se = Math.sin(el), ce = Math.cos(el);
    const proj: { s: Sample; depth: number }[][] = [];
    for (let i = 0; i < nu; i++) {
      proj.push([]);
      for (let j = 0; j < nv; j++) {
        const x = (i / (nu - 1) - 0.5) * EXTENT;
        const y = (j / (nv - 1) - 0.5) * EXTENT;
        const z = height(i, j);
        const xr = x * ca - y * sa;
        const yr = x * sa + y * ca;
        // Farther (larger yr) and taller rise on screen (smaller sy).
        proj[i].push({ s: { sx: xr, sy: -(yr * se + z * ce) }, depth: yr });
      }
    }

    // Collect unit segments of the requested grid directions.
    const segs: Seg[] = [];
    if (p.lines !== "cols") {
      for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu - 1; i++) {
          const a = proj[i][j], b = proj[i + 1][j];
          segs.push({ a: a.s, b: b.s, depth: (a.depth + b.depth) / 2 });
        }
      }
    }
    if (p.lines !== "rows") {
      for (let i = 0; i < nu; i++) {
        for (let j = 0; j < nv - 1; j++) {
          const a = proj[i][j], b = proj[i][j + 1];
          segs.push({ a: a.s, b: b.s, depth: (a.depth + b.depth) / 2 });
        }
      }
    }

    // Floating horizon: front-to-back; a sample is visible iff it pokes above
    // (screen-up = smaller sy) everything nearer in its column.
    segs.sort((s1, s2) => s1.depth - s2.depth);
    const horizon = new Map<number, number>(); // column index → min sy so far
    const visible: Polyline[] = [];
    for (const seg of segs) {
      const dx = seg.b.sx - seg.a.sx;
      const dy = seg.b.sy - seg.a.sy;
      const len = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(len / COL_RES));
      let run: Point[] = [];
      const flush = () => {
        if (run.length >= 2) visible.push({ closed: false, points: run });
        run = [];
      };
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const sx = seg.a.sx + dx * t;
        const sy = seg.a.sy + dy * t;
        const col = Math.round(sx / COL_RES);
        const hor = horizon.get(col);
        if (hor === undefined || sy < hor + EPS) {
          run.push([sx, sy]);
          if (hor === undefined || sy < hor) horizon.set(col, sy);
        } else {
          flush();
        }
      }
      flush();
    }

    // Re-chain the per-segment visible runs into long polylines, thin them, and
    // drop confetti (grazing-angle horizon flicker produces tiny dashes).
    const chained = mergePaths(visible, 1e-3)
      .map((l) => ({ ...l, points: simplify(l.points, 0.02) }))
      .filter((l) => polylineLength(l.points) >= p.minSegMm);

    const fitted = fitToCanvas(chained, canvas.wMm, canvas.hMm, p.marginMm);
    return { polylines: fitted, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
