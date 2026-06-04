// src/generators/text.ts
import type { GeneratorDef, Point, Polyline } from "./types";
import { FUTURAL } from "./hersheyFutural";
import { offsetBand } from "../util/offset";
import { fitToCanvas } from "../util/path";

type Params = {
  text: string;           // \n for multiple lines, centered
  lanes: number;
  laneSpacingMm: number;  // in font units before fitToCanvas (cap height = 21)
  letterSpacing: number;  // extra tracking (font units)
  lineSpacing: number;    // line height multiplier
  joinStrokes: boolean;   // chain all strokes into one continuous flowing ribbon
  cornerSmooth: number;   // Chaikin iterations on the centerline (rounds miters)
  endCaps: boolean;       // close band ends with nested semicircular caps
  marginMm: number;
};

const DEFAULTS: Params = {
  text: "FLOW",
  lanes: 6, laneSpacingMm: 0.9, letterSpacing: 2, lineSpacing: 1.5,
  joinStrokes: false, cornerSmooth: 2, endCaps: true, marginMm: 20,
};

/** Hershey line height in font units (cap −12 … baseline 9, plus leading). */
const LINE_H = 32;

/** One Chaikin corner-cutting pass on an open polyline. */
const chaikinPass = (pts: Point[]): Point[] => {
  if (pts.length < 3) return pts;
  const out: Point[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push([a[0] + (b[0] - a[0]) * 0.25, a[1] + (b[1] - a[1]) * 0.25]);
    out.push([a[0] + (b[0] - a[0]) * 0.75, a[1] + (b[1] - a[1]) * 0.75]);
  }
  out.push(pts[pts.length - 1]);
  return out;
};

/** Greedy nearest-endpoint chaining: strokes become one continuous centerline. */
function chainStrokes(strokes: Point[][]): Point[] {
  if (strokes.length === 0) return [];
  const used = new Uint8Array(strokes.length);
  used[0] = 1;
  let chain: Point[] = [...strokes[0]];
  for (let n = 1; n < strokes.length; n++) {
    const tail = chain[chain.length - 1];
    let best = -1, bestRev = false, bestD = Infinity;
    for (let i = 0; i < strokes.length; i++) {
      if (used[i]) continue;
      const s = strokes[i];
      const dStart = Math.hypot(s[0][0] - tail[0], s[0][1] - tail[1]);
      const dEnd = Math.hypot(s[s.length - 1][0] - tail[0], s[s.length - 1][1] - tail[1]);
      if (dStart < bestD) { bestD = dStart; best = i; bestRev = false; }
      if (dEnd < bestD) { bestD = dEnd; best = i; bestRev = true; }
    }
    used[best] = 1;
    const s = bestRev ? [...strokes[best]].reverse() : strokes[best];
    chain = chain.concat(s); // direct connector segment — the band flows through
  }
  return chain;
}

export const text: GeneratorDef<Params> = {
  id: "text",
  name: "Text Ribbons",
  description:
    "Single-stroke Hershey lettering (Simplex) rendered as dense offset bands — each glyph stroke becomes a K-lane ribbon. cornerSmooth rounds sharp letter corners before offsetting. joinStrokes (experimental) chains all strokes into one continuous ribbon — connectors run through the letters, organic but barely legible. Layout is centered per line; fit fills the page.",
  defaults: DEFAULTS,
  schema: {
    text: { value: DEFAULTS.text },
    lanes: { value: DEFAULTS.lanes, min: 2, max: 16, step: 1 },
    laneSpacingMm: { value: DEFAULTS.laneSpacingMm, min: 0.3, max: 3, step: 0.1 },
    letterSpacing: { value: DEFAULTS.letterSpacing, min: -4, max: 12, step: 0.5 },
    lineSpacing: { value: DEFAULTS.lineSpacing, min: 0.8, max: 3, step: 0.1 },
    joinStrokes: { value: DEFAULTS.joinStrokes },
    cornerSmooth: { value: DEFAULTS.cornerSmooth, min: 0, max: 4, step: 1 },
    endCaps: { value: DEFAULTS.endCaps },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 50, step: 1 },
  },
  generate: (p, _seed, canvas) => {
    // Lay out glyph strokes in font units; one stroke list per text line.
    const lines = String(p.text).split("\n");
    const allStrokes: Point[][] = [];
    lines.forEach((line, li) => {
      const yOff = li * LINE_H * p.lineSpacing;
      // First pass: measure line width for centering.
      let width = 0;
      const glyphs = [...line].map((ch) => FUTURAL[ch.charCodeAt(0)] ?? FUTURAL[32]);
      for (const g of glyphs) width += g.right - g.left + p.letterSpacing;
      let cursor = -width / 2;
      for (const g of glyphs) {
        const xOff = cursor - g.left;
        for (const stroke of g.strokes) {
          allStrokes.push(stroke.map(([x, y]): Point => [x + xOff, y + yOff]));
        }
        cursor += g.right - g.left + p.letterSpacing;
      }
    });

    const centerlines: Point[][] = p.joinStrokes ? [chainStrokes(allStrokes)] : allStrokes;

    const bands: Polyline[] = [];
    for (let center of centerlines) {
      if (center.length < 2) continue;
      for (let i = 0; i < p.cornerSmooth; i++) center = chaikinPass(center);
      bands.push(...offsetBand(center, Math.max(2, Math.floor(p.lanes)), p.laneSpacingMm, {
        minInnerRadiusMm: p.laneSpacingMm,
        endCaps: p.endCaps,
        capSamples: 10,
      }));
    }

    const fitted = fitToCanvas(bands, canvas.wMm, canvas.hMm, p.marginMm);
    return { polylines: fitted, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
