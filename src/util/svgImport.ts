// src/util/svgImport.ts — parse vpype-style flat SVGs (lines only) into Polylines.
// Scope per spec: M/L/m/l/Z paths, polyline/polygon/line elements, translate()-only
// transforms. Curves/other transforms throw with a "flatten with vpype" hint.
// Pure string parsing — no DOMParser, so it runs in node scripts too.
import type { Point, Polyline } from "../generators/types";

// Deliberately separate from Artwork: motif is import-side data (may grow source metadata) and is not canvas-sized.
export type MotifData = { polylines: Polyline[]; widthMm: number; heightMm: number };

const NUM_RE = /-?\.?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/;

const num = (s: string): number => {
  const v = parseFloat(s);
  if (!isFinite(v)) throw new Error(`invalid number: "${s}"`);
  return v;
};

const mm = (s: string): number => {
  const unit = s.match(/(px|pt|cm|in)\s*$/i);
  if (unit) throw new Error(`SVG width/height in "${unit[1]}" — re-export in mm (vpype writes mm)`);
  return num(s.replace(/mm\s*$/i, ""));
};

const attr = (tag: string, name: string): string | undefined => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? (m[1] ?? m[2]) : undefined;
};

/** Only translate(x[,y]) is supported (vpype layer groups). Anything else → error. */
const parseTranslate = (t: string | undefined): [number, number] => {
  if (!t) return [0, 0];
  const m = t.trim().match(new RegExp(`^translate\\(\\s*(${NUM_RE.source})[\\s,]*(${NUM_RE.source})?\\s*\\)$`));
  if (!m) throw new Error(`unsupported transform "${t}" — flatten the SVG with vpype first`);
  return [num(m[1]), m[2] !== undefined ? num(m[2]) : 0];
};

function parsePathD(d: string, off: [number, number]): Polyline[] {
  const tokens = d.match(new RegExp(`[MmLlZz]|${NUM_RE.source}|[A-Za-z]`, "g")) ?? [];
  const bad = tokens.find((t) => /^[A-Za-z]$/.test(t) && !"MmLlZz".includes(t));
  if (bad) {
    throw new Error(`unsupported path command "${bad}" — flatten curves with vpype first`);
  }
  // Re-tokenize without the catch-all letter group (we've validated above)
  const cleanTokens = tokens.filter((t) => !/^[A-Za-z]$/.test(t) || "MmLlZz".includes(t));
  const polys: Polyline[] = [];
  let cur: Point[] = [];
  let mode: "M" | "m" | "L" | "l" | null = null;
  let x = 0;
  let y = 0;
  let i = 0;
  const flush = (closed: boolean) => {
    if (cur.length >= 2) polys.push({ points: cur, closed });
    cur = [];
  };
  while (i < cleanTokens.length) {
    const t = cleanTokens[i];
    if (t === "Z" || t === "z") {
      flush(true);
      mode = null;
      i++;
      continue;
    }
    if (t === "M" || t === "m" || t === "L" || t === "l") {
      if (t === "M" || t === "m") flush(false);
      mode = t;
      i++;
      continue;
    }
    if (!mode) throw new Error("path data: coordinates before any command");
    if (i + 1 >= cleanTokens.length) throw new Error("path data: dangling coordinate");
    const nx = num(t);
    const ny = num(cleanTokens[i + 1]);
    i += 2;
    if (mode === "M" || mode === "L") {
      x = nx;
      y = ny;
    } else {
      x += nx;
      y += ny;
    }
    cur.push([x + off[0], y + off[1]]);
    if (mode === "M") mode = "L"; // implicit lineto after moveto
    if (mode === "m") mode = "l";
  }
  flush(false);
  return polys;
}

function parsePoints(raw: string, off: [number, number], closed: boolean): Polyline | null {
  const nums = (raw.match(new RegExp(NUM_RE.source, "g")) ?? []).map(num);
  const pts: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i] + off[0], nums[i + 1] + off[1]]);
  return pts.length >= 2 ? { points: pts, closed } : null;
}

export function parseSvgMotif(svg: string): MotifData {
  const svgTag = svg.match(/<svg\b[^>]*>/)?.[0];
  if (!svgTag) throw new Error("not an SVG file (no <svg> element)");

  const vb = attr(svgTag, "viewBox")?.split(/[\s,]+/).map(num);
  const wAttr = attr(svgTag, "width");
  const hAttr = attr(svgTag, "height");
  const widthMm = wAttr ? mm(wAttr) : vb ? vb[2] : 0;
  const heightMm = hAttr ? mm(hAttr) : vb ? vb[3] : 0;
  if (!(widthMm > 0) || !(heightMm > 0)) throw new Error("SVG has no usable width/height or viewBox");

  // viewBox-unit → mm scale (vpype writes 1 unit = 1 mm; handle the general case anyway).
  const sx = vb ? widthMm / (vb[2] || 1) : 1;
  const sy = vb ? heightMm / (vb[3] || 1) : 1;
  const ox = vb ? vb[0] : 0;
  const oy = vb ? vb[1] : 0;

  const polylines: Polyline[] = [];
  const stack: [number, number][] = [[0, 0]];
  // assumes attribute values contain no '>' characters (vpype output; fine for flat plotter SVGs)
  const tagRe = /<\/?(svg|g|path|polyline|polygon|line)\b[^>]*?>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(svg))) {
    const tag = m[0];
    const name = m[1];
    const closing = tag.startsWith("</");
    const selfClosing = tag.endsWith("/>");
    const off = stack[stack.length - 1];
    if (name === "g") {
      if (closing) {
        if (stack.length > 1) stack.pop();
      } else {
        const [tx, ty] = parseTranslate(attr(tag, "transform"));
        if (!selfClosing) stack.push([off[0] + tx, off[1] + ty]);
      }
      continue;
    }
    if (closing || name === "svg") continue;
    const [tx, ty] = parseTranslate(attr(tag, "transform"));
    const o: [number, number] = [off[0] + tx, off[1] + ty];
    if (name === "path") {
      const d = attr(tag, "d");
      if (d) polylines.push(...parsePathD(d, o));
    } else if (name === "polyline" || name === "polygon") {
      const p = parsePoints(attr(tag, "points") ?? "", o, name === "polygon");
      if (p) polylines.push(p);
    } else if (name === "line") {
      const x1 = num(attr(tag, "x1") ?? "0");
      const y1 = num(attr(tag, "y1") ?? "0");
      const x2 = num(attr(tag, "x2") ?? "0");
      const y2 = num(attr(tag, "y2") ?? "0");
      polylines.push({ points: [[x1 + o[0], y1 + o[1]], [x2 + o[0], y2 + o[1]]], closed: false });
    }
  }
  if (polylines.length === 0) {
    throw new Error("no drawable line elements found (path/polyline/polygon/line)");
  }

  const scaled = polylines.map((l) => ({
    ...l,
    points: l.points.map(([px, py]): Point => [(px - ox) * sx, (py - oy) * sy]),
  }));
  return { polylines: scaled, widthMm, heightMm };
}
