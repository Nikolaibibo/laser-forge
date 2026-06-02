// scripts/offset-test.mjs
import { offsetPath, symmetricOffsets } from "../src/util/offset.ts";
let failed = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); failed++; } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// symmetricOffsets: 3 Spuren, Abstand 2 → [-2, 0, 2]
const so = symmetricOffsets(3, 2);
ok(near(so[0], -2) && near(so[1], 0) && near(so[2], 2), "symmetric offsets centered");

// Gerade Linie entlang +X, Offset entlang Normale (±)
const center = [[0, 0], [10, 0], [20, 0]];
const lanes = offsetPath(center, [-1, 1]);
ok(lanes.length === 2, "one polyline per offset");
ok(lanes[0].points.length === 3, "preserves vertex count");
// Normale einer +X-Linie zeigt ±Y → y-Versatz, x bleibt
ok(near(lanes[0].points[0][1], -1) || near(lanes[0].points[0][1], 1), "offset moves along normal (y)");
ok(near(lanes[0].points[0][0], 0), "offset keeps x on straight line");
ok(Math.abs(lanes[0].points[0][1] - lanes[1].points[0][1]) > 1.5, "two offsets are on opposite sides");

// 180°-Kehre (Halbkreis): innere Spur darf sich nicht selbst überschneiden
const N = 40, R = 20;
const arc = Array.from({ length: N + 1 }, (_, i) => {
  const t = Math.PI * (i / N); // 0..π
  return [Math.cos(t) * R, Math.sin(t) * R];
});
const band = offsetPath(arc, symmetricOffsets(5, 2), { minInnerRadiusMm: 1 });
let backtracks = 0;
const inner = band[0].points;
for (let i = 2; i < inner.length; i++) {
  const ax = inner[i-1][0]-inner[i-2][0], ay = inner[i-1][1]-inner[i-2][1];
  const bx = inner[i][0]-inner[i-1][0], by = inner[i][1]-inner[i-1][1];
  if (ax*bx + ay*by < 0) backtracks++; // Richtungsumkehr = Kollaps
}
ok(backtracks === 0, "inner lane does not fold back on a 180° turn");

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
