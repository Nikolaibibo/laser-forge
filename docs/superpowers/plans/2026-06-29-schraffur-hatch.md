# Schraffur (Hatch Fill) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `hatch` distortion that fills closed shapes with boustrophedon-linked parallel hatch lines (1–3 cross-hatch layers) so the plotter can render shaded/solid areas.

**Architecture:** A pure geometry core in `src/util/hatch.ts` (horizontal scanline → even-odd spans → boustrophedon-linked polylines, with a rotation wrapper for arbitrary angle + a simple inset), wrapped by a thin `DistortionDef` in `src/distortions/hatch.ts` — exactly mirroring `mergePaths` + `pathJoin`. The existing private `hatch()` in `voronoiMoire.ts` is left untouched.

**Tech Stack:** TypeScript, Vite, React (UI auto-generates from the distortion schema). Tests are standalone `tsx` scripts in `scripts/` run with `npx tsx`, using `node:assert/strict`.

## Global Constraints

- **Types come from `src/generators/types.ts`:** `Point = [number, number]`, `Polyline = { points: Point[]; closed: boolean; stroke?: string }`, `Artwork = { polylines: Polyline[]; widthMm: number; heightMm: number }`, `DistortionDef<P>` has `{ id, name, description, defaults: P, schema, apply: (artwork, params, seed) => Artwork }`.
- **Distortion contract:** open/degenerate polylines pass through unchanged (same as `pathJoin`).
- **Single-contour even-odd only** — no cross-contour hole subtraction in v1.
- **No new dependencies.** Pure TS + existing stdlib.
- **Fill polylines are open** (`closed: false`) and **inherit the source shape's `stroke`**.
- **Test runner:** `npx tsx scripts/<name>.ts`. New distortion must also survive `npx tsx scripts/smoke.mjs` (auto-applies every registered distortion to a base `rose`).
- **Coordinates are millimetres** throughout.

---

### Task 1: Scanline spans (horizontal even-odd)

**Files:**
- Create: `src/util/hatch.ts`
- Test: `scripts/hatch-test.ts`

**Interfaces:**
- Consumes: `Point` from `src/generators/types.ts`.
- Produces: `export type ScanRow = { y: number; spans: [number, number][] }` and `export function scanlineSpans(poly: Point[], spacingMm: number): ScanRow[]` — horizontal scanlines across a single contour using the even-odd rule. The hatch direction is assumed to be the x-axis (rotation is a later task's job). Rows are spaced `spacingMm` in y, starting half a step inside the y-extent. Each row's `spans` are inside intervals `[xEnter, xExit]` sorted by x. `< 3` points or `spacingMm <= 0` → `[]`.

- [ ] **Step 1: Write the failing test**

Create `scripts/hatch-test.ts`:

```ts
// scripts/hatch-test.ts — unit tests for src/util/hatch.ts
// Run: npx tsx scripts/hatch-test.ts
import assert from "node:assert/strict";
import { scanlineSpans } from "../src/util/hatch";
import type { Point } from "../src/generators/types";

const square: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
// "U" opening upward: solid below y=3, two arms above.
const uShape: Point[] = [
  [0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10],
];

// --- scanlineSpans -------------------------------------------------
{
  const rows = scanlineSpans(square, 2); // rows at y = 1,3,5,7,9
  assert.equal(rows.length, 5, "square/spacing2 → 5 rows");
  for (const r of rows) {
    assert.equal(r.spans.length, 1, "convex → 1 span per row");
    assert.deepEqual(r.spans[0], [0, 10], "span spans full width");
  }
}
{
  const rows = scanlineSpans(uShape, 2); // rows at y = 1,3,5,7,9
  const low = rows.find((r) => r.y === 1)!;
  assert.equal(low.spans.length, 1, "below opening → 1 span");
  assert.deepEqual(low.spans[0], [0, 10], "solid base full width");
  const mid = rows.find((r) => r.y === 5)!;
  assert.equal(mid.spans.length, 2, "in the opening → 2 spans");
  assert.deepEqual(mid.spans, [[0, 3], [7, 10]], "two arms");
}
assert.equal(scanlineSpans(square, 0).length, 0, "spacing 0 → no rows");
assert.equal(scanlineSpans([[0, 0], [1, 1]], 1).length, 0, "< 3 pts → no rows");

console.log("hatch scanlineSpans: all checks passed ✓");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/hatch-test.ts`
Expected: FAIL — `Cannot find module '../src/util/hatch'` (file not created yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/util/hatch.ts`:

```ts
// src/util/hatch.ts — fill a single closed contour with hatch lines.
// scanlineSpans: horizontal even-odd scanlines (hatch direction = x-axis).
// linkBoustrophedon + hatchPolygon are added by later tasks.
import type { Point, Polyline } from "../generators/types";

export type ScanRow = { y: number; spans: [number, number][] };

/** Horizontal scanlines across one contour using the even-odd rule.
 *  `poly` must already be rotated so the hatch direction is the x-axis.
 *  Rows are spaced `spacingMm` in y, started half a step inside the extent so
 *  we never scan exactly along a horizontal edge. Returns inside intervals. */
export function scanlineSpans(poly: Point[], spacingMm: number): ScanRow[] {
  if (poly.length < 3 || !(spacingMm > 0)) return [];
  let miny = Infinity, maxy = -Infinity;
  for (const [, y] of poly) { if (y < miny) miny = y; if (y > maxy) maxy = y; }
  const M = poly.length;
  const rows: ScanRow[] = [];
  for (let y = miny + spacingMm / 2; y < maxy; y += spacingMm) {
    const xs: number[] = [];
    for (let i = 0; i < M; i++) {
      const [x0, y0] = poly[i];
      const [x1, y1] = poly[(i + 1) % M];
      // Half-open crossing test: counts each crossing once, skips horizontals.
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        const t = (y - y0) / (y1 - y0);
        xs.push(x0 + (x1 - x0) * t);
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    const spans: [number, number][] = [];
    for (let k = 0; k + 1 < xs.length; k += 2) spans.push([xs[k], xs[k + 1]]);
    rows.push({ y, spans });
  }
  return rows;
}
```

> Note: the unused `Polyline` import is consumed by Task 2/3. If your linter blocks unused imports mid-task, add it in Task 2 instead; the repo's `tsc` build only runs at `npm run build`, not in the test scripts.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/hatch-test.ts`
Expected: PASS — `hatch scanlineSpans: all checks passed ✓`

- [ ] **Step 5: Commit**

```bash
git add src/util/hatch.ts scripts/hatch-test.ts
git commit -m "feat(hatch): scanline even-odd spans for a single contour"
```

---

### Task 2: Boustrophedon linking

**Files:**
- Modify: `src/util/hatch.ts`
- Test: `scripts/hatch-test.ts` (append)

**Interfaces:**
- Consumes: `ScanRow` from Task 1.
- Produces: `export function linkBoustrophedon(rows: ScanRow[]): Point[][]` — links spans across consecutive rows into continuous zigzag point-runs (in the same frame as the rows). Rule: a new span that overlaps in x with **exactly one** still-open chain from the previous row extends that chain (entering at the end nearer the chain's last point, exiting at the far end → snake); 0 overlaps starts a new chain; >1 overlaps (a merge) starts a fresh chain and closes the overlapped ones. Chains not continued by any span in a row are finished. Runs with `< 2` points are dropped.

- [ ] **Step 1: Write the failing test**

Append to `scripts/hatch-test.ts` (before the final `console.log`), and add `linkBoustrophedon` to the import at the top:

```ts
// at top: import { scanlineSpans, linkBoustrophedon } from "../src/util/hatch";

// --- linkBoustrophedon ---------------------------------------------
{
  const rows = scanlineSpans(square, 2);
  const runs = linkBoustrophedon(rows);
  assert.equal(runs.length, 1, "convex → one continuous run");
  assert.equal(runs[0].length, 10, "5 rows × 2 points = 10 points");
  // Boustrophedon: consecutive segment direction alternates.
  assert.equal(runs[0][0][0], 0, "starts at x=0");
  assert.equal(runs[0][1][0], 10, "first line L→R");
  assert.equal(runs[0][2][0], 10, "drops down on the right");
  assert.equal(runs[0][3][0], 0, "second line R→L (snake)");
}
{
  const runs = linkBoustrophedon(scanlineSpans(uShape, 2));
  assert.equal(runs.length, 2, "U splits into two arm-runs");
  for (const r of runs) assert.ok(r.length >= 2, "each run is drawable");
}
assert.equal(linkBoustrophedon([]).length, 0, "no rows → no runs");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/hatch-test.ts`
Expected: FAIL — `linkBoustrophedon is not a function` / not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/util/hatch.ts`:

```ts
/** Link span rows into continuous boustrophedon (zigzag) point-runs.
 *  Same coordinate frame as `rows`. See header comment for the matching rule. */
export function linkBoustrophedon(rows: ScanRow[]): Point[][] {
  type Chain = { pts: Point[]; lo: number; hi: number };
  const overlaps = (a0: number, a1: number, b0: number, b1: number) =>
    Math.min(a1, b1) >= Math.max(a0, b0);

  let active: Chain[] = [];
  const done: Point[][] = [];

  for (const { y, spans } of rows) {
    const next: Chain[] = [];
    const used = new Set<number>();
    for (const [x0, x1] of spans) {
      const matches: number[] = [];
      active.forEach((c, i) => {
        if (!used.has(i) && overlaps(c.lo, c.hi, x0, x1)) matches.push(i);
      });
      if (matches.length === 1) {
        const c = active[matches[0]];
        used.add(matches[0]);
        const last = c.pts[c.pts.length - 1];
        // Enter at the end nearer the chain's last point, exit at the far end.
        if (Math.abs(last[0] - x0) <= Math.abs(last[0] - x1)) c.pts.push([x0, y], [x1, y]);
        else c.pts.push([x1, y], [x0, y]);
        c.lo = x0; c.hi = x1;
        next.push(c);
      } else {
        // 0 matches (new region) or >1 (merge) → start a fresh chain.
        next.push({ pts: [[x0, y], [x1, y]], lo: x0, hi: x1 });
      }
    }
    // Any previously-active chain not continued this row is finished.
    active.forEach((c, i) => { if (!used.has(i) && !next.includes(c)) done.push(c.pts); });
    active = next;
  }
  for (const c of active) done.push(c.pts);
  return done.filter((p) => p.length >= 2);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/hatch-test.ts`
Expected: PASS — `hatch scanlineSpans: all checks passed ✓` (final line still prints).

- [ ] **Step 5: Commit**

```bash
git add src/util/hatch.ts scripts/hatch-test.ts
git commit -m "feat(hatch): boustrophedon-link span rows into zigzag runs"
```

---

### Task 3: `hatchPolygon` — rotation wrapper + inset

**Files:**
- Modify: `src/util/hatch.ts`
- Test: `scripts/hatch-test.ts` (append)

**Interfaces:**
- Consumes: `scanlineSpans`, `linkBoustrophedon` from Tasks 1–2; `Point`, `Polyline`.
- Produces: `export function hatchPolygon(poly: Point[], angleDeg: number, spacingMm: number, opts?: { insetMm?: number }): Polyline[]` — rotates the contour about its centroid so `angleDeg` becomes horizontal, scans, links, optionally insets (drops rows within `insetMm` of the y-extent and trims each span by `insetMm` at both ends), then rotates the runs back. Returns open polylines (`closed: false`). `< 3` points or `spacingMm <= 0` → `[]`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/hatch-test.ts` (add `hatchPolygon` to the import):

```ts
// at top: import { scanlineSpans, linkBoustrophedon, hatchPolygon } from "../src/util/hatch";

// --- hatchPolygon --------------------------------------------------
const within = (p: Point, lo: number, hi: number) =>
  p[0] >= lo - 1e-6 && p[0] <= hi + 1e-6 && p[1] >= lo - 1e-6 && p[1] <= hi + 1e-6;

{
  const fills = hatchPolygon(square, 0, 2); // horizontal lines
  assert.ok(fills.length >= 1, "produces fill");
  assert.equal(fills[0].closed, false, "fill is open");
  for (const f of fills) for (const p of f.points) assert.ok(within(p, 0, 10), "stays in bbox");
  // angle 0 → first drawn segment is horizontal (equal y).
  assert.ok(Math.abs(fills[0].points[0][1] - fills[0].points[1][1]) < 1e-6, "horizontal at angle 0");
}
{
  const fills = hatchPolygon(square, 90, 2); // vertical lines
  assert.ok(fills.length >= 1, "angle 90 produces fill");
  for (const f of fills) for (const p of f.points) assert.ok(within(p, 0, 10), "stays in bbox");
  // angle 90 → first drawn segment is vertical (equal x).
  assert.ok(Math.abs(fills[0].points[0][0] - fills[0].points[1][0]) < 1e-6, "vertical at angle 90");
}
{
  const plain = hatchPolygon(square, 0, 2);
  const inset = hatchPolygon(square, 0, 2, { insetMm: 2 });
  const maxX = (fs: typeof inset) => Math.max(...fs.flatMap((f) => f.points.map((p) => p[0])));
  assert.ok(maxX(inset) < maxX(plain), "inset pulls fill in from the edge");
}
assert.equal(hatchPolygon(square, 0, 0).length, 0, "spacing 0 → no fill");
assert.equal(hatchPolygon([[0, 0], [1, 1]], 0, 1).length, 0, "< 3 pts → no fill");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/hatch-test.ts`
Expected: FAIL — `hatchPolygon is not a function` / not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/util/hatch.ts`:

```ts
const rot = (x: number, y: number, cx: number, cy: number, ca: number, sa: number): Point => {
  const dx = x - cx, dy = y - cy;
  return [cx + dx * ca - dy * sa, cy + dx * sa + dy * ca];
};

/** Fill one closed contour with hatch lines at `angleDeg`, `spacingMm` apart.
 *  Rotates so the hatch is horizontal, scans + boustrophedon-links, optional
 *  inset, then rotates back. Returns open polylines. */
export function hatchPolygon(
  poly: Point[], angleDeg: number, spacingMm: number,
  opts: { insetMm?: number } = {},
): Polyline[] {
  if (poly.length < 3 || !(spacingMm > 0)) return [];
  const inset = Math.max(0, opts.insetMm ?? 0);
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const a = (angleDeg * Math.PI) / 180;
  const caNeg = Math.cos(-a), saNeg = Math.sin(-a); // rotate hatch → horizontal
  const rp = poly.map(([x, y]) => rot(x, y, cx, cy, caNeg, saNeg));

  let rows = scanlineSpans(rp, spacingMm);
  if (inset > 0 && rows.length > 0) {
    let miny = Infinity, maxy = -Infinity;
    for (const { y } of rows) { if (y < miny) miny = y; if (y > maxy) maxy = y; }
    rows = rows
      .filter((r) => r.y >= miny + inset && r.y <= maxy - inset)
      .map((r) => ({
        y: r.y,
        spans: r.spans
          .map(([x0, x1]) => [x0 + inset, x1 - inset] as [number, number])
          .filter(([x0, x1]) => x1 > x0),
      }))
      .filter((r) => r.spans.length > 0);
  }

  const runs = linkBoustrophedon(rows);
  const caPos = Math.cos(a), saPos = Math.sin(a); // rotate back
  return runs.map((pts) => ({
    points: pts.map(([x, y]) => rot(x, y, cx, cy, caPos, saPos)),
    closed: false,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/hatch-test.ts`
Expected: PASS — final line `hatch scanlineSpans: all checks passed ✓` prints.

- [ ] **Step 5: Commit**

```bash
git add src/util/hatch.ts scripts/hatch-test.ts
git commit -m "feat(hatch): hatchPolygon rotation wrapper + edge inset"
```

---

### Task 4: `hatch` distortion + registry

**Files:**
- Create: `src/distortions/hatch.ts`
- Modify: `src/distortions/registry.ts`
- Test: `scripts/hatch-distortion-test.ts`

**Interfaces:**
- Consumes: `hatchPolygon` (Task 3); `DistortionDef`, `Polyline` from types.
- Produces: `export const hatch: DistortionDef<Params>` with `Params = { spacingMm, angleDeg, layers, angleStepDeg, keepOutline, insetMm }` and id `"hatch"`. `apply` passes open/degenerate polylines through unchanged; for each closed polyline emits the outline (iff `keepOutline`) plus `layers` fill passes at `angleDeg + i*angleStepDeg`, each fill inheriting the source `stroke`.

- [ ] **Step 1: Write the failing test**

Create `scripts/hatch-distortion-test.ts`:

```ts
// scripts/hatch-distortion-test.ts — checks for the hatch fill distortion.
// Run: npx tsx scripts/hatch-distortion-test.ts
import assert from "node:assert/strict";
import { hatch } from "../src/distortions/hatch";
import type { Artwork } from "../src/generators/types";

const closedSquare = {
  points: [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][],
  closed: true,
  stroke: "#1a3a52",
};
const openLine = {
  points: [[0, 0], [20, 5]] as [number, number][],
  closed: false,
};
const art: Artwork = { widthMm: 100, heightMm: 100, polylines: [closedSquare, openLine] };

// Open polyline passes through unchanged.
{
  const r = hatch.apply(art, { ...hatch.defaults, keepOutline: false }, 1);
  assert.ok(r.polylines.some((l) => !l.closed && l.points.length === 2 && l.points[1][0] === 20),
    "open line survives unchanged");
}

// keepOutline=true → outline present + fill added; fill inherits stroke.
{
  const r = hatch.apply(art, { ...hatch.defaults, keepOutline: true, spacingMm: 2 }, 1);
  const outline = r.polylines.find((l) => l.closed);
  assert.ok(outline, "outline kept");
  const fills = r.polylines.filter((l) => !l.closed && l !== openLine);
  assert.ok(fills.length >= 1, "fill produced");
  assert.ok(fills.every((f) => f.stroke === "#1a3a52"), "fill inherits source stroke");
}

// More layers → at least as many fill polylines as one layer.
{
  const one = hatch.apply(art, { ...hatch.defaults, keepOutline: false, layers: 1, spacingMm: 2 }, 1);
  const three = hatch.apply(art, { ...hatch.defaults, keepOutline: false, layers: 3, spacingMm: 2 }, 1);
  const fillCount = (a: Artwork) => a.polylines.filter((l) => l.points[1]?.[0] !== 20).length;
  assert.ok(fillCount(three) > fillCount(one), "3 layers add more fill than 1");
}

// Degenerate closed polyline (2 points) passes through, no crash.
{
  const degenerate: Artwork = {
    widthMm: 10, heightMm: 10,
    polylines: [{ points: [[0, 0], [5, 5]], closed: true }],
  };
  const r = hatch.apply(degenerate, hatch.defaults, 1);
  assert.equal(r.polylines.length, 1, "degenerate passes through");
}

console.log("hatch distortion: all checks passed ✓");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/hatch-distortion-test.ts`
Expected: FAIL — `Cannot find module '../src/distortions/hatch'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/distortions/hatch.ts`:

```ts
import type { DistortionDef, Polyline } from "../generators/types";
import { hatchPolygon } from "../util/hatch";

type Params = {
  spacingMm: number;
  angleDeg: number;
  layers: number;
  angleStepDeg: number;
  keepOutline: boolean;
  insetMm: number;
};

const DEFAULTS: Params = {
  spacingMm: 1.2,
  angleDeg: 45,
  layers: 1,
  angleStepDeg: 90,
  keepOutline: true,
  insetMm: 0,
};

export const hatch: DistortionDef<Params> = {
  id: "hatch",
  name: "Hatch",
  description:
    "Fills closed shapes with parallel hatch lines, boustrophedon-linked to cut pen lifts. layers (1-3) cross-hatch at angleStepDeg offsets for tonal range; spacingMm is the tone lever (tighter = darker). keepOutline also draws the boundary; insetMm pulls the fill in from the edge. Open polylines pass through unchanged. Single-contour even-odd: holes formed by separate contours are not subtracted.",
  defaults: DEFAULTS,
  schema: {
    spacingMm: { value: DEFAULTS.spacingMm, min: 0.3, max: 5, step: 0.1 },
    angleDeg: { value: DEFAULTS.angleDeg, min: 0, max: 180, step: 1 },
    layers: { value: DEFAULTS.layers, min: 1, max: 3, step: 1 },
    angleStepDeg: { value: DEFAULTS.angleStepDeg, min: 15, max: 90, step: 1 },
    keepOutline: { value: DEFAULTS.keepOutline },
    insetMm: { value: DEFAULTS.insetMm, min: 0, max: 3, step: 0.1 },
  },
  apply: (art, p) => {
    const spacing = Math.max(0.05, p.spacingMm);
    const layers = Math.max(1, Math.min(3, Math.round(p.layers)));
    const out: Polyline[] = [];
    for (const line of art.polylines) {
      if (!line.closed || line.points.length < 3) {
        out.push(line); // open / degenerate → unchanged
        continue;
      }
      if (p.keepOutline) out.push(line);
      for (let i = 0; i < layers; i++) {
        const fill = hatchPolygon(line.points, p.angleDeg + i * p.angleStepDeg, spacing, {
          insetMm: p.insetMm,
        });
        for (const f of fill) out.push({ ...f, stroke: line.stroke });
      }
    }
    return { ...art, polylines: out };
  },
};
```

- [ ] **Step 4: Register the distortion**

Modify `src/distortions/registry.ts`: add the import alongside the others and append `hatch` to the `DISTORTIONS` array.

```ts
import { hatch } from "./hatch";
// ...
export const DISTORTIONS: DistortionDef<any>[] = [noiseWarp, chaikin, kaleidoscope, textKnockout, rotate, pathJoin, hatch];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx scripts/hatch-distortion-test.ts`
Expected: PASS — `hatch distortion: all checks passed ✓`

Run: `npx tsx scripts/smoke.mjs`
Expected: PASS — the run completes and lists `hatch` under "Distortions" with no error (it is auto-applied to the base `rose`).

- [ ] **Step 6: Commit**

```bash
git add src/distortions/hatch.ts src/distortions/registry.ts scripts/hatch-distortion-test.ts
git commit -m "feat(hatch): hatch fill distortion + register in pipeline"
```

---

### Task 5: Visual sample + docs + typecheck

**Files:**
- Create: `scripts/hatch-demo.ts`
- Modify: `README.md:55,64`

**Interfaces:**
- Consumes: a generator from `byId`, the `hatch` distortion, `svgExport`. No new exports.

- [ ] **Step 1: Write the visual demo script**

Create `scripts/hatch-demo.ts`:

```ts
// scripts/hatch-demo.ts — render a generator with the hatch distortion applied,
// for eyeball review. Usage: npx tsx scripts/hatch-demo.ts [generatorId] [out.svg]
import { writeFileSync } from "node:fs";
import { byId } from "../src/generators/registry";
import { hatch } from "../src/distortions/hatch";
import { svgExport } from "../src/render/svgExport";

const [, , id = "superformula", out = "/tmp/hatch-demo.svg"] = process.argv;
const gen = byId(id);
if (!gen) { console.error(`unknown generator: ${id}`); process.exit(1); }

const canvas = { wMm: 160, hMm: 230 };
const base = gen.generate(gen.defaults, 7, canvas);
const filled = hatch.apply(base, { ...hatch.defaults, layers: 2, spacingMm: 1.5 }, 7);
const svg = svgExport(filled, { strokeWidthMm: 0.3 });
writeFileSync(out, svg);
console.log(`hatch demo (${id}, ${filled.polylines.length} polylines) → ${out}`);
```

- [ ] **Step 2: Run the demo and verify output**

Run: `npx tsx scripts/hatch-demo.ts superformula /tmp/hatch-demo.svg`
Expected: prints `hatch demo (superformula, N polylines) → /tmp/hatch-demo.svg` with N noticeably larger than the un-hatched base (fill lines added). Open `/tmp/hatch-demo.svg` to confirm closed regions are filled with cross-hatch and the boustrophedon lines are continuous (no scatter of disconnected dashes).

> If `superformula`'s default output has no closed polylines, the polyline count won't grow — in that case re-run with a generator known to emit closed shapes, e.g. `npx tsx scripts/hatch-demo.ts voronoi /tmp/hatch-demo.svg`, and use that one for the visual check.

- [ ] **Step 3: Update the README distortion list**

In `README.md`, change the heading on line 55 from `## Distortions (6)` to `## Distortions (7)`, and add a row after the Path Join row (line 64):

```markdown
| **Hatch** | Geschlossene Shapes mit Schraffur füllen (boustrophedon-verbunden, weniger Stift-Absetzer); 1–3 Lagen Cross-Hatch für Tonwerte |
```

- [ ] **Step 4: Typecheck the whole project**

Run: `npm run typecheck`
Expected: PASS — no type errors (confirms `src/util/hatch.ts` and `src/distortions/hatch.ts` are sound, including the `Polyline` import).

- [ ] **Step 5: Commit**

```bash
git add scripts/hatch-demo.ts README.md
git commit -m "docs(hatch): visual demo script + README distortion entry"
```

---

## Self-Review

**Spec coverage:**
- Geometry-fill distortion → Task 4. ✓
- Single-contour even-odd → Task 1 (`scanlineSpans`). ✓
- Boustrophedon linking → Task 2. ✓
- Cross-hatch 1–3 layers (angle + angleStep) → Task 4 `apply` loop. ✓
- Params table (spacingMm/angleDeg/layers/angleStepDeg/keepOutline/insetMm) → Task 4 schema. ✓
- `insetMm` simple inset (drop edge rows + trim spans) → Task 3. ✓
- Pass-through open/degenerate → Task 4 (tested) + `hatchPolygon` guards (Task 3). ✓
- Fill inherits stroke; fills open → Task 4 (tested). ✓
- Edge cases (spacing ≤ 0 clamp, concave multi-span, dense perf) → Tasks 1/3 guards + Task 4 clamp. ✓
- Testing (square, concave U, rotated angle, layers, boustrophedon continuity, spacing) → Tasks 1–4 tests. ✓
- Visual sample render → Task 5. ✓
- `voronoiMoire` untouched → no task modifies it. ✓

**Placeholder scan:** No TBD/TODO; every code step has full code; commands have expected output. The one conditional ("if superformula has no closed shapes") gives a concrete fallback command, not a vague instruction. ✓

**Type consistency:** `ScanRow`, `scanlineSpans`, `linkBoustrophedon`, `hatchPolygon`, `hatch`, `Params` are spelled identically across tasks and match `types.ts` (`Point`, `Polyline`, `Artwork`, `DistortionDef`). Registry array matches the existing line + `hatch`. ✓
