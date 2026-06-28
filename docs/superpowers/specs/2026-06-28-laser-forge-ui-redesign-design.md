# Laser Forge — UI Redesign ("Signal Chain") — Design

**Date:** 2026-06-28
**Status:** Approved (design), pending implementation plan
**Scope:** Full new UI concept. Desktop only. Single user.

## Problem

The UI grew organically across ~28 generators + 6 distortions. Two concrete pain
points dominate day-to-day use:

1. **Generator switching** — a modal overlay list with no search and no previews;
   slow to find and pick among ~28 generators.
2. **Parameter controls** — the right-sidebar Leva panel feels cramped and generic,
   restyled only via fragile `!important` CSS overrides coupled to Leva's DOM.

Secondary debt: ~90 inline `style={{}}` objects, three inconsistent button styles, a
floating draggable ExportBar, machine controls hidden behind tabs, layer reorder via
arrow buttons, no design-token system in code, generators impurely reading
`useApp.getState().motif` inside `generate()`.

## Goals

- One cohesive **CAD / technical** design language across the whole app.
- Fast, searchable, **preview-driven generator switching**.
- **Custom parameter controls** that read the existing generator/distortion `schema`
  (keep schema-driven generation, own the rendering). Remove the Leva dependency.
- A single, clear interaction model: **generator + distortions = one signal chain**;
  select a node, edit its params.

## Non-Goals (YAGNI)

Undo/redo · node-graph branching · mobile/responsive · user-defined generators ·
dark/light runtime toggle (we pick one) · validation overhaul beyond canvas-bounds
clamping.

---

## Interaction Model: Signal Chain

The generator is the **SOURCE** node of a vertical chain; distortions are nodes
stacked below it in pipeline order. Exactly one node is **selected** at a time, and the
Inspector edits that node's parameters. This unifies what used to be two separate
concepts (the generator picker + the layer stack with sibling Leva folders).

```
┌─ TOP BAR (44px) ───────────────────────────────────────────────────┐
│ ◆ LASER FORGE  │  doc 200×200mm   pen 0.30mm   seed 1337 ⟲  │  ⇄ share │
├─ PIPELINE (240) ─┬─ CANVAS (fluid) ──────────────┬─ INSPECTOR (300) ──┤
│  ◆ SOURCE         │                                │  <selected node>   │
│    FlowField   ▸  │        grid-bed canvas         │  schema-driven     │
│  ──┼──            │        (auto-fit, rulers)      │  CAD controls      │
│  1 Noise Warp  👁 │                                │                    │
│  2 Chaikin     👁 │                                │                    │
│  + Layer          │                                │                    │
├─ CONSOLE (44px) ──┴────────────────────────────────┴────────────────────┤
│ 842 lines · 12k pts · ~4m  │  ☐ dedupe  ☐ join  │  SVG   G-code   ▸ Plot │
└──────────────────────────────────────────────────────────────────────────┘
```

No floating/draggable panels. Four fixed zones (top bar, pipeline rail, console,
inspector) around a fluid canvas, via CSS Grid.

---

## Components

Each lives in `src/ui/` (rebuilt). One clear purpose per unit; communicate via the
Zustand store and typed props.

### TopBar
Document-global controls: wordmark, canvas W×H (mm), pen width (mm), **seed + reroll**
(chain-global, most-tweaked), share (copy state-hash URL). Canvas dims clamp to a sane
range (e.g. 10–1000mm) on commit.

### PipelineRail
Renders the chain.
- **SourceNode** — visually distinct (it's the origin). Icon + generator name + group
  tag. `▸` affordance opens the GeneratorGallery to swap. Shows a motif chip for
  motif-consuming generators (blueprint / specsheet / patternMaker).
- **LayerNode** (one per distortion) — number badge, name, eye-toggle (enable/disable),
  `×` on hover (remove). **Drag-to-reorder** (replaces up/down arrows).
- Thin "flow" connector lines between nodes convey signal direction.
- Selecting any node sets `selectedNodeId`; the Inspector follows.
- **+ Layer** opens a compact distortion menu (same component family as the gallery).

### Inspector + SchemaControls
`<SchemaControls schema={...} values={...} onChange={...} />` reads the **existing**
`schema` object from generator/distortion defs (`src/generators/types.ts`) and renders
native controls. Mapping:

| Schema field | Control |
|---|---|
| number with min/max | slider + mono value field (type to set) |
| number unbounded | drag-scrub field (horizontal drag), unit suffix `mm`/`°`/`px` |
| boolean | toggle switch |
| options / select | segmented control (≤4 options) or dropdown |
| color | swatch + popover picker |
| string | text input / multiline (for specs text) |
| group / folder | collapsible section header |

All numeric values render in mono. Inspector header shows selected node name +
description. Every control has a visible label (no placeholder-only labels). This is
the Leva replacement; `schema` shape stays source-compatible so generators barely change.

### GeneratorGallery
Triggered from the SourceNode. Full-height slide-over.
- Grid of cards, **each with a live mini-preview** — run `generate()` at low-res with
  the generator's defaults, render to a small canvas/SVG, **cache** the result.
- **Text search** (name + group), grouping by category
  (Import / Pen Plotter / Pattern / Layout / Laser).
- Keyboard: type-to-filter, ↑↓ navigate, Enter select, Esc close.
- Selecting calls `setGenerator(id)`.

### Console
Output stage. Left→right: geometry stats (lines · points · est. plot time · est. file
size) → dedupe / join toggles (inline labels + tooltips) → SVG · G-code · Share · Plot.
`▸ Plot` opens the MachineDrawer.

### MachineDrawer
Slides up over the console. Tabs: **GRBL / Laser** and **AxiDraw** — reuse existing
`PlotterPanel` / `AxiDrawPanel` *logic* (connection refs, polling, plot/abort),
re-skinned as a CNC-style console: connection-status LED, jog, pen up/down, set origin,
feed rate, plot / plot-by-color, progress bar.

---

## State (Zustand)

Keep the store shape; add one field:
- `selectedNodeId: string` — `"source"` or a layer `uid`. Drives the Inspector.

Existing actions (`setGenerator`, `setSeed`, `randomSeed`, `addLayer`, `removeLayer`,
`toggleLayer`, `moveLayer`, `setLayerParams`, `setMotif`, `hydrate`, …) are retained.
`setGenerator` also sets `selectedNodeId = "source"`; `addLayer` selects the new layer.

---

## Data Flow

Unchanged math pipeline:

```
baseArt = gen.generate(baseParams, seed, canvas)
for layer in layers (in order, if enabled):
    art = dist.apply(art, layerParams, seed + hashUid(layer.uid))
currentArtwork = art   → CanvasPreview + Console stats + MachineDrawer
```

The Stage memoizes on (params, seed, canvas, layers) as today. Selection
(`selectedNodeId`) only affects which control set the Inspector shows — it does **not**
re-run generation.

---

## Aesthetic & Design Tokens (CAD / technical)

Replace the warm-paper palette with cool-neutral, hairline-precise, mono-data.
Charcoal chrome + bright canvas (the work is the hero; matches the Fusion/LightBurn
ecosystem where the exported SVGs land).

```
--bg-chrome   #11151b      panel base (cool charcoal)
--bg-panel    #161b22      raised panel
--bg-canvas   #f7f8fa      the plotter "bed" (stays bright)
--line        #2a313b      1px hairlines
--text        #e6e9ee      primary    /  --text-muted #8b95a3
--accent      #f97316      laser-orange: selection, active node, primary CTA
--ok          #3fb950      machine connected / go
--err         #f85149      stop / error
spacing: 8px base grid   radius: 4px   borders: 1px hairline
z-index scale: 10 (raised) · 20 (drawer) · 30 (gallery) · 50 (toasts)
```

- **Type:** UI labels in a technical grotesque (Space Grotesk; fallback to existing
  Outfit). **All numbers/data in JetBrains Mono** (already self-hosted).
- **Canvas:** refined plotter-bed dot grid; optional rulers + live coordinate readout.
- Tokens defined once as CSS custom properties + a small TS token map; **no inline
  style objects** for anything themeable.

> Open knob: charcoal vs. light chrome is a single token flip if the render reads wrong.
> Final aesthetic verdict is taken at render time by Nikolai.

---

## What Changes in Code

**Keep untouched:** `src/generators/*`, `src/distortions/*`, `src/generators/layout/kit.ts`,
render-pipeline math, SVG / G-code export, the Pi/AxiDraw bridge, plotter/axidraw
connection logic.

**Replace:** the entire `src/ui/*` presentation layer + `src/index.css` →
`TopBar`, `PipelineRail` (`SourceNode`, `LayerNode`), `Inspector` + `SchemaControls`,
`GeneratorGallery`, `Console`, `MachineDrawer`, plus a design-token system. Remove the
`leva` dependency and its `!important` overrides.

**Add to store:** `selectedNodeId`.

**Cleanup riding along (low-risk only):** make `motif` a parameter passed into
`generate()` rather than a `useApp.getState().motif` read inside generators, so
generators stay pure. If this proves more than a small change, **defer** it to a
follow-up — it is not required for the UI redesign.

---

## Risks / Mitigations

- **Live gallery previews cost CPU** → render at low res, on gallery open, cache by
  generator id; never block the main render loop.
- **Drag-scrub + drag-reorder pointer handling** → encapsulate in small reusable hooks;
  respect `prefers-reduced-motion`.
- **SchemaControls must cover every schema variant** in current defs → audit all
  generator/distortion schemas during planning; the renderer must handle each type
  already in use (no regressions vs. Leva).
- **Removing Leva** could drop a control type silently → enumerate Leva control types
  in use before deleting; add explicit mappings.

## Success Criteria

- Switch generators via searchable, preview-driven gallery (no blind modal list).
- Tune every existing parameter through custom CAD controls (parity with Leva, no
  missing control types).
- Add / reorder (drag) / toggle / remove distortion layers from the pipeline rail.
- Export SVG + G-code and plot via GRBL and AxiDraw unchanged.
- Zero `leva` imports; one cohesive token-driven design language; no themeable inline
  styles.
