// src/util/svgImport.ts — parse SVGs into plottable Polylines.
// Supports: path data M/L/H/V + C/S/Q/T béziers + A arcs (flattened to segments),
// polyline/polygon/line/circle/ellipse/rect elements, and full affine transforms
// (matrix/translate/scale/rotate/skewX/skewY, nested + composed). viewBox is folded
// into the root transform. Fills/strokes are ignored (geometry only). <use>/<defs>
// references and clip paths are NOT resolved. Pure string parsing — no DOMParser,
// so it runs in node scripts too.
import type { Point, Polyline } from "../generators/types";

// Deliberately separate from Artwork: motif is import-side data (may grow source metadata) and is not canvas-sized.
export type MotifData = { polylines: Polyline[]; widthMm: number; heightMm: number };

const NUM_RE = /-?\.?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/;

const num = (s: string): number => {
  const v = parseFloat(s);
  if (!isFinite(v)) throw new Error(`invalid number: "${s}"`);
  return v;
};

/** Length attr → user units. cm→×10; px/pt/in/mm and unitless are best-effort
 *  numeric (we refit to canvas, so absolute scale is cosmetic). %/NaN → 0. */
const len = (s: string | undefined): number => {
  if (!s) return 0;
  if (/%\s*$/.test(s)) return 0;
  if (/cm\s*$/i.test(s)) return num(s.replace(/cm\s*$/i, "")) * 10;
  const v = parseFloat(s);
  return isFinite(v) ? v : 0;
};

const attr = (tag: string, name: string): string | undefined => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? (m[1] ?? m[2]) : undefined;
};

// --- 2D affine matrix [a,b,c,d,e,f]: x' = a·x + c·y + e, y' = b·x + d·y + f ---
type Mat = [number, number, number, number, number, number];
const IDENT: Mat = [1, 0, 0, 1, 0, 0];

/** Compose so apply(matMul(m,n), p) === apply(m, apply(n, p)). */
const matMul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

const ap = (m: Mat, p: Point): Point => [
  m[0] * p[0] + m[2] * p[1] + m[4],
  m[1] * p[0] + m[3] * p[1] + m[5],
];

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Parse an SVG transform attribute (possibly several functions) into one matrix. */
function parseTransform(t: string | undefined): Mat {
  if (!t) return IDENT;
  let m: Mat = IDENT;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let g: RegExpExecArray | null;
  while ((g = re.exec(t))) {
    const fn = g[1];
    const a = (g[2].match(new RegExp(NUM_RE.source, "g")) ?? []).map(num);
    let f: Mat = IDENT;
    if (fn === "matrix" && a.length === 6) f = a as Mat;
    else if (fn === "translate") f = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
    else if (fn === "scale") f = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (fn === "rotate") {
      const cos = Math.cos(rad(a[0] || 0)), sin = Math.sin(rad(a[0] || 0));
      const r: Mat = [cos, sin, -sin, cos, 0, 0];
      if (a.length >= 3) f = matMul(matMul([1, 0, 0, 1, a[1], a[2]], r), [1, 0, 0, 1, -a[1], -a[2]]);
      else f = r;
    } else if (fn === "skewX") f = [1, 0, Math.tan(rad(a[0] || 0)), 1, 0, 0];
    else if (fn === "skewY") f = [1, Math.tan(rad(a[0] || 0)), 0, 1, 0, 0];
    else continue; // unknown function → ignore (treat as identity)
    m = matMul(m, f);
  }
  return m;
}

// --- Curve flattening (de Casteljau, flatness-adaptive in OUTPUT/mm space) ---
const FLATTEN_TOL = 0.1;
const MAX_DEPTH = 10;

function distToLineSq(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  const cx = a[0] + t * dx, cy = a[1] + t * dy;
  return (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
}

/** Subdivide a cubic (control points already in output space), push endpoints (not start). */
function flattenCubic(p0: Point, p1: Point, p2: Point, p3: Point, emit: (p: Point) => void, depth: number): void {
  const tol2 = FLATTEN_TOL * FLATTEN_TOL;
  if (depth >= MAX_DEPTH || (distToLineSq(p1, p0, p3) <= tol2 && distToLineSq(p2, p0, p3) <= tol2)) {
    emit(p3);
    return;
  }
  const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const p01 = mid(p0, p1), p12 = mid(p1, p2), p23 = mid(p2, p3);
  const p012 = mid(p01, p12), p123 = mid(p12, p23);
  const m = mid(p012, p123);
  flattenCubic(p0, p01, p012, m, emit, depth + 1);
  flattenCubic(m, p123, p23, p3, emit, depth + 1);
}

/** Endpoint-parameterized arc (local coords) → cubic segments → transform → flatten. */
function flattenArc(
  p0: Point, rx: number, ry: number, xAxisDeg: number,
  largeArc: boolean, sweep: boolean, p1: Point, m: Mat, emit: (p: Point) => void,
): void {
  if (rx === 0 || ry === 0 || (p0[0] === p1[0] && p0[1] === p1[1])) { emit(ap(m, p1)); return; }
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = rad(xAxisDeg);
  const cosP = Math.cos(phi), sinP = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
  const x1p = cosP * dx + sinP * dy, y1p = -sinP * dx + cosP * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { const s = Math.sqrt(lambda); rx *= s; ry *= s; }
  const sign = largeArc === sweep ? -1 : 1;
  const numr = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, numr / den));
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cosP * cxp - sinP * cyp + (p0[0] + p1[0]) / 2;
  const cy = sinP * cxp + cosP * cyp + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const l = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    let a = Math.acos(Math.min(1, Math.max(-1, dot / l)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;
  const segs = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const delta = dTheta / segs, t = (4 / 3) * Math.tan(delta / 4);
  let th = theta1, from = p0;
  for (let s = 0; s < segs; s++) {
    const th2 = th + delta;
    const cosTh = Math.cos(th), sinTh = Math.sin(th), cosTh2 = Math.cos(th2), sinTh2 = Math.sin(th2);
    const ep: Point = [cx + rx * cosP * cosTh2 - ry * sinP * sinTh2, cy + rx * sinP * cosTh2 + ry * cosP * sinTh2];
    const c1: Point = [from[0] + t * (-rx * cosP * sinTh - ry * sinP * cosTh), from[1] + t * (-rx * sinP * sinTh + ry * cosP * cosTh)];
    const c2: Point = [ep[0] - t * (-rx * cosP * sinTh2 - ry * sinP * cosTh2), ep[1] - t * (-rx * sinP * sinTh2 + ry * cosP * cosTh2)];
    flattenCubic(ap(m, from), ap(m, c1), ap(m, c2), ap(m, ep), emit, 0);
    from = ep; th = th2;
  }
}

const CMD_RE = /[MmLlHhVvCcSsQqTtAaZz]/;

/** Parse path `d` and return output-space polylines (matrix applied). */
function parsePathD(d: string, m: Mat): Polyline[] {
  const toks = d.match(new RegExp(`${CMD_RE.source}|${NUM_RE.source}`, "g")) ?? [];
  const polys: Polyline[] = [];
  let cur: Point[] = [];
  let x = 0, y = 0, startX = 0, startY = 0;     // current/subpath-start, LOCAL coords
  let prevCmd = "", i = 0;
  let prevC2: Point | null = null, prevQC: Point | null = null;

  const flush = (closed: boolean) => { if (cur.length >= 2) polys.push({ points: cur, closed }); cur = []; };
  const emitOut = (p: Point) => cur.push(p);
  const emitLocal = (px: number, py: number) => cur.push(ap(m, [px, py]));
  const isCmd = (t: string) => t.length === 1 && CMD_RE.test(t);
  const next = (): number => { const t = toks[i++]; if (t === undefined || isCmd(t)) throw new Error("path data: missing coordinate"); return num(t); };
  const flag = (): boolean => next() !== 0;

  let cmd = "";
  while (i < toks.length) {
    if (isCmd(toks[i])) { cmd = toks[i]; i++; if (cmd === "Z" || cmd === "z") { flush(true); x = startX; y = startY; continue; } }
    if (!cmd) throw new Error("path data: coordinates before any command");
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const p0: Point = [x, y];

    if (C === "M") {
      flush(false);
      const nx = next(), ny = next();
      x = rel ? x + nx : nx; y = rel ? y + ny : ny; startX = x; startY = y;
      emitLocal(x, y);
      cmd = rel ? "l" : "L";
    } else if (C === "L") {
      const nx = next(), ny = next();
      x = rel ? x + nx : nx; y = rel ? y + ny : ny; emitLocal(x, y);
    } else if (C === "H") {
      const nx = next(); x = rel ? x + nx : nx; emitLocal(x, y);
    } else if (C === "V") {
      const ny = next(); y = rel ? y + ny : ny; emitLocal(x, y);
    } else if (C === "C" || C === "S") {
      let c1: Point;
      if (C === "C") { const x1 = next(), y1 = next(); c1 = [rel ? x + x1 : x1, rel ? y + y1 : y1]; }
      else c1 = prevCmd === "C" ? [2 * x - prevC2![0], 2 * y - prevC2![1]] : [x, y];
      const x2 = next(), y2 = next(), ex = next(), ey = next();
      const c2: Point = [rel ? x + x2 : x2, rel ? y + y2 : y2];
      const end: Point = [rel ? x + ex : ex, rel ? y + ey : ey];
      flattenCubic(ap(m, p0), ap(m, c1), ap(m, c2), ap(m, end), emitOut, 0);
      x = end[0]; y = end[1]; prevC2 = c2; prevCmd = "C";
    } else if (C === "Q" || C === "T") {
      let c: Point;
      if (C === "Q") { const x1 = next(), y1 = next(); c = [rel ? x + x1 : x1, rel ? y + y1 : y1]; }
      else c = prevCmd === "Q" ? [2 * x - prevQC![0], 2 * y - prevQC![1]] : [x, y];
      const ex = next(), ey = next();
      const end: Point = [rel ? x + ex : ex, rel ? y + ey : ey];
      // quadratic → cubic
      const c1: Point = [p0[0] + (2 / 3) * (c[0] - p0[0]), p0[1] + (2 / 3) * (c[1] - p0[1])];
      const c2: Point = [end[0] + (2 / 3) * (c[0] - end[0]), end[1] + (2 / 3) * (c[1] - end[1])];
      flattenCubic(ap(m, p0), ap(m, c1), ap(m, c2), ap(m, end), emitOut, 0);
      x = end[0]; y = end[1]; prevQC = c; prevCmd = "Q";
    } else if (C === "A") {
      const rx = next(), ry = next(), rot = next();
      const large = flag(), sweep = flag();
      const ex = next(), ey = next();
      const end: Point = [rel ? x + ex : ex, rel ? y + ey : ey];
      flattenArc(p0, rx, ry, rot, large, sweep, end, m, emitOut);
      x = end[0]; y = end[1];
    } else {
      throw new Error(`unsupported path command "${cmd}"`);
    }
    if (C !== "C" && C !== "S") prevC2 = null;
    if (C !== "Q" && C !== "T") prevQC = null;
    if (C !== "C" && C !== "S" && C !== "Q" && C !== "T") prevCmd = C;
  }
  flush(false);
  return polys;
}

const KAPPA = 0.5522847498307936;

/** Ellipse (local cx,cy,rx,ry) → 4 cubic segments → transform → flatten → closed polyline. */
function ellipsePolyline(cx: number, cy: number, rx: number, ry: number, m: Mat): Polyline | null {
  if (!(rx > 0) || !(ry > 0)) return null;
  const pts: Point[] = [ap(m, [cx + rx, cy])];
  const segs: [Point, Point, Point, Point][] = [
    [[cx + rx, cy], [cx + rx, cy + ry * KAPPA], [cx + rx * KAPPA, cy + ry], [cx, cy + ry]],
    [[cx, cy + ry], [cx - rx * KAPPA, cy + ry], [cx - rx, cy + ry * KAPPA], [cx - rx, cy]],
    [[cx - rx, cy], [cx - rx, cy - ry * KAPPA], [cx - rx * KAPPA, cy - ry], [cx, cy - ry]],
    [[cx, cy - ry], [cx + rx * KAPPA, cy - ry], [cx + rx, cy - ry * KAPPA], [cx + rx, cy]],
  ];
  for (const [a, b, c, d] of segs) flattenCubic(ap(m, a), ap(m, b), ap(m, c), ap(m, d), (p) => pts.push(p), 0);
  return { points: pts, closed: true };
}

function parsePoints(raw: string, m: Mat, closed: boolean): Polyline | null {
  const nums = (raw.match(new RegExp(NUM_RE.source, "g")) ?? []).map(num);
  const pts: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push(ap(m, [nums[i], nums[i + 1]]));
  return pts.length >= 2 ? { points: pts, closed } : null;
}

export function parseSvgMotif(svg: string): MotifData {
  const svgTag = svg.match(/<svg\b[^>]*>/)?.[0];
  if (!svgTag) throw new Error("not an SVG file (no <svg> element)");

  const vb = attr(svgTag, "viewBox")?.split(/[\s,]+/).filter(Boolean).map(num);
  const wAttr = len(attr(svgTag, "width"));
  const hAttr = len(attr(svgTag, "height"));
  let widthMm = wAttr || (vb ? vb[2] : 0);
  let heightMm = hAttr || (vb ? vb[3] : 0);

  // Root matrix: fold viewBox → output (mm) units. No viewBox ⇒ identity.
  let root: Mat = IDENT;
  if (vb && vb[2] > 0 && vb[3] > 0) {
    const sx = (widthMm || vb[2]) / vb[2];
    const sy = (heightMm || vb[3]) / vb[3];
    root = [sx, 0, 0, sy, -vb[0] * sx, -vb[1] * sy];
  }

  const polylines: Polyline[] = [];
  const stack: Mat[] = [root];
  // assumes attribute values contain no '>' characters (fine for plotter/line-art SVGs)
  const tagRe = /<\/?(svg|g|path|polyline|polygon|line|circle|ellipse|rect)\b[^>]*?>/g;
  let mt: RegExpExecArray | null;
  while ((mt = tagRe.exec(svg))) {
    const tag = mt[0];
    const name = mt[1];
    const closing = tag.startsWith("</");
    const selfClosing = tag.endsWith("/>");
    const cur = stack[stack.length - 1];
    if (name === "svg") continue;
    if (name === "g") {
      if (closing) { if (stack.length > 1) stack.pop(); }
      else if (!selfClosing) stack.push(matMul(cur, parseTransform(attr(tag, "transform"))));
      continue;
    }
    if (closing) continue;
    const m = matMul(cur, parseTransform(attr(tag, "transform")));
    if (name === "path") {
      const d = attr(tag, "d");
      if (d) polylines.push(...parsePathD(d, m));
    } else if (name === "polyline" || name === "polygon") {
      const p = parsePoints(attr(tag, "points") ?? "", m, name === "polygon");
      if (p) polylines.push(p);
    } else if (name === "line") {
      const x1 = len(attr(tag, "x1")), y1 = len(attr(tag, "y1"));
      const x2 = len(attr(tag, "x2")), y2 = len(attr(tag, "y2"));
      polylines.push({ points: [ap(m, [x1, y1]), ap(m, [x2, y2])], closed: false });
    } else if (name === "circle") {
      const r = len(attr(tag, "r"));
      const e = ellipsePolyline(len(attr(tag, "cx")), len(attr(tag, "cy")), r, r, m);
      if (e) polylines.push(e);
    } else if (name === "ellipse") {
      const e = ellipsePolyline(len(attr(tag, "cx")), len(attr(tag, "cy")), len(attr(tag, "rx")), len(attr(tag, "ry")), m);
      if (e) polylines.push(e);
    } else if (name === "rect") {
      const rx = len(attr(tag, "x")), ry = len(attr(tag, "y"));
      const w = len(attr(tag, "width")), h = len(attr(tag, "height"));
      if (w > 0 && h > 0) {
        polylines.push({
          points: [ap(m, [rx, ry]), ap(m, [rx + w, ry]), ap(m, [rx + w, ry + h]), ap(m, [rx, ry + h])],
          closed: true,
        });
      }
    }
  }
  if (polylines.length === 0) {
    throw new Error("no drawable geometry found (path/polyline/polygon/line/circle/ellipse/rect)");
  }

  // Fallback canvas size from geometry bounds when no width/height/viewBox was usable.
  if (!(widthMm > 0) || !(heightMm > 0)) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const l of polylines) for (const [px, py] of l.points) {
      if (px < minX) minX = px; if (py < minY) minY = py;
      if (px > maxX) maxX = px; if (py > maxY) maxY = py;
    }
    if (isFinite(minX)) { widthMm = maxX - minX || 1; heightMm = maxY - minY || 1; }
  }

  return { polylines, widthMm, heightMm };
}
