# Blueprint Configurability + vpype Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Blueprint generator fully configurable (independent per-field typography, page-format presets, pen-width-aware sizing with warnings), kill the line-doubling permanently (native dedupe/join ON by default + vpype polish on the Pi bridge), and emit blueprint text in an editable form (dual-layer SVG + `<metadata>` round-trip) without losing plot-readiness.

**Design:** `docs/superpowers/specs/2026-06-30-blueprint-config-vpype-design.md`

## Progress (2026-07-01)

- ✅ **Task 4** (default-on dedupe/join) — `svgExport`+`gcode` resolve `?? true`; store + AxiDrawPanel UI ON. Commit `84934bd`.
- ✅ **Task 1** (page formats) — **Deviation:** built as a global Format `<select>` in `TopBar` calling `setCanvas` via `src/util/pageFormats.ts`, NOT a blueprint param. Cleaner (affects all generators; avoids Leva-param-with-side-effect). `pageFormat`/`applyPageFormat` in the plan below are superseded by this.
- ✅ **Task 2** (per-field typography) — independent `headerSize/subtitleSize/footerSize` + `*Show` toggles + `textAlign` + `frameStyle`. **Deviation:** `textAlign` is block-level in the blueprint caller (via `alignX`), NOT a `textBlock` param — keeps the shared kit stable for specsheet. `drawFrame` gained `frameStyle` (default `"single"`, behaviour-neutral).
- ✅ **Task 3** (pen-guard warnings) — `MIN_CAP_RATIO=8`; blueprint returns `Artwork.warnings` when a shown field's cap < 8× pen, or when the stack was scaled to fit. **Deviation:** pen width flows in via the `Canvas` object (`Canvas.penWidthMm`, App passes store `penWidthMm`), NOT a duplicate blueprint param — the global pen field already exists. Warnings preserved through the distortion pipeline in App and rendered as a `.lf-warnings` overlay.
- ⏳ Remaining: Task 5 (editable dual-layer text), Task 6 (vpype on Pi bridge), Task 7 (tests).

**Architecture:** Extend `blueprint.ts` schema/`generate` for independent field controls + page format + pen width. Add `src/util/pageFormats.ts`. Carry label/source metadata on `Artwork` (optional) so `svgExport` can emit an editable `<text>` layer + `<metadata>` JSON; add `src/util/blueprintMeta.ts` for round-trip import. Flip `dedupe`/`join` defaults ON. Add an env-gated vpype preprocess in `bridge/bridge.py`.

**Tech Stack:** React 18 / TS 5.6 / Vite / Zustand / Leva (v0.9.35). Hershey single-stroke fonts (`src/generators/text.ts`). Layout kit `src/generators/layout/kit.ts`. Tests = standalone `tsx` scripts with `node:assert/strict`, run `npx tsx scripts/<name>-test.ts`. Pi bridge = `bridge/bridge.py` (Python), vpype at `~/.venvs/vpype/bin/vpype`.

## Global Constraints

- TypeScript strict; `npm run typecheck` clean after every task.
- Generators stay pure given `(params, seed, canvas)` + the motif in the store: same inputs → byte-identical output. Seed unused by layout generators.
- `drawFrame` must keep returning the frame rect as element `[0]` (closed, `points[0] = [insetMm, insetMm]`) + exactly 8 corner-mark segments when on — `blueprint-test.ts` depends on it.
- No new **browser** runtime dependency. vpype runs only on the Pi (Python, already installed).
- Type sizes stay expressed as % of `canvas.hMm` (shared-kit convention; Spec Sheet relies on it). Pen-width is an additive guard, not a unit change.
- Leva conditional fields: `render: (get) => get("Blueprint.<field>") ...` (generator `name` = `"Blueprint"`).
- No deploy. Commits only. Firebase deploy is manual by Nikolai (`firebase deploy --account nikolaibibo@gmail.com`).
- Backward compat: with `editableText=false` and dedupe/join matching prior state, existing exports stay byte-identical.

## File Structure

- Create: `src/util/pageFormats.ts` — A6..A3 × portrait/landscape → `{wMm,hMm}`; `"custom"`.
- Create: `src/util/blueprintMeta.ts` — params ⇄ `<metadata>` JSON (serialize + parse).
- Modify: `src/generators/types.ts` — optional `labels` + `source` on `Artwork`; optional `warnings`.
- Modify: `src/generators/blueprint.ts` — schema + `generate` (per-field sizing, show toggles, align, frameStyle, pageFormat, penWidthMm, labels/warnings).
- Modify: `src/generators/layout/kit.ts` — `textBlock` gains `align`; `drawFrame` gains `frameStyle`.
- Modify: `src/state/store.ts` — `applyPageFormat` action (sets `canvasWMm/hMm`).
- Modify: `src/render/svgExport.ts` — `dedupe`/`join` default ON; dual-layer + `<text>` + `<metadata>`.
- Modify: `src/ui/Console.tsx` — dedupe/join default ON in UI; surface generator warnings.
- Modify: `bridge/bridge.py` — env-gated vpype preprocess.
- Modify: `scripts/blueprint-test.ts` — new asserts.
- Create: `scripts/blueprint-vpype-test.sh` — (Pi-side, optional) before/after path count.

---

## Task 1: Page-format presets

**Files:** Create `src/util/pageFormats.ts`; Modify `src/state/store.ts`, `src/generators/blueprint.ts`.

- [ ] **Step 1** — `src/util/pageFormats.ts`: export `PAGE_FORMATS` map and helper.
```ts
// ISO A-series in mm (portrait long edge). Landscape swaps w/h.
const A = { a6: [105, 148], a5: [148, 210], a4: [210, 297], a3: [297, 420] } as const;
export type PageFormatId =
  | "a6-portrait" | "a6-landscape" | "a5-portrait" | "a5-landscape"
  | "a4-portrait" | "a4-landscape" | "a3-portrait" | "a3-landscape" | "custom";
export const PAGE_FORMAT_IDS: PageFormatId[] = [/* ...all above... */];
export const pageFormatSize = (id: PageFormatId): { wMm: number; hMm: number } | null => {
  if (id === "custom") return null;
  const [size, orient] = id.split("-");
  const [s, l] = A[size as keyof typeof A];
  return orient === "landscape" ? { wMm: l, hMm: s } : { wMm: s, hMm: l };
};
```
- [ ] **Step 2** — `store.ts`: add `applyPageFormat(id: PageFormatId)` that, for non-custom, sets `canvasWMm`/`canvasHMm` from `pageFormatSize`. Leave `canvasWMm/hMm` user-editable for `"custom"`.
- [ ] **Step 3** — `blueprint.ts`: add `pageFormat: PageFormatId` to `Params` (default `"a4-landscape"`) + schema `{ value, options: PAGE_FORMAT_IDS }`. The generator itself still reads `canvas.wMm/hMm` (purity preserved); the Inspector calls `applyPageFormat` on change (wire in the control's onChange path used by other format-affecting controls — confirm the existing canvas-size control pattern in the ExportBar/Inspector and mirror it).

**Verify:** `typecheck`; selecting `a4-landscape` sets canvas 297×210; `custom` leaves manual mm.

---

## Task 2: Independent per-field typography + show toggles + align + frame style

**Files:** Modify `src/generators/blueprint.ts`, `src/generators/layout/kit.ts`.

- [ ] **Step 1** — `kit.ts`: extend `textBlock(str, font, capMm, maxWMm, stroke?, align?: "left"|"center"|"right")`. Default `"center"` (preserves current behaviour). Left/right shift the per-line origin within `maxWMm` instead of centering. Keep return `Block`.
- [ ] **Step 2** — `kit.ts`: extend `drawFrame(canvas, insetMm, cornerMarks, stroke?, frameStyle?: "none"|"single"|"double")`. `"none"` → no rect (but **still** return element `[0]` as a degenerate/closed empty? No — keep test contract: when `frameStyle!=="none"` rect is `[0]`; when `"none"`, return `[]` and update the test). `"double"` → outer rect + inner rect inset by ~1.5mm. Default `"single"`.
- [ ] **Step 3** — `blueprint.ts` `Params` + `DEFAULTS` + schema: replace the hard-wired ratios with independent controls:
  - `headerSize` %, `subtitleSize` %, `footerSize` % (sliders), keep `titleSize`/`metaSize`.
  - `headerShow`, `subtitleShow`, `footerShow` (toggles) — slot renders iff `show && text.trim()`.
  - `textAlign: "left"|"center"|"right"` (default `center`).
  - `frameStyle: "none"|"single"|"double"` (default `single`).
- [ ] **Step 4** — `blueprint.ts` `generate`: in `buildBlocks`, use the independent `*Size` values (× s) instead of `metaMm*0.8/1.1`; pass `p.textAlign`; gate each block by its `*Show`. Frame call passes `p.frameStyle`.

**Verify:** `typecheck`; per-field size sliders move that field's glyph height independently; `*Show=false` collapses the slot; `textAlign` shifts blocks; `frameStyle:"double"` adds an inner rect; `frameStyle:"none"` removes the frame (update test).

---

## Task 3: Pen-width-aware guard + warnings

**Files:** Modify `src/generators/types.ts`, `src/generators/blueprint.ts`, `src/ui/Console.tsx` (or Inspector warning slot).

- [ ] **Step 1** — `types.ts`: add optional `warnings?: string[]` to `Artwork`.
- [ ] **Step 2** — `blueprint.ts`: add `penWidthMm: number` (default 0.3, slider 0.1–2, step 0.05). Constant `MIN_CAP_RATIO = 8`. After resolving each field's `capMm = (size/100)*canvas.hMm`, if a *shown* field's `capMm < MIN_CAP_RATIO * penWidthMm`, push a warning string (e.g. `` `Title cap ${capMm.toFixed(1)}mm < recommended ${(MIN_CAP_RATIO*pen).toFixed(1)}mm at ${pen}mm pen` ``). Also warn when horizontal overflow forced `s < 1`. Return `warnings` on the Artwork. **Do not** auto-shrink for the pen reason — warn only.
- [ ] **Step 3** — Surface `artwork.warnings` in the UI (Console or Inspector) as a non-blocking notice. Find where the Stage builds the artwork and where status text already renders; render a small warning list there.

**Verify:** `typecheck`; titleSize that yields <8×pen at the chosen pen shows a warning; raising the size clears it; output geometry unchanged by the warning (warnings are side-info).

---

## Task 4: Default-on native dedupe + join

**Files:** Modify `src/render/svgExport.ts`, `src/ui/Console.tsx`.

- [ ] **Step 1** — `svgExport.ts`: change `SvgExportOptions` resolution so `dedupe` and `join` default **true** when unspecified (`const dedupe = opts.dedupe ?? true; const join = opts.join ?? true;`). Keep explicit `false` working.
- [ ] **Step 2** — `Console.tsx`: set the two toggles' initial UI state to ON (lines ~41/47 per scan). Keep them user-overridable.

**Verify:** Re-export the RP-1357 blueprint → segment-overlap ~25%→~0 (use `scripts/`-style count or the python check from the session). Toggling OFF restores raw output (regression escape hatch).

---

## Task 5: Editable dual-layer export + metadata round-trip

**Files:** Modify `src/generators/types.ts`, `src/generators/blueprint.ts`, `src/render/svgExport.ts`; Create `src/util/blueprintMeta.ts`; wire import path.

- [ ] **Step 1** — `types.ts`: add optional to `Artwork`:
```ts
labels?: { field: string; text: string; xMm: number; yMm: number; capMm: number; font: string; align: "left"|"center"|"right" }[];
source?: { generator: string; params: Record<string, unknown> };
```
- [ ] **Step 2** — `blueprint.ts` `generate`: while placing each text block, also push a `labels` entry with the block's baseline position (xMm from align + cx/ix, yMm from `top`/`bottom`, `capMm` resolved), and set `source = { generator: "blueprint", params: p }`. (Positions are the same ones used for `translateLines`.)
- [ ] **Step 3** — `blueprintMeta.ts`: `serializeMeta(source) => string` (JSON) and `parseMeta(svgText) => { generator, params } | null` (read `<metadata id="lf-blueprint">`). Version field `version: 1`; tolerate unknown/missing → best-effort.
- [ ] **Step 4** — `svgExport.ts`: add `editableText?: boolean` (default true) to options. When true and `art.labels`/`art.source` present, emit:
  - `<metadata id="lf-blueprint">{serializeMeta(source)}</metadata>`,
  - plot content inside `<g inkscape:groupmode="layer" inkscape:label="plot" id="plot">…</g>`,
  - a `<g inkscape:groupmode="layer" inkscape:label="text" id="labels" display="none">` of `<text x y font-size="{capMm}mm" text-anchor="{start|middle|end}" data-field="…">{text}</text>`.
  Add the `xmlns:inkscape` attr to `<svg>`. When false → current single-`<g>`/flat output (compat).
- [ ] **Step 5** — Round-trip import: in the SVG/motif import path (`src/util/svgImport.ts` or the Motif panel), if `parseMeta` finds blueprint source, offer/restore `store.setGenParams("blueprint", params)` (+ select the Blueprint generator). Keep it explicit (button/auto per existing import UX), no silent overwrite.

**Verify:** `typecheck`; export with `editableText` → SVG has `plot` layer (path count == prior) + hidden `text` layer with one `<text>` per shown field + `<metadata>`; vpype/axicli ignore `<text>` (no double draw); Export→Re-import → `genParams.blueprint` deep-equals original; `editableText=false` → byte-identical to pre-change flat export.

---

## Task 6: vpype preprocess on the Pi bridge

**Files:** Modify `bridge/bridge.py`.

- [ ] **Step 1** — Add `maybe_vpype(in_path) -> out_path`: if `os.environ.get("LF_VPYPE")` truthy and `LF_VPYPE_BIN` (default `~/.venvs/vpype/bin/vpype`) exists, run
  `vpype read <in> linemerge --tolerance 0.1mm linesort linesimplify --tolerance 0.05mm write <out>` (subprocess, `DYLD/`PATH as needed, GEOS via the venv). On non-zero exit or missing binary → log warning, return the original `in_path` (never abort the plot).
- [ ] **Step 2** — Call `maybe_vpype` in `/plot` **before** `prep_svg`, on the received SVG temp file. Keep the existing rotate/scale/model/servo prep 1:1 downstream.
- [ ] **Step 3** — Log before/after path counts (cheap grep) for confidence.

**Verify (Pi/SSH):** `LF_VPYPE=1` plot of a blueprint logs path reduction; `LF_VPYPE` unset → unchanged path; vpype made unavailable → fallback plot + warning; `/stop` still raises pen.

---

## Task 7: Tests + defaults

**Files:** Modify `scripts/blueprint-test.ts`; Create `scripts/blueprint-vpype-test.sh`.

- [ ] **Step 1** — `blueprint-test.ts`: assert independent field sizing changes only that field's extent; `*Show=false` drops the slot; `applyPageFormat`/`pageFormatSize` returns correct mm; pen guard emits a warning below threshold and none above; `frameStyle:"none"` → no frame rect (and update the `[0]`-is-frame assumption guarded by `frameStyle!=="none"`); `frameStyle:"double"` → +1 rect; dual-layer export: plot-layer path count == flat path count, `<text>` count == shown fields; determinism (same params → identical bytes); round-trip params deep-equal.
- [ ] **Step 2** — `blueprint-vpype-test.sh` (optional, Pi): run the vpype pipeline on a fixture SVG, assert output path count < input.
- [ ] **Step 3** — Save a Specimen-Press default preset (sensible field sizes for A4 landscape at 0.3–1.0mm pens) — as `DEFAULTS` tuning or a documented param set in the spec.

**Verify:** `npx tsx scripts/blueprint-test.ts` green; `npm run typecheck` clean.

---

## Sequencing note

Task 4 (default-on dedupe) is the smallest change and resolves the acute doubling immediately — land it first so Niko can re-plot clean while the rest proceeds. Tasks 1–3 deliver the "fully configurable" core. Task 5 (editable text) is the largest and depends on the `Artwork` extension. Task 6 (vpype) is independent and can land anytime. Task 7 closes each.
