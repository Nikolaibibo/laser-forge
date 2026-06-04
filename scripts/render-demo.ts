// scripts/render-demo.ts — headless demo renderer for visual review.
// Usage: npx tsx scripts/render-demo.ts <generatorId> [seed] [out.svg] [k=v ...]
// Param overrides are coerced against the generator's defaults (number/boolean/string).
import { writeFileSync } from "node:fs";
import { byId } from "../src/generators/registry";
import { svgExport } from "../src/render/svgExport";

const [, , id = "pipes", seedArg = "7", out = `/tmp/${id}.svg`, ...overrides] = process.argv;
const gen = byId(id);
if (!gen) {
  console.error(`unknown generator: ${id}`);
  process.exit(1);
}

const params: Record<string, unknown> = { ...gen.defaults };
for (const kv of overrides) {
  const [k, v] = kv.split("=");
  const cur = params[k];
  if (typeof cur === "number") params[k] = Number(v);
  else if (typeof cur === "boolean") params[k] = v === "true";
  else params[k] = v;
}

const seed = Number(seedArg);
const art = gen.generate(params, seed, { wMm: 160, hMm: 230 });
const svg = svgExport(art);
writeFileSync(out, svg);
console.log(`${id} seed=${seed} → ${out} (${art.polylines.length} polylines, ${svg.length} bytes)`);
