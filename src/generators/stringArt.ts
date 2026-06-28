// src/generators/stringArt.ts — pure straight chords whose envelope reads as a
// curve. Nothing here is bent; the curvature is emergent.
//
// - timesTable: N points on a circle, connect i → (i·multiplier) mod N. The
//   chord envelope traces a cardioid (×2), nephroid (×3), and higher epicycloids.
//   (The "modular times-table" of Mathologer fame.)
// - star:      a {N/step} star polygon — one closed stroke.
// - mysticRose: every point joined to every other — a dense chord rosette.
import type { GeneratorDef, Point, Polyline } from "./types";
import { fitToCanvas } from "../util/path";

type Mode = "timesTable" | "star" | "mysticRose";

type Params = {
  mode: Mode;
  points: number;
  multiplier: number; // timesTable
  step: number; // star
  marginMm: number;
};

const DEFAULTS: Params = {
  mode: "timesTable",
  points: 200,
  multiplier: 2,
  step: 2,
  marginMm: 12,
};

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

// Points evenly on the unit circle, first at top, going clockwise.
const ring = (n: number): Point[] => {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    pts.push([Math.cos(a), Math.sin(a)]);
  }
  return pts;
};

const doStringArt = (p: Params, W: number, H: number): Polyline[] => {
  const n = Math.max(2, Math.round(p.points));
  const pts = ring(n);
  const lines: Polyline[] = [];

  if (p.mode === "timesTable") {
    for (let i = 0; i < n; i++) {
      const j = Math.round(i * p.multiplier) % n;
      if (j === i) continue;
      lines.push({ points: [pts[i], pts[j]], closed: false });
    }
  } else if (p.mode === "star") {
    // {n/step} star polygon: walk i += step (mod n) until we return to start.
    const step = Math.max(1, Math.round(p.step)) % n || 1;
    const components = gcd(n, step);
    // gcd>1 → the walk closes early into multiple components; draw each.
    for (let start = 0; start < components; start++) {
      const chain: Point[] = [];
      let cur = start;
      do {
        chain.push(pts[cur]);
        cur = (cur + step) % n;
      } while (cur !== start);
      lines.push({ points: chain, closed: true });
    }
  } else {
    // mysticRose: all pairs grows as n²/2 — cap the point count so a full
    // rosette stays plottable (150 pts ≈ 11k chords).
    const m = Math.min(n, 150);
    const rosePts = m === n ? pts : ring(m);
    for (let i = 0; i < m; i++) {
      for (let j = i + 1; j < m; j++) {
        lines.push({ points: [rosePts[i], rosePts[j]], closed: false });
      }
    }
  }
  return fitToCanvas(lines, W, H, p.marginMm);
};

export const stringArt: GeneratorDef<Params> = {
  id: "stringArt",
  name: "String Art / Modular",
  description:
    "Straight chords on a circle whose envelope becomes a curve. Times-table " +
    "(cardioid/nephroid…), star polygons, or a full mystic-rose rosette.",
  defaults: DEFAULTS,
  schema: {
    mode: { value: DEFAULTS.mode, options: ["timesTable", "star", "mysticRose"], label: "Modus" },
    points: { value: DEFAULTS.points, min: 3, max: 720, step: 1, label: "Punkte" },
    multiplier: {
      value: DEFAULTS.multiplier,
      min: 2,
      max: 60,
      step: 0.1,
      label: "Multiplikator",
      hint: "×2 = Kardioide, ×3 = Nephroide … (timesTable)",
      render: (g) => g("String Art / Modular.mode") === "timesTable",
    },
    step: {
      value: DEFAULTS.step,
      min: 1,
      max: 60,
      step: 1,
      label: "Schritt",
      hint: "{n/step} Sternpolygon",
      render: (g) => g("String Art / Modular.mode") === "star",
    },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1, label: "Rand (mm)" },
  },
  generate: (p, _seed, canvas) => ({
    polylines: doStringArt(p, canvas.wMm, canvas.hMm),
    widthMm: canvas.wMm,
    heightMm: canvas.hMm,
  }),
};
