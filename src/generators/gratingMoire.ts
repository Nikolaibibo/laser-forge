// src/generators/gratingMoire.ts — Grating Moiré (rotated line gratings).
//
// The textbook moiré: two full-page parallel-line gratings drawn on top of each
// other. Grating B is rotated by a small angle relative to A (rotation moiré)
// and/or given a slightly different pitch (magnification moiré). Where the two
// gratings drift in and out of phase the eye reads broad "beat" bands sweeping
// across the page.
//
// Both gratings share the page centre as their reference origin, so the offset
// index s = k·pitch is measured from the middle outward: rotating B keeps the
// beat pattern centred and symmetric instead of pivoting off one corner.
//
// Unlike Voronoi Moiré (a LOCAL shimmer confined inside tessellated cells) this
// is a GLOBAL interference across the whole sheet — the two are complementary.
//
// Two pens = two stroke colours on one flat Artwork: all grating-A lines first
// (stroke=colorA), then all grating-B lines (stroke=colorB), so a colour→pen
// mapping plots each grating as one contiguous pass.
//
// Spacing is a MULTIPLE of pen width (pitchCover), not absolute mm — the moiré
// look then holds regardless of which pen is loaded (same idea as voronoiMoire).
import type { GeneratorDef, Point, Polyline } from "./types";

type Params = {
  penWidthMm: number;
  pitchCover: number; // grating-A line pitch, ×pen width (open enough that lines read individually)
  angleBaseDeg: number; // orientation of grating A
  angleOffsetDeg: number; // rotation of grating B relative to A → beat frequency
  pitchRatio: number; // grating-B pitch = A pitch × this (1 = pure rotation moiré; ≠1 adds magnification)
  marginMm: number;
  colorA: string;
  colorB: string;
};

const DEFAULTS: Params = {
  penWidthMm: 0.4,
  pitchCover: 5,
  angleBaseDeg: 0,
  angleOffsetDeg: 3,
  pitchRatio: 1.05,
  marginMm: 16,
  colorA: "#2536d4",
  colorB: "#d42536",
};

const EPS = 1e-9;

/**
 * Clip the infinite line through `base` with unit direction `u` to the axis-
 * aligned rectangle [x0,y0]–[x1,y1] (Liang–Barsky). Returns the visible segment
 * or null if the line misses the rectangle entirely.
 */
const clipLineToRect = (
  bx: number,
  by: number,
  ux: number,
  uy: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [Point, Point] | null => {
  const p = [-ux, ux, -uy, uy];
  const q = [bx - x0, x1 - bx, by - y0, y1 - by];
  let tMin = -Infinity;
  let tMax = Infinity;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < EPS) {
      if (q[i] < 0) return null; // parallel to this edge and fully outside it
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > tMin) tMin = t;
      } else if (t < tMax) tMax = t;
    }
  }
  if (tMin > tMax) return null;
  return [
    [bx + tMin * ux, by + tMin * uy],
    [bx + tMax * ux, by + tMax * uy],
  ];
};

/**
 * One full-page grating: parallel lines at `angleDeg`, `pitchMm` apart, indexed
 * from the page centre outward, each clipped to the margin rectangle.
 */
const grating = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  angleDeg: number,
  pitchMm: number,
): [Point, Point][] => {
  if (!(pitchMm > 0)) return [];
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const a = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a); // line direction
  const nx = -uy;
  const ny = ux; // unit normal — lines are offset along this axis

  // Signed distance of each corner from the centre, projected onto the normal.
  let sMin = Infinity;
  let sMax = -Infinity;
  for (const [px, py] of [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ] as Point[]) {
    const s = (px - cx) * nx + (py - cy) * ny;
    if (s < sMin) sMin = s;
    if (s > sMax) sMax = s;
  }

  const segs: [Point, Point][] = [];
  const kStart = Math.ceil(sMin / pitchMm);
  const kEnd = Math.floor(sMax / pitchMm);
  for (let k = kStart; k <= kEnd; k++) {
    const s = k * pitchMm;
    const bx = cx + s * nx;
    const by = cy + s * ny;
    const seg = clipLineToRect(bx, by, ux, uy, x0, y0, x1, y1);
    if (seg) segs.push(seg);
  }
  return segs;
};

const doMoire = (p: Params, _seed: number, W: number, H: number): Polyline[] => {
  const x0 = p.marginMm;
  const y0 = p.marginMm;
  const x1 = W - p.marginMm;
  const y1 = H - p.marginMm;
  if (x1 <= x0 || y1 <= y0) return [];

  const pitchA = Math.max(EPS, p.pitchCover * p.penWidthMm);
  const pitchB = Math.max(EPS, pitchA * p.pitchRatio);

  const layerA: Polyline[] = grating(x0, y0, x1, y1, p.angleBaseDeg, pitchA).map(
    ([a, b]) => ({ points: [a, b], closed: false, stroke: p.colorA }),
  );
  const layerB: Polyline[] = grating(
    x0,
    y0,
    x1,
    y1,
    p.angleBaseDeg + p.angleOffsetDeg,
    pitchB,
  ).map(([a, b]) => ({ points: [a, b], closed: false, stroke: p.colorB }));

  return [...layerA, ...layerB];
};

export const gratingMoire: GeneratorDef<Params> = {
  id: "gratingMoire",
  name: "Gitter-Moiré",
  description:
    "Two full-page line gratings, one rotated (and optionally re-pitched) against " +
    "the other → global moiré beat bands sweeping the sheet. Two pens, one per " +
    "grating. Line spacing is a multiple of pen width, so the look holds for any pen.",
  defaults: DEFAULTS,
  schema: {
    penWidthMm: {
      value: DEFAULTS.penWidthMm,
      min: 0.1,
      max: 1.2,
      step: 0.05,
      label: "Strichdicke (mm)",
      hint: "Anker — treibt Linienabstand + Preview-Strichbreite",
    },
    pitchCover: {
      value: DEFAULTS.pitchCover,
      min: 2,
      max: 14,
      step: 0.5,
      label: "Rasterweite (×Strich)",
      hint: "Linienabstand Gitter A — offen genug, dass Einzellinien lesbar sind",
    },
    angleBaseDeg: {
      value: DEFAULTS.angleBaseDeg,
      min: 0,
      max: 90,
      step: 1,
      label: "Grundwinkel (°)",
      hint: "Ausrichtung Gitter A",
    },
    angleOffsetDeg: {
      value: DEFAULTS.angleOffsetDeg,
      min: 0,
      max: 30,
      step: 0.5,
      label: "Winkel-Offset (°)",
      hint: "Rotation Gitter B → Schlagfrequenz: klein = breite Bänder",
    },
    pitchRatio: {
      value: DEFAULTS.pitchRatio,
      min: 0.8,
      max: 1.25,
      step: 0.01,
      label: "Rasterverhältnis B/A",
      hint: "Vergrößerungsmoiré: 1 = reine Rotation, ≠1 mischt Streifen dazu",
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
