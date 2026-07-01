// src/util/pageFormats.ts — ISO A-series page presets for the canvas size.
// Page format is a canvas-global concern (every generator reads canvas.wMm/hMm),
// so this lives in a util consumed by the TopBar, not in any single generator.
// Spec: docs/superpowers/specs/2026-06-30-blueprint-config-vpype-design.md

/** ISO A-series in mm, portrait (short × long edge). */
const A_SERIES = {
  a6: [105, 148],
  a5: [148, 210],
  a4: [210, 297],
  a3: [297, 420],
} as const;

export type PageFormatId =
  | "a6-portrait" | "a6-landscape"
  | "a5-portrait" | "a5-landscape"
  | "a4-portrait" | "a4-landscape"
  | "a3-portrait" | "a3-landscape"
  | "custom";

export type PageFormat = { id: PageFormatId; label: string; wMm: number; hMm: number };

/** All presets in menu order (portrait then landscape per size), excluding "custom". */
export const PAGE_FORMATS: PageFormat[] = (Object.keys(A_SERIES) as (keyof typeof A_SERIES)[])
  .flatMap((size) => {
    const [shortEdge, longEdge] = A_SERIES[size];
    const name = size.toUpperCase();
    return [
      { id: `${size}-portrait` as PageFormatId, label: `${name} ↕`, wMm: shortEdge, hMm: longEdge },
      { id: `${size}-landscape` as PageFormatId, label: `${name} ↔`, wMm: longEdge, hMm: shortEdge },
    ];
  });

/** Preset dimensions for an id, or null for "custom" / unknown. */
export const pageFormatSize = (id: PageFormatId): { wMm: number; hMm: number } | null => {
  const f = PAGE_FORMATS.find((p) => p.id === id);
  return f ? { wMm: f.wMm, hMm: f.hMm } : null;
};

/** Which preset the current canvas matches (within 0.5mm), else "custom". */
export const detectPageFormat = (wMm: number, hMm: number): PageFormatId => {
  const match = PAGE_FORMATS.find(
    (f) => Math.abs(f.wMm - wMm) < 0.5 && Math.abs(f.hMm - hMm) < 0.5,
  );
  return match?.id ?? "custom";
};
