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

/** Link span rows into continuous boustrophedon (zigzag) point-runs.
 *  Same coordinate frame as `rows`. See header comment for the matching rule. */
export function linkBoustrophedon(rows: ScanRow[]): Point[][] {
  type Chain = { pts: Point[]; lo: number; hi: number };
  const overlaps = (a0: number, a1: number, b0: number, b1: number) =>
    Math.min(a1, b1) >= Math.max(a0, b0);

  let active: Chain[] = [];
  const done: Point[][] = [];

  for (const { y, spans } of rows) {
    const next: Chain[] = [];
    const used = new Set<number>();
    for (const [x0, x1] of spans) {
      const matches: number[] = [];
      active.forEach((c, i) => {
        if (!used.has(i) && overlaps(c.lo, c.hi, x0, x1)) matches.push(i);
      });
      if (matches.length === 1) {
        const c = active[matches[0]];
        used.add(matches[0]);
        const last = c.pts[c.pts.length - 1];
        // Enter at the end nearer the chain's last point, exit at the far end.
        if (Math.abs(last[0] - x0) <= Math.abs(last[0] - x1)) c.pts.push([x0, y], [x1, y]);
        else c.pts.push([x1, y], [x0, y]);
        c.lo = x0; c.hi = x1;
        next.push(c);
      } else {
        // 0 matches (new region) or >1 (merge) → start a fresh chain.
        next.push({ pts: [[x0, y], [x1, y]], lo: x0, hi: x1 });
      }
    }
    // Any previously-active chain not continued this row is finished.
    active.forEach((c, i) => { if (!used.has(i) && !next.includes(c)) done.push(c.pts); });
    active = next;
  }
  for (const c of active) done.push(c.pts);
  return done.filter((p) => p.length >= 2);
}
