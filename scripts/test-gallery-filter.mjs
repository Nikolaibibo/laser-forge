import assert from "node:assert";
import { filterGenerators } from "../src/ui/GeneratorGallery.tsx";
const all = [
  { id: "flow-field", name: "Flow Field", group: "Laser" },
  { id: "pipes", name: "Truchet Pipes", group: "Pen Plotter" },
  { id: "rose", name: "Rose", group: "Laser" },
];
assert.deepStrictEqual(filterGenerators(all, "ros").map((g) => g.id), ["rose"]);
assert.deepStrictEqual(filterGenerators(all, "laser").map((g) => g.id), ["flow-field", "rose"]);
assert.deepStrictEqual(filterGenerators(all, "").map((g) => g.id), ["flow-field", "pipes", "rose"]);
console.log("ok");
