import type { DistortionDef } from "../generators/types";
import { mergePaths, MERGE_TOLERANCE_MM } from "../util/mergePaths";

type Params = {
  toleranceMm: number;
};

const DEFAULTS: Params = {
  toleranceMm: MERGE_TOLERANCE_MM,
};

export const pathJoin: DistortionDef<Params> = {
  id: "path-join",
  name: "Path Join",
  description:
    "Chains open polylines that share endpoints into continuous paths, reducing pen lifts. Closed polylines pass through unchanged.",
  defaults: DEFAULTS,
  schema: {
    toleranceMm: { value: DEFAULTS.toleranceMm, min: 0.01, max: 1, step: 0.01 },
  },
  apply: (art, p) => ({
    ...art,
    polylines: mergePaths(art.polylines, p.toleranceMm),
  }),
};
