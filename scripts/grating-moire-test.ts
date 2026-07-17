import assert from "node:assert/strict";
import { gratingMoire } from "../src/generators/gratingMoire";

const canvas = { wMm: 148, hMm: 210 }; // A5 portrait
const P = { ...gratingMoire.defaults };

// 1. Canvas dimensions pass through unchanged + produces lines.
{
  const art = gratingMoire.generate(P, 7, canvas);
  assert.equal(art.widthMm, 148, "widthMm");
  assert.equal(art.heightMm, 210, "heightMm");
  assert(art.polylines.length > 0, "produces grating lines");
}

// 2. Two pen colours present; every line is a 2-point open segment.
{
  const art = gratingMoire.generate(P, 7, canvas);
  const colors = new Set(art.polylines.map((l) => l.stroke));
  assert(colors.has(P.colorA), "grating A colour present");
  assert(colors.has(P.colorB), "grating B colour present");
  assert.equal(colors.size, 2, "exactly two pen colours");
  for (const l of art.polylines) {
    assert.equal(l.points.length, 2, "grating line = 2 points");
    assert.equal(l.closed, false, "grating line is open");
  }
}

// 3. Grating A precedes grating B (contiguous per-colour passes for pen swap).
{
  const art = gratingMoire.generate(P, 7, canvas);
  const firstB = art.polylines.findIndex((l) => l.stroke === P.colorB);
  const lastA = art.polylines.map((l) => l.stroke).lastIndexOf(P.colorA);
  assert(firstB > lastA, "all A lines come before all B lines");
}

// 4. All endpoints stay inside the margin rectangle (clipped to page − margin).
{
  const art = gratingMoire.generate(P, 7, canvas);
  const lo = P.marginMm - 0.01;
  const hiX = canvas.wMm - P.marginMm + 0.01;
  const hiY = canvas.hMm - P.marginMm + 0.01;
  for (const l of art.polylines) {
    for (const [x, y] of l.points) {
      assert(x >= lo && x <= hiX, `x within margin rect: ${x}`);
      assert(y >= lo && y <= hiY, `y within margin rect: ${y}`);
    }
  }
}

// 5. Determinism: same seed → identical output (generator is seed-independent
//    but must stay reproducible).
{
  const a = gratingMoire.generate(P, 42, canvas);
  const b = gratingMoire.generate(P, 42, canvas);
  assert.deepEqual(a, b, "reproducible output");
}

// 6. Pen width drives pitch: a thicker pen → wider spacing → fewer lines.
{
  const thin = gratingMoire.generate({ ...P, penWidthMm: 0.2 }, 7, canvas);
  const thick = gratingMoire.generate({ ...P, penWidthMm: 0.9 }, 7, canvas);
  assert(
    thin.polylines.length > thick.polylines.length,
    `thinner pen packs more lines (${thin.polylines.length} vs ${thick.polylines.length})`,
  );
}

// 7. The two gratings differ: with a nonzero angle offset, A and B lines are
//    not identical geometry (a real moiré, not one grating drawn twice).
{
  const art = gratingMoire.generate(P, 7, canvas);
  const a = art.polylines.find((l) => l.stroke === P.colorA)!;
  const bLines = art.polylines.filter((l) => l.stroke === P.colorB);
  const identical = bLines.some(
    (b) =>
      Math.hypot(b.points[0][0] - a.points[0][0], b.points[0][1] - a.points[0][1]) < 1e-6 &&
      Math.hypot(b.points[1][0] - a.points[1][0], b.points[1][1] - a.points[1][1]) < 1e-6,
  );
  assert(!identical, "rotated grating B is geometrically distinct from A");
}

// 8. angleOffset = 0 is still valid (parallel gratings — degenerate moiré, no crash).
{
  const art = gratingMoire.generate({ ...P, angleOffsetDeg: 0 }, 7, canvas);
  assert(art.polylines.length > 0, "zero offset produces output");
}

// 9. pitchRatio ≠ 1 (pure magnification moiré at zero angle) still produces both layers.
{
  const art = gratingMoire.generate({ ...P, angleOffsetDeg: 0, pitchRatio: 1.1 }, 7, canvas);
  const colors = new Set(art.polylines.map((l) => l.stroke));
  assert.equal(colors.size, 2, "magnification moiré keeps both pens");
}

// 10. A steep grating angle (near 90°) still fills the page (normal/projection is
//     handled for all orientations, no empty output at the axis extreme).
{
  const art = gratingMoire.generate({ ...P, angleBaseDeg: 90 }, 7, canvas);
  assert(art.polylines.length > 0, "vertical grating fills the page");
}

console.log("grating-moire: all checks passed ✓");
