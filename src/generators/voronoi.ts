import { Delaunay } from "d3-delaunay";
import PoissonDiskSampling from "poisson-disk-sampling";
import type { GeneratorDef, Point, Polyline } from "./types";
import { makeRng, type RNG } from "../util/random";

type Mode = "voronoi" | "delaunay" | "truchet";
type Distribution = "uniform" | "poisson";
type TruchetSet = "quarterCircles" | "diagonals" | "lines" | "mixed";

type Params = {
  mode: Mode;
  // voronoi/delaunay
  pointCount: number;
  distribution: Distribution;
  lloydIterations: number;
  // truchet
  gridSize: number;
  tileSet: TruchetSet;
  tileDensity: number;
  marginMm: number;
};

const DEFAULTS: Params = {
  mode: "voronoi",
  pointCount: 220,
  distribution: "poisson",
  lloydIterations: 2,
  gridSize: 20,
  tileSet: "quarterCircles",
  tileDensity: 1.0,
  marginMm: 8,
};

const samplePoints = (
  rng: RNG,
  wMm: number,
  hMm: number,
  marginMm: number,
  count: number,
  dist: Distribution,
): Point[] => {
  const w = wMm - 2 * marginMm;
  const h = hMm - 2 * marginMm;
  if (dist === "poisson") {
    const minDist = Math.sqrt((w * h) / (count * 1.5));
    const pds = new PoissonDiskSampling(
      { shape: [w, h], minDistance: minDist, tries: 20 },
      rng,
    );
    const raw = pds.fill();
    return raw
      .slice(0, count)
      .map((pt: number[]): Point => [pt[0] + marginMm, pt[1] + marginMm]);
  }
  const out: Point[] = [];
  for (let i = 0; i < count; i++) {
    out.push([marginMm + rng() * w, marginMm + rng() * h]);
  }
  return out;
};

const doVoronoi = (p: Params, seed: number, wMm: number, hMm: number): Polyline[] => {
  const rng = makeRng(seed);
  let pts = samplePoints(rng, wMm, hMm, p.marginMm, p.pointCount, p.distribution);
  const bounds: [number, number, number, number] = [
    p.marginMm,
    p.marginMm,
    wMm - p.marginMm,
    hMm - p.marginMm,
  ];
  // Lloyd relaxation
  for (let iter = 0; iter < p.lloydIterations; iter++) {
    const d = Delaunay.from(pts);
    const v = d.voronoi(bounds);
    const next: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const poly = v.cellPolygon(i);
      if (!poly || poly.length < 3) {
        next.push(pts[i]);
        continue;
      }
      // Centroid via Shoelace
      let area = 0;
      let cx = 0;
      let cy = 0;
      for (let j = 0; j < poly.length - 1; j++) {
        const [x0, y0] = poly[j];
        const [x1, y1] = poly[j + 1];
        const cross = x0 * y1 - x1 * y0;
        area += cross;
        cx += (x0 + x1) * cross;
        cy += (y0 + y1) * cross;
      }
      area *= 0.5;
      if (Math.abs(area) < 1e-9) {
        next.push(pts[i]);
      } else {
        next.push([cx / (6 * area), cy / (6 * area)]);
      }
    }
    pts = next;
  }

  const d = Delaunay.from(pts);
  const v = d.voronoi(bounds);
  const out: Polyline[] = [];
  for (let i = 0; i < pts.length; i++) {
    const poly = v.cellPolygon(i);
    if (!poly) continue;
    const points: Point[] = poly.map(([x, y]) => [x, y]);
    if (points.length < 3) continue;
    out.push({ points, closed: true });
  }
  return out;
};

const doDelaunay = (p: Params, seed: number, wMm: number, hMm: number): Polyline[] => {
  const rng = makeRng(seed);
  const pts = samplePoints(rng, wMm, hMm, p.marginMm, p.pointCount, p.distribution);
  const d = Delaunay.from(pts);
  const out: Polyline[] = [];
  const tri = d.triangles;
  for (let i = 0; i < tri.length; i += 3) {
    const a = pts[tri[i]];
    const b = pts[tri[i + 1]];
    const c = pts[tri[i + 2]];
    out.push({ points: [a, b, c], closed: true });
  }
  return out;
};

const doTruchet = (p: Params, seed: number, wMm: number, hMm: number): Polyline[] => {
  const rng = makeRng(seed);
  const innerW = wMm - 2 * p.marginMm;
  const innerH = hMm - 2 * p.marginMm;
  const n = Math.max(2, Math.floor(p.gridSize));
  const cell = Math.min(innerW, innerH) / n;
  const gridW = cell * Math.floor(innerW / cell);
  const gridH = cell * Math.floor(innerH / cell);
  const offsetX = p.marginMm + (innerW - gridW) / 2;
  const offsetY = p.marginMm + (innerH - gridH) / 2;
  const cols = Math.floor(gridW / cell);
  const rows = Math.floor(gridH / cell);

  const out: Polyline[] = [];
  const arcPoints = (cx: number, cy: number, r: number, a0: number, a1: number): Point[] => {
    const steps = 16;
    const pts: Point[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = a0 + (a1 - a0) * (i / steps);
      pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
    }
    return pts;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rng() > p.tileDensity) continue;
      const x = offsetX + c * cell;
      const y = offsetY + r * cell;
      const variant = rng() < 0.5 ? 0 : 1;

      let tileSet: TruchetSet = p.tileSet;
      if (tileSet === "mixed") {
        const setPick = rng();
        tileSet =
          setPick < 0.34 ? "quarterCircles" : setPick < 0.67 ? "diagonals" : "lines";
      }

      if (tileSet === "quarterCircles") {
        if (variant === 0) {
          out.push({ points: arcPoints(x, y, cell / 2, 0, Math.PI / 2), closed: false });
          out.push({
            points: arcPoints(x + cell, y + cell, cell / 2, Math.PI, 1.5 * Math.PI),
            closed: false,
          });
        } else {
          out.push({
            points: arcPoints(x + cell, y, cell / 2, Math.PI / 2, Math.PI),
            closed: false,
          });
          out.push({
            points: arcPoints(x, y + cell, cell / 2, -Math.PI / 2, 0),
            closed: false,
          });
        }
      } else if (tileSet === "diagonals") {
        if (variant === 0) {
          out.push({ points: [[x, y], [x + cell, y + cell]], closed: false });
        } else {
          out.push({ points: [[x + cell, y], [x, y + cell]], closed: false });
        }
      } else if (tileSet === "lines") {
        if (variant === 0) {
          out.push({
            points: [
              [x, y + cell / 2],
              [x + cell, y + cell / 2],
            ],
            closed: false,
          });
        } else {
          out.push({
            points: [
              [x + cell / 2, y],
              [x + cell / 2, y + cell],
            ],
            closed: false,
          });
        }
      }
    }
  }
  return out;
};

export const voronoi: GeneratorDef<Params> = {
  id: "voronoi",
  name: "Voronoi / Delaunay / Truchet",
  description:
    "Tilings and cell structures. Voronoi = organic, Delaunay = triangle mesh, Truchet = modular tileable.",
  defaults: DEFAULTS,
  schema: {
    mode: { value: DEFAULTS.mode, options: ["voronoi", "delaunay", "truchet"] },
    pointCount: { value: DEFAULTS.pointCount, min: 10, max: 2000, step: 5 },
    distribution: { value: DEFAULTS.distribution, options: ["uniform", "poisson"] },
    lloydIterations: { value: DEFAULTS.lloydIterations, min: 0, max: 10, step: 1 },
    gridSize: { value: DEFAULTS.gridSize, min: 4, max: 80, step: 1 },
    tileSet: {
      value: DEFAULTS.tileSet,
      options: ["quarterCircles", "diagonals", "lines", "mixed"],
    },
    tileDensity: { value: DEFAULTS.tileDensity, min: 0.1, max: 1.0, step: 0.01 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
  },
  generate: (p, seed, canvas) => {
    let polylines: Polyline[];
    if (p.mode === "voronoi") polylines = doVoronoi(p, seed, canvas.wMm, canvas.hMm);
    else if (p.mode === "delaunay") polylines = doDelaunay(p, seed, canvas.wMm, canvas.hMm);
    else polylines = doTruchet(p, seed, canvas.wMm, canvas.hMm);
    return { polylines, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
