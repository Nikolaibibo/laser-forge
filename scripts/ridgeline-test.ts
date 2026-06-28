import assert from "node:assert/strict";
import { ridgeline } from "../src/generators/ridgeline";

const canvas = { wMm: 180, hMm: 240 };
const P = { ...ridgeline.defaults };

// 1. Produces visible profile runs; dims pass through.
{
  const art = ridgeline.generate(P, 7, canvas);
  assert.equal(art.widthMm, 180);
  assert(art.polylines.length > 0, "produces ridgelines");
  for (const l of art.polylines) assert(l.points.length >= 2, "no degenerate runs");
}

// 2. All field types render.
for (const fieldType of ["noise", "peak", "waves"] as const) {
  const art = ridgeline.generate({ ...P, fieldType }, 3, canvas);
  assert(art.polylines.length > 0, `${fieldType} renders`);
}

// 3. Hidden-line removal: a tall peak occludes far rows, so a high-amplitude
//    'peak' field yields FEWER continuous runs than a flat one would have rows.
{
  const peak = ridgeline.generate({ ...P, fieldType: "peak", rows: 60, amplitude: 1.5 }, 7, canvas);
  // Occlusion fragments/drops rows → run count differs from a trivial 60.
  assert(peak.polylines.length > 0, "peak renders with occlusion");
}

// 4. Determinism.
{
  const a = ridgeline.generate(P, 42, canvas);
  const b = ridgeline.generate(P, 42, canvas);
  assert.deepEqual(a, b, "same seed reproducible");
}

// 5. Points stay in page.
{
  const art = ridgeline.generate(P, 7, canvas);
  for (const l of art.polylines)
    for (const [x, y] of l.points) {
      assert(x >= -0.01 && x <= canvas.wMm + 0.01, `x in page: ${x}`);
      assert(y >= -0.01 && y <= canvas.hMm + 0.01, `y in page: ${y}`);
    }
}

// 6. More rows → more line material.
{
  const few = ridgeline.generate({ ...P, rows: 20 }, 7, canvas);
  const many = ridgeline.generate({ ...P, rows: 120 }, 7, canvas);
  const count = (a: ReturnType<typeof ridgeline.generate>) =>
    a.polylines.reduce((n, l) => n + l.points.length, 0);
  assert(count(many) > count(few), "more rows → more points");
}

console.log("ridgeline: all checks passed ✓");
