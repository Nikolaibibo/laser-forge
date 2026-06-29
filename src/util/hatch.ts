// src/util/hatch.ts — fill a single closed contour with hatch lines.
// scanlineSpans: horizontal even-odd scanlines (hatch direction = x-axis).
// linkBoustrophedon + hatchPolygon are added by later tasks.
import type { Point } from "../generators/types";

export type ScanRow = { y: number; spans: [number, number][] };

/** Horizontal scanlines across one contour using the even-odd rule.
 *  `poly` must already be rotated so the hatch direction is the x-axis.
 *  Rows are spaced `spacingMm` in y, started half a step inside the extent so
 *  we never scan exactly along a horizontal edge. Returns inside intervals. */
export function scanlineSpans(poly: Point[], spacingMm: number): ScanRow[] {
  if (poly.length < 3 || !(spacingMm > 0)) return [];
  let miny = Infinity, maxy = -Infinity;
  for (const [, y] of poly) { if (y < miny) miny = y; if (y > maxy) maxy = y; }
  const M = poly.length;
  const rows: ScanRow[] = [];
  for (let y = miny + spacingMm / 2; y < maxy; y += spacingMm) {
    const xs: number[] = [];
    for (let i = 0; i < M; i++) {
      const [x0, y0] = poly[i];
      const [x1, y1] = poly[(i + 1) % M];
      // Half-open crossing test: counts each crossing once, skips horizontals.
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        const t = (y - y0) / (y1 - y0);
        xs.push(x0 + (x1 - x0) * t);
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    const spans: [number, number][] = [];
    for (let k = 0; k + 1 < xs.length; k += 2) spans.push([xs[k], xs[k + 1]]);
    rows.push({ y, spans });
  }
  return rows;
}
