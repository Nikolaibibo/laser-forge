// src/util/offset.ts
import type { Point, Polyline } from "../generators/types";

export type OffsetOpts = {
  /** Miter-Cap: begrenzt die Skalierung der gemittelten Normale an scharfen Ecken. Default 4. */
  miterLimit?: number;
  /** Reserviert: minimaler Innenradius (mm) — der Generator garantiert turnRadius ≥ Bandbreite/2. */
  minInnerRadiusMm?: number;
};

/** Symmetrische Spur-Offsets: (i − (K−1)/2)·spacing. */
export const symmetricOffsets = (k: number, spacing: number): number[] =>
  Array.from({ length: k }, (_, i) => (i - (k - 1) / 2) * spacing);

/**
 * Versetzt eine offene Centerline um jeden Wert in `offsets` (signiert, mm) entlang
 * der gemittelten Punktnormale. Ein Eintrag → eine versetzte offene Polyline.
 * Reine Geometrie, kein RNG. Miter-Skalierung hält den parallelen Abstand in Kurven;
 * `miterLimit` deckelt sie an scharfen Ecken (verhindert Spikes).
 */
export type BandOpts = OffsetOpts & {
  /** Treat the centerline as closed (no ends → no caps). */
  closed?: boolean;
  /** Close band ends with nested semicircular caps, fusing symmetric lane pairs into rings. */
  endCaps?: boolean;
  /** Samples per cap semicircle. Default 12. */
  capSamples?: number;
};

/** Semicircular cap around a band end: C + (n̂·cosθ + t̂·sinθ)·r, θ ∈ (0, π) exclusive. */
function capArc(c: Point, nHat: Point, tHat: Point, r: number, samples: number): Point[] {
  const pts: Point[] = [];
  for (let i = 1; i < samples; i++) {
    const th = (Math.PI * i) / samples;
    const cos = Math.cos(th), sin = Math.sin(th);
    pts.push([c[0] + (nHat[0] * cos + tHat[0] * sin) * r, c[1] + (nHat[1] * cos + tHat[1] * sin) * r]);
  }
  return pts;
}

/**
 * Offset band of `k` symmetric lanes around a centerline. With `endCaps` (and an
 * open centerline) symmetric lane pairs (+o/−o) are fused into geometrically closed
 * rings: lane → nested semicircular end cap → opposite lane reversed → start cap.
 * Rings repeat their first point and stay `closed: false`, so densify-and-cut
 * consumers (occlusion) keep working unchanged. Odd k leaves the middle lane open.
 * Pure geometry, no RNG.
 */
export function offsetBand(center: Point[], k: number, spacingMm: number, opts: BandOpts = {}): Polyline[] {
  const offsets = symmetricOffsets(k, spacingMm);
  const lanes = offsetPath(center, offsets, opts);
  const n = center.length;
  if (!opts.endCaps || opts.closed || n < 2) return lanes;

  const capSamples = opts.capSamples ?? 12;
  const unit = (vx: number, vy: number): Point => {
    const l = Math.hypot(vx, vy) || 1;
    return [vx / l, vy / l];
  };
  // Outward tangents + normals at both ends (normal = tangent rotated +90°, matches offsetPath).
  const tEnd = unit(center[n - 1][0] - center[n - 2][0], center[n - 1][1] - center[n - 2][1]);
  const nEnd: Point = [-tEnd[1], tEnd[0]];
  const tStart = unit(center[0][0] - center[1][0], center[0][1] - center[1][1]);
  const nStart: Point = [-tStart[1], tStart[0]]; // points toward −offset side (tStart is reversed)

  const out: Polyline[] = [];
  for (let i = 0; i < Math.floor(k / 2); i++) {
    const lo = lanes[i];          // offset −o side (offsets ascend)
    const hi = lanes[k - 1 - i];  // offset +o side
    const r = Math.abs(offsets[k - 1 - i]);
    // hi forward → end cap (+n̂→−n̂ around tip) → lo backward → start cap → close.
    const ring: Point[] = [
      ...hi.points,
      ...capArc(center[n - 1], nEnd, tEnd, r, capSamples),
      ...[...lo.points].reverse(),
      // at the start, n̂Start = −n̂End side: lo's start sits at +n̂Start·r
      ...capArc(center[0], nStart, tStart, r, capSamples),
    ];
    ring.push([ring[0][0], ring[0][1]]);
    out.push({ closed: false, points: ring });
  }
  if (k % 2 === 1) out.push(lanes[Math.floor(k / 2)]);
  return out;
}

export function offsetPath(center: Point[], offsets: number[], opts: OffsetOpts = {}): Polyline[] {
  const miterLimit = opts.miterLimit ?? 4;
  const n = center.length;
  if (n < 2) return offsets.map(() => ({ closed: false, points: center.map((p) => [p[0], p[1]] as Point) }));

  const nx: number[] = [], ny: number[] = [], scale: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = center[Math.max(0, i - 1)];
    const next = center[Math.min(n - 1, i + 1)];
    let tx = next[0] - prev[0], ty = next[1] - prev[1];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    nx.push(-ty); ny.push(tx); // Normale = Tangente +90°
    scale.push(1);
  }
  for (let i = 1; i < n - 1; i++) {
    const a = center[i - 1], b = center[i], c = center[i + 1];
    let d1x = b[0] - a[0], d1y = b[1] - a[1]; const l1 = Math.hypot(d1x, d1y) || 1; d1x /= l1; d1y /= l1;
    let d2x = c[0] - b[0], d2y = c[1] - b[1]; const l2 = Math.hypot(d2x, d2y) || 1; d2x /= l2; d2y /= l2;
    const dot = Math.max(-1, Math.min(1, d1x * d2x + d1y * d2y));
    const cosHalf = Math.sqrt((1 + dot) / 2);
    scale[i] = cosHalf > 1e-4 ? Math.min(1 / cosHalf, miterLimit) : miterLimit;
  }

  return offsets.map((off) => {
    const points: Point[] = [];
    for (let i = 0; i < n; i++) {
      const s = off * scale[i];
      points.push([center[i][0] + nx[i] * s, center[i][1] + ny[i] * s]);
    }
    return { closed: false, points };
  });
}
