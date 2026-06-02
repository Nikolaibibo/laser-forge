import type { GeneratorDef } from "./types";
import { harmonograph } from "./harmonograph";
import { flowField } from "./flowField";
import { voronoi } from "./voronoi";
import { lSystem } from "./lSystem";
import { differentialGrowth } from "./differentialGrowth";
import { superformula } from "./superformula";
import { attractor } from "./attractor";
import { rose } from "./rose";
import { spirograph } from "./spirograph";
import { truchet } from "./truchet";
import { meander } from "./meander";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GENERATORS: GeneratorDef<any>[] = [
  flowField,
  harmonograph,
  rose,
  spirograph,
  superformula,
  truchet,
  attractor,
  voronoi,
  lSystem,
  differentialGrowth,
  meander,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const byId = (id: string): GeneratorDef<any> | undefined =>
  GENERATORS.find((g) => g.id === id);
