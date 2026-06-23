# Pattern Maker — Generator Spec

Date: 2026-06-17
Parent plan: `2026-06-17-pattern-maker-editorial-ui-plan.md`

## Goal
One generator that tiles a source motif across the canvas in three layouts —
Grid, Radial, Spiral — with per-tile rotation, scale, jitter, and color.
Collapses Line & Form's Pattern-Linear / Radial / Spiral cluster into a single
`mode`-switched generator.

## Source motif
Reuses the existing `motif` store slot + `MotifPanel` (same as `blueprint`).
- If a motif is loaded → tile it.
- If none → tile a built-in default motif (3-line asterisk = 6 rays), so the
  generator renders immediately on selection.
Motif is **normalized** to a unit cell centered on the origin (max extent = 1,
aspect preserved) so tile transforms are pure scale/rotate/translate.

Generalize the `MotifPanel` gate from `=== "blueprint"` to a
`MOTIF_CONSUMERS = Set(["blueprint","pattern-maker"])` membership test.

## Params (Leva schema, flat)
- `mode`: grid | radial | spiral
- `tileScale`: motif size vs. the mode's reference cell (0.1–2, default 0.8)
- Grid: `cols`, `rows`, `marginMm`, `brickOffset` (0–1 row stagger)
- Radial: `rings`, `perRing` (0 = auto by circumference), `innerRadiusMm`, `ringSpacingMm`
- Spiral: `count`, `spiralType` (archimedean | golden), `spacingMm`, `angleStepDeg` (archimedean), `scaleFalloff` (shrink toward center)
- Radial+Spiral: `faceCenter` (orient each copy toward center)
- Common (seeded): `rotationStep` (°/tile index), `rotationJitter`, `scaleJitter`, `posJitterMm`
- `colorBy`: none | index | ring | random (assigns `Polyline.stroke` from a 5-color palette)
- `clipToCanvas`: drop any tile with a point outside the page

Reference cell per mode (for `tileScale`): grid = min(cellW,cellH);
radial = ringSpacingMm; spiral = spacingMm.

## Determinism
`makeRng(seed)`. RNG is **only** consumed when a jitter param > 0 or
`colorBy === "random"`. Therefore with all jitter = 0 and colorBy ≠ random,
output is identical across seeds (testable invariant). Same motif + params +
seed → identical Artwork (same `blueprint` purity caveat: reads store motif).

## clip semantics
Whole-tile drop (not partial geometric clip): if `clipToCanvas` and any point
of a tile lies outside `[0,W]×[0,H]`, the entire tile is skipped. Guarantees
all emitted points are in-bounds without heavy polygon clipping.

## Tests — `scripts/pattern-maker-test.ts` (tsx)
1. No motif → default motif tiles; grid emits `cols*rows*defaultPolylines`.
2. Motif loaded (gear fixture) → grid emits `cols*rows*motifPolylines`.
3. `clipToCanvas` with oversized tiles → every emitted point in `[0,W]×[0,H]`.
4. Determinism: jitter 0 + colorBy none → identical Artwork across two seeds.
5. Jitter: `posJitterMm > 0` → output differs between two seeds.
6. Radial `faceCenter` → tile orientation differs from non-faceCenter.
7. Artwork dims equal canvas.

## Touch list
- `src/generators/patternMaker.ts` (new)
- `src/generators/registry.ts` (+import, new "Pattern" group)
- `src/ui/MotifPanel.tsx` (gate → membership set)
- `scripts/pattern-maker-test.ts` (new)
No changes to render / export / plotter.
