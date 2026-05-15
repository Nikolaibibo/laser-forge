import type { GeneratorDef, Point, Polyline } from "./types";
import { makeRng } from "../util/random";

type Variant = "smith-arcs" | "diagonals";

type Params = {
  variant: Variant;
  cols: number;
  rows: number;
  arcSamples: number;
  marginMm: number;
};

const DEFAULTS: Params = {
  variant: "smith-arcs",
  cols: 10,
  rows: 10,
  arcSamples: 16,
  marginMm: 15,
};

/**
 * Truchet tiles: each grid cell receives one of two random orientations.
 *   - smith-arcs: two quarter-arcs per tile, forming flowing maze curves.
 *   - diagonals: one diagonal line per tile.
 * Seeded via makeRng so re-rolling the seed reshuffles the pattern.
 */
export const truchet: GeneratorDef<Params> = {
  id: "truchet",
  name: "Truchet Tiles",
  description:
    "Tile-based pattern; smith-arcs produce flowing maze curves, diagonals produce sharp arrow forests. Reseed to reshuffle the orientations.",
  defaults: DEFAULTS,
  schema: {
    variant: { value: DEFAULTS.variant, options: ["smith-arcs", "diagonals"] },
    cols: { value: DEFAULTS.cols, min: 2, max: 60, step: 1 },
    rows: { value: DEFAULTS.rows, min: 2, max: 60, step: 1 },
    arcSamples: { value: DEFAULTS.arcSamples, min: 4, max: 64, step: 1 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
  },
  generate: (p, seed, canvas) => {
    const rng = makeRng(seed);
    const cols = Math.max(1, Math.floor(p.cols));
    const rows = Math.max(1, Math.floor(p.rows));
    const availW = canvas.wMm - 2 * p.marginMm;
    const availH = canvas.hMm - 2 * p.marginMm;
    const tileW = availW / cols;
    const tileH = availH / rows;
    const polylines: Polyline[] = [];

    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const tx = p.marginMm + cx * tileW;
        const ty = p.marginMm + cy * tileH;
        const orientA = rng() < 0.5;
        if (p.variant === "diagonals") {
          polylines.push({
            closed: false,
            points: orientA
              ? [
                  [tx, ty],
                  [tx + tileW, ty + tileH],
                ]
              : [
                  [tx + tileW, ty],
                  [tx, ty + tileH],
                ],
          });
        } else {
          // smith-arcs: emit two quarter-arcs per tile
          const a = tileW / 2;
          const b = tileH / 2;
          const sampleArc = (
            cxArc: number,
            cyArc: number,
            aStart: number,
            aEnd: number,
          ): Point[] => {
            const pts: Point[] = [];
            for (let s = 0; s <= p.arcSamples; s++) {
              const t = aStart + ((aEnd - aStart) * s) / p.arcSamples;
              pts.push([cxArc + Math.cos(t) * a, cyArc + Math.sin(t) * b]);
            }
            return pts;
          };
          if (orientA) {
            polylines.push({ closed: false, points: sampleArc(tx, ty, 0, Math.PI / 2) });
            polylines.push({
              closed: false,
              points: sampleArc(tx + tileW, ty + tileH, Math.PI, (3 * Math.PI) / 2),
            });
          } else {
            polylines.push({
              closed: false,
              points: sampleArc(tx + tileW, ty, Math.PI / 2, Math.PI),
            });
            polylines.push({
              closed: false,
              points: sampleArc(tx, ty + tileH, (3 * Math.PI) / 2, Math.PI * 2),
            });
          }
        }
      }
    }
    return { polylines, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
