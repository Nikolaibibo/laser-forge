// src/generators/voronoiMoire.ts — Voronoi Moiré.
//
// Tessellate the page into Voronoi cells (Lloyd-relaxed for even cells), inset
// each cell to leave a white "grout" gap, then fill it with TWO hatch layers at
// slightly different angles. The angle offset makes the two gratings interfere →
// a moiré shimmer. A spatial density gradient lets colour A dominate one corner
// and colour B the opposite one.
//
// Ported from the standalone Python tool (~/Desktop/Laser/voronoi-plotter):
// shapely is unnecessary here because Voronoi cells are always convex (and an
// inset of a convex polygon stays convex), so a horizontal scanline hits the
// boundary at exactly two points — no general polygon clipper required.
//
// Two pens are expressed as two stroke colours on a single flat Artwork:
// all layer-A polylines first (stroke=colorA), then all layer-B (stroke=colorB),
// so a colour→pen mapping plots each colour as one contiguous pass.
//
// Spacing is defined as a MULTIPLE of pen width (denseCover/lightCover), not in
// absolute mm — the moiré look then holds regardless of which pen is loaded.
import { Delaunay } from "d3-delaunay";
import type { GeneratorDef, Point, Polyline } from "./types";
import { makeRng, type RNG } from "../util/random";

type Gradient = "diag" | "horizontal" | "vertical" | "radial";

type Params = {
  cells: number;
  insetMm: number;
  penWidthMm: number;
  denseCover: number; // spacing at the dense end, ×pen width (≈1 → near-solid)
  lightCover: number; // spacing at the light end, ×pen width (open → moiré)
  angleOffsetDeg: number;
  gradient: Gradient;
  marginMm: number;
  colorA: string;
  colorB: string;
};

const DEFAULTS: Params = {
  cells: 50,
  insetMm: 1.5,
  penWidthMm: 0.4,
  denseCover: 0.9,
  lightCover: 4.0,
  angleOffsetDeg: 7,
  gradient: "diag",
  marginMm: 16,
  colorA: "#2536d4",
  colorB: "#8a2be2",
};

const EPS = 1e-9;

// --------------------------------------------------------------------------- //
// Geometry helpers (all assume convex input — true for Voronoi cells + insets)
// --------------------------------------------------------------------------- //

/** Area-weighted centroid via the shoelace formula. Closing dup not required. */
const centroidOf = (poly: Point[]): Point => {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < EPS) {
    let ax = 0;
    let ay = 0;
    for (const [x, y] of poly) {
      ax += x;
      ay += y;
    }
    return [ax / poly.length, ay / poly.length];
  }
  return [cx / (6 * area), cy / (6 * area)];
};

/** Sutherland–Hodgman clip: keep the polygon part where n·P ≥ c. */
const clipHalfPlane = (poly: Point[], nx: number, ny: number, c: number): Point[] => {
  const out: Point[] = [];
  const N = poly.length;
  for (let i = 0; i < N; i++) {
    const P = poly[i];
    const Q = poly[(i + 1) % N];
    const fp = nx * P[0] + ny * P[1] - c;
    const fq = nx * Q[0] + ny * Q[1] - c;
    const pin = fp >= -EPS;
    const qin = fq >= -EPS;
    if (pin) out.push(P);
    if (pin !== qin) {
      const t = fp / (fp - fq);
      out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
    }
  }
  return out;
};

/** Erode a convex polygon inward by `d` mm (constant-width inset). */
const insetConvex = (poly: Point[], d: number): Point[] => {
  if (d <= 0) return poly;
  const [gx, gy] = centroidOf(poly);
  let cur = poly;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const A = poly[i];
    const B = poly[(i + 1) % n];
    let nx = -(B[1] - A[1]);
    let ny = B[0] - A[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    // Point the normal inward (toward the centroid).
    if (nx * (gx - A[0]) + ny * (gy - A[1]) < 0) {
      nx = -nx;
      ny = -ny;
    }
    // Offset the edge line inward by d, then clip to keep the inside.
    const c = nx * A[0] + ny * A[1] + d;
    cur = clipHalfPlane(cur, nx, ny, c);
    if (cur.length < 3) return [];
  }
  return cur;
};

const rotPt = (x: number, y: number, cx: number, cy: number, ca: number, sa: number): Point => {
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * ca - dy * sa, cy + dx * sa + dy * ca];
};

/**
 * Parallel hatch lines across a convex polygon at `angleDeg`, spaced `spacing`
 * mm, phase-shifted by `phase` ∈ [0,1). Returns line segments [start, end].
 * Rotate the polygon so the hatch is horizontal, run scanlines, rotate back.
 */
const hatch = (poly: Point[], angleDeg: number, spacing: number, phase: number): [Point, Point][] => {
  if (poly.length < 3 || spacing <= 0) return [];
  const [cx, cy] = centroidOf(poly);
  const a = (angleDeg * Math.PI) / 180;
  const caNeg = Math.cos(-a);
  const saNeg = Math.sin(-a);
  const rp = poly.map(([x, y]) => rotPt(x, y, cx, cy, caNeg, saNeg));
  let miny = Infinity;
  let maxy = -Infinity;
  for (const [, y] of rp) {
    if (y < miny) miny = y;
    if (y > maxy) maxy = y;
  }
  const caPos = Math.cos(a);
  const saPos = Math.sin(a);
  const M = rp.length;
  const segs: [Point, Point][] = [];
  let y = miny + (((phase % 1) + 1) % 1) * spacing;
  while (y <= maxy) {
    const xs: number[] = [];
    for (let i = 0; i < M; i++) {
      const [x0, y0] = rp[i];
      const [x1, y1] = rp[(i + 1) % M];
      // Half-open span test avoids counting a shared vertex twice.
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        const t = (y - y0) / (y1 - y0);
        xs.push(x0 + (x1 - x0) * t);
      }
    }
    if (xs.length >= 2) {
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        segs.push([
          rotPt(xs[k], y, cx, cy, caPos, saPos),
          rotPt(xs[k + 1], y, cx, cy, caPos, saPos),
        ]);
      }
    }
    y += spacing;
  }
  return segs;
};

/** Gradient parameter t ∈ [0,1] at a cell centroid (canvas space, y-down). */
const gradientT = (cx: number, cy: number, W: number, H: number, mode: Gradient): number => {
  if (mode === "horizontal") return cx / W;
  if (mode === "vertical") return cy / H;
  if (mode === "radial") {
    const dx = cx - W / 2;
    const dy = cy - H / 2;
    return Math.min(1, Math.hypot(dx, dy) / (0.5 * Math.hypot(W, H)));
  }
  return 0.5 * ((W - cx) / W + (H - cy) / H); // diag
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const samplePoints = (rng: RNG, W: number, H: number, margin: number, count: number): Point[] => {
  const out: Point[] = [];
  const w = W - 2 * margin;
  const h = H - 2 * margin;
  for (let i = 0; i < count; i++) {
    out.push([margin + rng() * w, margin + rng() * h]);
  }
  return out;
};

// --------------------------------------------------------------------------- //
const doMoire = (p: Params, seed: number, W: number, H: number): Polyline[] => {
  const rng = makeRng(seed);
  let pts = samplePoints(rng, W, H, p.marginMm, Math.max(1, Math.floor(p.cells)));
  const bounds: [number, number, number, number] = [
    p.marginMm,
    p.marginMm,
    W - p.marginMm,
    H - p.marginMm,
  ];

  // Lloyd relaxation (2 iterations) → evenly distributed, regular cells.
  for (let iter = 0; iter < 2; iter++) {
    const d = Delaunay.from(pts);
    const v = d.voronoi(bounds);
    const next: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const ring = v.cellPolygon(i);
      if (!ring || ring.length < 4) {
        next.push(pts[i]);
        continue;
      }
      next.push(centroidOf(ring.slice(0, ring.length - 1).map(([x, y]) => [x, y] as Point)));
    }
    pts = next;
  }

  const d = Delaunay.from(pts);
  const v = d.voronoi(bounds);
  const dense = p.denseCover * p.penWidthMm;
  const light = p.lightCover * p.penWidthMm;

  const layerA: Polyline[] = [];
  const layerB: Polyline[] = [];
  for (let i = 0; i < pts.length; i++) {
    const ring = v.cellPolygon(i);
    if (!ring || ring.length < 4) continue;
    const cell: Point[] = ring.slice(0, ring.length - 1).map(([x, y]) => [x, y]);
    const inset = insetConvex(cell, p.insetMm);
    if (inset.length < 3) continue;

    const [cx, cy] = centroidOf(inset);
    const t = gradientT(cx, cy, W, H, p.gradient);
    const rotBase = rng() * 180; // per-cell base orientation keeps it organic
    const phaseA = rng();
    const phaseB = rng();
    // A dense where t→0, B dense where t→1 (opposite corners).
    const spA = lerp(dense, light, t);
    const spB = lerp(light, dense, t);

    for (const [a, b] of hatch(inset, rotBase, spA, phaseA)) {
      layerA.push({ points: [a, b], closed: false, stroke: p.colorA });
    }
    for (const [a, b] of hatch(inset, rotBase + p.angleOffsetDeg, spB, phaseB)) {
      layerB.push({ points: [a, b], closed: false, stroke: p.colorB });
    }
  }
  return [...layerA, ...layerB];
};

export const voronoiMoire: GeneratorDef<Params> = {
  id: "voronoiMoire",
  name: "Voronoi Moiré",
  description:
    "Voronoi cells filled with two hatch layers at offset angles → moiré shimmer. " +
    "A density gradient trades dominance between two pens across the page. " +
    "Line spacing is a multiple of pen width, so the look holds for any pen.",
  defaults: DEFAULTS,
  schema: {
    cells: { value: DEFAULTS.cells, min: 10, max: 200, step: 1, label: "Zellen" },
    insetMm: { value: DEFAULTS.insetMm, min: 0, max: 4, step: 0.1, label: "Fuge (mm)" },
    penWidthMm: {
      value: DEFAULTS.penWidthMm,
      min: 0.1,
      max: 1.2,
      step: 0.05,
      label: "Strichdicke (mm)",
      hint: "Anker — treibt Linienabstände + Preview-Strichbreite",
    },
    denseCover: {
      value: DEFAULTS.denseCover,
      min: 0.6,
      max: 1.2,
      step: 0.05,
      label: "Deckung dicht (×Strich)",
      hint: "Abstand am dichten Ende — ~1 = fast deckend",
    },
    lightCover: {
      value: DEFAULTS.lightCover,
      min: 2,
      max: 8,
      step: 0.1,
      label: "Deckung licht (×Strich)",
      hint: "Abstand am lichten Ende — offene Linien, Moiré",
    },
    angleOffsetDeg: {
      value: DEFAULTS.angleOffsetDeg,
      min: 1,
      max: 30,
      step: 1,
      label: "Winkel-Offset (°)",
      hint: "Moiré-Schlagfrequenz: klein = breite Bänder",
    },
    gradient: {
      value: DEFAULTS.gradient,
      options: ["diag", "horizontal", "vertical", "radial"],
      label: "Verlauf",
    },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1, label: "Rand (mm)" },
    colorA: { value: DEFAULTS.colorA, label: "Farbe A (Stift 1)" },
    colorB: { value: DEFAULTS.colorB, label: "Farbe B (Stift 2)" },
  },
  generate: (p, seed, canvas) => ({
    polylines: doMoire(p, seed, canvas.wMm, canvas.hMm),
    widthMm: canvas.wMm,
    heightMm: canvas.hMm,
  }),
};
