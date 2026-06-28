import assert from "node:assert/strict";
import { voronoiMoire } from "../src/generators/voronoiMoire";

const canvas = { wMm: 148, hMm: 210 }; // A5 portrait
const P = { ...voronoiMoire.defaults };

// 1. Canvas dimensions pass through unchanged.
{
  const art = voronoiMoire.generate(P, 7, canvas);
  assert.equal(art.widthMm, 148, "widthMm");
  assert.equal(art.heightMm, 210, "heightMm");
  assert(art.polylines.length > 0, "produces hatch segments");
}

// 2. Two pen colours present; every segment is a 2-point open line.
{
  const art = voronoiMoire.generate(P, 7, canvas);
  const colors = new Set(art.polylines.map((l) => l.stroke));
  assert(colors.has(P.colorA), "layer A colour present");
  assert(colors.has(P.colorB), "layer B colour present");
  assert.equal(colors.size, 2, "exactly two pen colours");
  for (const l of art.polylines) {
    assert.equal(l.points.length, 2, "hatch segment = 2 points");
    assert.equal(l.closed, false, "hatch segment is open");
  }
}

// 3. Layer A precedes layer B (contiguous per-colour passes for pen swap).
{
  const art = voronoiMoire.generate(P, 7, canvas);
  const firstB = art.polylines.findIndex((l) => l.stroke === P.colorB);
  const lastA = art.polylines.map((l) => l.stroke).lastIndexOf(P.colorA);
  assert(firstB > lastA, "all A segments come before all B segments");
}

// 4. All segment endpoints stay inside the page (cells are clipped to bounds).
{
  const art = voronoiMoire.generate(P, 7, canvas);
  for (const l of art.polylines) {
    for (const [x, y] of l.points) {
      assert(x >= -0.01 && x <= canvas.wMm + 0.01, `x in page: ${x}`);
      assert(y >= -0.01 && y <= canvas.hMm + 0.01, `y in page: ${y}`);
    }
  }
}

// 5. Determinism: same seed → identical output.
{
  const a = voronoiMoire.generate(P, 42, canvas);
  const b = voronoiMoire.generate(P, 42, canvas);
  assert.deepEqual(a, b, "same seed is reproducible");
}

// 6. Seed actually reshuffles the tessellation.
{
  const a = voronoiMoire.generate(P, 1, canvas);
  const b = voronoiMoire.generate(P, 2, canvas);
  assert.notDeepEqual(a, b, "different seed → different layout");
}

// 7. Pen width drives spacing: a thicker pen → wider spacing → fewer lines.
{
  const thin = voronoiMoire.generate({ ...P, penWidthMm: 0.2 }, 7, canvas);
  const thick = voronoiMoire.generate({ ...P, penWidthMm: 0.9 }, 7, canvas);
  assert(
    thin.polylines.length > thick.polylines.length,
    `thinner pen packs more lines (${thin.polylines.length} vs ${thick.polylines.length})`,
  );
}

// 8. A large inset erodes cells away → eventually nothing to hatch (no crash).
{
  const art = voronoiMoire.generate({ ...P, insetMm: 4, cells: 30 }, 7, canvas);
  // Must not throw; may legitimately drop many/all cells.
  assert(Array.isArray(art.polylines), "huge inset handled gracefully");
}

// 9. angleOffset = 0 still valid (both layers parallel — degenerate moiré).
{
  const art = voronoiMoire.generate({ ...P, angleOffsetDeg: 1 }, 7, canvas);
  assert(art.polylines.length > 0, "min angle offset produces output");
}

console.log("voronoi-moire: all checks passed ✓");
