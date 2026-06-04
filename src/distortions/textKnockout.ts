// src/distortions/textKnockout.ts — carve text as negative space into any artwork.
import type { DistortionDef, Point } from "../generators/types";
import { layoutTextStrokes } from "../generators/text";
import type { HersheyFontId } from "../generators/text";
import { occlude } from "../util/occlusion";
import type { OcclItem } from "../util/occlusion";
import { polylineLength } from "../util/path";

type Params = {
  text: string;          // \n for multiple lines, centered on the anchor
  font: HersheyFontId;
  sizeMm: number;        // cap height of the text in mm
  xFrac: number;         // anchor (text center) as fraction of canvas width
  yFrac: number;         // anchor as fraction of canvas height
  clearMm: number;       // carve radius around the text centerline
  rotationDeg: number;   // rotates the text block around its anchor (90 = vertical)
  letterSpacing: number; // extra tracking (font units)
  lineSpacing: number;   // line height multiplier
};

const DEFAULTS: Params = {
  text: "FLOW",
  font: "simplex",
  sizeMm: 36,
  xFrac: 0.5,
  yFrac: 0.5,
  clearMm: 6,
  rotationDeg: 0,
  letterSpacing: 2,
  lineSpacing: 1.5,
};

/** Hershey cap height in font units (see hersheyFutural.ts header). */
const CAP_H = 21;

export const textKnockout: DistortionDef<Params> = {
  id: "text-knockout",
  name: "Text Knockout",
  description:
    "Carves text as negative space into the artwork below: everything within clearMm of the (invisible) text strokes is cut away — pattern background, blank lettering. sizeMm is the cap height, xFrac/yFrac anchor the text center.",
  defaults: DEFAULTS,
  schema: {
    text: { value: DEFAULTS.text },
    font: { value: DEFAULTS.font, options: ["simplex", "cursive"] },
    sizeMm: { value: DEFAULTS.sizeMm, min: 5, max: 150, step: 1 },
    xFrac: { value: DEFAULTS.xFrac, min: 0, max: 1, step: 0.01 },
    yFrac: { value: DEFAULTS.yFrac, min: 0, max: 1, step: 0.01 },
    clearMm: { value: DEFAULTS.clearMm, min: 0.5, max: 20, step: 0.5 },
    rotationDeg: { value: DEFAULTS.rotationDeg, min: -180, max: 180, step: 5 },
    letterSpacing: { value: DEFAULTS.letterSpacing, min: -4, max: 12, step: 0.5 },
    lineSpacing: { value: DEFAULTS.lineSpacing, min: 0.8, max: 3, step: 0.1 },
  },
  apply: (artwork, p) => {
    const strokes = layoutTextStrokes(p.text, p.letterSpacing, p.lineSpacing, p.font);
    if (strokes.length === 0) return artwork;

    // Scale font units → mm (cap height = sizeMm) and center on the anchor.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of strokes) {
      for (const [x, y] of s.points) {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }
    }
    // Clamp so the text never exceeds 90% of the canvas extent along its baseline
    // (after rotation the baseline may run vertically — clamp against that axis).
    const th = (p.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(th), sin = Math.sin(th);
    const textW = Math.max(1, maxX - minX);
    const textH = Math.max(1, maxY - minY);
    const rotW = Math.abs(textW * cos) + Math.abs(textH * sin);
    const rotH = Math.abs(textW * sin) + Math.abs(textH * cos);
    const scale = Math.min(
      p.sizeMm / CAP_H,
      (0.9 * artwork.widthMm) / rotW,
      (0.9 * artwork.heightMm) / rotH,
    );
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const ax = p.xFrac * artwork.widthMm, ay = p.yFrac * artwork.heightMm;
    const place = ([x, y]: Point): Point => {
      const rx = (x - cx) * cos - (y - cy) * sin;
      const ry = (x - cx) * sin + (y - cy) * cos;
      return [rx * scale + ax, ry * scale + ay];
    };

    // Text strokes carve (z=1) but draw nothing (empty lanes); the artwork is one
    // z=0 item whose lanes get cut. Zero new geometry — occlude does the work.
    const items: OcclItem[] = strokes.map((s) => ({
      z: 1,
      centerline: s.points.map(place),
      lanes: [],
      bandHalfMm: 0, // carve radius = bandHalfMm + gapMm = clearMm
    }));
    items.push({ z: 0, centerline: [], lanes: artwork.polylines, bandHalfMm: 0 });

    return {
      ...artwork,
      polylines: occlude(items, { gapMm: p.clearMm, bandHalfMm: 0 })
        // anti-confetti: drop slivers the carve leaves at letter edges
        .filter((l) => polylineLength(l.points) >= 1.5),
    };
  },
};
