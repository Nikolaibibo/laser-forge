import assert from "node:assert/strict";
import { spaceFilling } from "../src/generators/spaceFilling";

const canvas = { wMm: 200, hMm: 200 };
const P = { ...spaceFilling.defaults };

// 1. Every curve is a single continuous stroke; dims pass through.
for (const curve of ["hilbert", "moore", "gosper", "dragon", "sierpinski"] as const) {
  const art = spaceFilling.generate({ ...P, curve, order: 4 }, 1, canvas);
  assert.equal(art.widthMm, 200);
  assert.equal(art.polylines.length, 1, `${curve} = one polyline`);
  assert(art.polylines[0].points.length > 4, `${curve} has points`);
}

// 2. Moore is a closed loop; Hilbert is open.
{
  const moore = spaceFilling.generate({ ...P, curve: "moore", order: 3 }, 1, canvas);
  const hilbert = spaceFilling.generate({ ...P, curve: "hilbert", order: 3 }, 1, canvas);
  assert.equal(moore.polylines[0].closed, true, "moore closed");
  assert.equal(hilbert.polylines[0].closed, false, "hilbert open");
}

// 3. Higher order → more points.
{
  const o3 = spaceFilling.generate({ ...P, curve: "hilbert", order: 3 }, 1, canvas);
  const o5 = spaceFilling.generate({ ...P, curve: "hilbert", order: 5 }, 1, canvas);
  assert(o5.polylines[0].points.length > o3.polylines[0].points.length, "order grows path");
}

// 4. Order is clamped per curve (no explosion / no crash).
{
  const art = spaceFilling.generate({ ...P, curve: "hilbert", order: 99 }, 1, canvas);
  assert(art.polylines[0].points.length < 200000, "clamped to a sane size");
}

// 5. Seed-independent (deterministic geometry).
{
  const a = spaceFilling.generate({ ...P, curve: "gosper", order: 3 }, 1, canvas);
  const b = spaceFilling.generate({ ...P, curve: "gosper", order: 3 }, 999, canvas);
  assert.deepEqual(a, b, "no randomness");
}

console.log("space-filling: all checks passed ✓");
