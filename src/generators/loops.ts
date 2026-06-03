// src/generators/loops.ts
import type { GeneratorDef, Point, Polyline } from "./types";
import { makeRng, randInt, randRange } from "../util/random";
import { fitToCanvas } from "../util/path";
import { offsetPath, symmetricOffsets } from "../util/offset";

/**
 * Boustrophedon centerline: `runs` parallel straight runs of length `runLengthMm`,
 * stacked in +y at pitch `runSpacingMm`, joined by 180° caps (radius runSpacingMm/2)
 * on alternating sides. First run goes +x along y=0. runs=2 ⇒ capsule/racetrack.
 * Pure geometry (no RNG). One continuous open point list.
 */
export function serpentineCenterline(
  runs: number, runLengthMm: number, runSpacingMm: number, capSamples: number,
): Point[] {
  const L = runLengthMm;
  const rs = runSpacingMm;
  const r = rs / 2;
  const pts: Point[] = [];
  for (let i = 0; i < runs; i++) {
    const y = i * rs;
    const even = i % 2 === 0;
    const startX = even ? 0 : L;
    const endX = even ? L : 0;
    if (i === 0) pts.push([startX, y]);
    pts.push([endX, y]);
    if (i < runs - 1) {
      const cx = endX;            // right side (x=L) after even runs, left (x=0) after odd
      const cy = y + r;
      const a0 = -Math.PI / 2;
      // even: CCW +π sweep (−π/2→+π/2), bulges +x;  odd: CW −π sweep (−π/2→−3π/2), bulges −x
      const a1 = even ? Math.PI / 2 : (-3 * Math.PI) / 2;
      for (let k = 1; k <= capSamples; k++) {
        const t = a0 + ((a1 - a0) * k) / capSamples;
        pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
      }
    }
  }
  return pts;
}
