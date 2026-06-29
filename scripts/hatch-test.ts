// scripts/hatch-test.ts — unit tests for src/util/hatch.ts
// Run: npx tsx scripts/hatch-test.ts
import assert from "node:assert/strict";
import { scanlineSpans } from "../src/util/hatch";
import type { Point } from "../src/generators/types";

const square: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
// "U" opening upward: solid below y=3, two arms above.
const uShape: Point[] = [
  [0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10],
];

// --- scanlineSpans -------------------------------------------------
{
  const rows = scanlineSpans(square, 2); // rows at y = 1,3,5,7,9
  assert.equal(rows.length, 5, "square/spacing2 → 5 rows");
  for (const r of rows) {
    assert.equal(r.spans.length, 1, "convex → 1 span per row");
    assert.deepEqual(r.spans[0], [0, 10], "span spans full width");
  }
}
{
  const rows = scanlineSpans(uShape, 2); // rows at y = 1,3,5,7,9
  const low = rows[0];
  assert.equal(low.spans.length, 1, "below opening → 1 span");
  assert.deepEqual(low.spans[0], [0, 10], "solid base full width");
  const mid = rows[2];
  assert.equal(mid.spans.length, 2, "in the opening → 2 spans");
  assert.deepEqual(mid.spans, [[0, 3], [7, 10]], "two arms");
}
assert.equal(scanlineSpans(square, 0).length, 0, "spacing 0 → no rows");
assert.equal(scanlineSpans([[0, 0], [1, 1]], 1).length, 0, "< 3 pts → no rows");

console.log("hatch scanlineSpans: all checks passed ✓");
