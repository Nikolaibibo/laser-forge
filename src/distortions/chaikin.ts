import type { DistortionDef, Point, Polyline } from "../generators/types";

type Params = {
  iterations: number;
  tension: number;
};

const DEFAULTS: Params = {
  iterations: 2,
  tension: 0.25,
};

/**
 * One pass of Chaikin's corner-cutting algorithm.
 * For each edge (a, b): insert two new points at a + t(b-a) and a + (1-t)(b-a).
 * Standard Chaikin uses t = 0.25.
 */
const chaikinPass = (pts: Point[], closed: boolean, t: number): Point[] => {
  if (pts.length < 3) return pts;
  const out: Point[] = [];
  const n = pts.length;
  const end = closed ? n : n - 1;
  if (!closed) out.push(pts[0]);
  for (let i = 0; i < end; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    out.push([a[0] + (b[0] - a[0]) * (1 - t), a[1] + (b[1] - a[1]) * (1 - t)]);
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
};

export const chaikin: DistortionDef<Params> = {
  id: "chaikin",
  name: "Chaikin Smooth",
  description:
    "Rounds corners recursively (corner cutting). A few iterations is enough — 2 is buttery, 4 is silk.",
  defaults: DEFAULTS,
  schema: {
    iterations: { value: DEFAULTS.iterations, min: 1, max: 5, step: 1 },
    tension: { value: DEFAULTS.tension, min: 0.1, max: 0.45, step: 0.01 },
  },
  apply: (art, p) => {
    const polylines: Polyline[] = art.polylines.map((l) => {
      let pts = l.points;
      for (let i = 0; i < p.iterations; i++) pts = chaikinPass(pts, l.closed, p.tension);
      return { closed: l.closed, points: pts };
    });
    return { ...art, polylines };
  },
};
