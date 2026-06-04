---
tags: [generative-art, plotter, spec, claude-code]
status: spec
created: 2026-06-04
supersedes: ~/Downloads/SPEC.md (hallucinated Scene/Lane/Band core)
---

# SPEC — Neue Generatoren (stripped, code-grounded)

Ersetzt `~/Downloads/SPEC.md`. Die alte SPEC war gegen einen **erfundenen Codebase**
geschrieben (`Scene`/`Lane`/`Band`, `mulberry32`, `sceneToSVG`). Nichts davon existiert.
Dieser Brief mappt nur das **genuinely Neue** auf den echten Vertrag.

## Echter Vertrag (NICHT neu bauen)

```ts
// src/generators/types.ts
type Point = [number, number];
type Polyline = { points: Point[]; closed: boolean; stroke?: string };
type Artwork  = { polylines: Polyline[]; widthMm: number; heightMm: number };
type Canvas   = { wMm: number; hMm: number };
type GeneratorDef<P> = { id; name; description; defaults: P; schema: Schema /*leva*/;
                         generate: (p: P, seed: number, canvas: Canvas) => Artwork };
type DistortionDef<P> = { ...; apply: (a: Artwork, p: P, seed: number) => Artwork };
```

- RNG: `makeRng(seed)` (Alea) in `util/random.ts` — **nie** `Math.random`. Gleicher Seed → identisch.
- `util/offset.ts`: `offsetPath(center, offsets, opts): Polyline[]`, `symmetricOffsets(k, s)` — **existiert**.
- `util/mergePaths.ts`: `mergePaths(polylines, tol)` = das „joinLanes" der alten SPEC — **existiert**.
- `util/path.ts`: `fitToCanvas`, `simplify`, `polylineBounds`, `dist`.
- `render/svgExport.ts`: `svgExport(art, {dedupe, join})` — eine `<path>` pro Polyline, stroke-only,
  `stroke` Attribut pro farbiger Linie. **existiert**.
- Registry: `generators/registry.ts` (`GENERATORS[]`, `byId`), `distortions/registry.ts`.
- Plotter-Pipeline (gcode/grbl/penSplit/webserial) — **existiert**, kein Core-Thema.

## Schon erledigt (war in der alten SPEC, ist gebaut)

| Alt-SPEC | Status |
|---|---|
| §3.1 offsetPath, §3.2 joinLanes | ✅ `util/offset.ts`, `util/mergePaths.ts` |
| §4 Generator A Truchet | ✅ `generators/truchet.ts` + separat `pipes.ts` (wang+classic) |
| §5 Generator B Meander | ✅ `generators/meander.ts` (ästhetisch verworfen, aus Picker) |
| §6 Generator C Loops | ✅ `generators/loops.ts` |
| §9 Export/Plotter | ✅ `plotter/*`, `render/svgExport.ts` |

## Leitplanken

- Kein React/DOM im Core, keine neuen Runtime-npm-Deps. Einheit mm. API additiv.
- Pure Functions, deterministisch über `seed`/`makeRng`. Jeder Generator liefert gültige `Artwork`.
- `minTurnRadius` ≥ Bandbreite/2 (Servo/Riemen-Artefakte vermeiden, weiche Ecken).

---

## NEU 1 — Okklusion + Tiefe für `pipes`  *(Referenz Bild #2)*

Der Über/Unter-Pipe-Look: höher liegende Pipes carven eine `gap`-Lücke in tiefer liegende.

- `util/occlusion.ts` (pure, kein RNG):
  `occlude(items: { z: number; centerline: Point[]; lanes: Polyline[] }[], opts: { gapMm; bandHalfMm }): Polyline[]`
  - Ein Punkt einer Lane ist verdeckt, wenn sein Abstand zur **Centerline einer Pipe mit höherem z**
    `< (bandHalfMm + gapMm)` ist. Lanes an verdeckten Stellen in sichtbare Teil-Polylines splitten.
    `stroke` bleibt erhalten.
- `pipes.ts` additive Params:
  - `occlusion: boolean` (default true), `occlusionGapMm: number` (default ~1.0).
  - `colorStrategy: "random" | "largestFirst"` — `largestFirst`: Komponenten nach Σ Lane-Länge sortiert,
    die `colorFraction`-Spitze bekommt Palette-Farben (deterministisch statt `rng()<colorFraction`).
  - z je Komponente seeded (random). Reihenfolge: occlude **vor** finalem Flatten/fit.
- **Akzeptanz:** an Kreuzungen sauberer `gapMm`-Spalt (drüber/drunter); deterministisch je Seed;
  reine Bögen kreuzen nie → bleiben unberührt; `colorStrategy:largestFirst` färbt die längsten Pipes.

## NEU 2 — Generator `folds`  *(eigene Pipeline, Tiefe aus Liniendichte)*

`generators/folds.ts`, `generate(p, seed, canvas): Artwork`. Nutzt **nicht** offsetPath.

1. Feines Gitter `gridU × gridV` im Parameterraum.
2. Facettiertes Höhenfeld `z=f(u,v)` (quantisiertes simplex-noise → scharfe „Blöcke"/Crease).
3. Projektion 3D→2D, feste Kamera (`azimuth`, `elevation`, optional leichte Perspektive).
4. **Floating-Horizon** Hidden-Line (front-to-back, pro Spalte oberste Kante = Horizont, nur Teile darüber zeichnen).
5. Sichtbare Gitter-Segmente als Polylines (eine Farbebene).
- Params: `seed, gridU, gridV, heightField{type,params}, amplitude, featureSize, facetQuant,
  azimuth, elevation, perspective, marginMm, color`.
- **Akzeptanz:** Relief-/Falt-Illusion mit korrekter Verdeckung; einfarbig; deterministisch.

## NEU 3 — Generator `text`  *(Referenz Bild #1)*

`generators/text.ts`, `generate(p, seed, canvas): Artwork`.

- Mittellinien aus **Single-Stroke-Hershey-Glyphen** (Hershey-Vektordaten als vendored `*.ts`,
  kein npm-Dep — keine Outline-Fonts).
- `joinStrokes`: Buchstaben-/Wortstriche zu durchgehenden Bändern mit Haarnadel-Kehren verketten → konzentrische U-Turns.
- Über `offsetPath` → K-Spur-Band. Default einfarbig, `colorFraction` optional.
- Params: `seed, text, fontSizeMm, letterSpacing, lineSpacing, lanes, laneSpacingMm,
  minTurnRadiusMm, joinStrokes, flattenTolMm, marginMm, palette, colorFraction`.
- **Akzeptanz:** ein Wort als fließendes Offset-Band-Lettering wie Referenz; einfarbig, ohne Registrierung.

---

## Verifikation (für ALLE)

- **Determinismus:** gleicher Seed → identisches SVG (String-Vergleich).
- **Struktur:** `generate*` liefert gültige `Artwork`; `svgExport` unverändert nutzbar.
- **Visuell (einziger menschlicher Checkpoint):** Demo → SVG → PNG (`rsvg-convert`) rendern,
  Nikolai gibt Optik-Urteil. Funktionale Korrektheit verifiziert Claude selbst.

## Reihenfolge

1. Okklusion+Tiefe pipes (Bild #2) ← Start
2. Folds
3. Text/Hershey (Bild #1)
