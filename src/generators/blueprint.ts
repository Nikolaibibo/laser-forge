// src/generators/blueprint.ts — Drawscape-style blueprint composition: imported
// SVG motif framed by Hershey single-stroke typography. Template A "Classic".
// Spec: docs/superpowers/specs/2026-06-04-blueprint-layout-module-design.md
// Reads the imported motif from the app store (only impurity — same motif +
// same params → identical output; seed is unused, the layout has no randomness).
import type { GeneratorDef, Polyline, TextLabel } from "./types";
import { FONT_IDS, type HersheyFontId } from "./text";
import {
  textBlock,
  translateLines,
  placeMotif,
  drawFrame,
  type FrameStyle,
} from "./layout/kit";

type TextAlign = "left" | "center" | "right";

type Params = {
  header: string;
  title: string;
  subtitle: string;
  meta: string;
  footer: string;
  titleFont: HersheyFontId;
  metaFont: HersheyFontId;
  /** Cap heights as % of canvas height — typography scales with the paper format.
   *  Each field is independent (header/subtitle/footer no longer derive from meta). */
  titleSize: number;
  metaSize: number;
  headerSize: number;
  subtitleSize: number;
  footerSize: number;
  /** Per-field visibility. A field renders iff its show flag is on AND its text is non-empty. */
  headerShow: boolean;
  subtitleShow: boolean;
  footerShow: boolean;
  /** Horizontal alignment of the whole text stack. */
  textAlign: TextAlign;
  frameStyle: FrameStyle;
  frameInsetMm: number;
  cornerMarks: boolean;
  motifScale: number;
  /** Rotate the imported motif before fitting (degrees, exact quarter turns). */
  motifRotation: 0 | 90 | 180 | 270;
  accentTarget: "none" | "frame" | "meta";
  accentColor: string;
};

const DEFAULTS: Params = {
  header: "",
  title: "OMEGA CALIBER 321",
  subtitle: "",
  meta: "",
  footer: "",
  titleFont: "serif",
  metaFont: "simplex",
  titleSize: 3.8,    // ≈8mm on A5 — calibrated against the original mm defaults
  metaSize: 1.4,     // ≈3mm on A5
  headerSize: 1.4,   // was hard-wired to metaSize
  subtitleSize: 1.6, // was hard-wired to metaSize × 1.1
  footerSize: 1.1,   // was hard-wired to metaSize × 0.8
  headerShow: true,
  subtitleShow: true,
  footerShow: true,
  textAlign: "center",
  frameStyle: "single",
  frameInsetMm: 8,
  cornerMarks: false,
  motifScale: 0.8,
  motifRotation: 0,
  accentTarget: "none",
  accentColor: "#1a3a52",
};

/** Minimum fraction of inner height reserved for the motif slot. */
const MIN_SLOT_FRAC = 0.2;

/** Single-stroke text reads cleanly at cap height ≳ 8× the pen width (real plot
 *  test: 3mm cap at a 1mm pen blobs; ~8mm at 1mm is crisp). Below this we warn. */
const MIN_CAP_RATIO = 8;

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
    header: { value: DEFAULTS.header },
    title: { value: DEFAULTS.title },
    subtitle: { value: DEFAULTS.subtitle },
    meta: { value: DEFAULTS.meta },
    footer: { value: DEFAULTS.footer },
    titleFont: { value: DEFAULTS.titleFont, options: FONT_IDS },
    metaFont: { value: DEFAULTS.metaFont, options: FONT_IDS },
    titleSize: { value: DEFAULTS.titleSize, min: 1.5, max: 10, step: 0.1 },
    metaSize: { value: DEFAULTS.metaSize, min: 0.5, max: 4, step: 0.05 },
    headerSize: { value: DEFAULTS.headerSize, min: 0.5, max: 6, step: 0.05 },
    subtitleSize: { value: DEFAULTS.subtitleSize, min: 0.5, max: 6, step: 0.05 },
    footerSize: { value: DEFAULTS.footerSize, min: 0.5, max: 6, step: 0.05 },
    headerShow: { value: DEFAULTS.headerShow },
    subtitleShow: { value: DEFAULTS.subtitleShow },
    footerShow: { value: DEFAULTS.footerShow },
    textAlign: { value: DEFAULTS.textAlign, options: ["left", "center", "right"] },
    frameStyle: { value: DEFAULTS.frameStyle, options: ["none", "single", "double"] },
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

    // Frame + corner marks. For frameStyle "single"/"double" the frame rect is
    // polylines[0] (blueprint-test relies on it); "none" emits no frame.
    out.push(...drawFrame(canvas, p.frameInsetMm, p.cornerMarks, accent("frame"), p.frameStyle));
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
    const titleMm    = (p.titleSize / 100) * canvas.hMm;
    const metaMm     = (p.metaSize / 100) * canvas.hMm;
    const headerMm   = (p.headerSize / 100) * canvas.hMm;
    const subtitleMm = (p.subtitleSize / 100) * canvas.hMm;
    const footerMm   = (p.footerSize / 100) * canvas.hMm;
    const buildBlocks = (s: number) => {
      const gap = metaMm * 0.9 * s;
      // gap above title scales with title size (visual weight), unlike the meta-driven inter-slot gap
      const titleGap = titleMm * 0.8 * s;
      // Each field sizes independently; header/subtitle/footer also gate on their show flag.
      const header   = p.headerShow   ? textBlock(p.header.toUpperCase(), p.metaFont, headerMm * s, maxW) : null;
      const title    = textBlock(p.title.toUpperCase(), p.titleFont, titleMm * s, maxW);
      const subtitle = p.subtitleShow ? textBlock(p.subtitle, p.metaFont, subtitleMm * s, maxW) : null;
      const meta     = textBlock(p.meta, p.metaFont, metaMm * s, maxW, accent("meta"));
      const footer   = p.footerShow   ? textBlock(p.footer, p.metaFont, footerMm * s, maxW) : null;
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

    // Blocks are centered on local x=0; align shifts the whole block left/right
    // within the inner content area [ix0, ix1] (multi-line stays internally centered).
    const alignX = (bw: number) =>
      p.textAlign === "left" ? ix0 + bw / 2
      : p.textAlign === "right" ? ix1 - bw / 2
      : cx;
    // Anchor for the editable <text> mirror (SVG text-anchor: start/middle/end).
    const anchorX = p.textAlign === "left" ? ix0 : p.textAlign === "right" ? ix1 : cx;
    const labels: TextLabel[] = [];
    const label = (field: string, text: string, topMm: number, capMm: number, font: string) =>
      labels.push({ field, text, xMm: anchorX, yMm: topMm + capMm, capMm, font, align: p.textAlign });

    // Top-down: header.
    let top = iy0;
    if (header) {
      out.push(...translateLines(header.lines, alignX(header.wMm), top));
      label("header", p.header.toUpperCase(), top, headerMm * s, p.metaFont);
      top += header.hMm + gap;
    }

    // Bottom-up: footer, meta, subtitle, title.
    let bottom = iy1;
    if (footer) {
      bottom -= footer.hMm;
      out.push(...translateLines(footer.lines, alignX(footer.wMm), bottom));
      label("footer", p.footer, bottom, footerMm * s, p.metaFont);
      bottom -= gap;
    }
    if (meta) {
      bottom -= meta.hMm;
      out.push(...translateLines(meta.lines, alignX(meta.wMm), bottom));
      label("meta", p.meta, bottom, metaMm * s, p.metaFont);
      bottom -= gap;
    }
    if (subtitle) {
      bottom -= subtitle.hMm;
      out.push(...translateLines(subtitle.lines, alignX(subtitle.wMm), bottom));
      label("subtitle", p.subtitle, bottom, subtitleMm * s, p.metaFont);
      bottom -= gap;
    }
    if (title) {
      bottom -= title.hMm;
      out.push(...translateLines(title.lines, alignX(title.wMm), bottom));
      label("title", p.title.toUpperCase(), bottom, titleMm * s, p.titleFont);
      bottom -= titleGap; // breathing room between motif and title
    }

    // Motif slot: whatever vertical space remains.
    const slotH = Math.max(1, bottom - top);
    out.push(...placeMotif({ x: ix0, y: top, w: maxW, h: slotH }, p.motifScale, p.motifRotation));

    // Pen-width-aware warnings (non-blocking; do not alter geometry).
    const pen = canvas.penWidthMm ?? 0.3;
    const minCap = MIN_CAP_RATIO * pen;
    const warnings: string[] = [];
    const checkCap = (label: string, capMm: number, block: unknown) => {
      if (block && capMm < minCap)
        warnings.push(
          `${label} cap ${(capMm).toFixed(1)}mm is small for a ${pen}mm pen — recommend ≥${minCap.toFixed(1)}mm`,
        );
    };
    checkCap("Title", titleMm * s, title);
    checkCap("Meta", metaMm * s, meta);
    checkCap("Header", headerMm * s, header);
    checkCap("Subtitle", subtitleMm * s, subtitle);
    checkCap("Footer", footerMm * s, footer);
    if (s < 0.999)
      warnings.push(
        `Text scaled to ${Math.round(s * 100)}% to fit the frame — enlarge the canvas or reduce sizes.`,
      );

    return {
      polylines: out,
      widthMm: canvas.wMm,
      heightMm: canvas.hMm,
      warnings: warnings.length ? warnings : undefined,
      labels,
      source: { generator: "blueprint", params: { ...p } },
    };
  },
};
