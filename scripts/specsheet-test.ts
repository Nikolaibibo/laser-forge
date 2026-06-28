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

// 3. N spec lines produce more polylines than 1 spec line
{
  const one = specsheet.generate({ ...P, specs: "Year: 1965", footer: "" }, 1, canvas);
  const four = specsheet.generate(
    { ...P, specs: "A: 1\nB: 2\nC: 3\nD: 4", footer: "" },
    1,
    canvas,
  );
  assert.ok(four.polylines.length > one.polylines.length, "more rows → more polylines");
}
// 5. alignment: every value stays left of the inner right margin; every label
//    right of the inner left margin. Compare against a no-row baseline to isolate rows.
{
  const pad = Math.max(3, Math.min(canvas.wMm, canvas.hMm) * 0.03);
  const ix0 = P.frameInsetMm + pad;
  const ix1 = canvas.wMm - P.frameInsetMm - pad;
  const baseline = specsheet.generate({ ...P, specs: "", footer: "" }, 1, canvas);
  const art = specsheet.generate({ ...P, specs: "Diameter: 42mm", footer: "" }, 1, canvas);
  // Only check the row polylines added beyond the baseline count.
  const rowPolylines = art.polylines.slice(baseline.polylines.length);
  for (const l of rowPolylines) {
    for (const [x] of l.points) {
      assert.ok(x >= ix0 - 0.5, `point left of inner margin: ${x} < ${ix0}`);
      assert.ok(x <= ix1 + 0.5, `point right of inner margin: ${x} > ${ix1}`);
    }
  }
}
// 6. leader present: a label+value row has polylines in the x-band between them.
//    A row with a long value (small gap) has fewer/zero leader dots than a short value.
{
  const shortVal = specsheet.generate({ ...P, specs: "X: 1", footer: "" }, 1, canvas);
  const longVal = specsheet.generate(
    { ...P, specs: "X: 1234567890 1234567890", footer: "" },
    1,
    canvas,
  );
  assert.ok(
    shortVal.polylines.length > longVal.polylines.length,
    "short value leaves a wider gap → more leader dots → more polylines",
  );
}
// 7. line without ':' → label only, no value/leader (fewer polylines than with a value)
{
  const labelOnly = specsheet.generate({ ...P, specs: "SECTION HEADER", footer: "" }, 1, canvas);
  const labelValue = specsheet.generate({ ...P, specs: "Header: x", footer: "" }, 1, canvas);
  assert.ok(
    labelValue.polylines.length > labelOnly.polylines.length,
    "a value + leader add polylines vs label-only",
  );
}

console.log("specsheet-test: all assertions passed");
