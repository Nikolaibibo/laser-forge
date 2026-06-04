# Text Ribbons Upgrade — Flowing Script, Knockout Layer, Colors — Design

**Date:** 2026-06-04
**Status:** Approved (Nikolai picked all three: Flowing Script + Text-Knockout + Farben/var. Breite)

## 1. Flowing Script

- **Cursive font:** vendor Hershey `cursive.jhf` (same single-line format as
  futural) via a parameterized `scripts/hershey/build.ts` →
  `src/generators/hersheyCursive.ts` (`CURSIVE`). New `font` param
  (`simplex | cursive`) on Text Ribbons.
- **joinStrokes v2 (replaces the experimental fused chain):** glyph strokes stay
  separate bands; greedy nearest-endpoint ordering produces explicit
  **connector strokes** (tail → next head) sampled as a gentle quadratic arc
  (control point offset perpendicular, toward the baseline).
- **Occlusion z-trick:** letter bands get z=1, connector bands z=0. `occlude`
  carves gaps into connectors wherever they pass through letters — flowing
  ribbon, but readable. `occlusionGap` param (font units, like laneSpacingMm).
- Connectors inherit the color of their source letter.

## 2. Text-Knockout distortion layer

`src/distortions/textKnockout.ts` — carves text as negative space into ANY
generator output, using the existing `occlude` util with zero new geometry:
text strokes become occlusion items with **empty lane lists** and z=1
(they carve but draw nothing); the artwork's polylines are one z=0 item.

- Layout reuses the shared text-layout helper (refactored out of text.ts).
- Params: `text`, `sizeMm` (cap height), `xFrac`/`yFrac` (center position),
  `clearMm` (carve radius around text centerline), `letterSpacing`,
  `lineSpacing`, `font`. Pure geometry — seed unused.

## 3. Colors + variable width (Text Ribbons)

- Pipes-style palette: `colorCount` (1–6) + `color1…color6` pickers
  (render-hooks under "Text Ribbons").
- `colorBy`: `none | letter | word | line` — cycles the palette. Default
  **letter** (feature visible out of the box; old links change look — accepted,
  lesson from ribbons' invisible colorFraction=0).
- `lanes` → `lanesMin`/`lanesMax` (default 6/6 = unchanged); per-LETTER seeded
  lane count (strokes of one letter share a width). Text now uses its seed.

## Out of scope (YAGNI)

Text on path, kerning pairs, multiple knockout layers interplay, per-stroke
tapering.

## Verification

- typecheck clean; determinism (same seed → identical SVG, twice per mode).
- Renders: cursive + joinStrokes (readability check), colorBy=letter,
  knockout over pipes background; pen 0.5.
