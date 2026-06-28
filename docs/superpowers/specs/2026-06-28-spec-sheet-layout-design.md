# Spec Sheet Layout — Design

**Date:** 2026-06-28
**Status:** Approved (design), pending implementation
**Topic:** A second layout generator ("Spec Sheet") for the Layout group, plus extraction of a shared layout kit.

## Goal

Add a new **Layout** generator, `specsheet` ("Spec Sheet"), that composes an
imported SVG motif over a block of labelled data rows with dotted leaders —
the product-datasheet look:

```
PORTRAIT  (Spec Sheet)
+----------------------------+
|        .-=≈≈=-.            |
|       /  MOTIF  \          |
|      |           |        |
|       '-=≈≈=-'            |
|     ==== TITLE ====        |
|  Diameter ......... 42mm   |
|  Material ......... Steel  |
|  Movement ........ Cal.321 |
|  Year ............. 1965   |
+----------------------------+
```

The existing `blueprint` generator (Template A "Classic", centered stack) stays
as-is in behaviour. To avoid duplicating its internals, the small layout helpers
currently local to `blueprint.ts` are extracted into a shared kit that both
layouts consume (Option B, "extract shared kit").

## Non-Goals

- No new SVG import path — `specsheet` reads the same motif from the app store
  (`useApp.getState().motif`) that `blueprint` uses.
- No dynamic-array param UI — spec rows are entered as multi-line text.
- No automatic extraction of specs from SVG metadata.
- No deploy automation — Firebase deploy stays manual
  (`firebase deploy --account nikolaibibo@gmail.com`), triggered by Nikolai.

## Architecture

Three units:

1. `src/generators/layout/kit.ts` (new) — shared layout primitives.
2. `src/generators/blueprint.ts` (refactor) — consume the kit; behaviour unchanged.
3. `src/generators/specsheet.ts` (new) — the Spec Sheet generator.

Plus registry wiring and a test script.

### Unit 1 — Shared kit `src/generators/layout/kit.ts`

Extracted verbatim (behaviour-preserving) from `blueprint.ts`:

| Export | Signature | Purpose |
|--------|-----------|---------|
| `textBlock` | `(str, font: HersheyFontId, capMm, maxWMm, stroke?) → Block \| null` | Lay out a text block in mm, local coords: glyph bbox top at y=0, centered on x=0. Empty/whitespace → `null`. Caps at `capMm`; width-clamps to `maxWMm`. (= current `block()`) |
| `translateLines` | `(lines: Polyline[], dx, dy) → Polyline[]` | Offset polylines. (= current `translate()`) |
| `placeMotif` | `(slot: {x, y, w, h}, motifScale, rotation: 0\|90\|180\|270) → Polyline[]` | Load motif from store, quarter-turn rotate (no trig, bit-exact), `fitToCanvas` into `slot.w*motifScale × slot.h*motifScale`, center in slot, translate. No motif → placeholder box + 2 diagonals. |
| `drawFrame` | `(canvas: Canvas, insetMm, cornerMarks: boolean, stroke?) → Polyline[]` | Returns `[frame, ...cornerMarks]`. Frame is **always element [0]**: closed rect with `points[0] = [insetMm, insetMm]`. Corner marks = 8 crop-mark segments when enabled. |

Shared constants: `LETTER_SPACING = 2`, `LINE_SPACING = 1.3`, `CAP_UNITS = 21`.

Type `Block = { lines: Polyline[]; wMm: number; hMm: number }` is exported from
the kit.

**Contract preservation (critical):** `blueprint-test.ts` asserts frame =
`polylines[0]` (closed, `points[0]=[inset,inset]`), corner marks add exactly 8
segments, and `accentTarget: "frame"` colors `polylines[0]`. `drawFrame` must
return the frame first and the 8 marks after, so `blueprint` pushing
`drawFrame(...)` first keeps all assertions green.

### Unit 2 — `blueprint.ts` refactor

Replace local `block`, `translate`, the inline frame/corner-mark code, and the
inline motif rotate/fit/place with kit imports. No change to params, schema,
defaults, or output geometry. Acceptance = `blueprint-test.ts` passes unchanged.

### Unit 3 — `specsheet.ts`

`GeneratorDef<Params>`, `id: "specsheet"`, `name: "Spec Sheet"`. Seed unused;
reads motif from store → same motif + same params produce identical output
(determinism, same property `blueprint` has).

**Params:**

```ts
type Params = {
  title: string;
  specs: string;          // multi-line; one "Label: Value" per line
  footer: string;         // optional bottom line
  titleFont: HersheyFontId;
  bodyFont: HersheyFontId;
  titleSize: number;      // cap height as % of canvas height
  specSize: number;       // cap height as % of canvas height
  rowSpacing: number;     // multiplier on row advance
  motifSlotFrac: number;  // fraction of inner height for the motif (top)
  motifScale: number;
  motifRotation: 0 | 90 | 180 | 270;
  frameInsetMm: number;
  cornerMarks: boolean;
  titleRule: boolean;     // thin rule line under the title
  leaderStyle: "dots";    // fixed for now; param reserved for future styles
  accentTarget: "none" | "frame" | "value";
  accentColor: string;
};
```

**Schema notes:**
- `specs`: `{ value: DEFAULTS.specs, rows: 8 }` → Leva renders a textarea
  (verified: Leva 0.9.35 supports `rows`).
- `titleFont` / `bodyFont`: `{ options: FONT_IDS }`.
- `titleSize` min 1.5 max 10 step 0.1; `specSize` min 0.8 max 5 step 0.05.
- `rowSpacing` min 1 max 2.5 step 0.05.
- `motifSlotFrac` min 0.3 max 0.7 step 0.05.
- `motifScale` min 0.3 max 1 step 0.05.
- `motifRotation` options `[0, 90, 180, 270]`.
- `frameInsetMm` min 3 max 25 step 0.5.
- `accentColor`: `render: (get) => get("Spec Sheet.accentTarget") !== "none"`.

**Defaults** (watch-themed, mirrors blueprint's Omega example):
`title: "OMEGA CALIBER 321"`, `specs: "Diameter: 27mm\nMovement: Cal. 321\nJewels: 17\nYear: 1965"`,
`footer: ""`, `titleFont: "serif"`, `bodyFont: "simplex"`, `titleSize: 3.4`,
`specSize: 1.6`, `rowSpacing: 1.4`, `motifSlotFrac: 0.5`, `motifScale: 0.85`,
`motifRotation: 0`, `frameInsetMm: 8`, `cornerMarks: false`, `titleRule: true`,
`leaderStyle: "dots"`, `accentTarget: "none"`, `accentColor: "#1a3a52"`.

**Layout algorithm (top-down, mm coords, portrait or landscape — uses canvas dims):**

1. `out = drawFrame(canvas, frameInsetMm, cornerMarks, accentTarget==="frame" ? accentColor : undefined)`.
2. Inner content area: frame inset + `pad = max(3, min(w,h)*0.03)` on each side →
   `ix0, ix1, iy0, iy1`, `cx = (ix0+ix1)/2`, `maxW = ix1-ix0`, `innerH = iy1-iy0`.
3. **Motif slot:** top band, height `slotH = innerH * motifSlotFrac`. Place via
   `placeMotif({x: ix0, y: iy0, w: maxW, h: slotH}, motifScale, motifRotation)`.
4. **Title:** `textBlock(title.toUpperCase(), titleFont, titleMm, maxW)` where
   `titleMm = titleSize/100 * canvas.hMm`. Centered at `cx`, placed just below the
   motif slot. If `titleRule`, push a horizontal line across `[ix0..ix1]` a small
   gap under the title baseline.
5. **Spec rows:** split `specs` on `\n`; trim each; skip empty. For each line:
   - Split on the **first** `:` → `{label, value}` (both trimmed). No `:` →
     `label = whole line`, `value = ""` (renders as a left-aligned sub-header,
     no leader).
   - `specMm = specSize/100 * canvas.hMm`.
   - Render `label` via `textBlock(label, bodyFont, specMm, maxW)`, left-align:
     `dx = ix0 + labelBlock.wMm/2`.
   - If `value`: render `value` via `textBlock(value, bodyFont, specMm, maxW,
     accentTarget==="value" ? accentColor : undefined)`, right-align:
     `dx = ix1 - valueBlock.wMm/2`.
   - **Dotted leader:** gap from `ix0 + labelBlock.wMm + leaderPad` to
     `ix1 - valueBlock.wMm - leaderPad` (`leaderPad ≈ specMm*0.4`). Build a run
     of `.` chars in `bodyFont` whose laid-out width ≤ gap (binary/linear grow
     count from the single-dot advance), left-align it at the gap start, vertical
     center on the row. Skip leader if gap ≤ 0 or value empty.
   - Advance baseline by `specMm * rowSpacing`.
6. **Footer:** if non-empty, `textBlock(footer, bodyFont, specMm*0.8, maxW)`,
   centered at `cx`, bottom-anchored at `iy1`.
7. **Fit pass:** compute total height of title (+rule gap) + all rows + footer.
   The budget is `innerH - slotH`. If total > budget, uniform-scale the text
   sizes by `budget/total` and re-run steps 4–6 once. (Width-clamping in
   `textBlock` only shortens, so one corrective pass suffices — same reasoning as
   blueprint.) Motif slot is fixed and never scaled.
8. Return `{ polylines: out, widthMm: canvas.wMm, heightMm: canvas.hMm }`.

### Unit 4 — Registry

`src/generators/registry.ts`: import `specsheet`, add to the Layout group:

```ts
{ title: "Layout", items: [blueprint, specsheet] },
```

## Testing — `scripts/specsheet-test.ts`

Pattern from `blueprint-test.ts` (`npx tsx`, `node:assert/strict`, A5 148×210,
reuse `fixtures/motif-gear.svg`):

1. No motif → placeholder renders; `widthMm/heightMm` span canvas; polylines > 0.
2. Frame is `polylines[0]`: `closed === true`, `points[0] === [inset, inset]`.
3. N spec lines produce N row groups (assert presence of label glyphs / distinct
   row y-bands vs fewer lines → fewer polylines).
4. Empty `specs` → no row polylines beyond frame/motif/title; no throw.
5. Alignment: every spec value's max-x ≤ `ix1` (+ε); every label's min-x ≥ `ix0`
   (−ε).
6. Leader present: a row with label+value has polylines in the x-band between
   label end and value start.
7. Line without `:` → rendered as label, no value/leader (fewer polylines than
   same line with a value).
8. Overflow: many rows (e.g. 30) → fit pass keeps all points inside the canvas
   (`0 ≤ x ≤ 148`, `0 ≤ y ≤ 210`).
9. Corner marks: `cornerMarks: true` adds exactly 8 segments vs `false`.
   `accentTarget: "frame"` → `polylines[0].stroke === accentColor`.
10. Determinism: same motif + params → identical `svgExport` output on repeat.

Also: `blueprint-test.ts` must still pass (refactor regression gate).

## Verification before "done"

- `npm run typecheck` clean.
- `npx tsx scripts/blueprint-test.ts` green (regression).
- `npx tsx scripts/specsheet-test.ts` green.
- One sample render reviewed by Nikolai for aesthetics.
- Commit only after Nikolai's go. No deploy (manual, Nikolai).

## Open questions / future

- **Round plotter dots:** leaders use Hershey `.` glyphs (visually consistent,
  reuses `textBlock`). If pen-lift count or dot shape disappoints on real plots,
  swap to a parametric small-circle/short-dash leader behind the existing
  `leaderStyle` param (`"dots" | "dashed" | "line"`).
- **Template C:** with the kit extracted, a third layout (e.g. Engineering
  Title-Block) is now a single new file + registry line.
