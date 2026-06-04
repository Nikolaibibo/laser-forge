// src/util/occlusion.ts
import type { Point, Polyline } from "../generators/types";
import { simplify } from "./path";

/** One pipe: its z-order, centerline (for the hidden-test), and the offset band lanes. */
export type OcclItem = {
  z: number;
  centerline: Point[];
  lanes: Polyline[];
  /** Per-item half band width (mm) — overrides opts.bandHalfMm (variable-width bands). */
  bandHalfMm?: number;
};

export type OccludeOpts = {
  /** Clear gap (mm) carved on each side of the band that passes over. */
  gapMm: number;
  /** Half the band width (mm) = (lanes-1)·spacing/2. Carve radius = bandHalfMm + gapMm. */
  bandHalfMm: number;
  /** Densify step (mm) for the hidden-test along each lane. Default = gap·0.5 (min 0.4). */
  stepMm?: number;
  /** Douglas–Peucker tolerance to re-thin densified visible runs. Default 0.01. */
  simplifyTolMm?: number;
};

/** Squared distance from point p to segment ab. */
function distSqToSeg(p: Point, a: Point, b: Point): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const apx = p[0] - a[0];
  const apy = p[1] - a[1];
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? (apx * abx + apy * aby) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = a[0] + t * abx;
  const cy = a[1] + t * aby;
  const dx = p[0] - cx;
  const dy = p[1] - cy;
  return dx * dx + dy * dy;
}

/** Resample a polyline so no segment exceeds `step` mm (for vertex-level hidden testing). */
function densify(pts: Point[], step: number): Point[] {
  if (pts.length < 2) return pts;
  const out: Point[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push([a[0] + dx * t, a[1] + dy * t]);
    }
  }
  return out;
}

type GridSeg = { a: Point; b: Point; z: number; clear2: number };

/**
 * Z-order occlusion for bands of offset lanes. Each lane of a pipe is split into the
 * sub-polylines that are NOT covered by a pipe with a higher `z`: a point is hidden if it
 * lies within `bandHalfMm + gapMm` of the centerline of any higher pipe. Reine Geometrie,
 * kein RNG. Strokes bleiben erhalten. Verdeckte Stellen erzeugen den drüber/drunter-Spalt.
 *
 * Spatial hash over all centerline segments → near-linear in total lane vertices.
 */
export function occlude(items: OcclItem[], opts: OccludeOpts): Polyline[] {
  // Carve radius per item: the COVERING band's half width + gap (variable-width support).
  const clearOf = (it: OcclItem) => (it.bandHalfMm ?? opts.bandHalfMm) + opts.gapMm;
  const maxClear = items.reduce((m, it) => Math.max(m, clearOf(it)), opts.bandHalfMm + opts.gapMm);
  const step = opts.stepMm ?? Math.max(0.4, opts.gapMm * 0.5);
  const simpTol = opts.simplifyTolMm ?? 0.01;
  const cell = Math.max(maxClear, 1);

  // Build a uniform-grid index of every centerline segment (tagged with its pipe's z).
  const grid = new Map<string, GridSeg[]>();
  const key = (gx: number, gy: number) => `${gx},${gy}`;
  for (const it of items) {
    const c = it.centerline;
    const clr = clearOf(it);
    for (let i = 0; i < c.length - 1; i++) {
      const a = c[i];
      const b = c[i + 1];
      const x0 = Math.floor(Math.min(a[0], b[0]) / cell);
      const x1 = Math.floor(Math.max(a[0], b[0]) / cell);
      const y0 = Math.floor(Math.min(a[1], b[1]) / cell);
      const y1 = Math.floor(Math.max(a[1], b[1]) / cell);
      const seg: GridSeg = { a, b, z: it.z, clear2: clr * clr };
      for (let gx = x0; gx <= x1; gx++) {
        for (let gy = y0; gy <= y1; gy++) {
          const k = key(gx, gy);
          const arr = grid.get(k);
          if (arr) arr.push(seg);
          else grid.set(k, [seg]);
        }
      }
    }
  }

  const hidden = (p: Point, zSelf: number): boolean => {
    const gx = Math.floor(p[0] / cell);
    const gy = Math.floor(p[1] / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const arr = grid.get(key(gx + dx, gy + dy));
        if (!arr) continue;
        for (const s of arr) {
          if (s.z <= zSelf) continue;
          if (distSqToSeg(p, s.a, s.b) < s.clear2) return true;
        }
      }
    }
    return false;
  };

  const out: Polyline[] = [];
  for (const it of items) {
    for (const lane of it.lanes) {
      const pts = densify(lane.points, step);
      let run: Point[] = [];
      const flush = () => {
        if (run.length >= 2) {
          out.push({ closed: false, points: simplify(run, simpTol), stroke: lane.stroke });
        }
        run = [];
      };
      for (const p of pts) {
        if (hidden(p, it.z)) flush();
        else run.push(p);
      }
      flush();
    }
  }
  return out;
}
