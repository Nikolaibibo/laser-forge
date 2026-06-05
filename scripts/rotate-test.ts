// scripts/rotate-test.ts — checks for the whole-page rotate distortion.
// Usage: npx tsx scripts/rotate-test.ts
import assert from "node:assert/strict";
import { rotate } from "../src/distortions/rotate";
import type { Artwork } from "../src/generators/types";

const art: Artwork = {
  widthMm: 200,
  heightMm: 100,
  polylines: [
    { points: [[0, 0], [10, 0]], closed: false },          // top-left edge
    { points: [[200, 100], [190, 100]], closed: true, stroke: "#1a3a52" },
  ],
};

// 0° = identity
assert.deepEqual(rotate.apply(art, { angle: 0 }, 1), art);

// 90° CW: page swaps to 100×200; (x,y) → (h−y, x)
{
  const r = rotate.apply(art, { angle: 90 }, 1);
  assert.equal(r.widthMm, 100);
  assert.equal(r.heightMm, 200);
  assert.deepEqual(r.polylines[0].points, [[100, 0], [100, 10]]);
  assert.deepEqual(r.polylines[1].points, [[0, 200], [0, 190]]);
  assert.equal(r.polylines[1].stroke, "#1a3a52"); // colors survive
  assert.equal(r.polylines[1].closed, true);      // closed flag survives
}

// 180°: size unchanged; (x,y) → (w−x, h−y)
{
  const r = rotate.apply(art, { angle: 180 }, 1);
  assert.equal(r.widthMm, 200);
  assert.equal(r.heightMm, 100);
  assert.deepEqual(r.polylines[0].points, [[200, 100], [190, 100]]);
}

// 270° CCW: page swaps; (x,y) → (y, w−x)
{
  const r = rotate.apply(art, { angle: 270 }, 1);
  assert.equal(r.widthMm, 100);
  assert.equal(r.heightMm, 200);
  assert.deepEqual(r.polylines[0].points, [[0, 200], [0, 190]]);
}

// 90° four times = identity (round trip)
{
  let r = art;
  for (let i = 0; i < 4; i++) r = rotate.apply(r, { angle: 90 }, 1);
  assert.deepEqual(r, art);
}

console.log("rotate: all checks passed ✓");
