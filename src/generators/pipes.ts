// src/generators/pipes.ts
import type { GeneratorDef, Point, Polyline } from "./types";
import { makeRng } from "../util/random";
import { fitToCanvas } from "../util/path";
import { offsetPath, symmetricOffsets } from "../util/offset";
import { mergePaths } from "../util/mergePaths";

type Params = {
  cols: number;
  rows: number;
  lanes: number;
  laneSpacingMm: number;
  straightness: number;   // 0..1 share of cross tiles
  colorFraction: number;  // 0..1 share of colored components
  arcSamples: number;
  marginMm: number;
};

const DEFAULTS: Params = {
  cols: 14, rows: 18, lanes: 6, laneSpacingMm: 0.7,
  straightness: 0.55, colorFraction: 0.35, arcSamples: 14, marginMm: 15,
};

const PALETTE = ["#e0584f", "#4f86e0", "#5fcaa8"];

function sampleArc(cx: number, cy: number, a0: number, a1: number, r: number, n: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return pts;
}

/** Two strokes (open point lists) of a tile. y points down (screen convention). */
function tileStrokes(
  kind: "cross" | "arcA" | "arcB",
  x0: number, y0: number, c: number, arcSamples: number,
): Point[][] {
  const r = c / 2;
  const N: Point = [x0 + r, y0], S: Point = [x0 + r, y0 + c];
  const W: Point = [x0, y0 + r], E: Point = [x0 + c, y0 + r];
  if (kind === "cross") {
    return [[N, S], [W, E]];
  }
  if (kind === "arcA") {
    // N–E around NE corner (a0=π → a1=π/2), S–W around SW corner (a0=0 → a1=−π/2)
    return [
      sampleArc(x0 + c, y0, Math.PI, Math.PI / 2, r, arcSamples),
      sampleArc(x0, y0 + c, 0, -Math.PI / 2, r, arcSamples),
    ];
  }
  // arcB: N–W around NW corner (a0=0 → a1=π/2), S–E around SE corner (a0=π → a1=3π/2)
  return [
    sampleArc(x0, y0, 0, Math.PI / 2, r, arcSamples),
    sampleArc(x0 + c, y0 + c, Math.PI, (3 * Math.PI) / 2, r, arcSamples),
  ];
}

export const pipes: GeneratorDef<Params> = {
  id: "pipes",
  name: "Truchet Pipes",
  description:
    "Tile field of straights + 90° arcs; continuous pipes rendered as dense parallel bands. straightness controls run length; colorFraction colors a share of the pipes. Reseed reshuffles the field.",
  defaults: DEFAULTS,
  schema: {
    cols: { value: DEFAULTS.cols, min: 3, max: 40, step: 1 },
    rows: { value: DEFAULTS.rows, min: 3, max: 40, step: 1 },
    lanes: { value: DEFAULTS.lanes, min: 2, max: 16, step: 1 },
    laneSpacingMm: { value: DEFAULTS.laneSpacingMm, min: 0.3, max: 3, step: 0.1 },
    straightness: { value: DEFAULTS.straightness, min: 0, max: 1, step: 0.05 },
    colorFraction: { value: DEFAULTS.colorFraction, min: 0, max: 1, step: 0.05 },
    arcSamples: { value: DEFAULTS.arcSamples, min: 4, max: 32, step: 1 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
  },
  generate: (p, seed, canvas) => {
    const rng = makeRng(seed);
    const cols = Math.max(2, Math.floor(p.cols));
    const rows = Math.max(2, Math.floor(p.rows));
    const bandHalf = ((p.lanes - 1) * p.laneSpacingMm) / 2;
    const c = Math.max(10, (bandHalf + 2 * p.laneSpacingMm) * 2);

    const strokes: Polyline[] = [];
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const kind = rng() < p.straightness ? "cross" : (rng() < 0.5 ? "arcA" : "arcB");
        for (const pts of tileStrokes(kind, cx * c, cy * c, c, p.arcSamples)) {
          strokes.push({ points: pts, closed: false });
        }
      }
    }

    const components = mergePaths(strokes, 1e-3);

    const offsets = symmetricOffsets(p.lanes, p.laneSpacingMm);
    let colorIdx = 0;
    const all: Polyline[] = [];
    for (const comp of components) {
      const center = comp.closed ? [...comp.points, comp.points[0]] : comp.points;
      const colored = rng() < p.colorFraction;
      const stroke = colored ? PALETTE[colorIdx++ % PALETTE.length] : undefined;
      const band = offsetPath(center, offsets, { minInnerRadiusMm: p.laneSpacingMm });
      for (const lane of band) {
        all.push(stroke ? { ...lane, stroke } : lane);
      }
    }

    const fitted = fitToCanvas(all, canvas.wMm, canvas.hMm, p.marginMm);
    return { polylines: fitted, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
