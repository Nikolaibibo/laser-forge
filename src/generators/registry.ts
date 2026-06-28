import type { GeneratorDef } from "./types";
import { harmonograph } from "./harmonograph";
import { flowField } from "./flowField";
import { voronoi } from "./voronoi";
import { voronoiMoire } from "./voronoiMoire";
import { contours } from "./contours";
import { spaceFilling } from "./spaceFilling";
import { stringArt } from "./stringArt";
import { tspArt } from "./tspArt";
import { ridgeline } from "./ridgeline";
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
import { patternMaker } from "./patternMaker";
import { svg } from "./svg";
import { specsheet } from "./specsheet";

/** Picker grouping: pen-plotter generators first (current focus), laser-era second. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GENERATOR_GROUPS: { title: string; items: GeneratorDef<any>[] }[] = [
  { title: "Import", items: [svg] },
  { title: "Pen Plotter", items: [pipes, ribbons, loops, folds, text, spaceFilling] },
  { title: "Pattern", items: [patternMaker] },
  { title: "Layout", items: [blueprint, specsheet] },
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
      voronoiMoire,
      contours,
      stringArt,
      tspArt,
      ridgeline,
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
