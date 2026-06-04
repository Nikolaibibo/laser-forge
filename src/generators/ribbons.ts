// src/generators/ribbons.ts
import type { GeneratorDef, Point, Polyline } from "./types";
import { makeRng, randInt, randRange } from "../util/random";
import type { RNG } from "../util/random";
import { makeNoise2D } from "../util/noise";
import { fitToCanvas } from "../util/path";
import { offsetBand } from "../util/offset";
import { occlude } from "../util/occlusion";
import type { OcclItem } from "../util/occlusion";

type Params = {
  count: number;          // ribbons to attempt (some seeds may be rejected)
  lenMinMm: number;
  lenMaxMm: number;
  stepMm: number;
  noiseScale: number;
  curlFactor: number;     // angle range of the noise field (radians)
  angleSteps: number;     // 0 = organic; N>0 quantizes headings to N global directions (straight runs + constant-radius arcs)
  turnRadiusMm: number;   // arc radius for heading changes (clamped up to bandHalf + spacing)
  lanesMin: number;       // band width per ribbon is seeded from [lanesMin, lanesMax]
  lanesMax: number;
  laneSpacingMm: number;
  endCaps: boolean;
  capSamples: number;
  minSeedSepMm: number;   // minimum distance between ribbon seed points
  colorFraction: number;  // 0..1 share of colored ribbons
  colorStrategy: "largestFirst" | "random";
  colorCount: number;     // 1..6 — how many of the color slots below form the palette
  color1: string; color2: string; color3: string;
  color4: string; color5: string; color6: string;
  occlusion: boolean;
  occlusionGapMm: number;
  marginMm: number;
};

const DEFAULTS: Params = {
  count: 16, lenMinMm: 100, lenMaxMm: 300, stepMm: 1.0,
  noiseScale: 0.012, curlFactor: Math.PI * 2,
  angleSteps: 8, turnRadiusMm: 6,
  lanesMin: 4, lanesMax: 8, laneSpacingMm: 1.2,
  endCaps: true, capSamples: 12, minSeedSepMm: 12,
  colorFraction: 0.35, colorStrategy: "largestFirst",
  colorCount: 3,
  color1: "#e0584f", color2: "#4f86e0", color3: "#5fcaa8",
  color4: "#e8a33d", color5: "#8d5fc9", color6: "#e96a3a",
  occlusion: true, occlusionGapMm: 1.0, marginMm: 15,
};

/** Smallest signed angle from a to b, in (−π, π]. */
const angleDiff = (a: number, b: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
};

/**
 * Trace half a ribbon centerline through the noise angle field, from `start` along
 * `dir` (+1 = with the field, −1 = against it). `phase` rotates the field per ribbon
 * (streamlines of one shared field never cross — the phase makes ribbons weave so
 * occlusion has work to do). Heading change per step is clamped to stepMm/rMin so
 * inner lanes can never collapse at tight bends.
 */
function traceDir(
  start: Point, lenMm: number, phase: number, rMinMm: number, dir: 1 | -1,
  noise: (x: number, y: number) => number,
  p: Params, xMin: number, yMin: number, xMax: number, yMax: number,
): Point[] {
  const maxTurn = p.stepMm / Math.max(rMinMm, p.stepMm); // radians per step
  const steps = Math.max(2, Math.round(lenMm / p.stepMm));
  const flip = dir < 0 ? Math.PI : 0;
  // angleSteps > 0: snap target headings to N GLOBAL directions (the quantization
  // collapses the per-ribbon phase onto one shared direction grid). The turn clamp
  // then renders every direction change as an arc of constant radius rMinMm.
  const quant = Math.floor(p.angleSteps) > 0 ? (Math.PI * 2) / Math.floor(p.angleSteps) : 0;
  const aim = (ax: number, ay: number): number => {
    const raw = noise(ax * p.noiseScale, ay * p.noiseScale) * p.curlFactor + phase + flip;
    return quant > 0 ? Math.round(raw / quant) * quant : raw;
  };
  let [x, y] = start;
  let heading = aim(x, y);
  const pts: Point[] = [[x, y]];
  for (let s = 0; s < steps; s++) {
    const d = angleDiff(heading, aim(x, y));
    heading += Math.max(-maxTurn, Math.min(maxTurn, d));
    x += Math.cos(heading) * p.stepMm;
    y += Math.sin(heading) * p.stepMm;
    if (x < xMin || x > xMax || y < yMin || y > yMax) break;
    pts.push([x, y]);
  }
  return pts;
}

/** Full centerline: trace both directions from the seed and join (avoids edge stubs). */
function traceCenterline(
  start: Point, lenMm: number, phase: number, rMinMm: number,
  noise: (x: number, y: number) => number,
  p: Params, xMin: number, yMin: number, xMax: number, yMax: number,
): Point[] {
  const fwd = traceDir(start, lenMm / 2, phase, rMinMm, 1, noise, p, xMin, yMin, xMax, yMax);
  const bwd = traceDir(start, lenMm / 2, phase, rMinMm, -1, noise, p, xMin, yMin, xMax, yMax);
  return [...bwd.slice(1).reverse(), ...fwd];
}

export const ribbons: GeneratorDef<Params> = {
  id: "ribbons",
  name: "Flow Ribbons",
  description:
    "Few fat meandering ribbons: noise-field streamlines with a per-ribbon phase (so ribbons cross and weave). angleSteps quantizes headings to N global directions — straight runs joined by constant-radius arcs (turnRadiusMm, never below half band width; 0 = fully organic). Band width per ribbon is seeded from [lanesMin, lanesMax]; endCaps closes the tips with nested semicircular caps; occlusion resolves crossings as over/under. colorFraction 0 = monochrome (reference look), default 0.35 colors the longest ribbons.",
  defaults: DEFAULTS,
  schema: {
    count: { value: DEFAULTS.count, min: 1, max: 60, step: 1 },
    lenMinMm: { value: DEFAULTS.lenMinMm, min: 20, max: 400, step: 5 },
    lenMaxMm: { value: DEFAULTS.lenMaxMm, min: 20, max: 600, step: 5 },
    stepMm: { value: DEFAULTS.stepMm, min: 0.4, max: 3, step: 0.1 },
    noiseScale: { value: DEFAULTS.noiseScale, min: 0.002, max: 0.05, step: 0.001 },
    curlFactor: { value: DEFAULTS.curlFactor, min: Math.PI / 2, max: Math.PI * 6, step: 0.1 },
    angleSteps: { value: DEFAULTS.angleSteps, min: 0, max: 12, step: 1 },
    turnRadiusMm: { value: DEFAULTS.turnRadiusMm, min: 1, max: 30, step: 0.5 },
    lanesMin: { value: DEFAULTS.lanesMin, min: 2, max: 16, step: 1 },
    lanesMax: { value: DEFAULTS.lanesMax, min: 2, max: 16, step: 1 },
    laneSpacingMm: { value: DEFAULTS.laneSpacingMm, min: 0.3, max: 3, step: 0.1 },
    endCaps: { value: DEFAULTS.endCaps },
    capSamples: { value: DEFAULTS.capSamples, min: 4, max: 32, step: 1 },
    minSeedSepMm: { value: DEFAULTS.minSeedSepMm, min: 0, max: 60, step: 1 },
    colorFraction: { value: DEFAULTS.colorFraction, min: 0, max: 1, step: 0.05 },
    colorStrategy: { value: DEFAULTS.colorStrategy, options: ["largestFirst", "random"] },
    colorCount: { value: DEFAULTS.colorCount, min: 1, max: 6, step: 1 },
    color1: { value: DEFAULTS.color1 },
    color2: { value: DEFAULTS.color2, render: (get) => get("Flow Ribbons.colorCount") >= 2 },
    color3: { value: DEFAULTS.color3, render: (get) => get("Flow Ribbons.colorCount") >= 3 },
    color4: { value: DEFAULTS.color4, render: (get) => get("Flow Ribbons.colorCount") >= 4 },
    color5: { value: DEFAULTS.color5, render: (get) => get("Flow Ribbons.colorCount") >= 5 },
    color6: { value: DEFAULTS.color6, render: (get) => get("Flow Ribbons.colorCount") >= 6 },
    occlusion: { value: DEFAULTS.occlusion },
    occlusionGapMm: { value: DEFAULTS.occlusionGapMm, min: 0.2, max: 4, step: 0.1 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
  },
  generate: (p, seed, canvas) => {
    const rng: RNG = makeRng(seed);
    const noise = makeNoise2D(seed + 1);

    const lanesLo = Math.max(2, Math.floor(Math.min(p.lanesMin, p.lanesMax)));
    const lanesHi = Math.max(2, Math.floor(Math.max(p.lanesMin, p.lanesMax)));
    const lenLo = Math.min(p.lenMinMm, p.lenMaxMm);
    const lenHi = Math.max(p.lenMinMm, p.lenMaxMm);
    const bandHalfMax = ((lanesHi - 1) * p.laneSpacingMm) / 2;

    // Keep seeds inside the margin plus the widest band, so caps stay on canvas.
    const inset = p.marginMm + bandHalfMax;
    const xMin = inset, yMin = inset;
    const xMax = canvas.wMm - inset, yMax = canvas.hMm - inset;

    const palette = [p.color1, p.color2, p.color3, p.color4, p.color5, p.color6]
      .slice(0, Math.min(6, Math.max(1, Math.round(p.colorCount))));

    type Ribbon = { center: Point[]; lanes: Polyline[]; lengthMm: number; bandHalfMm: number; stroke?: string };
    const ribbonsOut: Ribbon[] = [];
    const seeds: Point[] = [];
    const sep2 = p.minSeedSepMm * p.minSeedSepMm;

    for (let i = 0; i < Math.floor(p.count); i++) {
      // Draws happen unconditionally so rejected seeds don't shift later ribbons' randomness.
      const sx = randRange(rng, xMin, xMax);
      const sy = randRange(rng, yMin, yMax);
      const lenMm = randRange(rng, lenLo, lenHi);
      const phase = randRange(rng, 0, Math.PI * 2);
      const k = lanesLo === lanesHi ? lanesLo : randInt(rng, lanesLo, lanesHi);
      if (seeds.some(([qx, qy]) => (qx - sx) * (qx - sx) + (qy - sy) * (qy - sy) < sep2)) continue;

      const bandHalf = ((k - 1) * p.laneSpacingMm) / 2;
      // Arc radius: user choice, but never below what the band physically needs.
      const rMin = Math.max(p.turnRadiusMm, bandHalf + p.laneSpacingMm);
      const center = traceCenterline([sx, sy], lenMm, phase, rMin, noise, p, xMin, yMin, xMax, yMax);
      if (center.length < 8) continue; // too short to read as a ribbon

      seeds.push([sx, sy]);
      const lanes = offsetBand(center, k, p.laneSpacingMm, {
        minInnerRadiusMm: p.laneSpacingMm,
        endCaps: p.endCaps,
        capSamples: p.capSamples,
      });
      let lengthMm = 0;
      for (let j = 1; j < center.length; j++) {
        lengthMm += Math.hypot(center[j][0] - center[j - 1][0], center[j][1] - center[j - 1][1]);
      }
      ribbonsOut.push({ center, lanes, lengthMm, bandHalfMm: bandHalf });
    }

    if (p.colorStrategy === "largestFirst") {
      const byLength = [...ribbonsOut].sort((a, b) => b.lengthMm - a.lengthMm);
      const nColored = Math.round(ribbonsOut.length * p.colorFraction);
      byLength.forEach((r, i) => {
        if (i < nColored) r.stroke = palette[i % palette.length];
      });
    } else {
      let colorIdx = 0;
      for (const r of ribbonsOut) {
        if (rng() < p.colorFraction) r.stroke = palette[colorIdx++ % palette.length];
      }
    }

    const laneOf = (r: Ribbon, l: Polyline): Polyline => (r.stroke ? { ...l, stroke: r.stroke } : l);

    let all: Polyline[];
    if (p.occlusion) {
      const items: OcclItem[] = ribbonsOut.map((r) => ({
        z: rng(),
        centerline: r.center,
        lanes: r.lanes.map((l) => laneOf(r, l)),
        bandHalfMm: r.bandHalfMm,
      }));
      all = occlude(items, { gapMm: p.occlusionGapMm, bandHalfMm: bandHalfMax });
    } else {
      all = ribbonsOut.flatMap((r) => r.lanes.map((l) => laneOf(r, l)));
    }

    const fitted = fitToCanvas(all, canvas.wMm, canvas.hMm, p.marginMm);
    return { polylines: fitted, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
