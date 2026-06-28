// src/generators/tspArt.ts — image → one continuous line ("TSP art").
//
// Pipeline: a grayscale source (an uploaded image from the store, or a
// procedural fallback) → weighted stippling (darkness-weighted centroidal
// Voronoi / Lloyd, so dots cluster in dark regions) → a single open polyline
// visiting every dot via greedy nearest-neighbour. The result plots as ONE
// stroke that reads as the picture — the classic pen-plotter portrait.
//
// The store image needs the browser (<canvas> decode), so headless tests/renders
// use the procedural sources, which exercise the whole stipple+order pipeline.
import { Delaunay } from "d3-delaunay";
import type { GeneratorDef, Point, Polyline } from "./types";
import type { SourceImage } from "../util/imageLoad";
import { makeRng, type RNG } from "../util/random";
import { useApp } from "../state/store";
import { fitToCanvas } from "../util/path";

type Source = "image" | "radial" | "rings" | "linear";

type Params = {
  source: Source;
  points: number;
  relax: number; // Lloyd iterations
  gamma: number; // contrast on darkness weighting
  invert: boolean;
  optimize: boolean; // 2-opt cleanup of the nearest-neighbour tour
  marginMm: number;
};

const DEFAULTS: Params = {
  source: "image",
  points: 2500,
  relax: 12,
  gamma: 1.6,
  invert: false,
  optimize: true,
  marginMm: 10,
};

// Procedural luminance fields (0=black=dense, 1=white=sparse) for headless use.
const proceduralField = (kind: Source, w = 220, h = 280): SourceImage => {
  const lum = new Array<number>(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / (w - 1);
      const ny = y / (h - 1);
      let v = 1;
      if (kind === "radial") {
        const r = Math.hypot(nx - 0.5, ny - 0.5) / 0.707;
        v = r; // dark centre
      } else if (kind === "rings") {
        v = 0.5 + 0.5 * Math.cos(Math.hypot(nx - 0.5, ny - 0.5) * 36);
      } else {
        v = ny; // linear top→bottom
      }
      lum[y * w + x] = Math.max(0, Math.min(1, v));
    }
  }
  return { name: kind, lum, w, h };
};

// Bilinear luminance at normalized (x,y) ∈ [0,1].
const sampleLum = (img: SourceImage, x: number, y: number): number => {
  const fx = Math.max(0, Math.min(img.w - 1, x * (img.w - 1)));
  const fy = Math.max(0, Math.min(img.h - 1, y * (img.h - 1)));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(img.w - 1, x0 + 1);
  const y1 = Math.min(img.h - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = img.lum[y0 * img.w + x0];
  const b = img.lum[y0 * img.w + x1];
  const c = img.lum[y1 * img.w + x0];
  const d = img.lum[y1 * img.w + x1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
};

const dist = (a: Point, b: Point): number => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);

/**
 * 2-opt on an open path: repeatedly reverse a segment [i+1..j] when doing so
 * shortens the tour (uncrosses edges) — this removes the long "return" jumps a
 * greedy nearest-neighbour tour leaves behind. Bounded by maxPasses, sped up
 * with don't-look bits so settled nodes are skipped on later passes. Endpoints
 * 0 and n-1 are never relocated, so it stays a single open stroke.
 */
const twoOpt = (path: Point[], maxPasses: number): void => {
  const n = path.length;
  if (n < 4) return;
  const active = new Uint8Array(n).fill(1);
  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;
    for (let i = 0; i < n - 2; i++) {
      if (!active[i]) continue;
      const a = path[i];
      const b = path[i + 1];
      const dab = dist(a, b);
      let found = false;
      for (let j = i + 2; j < n - 1; j++) {
        const c = path[j];
        const d = path[j + 1];
        if (dist(a, c) + dist(b, d) + 1e-9 < dab + dist(c, d)) {
          let lo = i + 1;
          let hi = j;
          while (lo < hi) {
            const t = path[lo];
            path[lo] = path[hi];
            path[hi] = t;
            lo++;
            hi--;
          }
          active[i] = 1;
          active[i + 1] = 1;
          active[j] = 1;
          active[j + 1] = 1;
          improved = true;
          found = true;
          break;
        }
      }
      if (!found) active[i] = 0;
    }
    if (!improved) break;
  }
};

const doTsp = (p: Params, seed: number, W: number, H: number): Polyline[] => {
  const img =
    p.source === "image"
      ? useApp.getState().sourceImage ?? proceduralField("radial")
      : proceduralField(p.source);

  // darkness weight ∈ [0,1] at normalized (x,y) — higher = more dots.
  const weight = (x: number, y: number): number => {
    let l = sampleLum(img, x, y);
    if (p.invert) l = 1 - l;
    return Math.pow(1 - l, p.gamma);
  };

  const rng: RNG = makeRng(seed);
  const N = Math.max(50, Math.min(8000, Math.round(p.points)));

  // Aspect-correct working box [0,aspectW]×[0,aspectH] so the stipple matches
  // the image proportions (fitToCanvas re-fits to the page afterward).
  const aspect = img.w / img.h;
  const bw = aspect >= 1 ? 1 : aspect;
  const bh = aspect >= 1 ? 1 / aspect : 1;

  // Seed points by rejection sampling against darkness.
  const pts: Point[] = [];
  let guard = 0;
  while (pts.length < N && guard < N * 200) {
    guard++;
    const x = rng() * bw;
    const y = rng() * bh;
    if (rng() < weight(x / bw, y / bh)) pts.push([x, y]);
  }
  // If the image is nearly white, top up uniformly so we always have N points.
  while (pts.length < N) pts.push([rng() * bw, rng() * bh]);

  // Weighted Lloyd relaxation: assign each grid pixel to its nearest site
  // (weighted by darkness), move each site to its weighted centroid.
  const gw = Math.min(img.w, 200);
  const gh = Math.min(img.h, 200);
  for (let iter = 0; iter < Math.max(0, Math.round(p.relax)); iter++) {
    const d = Delaunay.from(pts);
    const sumX = new Float64Array(pts.length);
    const sumY = new Float64Array(pts.length);
    const sumW = new Float64Array(pts.length);
    let hint = 0;
    for (let py = 0; py < gh; py++) {
      for (let px = 0; px < gw; px++) {
        const nx = (px + 0.5) / gw;
        const ny = (py + 0.5) / gh;
        const w = weight(nx, ny);
        if (w <= 0) continue;
        const gx = nx * bw;
        const gy = ny * bh;
        hint = d.find(gx, gy, hint);
        sumX[hint] += gx * w;
        sumY[hint] += gy * w;
        sumW[hint] += w;
      }
    }
    for (let i = 0; i < pts.length; i++) {
      if (sumW[i] > 1e-9) pts[i] = [sumX[i] / sumW[i], sumY[i] / sumW[i]];
    }
  }

  // Greedy nearest-neighbour tour → one continuous polyline.
  const used = new Uint8Array(pts.length);
  const order: Point[] = [];
  let cur = 0;
  used[0] = 1;
  order.push(pts[0]);
  for (let k = 1; k < pts.length; k++) {
    let best = -1;
    let bestD = Infinity;
    const [cx, cy] = pts[cur];
    for (let i = 0; i < pts.length; i++) {
      if (used[i]) continue;
      const dx = pts[i][0] - cx;
      const dy = pts[i][1] - cy;
      const dd = dx * dx + dy * dy;
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    }
    if (best < 0) break;
    used[best] = 1;
    order.push(pts[best]);
    cur = best;
  }

  // 2-opt cleanup. Pass budget shrinks as N grows so generate() stays reactive.
  if (p.optimize) {
    const passes = order.length <= 2000 ? 8 : order.length <= 4000 ? 4 : 2;
    twoOpt(order, passes);
  }

  return fitToCanvas([{ points: order, closed: false }], W, H, p.marginMm);
};

export const tspArt: GeneratorDef<Params> = {
  id: "tspArt",
  name: "TSP Art / Stippling",
  description:
    "Image → one continuous line. Darkness-weighted stippling (Lloyd) places dots " +
    "denser in dark regions; a nearest-neighbour tour links them into a single " +
    "stroke. Load an image, or use a procedural source.",
  defaults: DEFAULTS,
  schema: {
    source: {
      value: DEFAULTS.source,
      options: ["image", "radial", "rings", "linear"],
      label: "Quelle",
      hint: "image = hochgeladenes Bild; sonst prozedural",
    },
    points: { value: DEFAULTS.points, min: 200, max: 8000, step: 50, label: "Punkte", hint: "mehr = feiner, längere Plot-Zeit" },
    relax: { value: DEFAULTS.relax, min: 0, max: 30, step: 1, label: "Lloyd-Iterationen", hint: "höher = gleichmäßigeres Stippling" },
    gamma: { value: DEFAULTS.gamma, min: 0.4, max: 3, step: 0.1, label: "Kontrast (Gamma)" },
    invert: { value: DEFAULTS.invert, label: "Invertieren" },
    optimize: { value: DEFAULTS.optimize, label: "2-opt Optimierung", hint: "löst lange NN-Sprünge auf (bei sehr vielen Punkten ggf. aus)" },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1, label: "Rand (mm)" },
  },
  generate: (p, seed, canvas) => ({
    polylines: doTsp(p, seed, canvas.wMm, canvas.hMm),
    widthMm: canvas.wMm,
    heightMm: canvas.hMm,
  }),
};
