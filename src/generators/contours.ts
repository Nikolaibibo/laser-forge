// src/generators/contours.ts — isolines of a scalar field via marching squares.
//
// Sample a scalar field on a grid, then trace contour lines at evenly spaced
// thresholds → topographic-map look. Distinct from flowField (those are
// streamlines along a vector field; these are level sets of a height field).
// The field is pluggable, so the same engine later drives Chladni nodal lines
// and reaction–diffusion contours — only the field function changes.
//
// Cell segments that share an edge crossing meet at identical coordinates, so a
// light endpoint-stitch turns the marching-squares soup into long continuous
// contour polylines (few pen lifts).
import type { GeneratorDef, Point, Polyline } from "./types";
import { makeNoise2D } from "../util/noise";
import { fitToCanvas } from "../util/path";

type FieldType = "noise" | "ripple" | "waves" | "quasicrystal";

type Params = {
  fieldType: FieldType;
  gridRes: number; // samples along the long axis
  levels: number; // number of contour thresholds
  scale: number; // feature frequency (higher = smaller features)
  octaves: number; // fractal detail (noise only)
  warp: number; // domain-warp amount (noise only)
  symmetry: number; // plane-wave count (quasicrystal only)
  marginMm: number;
};

const DEFAULTS: Params = {
  fieldType: "noise",
  gridRes: 120,
  levels: 14,
  scale: 2.4,
  octaves: 4,
  warp: 0.35,
  symmetry: 5,
  marginMm: 12,
};

type Field = (x: number, y: number) => number; // x,y ∈ [0,1] → value ∈ [0,1]

const buildField = (p: Params, seed: number): Field => {
  if (p.fieldType === "ripple") {
    return (x, y) => {
      const r = Math.hypot(x - 0.5, y - 0.5);
      return 0.5 + 0.5 * Math.sin(r * p.scale * 14);
    };
  }
  if (p.fieldType === "waves") {
    const n = makeNoise2D(seed);
    return (x, y) => {
      // three drifting directional gratings → interference topography
      const a = Math.sin((x + 0.15 * n(x, y)) * p.scale * 9);
      const b = Math.sin((y - 0.15 * n(y, x)) * p.scale * 7 + 1.3);
      const c = Math.sin((x + y) * p.scale * 5 + 2.1);
      return 0.5 + (a + b + c) / 6;
    };
  }
  if (p.fieldType === "quasicrystal") {
    // Sum of N plane waves at evenly spaced angles → N-fold symmetric
    // interference (de Bruijn). Odd N (5,7) gives the classic quasicrystal.
    const waves = Math.max(2, Math.round(p.symmetry));
    const freq = p.scale * 9;
    return (x, y) => {
      let sum = 0;
      for (let k = 0; k < waves; k++) {
        const a = (Math.PI * k) / waves;
        sum += Math.cos(freq * ((x - 0.5) * Math.cos(a) + (y - 0.5) * Math.sin(a)));
      }
      return 0.5 + sum / (2 * waves);
    };
  }
  // fractal simplex noise with optional domain warp
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 9973);
  const oct = Math.max(1, Math.round(p.octaves));
  const fbm = (n: ReturnType<typeof makeNoise2D>, x: number, y: number): number => {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < oct; o++) {
      sum += amp * n(x * freq, y * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm; // [-1,1]
  };
  return (x, y) => {
    const wx = x + p.warp * fbm(n2, x * p.scale + 11, y * p.scale + 7);
    const wy = y + p.warp * fbm(n2, x * p.scale - 5, y * p.scale - 3);
    return 0.5 + 0.5 * fbm(n1, wx * p.scale, wy * p.scale);
  };
};

// Edge → its two grid corners. Corners (clockwise): 0=TL 1=TR 2=BR 3=BL.
const EDGE_CORNERS: [number, number][] = [
  [0, 1], // e0 top
  [1, 2], // e1 right
  [2, 3], // e2 bottom
  [3, 0], // e3 left
];
// Which edge pairs to connect for marching-squares case 0..15 (corner bits
// TL=1,TR=2,BR=4,BL=8). Ambiguous saddles (5,10) emit both segments.
const CASE_EDGES: number[][] = [
  [], [3, 0], [0, 1], [3, 1], [1, 2], [3, 0, 1, 2], [0, 2], [3, 2],
  [2, 3], [2, 0], [0, 1, 2, 3], [2, 1], [1, 3], [1, 0], [0, 3], [],
];

const keyOf = (p: Point): string => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`;

/** Greedily chain segments that share endpoints into long polylines. */
const stitch = (segs: [Point, Point][]): Point[][] => {
  const adj = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const e of [0, 1] as const) {
      const k = keyOf(s[e]);
      (adj.get(k) ?? adj.set(k, []).get(k)!).push(i);
    }
  });
  const used = new Array(segs.length).fill(false);
  const chains: Point[][] = [];
  const grab = (k: string): number => {
    const list = adj.get(k);
    if (!list) return -1;
    for (const i of list) if (!used[i]) return i;
    return -1;
  };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const chain: Point[] = [segs[i][0], segs[i][1]];
    for (;;) {
      const j = grab(keyOf(chain[chain.length - 1]));
      if (j < 0) break;
      used[j] = true;
      const [a, b] = segs[j];
      chain.push(keyOf(a) === keyOf(chain[chain.length - 1]) ? b : a);
    }
    for (;;) {
      const j = grab(keyOf(chain[0]));
      if (j < 0) break;
      used[j] = true;
      const [a, b] = segs[j];
      chain.unshift(keyOf(b) === keyOf(chain[0]) ? a : b);
    }
    chains.push(chain);
  }
  return chains;
};

const doContours = (p: Params, seed: number, W: number, H: number): Polyline[] => {
  const field = buildField(p, seed);
  const long = Math.max(1, Math.round(Math.min(250, p.gridRes)));
  const cols = W >= H ? long : Math.max(2, Math.round((long * W) / H));
  const rows = W >= H ? Math.max(2, Math.round((long * H) / W)) : long;

  // Sample the field once on the (cols+1)×(rows+1) lattice.
  const val: number[][] = [];
  for (let r = 0; r <= rows; r++) {
    const rowArr: number[] = [];
    for (let c = 0; c <= cols; c++) rowArr.push(field(c / cols, r / rows));
    val.push(rowArr);
  }

  const out: Polyline[] = [];
  const nLevels = Math.max(1, Math.round(p.levels));
  for (let li = 1; li <= nLevels; li++) {
    const thr = li / (nLevels + 1); // interior thresholds in (0,1)
    const segs: [Point, Point][] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = [val[r][c], val[r][c + 1], val[r + 1][c + 1], val[r + 1][c]]; // TL TR BR BL
        const idx =
          (v[0] >= thr ? 1 : 0) |
          (v[1] >= thr ? 2 : 0) |
          (v[2] >= thr ? 4 : 0) |
          (v[3] >= thr ? 8 : 0);
        const edges = CASE_EDGES[idx];
        if (edges.length === 0) continue;
        const corner: Point[] = [
          [c, r],
          [c + 1, r],
          [c + 1, r + 1],
          [c, r + 1],
        ];
        const edgePt = (e: number): Point => {
          const [a, b] = EDGE_CORNERS[e];
          const va = v[a];
          const vb = v[b];
          const t = Math.abs(vb - va) < 1e-9 ? 0.5 : (thr - va) / (vb - va);
          return [
            corner[a][0] + (corner[b][0] - corner[a][0]) * t,
            corner[a][1] + (corner[b][1] - corner[a][1]) * t,
          ];
        };
        for (let k = 0; k < edges.length; k += 2) {
          segs.push([edgePt(edges[k]), edgePt(edges[k + 1])]);
        }
      }
    }
    for (const chain of stitch(segs)) {
      if (chain.length >= 2) out.push({ points: chain, closed: false });
    }
  }
  return fitToCanvas(out, W, H, p.marginMm);
};

export const contours: GeneratorDef<Params> = {
  id: "contours",
  name: "Contours / Topographic",
  description:
    "Isolines of a scalar field via marching squares — a topographic-map look. " +
    "Field is noise (fractal terrain), ripple (concentric), or waves (interference).",
  defaults: DEFAULTS,
  schema: {
    fieldType: { value: DEFAULTS.fieldType, options: ["noise", "ripple", "waves", "quasicrystal"], label: "Feld" },
    gridRes: { value: DEFAULTS.gridRes, min: 20, max: 250, step: 5, label: "Auflösung", hint: "höher = glattere Linien, langsamer" },
    levels: { value: DEFAULTS.levels, min: 2, max: 40, step: 1, label: "Höhenlinien" },
    scale: { value: DEFAULTS.scale, min: 0.5, max: 8, step: 0.1, label: "Feldgröße", hint: "höher = kleinere Features" },
    octaves: { value: DEFAULTS.octaves, min: 1, max: 7, step: 1, label: "Oktaven (Noise)", render: (g) => g("Contours / Topographic.fieldType") === "noise" },
    warp: { value: DEFAULTS.warp, min: 0, max: 1, step: 0.05, label: "Domain Warp (Noise)", render: (g) => g("Contours / Topographic.fieldType") === "noise" },
    symmetry: { value: DEFAULTS.symmetry, min: 2, max: 12, step: 1, label: "Symmetrie (Quasikristall)", hint: "Wellen-Anzahl: 5/7 = klassisch", render: (g) => g("Contours / Topographic.fieldType") === "quasicrystal" },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1, label: "Rand (mm)" },
  },
  generate: (p, seed, canvas) => ({
    polylines: doContours(p, seed, canvas.wMm, canvas.hMm),
    widthMm: canvas.wMm,
    heightMm: canvas.hMm,
  }),
};
