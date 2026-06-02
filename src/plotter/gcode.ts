import type { Artwork, Polyline } from "../generators/types";

export type PenOpts = {
  feed: number;      // mm/min draw feed
  penUp: string;     // e.g. "M3 S20"
  penDown: string;   // e.g. "M3 S160"
  dwellUp: number;   // s
  dwellDown: number; // s
};

export const DEFAULT_PEN: PenOpts = {
  feed: 4500,
  penUp: "M3 S20",
  penDown: "M3 S160",
  dwellUp: 0.15,
  dwellDown: 0.1,
};

/** Format a number to at most 3 decimal places, no trailing zeros. */
const f = (n: number): string => (Math.round(n * 1000) / 1000).toString();

/** Euclidean distance squared between two points. */
function dist2(ax: number, ay: number, bx: number, by: number): number {
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

/**
 * Nearest-neighbour ordering of polylines.
 * - Filters out polylines with fewer than 2 points.
 * - Copies all point arrays (does not mutate input).
 * - Greedy from (0,0): pick the remaining polyline whose start OR (for open ones)
 *   end is nearest; if the end was nearest, reverse that polyline's points.
 * - Closed polylines are never reversed.
 */
export function orderPolylines(lines: Polyline[]): Polyline[] {
  // Filter to valid polylines; copy points so we don't mutate input
  const remaining: Polyline[] = lines
    .filter((l) => l.points.length >= 2)
    .map((l) => ({ closed: l.closed, points: l.points.map((p) => [p[0], p[1]] as [number, number]) }));

  const result: Polyline[] = [];
  let cx = 0;
  let cy = 0;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    let bestReverse = false;

    for (let i = 0; i < remaining.length; i++) {
      const pl = remaining[i];
      const startPt = pl.points[0];
      const endPt = pl.points[pl.points.length - 1];

      const dStart = dist2(cx, cy, startPt[0], startPt[1]);
      if (dStart < bestDist) {
        bestDist = dStart;
        bestIdx = i;
        bestReverse = false;
      }

      // Only consider reversing open polylines
      if (!pl.closed) {
        const dEnd = dist2(cx, cy, endPt[0], endPt[1]);
        if (dEnd < bestDist) {
          bestDist = dEnd;
          bestIdx = i;
          bestReverse = true;
        }
      }
    }

    const chosen = remaining.splice(bestIdx, 1)[0];
    if (bestReverse) {
      chosen.points.reverse();
    }
    result.push(chosen);

    const last = chosen.points[chosen.points.length - 1];
    cx = last[0];
    cy = last[1];
  }

  return result;
}

/**
 * Convert an Artwork to an array of G-code lines for a GRBL servo pen-plotter.
 * CRITICAL: pen up = M3 S20, pen down = M3 S160. M5 is NEVER emitted.
 */
export function artworkToGcode(art: Artwork, opts: PenOpts = DEFAULT_PEN): string[] {
  const { feed, penUp, penDown, dwellUp, dwellDown } = opts;
  const lines: string[] = [];

  // Header
  lines.push("G21");      // millimeter mode
  lines.push("G90");      // absolute coordinates
  lines.push(penUp);
  lines.push(`G4 P${dwellUp}`);

  const ordered = orderPolylines(art.polylines);

  for (const pl of ordered) {
    const pts = pl.points;
    const [sx, sy] = pts[0];

    // Lift pen, travel to start
    lines.push(penUp);
    lines.push(`G4 P${dwellUp}`);
    lines.push(`G0 X${f(sx)} Y${f(sy)}`);

    // Pen down, dwell
    lines.push(penDown);
    lines.push(`G4 P${dwellDown}`);

    // Draw remaining points
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      lines.push(`G1 X${f(x)} Y${f(y)} F${feed}`);
    }

    // Close the polyline if needed
    if (pl.closed) {
      lines.push(`G1 X${f(sx)} Y${f(sy)} F${feed}`);
    }
  }

  // Footer
  lines.push(penUp);
  lines.push(`G4 P${dwellUp}`);
  lines.push("G0 X0 Y0");

  return lines;
}

/**
 * Compute the axis-aligned bounding box of all points in an artwork.
 * Returns [minX, minY, maxX, maxY].
 */
export function bbox(art: Artwork): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pl of art.polylines) {
    for (const [x, y] of pl.points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  return [minX, minY, maxX, maxY];
}

/**
 * Generate G-code to draw the outline rectangle of a bbox as one continuous pen-down path.
 * Visits corners: (x0,y0) → (x1,y0) → (x1,y1) → (x0,y1) → (x0,y0).
 */
export function outlineGcode(
  box: [number, number, number, number],
  opts: PenOpts = DEFAULT_PEN
): string[] {
  const [x0, y0, x1, y1] = box;
  const { feed, penUp, penDown, dwellUp, dwellDown } = opts;
  const lines: string[] = [];

  // Header
  lines.push("G21");
  lines.push("G90");
  lines.push(penUp);
  lines.push(`G4 P${dwellUp}`);

  // Travel to start corner
  lines.push(`G0 X${f(x0)} Y${f(y0)}`);

  // Pen down
  lines.push(penDown);
  lines.push(`G4 P${dwellDown}`);

  // Draw four sides back to start
  lines.push(`G1 X${f(x1)} Y${f(y0)} F${feed}`);
  lines.push(`G1 X${f(x1)} Y${f(y1)} F${feed}`);
  lines.push(`G1 X${f(x0)} Y${f(y1)} F${feed}`);
  lines.push(`G1 X${f(x0)} Y${f(y0)} F${feed}`);

  // Pen up and return home
  lines.push(penUp);
  lines.push(`G4 P${dwellUp}`);
  lines.push("G0 X0 Y0");

  return lines;
}
