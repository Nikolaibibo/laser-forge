// src/generators/specsheet.ts — Spec Sheet layout (Template B): an imported SVG
// motif over a block of labelled data rows with dotted leaders. Reads the motif
// from the app store (only impurity — same motif + params → identical output;
// seed unused). Spec: docs/superpowers/specs/2026-06-28-spec-sheet-layout-design.md
import type { GeneratorDef, Polyline } from "./types";
import { FONT_IDS, type HersheyFontId } from "./text";
import { textBlock, translateLines, placeMotif, drawFrame, type Block } from "./layout/kit";

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

/**
 * A run of '.' glyphs (bodyFont) whose laid-out width fits within gapMm, centered
 * on x=0 like any textBlock. Returns null when even one dot would overflow.
 */
function leaderDots(gapMm: number, capMm: number, font: HersheyFontId): Block | null {
  if (gapMm <= 0) return null;
  const one = textBlock(".", font, capMm, Infinity);
  if (!one || one.wMm > gapMm) return null;
  const two = textBlock("..", font, capMm, Infinity);
  const pitch = two ? Math.max(0.1, two.wMm - one.wMm) : one.wMm;
  const n = Math.max(1, Math.floor((gapMm - one.wMm) / pitch) + 1);
  return textBlock(".".repeat(n), font, capMm, Infinity);
}

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

    const valueStroke = p.accentTarget === "value" ? p.accentColor : undefined;
    const specLines = p.specs.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

    // Bottom-anchored footer is measured first so the row budget can reserve its space.
    const footerB = p.footer.trim()
      ? textBlock(p.footer, p.bodyFont, (p.specSize / 100) * canvas.hMm * 0.8, maxW)
      : null;
    const footerReserve = footerB ? footerB.hMm + (p.specSize / 100) * canvas.hMm : 0;

    // Build title + rows at text-scale s; returns the polylines and consumed height
    // (top of title-area to baseline after the last row).
    const buildText = (s: number): { lines: Polyline[]; height: number } => {
      const titleMm = (p.titleSize / 100) * canvas.hMm * s;
      const specMm = (p.specSize / 100) * canvas.hMm * s;
      const leaderPad = specMm * 0.6;
      const acc: Polyline[] = [];
      const top = iy0 + slotH + titleMm * 0.4;
      let y = top;
      const titleB = textBlock(p.title.toUpperCase(), p.titleFont, titleMm, maxW);
      if (titleB) {
        acc.push(...translateLines(titleB.lines, cx, y));
        y += titleB.hMm;
        if (p.titleRule) {
          y += specMm * 0.5;
          acc.push({ closed: false, points: [[ix0, y], [ix1, y]] });
          y += specMm * 0.5;
        }
        y += specMm * (p.rowSpacing - 1) * 0.5;
      }
      for (const line of specLines) {
        const ci = line.indexOf(":");
        const label = (ci >= 0 ? line.slice(0, ci) : line).trim();
        const value = ci >= 0 ? line.slice(ci + 1).trim() : "";
        const labelB = textBlock(label, p.bodyFont, specMm, maxW);
        if (labelB) {
          acc.push(...translateLines(labelB.lines, ix0 + labelB.wMm / 2, y));
          const labelEnd = ix0 + labelB.wMm;
          if (value) {
            const valueB = textBlock(value, p.bodyFont, specMm, maxW, valueStroke);
            if (valueB) {
              acc.push(...translateLines(valueB.lines, ix1 - valueB.wMm / 2, y));
              const gap = ix1 - valueB.wMm - labelEnd - 2 * leaderPad;
              const dots = leaderDots(gap, specMm, p.bodyFont);
              if (dots) acc.push(...translateLines(dots.lines, labelEnd + leaderPad + dots.wMm / 2, y));
            }
          }
        }
        y += specMm * p.rowSpacing;
      }
      return { lines: acc, height: y - (iy0 + slotH) };
    };

    // Fit pass: scale text so title+rows fit the area below the motif slot, minus
    // the footer reserve. One corrective pass suffices (width-clamping only shortens).
    const budget = innerH - slotH - footerReserve;
    const probe = buildText(1);
    const s = probe.height > budget && probe.height > 0 && budget > 0 ? budget / probe.height : 1;
    out.push(...(s === 1 ? probe.lines : buildText(s).lines));

    // Footer, bottom-anchored.
    if (footerB) out.push(...translateLines(footerB.lines, cx, iy1 - footerB.hMm));

    return { polylines: out, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
