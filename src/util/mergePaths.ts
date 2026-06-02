import type { Point, Polyline } from "../generators/types";

export const MERGE_TOLERANCE_MM = 0.05;

/**
 * Snap a coordinate value to the tolerance grid, returning the integer grid index.
 */
const snapIndex = (v: number, tol: number): number => Math.round(v / tol);

/**
 * Compute the snap-key for an endpoint given a tolerance.
 * Format: "${snapX},${snapY}"
 */
const snapKey = (p: Point, tol: number): string =>
  `${snapIndex(p[0], tol)},${snapIndex(p[1], tol)}`;

type EndpointRef = {
  /** Index into the open polylines array. */
  polyIdx: number;
  /** true = this is the START end, false = this is the END end. */
  isStart: boolean;
};

/**
 * Join open polylines whose endpoints coincide (within `tolerance` mm) into
 * longer continuous polylines.
 *
 * - Closed polylines pass through unchanged.
 * - Open polylines with < 2 points are dropped.
 * - Greedy chaining: for each unused open polyline, extend at both ends as
 *   long as a matching partner exists. Degree > 2 nodes: first available
 *   partner wins; remaining paths stay separate.
 * - If after chaining the chain's two outer endpoints share a snap-key the
 *   result is marked `closed: true` (no duplicate closing point is stored).
 */
export function mergePaths(
  polylines: Polyline[],
  tolerance: number = MERGE_TOLERANCE_MM,
): Polyline[] {
  const tol = tolerance;

  // Separate closed from open; drop degenerate (<2 pt) open lines.
  const closed: Polyline[] = [];
  const open: Polyline[] = [];

  for (const pl of polylines) {
    if (pl.closed) {
      closed.push(pl);
    } else if (pl.points.length >= 2) {
      open.push(pl);
    }
    // < 2 points: drop
  }

  if (open.length === 0) {
    return [...closed];
  }

  // Build endpoint index: snap-key → list of EndpointRefs.
  // Each open polyline contributes exactly two entries (start and end).
  const endpointIndex = new Map<string, EndpointRef[]>();

  const addToIndex = (key: string, ref: EndpointRef) => {
    if (!endpointIndex.has(key)) endpointIndex.set(key, []);
    endpointIndex.get(key)!.push(ref);
  };

  for (let i = 0; i < open.length; i++) {
    const pl = open[i];
    addToIndex(snapKey(pl.points[0], tol), { polyIdx: i, isStart: true });
    addToIndex(snapKey(pl.points[pl.points.length - 1], tol), { polyIdx: i, isStart: false });
  }

  const used = new Uint8Array(open.length);

  /**
   * Find an unused partner whose endpoint is within `tol` of `pt`.
   * Searches the snap cell of `pt` and all 8 neighbouring cells to handle
   * points that lie near cell boundaries (e.g. 0.03 mm apart at tol=0.05).
   * Returns the ref (and removes it from the index entry) or null.
   */
  const findPartner = (pt: Point, selfIdx: number): EndpointRef | null => {
    const ix = snapIndex(pt[0], tol);
    const iy = snapIndex(pt[1], tol);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${ix + dx},${iy + dy}`;
        const refs = endpointIndex.get(key);
        if (!refs) continue;
        for (let i = 0; i < refs.length; i++) {
          const ref = refs[i];
          if (ref.polyIdx === selfIdx || used[ref.polyIdx]) continue;
          // Verify actual distance within tolerance.
          const other = open[ref.polyIdx];
          const otherPt = ref.isStart
            ? other.points[0]
            : other.points[other.points.length - 1];
          const dist = Math.hypot(otherPt[0] - pt[0], otherPt[1] - pt[1]);
          if (dist <= tol) {
            refs.splice(i, 1);
            return ref;
          }
        }
      }
    }
    return null;
  };

  /**
   * Remove all index entries for a given polyline index (both endpoints).
   * Called after the polyline has been consumed into a chain.
   */
  const removeFromIndex = (polyIdx: number) => {
    const pl = open[polyIdx];
    const startKey = snapKey(pl.points[0], tol);
    const endKey = snapKey(pl.points[pl.points.length - 1], tol);
    for (const key of [startKey, endKey]) {
      const refs = endpointIndex.get(key);
      if (!refs) continue;
      const idx = refs.findIndex((r) => r.polyIdx === polyIdx);
      if (idx !== -1) refs.splice(idx, 1);
    }
  };

  const result: Polyline[] = [];

  for (let startIdx = 0; startIdx < open.length; startIdx++) {
    if (used[startIdx]) continue;

    // Start a new chain from this polyline.
    used[startIdx] = 1;
    removeFromIndex(startIdx);

    // Work with a mutable copy of the points.
    let chain: Point[] = [...open[startIdx].points];

    // Grow forward (from chain's last point).
    let growing = true;
    while (growing) {
      growing = false;
      const tail = chain[chain.length - 1];
      const partner = findPartner(tail, -1);
      if (partner) {
        const { polyIdx, isStart } = partner;
        used[polyIdx] = 1;
        removeFromIndex(polyIdx);
        const pts = open[polyIdx].points;
        if (isStart) {
          // Partner starts at our tail → append from index 1 (skip shared point).
          chain = chain.concat(pts.slice(1));
        } else {
          // Partner ends at our tail → reverse it, then append from index 1.
          const reversed = [...pts].reverse();
          chain = chain.concat(reversed.slice(1));
        }
        growing = true;
      }
    }

    // Grow backward (from chain's first point).
    growing = true;
    while (growing) {
      growing = false;
      const head = chain[0];
      const partner = findPartner(head, -1);
      if (partner) {
        const { polyIdx, isStart } = partner;
        used[polyIdx] = 1;
        removeFromIndex(polyIdx);
        const pts = open[polyIdx].points;
        if (isStart) {
          // Partner starts at our head → it ends elsewhere; reverse it and prepend (skip last = shared).
          const reversed = [...pts].reverse();
          chain = reversed.concat(chain.slice(1));
        } else {
          // Partner ends at our head → prepend from 0 to length-1 (skip last = shared point).
          chain = pts.slice(0, pts.length - 1).concat(chain);
        }
        growing = true;
      }
    }

    // Check if chain forms a closed ring.
    const head = chain[0];
    const tail = chain[chain.length - 1];
    const headKey = snapKey(head, tol);
    const tailKey = snapKey(tail, tol);
    const ringDist = Math.hypot(tail[0] - head[0], tail[1] - head[1]);
    const isClosed = headKey === tailKey || ringDist <= tol;

    if (isClosed && chain.length > 2) {
      // Drop the duplicate closing point.
      result.push({ closed: true, points: chain.slice(0, chain.length - 1) });
    } else {
      result.push({ closed: false, points: chain });
    }
  }

  // Append closed pass-throughs at the end (consistent with spec).
  return result.concat(closed);
}
