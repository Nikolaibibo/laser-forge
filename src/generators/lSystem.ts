import type { GeneratorDef, Point, Polyline } from "./types";
import { fitToCanvas } from "../util/path";

type Preset = "koch" | "dragon" | "plant" | "sierpinski" | "hilbert";

type Params = {
  preset: Preset;
  iterations: number;
  angleDeg: number;
  startAngleDeg: number;
  marginMm: number;
};

const DEFAULTS: Params = {
  preset: "plant",
  iterations: 5,
  angleDeg: 25,
  startAngleDeg: -90,
  marginMm: 15,
};

// step size is a pre-fit constant — fitToCanvas normalises away any uniform
// scaling, so there is no user-facing knob for it. 1 is a safe default.
const STEP = 1;

type LRule = { axiom: string; rules: Record<string, string>; angleDeg: number };

const PRESETS: Record<Preset, LRule> = {
  koch: {
    axiom: "F",
    rules: { F: "F+F-F-F+F" },
    angleDeg: 90,
  },
  dragon: {
    axiom: "FX",
    rules: { X: "X+YF+", Y: "-FX-Y" },
    angleDeg: 90,
  },
  plant: {
    axiom: "X",
    rules: { X: "F+[[X]-X]-F[-FX]+X", F: "FF" },
    angleDeg: 25,
  },
  sierpinski: {
    axiom: "F-G-G",
    rules: { F: "F-G+F+G-F", G: "GG" },
    angleDeg: 120,
  },
  hilbert: {
    axiom: "A",
    rules: { A: "+BF-AFA-FB+", B: "-AF+BFB+FA-" },
    angleDeg: 90,
  },
};

const expand = (preset: LRule, iterations: number): string => {
  let s = preset.axiom;
  for (let i = 0; i < iterations; i++) {
    let out = "";
    for (const ch of s) {
      out += preset.rules[ch] ?? ch;
    }
    s = out;
    if (s.length > 2_000_000) break; // safety
  }
  return s;
};

export const lSystem: GeneratorDef<Params> = {
  id: "l-system",
  name: "L-System",
  description:
    "Lindenmayer systems — rule-based growth. Koch, Dragon, Plant, Sierpinski, Hilbert. A turtle interpreter traces the path.",
  defaults: DEFAULTS,
  schema: {
    preset: {
      value: DEFAULTS.preset,
      options: ["koch", "dragon", "plant", "sierpinski", "hilbert"],
    },
    iterations: { value: DEFAULTS.iterations, min: 1, max: 9, step: 1 },
    angleDeg: { value: DEFAULTS.angleDeg, min: 5, max: 180, step: 0.5 },
    startAngleDeg: { value: DEFAULTS.startAngleDeg, min: -180, max: 180, step: 1 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
  },
  generate: (p, _seed, canvas) => {
    const def = PRESETS[p.preset];
    const angle = (p.angleDeg * Math.PI) / 180;
    const s = expand(def, p.iterations);

    const lines: Polyline[] = [];
    let cur: Point[] = [];
    let x = 0;
    let y = 0;
    let heading = (p.startAngleDeg * Math.PI) / 180;
    const stack: { x: number; y: number; heading: number; cur: Point[] }[] = [];
    cur.push([x, y]);

    for (const ch of s) {
      switch (ch) {
        case "F":
        case "G":
        case "A":
        case "B":
          x += Math.cos(heading) * STEP;
          y += Math.sin(heading) * STEP;
          cur.push([x, y]);
          break;
        case "f":
          // move without draw
          if (cur.length > 1) lines.push({ points: cur, closed: false });
          x += Math.cos(heading) * STEP;
          y += Math.sin(heading) * STEP;
          cur = [[x, y]];
          break;
        case "+":
          heading += angle;
          break;
        case "-":
          heading -= angle;
          break;
        case "[":
          stack.push({ x, y, heading, cur });
          cur = [[x, y]];
          break;
        case "]": {
          if (cur.length > 1) lines.push({ points: cur, closed: false });
          const top = stack.pop();
          if (top) {
            x = top.x;
            y = top.y;
            heading = top.heading;
            cur = top.cur;
            cur.push([x, y]);
          } else {
            cur = [[x, y]];
          }
          break;
        }
        default:
          break;
      }
    }
    if (cur.length > 1) lines.push({ points: cur, closed: false });

    const fitted = fitToCanvas(lines, canvas.wMm, canvas.hMm, p.marginMm);
    return { polylines: fitted, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
