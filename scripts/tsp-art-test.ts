import assert from "node:assert/strict";
import { tspArt } from "../src/generators/tspArt";

const canvas = { wMm: 180, hMm: 240 };
const P = { ...tspArt.defaults, source: "radial" as const, points: 800, relax: 4 };

// 1. One continuous polyline visiting ~all points; dims pass through.
{
  const art = tspArt.generate(P, 7, canvas);
  assert.equal(art.widthMm, 180);
  assert.equal(art.polylines.length, 1, "single continuous stroke");
  assert(art.polylines[0].points.length > 700, "visits most stipple points");
  assert.equal(art.polylines[0].closed, false, "open tour");
}

// 2. More points → longer path.
{
  const few = tspArt.generate({ ...P, points: 400 }, 7, canvas);
  const many = tspArt.generate({ ...P, points: 1500 }, 7, canvas);
  assert(many.polylines[0].points.length > few.polylines[0].points.length, "more dots → longer line");
}

// 3. Determinism: same seed → identical.
{
  const a = tspArt.generate(P, 42, canvas);
  const b = tspArt.generate(P, 42, canvas);
  assert.deepEqual(a, b, "same seed reproducible");
}

// 4. Different seed → different tour.
{
  const a = tspArt.generate(P, 1, canvas);
  const b = tspArt.generate(P, 2, canvas);
  assert.notDeepEqual(a, b, "seed varies the stipple");
}

// 5. Procedural sources all render; points stay in page.
for (const source of ["radial", "rings", "linear"] as const) {
  const art = tspArt.generate({ ...P, source }, 3, canvas);
  assert(art.polylines[0].points.length > 100, `${source} renders`);
  for (const [x, y] of art.polylines[0].points) {
    assert(x >= -0.01 && x <= canvas.wMm + 0.01, `x in page`);
    assert(y >= -0.01 && y <= canvas.hMm + 0.01, `y in page`);
  }
}

// 6. invert flips the dense region (different result).
{
  const normal = tspArt.generate({ ...P, source: "linear", invert: false }, 7, canvas);
  const inv = tspArt.generate({ ...P, source: "linear", invert: true }, 7, canvas);
  assert.notDeepEqual(normal, inv, "invert changes density");
}

// 7. 2-opt shortens the tour vs. the raw nearest-neighbour path.
{
  const len = (a: ReturnType<typeof tspArt.generate>) => {
    const pts = a.polylines[0].points;
    let d = 0;
    for (let i = 1; i < pts.length; i++) {
      d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    return d;
  };
  const raw = tspArt.generate({ ...P, optimize: false }, 7, canvas);
  const opt = tspArt.generate({ ...P, optimize: true }, 7, canvas);
  assert(len(opt) < len(raw), `2-opt shortens tour (${len(opt).toFixed(0)} < ${len(raw).toFixed(0)})`);
}

console.log("tsp-art: all checks passed ✓");
