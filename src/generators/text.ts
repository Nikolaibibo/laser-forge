// src/generators/text.ts
import type { GeneratorDef, Point, Polyline } from "./types";
import { FUTURAL } from "./hersheyFutural";
import { CURSIVE } from "./hersheyCursive";
import type { HersheyGlyph } from "./hersheyFutural";
import { offsetBand } from "../util/offset";
import { fitToCanvas, polylineLength } from "../util/path";
import { makeRng, randInt } from "../util/random";
import { occlude } from "../util/occlusion";
import type { OcclItem } from "../util/occlusion";

export type HersheyFontId = "simplex" | "cursive";
const FONTS: Record<HersheyFontId, Record<number, HersheyGlyph>> = {
  simplex: FUTURAL,
  cursive: CURSIVE,
};

/** Hershey line height in font units (cap −12 … baseline 9, plus leading). */
const LINE_H = 32;

export type LaidStroke = {
  points: Point[];
  letterIdx: number;
  wordIdx: number;
  lineIdx: number;
};

/**
 * Lay out glyph strokes in font units (y down, cap height 21). Lines are centered
 * on x=0. Each stroke carries letter/word/line indices for coloring & width.
 * Shared with the text-knockout distortion.
 */
export function layoutTextStrokes(
  textStr: string, letterSpacing: number, lineSpacing: number, font: HersheyFontId,
): LaidStroke[] {
  const glyphSet = FONTS[font] ?? FUTURAL;
  const out: LaidStroke[] = [];
  let letterIdx = 0;
  let wordIdx = 0;
  String(textStr).split("\n").forEach((line, lineIdx) => {
    const yOff = lineIdx * LINE_H * lineSpacing;
    const chars = [...line];
    const glyphs = chars.map((ch) => glyphSet[ch.charCodeAt(0)] ?? glyphSet[32]);
    let width = 0;
    for (const g of glyphs) width += g.right - g.left + letterSpacing;
    let cursor = -width / 2;
    chars.forEach((ch, ci) => {
      const g = glyphs[ci];
      if (ch === " ") wordIdx++;
      const xOff = cursor - g.left;
      for (const stroke of g.strokes) {
        out.push({
          points: stroke.map(([x, y]): Point => [x + xOff, y + yOff]),
          letterIdx, wordIdx, lineIdx,
        });
      }
      cursor += g.right - g.left + letterSpacing;
      letterIdx++;
    });
    wordIdx++; // line break = word break
  });
  return out;
}

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

/** Greedy nearest-endpoint ordering. Returns the strokes in pen-travel order, reversed where needed. */
function orderStrokes(strokes: LaidStroke[]): LaidStroke[] {
  if (strokes.length === 0) return [];
  const used = new Uint8Array(strokes.length);
  used[0] = 1;
  const out: LaidStroke[] = [strokes[0]];
  for (let n = 1; n < strokes.length; n++) {
    const tailPts = out[out.length - 1].points;
    const tail = tailPts[tailPts.length - 1];
    let best = -1, bestRev = false, bestD = Infinity;
    for (let i = 0; i < strokes.length; i++) {
      if (used[i]) continue;
      const s = strokes[i].points;
      const dStart = Math.hypot(s[0][0] - tail[0], s[0][1] - tail[1]);
      const dEnd = Math.hypot(s[s.length - 1][0] - tail[0], s[s.length - 1][1] - tail[1]);
      if (dStart < bestD) { bestD = dStart; best = i; bestRev = false; }
      if (dEnd < bestD) { bestD = dEnd; best = i; bestRev = true; }
    }
    used[best] = 1;
    const src = strokes[best];
    out.push(bestRev ? { ...src, points: [...src.points].reverse() } : src);
  }
  return out;
}

/** Gentle connector arc from a to b: quadratic bezier, control point pushed downward. */
function connectorArc(a: Point, b: Point, samples = 12): Point[] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const dist = Math.hypot(dx, dy) || 1;
  // Perpendicular, flipped so the bulge goes toward +y (below the baseline — cursive swing).
  let px = -dy / dist, py = dx / dist;
  if (py < 0) { px = -px; py = -py; }
  const cx = a[0] + dx / 2 + px * dist * 0.25;
  const cy = a[1] + dy / 2 + py * dist * 0.25;
  const pts: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]]);
  }
  return pts;
}

type Params = {
  text: string;           // \n for multiple lines, centered
  font: HersheyFontId;
  lanesMin: number;       // band width per LETTER is seeded from [lanesMin, lanesMax]
  lanesMax: number;
  laneSpacingMm: number;  // in font units before fitToCanvas (cap height = 21)
  letterSpacing: number;  // extra tracking (font units)
  lineSpacing: number;    // line height multiplier
  joinStrokes: boolean;   // flowing ribbon: connector bands between strokes, occluded by the letters
  occlusionGap: number;   // clear gap (font units) letters carve into connectors (joinStrokes)
  cornerSmooth: number;   // Chaikin iterations on the centerline (rounds miters)
  endCaps: boolean;       // close band ends with nested semicircular caps
  rotationDeg: number;    // rotates the whole text block (90 = vertical for portrait)
  colorBy: "none" | "letter" | "word" | "line";
  colorCount: number;     // 1..6 — how many of the color slots below form the palette
  color1: string; color2: string; color3: string;
  color4: string; color5: string; color6: string;
  marginMm: number;
};

const DEFAULTS: Params = {
  text: "FLOW",
  font: "simplex",
  lanesMin: 6, lanesMax: 6, laneSpacingMm: 0.9, letterSpacing: 2, lineSpacing: 1.5,
  joinStrokes: false, occlusionGap: 1.5, cornerSmooth: 2, endCaps: true,
  rotationDeg: 0,
  colorBy: "letter",
  colorCount: 3,
  color1: "#e0584f", color2: "#4f86e0", color3: "#5fcaa8",
  color4: "#e8a33d", color5: "#8d5fc9", color6: "#e96a3a",
  marginMm: 20,
};

export const text: GeneratorDef<Params> = {
  id: "text",
  name: "Text Ribbons",
  description:
    "Single-stroke Hershey lettering (Simplex or Cursive) rendered as dense offset bands — each glyph stroke becomes a K-lane ribbon with capped ends; band width per letter is seeded from [lanesMin, lanesMax]. colorBy cycles the palette per letter/word/line. joinStrokes turns the text into one flowing ribbon: connector bands swing between strokes and the letters carve over/under gaps into them (occlusionGap). Layout is centered per line; fit fills the page.",
  defaults: DEFAULTS,
  schema: {
    text: { value: DEFAULTS.text },
    font: { value: DEFAULTS.font, options: ["simplex", "cursive"] },
    lanesMin: { value: DEFAULTS.lanesMin, min: 2, max: 16, step: 1 },
    lanesMax: { value: DEFAULTS.lanesMax, min: 2, max: 16, step: 1 },
    laneSpacingMm: { value: DEFAULTS.laneSpacingMm, min: 0.3, max: 3, step: 0.1 },
    letterSpacing: { value: DEFAULTS.letterSpacing, min: -4, max: 12, step: 0.5 },
    lineSpacing: { value: DEFAULTS.lineSpacing, min: 0.8, max: 3, step: 0.1 },
    joinStrokes: { value: DEFAULTS.joinStrokes },
    occlusionGap: { value: DEFAULTS.occlusionGap, min: 0, max: 6, step: 0.1 },
    cornerSmooth: { value: DEFAULTS.cornerSmooth, min: 0, max: 4, step: 1 },
    endCaps: { value: DEFAULTS.endCaps },
    rotationDeg: { value: DEFAULTS.rotationDeg, min: -180, max: 180, step: 5 },
    colorBy: { value: DEFAULTS.colorBy, options: ["none", "letter", "word", "line"] },
    colorCount: { value: DEFAULTS.colorCount, min: 1, max: 6, step: 1 },
    color1: { value: DEFAULTS.color1 },
    color2: { value: DEFAULTS.color2, render: (get) => get("Text Ribbons.colorCount") >= 2 },
    color3: { value: DEFAULTS.color3, render: (get) => get("Text Ribbons.colorCount") >= 3 },
    color4: { value: DEFAULTS.color4, render: (get) => get("Text Ribbons.colorCount") >= 4 },
    color5: { value: DEFAULTS.color5, render: (get) => get("Text Ribbons.colorCount") >= 5 },
    color6: { value: DEFAULTS.color6, render: (get) => get("Text Ribbons.colorCount") >= 6 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 50, step: 1 },
  },
  generate: (p, seed, canvas) => {
    const rng = makeRng(seed);
    const strokes = layoutTextStrokes(p.text, p.letterSpacing, p.lineSpacing, p.font);

    const lanesLo = Math.max(2, Math.floor(Math.min(p.lanesMin, p.lanesMax)));
    const lanesHi = Math.max(2, Math.floor(Math.max(p.lanesMin, p.lanesMax)));
    const palette = [p.color1, p.color2, p.color3, p.color4, p.color5, p.color6]
      .slice(0, Math.min(6, Math.max(1, Math.round(p.colorCount))));
    const colorOf = (s: LaidStroke): string | undefined => {
      if (p.colorBy === "none") return undefined;
      const idx = p.colorBy === "letter" ? s.letterIdx : p.colorBy === "word" ? s.wordIdx : s.lineIdx;
      return palette[idx % palette.length];
    };

    // Per-letter lane count (strokes of one letter share a width). letterIdx is
    // monotonic in layout order, so the draw sequence is deterministic.
    const lanesOfLetter = new Map<number, number>();
    for (const s of strokes) {
      if (!lanesOfLetter.has(s.letterIdx)) {
        lanesOfLetter.set(s.letterIdx, lanesLo === lanesHi ? lanesLo : randInt(rng, lanesLo, lanesHi));
      }
    }

    const bandFor = (center: Point[], k: number): Polyline[] => {
      let c = center;
      for (let i = 0; i < p.cornerSmooth; i++) c = chaikinPass(c);
      return offsetBand(c, k, p.laneSpacingMm, {
        minInnerRadiusMm: p.laneSpacingMm,
        miterLimit: 2, // glyphs have sharp corners — keep miter spikes short
        endCaps: p.endCaps,
        capSamples: 10,
      });
    };

    let bands: Polyline[];
    if (!p.joinStrokes) {
      bands = strokes.flatMap((s) => {
        if (s.points.length < 2) return [];
        const stroke = colorOf(s);
        return bandFor(s.points, lanesOfLetter.get(s.letterIdx)!).map((l) => (stroke ? { ...l, stroke } : l));
      });
    } else {
      // Flowing ribbon: order strokes for pen travel, swing connector bands between
      // them, and let the LETTERS carve over/under gaps into the connectors.
      const ordered = orderStrokes(strokes.filter((s) => s.points.length >= 2));
      const items: OcclItem[] = [];
      let maxBandHalf = 0;
      for (const s of ordered) {
        const k = lanesOfLetter.get(s.letterIdx)!;
        maxBandHalf = Math.max(maxBandHalf, ((k - 1) * p.laneSpacingMm) / 2);
        const stroke = colorOf(s);
        items.push({
          z: 1, // letters above connectors; equal z between letters = no mutual carving
          centerline: s.points,
          lanes: bandFor(s.points, k).map((l) => (stroke ? { ...l, stroke } : l)),
          bandHalfMm: ((k - 1) * p.laneSpacingMm) / 2,
        });
      }
      for (let i = 0; i < ordered.length - 1; i++) {
        const a = ordered[i], b = ordered[i + 1];
        const tail = a.points[a.points.length - 1];
        const head = b.points[0];
        if (Math.hypot(head[0] - tail[0], head[1] - tail[1]) < 1e-6) continue;
        const k = lanesOfLetter.get(a.letterIdx)!;
        const center = connectorArc(tail, head);
        const stroke = colorOf(a); // connector inherits its source letter's color
        items.push({
          z: 0,
          centerline: center,
          lanes: bandFor(center, k).map((l) => (stroke ? { ...l, stroke } : l)),
          bandHalfMm: ((k - 1) * p.laneSpacingMm) / 2,
        });
      }
      bands = p.occlusionGap > 0
        ? occlude(items, { gapMm: p.occlusionGap, bandHalfMm: maxBandHalf })
            // anti-confetti: occlusion leaves tiny fragments where connectors graze letters
            .filter((l) => polylineLength(l.points) >= p.occlusionGap)
        : items.flatMap((it) => it.lanes);
    }

    // Rotate the finished bands (connector swings stay baseline-relative); fit re-centers.
    if (p.rotationDeg !== 0) {
      const th = (p.rotationDeg * Math.PI) / 180;
      const cos = Math.cos(th), sin = Math.sin(th);
      bands = bands.map((l) => ({
        ...l,
        points: l.points.map(([x, y]): Point => [x * cos - y * sin, x * sin + y * cos]),
      }));
    }

    const fitted = fitToCanvas(bands, canvas.wMm, canvas.hMm, p.marginMm);
    return { polylines: fitted, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
