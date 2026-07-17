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

// 2. Two pen colours present; every line is an open polyline of ≥2 points.
{
  const art = gratingMoire.generate(P, 7, canvas);
  const colors = new Set(art.polylines.map((l) => l.stroke));
  assert(colors.has(P.colorA), "grating A colour present");
  assert(colors.has(P.colorB), "grating B colour present");
  assert.equal(colors.size, 2, "exactly two pen colours");
  for (const l of art.polylines) {
    assert(l.points.length >= 2, "line has ≥2 points");
    assert.equal(l.closed, false, "line is open");
  }
}

// 3. Grating A precedes grating B (contiguous per-colour passes for pen swap).
{
  const art = gratingMoire.generate(P, 7, canvas);
  const firstB = art.polylines.findIndex((l) => l.stroke === P.colorB);
  const lastA = art.polylines.map((l) => l.stroke).lastIndexOf(P.colorA);
  assert(firstB > lastA, "all A lines come before all B lines");
}

// 4. All endpoints stay on the page (panels + warp are clamped to bounds).
{
  const art = gratingMoire.generate(P, 7, canvas);
  for (const l of art.polylines) {
    for (const [x, y] of l.points) {
      assert(x >= -0.01 && x <= canvas.wMm + 0.01, `x on page: ${x}`);
      assert(y >= -0.01 && y <= canvas.hMm + 0.01, `y on page: ${y}`);
    }
  }
}

// 5. Determinism: same seed → identical output.
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

// 7. Panel offset splits the two colours into different x-extents (real offset,
//    not one grating drawn twice in place).
{
  const art = gratingMoire.generate({ ...P, offsetXMm: 40, offsetYMm: 0 }, 7, canvas);
  const minX = (c: string) =>
    Math.min(...art.polylines.filter((l) => l.stroke === c).flatMap((l) => l.points.map((pt) => pt[0])));
  assert(Math.abs(minX(P.colorA) - minX(P.colorB)) > 10, "panels are horizontally offset");
}

// 8. waveAmp = 0 → straight 2-point lines; waveAmp > 0 → sampled multi-point curves.
{
  const straight = gratingMoire.generate({ ...P, waveAmpMm: 0 }, 7, canvas);
  assert(
    straight.polylines.every((l) => l.points.length === 2),
    "zero wave → straight 2-point lines",
  );
  const wavy = gratingMoire.generate({ ...P, waveAmpMm: 4 }, 7, canvas);
  assert(wavy.polylines.some((l) => l.points.length > 2), "wave → sampled curves");
}

// 9. angleOffset = 0 + pitchRatio = 1 (perfectly aligned) still valid, no crash.
{
  const art = gratingMoire.generate({ ...P, angleOffsetDeg: 0, pitchRatio: 1 }, 7, canvas);
  assert(art.polylines.length > 0, "aligned gratings produce output");
}

// 10. A steep grating angle (near 90°) still fills its panel.
{
  const art = gratingMoire.generate({ ...P, angleBaseDeg: 90 }, 7, canvas);
  assert(art.polylines.length > 0, "vertical grating fills the panel");
}

console.log("grating-moire: all checks passed ✓");
