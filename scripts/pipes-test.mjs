// scripts/pipes-test.mjs
import { pipes } from "../src/generators/pipes.ts";
let failed = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); failed++; } };

const canvas = { wMm: 200, hMm: 200 };
const p = { ...pipes.defaults };
const a1 = pipes.generate(p, 7, canvas);
const a2 = pipes.generate(p, 7, canvas);

ok(a1.widthMm === 200 && a1.heightMm === 200, "artwork carries canvas size");
ok(a1.polylines.length > 0, "produces polylines");
ok(JSON.stringify(a1) === JSON.stringify(a2), "deterministic: same seed → identical");
ok(JSON.stringify(a1) !== JSON.stringify(pipes.generate(p, 99, canvas)), "seed changes output");
ok(a1.polylines.every((l) => l.points.length >= 2), "no degenerate polylines");

const m = p.marginMm;
ok(a1.polylines.every((l) => l.points.every(([x,y]) => x>=m-1 && x<=200-m+1 && y>=m-1 && y<=200-m+1)),
   "all points within margin");

const mono = pipes.generate({ ...p, colorFraction: 0 }, 7, canvas);
ok(mono.polylines.every((l) => l.stroke === undefined), "colorFraction 0 → all mono");

const colored = pipes.generate({ ...p, colorFraction: 1 }, 7, canvas);
ok(colored.polylines.some((l) => typeof l.stroke === "string"), "colorFraction 1 → some colored");

// classic-spezifisch: cross/arc-Tiles, mergePaths verkettet zu weniger Components
const arcsOnly = pipes.generate({ ...p, model: "classic", straightness: 0, colorFraction: 0 }, 7, canvas);
const rawUpper = 2 * Math.floor(p.cols) * Math.floor(p.rows) * p.lanes;
ok(arcsOnly.polylines.length < rawUpper, "mergePaths chained strokes into fewer components");

// --- wang model end-to-end ---
const wcanvas = { wMm: 200, hMm: 200 };
const wp = { ...pipes.defaults, model: "wang" };
const w1 = pipes.generate(wp, 7, wcanvas);
const w2 = pipes.generate(wp, 7, wcanvas);
ok(w1.polylines.length > 0, "wang: produces polylines");
ok(JSON.stringify(w1) === JSON.stringify(w2), "wang: deterministic same seed");
const wm = wp.marginMm;
ok(w1.polylines.every((l) => l.points.every(([x, y]) =>
   x >= wm - 1 && x <= 200 - wm + 1 && y >= wm - 1 && y <= 200 - wm + 1)),
   "wang: all points within margin");
ok(pipes.generate({ ...wp, colorFraction: 0 }, 7, wcanvas).polylines.every((l) => l.stroke === undefined),
   "wang: colorFraction 0 → all mono");
ok(pipes.generate({ ...wp, colorFraction: 1 }, 7, wcanvas).polylines.some((l) => typeof l.stroke === "string"),
   "wang: colorFraction 1 → some colored");

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
