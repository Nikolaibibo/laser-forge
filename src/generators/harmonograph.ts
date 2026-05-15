import type { GeneratorDef, Point } from "./types";
import { fitToCanvas } from "../util/path";
import { makeRng } from "../util/random";

type Params = {
  samples: number;
  duration: number;
  // 4 pendulums — each with freq, phase, damping; amplitudes fixed at 1 (scaled via fitToCanvas)
  fx1: number;
  fy1: number;
  fx2: number;
  fy2: number;
  phaseX1: number;
  phaseY1: number;
  phaseX2: number;
  phaseY2: number;
  dx1: number;
  dy1: number;
  dx2: number;
  dy2: number;
  marginMm: number;
  seedJitter: boolean;
};

const DEFAULTS: Params = {
  samples: 12000,
  duration: 80,
  fx1: 2.01,
  fy1: 3.0,
  fx2: 3.0,
  fy2: 2.0,
  phaseX1: 0,
  phaseY1: Math.PI / 2,
  phaseX2: Math.PI / 4,
  phaseY2: 0,
  dx1: 0.004,
  dy1: 0.0065,
  dx2: 0.008,
  dy2: 0.019,
  marginMm: 15,
  seedJitter: true,
};

export const harmonograph: GeneratorDef<Params> = {
  id: "harmonograph",
  name: "Harmonograph",
  description:
    "Four coupled pendulums produce Lissajous-style oscillating curves. A single elegant stroke — perfect for laser and pen plotter.",
  defaults: DEFAULTS,
  schema: {
    samples: { value: DEFAULTS.samples, min: 2000, max: 40000, step: 500 },
    duration: { value: DEFAULTS.duration, min: 20, max: 200, step: 1 },
    fx1: { value: DEFAULTS.fx1, min: 0.5, max: 6, step: 0.01 },
    fy1: { value: DEFAULTS.fy1, min: 0.5, max: 6, step: 0.01 },
    fx2: { value: DEFAULTS.fx2, min: 0.5, max: 6, step: 0.01 },
    fy2: { value: DEFAULTS.fy2, min: 0.5, max: 6, step: 0.01 },
    phaseX1: { value: DEFAULTS.phaseX1, min: 0, max: Math.PI * 2, step: 0.01 },
    phaseY1: { value: DEFAULTS.phaseY1, min: 0, max: Math.PI * 2, step: 0.01 },
    phaseX2: { value: DEFAULTS.phaseX2, min: 0, max: Math.PI * 2, step: 0.01 },
    phaseY2: { value: DEFAULTS.phaseY2, min: 0, max: Math.PI * 2, step: 0.01 },
    dx1: { value: DEFAULTS.dx1, min: 0, max: 0.05, step: 0.0005 },
    dy1: { value: DEFAULTS.dy1, min: 0, max: 0.05, step: 0.0005 },
    dx2: { value: DEFAULTS.dx2, min: 0, max: 0.05, step: 0.0005 },
    dy2: { value: DEFAULTS.dy2, min: 0, max: 0.05, step: 0.0005 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
    seedJitter: { value: DEFAULTS.seedJitter },
  },
  generate: (p, seed, canvas) => {
    const rng = makeRng(seed);
    // optionally jitter frequencies slightly by seed, so seed actually affects result
    const j = (base: number) => (p.seedJitter ? base + (rng() - 0.5) * 0.2 : base);
    const fx1 = j(p.fx1);
    const fy1 = j(p.fy1);
    const fx2 = j(p.fx2);
    const fy2 = j(p.fy2);

    const points: Point[] = new Array(p.samples);
    const dt = p.duration / p.samples;
    for (let i = 0; i < p.samples; i++) {
      const t = i * dt;
      const x =
        Math.sin(fx1 * t + p.phaseX1) * Math.exp(-p.dx1 * t) +
        Math.sin(fx2 * t + p.phaseX2) * Math.exp(-p.dx2 * t);
      const y =
        Math.sin(fy1 * t + p.phaseY1) * Math.exp(-p.dy1 * t) +
        Math.sin(fy2 * t + p.phaseY2) * Math.exp(-p.dy2 * t);
      points[i] = [x, y];
    }
    const fitted = fitToCanvas(
      [{ points, closed: false }],
      canvas.wMm,
      canvas.hMm,
      p.marginMm,
    );
    return { polylines: fitted, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
