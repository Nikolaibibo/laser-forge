import type { GeneratorDef, Point } from "./types";
import { fitToCanvas } from "../util/path";

type Params = {
  m: number;
  n1: number;
  n2: number;
  n3: number;
  a: number;
  b: number;
  rotDeg: number;
  stretchX: number;
  stretchY: number;
  modAmp: number;
  modFreq: number;
  layerRotDeg: number;
  samples: number;
  layers: number;
  layerMorph: number;
  marginMm: number;
};

const DEFAULTS: Params = {
  m: 6,
  n1: 1,
  n2: 1,
  n3: 1,
  a: 1,
  b: 1,
  rotDeg: 0,
  stretchX: 1,
  stretchY: 1,
  modAmp: 0,
  modFreq: 3,
  layerRotDeg: 0,
  samples: 1200,
  layers: 1,
  layerMorph: 0,
  marginMm: 15,
};

// Gielis superformula in polar form.
const supershape = (phi: number, p: Params): number => {
  const t1 = Math.pow(Math.abs(Math.cos((p.m * phi) / 4) / p.a), p.n2);
  const t2 = Math.pow(Math.abs(Math.sin((p.m * phi) / 4) / p.b), p.n3);
  const r = Math.pow(t1 + t2, -1 / p.n1);
  return Number.isFinite(r) ? r : 0;
};

export const superformula: GeneratorDef<Params> = {
  id: "superformula",
  name: "Superformula",
  description:
    "Gielis superformula in polar form. m = symmetry (3 = triangle, 5 = star, 8 = flower), n1–n3 morph from star to blob. stretchX/Y warp anisotropically, modAmp/modFreq layer a radial wave on top, layerRotDeg spirals each layer relative to the last.",
  defaults: DEFAULTS,
  schema: {
    m: { value: DEFAULTS.m, min: 0, max: 20, step: 0.1 },
    n1: { value: DEFAULTS.n1, min: 0.1, max: 10, step: 0.01 },
    n2: { value: DEFAULTS.n2, min: 0.1, max: 20, step: 0.01 },
    n3: { value: DEFAULTS.n3, min: 0.1, max: 20, step: 0.01 },
    a: { value: DEFAULTS.a, min: 0.1, max: 4, step: 0.01 },
    b: { value: DEFAULTS.b, min: 0.1, max: 4, step: 0.01 },
    rotDeg: { value: DEFAULTS.rotDeg, min: -180, max: 180, step: 1 },
    stretchX: { value: DEFAULTS.stretchX, min: 0.2, max: 3, step: 0.01 },
    stretchY: { value: DEFAULTS.stretchY, min: 0.2, max: 3, step: 0.01 },
    modAmp: { value: DEFAULTS.modAmp, min: 0, max: 1, step: 0.01 },
    modFreq: { value: DEFAULTS.modFreq, min: 1, max: 20, step: 1 },
    layerRotDeg: { value: DEFAULTS.layerRotDeg, min: -45, max: 45, step: 0.5 },
    samples: { value: DEFAULTS.samples, min: 100, max: 5000, step: 50 },
    layers: { value: DEFAULTS.layers, min: 1, max: 60, step: 1 },
    layerMorph: { value: DEFAULTS.layerMorph, min: 0, max: 2, step: 0.01 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
  },
  generate: (p, _seed, canvas) => {
    const lines = [];
    const scale = 60; // arbitrary, fitToCanvas normalizes
    const baseRot = (p.rotDeg * Math.PI) / 180;
    const layerRot = (p.layerRotDeg * Math.PI) / 180;
    for (let li = 0; li < p.layers; li++) {
      const t = p.layers > 1 ? li / (p.layers - 1) : 0;
      const layerParams: Params = {
        ...p,
        n1: p.n1 + t * p.layerMorph,
        n2: p.n2 + t * p.layerMorph,
      };
      const shrink = 1 - t * 0.6;
      const rot = baseRot + li * layerRot;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const pts: Point[] = [];
      for (let i = 0; i <= p.samples; i++) {
        const phi = (i / p.samples) * Math.PI * 2;
        const mod = 1 + p.modAmp * Math.sin(p.modFreq * phi);
        const r = supershape(phi, layerParams) * scale * shrink * mod;
        const x = Math.cos(phi) * r * p.stretchX;
        const y = Math.sin(phi) * r * p.stretchY;
        pts.push([x * cosR - y * sinR, x * sinR + y * cosR]);
      }
      lines.push({ points: pts, closed: true });
    }
    const fitted = fitToCanvas(lines, canvas.wMm, canvas.hMm, p.marginMm);
    return { polylines: fitted, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
