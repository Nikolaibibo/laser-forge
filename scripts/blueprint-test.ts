// scripts/blueprint-test.ts — layout + determinism checks for the blueprint generator.
// Usage: npx tsx scripts/blueprint-test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { blueprint } from "../src/generators/blueprint";
import { parseSvgMotif } from "../src/util/svgImport";
import { useApp } from "../src/state/store";
import { svgExport } from "../src/render/svgExport";

const here = dirname(fileURLToPath(import.meta.url));
const canvas = { wMm: 148, hMm: 210 }; // A5 portrait
const P = { ...blueprint.defaults };

// 1. no motif → placeholder renders, artwork spans canvas
useApp.getState().setMotif(null);
{
  const art = blueprint.generate(P, 1, canvas);
  assert.equal(art.widthMm, 148);
  assert.equal(art.heightMm, 210);
  assert.ok(art.polylines.length > 0, "expected polylines with placeholder motif");
}
// 2. frame is the first polyline: closed, at frameInsetMm
{
  const art = blueprint.generate(P, 1, canvas);
  const f = art.polylines[0];
  assert.equal(f.closed, true);
  assert.deepEqual(f.points[0], [P.frameInsetMm, P.frameInsetMm]);
}
// 3. slot collapse: empty subtitle → fewer polylines than with subtitle
{
  const a = blueprint.generate({ ...P, subtitle: "" }, 1, canvas);
  const b = blueprint.generate({ ...P, subtitle: "Manual-Wind Chronograph" }, 1, canvas);
  assert.ok(b.polylines.length > a.polylines.length, "subtitle should add polylines");
}
// 4. accentTarget frame → frame polyline carries accentColor
{
  const art = blueprint.generate({ ...P, accentTarget: "frame" as const }, 1, canvas);
  assert.equal(art.polylines[0].stroke, P.accentColor);
}
// 5. corner marks add exactly 8 segments
{
  const a = blueprint.generate({ ...P, cornerMarks: false }, 1, canvas);
  const b = blueprint.generate({ ...P, cornerMarks: true }, 1, canvas);
  assert.equal(b.polylines.length - a.polylines.length, 8);
}
// 6. motif embedding: all points stay inside the canvas
{
  const fixture = readFileSync(join(here, "fixtures/motif-gear.svg"), "utf8");
  useApp.getState().setMotif({ name: "gear", ...parseSvgMotif(fixture) });
  const art = blueprint.generate(P, 1, canvas);
  for (const l of art.polylines) {
    for (const [x, y] of l.points) {
      assert.ok(x >= 0 && x <= 148 && y >= 0 && y <= 210, `point outside canvas: ${x},${y}`);
    }
  }
}
// 7. determinism: identical SVG bytes on repeat generate
{
  const s1 = svgExport(blueprint.generate(P, 7, canvas), {});
  const s2 = svgExport(blueprint.generate(P, 7, canvas), {});
  assert.equal(s1, s2);
}

console.log("blueprint: all checks passed ✓");
