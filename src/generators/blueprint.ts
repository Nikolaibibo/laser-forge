// src/generators/blueprint.ts — Drawscape-style blueprint composition: imported
// SVG motif framed by Hershey single-stroke typography. Template A "Classic".
// Spec: docs/superpowers/specs/2026-06-04-blueprint-layout-module-design.md
// Reads the imported motif from the app store (only impurity — same motif +
// same params → identical output; seed is unused, the layout has no randomness).
import type { GeneratorDef, Point, Polyline } from "./types";
import { layoutTextStrokes, FONT_IDS, type HersheyFontId } from "./text";
import { fitToCanvas, polylineBounds } from "../util/path";
import { useApp } from "../state/store";

type Params = {
  template: "classic";
  header: string;
  title: string;
  subtitle: string;
  meta: string;
  footer: string;
  titleFont: HersheyFontId;
  metaFont: HersheyFontId;
  /** Cap heights as % of canvas height — typography scales with the paper format. */
  titleSize: number;
  metaSize: number;
  frameInsetMm: number;
  cornerMarks: boolean;
  motifScale: number;
  accentTarget: "none" | "frame" | "meta";
  accentColor: string;
};

const DEFAULTS: Params = {
  template: "classic",
  header: "",
  title: "OMEGA CALIBER 321",
  subtitle: "",
  meta: "",
  footer: "",
  titleFont: "serif",
  metaFont: "simplex",
  titleSize: 3.8, // ≈8mm on A5 — calibrated against the original mm defaults
  metaSize: 1.4,  // ≈3mm on A5
  frameInsetMm: 8,
  cornerMarks: false,
  motifScale: 0.8,
  accentTarget: "none",
  accentColor: "#1a3a52",
};

const LETTER_SPACING = 2; // font units — matches the text generator's feel
const LINE_SPACING = 1.3;
const CAP_UNITS = 21; // Hershey glyph extent (cap −12 … baseline 9)

/** Minimum fraction of inner height reserved for the motif slot. */
const MIN_SLOT_FRAC = 0.2;

type Block = { lines: Polyline[]; wMm: number; hMm: number };

/**
 * Lay out a text block in mm, local coords: glyph bbox top at y=0, centered on
 * x=0. Empty/whitespace-only text → null (the slot collapses, per spec).
 * Caps at capMm; if the widest line would exceed maxWMm the block scales down.
 */
function block(
  str: string,
  font: HersheyFontId,
  capMm: number,
  maxWMm: number,
  stroke?: string,
): Block | null {
  const t = str.trim();
  if (!t) return null;
  const strokes = layoutTextStrokes(t, LETTER_SPACING, LINE_SPACING, font);
  const raw: Polyline[] = strokes
    .filter((s) => s.points.length >= 2)
    .map((s) => ({ points: s.points, closed: false, stroke }));
  if (raw.length === 0) return null;
  const b = polylineBounds(raw);
  const wUnits = b.maxX - b.minX || 1;
  const hUnits = b.maxY - b.minY || 1;
  let scale = capMm / CAP_UNITS;
  if (wUnits * scale > maxWMm) scale = maxWMm / wUnits;
  const lines = raw.map((l) => ({
    ...l,
    points: l.points.map(([x, y]): Point => [
      (x - (b.minX + b.maxX) / 2) * scale,
      (y - b.minY) * scale,
    ]),
  }));
  return { lines, wMm: wUnits * scale, hMm: hUnits * scale };
}

const translate = (lines: Polyline[], dx: number, dy: number): Polyline[] =>
  lines.map((l) => ({ ...l, points: l.points.map(([x, y]): Point => [x + dx, y + dy]) }));

export const blueprint: GeneratorDef<Params> = {
  id: "blueprint",
  name: "Blueprint",
  description:
    "Drawscape-style blueprint composition: an imported SVG motif (vpype-flat, " +
    "loaded via the Motif panel) framed by Hershey single-stroke typography. " +
    "Template A: header / motif / title / subtitle / meta / footer, centered " +
    "stack inside a thin frame. Empty text slots collapse. Canvas size = paper " +
    "format (80×80, 100×100, 148×210, 210×297).",
  defaults: DEFAULTS,
  schema: {
    template: { value: DEFAULTS.template, options: ["classic"] },
    header: { value: DEFAULTS.header },
    title: { value: DEFAULTS.title },
    subtitle: { value: DEFAULTS.subtitle },
    meta: { value: DEFAULTS.meta },
    footer: { value: DEFAULTS.footer },
    titleFont: { value: DEFAULTS.titleFont, options: FONT_IDS },
    metaFont: { value: DEFAULTS.metaFont, options: FONT_IDS },
    titleSize: { value: DEFAULTS.titleSize, min: 1.5, max: 10, step: 0.1 },
    metaSize: { value: DEFAULTS.metaSize, min: 0.5, max: 4, step: 0.05 },
    frameInsetMm: { value: DEFAULTS.frameInsetMm, min: 3, max: 25, step: 0.5 },
    cornerMarks: { value: DEFAULTS.cornerMarks },
    motifScale: { value: DEFAULTS.motifScale, min: 0.3, max: 1, step: 0.05 },
    accentTarget: { value: DEFAULTS.accentTarget, options: ["none", "frame", "meta"] },
    accentColor: { value: DEFAULTS.accentColor, render: (get) => get("Blueprint.accentTarget") !== "none" },
  },
  generate: (p, _seed, canvas) => {
    const out: Polyline[] = [];
    const accent = (t: "frame" | "meta") => (p.accentTarget === t ? p.accentColor : undefined);

    // Frame — always polylines[0] (blueprint-test relies on it).
    const fx0 = p.frameInsetMm;
    const fy0 = p.frameInsetMm;
    const fx1 = canvas.wMm - p.frameInsetMm;
    const fy1 = canvas.hMm - p.frameInsetMm;
    out.push({
      closed: true,
      stroke: accent("frame"),
      points: [[fx0, fy0], [fx1, fy0], [fx1, fy1], [fx0, fy1]],
    });

    // Corner marks: crop-mark style, outside the frame, aligned with its edges.
    if (p.cornerMarks) {
      const o = 2;
      // marks live in the inset band: 2mm off the frame, 1–4mm long, never past the canvas edge
      const len = Math.max(1, Math.min(4, p.frameInsetMm - o - 0.5));
      const corners: [number, number, number, number][] = [
        [fx0, fy0, -1, -1],
        [fx1, fy0, 1, -1],
        [fx1, fy1, 1, 1],
        [fx0, fy1, -1, 1],
      ];
      for (const [x, y, sxn, syn] of corners) {
        out.push({ closed: false, points: [[x + sxn * o, y], [x + sxn * (o + len), y]] });
        out.push({ closed: false, points: [[x, y + syn * o], [x, y + syn * (o + len)]] });
      }
    }

    // Inner content area.
    const pad = Math.max(3, Math.min(canvas.wMm, canvas.hMm) * 0.03);
    const ix0 = fx0 + pad;
    const ix1 = fx1 - pad;
    const iy0 = fy0 + pad;
    const iy1 = fy1 - pad;
    const cx = (ix0 + ix1) / 2;
    const maxW = ix1 - ix0;

    // Build all text blocks and gaps at scale s (1 = requested sizes).
    // Width-clamping inside block() can only make blocks shorter than linear,
    // so a single pass with the computed s is sufficient to fit the stack.
    // Type sizes are % of canvas height — typography stays proportional across formats.
    const titleMm = (p.titleSize / 100) * canvas.hMm;
    const metaMm = (p.metaSize / 100) * canvas.hMm;
    const buildBlocks = (s: number) => {
      const gap = metaMm * 0.9 * s;
      // gap above title scales with title size (visual weight), unlike the meta-driven inter-slot gap
      const titleGap = titleMm * 0.8 * s;
      const header   = block(p.header.toUpperCase(), p.metaFont, metaMm * s, maxW);
      const title    = block(p.title.toUpperCase(), p.titleFont, titleMm * s, maxW);
      const subtitle = block(p.subtitle, p.metaFont, metaMm * 1.1 * s, maxW);
      const meta     = block(p.meta, p.metaFont, metaMm * s, maxW, accent("meta"));
      const footer   = block(p.footer, p.metaFont, metaMm * 0.8 * s, maxW);
      return { gap, titleGap, header, title, subtitle, meta, footer };
    };

    // Compute total vertical text budget at s=1.
    const b1 = buildBlocks(1);
    let textTotal = 0;
    if (b1.header)   textTotal += b1.header.hMm   + b1.gap;
    if (b1.footer)   textTotal += b1.footer.hMm   + b1.gap;
    if (b1.meta)     textTotal += b1.meta.hMm     + b1.gap;
    if (b1.subtitle) textTotal += b1.subtitle.hMm + b1.gap;
    if (b1.title)    textTotal += b1.title.hMm    + b1.titleGap;

    // Scale down if the text stack would leave less than MIN_SLOT_FRAC for the motif.
    const innerH = iy1 - iy0;
    const minSlotMm = MIN_SLOT_FRAC * innerH;
    let s = 1;
    if (textTotal > 0 && textTotal > innerH - minSlotMm) {
      s = (innerH - minSlotMm) / textTotal;
    }

    // Text blocks (null = collapsed slot). Header/title render uppercased —
    // Hershey has no case transform.
    const { gap, titleGap, header, title, subtitle, meta, footer } = buildBlocks(s);

    // Top-down: header.
    let top = iy0;
    if (header) {
      out.push(...translate(header.lines, cx, top));
      top += header.hMm + gap;
    }

    // Bottom-up: footer, meta, subtitle, title.
    let bottom = iy1;
    if (footer) {
      bottom -= footer.hMm;
      out.push(...translate(footer.lines, cx, bottom));
      bottom -= gap;
    }
    if (meta) {
      bottom -= meta.hMm;
      out.push(...translate(meta.lines, cx, bottom));
      bottom -= gap;
    }
    if (subtitle) {
      bottom -= subtitle.hMm;
      out.push(...translate(subtitle.lines, cx, bottom));
      bottom -= gap;
    }
    if (title) {
      bottom -= title.hMm;
      out.push(...translate(title.lines, cx, bottom));
      bottom -= titleGap; // breathing room between motif and title
    }

    // Motif slot: whatever vertical space remains.
    // Math.max(1, …) is purely numeric safety — after scaling, slot is ≥ minSlotMm whenever any text exists.
    const slotH = Math.max(1, bottom - top);
    const mw = maxW * p.motifScale;
    const mh = slotH * p.motifScale;
    const mx = ix0 + (maxW - mw) / 2;
    const my = top + (slotH - mh) / 2;
    const motif = useApp.getState().motif;
    if (motif && motif.polylines.length > 0) {
      out.push(...translate(fitToCanvas(motif.polylines, mw, mh, 0), mx, my));
    } else {
      // Placeholder: slot box + diagonals, so the layout stays tunable.
      out.push({ closed: true, points: [[mx, my], [mx + mw, my], [mx + mw, my + mh], [mx, my + mh]] });
      out.push({ closed: false, points: [[mx, my], [mx + mw, my + mh]] });
      out.push({ closed: false, points: [[mx + mw, my], [mx, my + mh]] });
    }

    return { polylines: out, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
