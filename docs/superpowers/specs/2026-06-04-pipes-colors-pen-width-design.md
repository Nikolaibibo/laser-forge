# Pipes Color Config + Global Pen Width — Design

**Date:** 2026-06-04
**Status:** Approved (Nikolai, 04.06.2026)

## Motivation

Feedback on Truchet Pipes: (1) the accent palette is hardcoded (`PALETTE` in `pipes.ts`) — count and exact colors should be configurable; (2) preview renders a fixed 0.3 mm stroke, so there is no way to judge how a piece will look with a felt-tip (1–2 mm) vs a fineliner (0.3 mm) before plotting.

## Part A — Configurable colors (Pipes generator params)

- New params on `pipes.ts`:
  - `colorCount`: int slider 1–6, default **3**.
  - `color1` … `color6`: hex strings rendered by leva as native color pickers.
    Defaults: the previous hardcoded palette (`#e0584f`, `#4f86e0`, `#5fcaa8`) plus
    `#e8a33d` (ochre), `#8d5fc9` (violet), `#e96a3a` (orange).
- Picker slots above `colorCount` are hidden via leva `render` hooks
  (`get("Truchet Pipes.colorCount") >= k`).
- `generate` builds the palette as the first `colorCount` picker values; the
  hardcoded `PALETTE` constant is removed. `colorFraction` / `colorStrategy`
  semantics unchanged.
- Backward compatible: defaults reproduce the current look exactly. Colors travel
  in share links automatically (params are fully serialized into the hash payload).

## Part B — Global pen width (preview + SVG export)

- `penWidthMm: number` (default **0.3**) + `setPenWidthMm` in the zustand store.
- ExportBar gets a "Pen ___ mm" number input (step 0.1) next to W/H, with tooltip
  "0.3 Fineliner · 0.5 Gel · 1–2 Filzstift". Applies to **all** generators.
- `CanvasPreview` reads `penWidthMm` from the store instead of the hardcoded
  `lineWidth = 0.3`. Coordinates are in mm, so the stroke renders true to scale —
  at 1.5 mm the 0.7 mm pipe lanes visibly merge into a solid band.
- `svgExport` accepts `strokeWidthMm` (default 0.3) in its options; `downloadSvg`
  passes it through, ExportBar supplies the store value. Cosmetic for plotting
  (the plotter only follows paths) but keeps export visually consistent with preview.
- Share links: `SharePayload` gains optional `pw`; hydrated in `App.tsx`. Old links
  without `pw` keep the 0.3 default.

## Out of scope (YAGNI)

Pen preset dropdown, per-lane colors, color weighting, opacity/ink simulation.

## Verification

- `npm run typecheck` clean.
- Determinism: same seed + params → identical geometry (colors/width are attributes only).
- Visual: render demo SVGs at 0.3 vs 1.5 stroke width, PNG via rsvg-convert.
