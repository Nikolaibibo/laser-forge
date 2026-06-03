# Loops — Serpentinen-Ribbons mit Overprint — Design Spec

**Datum:** 2026-06-03
**Status:** Design approved (User-Go)
**Scope:** Ein neuer Generator `loops`, der wenige große, überlappende Serpentinen-Ribbons (parallele Läufe + 180°-U-Turn-Kappen) als dichte Parallel-Bänder rendert, mit 2–3 Stiftfarben für Overprint-Moiré. Referenz: Instagram @plotterpen „1+1=3" (siehe Bild #1 der Session 2026-06-03).

> **Warum:** Folge-Effekt nach Pipes v2, auf derselben Band-Engine (`offsetPath`). Die Ästhetik (Bild #1): eine Handvoll großer Serpentinen/Kapseln, zufällig platziert + rotiert, stark überlappend; jede als dichtes Band aus ~15 konzentrischen Spuren; blau + orange, Überlappung multipliziert → lila + dritte Farbe.

## Kontext (echter Ist-Zustand)

- Typen (`src/generators/types.ts`): `Point = [number, number]`, `Polyline = { points: Point[]; closed: boolean; stroke?: string }`, `Artwork = { polylines; widthMm; heightMm }`, `Canvas = { wMm; hMm }`, `GeneratorDef.generate(params, seed, canvas) → Artwork`.
- `src/util/offset.ts`: `offsetPath(center: Point[], offsets: number[], opts?: OffsetOpts): Polyline[]` und `symmetricOffsets(k: number, spacing: number): number[]`. `OffsetOpts` hat `minInnerRadiusMm?`.
- `src/util/path.ts`: `fitToCanvas(lines, wMm, hMm, marginMm)`.
- RNG: ausschließlich `makeRng(seed)` (alea) aus `src/util/random.ts`; Helfer `randRange(rng,min,max)`, `randInt(rng,min,max)`, `pick(rng,arr)`. Nie `Math.random`.
- `src/generators/registry.ts`: `GENERATORS`-Array; UI bindet automatisch. Generator-Muster: `rose.ts`, `pipes.ts`.
- Farb-/Plot-Infra **bereits vorhanden** (aus Pipes): `Polyline.stroke?`, `CanvasPreview`/`svgExport` honorieren `stroke`, `splitByStroke` + „Plot by color" + Multiply-Preview im PlotterPanel. Loops muss nur `stroke` pro Shape setzen.
- leva-Dropdown/Slider-Muster: `{ value, min, max, step }` bzw. `{ value, options: [...] }`.

## Leitplanken

- mm-Einheit · `makeRng(seed)` only · `fitToCanvas` am Ende · pure Geometrie-Helfer.
- **Additiv, nichts brechen.** Nur neue Datei + eine Registry-Zeile. Keine bestehenden Generatoren/Utils ändern.
- Kein neues Test-/Build-Framework, keine neuen Runtime-Deps.

## Architektur

Kein Tiling, kein Sweep, kein Tracing. Jede Shape ist **eine** Centerline → ein Band aus K parallelen Polylinien via `offsetPath`. Shapes sind unabhängig und überlappen bewusst (kein Collision-Avoidance).

### Serpentinen-Centerline (pure, neu)

```ts
/**
 * Boustrophedon-Centerline: `runs` parallele Läufe der Länge `runLengthMm`,
 * verbunden durch 180°-Kappen (Halbkreis, Radius = runSpacingMm/2) auf
 * alternierenden Seiten. Lokale Koords (erster Lauf entlang +x, Läufe stapeln in +y).
 * runs=2 ⇒ einfache Kapsel/Racetrack.
 */
function serpentineCenterline(
  runs: number, runLengthMm: number, runSpacingMm: number, capSamples: number,
): Point[];
```

Konstruktion (lokal, Läufe horizontal):
- Lauf `i` (0-basiert) auf Höhe `y = i * runSpacingMm`.
- Gerade Läufe alternieren die Richtung: gerade `i` von `x=0→runLengthMm`, ungerade `i` von `runLengthMm→0`.
- Kappe zwischen Lauf `i` und `i+1`: Halbkreis, Zentrum am jeweiligen Lauf-Ende auf halber Höhe (`y = (i+0.5)*runSpacingMm`), Radius `runSpacingMm/2`, mit `capSamples` Stützpunkten gesampelt. Rechte Kappen an `x=runLengthMm`, linke an `x=0` (alternierend, passend zur Lauf-Richtung), sodass die Centerline durchgehend C0-stetig ist (Kappen-Tangente an den Lauf-Enden = parallel zum Lauf).
- Ergebnis: **eine** offene Punktliste (durchgehende Centerline).

### Rotation + Platzierung (pure Helfer)

```ts
function rotateTranslate(pts: Point[], angleRad: number, cx: number, cy: number, tx: number, ty: number): Point[];
```
Rotiert `pts` um den Pivot `(cx,cy)` (Centerline-Mittelpunkt) um `angleRad`, dann Translation um `(tx,ty)`. Rein geometrisch.

### Scatter-Schleife (`generate`)

```ts
const rng = makeRng(seed);
const all: Polyline[] = [];
const offsets = symmetricOffsets(p.lanes, p.laneSpacingMm);
for (let i = 0; i < p.shapes; i++) {
  const runs = randInt(rng, p.runsMin, p.runsMax);
  const len = randRange(rng, p.runLenMinMm, p.runLenMaxMm);
  const angle = randRange(rng, 0, Math.PI);            // 0..180°, reicht (Serpentine ist nicht gerichtet)
  const center = serpentineCenterline(runs, len, p.runSpacingMm, p.capSamples);
  // Pivot = Bounding-Box-Mitte der lokalen Centerline:
  const [cx, cy] = centroidOfBounds(center);
  // Scatter-Ziel irgendwo im Canvas-Arbeitsbereich:
  const tx = randRange(rng, 0, canvas.wMm), ty = randRange(rng, 0, canvas.hMm);
  const placed = rotateTranslate(center, angle, cx, cy, tx, ty);
  const stroke = PALETTE[i % p.numColors];
  for (const lane of offsetPath(placed, offsets, { minInnerRadiusMm: p.laneSpacingMm })) {
    all.push({ ...lane, stroke });
  }
}
const fitted = fitToCanvas(all, canvas.wMm, canvas.hMm, p.marginMm);
return { polylines: fitted, widthMm: canvas.wMm, heightMm: canvas.hMm };
```
`centroidOfBounds` = Mitte der Bounding-Box der Punkte (kleiner lokaler Helfer; oder bestehende `polylineBounds` aus `path.ts` nutzen, falls signaturkompatibel — sonst inline). `PALETTE` = lokale Konstante im Generator, Default `["#4f86e0", "#e0584f", "#5fcaa8"]` (blau/orange/grün, passend zur Referenz).

### Parameter

```ts
type LoopParams = {
  shapes: number;        // M Serpentinen
  runsMin: number;       // min Switchbacks (2 = Kapsel)
  runsMax: number;       // max Switchbacks
  runLenMinMm: number;
  runLenMaxMm: number;
  runSpacingMm: number;  // Switchback-Pitch; Kappenradius = /2
  lanes: number;         // K Spuren im Band
  laneSpacingMm: number;
  numColors: number;     // 1..3 Palette-Farben (Overprint)
  capSamples: number;
  marginMm: number;
};
```
DEFAULTS: `shapes 6, runsMin 2, runsMax 5, runLenMinMm 40, runLenMaxMm 110, runSpacingMm 9, lanes 14, laneSpacingMm 0.5, numColors 2, capSamples 16, marginMm 15`.

schema: ganzzahlige Slider (`step:1`) für `shapes`/`runsMin`/`runsMax`/`lanes`/`numColors`/`capSamples`; mm-Slider für die Längen/Spacing/margin. `numColors` min 1 max 3.

**Constraint:** `runSpacingMm` sollte ≥ Bandbreite (`(lanes-1)·laneSpacingMm`) sein, sonst klemmen die inneren Kappen-Spuren. `minInnerRadiusMm: laneSpacingMm` fängt das graceful ab (tighte U-Turns wie im Bild), kein Crash. Im Plan als Default so gewählt, dass es passt (14·0.5 = 7 < 9).

## Erwartete Dateien

- `src/generators/loops.ts` — `loops` GeneratorDef + `serpentineCenterline` + `rotateTranslate` + lokale Helfer + PALETTE.
- `src/generators/registry.ts` — `loops` importieren + ins `GENERATORS`-Array.
- `scripts/loops-test.mjs` — tsx-Test.

## Tests (tsx, Projekt-Konvention)

- **serpentineCenterline:** `runs=2` → Kapsel (2 Läufe + 1 Kappe); allgemein N Läufe + (N−1) Kappen, Lauf-Enden exakt durch Kappen verbunden (Endpunkt-Nähe ±1e-6); Lauf `i` auf Höhe `i·runSpacingMm`; deterministisch (keine RNG-Nutzung, rein geometrisch).
- **rotateTranslate:** Rotation um Pivot + Translation korrekt (z.B. 90°-Rotation eines bekannten Punkts); Längen erhalten.
- **generate Determinismus:** gleicher Seed → identisches `Artwork` (`JSON.stringify`); anderer Seed → anders.
- **Farbe:** mit `numColors=2` tragen alle Polylinien einen `stroke` aus den ersten 2 Palette-Einträgen; Anzahl distinkter `stroke`-Werte = `min(numColors, shapes)`.
- **In-bounds:** alle Punkte nach `fitToCanvas` in `[margin, size−margin]` (±1).
- **Plottbar:** alle Polylinien `closed:false`, `points.length ≥ 2`.
- **Regression:** `smoke.mjs` iteriert `loops` mit ein (grün), `npm run typecheck` + `npm run build` ok.

## Verifikation (visuell)

- Demo-Seeds → SVG/PNG: große überlappende Serpentinen, dichte konzentrische Bänder, saubere 180°-Kappen, 2 Farben mit Overprint in den Überlappungen.
- `shapes`/`runsMax`/`runLen*`/`numColors` über leva durchspielen; Dichte + Overprint kalibrieren.
- „Plot by color" → zwei Durchgänge (blau, orange), Overprint auf Papier (Origin zwischen Pässen halten, kein DTR-Reset).

## Nicht-Ziele (YAGNI / Folge-Tasks)

- **Keine Kollisionsvermeidung** — Overlap ist gewollt.
- **Kein neues Color-/Plot-System** — `stroke` + `splitByStroke` + „Plot by color" + Multiply-Preview existieren.
- **Organic Flow (Bild #2)** = eigener späterer Spec/Generator (gleiche Band-Engine, andere Centerline).
- Keine weiteren Shape-Primitive (nur Serpentine; Kapsel = `runs=2`).
- Keine geschlossenen-Pfad-Sonderbehandlung (Centerline ist offen).
- Keine neuen Deps, kein neues Test-Framework.

## Offene Punkte

- `centroidOfBounds`: bestehende `polylineBounds`/`fitToCanvas`-Helfer in `path.ts` prüfen und ggf. wiederverwenden statt neu (Detail für den Plan).
- Defaults (`shapes`, `runSpacingMm`, `runLen*`) sind Startwerte — via leva nach erstem Render an Bild #1 kalibrieren.
- Scatter-Verteilung: rein uniform `(0..w, 0..h)` als Pivot-Ziel; falls Shapes zu oft aus dem Bild laufen, im Plan ggf. Zentren leicht nach innen klemmen (fitToCanvas skaliert ohnehin auf Margin).
