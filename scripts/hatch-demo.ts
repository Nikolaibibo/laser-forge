// scripts/hatch-demo.ts — render a generator with the hatch distortion applied,
// for eyeball review. Usage: npx tsx scripts/hatch-demo.ts [generatorId] [out.svg]
import { writeFileSync } from "node:fs";
import { byId } from "../src/generators/registry";
import { hatch } from "../src/distortions/hatch";
import { svgExport } from "../src/render/svgExport";

const [, , id = "superformula", out = "/tmp/hatch-demo.svg"] = process.argv;
const gen = byId(id);
if (!gen) { console.error(`unknown generator: ${id}`); process.exit(1); }

const canvas = { wMm: 160, hMm: 230 };
const base = gen.generate(gen.defaults, 7, canvas);
const filled = hatch.apply(base, { ...hatch.defaults, layers: 2, spacingMm: 1.5 }, 7);
const svg = svgExport(filled, { strokeWidthMm: 0.3 });
writeFileSync(out, svg);
console.log(`hatch demo (${id}, ${filled.polylines.length} polylines) → ${out}`);
