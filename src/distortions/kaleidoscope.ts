import type { DistortionDef, Point, Polyline } from "../generators/types";

type Params = {
  segments: number;
  keepOriginal: boolean;
  mirror: boolean;
  center: "canvas" | "bounds";
};

const DEFAULTS: Params = {
  segments: 6,
  keepOriginal: true,
  mirror: false,
  center: "canvas",
};

const rotatePoint = (p: Point, cx: number, cy: number, angle: number): Point => {
  const dx = p[0] - cx;
  const dy = p[1] - cy;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
};

const mirrorPoint = (p: Point, cx: number, cy: number, angle: number): Point => {
  // Reflect across axis at `angle` through (cx, cy)
  const dx = p[0] - cx;
  const dy = p[1] - cy;
  const cos = Math.cos(2 * angle);
  const sin = Math.sin(2 * angle);
  return [cx + dx * cos + dy * sin, cy + dx * sin - dy * cos];
};

export const kaleidoscope: DistortionDef<Params> = {
  id: "kaleidoscope",
  name: "Radial Kaleidoscope",
  description:
    "N-fold rotational copies around the canvas center. Any input becomes a mandala. Mirror toggle alternates reflected segments.",
  defaults: DEFAULTS,
  schema: {
    segments: { value: DEFAULTS.segments, min: 2, max: 24, step: 1 },
    keepOriginal: { value: DEFAULTS.keepOriginal },
    mirror: { value: DEFAULTS.mirror },
    center: { value: DEFAULTS.center, options: ["canvas", "bounds"] },
  },
  apply: (art, p) => {
    let cx = art.widthMm / 2;
    let cy = art.heightMm / 2;
    if (p.center === "bounds") {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const l of art.polylines) {
        for (const [x, y] of l.points) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
      if (isFinite(minX)) {
        cx = (minX + maxX) / 2;
        cy = (minY + maxY) / 2;
      }
    }

    const out: Polyline[] = [];
    const n = Math.max(2, Math.floor(p.segments));
    const start = p.keepOriginal ? 0 : 1;
    for (let i = start; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      const doMirror = p.mirror && i % 2 === 1;
      for (const l of art.polylines) {
        const pts = l.points.map((pt) =>
          doMirror ? mirrorPoint(pt, cx, cy, angle / 2) : rotatePoint(pt, cx, cy, angle),
        );
        out.push({ closed: l.closed, points: pts });
      }
    }
    return { ...art, polylines: out };
  },
};
