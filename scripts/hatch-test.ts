// scripts/hatch-test.ts — unit tests for src/util/hatch.ts
// Run: npx tsx scripts/hatch-test.ts
import assert from "node:assert/strict";
import { scanlineSpans, linkBoustrophedon, hatchPolygon } from "../src/util/hatch";
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

// --- linkBoustrophedon ---------------------------------------------
{
  const rows = scanlineSpans(square, 2);
  const runs = linkBoustrophedon(rows);
  assert.equal(runs.length, 1, "convex → one continuous run");
  assert.equal(runs[0].length, 10, "5 rows × 2 points = 10 points");
  // Boustrophedon: consecutive segment direction alternates.
  assert.equal(runs[0][0][0], 0, "starts at x=0");
  assert.equal(runs[0][1][0], 10, "first line L→R");
  assert.equal(runs[0][2][0], 10, "drops down on the right");
  assert.equal(runs[0][3][0], 0, "second line R→L (snake)");
}
{
  const runs = linkBoustrophedon(scanlineSpans(uShape, 2));
  assert.equal(runs.length, 2, "U splits into two arm-runs");
  for (const r of runs) assert.ok(r.length >= 2, "each run is drawable");
  // Verify geometric separation: each run's x-range center should favor one arm.
  const ranges = runs.map((r) => {
    const xs = r.map((p) => p[0]);
    return { min: Math.min(...xs), max: Math.max(...xs), avg: xs.reduce((a, b) => a + b) / xs.length };
  });
  // One run should have avg < 5 (left arm), one should have avg > 5 (right arm).
  const sorted = ranges.sort((a, b) => a.avg - b.avg);
  assert.ok(sorted[0].avg < 5, "left run centered on left arm");
  assert.ok(sorted[1].avg > 5, "right run centered on right arm");
}
assert.equal(linkBoustrophedon([]).length, 0, "no rows → no runs");

// --- hatchPolygon --------------------------------------------------
const within = (p: Point, lo: number, hi: number) =>
  p[0] >= lo - 1e-6 && p[0] <= hi + 1e-6 && p[1] >= lo - 1e-6 && p[1] <= hi + 1e-6;

{
  const fills = hatchPolygon(square, 0, 2); // horizontal lines
  assert.ok(fills.length >= 1, "produces fill");
  assert.equal(fills[0].closed, false, "fill is open");
  for (const f of fills) for (const p of f.points) assert.ok(within(p, 0, 10), "stays in bbox");
  // angle 0 → first drawn segment is horizontal (equal y).
  assert.ok(Math.abs(fills[0].points[0][1] - fills[0].points[1][1]) < 1e-6, "horizontal at angle 0");
}
{
  const fills = hatchPolygon(square, 90, 2); // vertical lines
  assert.ok(fills.length >= 1, "angle 90 produces fill");
  for (const f of fills) for (const p of f.points) assert.ok(within(p, 0, 10), "stays in bbox");
  // angle 90 → first drawn segment is vertical (equal x).
  assert.ok(Math.abs(fills[0].points[0][0] - fills[0].points[1][0]) < 1e-6, "vertical at angle 90");
}
{
  const plain = hatchPolygon(square, 0, 2);
  const inset = hatchPolygon(square, 0, 2, { insetMm: 2 });
  const maxX = (fs: typeof inset) => Math.max(...fs.flatMap((f) => f.points.map((p) => p[0])));
  assert.ok(maxX(inset) < maxX(plain), "inset pulls fill in from the edge");
}
assert.equal(hatchPolygon(square, 0, 0).length, 0, "spacing 0 → no fill");
assert.equal(hatchPolygon([[0, 0], [1, 1]], 0, 1).length, 0, "< 3 pts → no fill");

console.log("hatch: all checks passed ✓");
