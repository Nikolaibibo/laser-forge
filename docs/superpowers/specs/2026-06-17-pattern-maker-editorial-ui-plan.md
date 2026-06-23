# Pattern Maker + Editorial Studio UI — Plan

Date: 2026-06-17
Status: plan (pre-spec). Source of inspiration: Applied Craft "Line & Form"
(https://appliedcraft.com/lineandform/) — same generator+modifier pipeline
architecture as Laser Forge, wider library. This plan adopts two ideas: a
**Pattern Maker** generator (content) and an **Editorial Studio** re-skin (UI).

---

## Context — Line & Form vs. Laser Forge

Line & Form is architecturally identical to us: a "Make" menu (generators) +
"Modifier" menu (our distortions), chained into a pipeline, exporting SVG +
G-code. Its library is wider, across categories: Image (linework/halftone/
squiggle), Geometry/Pattern (pattern maker, moiré, ripples, orbital weave,
gravity fields, lens, surface warp), Mesh/3D (depth map, topography/STL,
polyhedron, shadow solid), and Geospatial (Leaflet map → linework).

We already match much of its geometry tier (spirograph, voronoi, flowField,
harmonograph, superformula, truchet, differentialGrowth, lSystem, ribbons,
loops, pipes, folds, blueprint+motif import) and we have something it likely
lacks: **live WebSerial GRBL streaming** (plot from the browser, not just
export).

### Gap analysis (full, for later phases)

Tier 1 — high wow, plotter-native, reuses our utils:
1. Image → Linework pipeline (halftone / TSP squiggle / edge-trace / image-flow-field)
2. **Pattern Maker** ← chosen first
3. Multi-color ink layers (we have per-polyline `stroke` + `penSplit`; needs a layer-color model + pen-change pause in G-code)

Tier 2 — bigger lifts:
4. Geospatial map → linework (Leaflet + OSM)
5. 3D / mesh → lines (depth map / topography / STL contour)
6. Document + snapshot + gallery management UX

Tier 3 — infra polish:
7. G-code machine profiles (presets per device)

Decisions (2026-06-17): lead feature = **Pattern Maker**; UI direction =
**Editorial Studio** (light, paper-forward, type-forward).

---

## Part 1 — Pattern Maker (content)

### What it is
A generator that takes a source motif (imported SVG, or a built-in fallback
shape) and **tiles/arrays it** across the canvas in three layouts — Grid,
Radial, Spiral — with per-tile rotation, scale, jitter and color. Collapses
Line & Form's "Pattern Maker / Pattern Linear–Radial–Spiral" cluster into one
generator with a `mode` switch.

### Why it's cheap
The hard parts already exist:
- `parseSvgMotif()` → `{polylines, widthMm, heightMm}` (`src/util/svgImport.ts`)
- `motif` store slot + `MotifPanel` upload UI (`src/state/store.ts`, `src/ui/MotifPanel.tsx`)
- `fitToCanvas` / `polylineBounds` to normalize a motif into a unit cell (`src/util/path.ts`)
- `random.ts` seeded RNG for deterministic jitter
- `GeneratorDef` + Leva schema + registry + URL-sync plumbing

Pattern Maker = "normalize motif to a unit cell → for each slot in the layout,
place a transformed copy." Mostly transform math on existing primitives.
`blueprint` already does motif-in-store + fit-to-cell; this generalizes it.

### Generator design — `src/generators/patternMaker.ts`
```
id: "pattern-maker", name: "Pattern Maker"
generate(params, seed, canvas) => Artwork
```

Params (Leva schema):
- `mode`: `"grid" | "radial" | "spiral"`
- `cellScale`: motif size as fraction of cell
- Grid: `cols`, `rows`, `spacingMm` (or auto-fit), `brickOffset` (0–1 row stagger)
- Radial: `rings`, `perRing` (or auto by circumference), `innerRadiusMm`, `ringSpacingMm`, `faceCenter` (rotate copy toward/away from center)
- Spiral: `count`, `spiralType` (`archimedean | golden`), `spacing`/`turns`, `scaleFalloff` (shrink toward center)
- Common variation (all seeded): `rotationStep` (incremental °/tile), `rotationJitter`, `scaleJitter`, `posJitterMm`
- `colorBy`: `none | index | ring | random` → assigns `Polyline.stroke` from a small palette (sets up the future ink-layer feature)
- `clipToCanvas`: drop/clip tiles outside the page

Key behaviors:
- **No-motif fallback:** ship a built-in default motif (simple leaf/cross/asterisk as inline polylines) so it renders immediately on boot (same UX lesson as flow-field default).
- **Purity caveat** matches `blueprint`: reads `motif` from store (documented "only impurity"). Same motif + params + seed → identical output.
- Generalize the `MotifPanel` gate: today `if (generatorId !== "blueprint") return null` → `MOTIF_CONSUMERS = new Set(["blueprint", "pattern-maker"])`.

Tests — `scripts/pattern-maker-test.mjs` (tsx, repo convention):
- Grid mode emits exactly `cols*rows` motif copies (× polylines/motif)
- `clipToCanvas` keeps all points within `[0,wMm]×[0,hMm]`
- Same seed → identical output; different seed only moves jittered fields
- Radial `faceCenter` orientation check on a known motif

Touch list: `src/generators/patternMaker.ts` (new), `src/generators/registry.ts`
(+1 import, new "Pattern" group or into "Pen Plotter"), `src/ui/MotifPanel.tsx`
(gate set), `scripts/pattern-maker-test.mjs` (new). Zero changes to
render/export/plotter — it only produces an `Artwork`.

### Workflow
Same path that built `blueprint` and the PDF-overlay backend: brainstorming →
short spec in `docs/superpowers/specs/2026-06-17-pattern-maker-design.md` →
writing-plans → subagent-driven build with the test script as the gate.
Estimate: one focused session.

---

## Part 2 — Editorial Studio UI (re-skin)

Current UI is dark workshop chrome (`#1d1d1b` panels, mono-ish labels).
Editorial Studio flips it to a gallery/print feel. Cleanest path: a
**theme-token layer** first, then restyle — no logic churn.

### Direction
- Light, paper-forward. Off-white app bg (`#f6f4ef`); preview mounted as an
  actual sheet of paper centered on a soft mat with a drop shadow — artwork
  *looks framed*.
- Type-forward. Display serif for document title + section headers (screen
  webfont, e.g. Fraunces/Spectral — TBD); clean grotesk/mono for control values.
- Quiet chrome. Single slim, collapsible control column with whitespace;
  format chips (A5/A4/A3 · portrait/landscape) as a row, not a dropdown.

```
┌──────────────────────────────────────────────────────────┐
│  Pattern Study No. 3            [A5][A4][A3] ▢▭   ⤓ Export │
├───────────────┬──────────────────────────────────────────┤
│  MAKE         │                                            │
│  ▸ Pattern    │            ░░░░░░░░░░░░░░░░░                │
│    Maker      │          ░░  ▦ ▦ ▦ ▦ ▦  ░░               │
│               │          ░░  ▦ ▦ ▦ ▦ ▦  ░░               │
│  Mode  ◉grid  │          ░░  ▦ ▦ ▦ ▦ ▦  ░░               │
│  Cols   5     │            ░░░░░░░░░░░░░░░░░                │
│  Rows   7     │                                            │
│  …            │                                            │
│  + Modifier   │                                            │
└───────────────┴──────────────────────────────────────────┘
```

### How (low-risk, incremental)
1. **Token layer:** lift hardcoded colors into CSS custom properties
   (`--surface`, `--ink`, `--accent`, `--paper`…). Define a `light-editorial`
   theme. This alone is most of the visual shift.
2. **Preview as paper:** wrap `CanvasPreview` in a mat + sheet frame (centered,
   `box-shadow`). SVG already knows mm dims → sheet renders true-to-format.
3. **Restyle the four UI components** (`ParamPanel`, `GeneratorPicker`,
   `LayerStack`/`LayerControls`, `ExportBar`) against tokens; collapse picker
   into inline "Make / Modifier" affordance.
4. **Webfont** for title/headers; control labels stay mono.
5. Leave plotter/serial logic untouched — `PlotterPanel` inherits the theme.

Keeping the old dark theme behind the same tokens gives a free theme toggle later.

---

## Recommended order
1. Pattern Maker generator (content, testable in isolation, no UI dependency)
2. Token layer + paper preview (80/20 of the Editorial look)
3. Component restyle + webfont (polish)

## Open questions before build
- Write the Pattern Maker spec doc next (then plan → build), or react to this plan first?
- Editorial webfont preference (Fraunces / Spectral / Brand-Uni pick), or pick-and-judge-the-render?
