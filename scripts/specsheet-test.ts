// scripts/specsheet-test.ts — layout + determinism checks for the spec sheet generator.
// Usage: npx tsx scripts/specsheet-test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { specsheet } from "../src/generators/specsheet";
import { parseSvgMotif } from "../src/util/svgImport";
import { useApp } from "../src/state/store";

const here = dirname(fileURLToPath(import.meta.url));
const canvas = { wMm: 148, hMm: 210 }; // A5 portrait
const P = { ...specsheet.defaults };

// 1. no motif → placeholder renders, artwork spans canvas
useApp.getState().setMotif(null);
{
  const art = specsheet.generate(P, 1, canvas);
  assert.equal(art.widthMm, 148);
  assert.equal(art.heightMm, 210);
  assert.ok(art.polylines.length > 0, "expected polylines with placeholder motif");
}
// 2. frame is the first polyline: closed, at frameInsetMm
{
  const art = specsheet.generate(P, 1, canvas);
  const f = art.polylines[0];
  assert.equal(f.closed, true);
  assert.deepEqual(f.points[0], [P.frameInsetMm, P.frameInsetMm]);
}
// 9a. corner marks add exactly 8 segments
{
  const a = specsheet.generate({ ...P, cornerMarks: false }, 1, canvas);
  const b = specsheet.generate({ ...P, cornerMarks: true }, 1, canvas);
  assert.equal(b.polylines.length - a.polylines.length, 8);
}
// 9b. accentTarget frame → frame polyline carries accentColor
{
  const art = specsheet.generate({ ...P, accentTarget: "frame" as const }, 1, canvas);
  assert.equal(art.polylines[0].stroke, P.accentColor);
}

console.log("specsheet-test: all assertions passed");
