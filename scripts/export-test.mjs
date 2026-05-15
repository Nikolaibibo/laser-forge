// Smoke-test: export one artwork per generator to /tmp/laser-forge-samples/
import { writeFile, mkdir } from "node:fs/promises";
const { GENERATORS } = await import("../src/generators/registry.ts");
const { svgExport } = await import("../src/render/svgExport.ts");

const outDir = "/tmp/laser-forge-samples";
await mkdir(outDir, { recursive: true });

for (const gen of GENERATORS) {
  const art = gen.generate(gen.defaults, 42, { wMm: 200, hMm: 200 });
  const svg = svgExport(art);
  const path = `${outDir}/${gen.id}.svg`;
  await writeFile(path, svg);
  console.log(`✓ ${gen.id.padEnd(22)} ${(svg.length / 1024).toFixed(1)} KB → ${path}`);
}
