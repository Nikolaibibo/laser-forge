import type { Artwork } from "../generators/types";
import { dedupePaths } from "../util/dedupePaths";
import { mergePaths } from "../util/mergePaths";
import { serializeMeta } from "../util/blueprintMeta";

const round = (n: number, digits = 3): string => {
  const m = Math.pow(10, digits);
  return String(Math.round(n * m) / m);
};

const escapeXml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => (
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"
  ));

const textAnchor = (a: "left" | "center" | "right"): string =>
  a === "left" ? "start" : a === "right" ? "end" : "middle";

export type SvgExportOptions = {
  /** Remove duplicate and overlapping collinear path segments before serializing. Default true. */
  dedupe?: boolean;
  /** Join open polylines whose endpoints coincide into longer continuous paths. Default true. */
  join?: boolean;
  /** Stroke width in mm (cosmetic for plotting — the plotter only follows paths). */
  strokeWidthMm?: number;
  /**
   * Emit editable text: a hidden `<text>` layer mirroring the single-stroke text
   * + a `<metadata>` round-trip blob. Requires art.labels/art.source. Default true.
   * Plotter/vpype ignore `<text>`, so plot output is unchanged. Set false for a
   * flat single-`<g>`-less SVG (byte-compatible with the pre-Task-5 export).
   */
  editableText?: boolean;
};

/**
 * Serialize an Artwork to clean, plotter/laser-friendly SVG.
 * - viewBox in millimetres
 * - <path> elements only (no <circle>, <rect>, no text)
 * - stroke only, no fill, black
 */
export const svgExport = (art: Artwork, opts: SvgExportOptions = {}): string => {
  const { widthMm, heightMm } = art;
  // Dedupe + join default ON: plotter/laser output should never redraw overlapping
  // lines. Callers pass explicit false to opt out (regression escape hatch).
  const dedupe = opts.dedupe ?? true;
  const join = opts.join ?? true;
  let lines = dedupe ? dedupePaths(art.polylines) : art.polylines;
  if (join) lines = mergePaths(lines);
  const toPath = (l: Artwork["polylines"][number]): string => {
    const d =
      "M " +
      l.points
        .map(([x, y], i) => (i === 0 ? `${round(x)},${round(y)}` : `L ${round(x)},${round(y)}`))
        .join(" ") +
      (l.closed ? " Z" : "");
    return l.stroke ? `<path d="${d}" stroke="${l.stroke}"/>` : `<path d="${d}"/>`;
  };
  const pathEls = lines.filter((l) => l.points.length >= 2).map(toPath);

  const header = `<?xml version="1.0" encoding="UTF-8"?>`;
  const svgOpenAttrs = (extraNs = "") =>
    `<svg xmlns="http://www.w3.org/2000/svg"${extraNs}
     width="${widthMm}mm" height="${heightMm}mm"
     viewBox="0 0 ${widthMm} ${heightMm}"
     fill="none" stroke="black" stroke-width="${opts.strokeWidthMm ?? 0.3}"
     stroke-linecap="round" stroke-linejoin="round">`;

  const editable =
    (opts.editableText ?? true) &&
    !!art.source &&
    Array.isArray(art.labels) &&
    art.labels.length > 0;

  if (!editable) {
    return `${header}
${svgOpenAttrs()}
  ${pathEls.join("\n  ")}
</svg>
`;
  }

  const meta = `  <metadata id="lf-blueprint"><![CDATA[${serializeMeta(art.source!)}]]></metadata>`;
  const textEls = art
    .labels!.map(
      (l) =>
        `    <text x="${round(l.xMm)}" y="${round(l.yMm)}" font-size="${round(l.capMm)}mm" text-anchor="${textAnchor(l.align)}" data-field="${escapeXml(l.field)}">${escapeXml(l.text)}</text>`,
    )
    .join("\n");

  return `${header}
${svgOpenAttrs(`\n     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"`)}
${meta}
  <g inkscape:groupmode="layer" inkscape:label="plot" id="plot">
    ${pathEls.join("\n    ")}
  </g>
  <g inkscape:groupmode="layer" inkscape:label="text" id="labels" display="none" fill="#888888" stroke="none">
${textEls}
  </g>
</svg>
`;
};

export const downloadSvg = (
  art: Artwork,
  filename = "laser-forge.svg",
  opts: SvgExportOptions = {},
) => {
  const blob = new Blob([svgExport(art, opts)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
