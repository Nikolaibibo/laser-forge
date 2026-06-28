// src/generators/ridgeline.ts — stacked scanlines of a height field z=f(x,y)
// with hidden-line removal ("Joy Division" / Unknown Pleasures look).
//
// Each row is a horizontal profile lifted by its field value. Drawn back-to-
// front, a row only shows where it rises above every row already drawn behind
// it (a running per-column max silhouette) — so near ridges occlude far ones.
import type { GeneratorDef, Point, Polyline } from "./types";
import { makeNoise2D } from "../util/noise";
import { fitToCanvas } from "../util/path";

type FieldType = "noise" | "peak" | "waves";

type Params = {
  fieldType: FieldType;
  rows: number; // number of stacked profiles
  samples: number; // horizontal resolution per profile
  amplitude: number; // peak lift as a fraction of total height
  scale: number; // field frequency (noise/waves)
  octaves: number;
  marginMm: number;
};

const DEFAULTS: Params = {
  fieldType: "noise",
  rows: 70,
  samples: 240,
  amplitude: 0.6,
  scale: 2.2,
  octaves: 4,
  marginMm: 14,
};

type Field = (x: number, y: number) => number; // [0,1]² → [0,1]

const buildField = (p: Params, seed: number): Field => {
  if (p.fieldType === "peak") {
    return (x, y) => {
      const r = Math.hypot(x - 0.5, y - 0.5);
      return Math.exp(-(r * r) * (p.scale * 6)); // central gaussian ridge
    };
  }
  if (p.fieldType === "waves") {
    return (x, y) => {
      const a = Math.sin(x * p.scale * 9 + y * 2);
      const b = Math.sin((x + y) * p.scale * 5 + 1.3);
      return 0.5 + (a + b) / 4;
    };
  }
  const n = makeNoise2D(seed);
  const oct = Math.max(1, Math.round(p.octaves));
  return (x, y) => {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < oct; o++) {
      sum += amp * n(x * p.scale * freq, y * p.scale * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return 0.5 + 0.5 * (sum / norm);
  };
};

const doRidgeline = (p: Params, seed: number, W: number, H: number): Polyline[] => {
  const field = buildField(p, seed);
  const rows = Math.max(2, Math.round(p.rows));
  const cols = Math.max(8, Math.round(p.samples));
  // Unit box, y grows downward. A peak of full height (z=1, amplitude=1) lifts
  // GAIN row-gaps so it overlaps and hides several rows behind it.
  const GAIN = 12;
  const rowGap = 1 / rows;
  const lift = (z: number): number => z * p.amplitude * rowGap * GAIN;

  // Hidden-line removal: process NEAR (bottom) → FAR (top). `silhouette[c]` is
  // the highest (min-y) point drawn by nearer rows; a farther row is visible
  // only where it pokes above that envelope.
  const silhouette = new Array<number>(cols + 1).fill(Infinity);
  const out: Polyline[] = [];

  for (let r = rows - 1; r >= 0; r--) {
    const baseY = (r + 0.5) / rows;
    const fy = rows === 1 ? 0 : r / (rows - 1);
    let run: Point[] = [];
    for (let c = 0; c <= cols; c++) {
      const x = c / cols;
      const y = baseY - lift(field(x, fy));
      const visible = y <= silhouette[c] + 1e-9;
      if (y < silhouette[c]) silhouette[c] = y;
      if (visible) {
        run.push([x, y]);
      } else {
        if (run.length >= 2) out.push({ points: run, closed: false });
        run = [];
      }
    }
    if (run.length >= 2) out.push({ points: run, closed: false });
  }

  return fitToCanvas(out, W, H, p.marginMm);
};

export const ridgeline: GeneratorDef<Params> = {
  id: "ridgeline",
  name: "Ridgeline / Joy Division",
  description:
    "Stacked profiles of a height field with hidden-line removal — the Unknown " +
    "Pleasures look. Near ridges occlude far ones. Field: noise, peak, or waves.",
  defaults: DEFAULTS,
  schema: {
    fieldType: { value: DEFAULTS.fieldType, options: ["noise", "peak", "waves"], label: "Feld" },
    rows: { value: DEFAULTS.rows, min: 8, max: 200, step: 1, label: "Linien" },
    samples: { value: DEFAULTS.samples, min: 20, max: 600, step: 10, label: "Auflösung" },
    amplitude: { value: DEFAULTS.amplitude, min: 0.1, max: 2, step: 0.05, label: "Höhe", hint: "Berg-Hub relativ zum Zeilenabstand" },
    scale: { value: DEFAULTS.scale, min: 0.5, max: 8, step: 0.1, label: "Feldgröße" },
    octaves: { value: DEFAULTS.octaves, min: 1, max: 7, step: 1, label: "Oktaven (Noise)", render: (g) => g("Ridgeline / Joy Division.fieldType") === "noise" },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1, label: "Rand (mm)" },
  },
  generate: (p, seed, canvas) => ({
    polylines: doRidgeline(p, seed, canvas.wMm, canvas.hMm),
    widthMm: canvas.wMm,
    heightMm: canvas.hMm,
  }),
};
