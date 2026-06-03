// scripts/pipes-wang-test.mjs
import { chooseTile } from "../src/generators/pipes.ts";

let failed = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); failed++; } };

// Welche Kanten sind laut Ergebnis offen?
const openSet = (n, w, r) => {
  const s = new Set();
  if (n) s.add("N"); if (w) s.add("W"); if (r.e) s.add("E"); if (r.s) s.add("S");
  return s;
};
const PAIR_EDGES = { NS:["N","S"], WE:["W","E"], NE:["N","E"], NW:["N","W"], SE:["S","E"], SW:["S","W"] };

// Beide rng-Branches abdecken: low (<) und high (>=)
const rngLow = () => 0;
const rngHigh = () => 0.999;

for (const n of [0, 1]) for (const w of [0, 1]) for (const rng of [rngLow, rngHigh]) {
  const r = chooseTile(n, w, rng, 0.5, 0.5);
  const deg = n + w + r.e + r.s;
  ok(deg === 0 || deg === 2, `degree ${deg} not in {0,2} for n=${n} w=${w}`);
  if (r.pair === null) {
    ok(deg === 0, `null pair must be degree 0 (n=${n} w=${w})`);
  } else {
    const edges = openSet(n, w, r);
    const expect = new Set(PAIR_EDGES[r.pair]);
    ok(edges.size === 2 && [...expect].every((x) => edges.has(x)),
       `pair ${r.pair} must match open edges {${[...edges]}} (n=${n} w=${w})`);
  }
}

// inDeg==2 ist erzwungen Elbow NW, unabhängig von rng
ok(chooseTile(1, 1, rngLow, 0.5, 0.5).pair === "NW", "n&w → forced NW");
ok(chooseTile(1, 1, rngHigh, 0.5, 0.5).pair === "NW", "n&w → forced NW (high)");

// straightness=1 → inDeg==1 wählt immer Gerade
ok(chooseTile(1, 0, rngHigh, 1, 0).pair === "NS", "n only, straightness 1 → NS straight");
ok(chooseTile(0, 1, rngHigh, 1, 0).pair === "WE", "w only, straightness 1 → WE straight");
// straightness=0 → inDeg==1 wählt immer Turn
ok(chooseTile(1, 0, rngHigh, 0, 0).pair === "NE", "n only, straightness 0 → NE turn");
ok(chooseTile(0, 1, rngHigh, 0, 0).pair === "SW", "w only, straightness 0 → SW turn");
// density: inDeg==0
ok(chooseTile(0, 0, rngLow, 0.5, 1).pair === "SE", "empty in, density 1 → SE birth");
ok(chooseTile(0, 0, rngLow, 0.5, 0).pair === null, "empty in, density 0 → empty");

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
