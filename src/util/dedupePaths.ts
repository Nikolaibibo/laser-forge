import type { Point, Polyline } from "../generators/types";

export const DEDUPE_TOLERANCE_MM = 0.01;

type SnapKey = string;
type Segment = { aKey: SnapKey; bKey: SnapKey; a: Point; b: Point };

const snap = (p: Point, tol: number): { key: SnapKey; pt: Point } => {
  const ix = Math.round(p[0] / tol);
  const iy = Math.round(p[1] / tol);
  return { key: `${ix}|${iy}`, pt: [ix * tol, iy * tol] };
};

const collectSegments = (polylines: Polyline[], tol: number): Segment[] => {
  const segs: Segment[] = [];
  for (const l of polylines) {
    if (l.points.length < 2) continue;
    const snapped = l.points.map((p) => snap(p, tol));
    for (let i = 0; i < snapped.length - 1; i++) {
      const a = snapped[i];
      const b = snapped[i + 1];
      if (a.key === b.key) continue;
      segs.push({ aKey: a.key, bKey: b.key, a: a.pt, b: b.pt });
    }
    if (l.closed && snapped.length >= 2) {
      const a = snapped[snapped.length - 1];
      const b = snapped[0];
      if (a.key !== b.key) segs.push({ aKey: a.key, bKey: b.key, a: a.pt, b: b.pt });
    }
  }
  return segs;
};

const LINE_KEY_PRECISION = 1e6;

const lineKey = (
  a: Point,
  b: Point,
): { key: string; d: Point; p0: Point } => {
  let dx = b[0] - a[0];
  let dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  if (dy < 0 || (dy === 0 && dx < 0)) {
    dx = -dx;
    dy = -dy;
  }
  const offset = dx * a[1] - dy * a[0];
  const rk = (n: number) => Math.round(n * LINE_KEY_PRECISION) / LINE_KEY_PRECISION;
  const key = `${rk(dx)}|${rk(dy)}|${rk(offset)}`;
  return { key, d: [dx, dy], p0: a };
};

const projectOnto = (p: Point, p0: Point, d: Point): number =>
  (p[0] - p0[0]) * d[0] + (p[1] - p0[1]) * d[1];

export const dedupePaths = (
  polylines: Polyline[],
  toleranceMm: number = DEDUPE_TOLERANCE_MM,
): Polyline[] => {
  if (polylines.length === 0) return [];
  const segs = collectSegments(polylines, toleranceMm);
  if (segs.length === 0) return [];

  type Bucket = { d: Point; p0: Point; intervals: [number, number][] };
  const buckets = new Map<string, Bucket>();

  for (const s of segs) {
    const { key, d, p0 } = lineKey(s.a, s.b);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { d, p0, intervals: [] };
      buckets.set(key, bucket);
    }
    const ta = projectOnto(s.a, bucket.p0, bucket.d);
    const tb = projectOnto(s.b, bucket.p0, bucket.d);
    bucket.intervals.push(ta < tb ? [ta, tb] : [tb, ta]);
  }

  const merged: Segment[] = [];
  for (const bucket of buckets.values()) {
    bucket.intervals.sort((x, y) => x[0] - y[0]);
    let [curMin, curMax] = bucket.intervals[0];
    for (let i = 1; i < bucket.intervals.length; i++) {
      const [nMin, nMax] = bucket.intervals[i];
      // Strict overlap: only merge intervals that genuinely overlap (not just
      // touch at endpoints). Touching is left to the re-stitch phase, which
      // keeps adjacent collinear segments distinct unless they are real
      // duplicates. Prevents over-simplification of dense curves whose snapped
      // samples accidentally land on the same line. The 0.5 * tol gap is half
      // a snap step — large enough that two grid-adjacent but non-overlapping
      // intervals never merge, small enough to still catch half-grid overlaps.
      if (nMin < curMax - toleranceMm * 0.5) {
        if (nMax > curMax) curMax = nMax;
      } else {
        merged.push(intervalToSegment(curMin, curMax, bucket, toleranceMm));
        curMin = nMin;
        curMax = nMax;
      }
    }
    merged.push(intervalToSegment(curMin, curMax, bucket, toleranceMm));
  }

  const cleaned = merged.filter((s) => s.aKey !== s.bKey);
  return restitch(cleaned);
};

const intervalToSegment = (
  tMin: number,
  tMax: number,
  bucket: { d: Point; p0: Point },
  tol: number,
): Segment => {
  const a: Point = [bucket.p0[0] + tMin * bucket.d[0], bucket.p0[1] + tMin * bucket.d[1]];
  const b: Point = [bucket.p0[0] + tMax * bucket.d[0], bucket.p0[1] + tMax * bucket.d[1]];
  const sa = snap(a, tol);
  const sb = snap(b, tol);
  return { aKey: sa.key, bKey: sb.key, a: sa.pt, b: sb.pt };
};

type Edge = { to: SnapKey; toPt: Point; used: boolean };

const restitch = (segs: Segment[]): Polyline[] => {
  const adj = new Map<SnapKey, Edge[]>();
  const nodePt = new Map<SnapKey, Point>();
  const add = (from: SnapKey, fromPt: Point, to: SnapKey, toPt: Point, edge: Edge) => {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push(edge);
    nodePt.set(from, fromPt);
    nodePt.set(to, toPt);
  };
  for (const s of segs) {
    const pair = { used: false };
    const makeEdge = (to: SnapKey, toPt: Point): Edge => {
      const e: Edge = { to, toPt, used: false };
      Object.defineProperty(e, "used", {
        get: () => pair.used,
        set: (v) => {
          pair.used = v;
        },
      });
      return e;
    };
    add(s.aKey, s.a, s.bKey, s.b, makeEdge(s.bKey, s.b));
    add(s.bKey, s.b, s.aKey, s.a, makeEdge(s.aKey, s.a));
  }

  const oddDegreeNodes = (): SnapKey[] => {
    const out: SnapKey[] = [];
    for (const [k, edges] of adj) {
      const open = edges.filter((e) => !e.used).length;
      if (open % 2 === 1) out.push(k);
    }
    return out;
  };

  const anyOpenNode = (): SnapKey | undefined => {
    for (const [k, edges] of adj) {
      if (edges.some((e) => !e.used)) return k;
    }
    return undefined;
  };

  // Note: we pick the first unused edge at each step. The spec's optional
  // "prefer the edge most aligned with the incoming direction" heuristic is
  // not implemented; in practice the kaleidoscope case produces sensible
  // topology without it. Revisit if mandalas with many degree-4 nodes look wrong.
  const walk = (startKey: SnapKey): Polyline => {
    const pts: Point[] = [nodePt.get(startKey)!];
    let cur = startKey;
    while (true) {
      const edges = adj.get(cur) ?? [];
      const next = edges.find((e) => !e.used);
      if (!next) break;
      next.used = true;
      pts.push(next.toPt);
      cur = next.to;
    }
    const closed = pts.length > 2 && cur === startKey;
    if (closed) pts.pop(); // drop redundant trailing point matching startKey
    return { closed, points: pts };
  };

  const polylines: Polyline[] = [];
  for (const start of oddDegreeNodes()) {
    const open = (adj.get(start) ?? []).some((e) => !e.used);
    if (open) polylines.push(walk(start));
  }
  let next = anyOpenNode();
  while (next !== undefined) {
    polylines.push(walk(next));
    next = anyOpenNode();
  }
  return polylines.filter((l) => l.points.length >= 2);
};
