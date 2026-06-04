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
import { pipes } from "./pipes";
import { loops } from "./loops";
import { ribbons } from "./ribbons";
import { folds } from "./folds";
import { text } from "./text";
import { blueprint } from "./blueprint";

/** Picker grouping: pen-plotter generators first (current focus), laser-era second. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GENERATOR_GROUPS: { title: string; items: GeneratorDef<any>[] }[] = [
  { title: "Pen Plotter", items: [pipes, ribbons, loops, folds, text] },
  { title: "Layout", items: [blueprint] },
  {
    title: "Laser",
    items: [
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
    ],
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GENERATORS: GeneratorDef<any>[] = GENERATOR_GROUPS.flatMap((g) => g.items);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const byId = (id: string): GeneratorDef<any> | undefined =>
  GENERATORS.find((g) => g.id === id);
