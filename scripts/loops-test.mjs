// scripts/loops-test.mjs
import { serpentineCenterline } from "../src/generators/loops.ts";

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

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
