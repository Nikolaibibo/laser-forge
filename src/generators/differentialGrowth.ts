import type { GeneratorDef, Point, Polyline } from "./types";
import { makeRng } from "../util/random";

type Params = {
  initialNodes: number;
  iterations: number;
  attractionRadius: number;
  repulsionRadius: number;
  attraction: number;
  repulsion: number;
  maxEdgeLength: number;
  minEdgeLength: number;
  maxNodes: number;
  marginMm: number;
};

const DEFAULTS: Params = {
  initialNodes: 24,
  iterations: 120,
  attractionRadius: 6,
  repulsionRadius: 6,
  attraction: 0.35,
  repulsion: 0.8,
  maxEdgeLength: 3,
  minEdgeLength: 1.5,
  maxNodes: 1500,
  marginMm: 15,
};

export const differentialGrowth: GeneratorDef<Params> = {
  id: "differential-growth",
  name: "Differential Growth",
  description:
    "A ring of nodes grows: neighbors attract, global repulsion pushes apart, overlong edges split. Produces Anders Hoff–style organic blobs.",
  defaults: DEFAULTS,
  schema: {
    initialNodes: { value: DEFAULTS.initialNodes, min: 6, max: 200, step: 1 },
    iterations: { value: DEFAULTS.iterations, min: 10, max: 600, step: 5 },
    attractionRadius: { value: DEFAULTS.attractionRadius, min: 0.5, max: 20, step: 0.1 },
    repulsionRadius: { value: DEFAULTS.repulsionRadius, min: 0.5, max: 20, step: 0.1 },
    attraction: { value: DEFAULTS.attraction, min: 0, max: 2, step: 0.01 },
    repulsion: { value: DEFAULTS.repulsion, min: 0, max: 3, step: 0.01 },
    maxEdgeLength: { value: DEFAULTS.maxEdgeLength, min: 0.5, max: 10, step: 0.1 },
    minEdgeLength: { value: DEFAULTS.minEdgeLength, min: 0.2, max: 8, step: 0.1 },
    maxNodes: { value: DEFAULTS.maxNodes, min: 100, max: 5000, step: 50 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
  },
  generate: (p, seed, canvas) => {
    const rng = makeRng(seed);
    const cx = canvas.wMm / 2;
    const cy = canvas.hMm / 2;
    const r0 = Math.min(canvas.wMm, canvas.hMm) / 10;

    let nodes: Point[] = [];
    for (let i = 0; i < p.initialNodes; i++) {
      const a = (i / p.initialNodes) * Math.PI * 2;
      nodes.push([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0]);
    }

    // Spatial hash for repulsion
    const rep2 = p.repulsionRadius * p.repulsionRadius;
    const att2 = p.attractionRadius * p.attractionRadius;

    const xMin = p.marginMm;
    const yMin = p.marginMm;
    const xMax = canvas.wMm - p.marginMm;
    const yMax = canvas.hMm - p.marginMm;

    for (let it = 0; it < p.iterations; it++) {
      const n = nodes.length;
      const fx = new Float32Array(n);
      const fy = new Float32Array(n);

      // Attraction between neighbours on the ring
      for (let i = 0; i < n; i++) {
        const nb = (i + 1) % n;
        const dx = nodes[nb][0] - nodes[i][0];
        const dy = nodes[nb][1] - nodes[i][1];
        const d2 = dx * dx + dy * dy;
        if (d2 < att2 && d2 > 0) {
          const d = Math.sqrt(d2);
          const k = p.attraction * (1 - (p.minEdgeLength / d));
          fx[i] += dx * k;
          fy[i] += dy * k;
          fx[nb] -= dx * k;
          fy[nb] -= dy * k;
        }
      }

      // Global repulsion (O(n^2)) — fine up to ~1500 nodes
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = nodes[j][0] - nodes[i][0];
          const dy = nodes[j][1] - nodes[i][1];
          const d2 = dx * dx + dy * dy;
          if (d2 > 0 && d2 < rep2) {
            const d = Math.sqrt(d2);
            const f = (p.repulsion * (p.repulsionRadius - d)) / d;
            fx[i] -= dx * f;
            fy[i] -= dy * f;
            fx[j] += dx * f;
            fy[j] += dy * f;
          }
        }
      }

      // Apply forces + clamp to bounds
      for (let i = 0; i < n; i++) {
        let nx = nodes[i][0] + fx[i];
        let ny = nodes[i][1] + fy[i];
        if (nx < xMin) nx = xMin;
        if (nx > xMax) nx = xMax;
        if (ny < yMin) ny = yMin;
        if (ny > yMax) ny = yMax;
        nodes[i] = [nx, ny];
      }

      // Split long edges
      if (nodes.length < p.maxNodes) {
        const next: Point[] = [];
        for (let i = 0; i < n; i++) {
          next.push(nodes[i]);
          const nb = (i + 1) % n;
          const dx = nodes[nb][0] - nodes[i][0];
          const dy = nodes[nb][1] - nodes[i][1];
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > p.maxEdgeLength) {
            next.push([
              (nodes[i][0] + nodes[nb][0]) / 2 + (rng() - 0.5) * 0.01,
              (nodes[i][1] + nodes[nb][1]) / 2 + (rng() - 0.5) * 0.01,
            ]);
          }
        }
        nodes = next;
      }
    }

    const line: Polyline = { points: nodes, closed: true };
    return { polylines: [line], widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
