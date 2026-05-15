import type { DistortionDef, Point, Polyline } from "../generators/types";
import { makeNoise2D } from "../util/noise";

type Params = {
  amountMm: number;
  noiseScale: number;
  octaves: number;
};

const DEFAULTS: Params = {
  amountMm: 3,
  noiseScale: 0.03,
  octaves: 2,
};

export const noiseWarp: DistortionDef<Params> = {
  id: "noise-warp",
  name: "Noise Warp",
  description:
    "Each point is displaced along a simplex-noise vector field. Turns rigid shapes organic.",
  defaults: DEFAULTS,
  schema: {
    amountMm: { value: DEFAULTS.amountMm, min: 0, max: 30, step: 0.1 },
    noiseScale: { value: DEFAULTS.noiseScale, min: 0.001, max: 0.2, step: 0.001 },
    octaves: { value: DEFAULTS.octaves, min: 1, max: 4, step: 1 },
  },
  apply: (art, p, seed) => {
    const nx = makeNoise2D(seed);
    const ny = makeNoise2D(seed + 9001);
    const fBm = (noise: ReturnType<typeof makeNoise2D>, x: number, y: number): number => {
      let sum = 0;
      let amp = 1;
      let freq = 1;
      let norm = 0;
      for (let o = 0; o < p.octaves; o++) {
        sum += amp * noise(x * freq, y * freq);
        norm += amp;
        amp *= 0.5;
        freq *= 2;
      }
      return sum / norm;
    };
    const polylines: Polyline[] = art.polylines.map((l) => ({
      closed: l.closed,
      points: l.points.map(([x, y]): Point => {
        const dx = fBm(nx, x * p.noiseScale, y * p.noiseScale) * p.amountMm;
        const dy = fBm(ny, x * p.noiseScale, y * p.noiseScale) * p.amountMm;
        return [x + dx, y + dy];
      }),
    }));
    return { ...art, polylines };
  },
};
