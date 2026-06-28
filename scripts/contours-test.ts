import assert from "node:assert/strict";
import { contours } from "../src/generators/contours";

const canvas = { wMm: 148, hMm: 210 };
const P = { ...contours.defaults };

// 1. Dimensions pass through; produces contour lines.
{
  const art = contours.generate(P, 7, canvas);
  assert.equal(art.widthMm, 148);
  assert.equal(art.heightMm, 210);
  assert(art.polylines.length > 0, "noise field yields contours");
  for (const l of art.polylines) assert(l.points.length >= 2, "no degenerate lines");
}

// 2. All three field types produce output without throwing.
for (const fieldType of ["noise", "ripple", "waves"] as const) {
  const art = contours.generate({ ...P, fieldType }, 3, canvas);
  assert(art.polylines.length > 0, `${fieldType} yields contours`);
}

// 3. Determinism: same seed → identical output.
{
  const a = contours.generate(P, 42, canvas);
  const b = contours.generate(P, 42, canvas);
  assert.deepEqual(a, b, "same seed reproducible");
}

// 4. More levels → more contour lines.
{
  const few = contours.generate({ ...P, levels: 5 }, 7, canvas);
  const many = contours.generate({ ...P, levels: 30 }, 7, canvas);
  assert(many.polylines.length > few.polylines.length, "more levels → more lines");
}

// 5. Points stay within the page.
{
  const art = contours.generate(P, 7, canvas);
  for (const l of art.polylines)
    for (const [x, y] of l.points) {
      assert(x >= -0.01 && x <= canvas.wMm + 0.01, `x in page: ${x}`);
      assert(y >= -0.01 && y <= canvas.hMm + 0.01, `y in page: ${y}`);
    }
}

// 6. gridRes is clamped (huge value must not hang/throw).
{
  const art = contours.generate({ ...P, gridRes: 9999, levels: 6 }, 7, canvas);
  assert(art.polylines.length > 0, "clamped resolution still renders");
}

console.log("contours: all checks passed ✓");
