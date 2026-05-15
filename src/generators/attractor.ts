import type { GeneratorDef, Point, Polyline } from "./types";
import { fitToCanvas } from "../util/path";

type Kind = "clifford" | "dejong" | "peterDeJong" | "svensson";

type Params = {
  kind: Kind;
  a: number;
  b: number;
  c: number;
  d: number;
  iterations: number;
  segmentsPerLine: number;
  skip: number;
  /** Grid-cell size in mm. A trajectory point in an already-visited cell is
   *  skipped AND breaks the current polyline. Higher = sparser, more elegant
   *  and plotter-friendly. 0 = no thinning (raw dense trajectory). */
  cellMm: number;
  marginMm: number;
};

const DEFAULTS: Params = {
  kind: "clifford",
  a: -1.4,
  b: 1.6,
  c: 1.0,
  d: 0.7,
  iterations: 30000,
  segmentsPerLine: 8000,
  skip: 0,
  cellMm: 1.0,
  marginMm: 15,
};

const step = (kind: Kind, x: number, y: number, p: Params): [number, number] => {
  switch (kind) {
    case "clifford":
      return [
        Math.sin(p.a * y) + p.c * Math.cos(p.a * x),
        Math.sin(p.b * x) + p.d * Math.cos(p.b * y),
      ];
    case "dejong":
      return [
        Math.sin(p.a * y) - Math.cos(p.b * x),
        Math.sin(p.c * x) - Math.cos(p.d * y),
      ];
    case "peterDeJong":
      return [
        Math.sin(p.a * y) - Math.cos(p.b * x),
        Math.sin(p.c * x) - Math.cos(p.d * y + 0.5),
      ];
    case "svensson":
      return [
        p.d * Math.sin(p.a * x) - Math.sin(p.b * y),
        p.c * Math.cos(p.a * x) + Math.cos(p.b * y),
      ];
  }
};

export const attractor: GeneratorDef<Params> = {
  id: "attractor",
  name: "Strange Attractor",
  description:
    "Iterative maps (Clifford, De Jong, Svensson). Successive points are connected as a polyline, yielding a chaotic yarn-like weave.",
  defaults: DEFAULTS,
  schema: {
    kind: { value: DEFAULTS.kind, options: ["clifford", "dejong", "peterDeJong", "svensson"] },
    a: { value: DEFAULTS.a, min: -3, max: 3, step: 0.001 },
    b: { value: DEFAULTS.b, min: -3, max: 3, step: 0.001 },
    c: { value: DEFAULTS.c, min: -3, max: 3, step: 0.001 },
    d: { value: DEFAULTS.d, min: -3, max: 3, step: 0.001 },
    iterations: { value: DEFAULTS.iterations, min: 500, max: 200000, step: 500 },
    segmentsPerLine: { value: DEFAULTS.segmentsPerLine, min: 100, max: 200000, step: 100 },
    skip: { value: DEFAULTS.skip, min: 0, max: 5000, step: 10 },
    cellMm: { value: DEFAULTS.cellMm, min: 0, max: 8, step: 0.05 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
  },
  generate: (p, _seed, canvas) => {
    let x = 0.1;
    let y = 0.1;
    // Warm-up so we don't start on the transient approach to the attractor.
    for (let i = 0; i < 200; i++) [x, y] = step(p.kind, x, y, p);

    // Collect raw trajectory.
    const raw: Point[] = [[x, y]];
    for (let i = 0; i < p.iterations; i++) {
      [x, y] = step(p.kind, x, y, p);
      if (!Number.isFinite(x) || !Number.isFinite(y)) break;
      if (i < p.skip) continue;
      raw.push([x, y]);
    }
    if (raw.length < 2) {
      return { polylines: [], widthMm: canvas.wMm, heightMm: canvas.hMm };
    }

    // Bounds of the raw trajectory so we can work in final-mm coordinates.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of raw) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    const srcW = maxX - minX || 1;
    const srcH = maxY - minY || 1;
    const availW = canvas.wMm - 2 * p.marginMm;
    const availH = canvas.hMm - 2 * p.marginMm;
    const fitScale = Math.min(availW / srcW, availH / srcH);

    // Spatial-grid thinning. Each cell is a square in final-mm space.
    // A trajectory point entering an already-visited cell is skipped AND
    // breaks the running polyline (pen-up). This directly controls visual
    // density regardless of trajectory dynamics.
    const useGrid = p.cellMm > 0;
    const cellSrc = p.cellMm / fitScale;
    const cols = useGrid ? Math.max(1, Math.ceil(srcW / cellSrc) + 2) : 0;
    const rows = useGrid ? Math.max(1, Math.ceil(srcH / cellSrc) + 2) : 0;
    const visited = useGrid ? new Uint8Array(cols * rows) : null;
    const cellIdx = (px: number, py: number): number => {
      const cx = Math.floor((px - minX) / cellSrc);
      const cy = Math.floor((py - minY) / cellSrc);
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return -1;
      return cy * cols + cx;
    };

    const lines: Polyline[] = [];
    let current: Point[] = [];
    const flush = () => {
      if (current.length > 1) lines.push({ points: current, closed: false });
      current = [];
    };

    for (const pt of raw) {
      if (visited) {
        const idx = cellIdx(pt[0], pt[1]);
        if (idx < 0 || visited[idx]) {
          flush();
          continue;
        }
        visited[idx] = 1;
      }
      current.push(pt);
      if (current.length >= p.segmentsPerLine) flush();
    }
    flush();

    const fitted = fitToCanvas(lines, canvas.wMm, canvas.hMm, p.marginMm);
    return { polylines: fitted, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
