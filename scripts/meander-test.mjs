// scripts/meander-test.mjs
import { meander } from "../src/generators/meander.ts";
let failed = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); failed++; } };

const canvas = { wMm: 200, hMm: 200 };
const p = { ...meander.defaults };
const a1 = meander.generate(p, 1234, canvas);
const a2 = meander.generate(p, 1234, canvas);

ok(a1.widthMm === 200 && a1.heightMm === 200, "artwork carries canvas size");
ok(a1.polylines.length > 0, "produces polylines");
ok(JSON.stringify(a1) === JSON.stringify(a2), "deterministic: same seed → identical artwork");

const a3 = meander.generate(p, 9999, canvas);
ok(JSON.stringify(a1) !== JSON.stringify(a3), "different seed → different artwork");

ok(a1.polylines.every((l) => l.points.length >= 2), "no degenerate polylines");

const m = p.marginMm;
const inBounds = a1.polylines.every((l) => l.points.every(([x, y]) =>
  x >= m - 1 && x <= 200 - m + 1 && y >= m - 1 && y <= 200 - m + 1));
ok(inBounds, "all points within canvas margin");

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
