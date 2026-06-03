# Loops — Serpentinen-Ribbons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein neuer `loops`-Generator: wenige große, überlappende Serpentinen-Ribbons (parallele Läufe + 180°-Kappen) als dichte Parallel-Bänder, mit 2–3 Stiftfarben für Overprint.

**Architecture:** Zwei neue pure Geometrie-Funktionen — `serpentineCenterline` (Boustrophedon-Centerline) und `rotateTranslate` (Rotation um Pivot + Translation) — plus ein `loops` GeneratorDef, das M Centerlines streut, jede via bestehendem `offsetPath` zu einem Band offsettet, pro Shape eine Palette-Farbe setzt und mit `fitToCanvas` einpasst. Kein Tiling/Sweep/Tracing. Farb-/Plot-Infra (`Polyline.stroke`, `splitByStroke`, „Plot by color") existiert bereits.

**Tech Stack:** TypeScript, Vite/React. RNG: `makeRng`/`randInt`/`randRange` (alea). Reuse: `offsetPath`, `symmetricOffsets` (`src/util/offset.ts`), `fitToCanvas` (`src/util/path.ts`). Tests: tsx-Scripts unter `scripts/`, `ok()`-Helper, kein Framework. Referenz-Spec: `docs/superpowers/specs/2026-06-03-loops-serpentine-design.md`.

---

## File Structure

- **Create** `src/generators/loops.ts` — `loops` GeneratorDef + `serpentineCenterline` + `rotateTranslate` + `boundsCenter` (local) + PALETTE. All geometry helpers exported for tests.
- **Modify** `src/generators/registry.ts` — import `loops`, add to `GENERATORS`.
- **Create** `scripts/loops-test.mjs` — tsx tests.

---

## Task 1: `serpentineCenterline` — Boustrophedon-Centerline (pure)

**Files:**
- Create: `src/generators/loops.ts`
- Test: `scripts/loops-test.mjs` (create)

- [ ] **Step 1: Write the failing test**

Create `scripts/loops-test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/loops-test.mjs`
Expected: FAIL — cannot import `serpentineCenterline` (module/file does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `src/generators/loops.ts` with imports + the function:

```ts
// src/generators/loops.ts
import type { GeneratorDef, Point, Polyline } from "./types";
import { makeRng, randInt, randRange } from "../util/random";
import { fitToCanvas } from "../util/path";
import { offsetPath, symmetricOffsets } from "../util/offset";

/**
 * Boustrophedon centerline: `runs` parallel straight runs of length `runLengthMm`,
 * stacked in +y at pitch `runSpacingMm`, joined by 180° caps (radius runSpacingMm/2)
 * on alternating sides. First run goes +x along y=0. runs=2 ⇒ capsule/racetrack.
 * Pure geometry (no RNG). One continuous open point list.
 */
export function serpentineCenterline(
  runs: number, runLengthMm: number, runSpacingMm: number, capSamples: number,
): Point[] {
  const L = runLengthMm;
  const rs = runSpacingMm;
  const r = rs / 2;
  const pts: Point[] = [];
  for (let i = 0; i < runs; i++) {
    const y = i * rs;
    const even = i % 2 === 0;
    const startX = even ? 0 : L;
    const endX = even ? L : 0;
    if (i === 0) pts.push([startX, y]);
    pts.push([endX, y]);
    if (i < runs - 1) {
      const cx = endX;            // right side (x=L) after even runs, left (x=0) after odd
      const cy = y + r;
      const a0 = -Math.PI / 2;
      const a1 = even ? Math.PI / 2 : (-3 * Math.PI) / 2; // even bulges +x, odd bulges -x
      for (let k = 1; k <= capSamples; k++) {
        const t = a0 + ((a1 - a0) * k) / capSamples;
        pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
      }
    }
  }
  return pts;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/loops-test.mjs`
Expected: `ALL PASS`

- [ ] **Step 5: Commit**

```bash
git add src/generators/loops.ts scripts/loops-test.mjs
git commit -m "feat(loops): serpentineCenterline boustrophedon path (runs + 180° caps)"
```

---

## Task 2: `rotateTranslate` — Rotation um Pivot + Translation (pure)

**Files:**
- Modify: `src/generators/loops.ts`
- Test: `scripts/loops-test.mjs` (append)

- [ ] **Step 1: Write the failing test**

Append to `scripts/loops-test.mjs` before the final `console.log(...)`:

```js
import { rotateTranslate } from "../src/generators/loops.ts";

// 90° CCW about origin, no translate: (1,0) → (0,1)
const r90 = rotateTranslate([[1, 0]], Math.PI / 2, 0, 0, 0, 0);
ok(near(r90[0][0], 0) && near(r90[0][1], 1), "rotate 90° about origin: (1,0)->(0,1)");

// rotation about pivot (5,5) leaves the pivot fixed; +translate moves it
const piv = rotateTranslate([[5, 5]], 1.234, 5, 5, 3, -2);
ok(near(piv[0][0], 8) && near(piv[0][1], 3), "pivot point maps to pivot + translation");

// length preserved between two points under rotation
const a = rotateTranslate([[0, 0], [3, 4]], 0.7, 0, 0, 10, 20);
ok(near(Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]), 5), "distance preserved (3-4-5)");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/loops-test.mjs`
Expected: FAIL — `rotateTranslate` not defined.

- [ ] **Step 3: Write minimal implementation**

In `src/generators/loops.ts`, add after `serpentineCenterline`:

```ts
/** Rotate points around pivot (cx,cy) by angleRad, then translate by (tx,ty). Pure. */
export function rotateTranslate(
  pts: Point[], angleRad: number, cx: number, cy: number, tx: number, ty: number,
): Point[] {
  const c = Math.cos(angleRad), s = Math.sin(angleRad);
  return pts.map(([x, y]): Point => {
    const dx = x - cx, dy = y - cy;
    return [cx + dx * c - dy * s + tx, cy + dx * s + dy * c + ty];
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/loops-test.mjs`
Expected: `ALL PASS`

- [ ] **Step 5: Commit**

```bash
git add src/generators/loops.ts scripts/loops-test.mjs
git commit -m "feat(loops): rotateTranslate (rotate about pivot + translate)"
```

---

## Task 3: `loops` GeneratorDef + Scatter + Registrierung

**Files:**
- Modify: `src/generators/loops.ts`
- Modify: `src/generators/registry.ts`
- Test: `scripts/loops-test.mjs` (append)

- [ ] **Step 1: Write the failing test**

Append to `scripts/loops-test.mjs` before the final `console.log(...)`:

```js
import { loops } from "../src/generators/loops.ts";

const canvas = { wMm: 200, hMm: 280 };
const p = { ...loops.defaults };
const a1 = loops.generate(p, 7, canvas);
const a2 = loops.generate(p, 7, canvas);
ok(a1.widthMm === 200 && a1.heightMm === 280, "carries canvas size");
ok(a1.polylines.length > 0, "produces polylines");
ok(JSON.stringify(a1) === JSON.stringify(a2), "deterministic: same seed → identical");
ok(JSON.stringify(a1) !== JSON.stringify(loops.generate(p, 99, canvas)), "seed changes output");
ok(a1.polylines.every((l) => l.points.length >= 2 && l.closed === false), "all plottable open polylines");

// color: numColors=2 → exactly 2 distinct strokes (shapes=6 > 2)
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/loops-test.mjs`
Expected: FAIL — `loops` not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/generators/loops.ts`, add the local helper, PALETTE, params, and the GeneratorDef:

```ts
const PALETTE = ["#4f86e0", "#e0584f", "#5fcaa8"];

/** Center of the bounding box of a point list. */
function boundsCenter(pts: Point[]): [number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

type Params = {
  shapes: number;
  runsMin: number;
  runsMax: number;
  runLenMinMm: number;
  runLenMaxMm: number;
  runSpacingMm: number;
  lanes: number;
  laneSpacingMm: number;
  numColors: number;
  capSamples: number;
  marginMm: number;
};

const DEFAULTS: Params = {
  shapes: 6, runsMin: 2, runsMax: 5, runLenMinMm: 40, runLenMaxMm: 110,
  runSpacingMm: 9, lanes: 14, laneSpacingMm: 0.5, numColors: 2, capSamples: 16, marginMm: 15,
};

export const loops: GeneratorDef<Params> = {
  id: "loops",
  name: "Loops",
  description:
    "Scattered overlapping serpentine ribbons (parallel runs + 180° caps) rendered as dense parallel bands; numColors pens overprint where shapes overlap (1+1=3). Reseed reshuffles placement.",
  defaults: DEFAULTS,
  schema: {
    shapes: { value: DEFAULTS.shapes, min: 1, max: 24, step: 1 },
    runsMin: { value: DEFAULTS.runsMin, min: 2, max: 12, step: 1 },
    runsMax: { value: DEFAULTS.runsMax, min: 2, max: 12, step: 1 },
    runLenMinMm: { value: DEFAULTS.runLenMinMm, min: 10, max: 250, step: 1 },
    runLenMaxMm: { value: DEFAULTS.runLenMaxMm, min: 10, max: 250, step: 1 },
    runSpacingMm: { value: DEFAULTS.runSpacingMm, min: 2, max: 30, step: 0.5 },
    lanes: { value: DEFAULTS.lanes, min: 2, max: 30, step: 1 },
    laneSpacingMm: { value: DEFAULTS.laneSpacingMm, min: 0.2, max: 3, step: 0.1 },
    numColors: { value: DEFAULTS.numColors, min: 1, max: 3, step: 1 },
    capSamples: { value: DEFAULTS.capSamples, min: 4, max: 32, step: 1 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
  },
  generate: (p, seed, canvas) => {
    const rng = makeRng(seed);
    const offsets = symmetricOffsets(p.lanes, p.laneSpacingMm);
    const runsLo = Math.min(p.runsMin, p.runsMax);
    const runsHi = Math.max(p.runsMin, p.runsMax);
    const lenLo = Math.min(p.runLenMinMm, p.runLenMaxMm);
    const lenHi = Math.max(p.runLenMinMm, p.runLenMaxMm);
    const numColors = Math.max(1, Math.min(PALETTE.length, Math.floor(p.numColors)));
    const all: Polyline[] = [];
    for (let i = 0; i < p.shapes; i++) {
      const runs = randInt(rng, runsLo, runsHi);
      const len = randRange(rng, lenLo, lenHi);
      const angle = randRange(rng, 0, Math.PI);
      const tx = randRange(rng, 0, canvas.wMm);
      const ty = randRange(rng, 0, canvas.hMm);
      const center = serpentineCenterline(runs, len, p.runSpacingMm, p.capSamples);
      const [cx, cy] = boundsCenter(center);
      const placed = rotateTranslate(center, angle, cx, cy, tx, ty);
      const stroke = PALETTE[i % numColors];
      for (const lane of offsetPath(placed, offsets, { minInnerRadiusMm: p.laneSpacingMm })) {
        all.push({ ...lane, stroke });
      }
    }
    const fitted = fitToCanvas(all, canvas.wMm, canvas.hMm, p.marginMm);
    return { polylines: fitted, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
```

Note: `randInt(rng, lo, hi)` must be inclusive of both ends per the existing `random.ts` helper — the engineer should confirm by reading `src/util/random.ts` (it is `Math.floor(randRange(rng, min, max + 1))`). The `runsLo/runsHi` and `lenLo/lenHi` min/max guards make the params robust to a user setting min > max in leva.

- [ ] **Step 2b: Register the generator**

In `src/generators/registry.ts`: add the import after the `pipes` import:
```ts
import { loops } from "./loops";
```
and add `loops` to the `GENERATORS` array (after `pipes`):
```ts
  pipes,
  loops,
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/loops-test.mjs`
Expected: `ALL PASS`

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/generators/loops.ts src/generators/registry.ts scripts/loops-test.mjs
git commit -m "feat(loops): generator — scatter serpentines into offset bands + register"
```

---

## Task 4: Volle Verifikation (Regression + Build) + visueller Render

**Files:** (keine Code-Änderung außer evtl. Fixes)

- [ ] **Step 1: Test- + Regressions-Suite**

Run:
```bash
npx tsx scripts/loops-test.mjs && \
npx tsx scripts/smoke.mjs && \
npx tsx scripts/offset-test.mjs && \
npx tsx scripts/pipes-test.mjs
```
Expected: `loops-test` → `ALL PASS`; `smoke.mjs` listet jetzt `loops` mit auf und endet `… 0 fail`; übrige `ALL PASS` / `0 failed`.

- [ ] **Step 2: Typecheck + Build**

Run: `npm run typecheck && npm run build`
Expected: kein Fehler, `✓ built`.

- [ ] **Step 3: Visueller Render (manuell, vom Menschen)**

Run: `npm run dev` → Browser → Generator `Loops`.
Prüfen: große überlappende Serpentinen, dichte konzentrische Bänder, saubere 180°-Kappen, 2 Farben mit Overprint in den Überlappungen. `shapes`/`runsMax`/`runLen*`/`runSpacingMm`/`numColors` über leva an Bild #1 kalibrieren. Menschlicher Verifikations-Schritt; kein automatischer Pass/Fail.

- [ ] **Step 4: Final commit (falls Fixes/Default-Tuning nötig)**

```bash
git add -A && git commit -m "chore(loops): verify + calibrate defaults"
```
(Wenn keine Änderung nötig: skip.)

---

## Self-Review

**Spec coverage:**
- `serpentineCenterline` (runs + 180° caps, capsule=runs2) → Task 1 ✓
- `rotateTranslate` → Task 2 ✓
- Scatter loop (random center/angle/runs/len, offsetPath band, color per shape, fitToCanvas) → Task 3 ✓
- Params (shapes, runsMin/Max, runLenMin/Max, runSpacingMm, lanes, laneSpacingMm, numColors, capSamples, marginMm) → Task 3 ✓
- PALETTE `["#4f86e0","#e0584f","#5fcaa8"]`, numColors cycling → Task 3 ✓
- Registry registration → Task 3 Step 2b ✓
- Tests: determinism, color count, in-bounds, plottable, serpentine geometry, rotate → Tasks 1–3 ✓
- Regression (smoke incl. loops) + build → Task 4 ✓
- minInnerRadiusMm clamp for tight caps → Task 3 `offsetPath(..., { minInnerRadiusMm: p.laneSpacingMm })` ✓
- No collision avoidance / reuse color infra / no new deps → honored (YAGNI) ✓

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `serpentineCenterline`/`rotateTranslate`/`boundsCenter`/`loops`/`Params` signatures consistent across tasks; `Point`/`Polyline`/`GeneratorDef` from types.ts; `makeRng`/`randInt`/`randRange` from random.ts; `offsetPath`/`symmetricOffsets` from offset.ts; `fitToCanvas` from path.ts. `numColors`/`shapes`/`runSpacingMm` etc. identical in Params, DEFAULTS, schema, generate.
