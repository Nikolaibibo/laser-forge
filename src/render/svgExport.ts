import type { Artwork } from "../generators/types";
import { dedupePaths } from "../util/dedupePaths";
import { mergePaths } from "../util/mergePaths";

const round = (n: number, digits = 3): string => {
  const m = Math.pow(10, digits);
  return String(Math.round(n * m) / m);
};

export type SvgExportOptions = {
  /** Remove duplicate and overlapping collinear path segments before serializing. Default true. */
  dedupe?: boolean;
  /** Join open polylines whose endpoints coincide into longer continuous paths. Default true. */
  join?: boolean;
  /** Stroke width in mm (cosmetic for plotting — the plotter only follows paths). */
  strokeWidthMm?: number;
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
  const paths = lines
    .filter((l) => l.points.length >= 2)
    .map((l) => {
      const d =
        "M " +
        l.points
          .map(([x, y], i) => (i === 0 ? `${round(x)},${round(y)}` : `L ${round(x)},${round(y)}`))
          .join(" ") +
        (l.closed ? " Z" : "");
      return l.stroke
        ? `<path d="${d}" stroke="${l.stroke}"/>`
        : `<path d="${d}"/>`;
    })
    .join("\n  ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${widthMm}mm" height="${heightMm}mm"
     viewBox="0 0 ${widthMm} ${heightMm}"
     fill="none" stroke="black" stroke-width="${opts.strokeWidthMm ?? 0.3}"
     stroke-linecap="round" stroke-linejoin="round">
  ${paths}
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
