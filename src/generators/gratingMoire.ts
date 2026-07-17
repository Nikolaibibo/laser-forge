// src/generators/gratingMoire.ts — Grating Moiré (two offset colour panels).
//
// Two full line gratings, each confined to its OWN rectangular panel and drawn
// in its own pen colour. The panels are offset from the page centre in opposite
// directions, so they overlap in the middle and leave pure-colour margins at the
// edges. Where they overlap the two inks interleave and the eye reads a blended
// (e.g. blue+red → purple) band — a physical optical gradient, no transparency.
//
// Grating B is rotated a hair against A (rotation moiré) and given a slightly
// different pitch (magnification moiré); both are referenced to the SHARED page
// centre so the beat pattern stays coherent across the offset. An optional
// sinusoidal warp bows every line, turning the straight beat bands into the
// flowing "draped lens" pattern.
//
// Two pens = two stroke colours on one flat Artwork: all grating-A lines first
// (stroke=colorA), then all grating-B lines (stroke=colorB), so a colour→pen
// mapping plots each panel as one contiguous pass.
//
// Spacing is a MULTIPLE of pen width (pitchCover), so the look holds for any pen.
import type { GeneratorDef, Point, Polyline } from "./types";

type Params = {
  penWidthMm: number;
  pitchCover: number; // grating-A line pitch, ×pen width
  angleBaseDeg: number; // orientation of grating A
  angleOffsetDeg: number; // rotation of grating B → rotation-moiré beat frequency
  pitchRatio: number; // grating-B pitch = A pitch × this (1 = pure rotation moiré)
  offsetXMm: number; // panel separation in x (panels split ±half from centre)
  offsetYMm: number; // panel separation in y
  waveAmpMm: number; // sinusoidal line warp amplitude (0 = straight lines)
  waveLenMm: number; // warp wavelength
  marginMm: number;
  colorA: string;
  colorB: string;
};

const DEFAULTS: Params = {
  penWidthMm: 0.3,
  pitchCover: 3.5,
  angleBaseDeg: 0,
  angleOffsetDeg: 2,
  pitchRatio: 1.05,
  offsetXMm: 24,
  offsetYMm: 14,
  waveAmpMm: 4,
  waveLenMm: 190, // ≈ one smooth drape over a portrait page → single "lens" (short λ → lively chevrons)
  marginMm: 12,
  colorA: "#5b86c9", // soft periwinkle blue
  colorB: "#d76c78", // soft coral red
};

const EPS = 1e-9;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

type Rect = { x0: number; y0: number; x1: number; y1: number };

/**
 * Clip the infinite line through `base` with unit direction `u` to the rectangle
 * (Liang–Barsky). Returns the [tMin, tMax] parameter span, or null if it misses.
 */
const clipSpan = (
  bx: number,
  by: number,
  ux: number,
  uy: number,
  r: Rect,
): [number, number] | null => {
  const p = [-ux, ux, -uy, uy];
  const q = [bx - r.x0, r.x1 - bx, by - r.y0, r.y1 - by];
  let tMin = -Infinity;
  let tMax = Infinity;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < EPS) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > tMin) tMin = t;
      } else if (t < tMax) tMax = t;
    }
  }
  return tMin > tMax ? null : [tMin, tMax];
};

/**
 * One grating clipped to `clip`, indexed from the shared centre (cx,cy). Straight
 * when waveAmp≈0 (2-point lines), else sampled + sine-warped into flowing curves.
 * Warped points are clamped to the page so nothing runs off the sheet.
 */
const grating = (
  clip: Rect,
  page: Rect,
  angleDeg: number,
  pitchMm: number,
  cx: number,
  cy: number,
  waveAmpMm: number,
  waveLenMm: number,
): Point[][] => {
  if (!(pitchMm > 0)) return [];
  const a = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a); // line direction
  const nx = -uy;
  const ny = ux; // offset normal

  // Offset range: project the clip corners (relative to centre) onto the normal.
  let sMin = Infinity;
  let sMax = -Infinity;
  for (const [px, py] of [
    [clip.x0, clip.y0],
    [clip.x1, clip.y0],
    [clip.x1, clip.y1],
    [clip.x0, clip.y1],
  ] as Point[]) {
    const s = (px - cx) * nx + (py - cy) * ny;
    if (s < sMin) sMin = s;
    if (s > sMax) sMax = s;
  }

  const wave = waveAmpMm > EPS && waveLenMm > EPS;
  const k2pi = wave ? (2 * Math.PI) / waveLenMm : 0;
  const step = 3; // mm sampling along a warped line

  const lines: Point[][] = [];
  for (let k = Math.ceil(sMin / pitchMm); k <= Math.floor(sMax / pitchMm); k++) {
    const s = k * pitchMm;
    const bx = cx + s * nx;
    const by = cy + s * ny;
    const span = clipSpan(bx, by, ux, uy, clip);
    if (!span) continue;
    const [t0, t1] = span;

    if (!wave) {
      lines.push([
        [bx + t0 * ux, by + t0 * uy],
        [bx + t1 * ux, by + t1 * uy],
      ]);
      continue;
    }

    const pts: Point[] = [];
    const n = Math.max(1, Math.ceil((t1 - t0) / step));
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      const px = bx + t * ux;
      const py = by + t * uy;
      // Warp perpendicular to the line, phased by position along it → coherent drape.
      const proj = (px - cx) * ux + (py - cy) * uy;
      const d = waveAmpMm * Math.sin(k2pi * proj);
      pts.push([clamp(px + d * nx, page.x0, page.x1), clamp(py + d * ny, page.y0, page.y1)]);
    }
    lines.push(pts);
  }
  return lines;
};

const doMoire = (p: Params, _seed: number, W: number, H: number): Polyline[] => {
  const m = p.marginMm;
  const inner: Rect = { x0: m, y0: m, x1: W - m, y1: H - m };
  if (inner.x1 <= inner.x0 || inner.y1 <= inner.y0) return [];
  const page: Rect = { x0: 0, y0: 0, x1: W, y1: H };

  // Panels split the offset ±half and stay on the page.
  const dx = p.offsetXMm / 2;
  const dy = p.offsetYMm / 2;
  const shift = (r: Rect, sx: number, sy: number): Rect => ({
    x0: clamp(r.x0 + sx, 0, W),
    y0: clamp(r.y0 + sy, 0, H),
    x1: clamp(r.x1 + sx, 0, W),
    y1: clamp(r.y1 + sy, 0, H),
  });
  const panelA = shift(inner, -dx, -dy);
  const panelB = shift(inner, dx, dy);

  const cx = W / 2;
  const cy = H / 2;
  const pitchA = Math.max(EPS, p.pitchCover * p.penWidthMm);
  const pitchB = Math.max(EPS, pitchA * p.pitchRatio);

  const layerA = grating(
    panelA,
    page,
    p.angleBaseDeg,
    pitchA,
    cx,
    cy,
    p.waveAmpMm,
    p.waveLenMm,
  ).map((points) => ({ points, closed: false, stroke: p.colorA }));
  const layerB = grating(
    panelB,
    page,
    p.angleBaseDeg + p.angleOffsetDeg,
    pitchB,
    cx,
    cy,
    p.waveAmpMm,
    p.waveLenMm,
  ).map((points) => ({ points, closed: false, stroke: p.colorB }));

  return [...layerA, ...layerB];
};

export const gratingMoire: GeneratorDef<Params> = {
  id: "gratingMoire",
  name: "Gitter-Moiré",
  description:
    "Two offset line-grating panels in two pen colours, overlapping so the inks " +
    "blend to an optical gradient in the middle with pure-colour margins. A small " +
    "angle + pitch difference plus an optional sine warp bend the beat into a " +
    "flowing lens. Spacing is a multiple of pen width, so the look holds for any pen.",
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
      hint: "Linienabstand Gitter A",
    },
    angleBaseDeg: {
      value: DEFAULTS.angleBaseDeg,
      min: 0,
      max: 90,
      step: 1,
      label: "Grundwinkel (°)",
      hint: "0 = waagerechte Linien",
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
      hint: "Vergrößerungsmoiré: 1 = reine Rotation, ≠1 krümmt die Bänder",
    },
    offsetXMm: {
      value: DEFAULTS.offsetXMm,
      min: 0,
      max: 80,
      step: 1,
      label: "Panel-Versatz X (mm)",
      hint: "Seitlicher Abstand der zwei Farb-Panels → reine Farbränder",
    },
    offsetYMm: {
      value: DEFAULTS.offsetYMm,
      min: 0,
      max: 80,
      step: 1,
      label: "Panel-Versatz Y (mm)",
      hint: "Vertikaler Versatz der Panels",
    },
    waveAmpMm: {
      value: DEFAULTS.waveAmpMm,
      min: 0,
      max: 12,
      step: 0.5,
      label: "Wellen-Amplitude (mm)",
      hint: "0 = gerade Linien; >0 = fließendes Linsen-Moiré",
    },
    waveLenMm: {
      value: DEFAULTS.waveLenMm,
      min: 20,
      max: 240,
      step: 5,
      label: "Wellenlänge (mm)",
      hint: "Länge einer Drape-Welle",
      render: (get) => (get("waveAmpMm") as number) > 0,
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
