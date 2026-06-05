// src/distortions/rotate.ts — rotate the WHOLE artwork in exact quarter turns.
// Use case: design in landscape, plot on portrait-only hardware — 90/270 swap
// the artwork's width/height so preview, SVG export and G-Code all see the
// rotated document. Exact integer mappings, no trig (bit-stable determinism).
import type { DistortionDef, Point } from "../generators/types";

type Params = {
  angle: 0 | 90 | 180 | 270;
};

const DEFAULTS: Params = {
  angle: 90,
};

export const rotate: DistortionDef<Params> = {
  id: "rotate",
  name: "Rotate Page",
  description:
    "Rotates the entire composition (frame, text, motif — everything) in exact " +
    "quarter turns. 90/270 swap the page's width and height: design landscape, " +
    "plot portrait. Applies to preview, SVG export and G-Code alike.",
  defaults: DEFAULTS,
  schema: {
    angle: { value: DEFAULTS.angle, options: [0, 90, 180, 270] },
  },
  apply: (art, p) => {
    const w = art.widthMm;
    const h = art.heightMm;
    switch (p.angle) {
      case 90: // clockwise: (x,y) → (h−y, x), page becomes h×w
        return {
          widthMm: h,
          heightMm: w,
          polylines: art.polylines.map((l) => ({
            ...l,
            points: l.points.map(([x, y]): Point => [h - y, x]),
          })),
        };
      case 180: // (x,y) → (w−x, h−y), page size unchanged
        return {
          ...art,
          polylines: art.polylines.map((l) => ({
            ...l,
            points: l.points.map(([x, y]): Point => [w - x, h - y]),
          })),
        };
      case 270: // counter-clockwise: (x,y) → (y, w−x), page becomes h×w
        return {
          widthMm: h,
          heightMm: w,
          polylines: art.polylines.map((l) => ({
            ...l,
            points: l.points.map(([x, y]): Point => [y, w - x]),
          })),
        };
      default:
        return art;
    }
  },
};
