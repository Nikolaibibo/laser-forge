// src/generators/layout/kit.ts — shared layout primitives used by the Layout-group
// generators (blueprint, specsheet). Extracted verbatim from blueprint.ts so both
// layouts share one tested implementation. All coords in mm.
import type { Canvas, Point, Polyline } from "../types";
import { layoutTextStrokes, type HersheyFontId } from "../text";
import { fitToCanvas, polylineBounds } from "../../util/path";
import { useApp } from "../../state/store";

export const LETTER_SPACING = 2; // font units — matches the text generator's feel
export const LINE_SPACING = 1.3;
export const CAP_UNITS = 21; // Hershey glyph extent (cap −12 … baseline 9)

export type Block = { lines: Polyline[]; wMm: number; hMm: number };

/**
 * Lay out a text block in mm, local coords: glyph bbox top at y=0, centered on
 * x=0. Empty/whitespace-only text → null. Caps at capMm; if the widest line
 * would exceed maxWMm the block scales down (pass Infinity to disable clamping).
 */
export function textBlock(
  str: string,
  font: HersheyFontId,
  capMm: number,
  maxWMm: number,
  stroke?: string,
): Block | null {
  const t = str.trim();
  if (!t) return null;
  const strokes = layoutTextStrokes(t, LETTER_SPACING, LINE_SPACING, font);
  const raw: Polyline[] = strokes
    .filter((s) => s.points.length >= 2)
    .map((s) => ({ points: s.points, closed: false, stroke }));
  if (raw.length === 0) return null;
  const b = polylineBounds(raw);
  const wUnits = b.maxX - b.minX || 1;
  const hUnits = b.maxY - b.minY || 1;
  let scale = capMm / CAP_UNITS;
  if (wUnits * scale > maxWMm) scale = maxWMm / wUnits;
  const lines = raw.map((l) => ({
    ...l,
    points: l.points.map(([x, y]): Point => [
      (x - (b.minX + b.maxX) / 2) * scale,
      (y - b.minY) * scale,
    ]),
  }));
  return { lines, wMm: wUnits * scale, hMm: hUnits * scale };
}

export const translateLines = (lines: Polyline[], dx: number, dy: number): Polyline[] =>
  lines.map((l) => ({ ...l, points: l.points.map(([x, y]): Point => [x + dx, y + dy]) }));

/**
 * Place the store's motif inside a slot: quarter-turn rotate (no trig, bit-exact),
 * fit to slot.w*motifScale × slot.h*motifScale, center in the slot. No motif →
 * placeholder box + 2 diagonals so the layout stays tunable.
 */
export function placeMotif(
  slot: { x: number; y: number; w: number; h: number },
  motifScale: number,
  rotation: 0 | 90 | 180 | 270,
): Polyline[] {
  const mw = slot.w * motifScale;
  const mh = slot.h * motifScale;
  const mx = slot.x + (slot.w - mw) / 2;
  const my = slot.y + (slot.h - mh) / 2;
  const motif = useApp.getState().motif;
  if (motif && motif.polylines.length > 0) {
    const ROT: Record<number, (pt: Point) => Point> = {
      0: ([x, y]) => [x, y],
      90: ([x, y]) => [-y, x],
      180: ([x, y]) => [-x, -y],
      270: ([x, y]) => [y, -x],
    };
    const rot = ROT[rotation] ?? ROT[0];
    const rotated = motif.polylines.map((l) => ({ ...l, points: l.points.map(rot) }));
    return translateLines(fitToCanvas(rotated, mw, mh, 0), mx, my);
  }
  return [
    { closed: true, points: [[mx, my], [mx + mw, my], [mx + mw, my + mh], [mx, my + mh]] },
    { closed: false, points: [[mx, my], [mx + mw, my + mh]] },
    { closed: false, points: [[mx + mw, my], [mx, my + mh]] },
  ];
}

/**
 * Frame rect (always element [0]) + optional crop-style corner marks (8 segments).
 * Marks live in the inset band: 2mm off the frame, 1–4mm long.
 */
export function drawFrame(
  canvas: Canvas,
  insetMm: number,
  cornerMarks: boolean,
  stroke?: string,
): Polyline[] {
  const fx0 = insetMm;
  const fy0 = insetMm;
  const fx1 = canvas.wMm - insetMm;
  const fy1 = canvas.hMm - insetMm;
  const out: Polyline[] = [
    { closed: true, stroke, points: [[fx0, fy0], [fx1, fy0], [fx1, fy1], [fx0, fy1]] },
  ];
  if (cornerMarks) {
    const o = 2;
    const len = Math.max(1, Math.min(4, insetMm - o - 0.5));
    const corners: [number, number, number, number][] = [
      [fx0, fy0, -1, -1],
      [fx1, fy0, 1, -1],
      [fx1, fy1, 1, 1],
      [fx0, fy1, -1, 1],
    ];
    for (const [x, y, sxn, syn] of corners) {
      out.push({ closed: false, points: [[x + sxn * o, y], [x + sxn * (o + len), y]] });
      out.push({ closed: false, points: [[x, y + syn * o], [x, y + syn * (o + len)]] });
    }
  }
  return out;
}
