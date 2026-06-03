// src/generators/meander.ts
import type { GeneratorDef, Point } from "./types";
import { makeRng, pick, type RNG } from "../util/random";
import { fitToCanvas } from "../util/path";
import { offsetPath, symmetricOffsets } from "../util/offset";

type Params = {
  cols: number;            // Rasterspalten
  rows: number;            // Rasterzeilen
  lanes: number;           // K parallele Spuren
  laneSpacingMm: number;   // s
  turnRadiusMm: number;    // Kehrenradius (wird auf ≥ Bandbreite/2 angehoben)
  coverage: number;        // 0..1 Anteil besuchter Zellen (Ziel-Länge)
  marginMm: number;
};

const DEFAULTS: Params = {
  cols: 24, rows: 24, lanes: 5, laneSpacingMm: 1.4,
  turnRadiusMm: 6, coverage: 0.6, marginMm: 15,
};

/** Selbst-meidender Walk auf einem cols×rows-Gitter; liefert Zellkoordinaten (Integer). */
function selfAvoidingWalk(rng: RNG, cols: number, rows: number, target: number): Point[] {
  const key = (x: number, y: number) => y * cols + x;
  const visited = new Set<number>();
  const path: Point[] = [];
  // Zufälliger Startpunkt — reseed verschiebt das Muster (gewollt).
  let x = Math.floor(rng() * cols), y = Math.floor(rng() * rows);
  visited.add(key(x, y)); path.push([x, y]);
  const dirs: Point[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const stack: Point[] = [[x, y]];
  while (path.length < target && stack.length > 0) {
    const opts = dirs
      .map((d) => [x + d[0], y + d[1]] as Point)
      .filter(([nx, ny]) => nx >= 0 && nx < cols && ny >= 0 && ny < rows && !visited.has(key(nx, ny)));
    if (opts.length === 0) { // Sackgasse → Backtrack
      stack.pop();
      const top = stack[stack.length - 1];
      if (!top) break;
      [x, y] = top;
      continue;
    }
    const next = pick(rng, opts);
    [x, y] = next;
    visited.add(key(x, y)); path.push([x, y]); stack.push([x, y]);
  }
  return path;
}

/** Verrundet die Ecken einer Zellpfad-Polyline zu Bögen mit Radius r (im Zell-Raum, in mm umgerechnet). */
function roundCorners(cells: Point[], cellMm: number, r: number, samples = 6): Point[] {
  const pts = cells.map(([cx, cy]): Point => [cx * cellMm, cy * cellMm]);
  if (pts.length < 3) return pts;
  const out: Point[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    let inx = b[0] - a[0], iny = b[1] - a[1]; const il = Math.hypot(inx, iny) || 1; inx /= il; iny /= il;
    let onx = c[0] - b[0], ony = c[1] - b[1]; const ol = Math.hypot(onx, ony) || 1; onx /= ol; ony /= ol;
    const rr = Math.min(r, il / 2, ol / 2);
    const p1: Point = [b[0] - inx * rr, b[1] - iny * rr];
    const p2: Point = [b[0] + onx * rr, b[1] + ony * rr];
    out.push(p1);
    for (let s = 1; s < samples; s++) {
      const t = s / samples, mt = 1 - t;
      out.push([mt * mt * p1[0] + 2 * mt * t * b[0] + t * t * p2[0],
                mt * mt * p1[1] + 2 * mt * t * b[1] + t * t * p2[1]]);
    }
    out.push(p2);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export const meander: GeneratorDef<Params> = {
  id: "meander",
  name: "Meander Ribbon",
  description:
    "Selbst-meidende Bahn auf einem Raster, zu einem K-Spur-Band versetzt. Gerundete Haarnadel-Kehren; reseed verschiebt den Pfad.",
  defaults: DEFAULTS,
  schema: {
    cols: { value: DEFAULTS.cols, min: 4, max: 60, step: 1 },
    rows: { value: DEFAULTS.rows, min: 4, max: 60, step: 1 },
    lanes: { value: DEFAULTS.lanes, min: 1, max: 24, step: 1 },
    laneSpacingMm: { value: DEFAULTS.laneSpacingMm, min: 0.3, max: 5, step: 0.1 },
    turnRadiusMm: { value: DEFAULTS.turnRadiusMm, min: 1, max: 20, step: 0.5 },
    coverage: { value: DEFAULTS.coverage, min: 0.1, max: 1, step: 0.05 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
  },
  generate: (p, seed, canvas) => {
    const rng = makeRng(seed);
    const cols = Math.max(2, Math.floor(p.cols));
    const rows = Math.max(2, Math.floor(p.rows));
    const target = Math.max(2, Math.floor(cols * rows * p.coverage));
    const cells = selfAvoidingWalk(rng, cols, rows, target);

    const bandWidth = (p.lanes - 1) * p.laneSpacingMm;
    // cellMm muss groß genug sein, dass die gerundete Kehre das ganze Band fasst
    // (sonst kollabieren innere Spuren). Skaliert mit der Bandbreite, nicht mit dem Radius
    // — fitToCanvas normalisiert die absolute Größe am Ende ohnehin.
    const cellMm = Math.max(10, bandWidth + 2 * p.laneSpacingMm);
    const r = Math.max(p.turnRadiusMm, bandWidth / 2 + p.laneSpacingMm);
    const center = roundCorners(cells, cellMm, r);

    const lanes = offsetPath(center, symmetricOffsets(p.lanes, p.laneSpacingMm), {
      minInnerRadiusMm: p.laneSpacingMm,
    });

    const fitted = fitToCanvas(lanes, canvas.wMm, canvas.hMm, p.marginMm);
    return { polylines: fitted, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
