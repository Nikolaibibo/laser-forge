// scripts/render-demo.ts — headless demo renderer for visual review.
// Usage: npx tsx scripts/render-demo.ts <generatorId> [seed] [out.svg] [k=v ...]
// Param overrides are coerced against the generator's defaults (number/boolean/string).
// Special key: pen=<mm> sets the export stroke width (not a generator param).
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { byId } from "../src/generators/registry";
import { svgExport } from "../src/render/svgExport";
import { parseSvgMotif } from "../src/util/svgImport";
import { useApp } from "../src/state/store";

const [, , id = "pipes", seedArg = "7", out = `/tmp/${id}.svg`, ...overrides] = process.argv;
const gen = byId(id);
if (!gen) {
  console.error(`unknown generator: ${id}`);
  process.exit(1);
}

const params: Record<string, unknown> = { ...gen.defaults };
let penWidthMm: number | undefined;
let canvasW = 160;
let canvasH = 230;
for (const kv of overrides) {
  const [k, ...rest] = kv.split("=");
  const v = rest.join("=");
  if (k === "pen") {
    penWidthMm = Number(v);
    continue;
  }
  if (k === "motif") {
    const src = readFileSync(v, "utf8");
    useApp.getState().setMotif({ name: basename(v), ...parseSvgMotif(src) });
    continue;
  }
  if (k === "canvas") {
    const [cw, ch] = v.split("x").map(Number);
    canvasW = cw;
    canvasH = ch;
    continue;
  }
  const cur = params[k];
  if (typeof cur === "number") params[k] = Number(v);
  else if (typeof cur === "boolean") params[k] = v === "true";
  else params[k] = v;
}

const seed = Number(seedArg);
const art = gen.generate(params, seed, { wMm: canvasW, hMm: canvasH });
const svg = svgExport(art, { strokeWidthMm: penWidthMm });
writeFileSync(out, svg);
console.log(`${id} seed=${seed} → ${out} (${art.polylines.length} polylines, ${svg.length} bytes)`);
