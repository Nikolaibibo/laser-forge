// scripts/pattern-maker-test.ts — layout, clip, determinism checks for Pattern Maker.
// Usage: npx tsx scripts/pattern-maker-test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { patternMaker } from "../src/generators/patternMaker";
import { parseSvgMotif } from "../src/util/svgImport";
import { useApp } from "../src/state/store";

const here = dirname(fileURLToPath(import.meta.url));
const canvas = { wMm: 148, hMm: 210 }; // A5 portrait
const P = { ...patternMaker.defaults };
const DEFAULT_MOTIF_POLYS = 3; // asterisk = 3 lines

// 1. no motif → built-in asterisk; grid emits cols*rows*defaultPolys (no clip, no stagger)
useApp.getState().setMotif(null);
{
  const art = patternMaker.generate(
    { ...P, mode: "grid", cols: 4, rows: 5, brickOffset: 0, clipToCanvas: false, tileScale: 0.5 },
    1,
    canvas,
  );
  assert.equal(art.widthMm, 148);
  assert.equal(art.heightMm, 210);
  assert.equal(art.polylines.length, 4 * 5 * DEFAULT_MOTIF_POLYS, "grid tile count");
}

// 2. motif loaded (gear fixture) → grid emits cols*rows*motifPolys
{
  const fixture = readFileSync(join(here, "fixtures/motif-gear.svg"), "utf8");
  const motif = parseSvgMotif(fixture);
  useApp.getState().setMotif({ name: "gear", ...motif });
  const n = motif.polylines.length;
  assert.ok(n > 0, "gear motif should parse to >0 polylines");
  const art = patternMaker.generate(
    { ...P, mode: "grid", cols: 3, rows: 3, brickOffset: 0, clipToCanvas: false, tileScale: 0.5 },
    1,
    canvas,
  );
  assert.equal(art.polylines.length, 3 * 3 * n, "grid tile count with loaded motif");
}

// 3. clipToCanvas with oversized tiles → every emitted point in-bounds
useApp.getState().setMotif(null);
{
  const art = patternMaker.generate(
    { ...P, mode: "grid", cols: 5, rows: 5, marginMm: 0, tileScale: 2, clipToCanvas: true },
    1,
    canvas,
  );
  for (const l of art.polylines) {
    for (const [x, y] of l.points) {
      assert.ok(x >= 0 && x <= 148 && y >= 0 && y <= 210, `point outside canvas: ${x},${y}`);
    }
  }
}

// 4. determinism: jitter 0 + colorBy none → identical Artwork across two seeds
{
  const params = { ...P, mode: "grid" as const, rotationJitter: 0, scaleJitter: 0, posJitterMm: 0, colorBy: "none" as const };
  const a = patternMaker.generate(params, 1, canvas);
  const b = patternMaker.generate(params, 99999, canvas);
  assert.deepEqual(a, b, "no-jitter output must be seed-independent");
}

// 5. jitter: posJitterMm > 0 → output differs between two seeds
{
  const params = { ...P, mode: "grid" as const, posJitterMm: 5, clipToCanvas: false };
  const a = patternMaker.generate(params, 1, canvas);
  const b = patternMaker.generate(params, 2, canvas);
  assert.notDeepEqual(a, b, "jittered output must vary with seed");
}

// 6. radial faceCenter → tile orientation differs from non-faceCenter
{
  const base = { ...P, mode: "radial" as const, rings: 2, perRing: 6, innerRadiusMm: 30, clipToCanvas: false };
  const off = patternMaker.generate({ ...base, faceCenter: false }, 1, canvas);
  const on = patternMaker.generate({ ...base, faceCenter: true }, 1, canvas);
  assert.equal(off.polylines.length, on.polylines.length, "same tile count");
  assert.notDeepEqual(off.polylines, on.polylines, "faceCenter must change orientation");
}

// 7. spiral renders within count bound and reports canvas dims
{
  const art = patternMaker.generate({ ...P, mode: "spiral", count: 50, clipToCanvas: false }, 1, canvas);
  assert.equal(art.widthMm, 148);
  assert.equal(art.heightMm, 210);
  assert.equal(art.polylines.length, 50 * DEFAULT_MOTIF_POLYS, "spiral tile count");
}

console.log("pattern-maker: all checks passed ✓");
