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
