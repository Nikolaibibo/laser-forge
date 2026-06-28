# Spec Sheet Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second Layout generator, "Spec Sheet", that frames an imported SVG motif over labelled data rows with dotted leaders — and extract the layout helpers blueprint currently hides locally into a shared kit both layouts use.

**Architecture:** Extract `textBlock` / `translateLines` / `placeMotif` / `drawFrame` from `blueprint.ts` into `src/generators/layout/kit.ts` (behaviour-preserving), refactor `blueprint` onto the kit (gated by its existing test), then build `specsheet.ts` on the same kit and register it in the Layout group.

**Tech Stack:** React/TS/Vite, Leva (param UI, v0.9.35), Hershey single-stroke fonts (`src/generators/text.ts`), Zustand store (`src/state/store.ts`). Tests are standalone `tsx` scripts using `node:assert/strict`, run with `npx tsx scripts/<name>-test.ts`.

## Global Constraints

- TypeScript strict; `npm run typecheck` must stay clean.
- Generators are pure given `(params, seed, canvas)` **plus** the motif in the store: same motif + same params → identical output. Seed is unused by layout generators.
- `drawFrame` must return the frame rect as element `[0]` (closed, `points[0] = [insetMm, insetMm]`), followed by exactly 8 corner-mark segments when `cornerMarks` is true — `blueprint-test.ts` depends on this.
- No new runtime dependencies. Reuse `layoutTextStrokes`, `FONT_IDS`, `HersheyFontId` from `src/generators/text.ts` and `fitToCanvas`, `polylineBounds` from `src/util/path.ts`.
- Canvas units are mm. Type sizes are expressed as % of `canvas.hMm` so typography stays proportional across paper formats.
- No deploy. Commits only. Firebase deploy is manual and done by Nikolai (`firebase deploy --account nikolaibibo@gmail.com`).
- Existing Leva schema convention: conditional fields use `render: (get) => get("<GeneratorName>.<field>") ...` where `<GeneratorName>` is the generator's `name`.

---

## File Structure

- Create: `src/generators/layout/kit.ts` — shared layout primitives + `Block` type + spacing constants.
- Modify: `src/generators/blueprint.ts` — consume the kit; delete the now-shared locals. No behaviour change.
- Create: `src/generators/specsheet.ts` — the Spec Sheet generator + local `leaderDots` helper.
- Modify: `src/generators/registry.ts` — import and register `specsheet` in the Layout group.
- Create: `scripts/specsheet-test.ts` — layout/alignment/determinism checks.

---

## Task 1: Shared layout kit + blueprint refactor

**Files:**
- Create: `src/generators/layout/kit.ts`
- Modify: `src/generators/blueprint.ts` (replace lines 51-95 locals, 130-155 frame, 242-260 motif)
- Test: `scripts/blueprint-test.ts` (existing — regression gate, unchanged)

**Interfaces:**
- Consumes: `layoutTextStrokes`, `FONT_IDS`, `HersheyFontId` from `./text`; `fitToCanvas`, `polylineBounds` from `../util/path`; `useApp` from `../state/store`; `Point`, `Polyline`, `Canvas` from `./types`.
- Produces (for Task 2 and blueprint):
  - `type Block = { lines: Polyline[]; wMm: number; hMm: number }`
  - `textBlock(str: string, font: HersheyFontId, capMm: number, maxWMm: number, stroke?: string): Block | null`
  - `translateLines(lines: Polyline[], dx: number, dy: number): Polyline[]`
  - `placeMotif(slot: { x: number; y: number; w: number; h: number }, motifScale: number, rotation: 0 | 90 | 180 | 270): Polyline[]`
  - `drawFrame(canvas: Canvas, insetMm: number, cornerMarks: boolean, stroke?: string): Polyline[]`

- [ ] **Step 1: Create the kit file**

Create `src/generators/layout/kit.ts`:

```ts
// src/generators/layout/kit.ts — shared layout primitives used by the Layout-group
// generators (blueprint, specsheet). Extracted verbatim from blueprint.ts so both
// layouts share one tested implementation. All coords in mm.
import type { Canvas, Point, Polyline } from "../types";
import { layoutTextStrokes, type HersheyFontId } from "../text";
import { fitToCanvas, polylineBounds } from "../../util/path";
import { useApp } from "../../state/store";

export const LETTER_SPACING = 2; // font units — matches the text generator's feel
export const LINE_SPACING = 1.3;
export const CAP_UNITS = 21; // Hershey glyph extent (cap −12 … baseline 9)

export type Block = { lines: Polyline[]; wMm: number; hMm: number };

/**
 * Lay out a text block in mm, local coords: glyph bbox top at y=0, centered on
 * x=0. Empty/whitespace-only text → null. Caps at capMm; if the widest line
 * would exceed maxWMm the block scales down (pass Infinity to disable clamping).
 */
export function textBlock(
  str: string,
  font: HersheyFontId,
  capMm: number,
  maxWMm: number,
  stroke?: string,
): Block | null {
  const t = str.trim();
  if (!t) return null;
  const strokes = layoutTextStrokes(t, LETTER_SPACING, LINE_SPACING, font);
  const raw: Polyline[] = strokes
    .filter((s) => s.points.length >= 2)
    .map((s) => ({ points: s.points, closed: false, stroke }));
  if (raw.length === 0) return null;
  const b = polylineBounds(raw);
  const wUnits = b.maxX - b.minX || 1;
  const hUnits = b.maxY - b.minY || 1;
  let scale = capMm / CAP_UNITS;
  if (wUnits * scale > maxWMm) scale = maxWMm / wUnits;
  const lines = raw.map((l) => ({
    ...l,
    points: l.points.map(([x, y]): Point => [
      (x - (b.minX + b.maxX) / 2) * scale,
      (y - b.minY) * scale,
    ]),
  }));
  return { lines, wMm: wUnits * scale, hMm: hUnits * scale };
}

export const translateLines = (lines: Polyline[], dx: number, dy: number): Polyline[] =>
  lines.map((l) => ({ ...l, points: l.points.map(([x, y]): Point => [x + dx, y + dy]) }));

/**
 * Place the store's motif inside a slot: quarter-turn rotate (no trig, bit-exact),
 * fit to slot.w*motifScale × slot.h*motifScale, center in the slot. No motif →
 * placeholder box + 2 diagonals so the layout stays tunable.
 */
export function placeMotif(
  slot: { x: number; y: number; w: number; h: number },
  motifScale: number,
  rotation: 0 | 90 | 180 | 270,
): Polyline[] {
  const mw = slot.w * motifScale;
  const mh = slot.h * motifScale;
  const mx = slot.x + (slot.w - mw) / 2;
  const my = slot.y + (slot.h - mh) / 2;
  const motif = useApp.getState().motif;
  if (motif && motif.polylines.length > 0) {
    const ROT: Record<number, (pt: Point) => Point> = {
      0: ([x, y]) => [x, y],
      90: ([x, y]) => [-y, x],
      180: ([x, y]) => [-x, -y],
      270: ([x, y]) => [y, -x],
    };
    const rot = ROT[rotation] ?? ROT[0];
    const rotated = motif.polylines.map((l) => ({ ...l, points: l.points.map(rot) }));
    return translateLines(fitToCanvas(rotated, mw, mh, 0), mx, my);
  }
  return [
    { closed: true, points: [[mx, my], [mx + mw, my], [mx + mw, my + mh], [mx, my + mh]] },
    { closed: false, points: [[mx, my], [mx + mw, my + mh]] },
    { closed: false, points: [[mx + mw, my], [mx, my + mh]] },
  ];
}

/**
 * Frame rect (always element [0]) + optional crop-style corner marks (8 segments).
 * Marks live in the inset band: 2mm off the frame, 1–4mm long.
 */
export function drawFrame(
  canvas: Canvas,
  insetMm: number,
  cornerMarks: boolean,
  stroke?: string,
): Polyline[] {
  const fx0 = insetMm;
  const fy0 = insetMm;
  const fx1 = canvas.wMm - insetMm;
  const fy1 = canvas.hMm - insetMm;
  const out: Polyline[] = [
    { closed: true, stroke, points: [[fx0, fy0], [fx1, fy0], [fx1, fy1], [fx0, fy1]] },
  ];
  if (cornerMarks) {
    const o = 2;
    const len = Math.max(1, Math.min(4, insetMm - o - 0.5));
    const corners: [number, number, number, number][] = [
      [fx0, fy0, -1, -1],
      [fx1, fy0, 1, -1],
      [fx1, fy1, 1, 1],
      [fx0, fy1, -1, 1],
    ];
    for (const [x, y, sxn, syn] of corners) {
      out.push({ closed: false, points: [[x + sxn * o, y], [x + sxn * (o + len), y]] });
      out.push({ closed: false, points: [[x, y + syn * o], [x, y + syn * (o + len)]] });
    }
  }
  return out;
}
```

- [ ] **Step 2: Typecheck the kit in isolation**

Run: `cd ~/Documents/web/laser-forge && npm run typecheck`
Expected: PASS (no errors). The kit compiles even before blueprint uses it.

- [ ] **Step 3: Refactor blueprint to use the kit**

In `src/generators/blueprint.ts`:

Replace the imports block (lines 6-9) so it pulls helpers from the kit instead of declaring locals. New imports:

```ts
import type { GeneratorDef, Point, Polyline } from "./types";
import { FONT_IDS, type HersheyFontId } from "./text";
import {
  textBlock,
  translateLines,
  placeMotif,
  drawFrame,
} from "./layout/kit";
```

Delete the now-shared locals from `blueprint.ts`:
- `LETTER_SPACING`, `LINE_SPACING`, `CAP_UNITS` constants (lines 51-53)
- `type Block` (line 58)
- the `block(...)` function (lines 65-92)
- the `translate(...)` function (lines 94-95)

Keep `MIN_SLOT_FRAC` (line 56) — it's blueprint-specific.

In `generate`, replace the inline frame + corner-marks block (lines 134-155) with:

```ts
    // Frame + corner marks (frame is always polylines[0] — blueprint-test relies on it).
    out.push(...drawFrame(canvas, p.frameInsetMm, p.cornerMarks, accent("frame")));
```

Replace every remaining call to `block(` with `textBlock(` and `translate(` with `translateLines(` in the body (the `buildBlocks` helper and the top-down/bottom-up placement, lines ~176-232).

Replace the inline motif placement block (lines 242-260) with:

```ts
    // Motif slot: whatever vertical space remains.
    const slotH = Math.max(1, bottom - top);
    out.push(...placeMotif({ x: ix0, y: top, w: maxW, h: slotH }, p.motifScale, p.motifRotation));
```

(Delete the local `mw/mh/mx/my`, the `motif`/`ROT`/`rotated` block, and the placeholder branch — `placeMotif` now owns all of that. The `fx0/fy0/fx1/fy1` used later for inner content stay; if they were only declared in the deleted frame block, re-derive them: `const fx0 = p.frameInsetMm, fy0 = p.frameInsetMm, fx1 = canvas.wMm - p.frameInsetMm, fy1 = canvas.hMm - p.frameInsetMm;` right after the `drawFrame` push.)

- [ ] **Step 4: Run the blueprint regression test**

Run: `cd ~/Documents/web/laser-forge && npx tsx scripts/blueprint-test.ts`
Expected: PASS (exits 0, no assertion errors). This proves the extraction is behaviour-preserving — frame still `polylines[0]`, corner marks still +8, accent still on `polylines[0]`, motif still inside canvas, output still deterministic.

- [ ] **Step 5: Typecheck**

Run: `cd ~/Documents/web/laser-forge && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/web/laser-forge
git add src/generators/layout/kit.ts src/generators/blueprint.ts
git commit -m "refactor: extract shared layout kit from blueprint"
```

---

## Task 2: Spec Sheet skeleton (frame, motif, title) + registry

**Files:**
- Create: `src/generators/specsheet.ts`
- Modify: `src/generators/registry.ts:17-27`
- Test: `scripts/specsheet-test.ts`

**Interfaces:**
- Consumes: `textBlock`, `translateLines`, `placeMotif`, `drawFrame`, `Block` from `./layout/kit`; `FONT_IDS`, `HersheyFontId` from `./text`; `GeneratorDef`, `Polyline` from `./types`.
- Produces: `export const specsheet: GeneratorDef<Params>` with `id: "specsheet"`, `name: "Spec Sheet"`.

- [ ] **Step 1: Write the failing skeleton tests**

Create `scripts/specsheet-test.ts`:

```ts
// scripts/specsheet-test.ts — layout + determinism checks for the spec sheet generator.
// Usage: npx tsx scripts/specsheet-test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { specsheet } from "../src/generators/specsheet";
import { parseSvgMotif } from "../src/util/svgImport";
import { useApp } from "../src/state/store";

const here = dirname(fileURLToPath(import.meta.url));
const canvas = { wMm: 148, hMm: 210 }; // A5 portrait
const P = { ...specsheet.defaults };

// 1. no motif → placeholder renders, artwork spans canvas
useApp.getState().setMotif(null);
{
  const art = specsheet.generate(P, 1, canvas);
  assert.equal(art.widthMm, 148);
  assert.equal(art.heightMm, 210);
  assert.ok(art.polylines.length > 0, "expected polylines with placeholder motif");
}
// 2. frame is the first polyline: closed, at frameInsetMm
{
  const art = specsheet.generate(P, 1, canvas);
  const f = art.polylines[0];
  assert.equal(f.closed, true);
  assert.deepEqual(f.points[0], [P.frameInsetMm, P.frameInsetMm]);
}
// 9a. corner marks add exactly 8 segments
{
  const a = specsheet.generate({ ...P, cornerMarks: false }, 1, canvas);
  const b = specsheet.generate({ ...P, cornerMarks: true }, 1, canvas);
  assert.equal(b.polylines.length - a.polylines.length, 8);
}
// 9b. accentTarget frame → frame polyline carries accentColor
{
  const art = specsheet.generate({ ...P, accentTarget: "frame" as const }, 1, canvas);
  assert.equal(art.polylines[0].stroke, P.accentColor);
}

console.log("specsheet-test: all assertions passed");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ~/Documents/web/laser-forge && npx tsx scripts/specsheet-test.ts`
Expected: FAIL — cannot find module `../src/generators/specsheet`.

- [ ] **Step 3: Write the specsheet skeleton**

Create `src/generators/specsheet.ts`:

```ts
// src/generators/specsheet.ts — Spec Sheet layout (Template B): an imported SVG
// motif over a block of labelled data rows with dotted leaders. Reads the motif
// from the app store (only impurity — same motif + params → identical output;
// seed unused). Spec: docs/superpowers/specs/2026-06-28-spec-sheet-layout-design.md
import type { GeneratorDef, Polyline } from "./types";
import { FONT_IDS, type HersheyFontId } from "./text";
import { textBlock, translateLines, placeMotif, drawFrame, type Block } from "./layout/kit";

type Params = {
  title: string;
  specs: string; // one "Label: Value" per line
  footer: string;
  titleFont: HersheyFontId;
  bodyFont: HersheyFontId;
  titleSize: number; // cap height as % of canvas height
  specSize: number; // cap height as % of canvas height
  rowSpacing: number;
  motifSlotFrac: number;
  motifScale: number;
  motifRotation: 0 | 90 | 180 | 270;
  frameInsetMm: number;
  cornerMarks: boolean;
  titleRule: boolean;
  leaderStyle: "dots";
  accentTarget: "none" | "frame" | "value";
  accentColor: string;
};

const DEFAULTS: Params = {
  title: "OMEGA CALIBER 321",
  specs: "Diameter: 27mm\nMovement: Cal. 321\nJewels: 17\nYear: 1965",
  footer: "",
  titleFont: "serif",
  bodyFont: "simplex",
  titleSize: 3.4,
  specSize: 1.6,
  rowSpacing: 1.4,
  motifSlotFrac: 0.5,
  motifScale: 0.85,
  motifRotation: 0,
  frameInsetMm: 8,
  cornerMarks: false,
  titleRule: true,
  leaderStyle: "dots",
  accentTarget: "none",
  accentColor: "#1a3a52",
};

export const specsheet: GeneratorDef<Params> = {
  id: "specsheet",
  name: "Spec Sheet",
  description:
    "Spec sheet layout (Template B): an imported SVG motif (loaded via the Motif " +
    "panel) above a block of labelled data rows with dotted leaders, under a ruled " +
    "title. Enter specs as 'Label: Value', one per line. Empty text collapses; the " +
    "row block auto-scales to fit. Canvas size = paper format.",
  defaults: DEFAULTS,
  schema: {
    title: { value: DEFAULTS.title },
    specs: { value: DEFAULTS.specs, rows: 8 },
    footer: { value: DEFAULTS.footer },
    titleFont: { value: DEFAULTS.titleFont, options: FONT_IDS },
    bodyFont: { value: DEFAULTS.bodyFont, options: FONT_IDS },
    titleSize: { value: DEFAULTS.titleSize, min: 1.5, max: 10, step: 0.1 },
    specSize: { value: DEFAULTS.specSize, min: 0.8, max: 5, step: 0.05 },
    rowSpacing: { value: DEFAULTS.rowSpacing, min: 1, max: 2.5, step: 0.05 },
    motifSlotFrac: { value: DEFAULTS.motifSlotFrac, min: 0.3, max: 0.7, step: 0.05 },
    motifScale: { value: DEFAULTS.motifScale, min: 0.3, max: 1, step: 0.05 },
    motifRotation: { value: DEFAULTS.motifRotation, options: [0, 90, 180, 270] },
    frameInsetMm: { value: DEFAULTS.frameInsetMm, min: 3, max: 25, step: 0.5 },
    cornerMarks: { value: DEFAULTS.cornerMarks },
    titleRule: { value: DEFAULTS.titleRule },
    leaderStyle: { value: DEFAULTS.leaderStyle, options: ["dots"] },
    accentTarget: { value: DEFAULTS.accentTarget, options: ["none", "frame", "value"] },
    accentColor: {
      value: DEFAULTS.accentColor,
      render: (get) => get("Spec Sheet.accentTarget") !== "none",
    },
  },
  generate: (p, _seed, canvas) => {
    const out: Polyline[] = [];
    const frameStroke = p.accentTarget === "frame" ? p.accentColor : undefined;
    out.push(...drawFrame(canvas, p.frameInsetMm, p.cornerMarks, frameStroke));

    const pad = Math.max(3, Math.min(canvas.wMm, canvas.hMm) * 0.03);
    const ix0 = p.frameInsetMm + pad;
    const ix1 = canvas.wMm - p.frameInsetMm - pad;
    const iy0 = p.frameInsetMm + pad;
    const iy1 = canvas.hMm - p.frameInsetMm - pad;
    const cx = (ix0 + ix1) / 2;
    const maxW = ix1 - ix0;
    const innerH = iy1 - iy0;
    const slotH = innerH * p.motifSlotFrac;

    // Motif (fixed top slot, never scaled by the fit pass).
    out.push(...placeMotif({ x: ix0, y: iy0, w: maxW, h: slotH }, p.motifScale, p.motifRotation));

    // Title under the motif slot, with optional rule.
    const titleMm = (p.titleSize / 100) * canvas.hMm;
    const specMm = (p.specSize / 100) * canvas.hMm;
    let y = iy0 + slotH + titleMm * 0.4;
    const titleB = textBlock(p.title.toUpperCase(), p.titleFont, titleMm, maxW);
    if (titleB) {
      out.push(...translateLines(titleB.lines, cx, y));
      y += titleB.hMm;
      if (p.titleRule) {
        y += specMm * 0.5;
        out.push({ closed: false, points: [[ix0, y], [ix1, y]] });
        y += specMm * 0.5;
      }
    }

    return { polylines: out, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
```

- [ ] **Step 4: Register the generator**

In `src/generators/registry.ts`, add the import after line 19 (`import { svg } ...`):

```ts
import { specsheet } from "./specsheet";
```

Change the Layout group line (currently `{ title: "Layout", items: [blueprint] },`) to:

```ts
  { title: "Layout", items: [blueprint, specsheet] },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd ~/Documents/web/laser-forge && npx tsx scripts/specsheet-test.ts`
Expected: PASS — prints "specsheet-test: all assertions passed".

- [ ] **Step 6: Typecheck**

Run: `cd ~/Documents/web/laser-forge && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/web/laser-forge
git add src/generators/specsheet.ts src/generators/registry.ts scripts/specsheet-test.ts
git commit -m "feat: spec sheet generator skeleton (frame, motif, title)"
```

---

## Task 3: Spec rows with dotted leaders

**Files:**
- Modify: `src/generators/specsheet.ts` (add `leaderDots` + row loop in `generate`)
- Test: `scripts/specsheet-test.ts` (add row/leader/alignment cases)

**Interfaces:**
- Consumes: `textBlock`, `translateLines`, `Block` from `./layout/kit` (already imported).
- Produces: spec rows appended to `out` between title and (future) footer. Local helper `leaderDots(gapMm, capMm, font): Block | null`.

- [ ] **Step 1: Add failing tests for rows, leaders, alignment**

Append to `scripts/specsheet-test.ts` before the final `console.log`:

```ts
// 3. N spec lines produce more polylines than 1 spec line
{
  const one = specsheet.generate({ ...P, specs: "Year: 1965", footer: "" }, 1, canvas);
  const four = specsheet.generate(
    { ...P, specs: "A: 1\nB: 2\nC: 3\nD: 4", footer: "" },
    1,
    canvas,
  );
  assert.ok(four.polylines.length > one.polylines.length, "more rows → more polylines");
}
// 5. alignment: every value stays left of the inner right margin; every label
//    right of the inner left margin. Compare against a no-row baseline to isolate rows.
{
  const pad = Math.max(3, Math.min(canvas.wMm, canvas.hMm) * 0.03);
  const ix0 = P.frameInsetMm + pad;
  const ix1 = canvas.wMm - P.frameInsetMm - pad;
  const art = specsheet.generate({ ...P, specs: "Diameter: 42mm", footer: "" }, 1, canvas);
  for (const l of art.polylines) {
    for (const [x] of l.points) {
      assert.ok(x >= ix0 - 0.5, `point left of inner margin: ${x} < ${ix0}`);
      assert.ok(x <= ix1 + 0.5, `point right of inner margin: ${x} > ${ix1}`);
    }
  }
}
// 6. leader present: a label+value row has polylines in the x-band between them.
//    A row with a long value (small gap) has fewer/zero leader dots than a short value.
{
  const shortVal = specsheet.generate({ ...P, specs: "X: 1", footer: "" }, 1, canvas);
  const longVal = specsheet.generate(
    { ...P, specs: "X: 1234567890 1234567890", footer: "" },
    1,
    canvas,
  );
  assert.ok(
    shortVal.polylines.length > longVal.polylines.length,
    "short value leaves a wider gap → more leader dots → more polylines",
  );
}
// 7. line without ':' → label only, no value/leader (fewer polylines than with a value)
{
  const labelOnly = specsheet.generate({ ...P, specs: "SECTION HEADER", footer: "" }, 1, canvas);
  const labelValue = specsheet.generate({ ...P, specs: "Header: x", footer: "" }, 1, canvas);
  assert.ok(
    labelValue.polylines.length > labelOnly.polylines.length,
    "a value + leader add polylines vs label-only",
  );
}
```

- [ ] **Step 2: Run to verify the new cases fail**

Run: `cd ~/Documents/web/laser-forge && npx tsx scripts/specsheet-test.ts`
Expected: FAIL — assertion "more rows → more polylines" (skeleton renders no rows yet, so all variants have equal polyline counts).

- [ ] **Step 3: Implement the leader helper and row loop**

In `src/generators/specsheet.ts`, add the helper above `export const specsheet`:

```ts
/**
 * A run of '.' glyphs (bodyFont) whose laid-out width fits within gapMm, centered
 * on x=0 like any textBlock. Returns null when even one dot would overflow.
 */
function leaderDots(gapMm: number, capMm: number, font: HersheyFontId): Block | null {
  if (gapMm <= 0) return null;
  const one = textBlock(".", font, capMm, Infinity);
  if (!one || one.wMm > gapMm) return null;
  const two = textBlock("..", font, capMm, Infinity);
  const pitch = two ? Math.max(0.1, two.wMm - one.wMm) : one.wMm;
  const n = Math.max(1, Math.floor((gapMm - one.wMm) / pitch) + 1);
  return textBlock(".".repeat(n), font, capMm, Infinity);
}
```

In `generate`, after the title/rule block and before the `return`, insert the row loop. Add `const valueStroke = ...` near the top of `generate` (next to `frameStroke`):

```ts
    const valueStroke = p.accentTarget === "value" ? p.accentColor : undefined;
```

Then, replacing the current `return`:

```ts
    // Spec rows.
    const lines = p.specs.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    const leaderPad = specMm * 0.6;
    y += specMm * (p.rowSpacing - 1) * 0.5; // breath after the title rule
    for (const line of lines) {
      const ci = line.indexOf(":");
      const label = (ci >= 0 ? line.slice(0, ci) : line).trim();
      const value = ci >= 0 ? line.slice(ci + 1).trim() : "";
      const labelB = textBlock(label, p.bodyFont, specMm, maxW);
      if (labelB) {
        out.push(...translateLines(labelB.lines, ix0 + labelB.wMm / 2, y));
        const labelEnd = ix0 + labelB.wMm;
        if (value) {
          const valueB = textBlock(value, p.bodyFont, specMm, maxW, valueStroke);
          if (valueB) {
            out.push(...translateLines(valueB.lines, ix1 - valueB.wMm / 2, y));
            const valueStart = ix1 - valueB.wMm;
            const gap = valueStart - labelEnd - 2 * leaderPad;
            const dots = leaderDots(gap, specMm, p.bodyFont);
            if (dots) out.push(...translateLines(dots.lines, labelEnd + leaderPad + dots.wMm / 2, y));
          }
        }
      }
      y += specMm * p.rowSpacing;
    }

    return { polylines: out, widthMm: canvas.wMm, heightMm: canvas.hMm };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd ~/Documents/web/laser-forge && npx tsx scripts/specsheet-test.ts`
Expected: PASS — "specsheet-test: all assertions passed".

- [ ] **Step 5: Typecheck**

Run: `cd ~/Documents/web/laser-forge && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/web/laser-forge
git add src/generators/specsheet.ts scripts/specsheet-test.ts
git commit -m "feat: spec sheet data rows with dotted leaders"
```

---

## Task 4: Footer, fit-pass, overflow + determinism

**Files:**
- Modify: `src/generators/specsheet.ts` (refactor `generate` text into a scalable `buildText` pass; add footer)
- Test: `scripts/specsheet-test.ts` (empty specs, overflow-in-canvas, determinism)

**Interfaces:**
- Consumes: `svgExport` from `../src/render/svgExport` (test only), existing kit helpers.
- Produces: final `specsheet.generate` with auto-fit + bottom-anchored footer.

- [ ] **Step 1: Add failing tests for empty specs, overflow, determinism**

Add `import { svgExport } from "../src/render/svgExport";` to the top of `scripts/specsheet-test.ts`, then append before the final `console.log`:

```ts
// 4. empty specs → no row content, no throw
{
  const art = specsheet.generate({ ...P, specs: "", footer: "" }, 1, canvas);
  assert.ok(art.polylines.length > 0, "frame + motif + title still render");
}
// 8. overflow: 30 rows still fit inside the canvas (fit pass scales text down)
{
  const many = Array.from({ length: 30 }, (_, i) => `Row ${i}: value ${i}`).join("\n");
  const art = specsheet.generate({ ...P, specs: many }, 1, canvas);
  for (const l of art.polylines) {
    for (const [x, y] of l.points) {
      assert.ok(x >= 0 && x <= 148 && y >= 0 && y <= 210, `point outside canvas: ${x},${y}`);
    }
  }
}
// 10. determinism: identical motif + params → identical svg export
{
  const fixture = readFileSync(join(here, "fixtures/motif-gear.svg"), "utf8");
  useApp.getState().setMotif({ name: "gear", ...parseSvgMotif(fixture) });
  const a = svgExport(specsheet.generate(P, 1, canvas), canvas.wMm, canvas.hMm);
  const b = svgExport(specsheet.generate(P, 1, canvas), canvas.wMm, canvas.hMm);
  assert.equal(a, b, "spec sheet output must be deterministic");
}
```

(Note: confirm the `svgExport` signature against `src/render/svgExport.ts` — `blueprint-test.ts` calls it the same way; mirror whatever blueprint-test does if it differs.)

- [ ] **Step 2: Run to verify the overflow case fails**

Run: `cd ~/Documents/web/laser-forge && npx tsx scripts/specsheet-test.ts`
Expected: FAIL — case 8 finds points with `y > 210` (30 rows overrun without a fit pass).

- [ ] **Step 3: Refactor generate into a scalable text pass + footer**

In `src/generators/specsheet.ts`, replace the body of `generate` from the title block through the `return` with a measured two-pass build. Keep the frame/inner-area/motif setup above unchanged:

```ts
    const valueStroke = p.accentTarget === "value" ? p.accentColor : undefined;
    const specLines = p.specs.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

    // Bottom-anchored footer is measured first so the row budget can reserve its space.
    const footerB = p.footer.trim()
      ? textBlock(p.footer, p.bodyFont, (p.specSize / 100) * canvas.hMm * 0.8, maxW)
      : null;
    const footerReserve = footerB ? footerB.hMm + (p.specSize / 100) * canvas.hMm : 0;

    // Build title + rows at text-scale s; returns the polylines and consumed height
    // (top of title-area to baseline after the last row).
    const buildText = (s: number): { lines: Polyline[]; height: number } => {
      const titleMm = (p.titleSize / 100) * canvas.hMm * s;
      const specMm = (p.specSize / 100) * canvas.hMm * s;
      const leaderPad = specMm * 0.6;
      const acc: Polyline[] = [];
      const top = iy0 + slotH + titleMm * 0.4;
      let y = top;
      const titleB = textBlock(p.title.toUpperCase(), p.titleFont, titleMm, maxW);
      if (titleB) {
        acc.push(...translateLines(titleB.lines, cx, y));
        y += titleB.hMm;
        if (p.titleRule) {
          y += specMm * 0.5;
          acc.push({ closed: false, points: [[ix0, y], [ix1, y]] });
          y += specMm * 0.5;
        }
        y += specMm * (p.rowSpacing - 1) * 0.5;
      }
      for (const line of specLines) {
        const ci = line.indexOf(":");
        const label = (ci >= 0 ? line.slice(0, ci) : line).trim();
        const value = ci >= 0 ? line.slice(ci + 1).trim() : "";
        const labelB = textBlock(label, p.bodyFont, specMm, maxW);
        if (labelB) {
          acc.push(...translateLines(labelB.lines, ix0 + labelB.wMm / 2, y));
          const labelEnd = ix0 + labelB.wMm;
          if (value) {
            const valueB = textBlock(value, p.bodyFont, specMm, maxW, valueStroke);
            if (valueB) {
              acc.push(...translateLines(valueB.lines, ix1 - valueB.wMm / 2, y));
              const gap = ix1 - valueB.wMm - labelEnd - 2 * leaderPad;
              const dots = leaderDots(gap, specMm, p.bodyFont);
              if (dots) acc.push(...translateLines(dots.lines, labelEnd + leaderPad + dots.wMm / 2, y));
            }
          }
        }
        y += specMm * p.rowSpacing;
      }
      return { lines: acc, height: y - top };
    };

    // Fit pass: scale text so title+rows fit the area below the motif slot, minus
    // the footer reserve. One corrective pass suffices (width-clamping only shortens).
    const budget = innerH - slotH - footerReserve;
    const probe = buildText(1);
    const s = probe.height > budget && probe.height > 0 ? budget / probe.height : 1;
    out.push(...(s === 1 ? probe.lines : buildText(s).lines));

    // Footer, bottom-anchored.
    if (footerB) out.push(...translateLines(footerB.lines, cx, iy1 - footerB.hMm));

    return { polylines: out, widthMm: canvas.wMm, heightMm: canvas.hMm };
```

Remove the now-superseded single-pass title/row code added in Tasks 2–3 (the `titleMm`/`specMm`/`y` block and the row loop that lived directly in `generate`), leaving only the frame/inner-area/motif setup followed by this two-pass build.

- [ ] **Step 4: Run the full test suite**

Run: `cd ~/Documents/web/laser-forge && npx tsx scripts/specsheet-test.ts && npx tsx scripts/blueprint-test.ts`
Expected: both PASS — "specsheet-test: all assertions passed" and blueprint exits 0.

- [ ] **Step 5: Typecheck**

Run: `cd ~/Documents/web/laser-forge && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Generate a sample render for the aesthetic check**

Run the dev server (`npm run dev`), pick **Layout → Spec Sheet**, import a motif via the Motif panel, and confirm the layout reads correctly (motif top, ruled title, dotted-leader rows). This is Nikolai's aesthetic verdict gate — do not deploy.

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/web/laser-forge
git add src/generators/specsheet.ts scripts/specsheet-test.ts
git commit -m "feat: spec sheet footer + auto-fit pass"
```

---

## Self-Review

**Spec coverage:**
- Shared kit (textBlock/translateLines/placeMotif/drawFrame + constants + Block) → Task 1. ✓
- blueprint refactor, behaviour-preserving, regression-gated → Task 1. ✓
- specsheet params/schema/defaults (incl. `specs` textarea via `rows`, conditional accentColor) → Task 2. ✓
- Layout algorithm: frame → Task 2; motif slot → Task 2; title + rule → Task 2; spec rows + alignment + dotted leader + no-colon sub-header → Task 3; footer + fit pass → Task 4. ✓
- Registry wiring → Task 2. ✓
- Tests 1-10 from the spec → distributed across Tasks 2 (1,2,9), 3 (3,5,6,7), 4 (4,8,10). ✓
- Verification (typecheck, blueprint regression, specsheet green, sample render, no deploy) → Task 4 Steps 4-6 + per-task steps. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. The one parenthetical note (Task 4 Step 1, confirm `svgExport` signature) points the implementer to the existing `blueprint-test.ts` call as the source of truth — not a placeholder.

**Type consistency:** `Block`, `textBlock`, `translateLines`, `placeMotif`, `drawFrame` signatures are identical between the kit definition (Task 1) and consumers (Tasks 2-4). `leaderDots` returns `Block | null`, consumed as `dots.lines`/`dots.wMm`. `Params` field names (`motifSlotFrac`, `specSize`, `rowSpacing`, `titleRule`, `accentTarget`, `accentColor`) are consistent across schema, defaults, and `generate`.

**Note for implementer:** Tasks 2→3→4 progressively rewrite the body of `generate`. Task 4 replaces the inline title/row code from Tasks 2-3 with the two-pass `buildText`; this is intentional (TDD build-up), not duplication. The final state of `generate` is the Task 4 version.
