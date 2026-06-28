// src/generators/spaceFilling.ts — space-filling & fractal curves drawn as a
// single continuous stroke. The quintessential pen-plotter showpiece: one line,
// never lifting, filling a region.
//
// All variants are generated as L-systems (axiom + rewrite rules) interpreted by
// a turtle, so adding a curve is just another rule set. Order grows the string
// geometrically, so it is clamped per curve to keep the path under ~120k points.
import type { GeneratorDef, Point, Polyline } from "./types";
import { fitToCanvas } from "../util/path";

type Curve = "hilbert" | "moore" | "gosper" | "dragon" | "sierpinski";

type Params = {
  curve: Curve;
  order: number;
  marginMm: number;
};

const DEFAULTS: Params = {
  curve: "hilbert",
  order: 5,
  marginMm: 12,
};

type System = {
  axiom: string;
  rules: Record<string, string>;
  angle: number; // degrees per +/- turn
  draw: string; // symbols that move the turtle forward (one char each)
  closed: boolean;
  maxOrder: number; // clamp so the expanded string stays sane
};

const SYSTEMS: Record<Curve, System> = {
  // F draws; A/B are state only (no movement).
  hilbert: {
    axiom: "A",
    rules: { A: "+BF-AFA-FB+", B: "-AF+BFB+FA-" },
    angle: 90,
    draw: "F",
    closed: false,
    maxOrder: 7,
  },
  // Closed Hilbert variant — a single loop.
  moore: {
    axiom: "LFL+F+LFL",
    rules: { L: "-RF+LFL+FR-", R: "+LF-RFR-FL+" },
    angle: 90,
    draw: "F",
    closed: true,
    maxOrder: 7,
  },
  // A and B both draw forward; 60° turns fill a hex-ish region.
  gosper: {
    axiom: "A",
    rules: { A: "A-B--B+A++AA+B-", B: "+A-BB--B-A++A+B" },
    angle: 60,
    draw: "AB",
    closed: false,
    maxOrder: 5,
  },
  // Heighway dragon. F draws; X/Y are state only.
  dragon: {
    axiom: "FX",
    rules: { X: "X+YF+", Y: "-FX-Y" },
    angle: 90,
    draw: "F",
    closed: false,
    maxOrder: 14,
  },
  // Sierpiński arrowhead — fills a triangle.
  sierpinski: {
    axiom: "AF",
    rules: { A: "BF+AF+B", B: "AF-BF-A" },
    angle: 60,
    draw: "F",
    closed: false,
    maxOrder: 8,
  },
};

const expand = (sys: System, n: number): string => {
  let s = sys.axiom;
  for (let i = 0; i < n; i++) {
    let out = "";
    for (const ch of s) out += sys.rules[ch] ?? ch;
    s = out;
  }
  return s;
};

const turtle = (s: string, angleDeg: number, draw: string): Point[] => {
  const a = (angleDeg * Math.PI) / 180;
  let x = 0;
  let y = 0;
  let dir = 0;
  const pts: Point[] = [[0, 0]];
  for (const ch of s) {
    if (ch === "+") dir += a;
    else if (ch === "-") dir -= a;
    else if (draw.includes(ch)) {
      x += Math.cos(dir);
      y += Math.sin(dir);
      pts.push([x, y]);
    }
  }
  return pts;
};

const doCurve = (p: Params, W: number, H: number): Polyline[] => {
  const sys = SYSTEMS[p.curve];
  const order = Math.max(1, Math.min(sys.maxOrder, Math.round(p.order)));
  const pts = turtle(expand(sys, order), sys.angle, sys.draw);
  return fitToCanvas([{ points: pts, closed: sys.closed }], W, H, p.marginMm);
};

export const spaceFilling: GeneratorDef<Params> = {
  id: "spaceFilling",
  name: "Space-Filling Curve",
  description:
    "One continuous stroke that fills a region — Hilbert, Moore (closed), Gosper, " +
    "Heighway dragon, Sierpiński. Order sets the recursion depth.",
  defaults: DEFAULTS,
  schema: {
    curve: {
      value: DEFAULTS.curve,
      options: ["hilbert", "moore", "gosper", "dragon", "sierpinski"],
      label: "Kurve",
    },
    order: { value: DEFAULTS.order, min: 1, max: 14, step: 1, label: "Ordnung", hint: "Rekursionstiefe (pro Kurve gedeckelt)" },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1, label: "Rand (mm)" },
  },
  generate: (p, _seed, canvas) => ({
    polylines: doCurve(p, canvas.wMm, canvas.hMm),
    widthMm: canvas.wMm,
    heightMm: canvas.hMm,
  }),
};
