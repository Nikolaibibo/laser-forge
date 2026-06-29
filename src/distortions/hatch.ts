import type { DistortionDef, Polyline } from "../generators/types";
import { hatchPolygon } from "../util/hatch";

type Params = {
  spacingMm: number;
  angleDeg: number;
  layers: number;
  angleStepDeg: number;
  keepOutline: boolean;
  insetMm: number;
};

const DEFAULTS: Params = {
  spacingMm: 1.2,
  angleDeg: 45,
  layers: 1,
  angleStepDeg: 90,
  keepOutline: true,
  insetMm: 0,
};

export const hatch: DistortionDef<Params> = {
  id: "hatch",
  name: "Hatch",
  description:
    "Fills closed shapes with parallel hatch lines, boustrophedon-linked to cut pen lifts. layers (1-3) cross-hatch at angleStepDeg offsets for tonal range; spacingMm is the tone lever (tighter = darker). keepOutline also draws the boundary; insetMm pulls the fill in from the edge. Open polylines pass through unchanged. Single-contour even-odd: holes formed by separate contours are not subtracted.",
  defaults: DEFAULTS,
  schema: {
    spacingMm: { value: DEFAULTS.spacingMm, min: 0.3, max: 5, step: 0.1 },
    angleDeg: { value: DEFAULTS.angleDeg, min: 0, max: 180, step: 1 },
    layers: { value: DEFAULTS.layers, min: 1, max: 3, step: 1 },
    angleStepDeg: { value: DEFAULTS.angleStepDeg, min: 15, max: 90, step: 1 },
    keepOutline: { value: DEFAULTS.keepOutline },
    insetMm: { value: DEFAULTS.insetMm, min: 0, max: 3, step: 0.1 },
  },
  apply: (art, p) => {
    const spacing = Math.max(0.05, p.spacingMm);
    const layers = Math.max(1, Math.min(3, Math.round(p.layers)));
    const out: Polyline[] = [];
    for (const line of art.polylines) {
      if (!line.closed || line.points.length < 3) {
        out.push(line); // open / degenerate → unchanged
        continue;
      }
      if (p.keepOutline) out.push(line);
      for (let i = 0; i < layers; i++) {
        const fill = hatchPolygon(line.points, p.angleDeg + i * p.angleStepDeg, spacing, {
          insetMm: p.insetMm,
        });
        for (const f of fill) out.push({ ...f, stroke: line.stroke });
      }
    }
    return { ...art, polylines: out };
  },
};
