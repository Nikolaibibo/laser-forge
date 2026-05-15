import type { GeneratorDef, Point } from "./types";
import { fitToCanvas } from "../util/path";

type Variant = "hypotrochoid" | "epitrochoid";

type Params = {
  variant: Variant;
  R: number; // outer/fixed circle radius (arbitrary units, fit-to-canvas scales it)
  r: number; // rolling circle radius
  d: number; // pen offset from rolling-circle center
  cycles: number; // multiplier on the natural period
  samples: number; // points per cycle
  marginMm: number;
};

const DEFAULTS: Params = {
  variant: "hypotrochoid",
  R: 5,
  r: 3,
  d: 5,
  cycles: 1,
  samples: 400,
  marginMm: 15,
};

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

const computeClosurePeriod = (R: number, r: number): number => {
  if (r <= 0) return 1;
  const scale = 1000;
  const ri = Math.max(1, Math.round(r * scale));
  const Ri = Math.max(1, Math.round(R * scale));
  const q = ri / gcd(Ri, ri);
  return Math.min(200, Math.max(1, Math.round(q)));
};

/**
 * Spirograph: hypotrochoid (rolling circle inside fixed) or epitrochoid
 * (rolling circle outside). Auto-detects natural closure period via gcd
 * of R and r so the curve closes cleanly when cycles is an integer.
 */
export const spirograph: GeneratorDef<Params> = {
  id: "spirograph",
  name: "Spirograph",
  description:
    "Classic spirograph (hypotrochoid/epitrochoid). Rolling circle traces ornate looped curves; auto-closure period detected from gcd(R, r).",
  defaults: DEFAULTS,
  schema: {
    variant: { value: DEFAULTS.variant, options: ["hypotrochoid", "epitrochoid"] },
    R: { value: DEFAULTS.R, min: 1, max: 20, step: 0.1 },
    r: { value: DEFAULTS.r, min: 0.1, max: 19, step: 0.1 },
    d: { value: DEFAULTS.d, min: 0, max: 20, step: 0.1 },
    cycles: { value: DEFAULTS.cycles, min: 1, max: 8, step: 1 },
    samples: { value: DEFAULTS.samples, min: 100, max: 2000, step: 10 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
  },
  generate: (p, _seed, canvas) => {
    const q = computeClosurePeriod(p.R, p.r);
    const tMax = 2 * Math.PI * q * p.cycles;
    const totalSamples = Math.max(64, Math.floor(p.samples * q * p.cycles));
    const pts: Point[] = [];
    for (let i = 0; i <= totalSamples; i++) {
      const t = (i / totalSamples) * tMax;
      if (p.variant === "hypotrochoid") {
        const Rm = p.R - p.r;
        pts.push([
          Rm * Math.cos(t) + p.d * Math.cos((Rm / p.r) * t),
          Rm * Math.sin(t) - p.d * Math.sin((Rm / p.r) * t),
        ]);
      } else {
        const Rp = p.R + p.r;
        pts.push([
          Rp * Math.cos(t) - p.d * Math.cos((Rp / p.r) * t),
          Rp * Math.sin(t) - p.d * Math.sin((Rp / p.r) * t),
        ]);
      }
    }
    return {
      polylines: fitToCanvas(
        [{ closed: p.cycles === Math.floor(p.cycles), points: pts }],
        canvas.wMm,
        canvas.hMm,
        p.marginMm,
      ),
      widthMm: canvas.wMm,
      heightMm: canvas.hMm,
    };
  },
};
