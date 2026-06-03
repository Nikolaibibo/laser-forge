# Truchet Pipes — Design Spec

**Datum:** 2026-06-03
**Status:** Design approved (User-Go), Spec-Review inline erledigt
**Scope:** Ein neuer Generator im plotterpen-Stil (Referenz: Instagram @plotterpen, „tweak the Python script"-Bild): ein **Truchet-Kachelfeld**, dessen durchgehende Pipes als dichte Parallel-Bänder gerendert werden, lange gerade Strecken + saubere 90°-Kehren, Farbe pro zusammenhängender Pipe.

> **Warum:** Der zuerst gebaute `meander`-Generator (selbst-meidender Zell-Walk) staircased und liefert keine geraden Strecken — falsche Ästhetik. Die Band-Engine (`offsetPath`) stimmt; nur die Centerline-Erzeugung muss ein Kachelfeld mit langen Geraden sein. Diese Spec ersetzt den Mäander-Ansatz für diese Ästhetik.

## Kontext (echter Ist-Zustand)

- Typen (`src/generators/types.ts`): `Point = [number, number]`, `Polyline = { points: Point[]; closed: boolean }`, `Artwork = { polylines: Polyline[]; widthMm; heightMm }`, `Canvas = { wMm; hMm }`, `GeneratorDef.generate(params, seed, canvas) → Artwork`.
- `src/util/offset.ts` (bereits gebaut): `offsetPath(center, offsets, opts) → Polyline[]`, `symmetricOffsets(k, spacing)`. Versetzt eine **offene** Centerline in K parallele Spuren, miter-limitiert.
- `src/util/path.ts`: `fitToCanvas(lines, wMm, hMm, marginMm)`.
- RNG ausschließlich `makeRng(seed)` (alea) aus `src/util/random.ts` + Helfer `pick(rng, arr)`. Nie `Math.random`.
- `src/generators/registry.ts`: GENERATORS-Array; UI bindet automatisch.
- `src/render/CanvasPreview.tsx`: zeichnet mono `#111`. `src/render/svgExport.ts`: mono schwarzer Stroke.
- Vorhandenes `src/generators/truchet.ts` (smith-arcs/diagonals): konzeptioneller Vorläufer, wird **nicht** verändert; `pipes` ist ein eigener, reichhaltigerer Generator.
- Tests: tsx-Scripts unter `scripts/`, `npx tsx scripts/<name>.mjs`, kein Framework.

## Leitplanken

- mm-Einheit · `makeRng(seed)` only · `fitToCanvas` am Ende · pure Hilfsfunktionen.
- **Additiv:** `Polyline.stroke?` ist optional — alles ohne `stroke` bleibt mono/bitidentisch.
- Kein neues Test-/Build-Framework, keine neuen Runtime-Deps.

## Architektur

### Kachel-Modell (Kontinuität gratis)

Gitter `cols × rows`. Jede Zelle hat vier **Kantenmittelpunkt-Knoten** (N, O, S, W). Benachbarte Zellen teilen sich den Knoten an der gemeinsamen Kante (N von Zelle (x,y) == S von (x,y−1)). **Jede Kachel verbindet alle vier ihrer Kantenmittelpunkte**, gepaart zu zwei Strichen → jeder geteilte innere Knoten hat **Grad 2** → das Feld zerfällt in durchgehende Ketten (offen am Rand) und geschlossene Schleifen.

Drei Kacheltypen (Auswahl per `rng`, gewichtet über `straightness`):
- **`arcA`:** Viertelbogen N–O (Zentrum NO-Ecke) + Viertelbogen S–W (Zentrum SW-Ecke).
- **`arcB`:** Viertelbogen N–W (Zentrum NW-Ecke) + Viertelbogen S–O (Zentrum SO-Ecke).
- **`cross`:** Gerade N–S + Gerade O–W (zwei **getrennte** Striche, kreuzen ohne zu verbinden).

`P(cross) = straightness`; sonst `arcA`/`arcB` je 50%. Viele `cross` nebeneinander → lange Geraden; ein `arc` lenkt die Pipe um 90° ab. Bogen-Tangente am Kantenmittelpunkt = senkrecht zum Radius = parallel zur dort anschließenden Geraden → **nahtlos**. `cross`-Kacheln erzeugen die Über-/Unter-Kreuzungen.

Bögen werden mit `arcSamples` Stützpunkten gesampelt (elliptisch bei nicht-quadratischen Zellen, wie `truchet.ts`).

### Component-Tracing

- Knoten kanonisch keyen (Halbgitter: horizontale Kanten bei `(col+0.5, row)`, vertikale bei `(col, row+0.5)`).
- Adjazenz: Knoten → Liste von (Strich-Polyline, anderer Knoten).
- Grad-2-Ketten verfolgen: an Grad-1-Knoten (Rand) starten → offene Pipe; übrige Grad-2-Zyklen → geschlossene Schleife.
- Ergebnis: je Component **eine** Centerline (Polyline der aneinandergehängten Strich-Stützpunkte).

### Band + Farbe

- Jede Component-Centerline → `offsetPath(center, symmetricOffsets(lanes, laneSpacingMm), { minInnerRadiusMm: laneSpacingMm })` → K Spuren.
- **Geschlossene Schleifen:** an einem Punkt aufschneiden, als offene Polylinie offsetten (YAGNI; 0,1 mm-Spalt unsichtbar).
- **Farbe pro Component:** mit Wahrscheinlichkeit `colorFraction` eine Palette-Farbe (zyklisch; optional größte Components zuerst), sonst Default (grau/undefined). Setzt `stroke` auf alle Band-Polylinien der Component.
- Alle Polylinien sammeln → `fitToCanvas` → `Artwork`.

### Minimale Farb-Infra (damit sichtbar)

- `src/generators/types.ts`: `Polyline.stroke?: string` (optional, additiv).
- `src/render/CanvasPreview.tsx`: `ctx.strokeStyle = line.stroke ?? "#111"` pro Polylinie.
- `src/render/svgExport.ts`: pro `<path>` ein `stroke="…"`-Attribut, **wenn** `line.stroke` gesetzt; sonst unverändert (erbt globales Schwarz). Reicht für farbige PNG-/Browser-Vorschau.

### Parameter

```ts
type PipesParams = {
  cols: number;            // Gitterspalten
  rows: number;            // Gitterzeilen
  lanes: number;           // K Spuren pro Pipe (~5–8)
  laneSpacingMm: number;   // s
  straightness: number;    // 0..1 Anteil Kreuz-Kacheln (höher = längere Geraden)
  colorFraction: number;   // 0..1 Anteil farbiger Components
  arcSamples: number;      // Bogen-Glättung
  marginMm: number;
};
```
Palette: feste Default-Konstante im Generator (z.B. `["#e0584f", "#4f86e0", "#5fcaa8"]`, Default-Pipes grau `#9a9a9a`). DEFAULTS-Vorschlag: `cols 14, rows 18, lanes 6, laneSpacingMm 0.7, straightness 0.55, colorFraction 0.35, arcSamples 14, marginMm 15`.

## Verifikation

- **Kontinuität:** jeder *innere* Kantenmittelpunkt hat Grad 2 (Strich-Endpunkt-Zählung).
- **Determinismus:** gleicher Seed → identisches Artwork (`JSON.stringify`-Vergleich); anderer Seed → anders.
- **Tracing:** Σ Component-Längen plausibel; keine degenerierten (<2 Punkte) Polylinien.
- **In-bounds:** alle Punkte in `[margin, size−margin]` (±1).
- **Farbe:** bei `colorFraction = 0` trägt keine Polylinie `stroke`; bei `> 0` tragen ~`round(colorFraction·#components)` Components eine Palette-Farbe.
- Visuell: Demo-Seeds → SVG (mit Farbe) → PNG; lange Geraden + saubere 90°-Kehren + Kreuzungen sichtbar.
- `npm run typecheck` + `npx tsx scripts/smoke.mjs` grün.

## Erwartete Dateien

- `src/generators/pipes.ts` — `pipes` GeneratorDef + Kachel-/Tracing-/Färb-Logik.
- `src/generators/registry.ts` — `pipes` eintragen; `meander` aus GENERATORS entfernen (File bleibt).
- `src/generators/types.ts` — `Polyline.stroke?`.
- `src/render/CanvasPreview.tsx` — `stroke` honorieren.
- `src/render/svgExport.ts` — per-path `stroke`-Attribut wenn gesetzt.
- `scripts/pipes-test.mjs`.

## Nicht-Ziele (YAGNI / Folge-Tasks)

- **„Plot by color"** (`splitByStroke` + N Plot-Durchgänge mit Stiftwechsel) — eigener Folge-Task; fürs Anschauen nicht nötig.
- **SVG-Farbgruppen** (`<g stroke>` + farb-getrenntes `mergePaths`) — Folge-Task; per-path-`stroke` reicht zunächst.
- **Loops-Generator (Bild 1)** + **organischer Flow (Bild 2)** — eigene Generatoren später, gleiche Band-Engine.
- Keine closed-loop-Sonderbehandlung in `offsetPath` (Schleifen aufschneiden).
- `truchet.ts` nicht anfassen.

## Offene Punkte

- Über-/Unter-Reihenfolge bei `cross`-Kreuzungen: Zeichenreihenfolge entscheidet (später Plot/Render); für v1 egal, Components werden einfach nacheinander gesammelt.
- Palette/Defaults sind Startwerte, via leva live tunebar — Feinabstimmung visuell nach erstem Render.
