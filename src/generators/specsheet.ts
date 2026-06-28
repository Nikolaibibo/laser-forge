// src/generators/specsheet.ts — Spec Sheet layout (Template B): an imported SVG
// motif over a block of labelled data rows with dotted leaders. Reads the motif
// from the app store (only impurity — same motif + params → identical output;
// seed unused). Spec: docs/superpowers/specs/2026-06-28-spec-sheet-layout-design.md
import type { GeneratorDef, Polyline } from "./types";
import { FONT_IDS, type HersheyFontId } from "./text";
import { textBlock, translateLines, placeMotif, drawFrame } from "./layout/kit";

type Params = {
  title: string;
  specs: string; // one "Label: Value" per line
  footer: string;
  titleFont: HersheyFontId;
  bodyFont: HersheyFontId;
  titleSize: number; // cap height as % of canvas height
  specSize: number; // cap height as % of canvas height
  rowSpacing: number;
  motifSlotFrac: number;
  motifScale: number;
  motifRotation: 0 | 90 | 180 | 270;
  frameInsetMm: number;
  cornerMarks: boolean;
  titleRule: boolean;
  leaderStyle: "dots";
  accentTarget: "none" | "frame" | "value";
  accentColor: string;
};

const DEFAULTS: Params = {
  title: "OMEGA CALIBER 321",
  specs: "Diameter: 27mm\nMovement: Cal. 321\nJewels: 17\nYear: 1965",
  footer: "",
  titleFont: "serif",
  bodyFont: "simplex",
  titleSize: 3.4,
  specSize: 1.6,
  rowSpacing: 1.4,
  motifSlotFrac: 0.5,
  motifScale: 0.85,
  motifRotation: 0,
  frameInsetMm: 8,
  cornerMarks: false,
  titleRule: true,
  leaderStyle: "dots",
  accentTarget: "none",
  accentColor: "#1a3a52",
};

export const specsheet: GeneratorDef<Params> = {
  id: "specsheet",
  name: "Spec Sheet",
  description:
    "Spec sheet layout (Template B): an imported SVG motif (loaded via the Motif " +
    "panel) above a block of labelled data rows with dotted leaders, under a ruled " +
    "title. Enter specs as 'Label: Value', one per line. Empty text collapses; the " +
    "row block auto-scales to fit. Canvas size = paper format.",
  defaults: DEFAULTS,
  schema: {
    title: { value: DEFAULTS.title },
    specs: { value: DEFAULTS.specs, rows: 8 },
    footer: { value: DEFAULTS.footer },
    titleFont: { value: DEFAULTS.titleFont, options: FONT_IDS },
    bodyFont: { value: DEFAULTS.bodyFont, options: FONT_IDS },
    titleSize: { value: DEFAULTS.titleSize, min: 1.5, max: 10, step: 0.1 },
    specSize: { value: DEFAULTS.specSize, min: 0.8, max: 5, step: 0.05 },
    rowSpacing: { value: DEFAULTS.rowSpacing, min: 1, max: 2.5, step: 0.05 },
    motifSlotFrac: { value: DEFAULTS.motifSlotFrac, min: 0.3, max: 0.7, step: 0.05 },
    motifScale: { value: DEFAULTS.motifScale, min: 0.3, max: 1, step: 0.05 },
    motifRotation: { value: DEFAULTS.motifRotation, options: [0, 90, 180, 270] },
    frameInsetMm: { value: DEFAULTS.frameInsetMm, min: 3, max: 25, step: 0.5 },
    cornerMarks: { value: DEFAULTS.cornerMarks },
    titleRule: { value: DEFAULTS.titleRule },
    leaderStyle: { value: DEFAULTS.leaderStyle, options: ["dots"] },
    accentTarget: { value: DEFAULTS.accentTarget, options: ["none", "frame", "value"] },
    accentColor: {
      value: DEFAULTS.accentColor,
      render: (get) => get("Spec Sheet.accentTarget") !== "none",
    },
  },
  generate: (p, _seed, canvas) => {
    const out: Polyline[] = [];
    const frameStroke = p.accentTarget === "frame" ? p.accentColor : undefined;
    out.push(...drawFrame(canvas, p.frameInsetMm, p.cornerMarks, frameStroke));

    const pad = Math.max(3, Math.min(canvas.wMm, canvas.hMm) * 0.03);
    const ix0 = p.frameInsetMm + pad;
    const ix1 = canvas.wMm - p.frameInsetMm - pad;
    const iy0 = p.frameInsetMm + pad;
    const iy1 = canvas.hMm - p.frameInsetMm - pad;
    const cx = (ix0 + ix1) / 2;
    const maxW = ix1 - ix0;
    const innerH = iy1 - iy0;
    const slotH = innerH * p.motifSlotFrac;

    // Motif (fixed top slot, never scaled by the fit pass).
    out.push(...placeMotif({ x: ix0, y: iy0, w: maxW, h: slotH }, p.motifScale, p.motifRotation));

    // Title under the motif slot, with optional rule.
    const titleMm = (p.titleSize / 100) * canvas.hMm;
    const specMm = (p.specSize / 100) * canvas.hMm;
    let y = iy0 + slotH + titleMm * 0.4;
    const titleB = textBlock(p.title.toUpperCase(), p.titleFont, titleMm, maxW);
    if (titleB) {
      out.push(...translateLines(titleB.lines, cx, y));
      y += titleB.hMm;
      if (p.titleRule) {
        y += specMm * 0.5;
        out.push({ closed: false, points: [[ix0, y], [ix1, y]] });
        y += specMm * 0.5;
      }
    }

    return { polylines: out, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
