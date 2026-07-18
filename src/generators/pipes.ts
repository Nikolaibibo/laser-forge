// src/generators/pipes.ts
import type { GeneratorDef, Point, Polyline } from "./types";
import { makeRng, randInt } from "../util/random";
import type { RNG } from "../util/random";
import { fitToCanvas, polylineLength } from "../util/path";
import { offsetBand } from "../util/offset";
import { mergePaths } from "../util/mergePaths";
import { occlude } from "../util/occlusion";
import type { OcclItem } from "../util/occlusion";

type Params = {
  model: "classic" | "wang";
  cols: number;
  rows: number;
  lanesMin: number;       // band width per pipe is seeded from [lanesMin, lanesMax]
  lanesMax: number;
  laneSpacingMm: number;
  endCaps: boolean;       // close band ends with nested semicircular caps
  straightness: number;   // classic = P(cross tile); wang = P(straight pass-through at a turn)
  density: number;        // 0..1 edge-open probability (wang model)
  crossing: number;       // 0..1 P(both pipes pass through when N+W meet) — wang model
  colorFraction: number;  // 0..1 share of colored components
  colorStrategy: "largestFirst" | "random"; // largestFirst = longest pipes get accent colors
  colorCount: number;     // 1..6 — how many of the color slots below form the palette
  color1: string; color2: string; color3: string;
  color4: string; color5: string; color6: string;
  laneColorMode: "band" | "outlineFill"; // band = whole pipe one colour; outlineFill = outline pen + accent interior
  outlineColor: string;   // stroke of the outline lanes (outlineFill mode)
  outlineLanes: number;   // how many outermost lanes on each side form the outline
  occlusion: boolean;     // pipes pass over/under each other (z-order gaps)
  occlusionGapMm: number; // clear gap carved beside the band that passes over
  arcSamples: number;
  marginMm: number;
};

const DEFAULTS: Params = {
  model: "wang",
  cols: 14, rows: 18, lanesMin: 6, lanesMax: 6, laneSpacingMm: 0.7, endCaps: true,
  straightness: 0.55, density: 0.5, crossing: 0.45, colorFraction: 0.35,
  colorStrategy: "largestFirst",
  colorCount: 3,
  color1: "#e0584f", color2: "#4f86e0", color3: "#5fcaa8",
  color4: "#e8a33d", color5: "#8d5fc9", color6: "#e96a3a",
  laneColorMode: "band", outlineColor: "#1a1a1a", outlineLanes: 1,
  occlusion: true, occlusionGapMm: 1.0,
  arcSamples: 14, marginMm: 15,
};

function sampleArc(cx: number, cy: number, a0: number, a1: number, r: number, n: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return pts;
}

export type Pair = "NS" | "WE" | "NE" | "NW" | "SE" | "SW";

/**
 * Picks the open edges for a cell. N and W are already fixed by the sweep; this
 * chooses e and s. The returned `pair` labels the edges the tile's stroke connects —
 * e.g. for inDeg===2 the pair "NW" connects the incoming North and West edges.
 * With `crossing` > 0, an inDeg===2 cell may instead pass BOTH pipes straight through
 * ("CROSS": N–S plus W–E, degree 4) — the over/under look comes from occlusion.
 */
export function chooseTile(
  n: 0 | 1, w: 0 | 1, rng: RNG, straightness: number, density: number, crossing = 0,
): { e: 0 | 1; s: 0 | 1; pair: Pair | "CROSS" | null } {
  const inDeg = n + w;
  if (inDeg === 2) {
    return rng() < crossing ? { e: 1, s: 1, pair: "CROSS" } : { e: 0, s: 0, pair: "NW" };
  }
  if (inDeg === 1) {
    if (n === 1) {
      return rng() < straightness ? { e: 0, s: 1, pair: "NS" } : { e: 1, s: 0, pair: "NE" };
    }
    return rng() < straightness ? { e: 1, s: 0, pair: "WE" } : { e: 0, s: 1, pair: "SW" };
  }
  return rng() < density ? { e: 1, s: 1, pair: "SE" } : { e: 0, s: 0, pair: null };
}

/** Two strokes (open point lists) of a tile. y points down (screen convention). */
function tileStrokes(
  kind: "cross" | "arcA" | "arcB",
  x0: number, y0: number, c: number, arcSamples: number,
): Point[][] {
  const r = c / 2;
  const N: Point = [x0 + r, y0], S: Point = [x0 + r, y0 + c];
  const W: Point = [x0, y0 + r], E: Point = [x0 + c, y0 + r];
  if (kind === "cross") {
    return [[N, S], [W, E]];
  }
  if (kind === "arcA") {
    // N–E around NE corner (a0=π → a1=π/2), S–W around SW corner (a0=0 → a1=−π/2)
    return [
      sampleArc(x0 + c, y0, Math.PI, Math.PI / 2, r, arcSamples),
      sampleArc(x0, y0 + c, 0, -Math.PI / 2, r, arcSamples),
    ];
  }
  // arcB: N–W around NW corner (a0=0 → a1=π/2), S–E around SE corner (a0=π → a1=3π/2)
  return [
    sampleArc(x0, y0, 0, Math.PI / 2, r, arcSamples),
    sampleArc(x0 + c, y0 + c, Math.PI, (3 * Math.PI) / 2, r, arcSamples),
  ];
}

export function wangTileStroke(
  pair: Pair, x0: number, y0: number, c: number, arcSamples: number,
): Point[] {
  const r = c / 2;
  const N: Point = [x0 + r, y0], S: Point = [x0 + r, y0 + c];
  const W: Point = [x0, y0 + r], E: Point = [x0 + c, y0 + r];
  switch (pair) {
    case "NS": return [N, S];
    case "WE": return [W, E];
    case "NE": return sampleArc(x0 + c, y0, Math.PI, Math.PI / 2, r, arcSamples);
    case "NW": return sampleArc(x0, y0, 0, Math.PI / 2, r, arcSamples);
    case "SW": return sampleArc(x0, y0 + c, 0, -Math.PI / 2, r, arcSamples);
    case "SE": return sampleArc(x0 + c, y0 + c, Math.PI, (3 * Math.PI) / 2, r, arcSamples);
    default: pair satisfies never; return [];
  }
}

export function wangField(
  cols: number, rows: number, c: number, arcSamples: number,
  straightness: number, density: number, rng: RNG, crossing = 0,
): Polyline[] {
  // Edge state. H[x][y]: horizontal edge above cell (x,y); x∈[0,cols), y∈[0,rows].
  // V[x][y]: vertical edge left of cell (x,y); x∈[0,cols], y∈[0,rows).
  // For cell (x,y): N = H[x][y], S = H[x][y+1], W = V[x][y], E = V[x+1][y].
  const H: boolean[][] = Array.from({ length: cols }, () => Array(rows + 1).fill(false));
  const V: boolean[][] = Array.from({ length: cols + 1 }, () => Array(rows).fill(false));

  // Boundary pre-roll: top N-edges + left W-edges each open with P(density).
  for (let x = 0; x < cols; x++) if (rng() < density) H[x][0] = true;
  for (let y = 0; y < rows; y++) if (rng() < density) V[0][y] = true;

  const strokes: Polyline[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const n: 0 | 1 = H[x][y] ? 1 : 0;
      const w: 0 | 1 = V[x][y] ? 1 : 0;
      const { e, s, pair } = chooseTile(n, w, rng, straightness, density, crossing);
      H[x][y + 1] = s === 1;
      V[x + 1][y] = e === 1;
      if (pair === "CROSS") {
        // Both pipes pass straight through; they cross mid-cell (resolved by occlusion).
        strokes.push({ points: wangTileStroke("NS", x * c, y * c, c, arcSamples), closed: false });
        strokes.push({ points: wangTileStroke("WE", x * c, y * c, c, arcSamples), closed: false });
      } else if (pair !== null) {
        strokes.push({ points: wangTileStroke(pair, x * c, y * c, c, arcSamples), closed: false });
      }
    }
  }
  return strokes;
}

function classicField(
  cols: number, rows: number, c: number, arcSamples: number, straightness: number, rng: RNG,
): Polyline[] {
  const strokes: Polyline[] = [];
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const kind = rng() < straightness ? "cross" : (rng() < 0.5 ? "arcA" : "arcB");
      for (const pts of tileStrokes(kind, cx * c, cy * c, c, arcSamples)) {
        strokes.push({ points: pts, closed: false });
      }
    }
  }
  return strokes;
}

export const pipes: GeneratorDef<Params> = {
  id: "pipes",
  name: "Truchet Pipes",
  description:
    "Tile field of straights + 90° arcs; continuous pipes rendered as dense parallel bands. straightness controls run length; colorFraction colors a share of the pipes (colorStrategy 'largestFirst' = longest pipes get the accent colors); the accent palette itself is colorCount + color1…color6. crossing lets pipes pass through each other; occlusion resolves crossings as over/under with a clear gap (occlusionGapMm). model 'wang' (distinct pipes, default) vs 'classic' (Truchet grid); density (wang only) sets fill. Band width per pipe is seeded from [lanesMin, lanesMax]; endCaps closes band ends with nested semicircular caps. laneColorMode 'outlineFill' draws the outermost outlineLanes in outlineColor (the black pipe outline) and fills the interior lanes with the pipe's accent colour — a two-pen plot (outline pen first, then accents). Reseed reshuffles field + z-order.",
  defaults: DEFAULTS,
  schema: {
    model: { value: DEFAULTS.model, options: ["wang", "classic"] },
    cols: { value: DEFAULTS.cols, min: 3, max: 40, step: 1 },
    rows: { value: DEFAULTS.rows, min: 3, max: 40, step: 1 },
    lanesMin: { value: DEFAULTS.lanesMin, min: 2, max: 16, step: 1 },
    lanesMax: { value: DEFAULTS.lanesMax, min: 2, max: 16, step: 1 },
    laneSpacingMm: { value: DEFAULTS.laneSpacingMm, min: 0.3, max: 3, step: 0.1 },
    endCaps: { value: DEFAULTS.endCaps },
    straightness: { value: DEFAULTS.straightness, min: 0, max: 1, step: 0.05 },
    density: { value: DEFAULTS.density, min: 0.05, max: 1, step: 0.05 },
    crossing: { value: DEFAULTS.crossing, min: 0, max: 1, step: 0.05 },
    colorFraction: { value: DEFAULTS.colorFraction, min: 0, max: 1, step: 0.05 },
    colorStrategy: { value: DEFAULTS.colorStrategy, options: ["largestFirst", "random"] },
    colorCount: { value: DEFAULTS.colorCount, min: 1, max: 6, step: 1 },
    // Color slots above colorCount are hidden via the schema render() predicate.
    color1: { value: DEFAULTS.color1 },
    color2: { value: DEFAULTS.color2, render: (get) => get("Truchet Pipes.colorCount") >= 2 },
    color3: { value: DEFAULTS.color3, render: (get) => get("Truchet Pipes.colorCount") >= 3 },
    color4: { value: DEFAULTS.color4, render: (get) => get("Truchet Pipes.colorCount") >= 4 },
    color5: { value: DEFAULTS.color5, render: (get) => get("Truchet Pipes.colorCount") >= 5 },
    color6: { value: DEFAULTS.color6, render: (get) => get("Truchet Pipes.colorCount") >= 6 },
    laneColorMode: { value: DEFAULTS.laneColorMode, options: ["band", "outlineFill"] },
    outlineColor: { value: DEFAULTS.outlineColor, render: (get) => get("Truchet Pipes.laneColorMode") === "outlineFill" },
    outlineLanes: { value: DEFAULTS.outlineLanes, min: 1, max: 4, step: 1, render: (get) => get("Truchet Pipes.laneColorMode") === "outlineFill" },
    occlusion: { value: DEFAULTS.occlusion },
    occlusionGapMm: { value: DEFAULTS.occlusionGapMm, min: 0.2, max: 4, step: 0.1 },
    arcSamples: { value: DEFAULTS.arcSamples, min: 4, max: 32, step: 1 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
  },
  generate: (p, seed, canvas) => {
    const rng = makeRng(seed);
    const cols = Math.max(2, Math.floor(p.cols));
    const rows = Math.max(2, Math.floor(p.rows));
    const lanesLo = Math.max(2, Math.floor(Math.min(p.lanesMin, p.lanesMax)));
    const lanesHi = Math.max(2, Math.floor(Math.max(p.lanesMin, p.lanesMax)));
    // Cell size fits the widest possible band.
    const bandHalfMax = ((lanesHi - 1) * p.laneSpacingMm) / 2;
    const c = Math.max(10, (bandHalfMax + 2 * p.laneSpacingMm) * 2);

    const strokes = p.model === "wang"
      ? wangField(cols, rows, c, p.arcSamples, p.straightness, p.density, rng, p.crossing)
      : classicField(cols, rows, c, p.arcSamples, p.straightness, rng);

    const components = mergePaths(strokes, 1e-3);

    // Accent palette = the first colorCount picker slots.
    const palette = [p.color1, p.color2, p.color3, p.color4, p.color5, p.color6]
      .slice(0, Math.min(6, Math.max(1, Math.round(p.colorCount))));

    // One entry per pipe: centerline + offset band, length for colorStrategy.
    // Lane count per pipe is seeded from [lanesMin, lanesMax] (variable band width).
    type Comp = {
      center: Point[]; lanes: Polyline[]; lengthMm: number; bandHalfMm: number;
      fused: boolean; stroke?: string; laneStrokes?: (string | undefined)[];
    };
    const comps: Comp[] = components.map((comp) => {
      const k = lanesLo === lanesHi ? lanesLo : randInt(rng, lanesLo, lanesHi);
      const center = comp.closed ? [...comp.points, comp.points[0]] : comp.points;
      const lanes = offsetBand(center, k, p.laneSpacingMm, {
        minInnerRadiusMm: p.laneSpacingMm,
        closed: comp.closed,
        endCaps: p.endCaps,
        capSamples: p.arcSamples,
      });
      // With endCaps on an open pipe, offsetBand fuses symmetric lane pairs into rings,
      // so lanes[0] is the OUTERMOST ring (both edges) and index grows inward.
      const fused = p.endCaps && !comp.closed && center.length >= 2;
      return { center, lanes, lengthMm: polylineLength(center), bandHalfMm: ((k - 1) * p.laneSpacingMm) / 2, fused };
    });

    if (p.colorStrategy === "largestFirst") {
      // Longest pipes get the accent colors — deterministic, no rng draw.
      const byLength = [...comps].sort((a, b) => b.lengthMm - a.lengthMm);
      const nColored = Math.round(comps.length * p.colorFraction);
      byLength.forEach((c, i) => {
        if (i < nColored) c.stroke = palette[i % palette.length];
      });
    } else {
      let colorIdx = 0;
      for (const c of comps) {
        if (rng() < p.colorFraction) c.stroke = palette[colorIdx++ % palette.length];
      }
    }

    // Per-lane stroke. "band" = the whole pipe carries its accent (or undefined → black).
    // "outlineFill" = the outermost `outlineLanes` on each side get outlineColor, the interior
    // lanes get the pipe's accent (uncoloured pipes fall back to outlineColor, i.e. all-black).
    for (const c of comps) {
      if (p.laneColorMode === "band") {
        c.laneStrokes = c.lanes.map(() => c.stroke);
        continue;
      }
      const n = c.lanes.length;
      const nOut = Math.max(1, Math.min(Math.floor(p.outlineLanes), Math.max(1, Math.floor(n / 2))));
      const interior = c.stroke ?? p.outlineColor;
      c.laneStrokes = c.lanes.map((_, i) => {
        // fused: index 0 = outer ring, grows inward → only a low-index test is an edge.
        // unfused: lanes run edge→edge, so both the first and last nOut are edges.
        const edge = c.fused ? i < nOut : (i < nOut || i >= n - nOut);
        return edge ? p.outlineColor : interior;
      });
    }

    const laneOf = (c: Comp, i: number, l: Polyline): Polyline => {
      const s = c.laneStrokes?.[i];
      return s ? { ...l, stroke: s } : l;
    };

    let all: Polyline[];
    if (p.occlusion) {
      // Seeded z per pipe; higher z passes over and carves a gap into lower pipes.
      const items: OcclItem[] = comps.map((c) => ({
        z: rng(),
        centerline: c.center,
        lanes: c.lanes.map((l, i) => laneOf(c, i, l)),
        bandHalfMm: c.bandHalfMm,
      }));
      all = occlude(items, { gapMm: p.occlusionGapMm, bandHalfMm: bandHalfMax });
    } else {
      all = comps.flatMap((c) => c.lanes.map((l, i) => laneOf(c, i, l)));
    }

    const fitted = fitToCanvas(all, canvas.wMm, canvas.hMm, p.marginMm);
    return { polylines: fitted, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
