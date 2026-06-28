// src/generators/blueprint.ts — Drawscape-style blueprint composition: imported
// SVG motif framed by Hershey single-stroke typography. Template A "Classic".
// Spec: docs/superpowers/specs/2026-06-04-blueprint-layout-module-design.md
// Reads the imported motif from the app store (only impurity — same motif +
// same params → identical output; seed is unused, the layout has no randomness).
import type { GeneratorDef, Polyline } from "./types";
import { FONT_IDS, type HersheyFontId } from "./text";
import {
  textBlock,
  translateLines,
  placeMotif,
  drawFrame,
} from "./layout/kit";

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
  /** Rotate the imported motif before fitting (degrees, exact quarter turns). */
  motifRotation: 0 | 90 | 180 | 270;
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
  motifRotation: 0,
  accentTarget: "none",
  accentColor: "#1a3a52",
};

/** Minimum fraction of inner height reserved for the motif slot. */
const MIN_SLOT_FRAC = 0.2;

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
    motifRotation: { value: DEFAULTS.motifRotation, options: [0, 90, 180, 270] },
    accentTarget: { value: DEFAULTS.accentTarget, options: ["none", "frame", "meta"] },
    accentColor: { value: DEFAULTS.accentColor, render: (get) => get("Blueprint.accentTarget") !== "none" },
  },
  generate: (p, _seed, canvas) => {
    const out: Polyline[] = [];
    const accent = (t: "frame" | "meta") => (p.accentTarget === t ? p.accentColor : undefined);

    // Frame + corner marks (frame is always polylines[0] — blueprint-test relies on it).
    out.push(...drawFrame(canvas, p.frameInsetMm, p.cornerMarks, accent("frame")));
    const fx0 = p.frameInsetMm;
    const fy0 = p.frameInsetMm;
    const fx1 = canvas.wMm - p.frameInsetMm;
    const fy1 = canvas.hMm - p.frameInsetMm;

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
      const header   = textBlock(p.header.toUpperCase(), p.metaFont, metaMm * s, maxW);
      const title    = textBlock(p.title.toUpperCase(), p.titleFont, titleMm * s, maxW);
      const subtitle = textBlock(p.subtitle, p.metaFont, metaMm * 1.1 * s, maxW);
      const meta     = textBlock(p.meta, p.metaFont, metaMm * s, maxW, accent("meta"));
      const footer   = textBlock(p.footer, p.metaFont, metaMm * 0.8 * s, maxW);
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
      out.push(...translateLines(header.lines, cx, top));
      top += header.hMm + gap;
    }

    // Bottom-up: footer, meta, subtitle, title.
    let bottom = iy1;
    if (footer) {
      bottom -= footer.hMm;
      out.push(...translateLines(footer.lines, cx, bottom));
      bottom -= gap;
    }
    if (meta) {
      bottom -= meta.hMm;
      out.push(...translateLines(meta.lines, cx, bottom));
      bottom -= gap;
    }
    if (subtitle) {
      bottom -= subtitle.hMm;
      out.push(...translateLines(subtitle.lines, cx, bottom));
      bottom -= gap;
    }
    if (title) {
      bottom -= title.hMm;
      out.push(...translateLines(title.lines, cx, bottom));
      bottom -= titleGap; // breathing room between motif and title
    }

    // Motif slot: whatever vertical space remains.
    const slotH = Math.max(1, bottom - top);
    out.push(...placeMotif({ x: ix0, y: top, w: maxW, h: slotH }, p.motifScale, p.motifRotation));

    return { polylines: out, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
