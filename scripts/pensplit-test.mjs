// scripts/pensplit-test.mjs
import { splitByStroke } from "../src/plotter/penSplit.ts";
let failed = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); failed++; } };
const L = (stroke) => ({ points: [[0,0],[1,1]], closed: false, ...(stroke ? { stroke } : {}) });

const g0 = splitByStroke([L(), L(), L()]);
ok(g0.length === 1, "no stroke → single group");
ok(g0[0].stroke === "#000000", "default group is black");
ok(g0[0].polylines.length === 3, "all polylines in default group");

const g1 = splitByStroke([L("#e0584f"), L(), L("#4f86e0"), L("#e0584f")]);
ok(g1.length === 3, "three distinct pens");
ok(g1[0].stroke === "#e0584f" && g1[1].stroke === "#000000" && g1[2].stroke === "#4f86e0", "order = first appearance");
ok(g1[0].polylines.length === 2, "first color group has both its lines");

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
