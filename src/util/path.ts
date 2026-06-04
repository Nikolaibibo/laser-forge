import type { Point, Polyline } from "../generators/types";

export const dist = (a: Point, b: Point): number => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
};

/** Total length (mm) of a polyline's segments. */
export const polylineLength = (pts: Point[]): number => {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += dist(pts[i], pts[i + 1]);
  return total;
};

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export const polylineBounds = (lines: Polyline[]): Bounds => {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const l of lines) {
    for (const [x, y] of l.points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
};

/**
 * Fit polylines into a target rect with margin, preserving aspect ratio.
 */
export const fitToCanvas = (
  lines: Polyline[],
  wMm: number,
  hMm: number,
  marginMm = 10,
): Polyline[] => {
  const b = polylineBounds(lines);
  const srcW = b.maxX - b.minX || 1;
  const srcH = b.maxY - b.minY || 1;
  const availW = wMm - 2 * marginMm;
  const availH = hMm - 2 * marginMm;
  const scale = Math.min(availW / srcW, availH / srcH);
  const offsetX = marginMm + (availW - srcW * scale) / 2 - b.minX * scale;
  const offsetY = marginMm + (availH - srcH * scale) / 2 - b.minY * scale;
  return lines.map((l) => ({
    closed: l.closed,
    stroke: l.stroke,
    points: l.points.map(([x, y]): Point => [x * scale + offsetX, y * scale + offsetY]),
  }));
};

/**
 * Douglas–Peucker simplification for a single polyline.
 */
export const simplify = (points: Point[], tolerance: number): Point[] => {
  if (points.length <= 2) return points;
  const tol2 = tolerance * tolerance;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    const [sx, sy] = points[s];
    const [ex, ey] = points[e];
    const dx = ex - sx;
    const dy = ey - sy;
    const len2 = dx * dx + dy * dy || 1;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = points[i];
      const t = ((px - sx) * dx + (py - sy) * dy) / len2;
      const cx = sx + t * dx;
      const cy = sy + t * dy;
      const d2 = (px - cx) * (px - cx) + (py - cy) * (py - cy);
      if (d2 > maxD) {
        maxD = d2;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > tol2) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
};
