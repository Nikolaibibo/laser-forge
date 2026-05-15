import fs from "node:fs";
import { GENERATORS, byId } from "../src/generators/registry.ts";
import { distortionById } from "../src/distortions/registry.ts";
import { svgExport } from "../src/render/svgExport.ts";

const canvas = { wMm: 200, hMm: 200 };
const outDir = "/tmp/laser-forge-samples";

// Pipeline 1: rose → kaleidoscope(8) → noise warp → chaikin
{
  const gen = byId("rose");
  const kaleido = distortionById("kaleidoscope");
  const warp = distortionById("noise-warp");
  const chaikin = distortionById("chaikin");
  let art = gen.generate(gen.defaults, 42, canvas);
  art = kaleido.apply(art, { ...kaleido.defaults, count: 8, mirror: true }, 42, canvas);
  art = warp.apply(art, { ...warp.defaults, amountMm: 3, scale: 0.015 }, 100, canvas);
  art = chaikin.apply(art, { ...chaikin.defaults, iterations: 3 }, 0, canvas);
  fs.writeFileSync(`${outDir}/pipeline-rose-mandala.svg`, svgExport(art));
  console.log(`✓ rose → kaleidoscope(8) → noise-warp → chaikin`);
}

// Pipeline 2: flow field → chaikin
{
  const gen = byId("flow-field");
  const chaikin = distortionById("chaikin");
  let art = gen.generate(gen.defaults, 7, canvas);
  art = chaikin.apply(art, { ...chaikin.defaults, iterations: 2 }, 0, canvas);
  fs.writeFileSync(`${outDir}/pipeline-flowfield-soft.svg`, svgExport(art));
  console.log(`✓ flow-field → chaikin`);
}

// Pipeline 3: differential growth → noise warp
{
  const gen = byId("differential-growth");
  const warp = distortionById("noise-warp");
  let art = gen.generate(gen.defaults, 99, canvas);
  art = warp.apply(art, { ...warp.defaults, amountMm: 2 }, 55, canvas);
  fs.writeFileSync(`${outDir}/pipeline-growth-warped.svg`, svgExport(art));
  console.log(`✓ differential-growth → noise-warp`);
}

// Pipeline 4: superformula → kaleidoscope(6)
{
  const gen = byId("superformula");
  const kaleido = distortionById("kaleidoscope");
  let art = gen.generate({ ...gen.defaults, m: 5 }, 42, canvas);
  art = kaleido.apply(art, { ...kaleido.defaults, count: 6, mirror: true }, 0, canvas);
  fs.writeFileSync(`${outDir}/pipeline-superformula-kaleido.svg`, svgExport(art));
  console.log(`✓ superformula → kaleidoscope(6)`);
}
