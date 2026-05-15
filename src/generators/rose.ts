import type { GeneratorDef, Point } from "./types";
import { fitToCanvas } from "../util/path";

type Variant = "classic" | "maurer";

type Params = {
  variant: Variant;
  n: number;
  d: number;
  step: number;
  cycles: number;
  samples: number;
  phase: number;
  marginMm: number;
};

const DEFAULTS: Params = {
  variant: "classic",
  n: 5,
  d: 1,
  step: 71,
  cycles: 1,
  samples: 2000,
  phase: 0,
  marginMm: 15,
};

/**
 * Classic Rhodonea: r = cos(n/d · θ). Petals:
 *   - if n/d is irreducible with n,d both odd:    n petals
 *   - if one of n,d is even:                      2n petals
 * Maurer Rose: plot k values of θ = step·k degrees with r = sin(n·θ).
 */
export const rose: GeneratorDef<Params> = {
  id: "rose",
  name: "Rose / Maurer Rose",
  description:
    "Rhodonea curves r=cos(n/d·θ). Classic = traditional flower; Maurer = large angular steps create star-like interference patterns.",
  defaults: DEFAULTS,
  schema: {
    variant: { value: DEFAULTS.variant, options: ["classic", "maurer"] },
    n: { value: DEFAULTS.n, min: 1, max: 20, step: 1 },
    d: { value: DEFAULTS.d, min: 1, max: 20, step: 1 },
    step: { value: DEFAULTS.step, min: 1, max: 180, step: 1 },
    cycles: { value: DEFAULTS.cycles, min: 1, max: 20, step: 1 },
    samples: { value: DEFAULTS.samples, min: 50, max: 20000, step: 10 },
    phase: { value: DEFAULTS.phase, min: -Math.PI, max: Math.PI, step: 0.01 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
  },
  generate: (p, _seed, canvas) => {
    const pts: Point[] = [];
    if (p.variant === "classic") {
      const thetaMax = Math.PI * 2 * p.cycles * p.d;
      for (let i = 0; i <= p.samples; i++) {
        const theta = (i / p.samples) * thetaMax;
        // Phase inside the sinusoid → rotates petals themselves
        const r = Math.cos((p.n / p.d) * theta + p.phase);
        pts.push([Math.cos(theta) * r, Math.sin(theta) * r]);
      }
    } else {
      // Maurer: connect 361+ samples of θ = k·step° with r = sin(n·θ + phase)
      const stepRad = (p.step * Math.PI) / 180;
      const kmax = Math.max(8, Math.floor(p.samples));
      for (let k = 0; k <= kmax; k++) {
        const theta = k * stepRad;
        const r = Math.sin(p.n * theta + p.phase);
        pts.push([Math.cos(theta) * r, Math.sin(theta) * r]);
      }
    }
    const fitted = fitToCanvas(
      [{ points: pts, closed: p.variant === "classic" }],
      canvas.wMm,
      canvas.hMm,
      p.marginMm,
    );
    return { polylines: fitted, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
