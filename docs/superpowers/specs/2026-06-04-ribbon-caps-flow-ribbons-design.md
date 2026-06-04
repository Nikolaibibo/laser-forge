# Ribbon End Caps + Variable Band Width + Flow Ribbons — Design

**Date:** 2026-06-04
**Status:** Approved (Nikolai: "Volles Paket", 04.06.2026)
**Reference:** plotterpen Instagram piece — organic flowing ribbon bands, nested
semicircular end caps, variable band widths, over/under occlusion, wide pen.

## Gap analysis

We already have parallel lanes (`offsetPath`), z-order occlusion (`occlude`),
and organic warping (Noise Warp + Chaikin layers). Missing vs the reference:

1. **Closed band ends** — our lanes end frayed-open; the reference closes each
   band tip with nested semicircular caps (lane i joins lane K−1−i).
2. **Natively organic centerlines** — pipes are grid-locked, loops are straight
   serpentines.
3. **Variable band width** — `lanes` is global; the reference mixes 3-wide and
   7-wide bands.

## Part 1 — `offsetBand` with nested end caps (`util/offset.ts`)

New `offsetBand(center, k, spacingMm, opts)`:

- Computes lanes via existing `offsetPath` + `symmetricOffsets`.
- With `endCaps: true` and an **open** centerline, symmetric lane pairs
  (+o / −o) are fused into one geometrically closed ring:
  `laneA → end cap → reversed laneB → start cap → back to laneA[0]`.
  Caps are semicircles centred on the centerline endpoint:
  `C + (n̂·cosθ + t̂·sinθ)·o`, θ ∈ [0, π], t̂ = outward end tangent.
  Odd k leaves the middle (offset-0) lane as a plain open line.
- Rings are emitted with `closed: false` and an explicit repeated first point —
  geometrically closed, no SVG `Z` semantics needed, and `occlude`'s
  densify-and-cut keeps working unchanged.
- `closed: true` centerlines (merged pipe loops) have no ends → plain lanes.
- Side effect: pen lifts per band drop from k to ⌈k/2⌉.

Wired into **pipes**, **loops**, **text** via a new `endCaps` boolean param
(+ `capSamples` where not present). Default **true** — old share links gain
caps but keep identical lane geometry.

## Part 2 — Variable band width (pipes)

- `lanes` is replaced by `lanesMin` / `lanesMax` (defaults **6/6** → default look
  unchanged; try 4/10 for the reference vibe). Each merged pipe draws its lane
  count from the seeded rng. Cell size derives from `lanesMax`.
- `occlude` gains per-item band width: `OcclItem.bandHalfMm?` overrides the
  global `opts.bandHalfMm`, so a wide pipe carves a wide gap and a narrow pipe
  a narrow one. Grid cell size uses the maximum clear radius.
- Backward compat: when `lanesMin === lanesMax` (the default) no extra rng draw
  happens, so the entire rng sequence — field, colors, z-order — matches previous
  builds exactly. Verified: defaults with `endCaps=false` render byte-identical
  to the pre-change output. Only a spread (`lanesMin < lanesMax`) reshuffles z.

## Part 3 — Flow Ribbons generator (`generators/ribbons.ts`)

The reference look natively: few, fat, meandering ribbons.

- Centerlines: simplex-noise angle field (same `makeNoise2D` as Flow Field),
  integrated at `stepMm` with **two key differences** vs Flow Field:
  - **Turn-radius clamp**: per-step heading change limited to
    `stepMm / rMin`, with `rMin = bandHalf + laneSpacingMm` — inner lanes can
    never collapse at tight bends.
  - **Per-ribbon angle phase** (seeded random rotation of the field): streamlines
    of one shared field never cross; the phase makes ribbons weave so occlusion
    has work to do.
- Per ribbon: seeded length in `[lenMinMm, lenMaxMm]`, lane count in
  `[lanesMin, lanesMax]`, band via `offsetBand` (caps on), occlusion with
  per-item band width. Centerlines are traced **bidirectionally** from the seed
  (half length each way, backward = field + π) so seeds near the margin don't
  produce stubs. Seeds keep `minSeedSepMm` distance; ribbons stop at the margin.
  Self-crossings of a single ribbon get no occlusion (same z) — documented edge
  case, same as pipes.
- Palette params identical to pipes (`colorCount`, `color1…6`, `colorFraction`,
  `colorStrategy`) — default `colorFraction` 0 (monochrome, like the reference).
- Defaults tuned for a wide felt-tip: `laneSpacingMm` 1.0, `lanesMin` 3,
  `lanesMax` 7, `count` 14, `occlusionGapMm` 1.2.

## Out of scope (YAGNI)

Taper (lane count shrinking along a ribbon), self-occlusion within one ribbon,
hatching/fills, pressure simulation.

## Verification

- `npm run typecheck` clean.
- Determinism: render twice per generator → byte-identical SVG.
- Pipes defaults: lane geometry byte-stable vs pre-change except added caps and
  reshuffled z (documented above).
- Visual: PNG renders — pipes with caps + variable width, ribbons mono wide-pen,
  ribbons colored; pen 0.3 vs 1.5.
