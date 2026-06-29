# Schraffur (Hatch Fill) — Design

**Date:** 2026-06-29
**Status:** Approved (design), pending implementation plan
**Scope:** One new distortion + one pure util + registry line. Single implementation plan.

## Goal

Fill **closed** shapes with hatch lines so the plotter can render solid/shaded
areas instead of bare outlines. Works on any generator that emits closed
polylines and on imported SVGs (which already arrive as `closed: true`
polylines via `svgImport.ts`).

## Decisions (locked during brainstorming)

1. **Source = geometry-fill distortion**, not an image-tonal generator. Plugs
   into the existing distortion pipeline (`base → distortion 1 → 2 → …`).
2. **Single-contour even-odd** fill for v1. Each closed polyline is filled on
   its own (even-odd handles concave shapes correctly). Holes formed by
   *separate* contours (logo/text counters, e.g. the inside of an "O") are
   **not** subtracted in v1 — they get overdrawn. Containment-grouping for
   true holes is a noted future extension.
3. **Boustrophedon linking** — alternate scanline direction and connect ends so
   each shape fills in (mostly) one continuous stroke. Far fewer pen lifts,
   faster, no entry/exit dots. The linking lives inside the hatch core
   (the Path Join distortion can't help — parallel hatch lines share no
   endpoints).
4. **Cross-hatch 1–3 layers** — fill repeatedly at offset angles for tonal
   range (sparse single direction = light, dense cross-hatch = near-black).

## Approach

A thin `hatch` `DistortionDef` backed by a pure `src/util/hatch.ts` core —
exactly mirroring `pathJoin` (thin distortion) + `mergePaths` (pure util).

The existing private `hatch()` inside `voronoiMoire.ts` is **left untouched**:
it is a convex-inset/phase variant tuned for that generator, and merging it onto
the general core would risk a behavior change for no v1 benefit. A later cleanup
to share the core is possible but out of scope here.

Rejected alternatives:
- **Bake hatch into each generator** — no composition, N wiring sites, misses
  imported SVGs.
- **Also refactor `voronoiMoire` onto the shared core** — unrelated risk for v1.

## Components

### 1. `src/util/hatch.ts` (pure geometry, no deps)

```
hatchPolygon(poly: Point[], angleDeg: number, spacingMm: number,
             opts?: { insetMm?: number }) → Polyline[]
```

- Rotate the contour so the hatch direction is horizontal, run scanlines at
  `spacingMm`, rotate the resulting segments back (same technique as the
  `voronoiMoire` scanline).
- **Even-odd** per scanline: sort the x-crossings, pair them `(0,1) (2,3) …`
  so concave shapes fill correctly and self-intersections resolve by parity.
- **Boustrophedon**: reverse every other scanline's spans, then link the end of
  one span to the start of the next when their x-ranges overlap; start a **new**
  output polyline when there is no overlapping span on the next scanline (a
  genuine gap, e.g. across the waist of a concave shape).
- `insetMm` (optional): offset the contour inward before scanning so fill lines
  don't kiss the boundary. v1 may implement this as a simple centroid-directed
  inset or be deferred; it is the one droppable nice-to-have.
- Returns plottable `Polyline[]` (open, `closed: false`).

### 2. `src/distortions/hatch.ts` (`DistortionDef<Params>`)

For each polyline in the artwork:
- **Open or degenerate** (`!closed`, `< 3 points`, ~0 area) → pass through
  unchanged (same contract as Path Join).
- **Closed** → emit:
  - the original outline iff `keepOutline` (preserving its `stroke`), plus
  - for each layer `i` in `0..layers-1`: `hatchPolygon(poly, angleDeg +
    i*angleStepDeg, spacingMm, { insetMm })`, with each fill polyline inheriting
    the shape's `stroke`.

```ts
type Params = {
  spacingMm: number;      // line gap = tone lever
  angleDeg: number;       // base direction
  layers: number;         // 1–3 cross-hatch passes
  angleStepDeg: number;   // angle between layers
  keepOutline: boolean;   // also draw the boundary
  insetMm: number;        // pull fill in from the edge
};
```

| param | range | default |
|-------|-------|---------|
| `spacingMm` | 0.3–5 | 1.2 |
| `angleDeg` | 0–180 | 45 |
| `layers` | 1–3 | 1 |
| `angleStepDeg` | 15–90 | 90 |
| `keepOutline` | bool | true |
| `insetMm` | 0–3 | 0 |

### 3. `src/distortions/registry.ts`

Append `hatch` to `DISTORTIONS`.

## Data flow

```
base generator → … → Hatch distortion → svgExport → plot
                       │
                       └─ closed poly → outline (opt) + N layers of
                                        boustrophedon-linked fill lines
```

Cross-hatch layers share the shape's pen (single pen). **Future extension:**
give each layer a distinct `stroke` so the existing `splitByStroke` +
"Plot je Farbe" path plots layers in different pens for free — out of scope for
v1.

## Edge cases

- Open polylines → unchanged.
- `< 3` points or ~0 area → unchanged, no fill.
- `spacingMm ≤ 0` → clamp to a small positive minimum (no infinite loop).
- Concave contour → even-odd yields multiple spans per scanline; boustrophedon
  links overlapping spans and lifts (new polyline) across genuine gaps.
- Self-intersecting contour → handled by even-odd parity.
- Very dense spacing on a large shape → many points; acceptable, noted as a
  perf consideration, not guarded in v1.

## Testing

Unit tests in the repo style (cf. patternMaker):
- Square (convex): expected span count for a given spacing/angle.
- C-shape (concave): multi-span per scanline, correct gap handling.
- Rotated angle: fill direction matches `angleDeg`.
- `layers`: 1/2/3 produce the expected number of angle passes.
- **Boustrophedon continuity**: consecutive fill points within a run are
  actually connected (no spurious lifts where spans overlap).
- Spacing → span-count monotonicity.
- One visual sample render for eyeball verification.

`voronoiMoire` is untouched → no regression surface there.

## Out of scope (future)

- True holes via containment-grouping (counters of "O", rings, donuts).
- Image-tonal hatch generator (engraving look) — separate generator, separate
  spec.
- Multi-pen-per-layer cross-hatch (distinct stroke per layer).
- Sharing the core with `voronoiMoire`.
