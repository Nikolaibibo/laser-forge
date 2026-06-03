// scripts/loops-test.mjs
import { serpentineCenterline, rotateTranslate, loops } from "../src/generators/loops.ts";

let failed = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); failed++; } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// runs=2 capsule: L=100, rs=10, r=5, capSamples=8
const cap = serpentineCenterline(2, 100, 10, 8);
ok(near(cap[0][0], 0) && near(cap[0][1], 0), "starts at (0,0)");
ok(cap.some(([x, y]) => near(x, 100) && near(y, 0)), "run 0 reaches (L,0)");
ok(near(cap[cap.length - 1][0], 0) && near(cap[cap.length - 1][1], 10), "ends at (0, rs) for runs=2");
// right cap bulges to x ≈ L + r = 105
ok(cap.some(([x]) => near(x, 105, 0.5)), "right cap bulges to ~L+r");

// runs=4: 4 runs + 3 caps; run i sits at height i*rs
const s = serpentineCenterline(4, 80, 12, 6);
for (const h of [0, 12, 24, 36]) {
  ok(s.some(([, y]) => near(y, h, 1e-6)), `has a point at run height y=${h}`);
}
// left cap bulges to x ≈ -r = -6 (rs=12)
ok(s.some(([x]) => near(x, -6, 0.5)), "left cap bulges to ~-r");
// continuity: consecutive points never jump more than ~ runLength + a bit (no teleport)
let maxJump = 0;
for (let i = 1; i < s.length; i++) {
  const dx = s[i][0] - s[i - 1][0], dy = s[i][1] - s[i - 1][1];
  maxJump = Math.max(maxJump, Math.hypot(dx, dy));
}
ok(maxJump <= 80 + 1, "C0 continuous: no gap larger than a run length");

// pure / deterministic
ok(JSON.stringify(serpentineCenterline(3, 50, 8, 6)) === JSON.stringify(serpentineCenterline(3, 50, 8, 6)),
   "deterministic (pure geometry)");

// 90° CCW about origin, no translate: (1,0) → (0,1)
const r90 = rotateTranslate([[1, 0]], Math.PI / 2, 0, 0, 0, 0);
ok(near(r90[0][0], 0) && near(r90[0][1], 1), "rotate 90° about origin: (1,0)->(0,1)");

// rotation about pivot (5,5) leaves the pivot fixed; +translate moves it
const piv = rotateTranslate([[5, 5]], 1.234, 5, 5, 3, -2);
ok(near(piv[0][0], 8) && near(piv[0][1], 3), "pivot point maps to pivot + translation");

// length preserved between two points under rotation
const a = rotateTranslate([[0, 0], [3, 4]], 0.7, 0, 0, 10, 20);
ok(near(Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]), 5), "distance preserved (3-4-5)");

const canvas = { wMm: 200, hMm: 280 };
const p = { ...loops.defaults };
const a1 = loops.generate(p, 7, canvas);
const a2 = loops.generate(p, 7, canvas);
ok(a1.widthMm === 200 && a1.heightMm === 280, "carries canvas size");
ok(a1.polylines.length > 0, "produces polylines");
ok(JSON.stringify(a1) === JSON.stringify(a2), "deterministic: same seed → identical");
ok(JSON.stringify(a1) !== JSON.stringify(loops.generate(p, 99, canvas)), "seed changes output");
ok(a1.polylines.every((l) => l.points.length >= 2 && l.closed === false), "all plottable open polylines");

// color: numColors=2 → exactly 2 distinct strokes (12 shapes > 2)
const strokes = new Set(a1.polylines.map((l) => l.stroke));
ok(strokes.size === 2 && [...strokes].every((s) => typeof s === "string"),
   "numColors=2 → 2 distinct palette strokes");

// in-bounds after fitToCanvas
const m = p.marginMm;
ok(a1.polylines.every((l) => l.points.every(([x, y]) =>
   x >= m - 1 && x <= 200 - m + 1 && y >= m - 1 && y <= 280 - m + 1)),
   "all points within margin");

// numColors=1 → 1 distinct stroke
const oneColor = loops.generate({ ...p, numColors: 1 }, 7, canvas);
ok(new Set(oneColor.polylines.map((l) => l.stroke)).size === 1, "numColors=1 → 1 stroke");

// even coverage: with a 3x4 grid, points appear in all four canvas quadrants
const allPts = a1.polylines.flatMap((l) => l.points);
const midX = 100, midY = 140;
const quad = { tl: false, tr: false, bl: false, br: false };
for (const [x, y] of allPts) {
  if (x < midX && y < midY) quad.tl = true;
  else if (x >= midX && y < midY) quad.tr = true;
  else if (x < midX && y >= midY) quad.bl = true;
  else quad.br = true;
}
ok(quad.tl && quad.tr && quad.bl && quad.br, "grid placement covers all four quadrants");

// grid size drives shape count: 1x1 grid → 1 shape → 1 stroke regardless of numColors
const single = loops.generate({ ...p, gridCols: 1, gridRows: 1 }, 7, canvas);
ok(new Set(single.polylines.map((l) => l.stroke)).size === 1, "1x1 grid → single shape → 1 stroke");

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
