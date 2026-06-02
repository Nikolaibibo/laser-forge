# Plotter-Ribbons: Offset-Engine, Mäander- & Loop-Generatoren, optionale Farbe — Design Spec

**Datum:** 2026-06-02
**Status:** Design approved (Richtung bestätigt), Spec-Review ausstehend
**Scope:** Neue Vektor-Motive für den Plotter — versetzte „Ribbon"-Bänder (Mäander, große Schleifen) plus eine *optionale, additive* Farb-/Mehr-Stift-Fähigkeit. Erdet die ursprüngliche Desktop-SPEC (`~/Desktop/SPEC.md`) auf das **echte** laser-forge-Modell.

> **Warum diese Spec existiert:** Die Desktop-SPEC wurde gegen einen angenommenen „agnostischen TS-Core" (`Scene`/`Lane`/`Band`/`generate→Scene`/`sceneToSVG`, `mulberry32`) geschrieben — den es in laser-forge nicht gibt. Hier ist alles `Artwork`/`Polyline`, RNG ist `alea` via `makeRng`, Generatoren/Distortions hängen an Registries. Diese Spec übersetzt die *visuellen Ziele* der Desktop-SPEC sauber auf dieses Modell.

## Kontext (echter Ist-Zustand)

- **Datentyp** (`src/generators/types.ts`):
  - `Point = [number, number]` (mm)
  - `Polyline = { points: Point[]; closed: boolean }`
  - `Artwork = { polylines: Polyline[]; widthMm: number; heightMm: number }`
  - `Canvas = { wMm: number; hMm: number }`
  - Kein `Scene`/`Lane`/`Band`/`LayerDef`. **Ein „Band aus K Spuren" = K Polylinien im selben `Artwork`.**
- **Generatoren**: `GeneratorDef.generate(params, seed, canvas) → Artwork`. Eine Datei je Generator unter `src/generators/`, registriert in `registry.ts`. Referenz: `rose.ts`.
- **Distortions**: `DistortionDef.apply(artwork, params, seed) → Artwork`, verkettet in der Pipeline (die „Layers" im UI). Nicht Teil dieser Spec.
- **Pipeline** (`App.tsx`): `baseGen → distortion₁ … → finalArt → store.currentArtwork`. Verbraucher: `CanvasPreview` (mono `#111`), `svgExport`, `PlotterPanel`.
- **Plotter**: `currentArtwork → mergePaths (join) → artworkToGcode (EIN Stift, NN-Order) → streamJob → GRBL/WebSerial`. Servo-Pen `M3 S20`/`S160`, **`M5` nie**.
- **Bereits erledigt:** durchgehende Pfade (`src/util/mergePaths.ts` + Toggle in Export & Plotter). **Task 2 der Desktop-SPEC entfällt vollständig** — `joinLanes` == `mergePaths`.

## Leitplanken (für ALLE Tasks)

- **Einheit mm.** Alle Koordinaten/Margins/Toleranzen.
- **RNG ausschließlich `makeRng(seed)`** aus `src/util/random.ts` (alea). **Nie `Math.random`.** Gleicher Seed → identisches Artwork.
- **`fitToCanvas`** aus `src/util/path.ts` am Ende jedes Generators (skaliert in Canvas mit Margin).
- **Additiv, nichts brechen.** Neue Felder optional, neue Files. Mono-Verhalten bleibt für alles ohne Farbe **bitidentisch**.
- Neue Geometrie-Funktionen **pure** (Input→Output, kein IO, keine globalen Seiteneffekte).
- **Kein neues Test-/Build-Framework.** Tests als tsx-Script unter `scripts/`, Stil wie `scripts/mergepaths-test.mjs` / `scripts/test-dedupe.mjs`. `smoke.mjs` iteriert Generatoren automatisch.
- Keine neuen Runtime-Dependencies. (`vpype` ist externes CLI, nur dokumentiert.)

## Reihenfolge / Stufen

Drei Stufen, jede für sich shippbar **und plottbar**. Geometrie zuerst (mono, plottet sofort), Farbe als ein sauberer Schnitt zuletzt. Farb-Logik in den Generatoren (Akzent/Layer-Farbe) wird **erst nach Stufe 2 verdrahtet** — vorher hätte sie keinen Abnehmer.

---

## Stufe 0 — Offset-Engine + Mäander-Generator (mono)

### Task 0.1 — `src/util/offset.ts` (pure)

```ts
import type { Point, Polyline } from "../generators/types";

export type OffsetOpts = {
  /** Minimaler Innenradius (mm); innere Spuren kollabieren nicht enger als das. Default z.B. 0.5. */
  minInnerRadiusMm?: number;
  /** Resampling-Schrittweite (mm) für gleichmäßige Stützpunkte vor dem Versatz. Optional. */
  resampleMm?: number;
};

/**
 * Versetzt eine offene Centerline um jeden Wert in `offsets` (mm, signiert) entlang
 * der gemittelten Punktnormale. Ein Eintrag in `offsets` → eine versetzte Polyline.
 * Konvexe Ecken werden verrundet (Resampling); bei Innenkurven greift minInnerRadiusMm,
 * damit innere Spuren sich nicht selbst überschneiden.
 */
export function offsetPath(center: Point[], offsets: number[], opts?: OffsetOpts): Polyline[];
```

- Pro Stützpunkt **gemittelte Normale** aus den zwei Nachbarsegmenten.
- Symmetrisches Band als Helper-Konvention: `offsets[i] = (i − (K−1)/2) · spacing`.
- Rückgabe: offene `Polyline[]` (`closed: false`), eine je Offset. **Kein** `Lane`-Typ.

**Akzeptanz:** 180°-Kehre → konzentrische Bögen, innere Spuren ohne Selbstüberschneidung. Deterministisch (keine RNG-Nutzung; rein geometrisch).

### Task 0.2 — `src/generators/meander.ts` → `generateMeander`

`GeneratorDef<MeanderParams>` nach dem `rose.ts`-Muster.

```ts
type MeanderParams = {
  cellMm: number;            // Rastergröße der Centerline
  lanes: number;             // K parallele Spuren
  laneSpacingMm: number;     // s zwischen den Spuren
  turnRadiusMm: number;      // Soll-Kehrenradius (≥ Bandbreite/2)
  minTurnRadiusMm: number;   // an offsetPath durchgereicht
  coverage: number;          // 0..1 Ziel-Flächenabdeckung ODER targetLenCells
  marginMm: number;
};
```

- Centerline: **selbst-meidende** Bahn auf dem Zellraster (`makeRng(seed)`), gerundete Kehren (Radius ≥ Bandbreite/2), bis Sackgasse oder Ziel-Länge. Optional mehrere Bahnen.
- Centerline → `offsetPath(center, symmetricOffsets(lanes, laneSpacingMm), { minInnerRadiusMm })` → K Polylinien.
- Alle Polylinien sammeln → **`fitToCanvas`** → `Artwork`.
- In `registry.ts` eintragen (UI bindet automatisch). leva-`schema` analog zu bestehenden Generatoren.
- **Mono** in Stufe 0 (kein `stroke`). Plottet sofort über die bestehende Kette.

**Akzeptanz:** organische, genestete Haarnadeln; `makeRng(seed)` reproduzierbar (gleicher Seed → identisches SVG, String-Vergleich). Plottet über `artworkToGcode` ohne Sonderfälle.

---

## Stufe 1 — Loop-Generator (mono-fähig)

### Task 1.1 — `src/generators/loops.ts` → `generateLoops`

```ts
type LoopLayer = { color?: string; loops: number };   // color erst ab Stufe 2 genutzt
type LoopParams = {
  layers: LoopLayer[];       // wenige (2–4) Layer; Stufe 0/1: color ignoriert → mono
  lanes: number;             // großes K
  laneSpacingMm: number;     // kleines s → dichtes Band
  marginMm: number;
};
```

- Pro Layer wenige (2–4) große, bewusst überlappende **Bézier-/Rounded-Loop**-Centerlines (`makeRng`).
- Jede Centerline → `offsetPath` mit großem K / kleinem `s` → dichtes Band.
- Alle Polylinien → `fitToCanvas` → `Artwork`.
- **Stufe 1 mono:** `color` der Layer wird noch nicht gesetzt → schwarzes, dichtes Schleifen-Feld (sieht für sich schon gut aus). Overprint kommt mit Stufe 2.

**Akzeptanz:** dichtes, sich überlappendes Schleifen-Feld; seeded reproduzierbar; plottet mono.

---

## Stufe 2 — Optionale Farbe / Mehr-Stift (die einzige Core-Erweiterung)

Genau **ein** optionales Feld am Blatt-Typ. Alles ohne `stroke` verhält sich **bitidentisch** zu heute.

### Task 2.1 — `Polyline.stroke?: string`

```ts
export type Polyline = {
  points: Point[];
  closed: boolean;
  stroke?: string;   // CSS/Hex-Farbe; undefined = Default-Stift (#111 / schwarzer Plot)
};
```

> **Entscheidung:** `stroke?: string` (Hex) statt `pen?: number`. Preview und SVG wollen echte Farbe; der Plotter gruppiert nach **distinkten** `stroke`-Werten und mappt sie auf physische Stiftwechsel. Reihenfolge der Stifte = Reihenfolge des ersten Auftretens (deterministisch).

### Task 2.2 — Preview (`src/render/CanvasPreview.tsx`)

- `ctx.strokeStyle = line.stroke ?? "#111"` (pro Polyline). Einzeiler-Erweiterung in der Zeichenschleife.
- Optionaler Toggle „Overprint preview" → setzt `ctx.globalCompositeOperation = "multiply"`, damit Überlappungen die dritte Farbe zeigen (nur Screen, dokumentieren, **nicht** ins SVG-Core).

### Task 2.3 — SVG-Export (`src/render/svgExport.ts`)

- Nach `dedupe`/`join` Polylinien **nach `stroke` gruppieren**; je Gruppe ein `<g stroke="…">` mit den `<path>`-Elementen.
- Polylinien ohne `stroke` → schwarze Default-Gruppe (heutiges Verhalten).
- `mergePaths` darf nur Polylinien **gleicher `stroke`** verketten (sonst Farb-Sprung im Pfad). → `mergePaths` um optionalen Gruppierungs-Key erweitern **oder** vor dem Merge nach `stroke` partitionieren (Letzteres bevorzugt — `mergePaths` bleibt unangetastet).

### Task 2.4 — `src/plotter/penSplit.ts` (pure) + „Plot by color"

```ts
import type { Polyline } from "../generators/types";
export type PenGroup = { stroke: string; polylines: Polyline[] };
/** Partitioniert nach distinktem stroke (undefined → "#000000"), Reihenfolge = erstes Auftreten. */
export function splitByStroke(polylines: Polyline[]): PenGroup[];
```

- `PlotterPanel.tsx`: neuer Button **„Plot by color"**. Ablauf:
  1. `splitByStroke(joinPaths ? perGroupMerge(…) : artwork.polylines)`.
  2. Für jede `PenGroup`: normaler Single-Pen-Job (`artworkToGcode({ ...artwork, polylines: group.polylines })` → `streamJob`).
  3. **Zwischen den Gruppen** Modal/Prompt: *„Stift einsetzen: {stroke} → Continue / Abort"*. Origin hält GRBL (kein Re-Home).
- **`gcode.ts` bleibt unverändert** — Mehr-Stift = „N Single-Pen-Jobs mit Pause" (= Weg A, physisches Mehr-Stift-Plotten). Bestehender „Plot"-Button (mono, ein Job) bleibt erhalten.

### Task 2.5 — Farbe in den Generatoren verdrahten (jetzt erst sinnvoll)

- **Mäander `colorFraction` (Desktop-SPEC Task 1):** neuer Param `colorFraction: number` (0 = mono, default) + `accentColor: string`. Komponentengröße = **Summe der Lane-Längen** je Komponente. Die größten `round(colorFraction · n)` Komponenten bekommen `stroke = accentColor`, Rest bleibt `stroke` undefined (= Default). Strategie deterministisch je Seed.
- **Loops Overprint (Desktop-SPEC Task 5):** `LoopLayer.color` auf jede Polyline des Layers als `stroke` setzen → ≥2 Farbfelder, Überlappung erzeugt beim Plot/Preview die dritte Farbe + Moiré.

**Akzeptanz Stufe 2:**
- Ohne `stroke` ist Preview/SVG/Plot **bitidentisch** zu vor der Stufe.
- `splitByStroke` erzeugt korrekt geordnete Gruppen; „Plot by color" plottet je Farbe einen Job mit Stiftwechsel-Pause dazwischen, Origin bleibt.
- Mäander `colorFraction > 0`: längste Bahnen tragen `accentColor`. Loops mit 2 Layer-Farben: zwei Felder, physischer Overprint.

---

## Erwartete Dateien

- `src/util/offset.ts` — `offsetPath`, Offset-Helper (`symmetricOffsets`).
- `src/generators/meander.ts` — `generateMeander`, `MeanderParams`.
- `src/generators/loops.ts` — `generateLoops`, `LoopParams`, `LoopLayer`.
- `src/generators/registry.ts` — beide Generatoren eintragen.
- `src/generators/types.ts` — `Polyline.stroke?` (Stufe 2).
- `src/render/CanvasPreview.tsx` — `stroke` honorieren (Stufe 2).
- `src/render/svgExport.ts` — Gruppierung nach `stroke` (Stufe 2).
- `src/plotter/penSplit.ts` — `splitByStroke` (Stufe 2).
- `src/ui/PlotterPanel.tsx` — „Plot by color" + Stiftwechsel-Prompt (Stufe 2).
- `scripts/offset-test.mjs`, `scripts/meander-test.mjs`, `scripts/loops-test.mjs`, `scripts/pensplit-test.mjs`.
- README: vpype-Pipeline-Hinweis (pro Farbebene), Overprint-Preview-Hinweis (`mix-blend-mode: multiply`).

## Tests (tsx, Projekt-Konvention)

- **offset:** 180°-Kehre → K konzentrische, sich nicht überschneidende Polylinien; gerade Linie → K parallele Linien mit korrektem Abstand.
- **meander:** Determinismus (gleicher Seed → identische Punktfolge); Centerline selbst-meidend (keine Segment-Schnitte über Toleranz); Output gültiges `Artwork`.
- **loops:** Determinismus; erwartete Polylinien-Zahl ≈ Σ(layers.loops · lanes).
- **pensplit:** gemischte `stroke` → korrekte Gruppen + Reihenfolge; alle ohne `stroke` → genau eine `#000000`-Gruppe (== heutiges Mono).
- **Regression:** bestehende `smoke.mjs`, `gcode-test.mjs`, `mergepaths-test.mjs`, `test-dedupe.mjs` bleiben grün; `npm run typecheck` + `npm run build` ok.

## Verifikation (visuell)

- Je Generator Demo-Seed → SVG → PNG/Preview prüfen.
- Stufe 0/1: mono plotten (oder Trace dry) — Stift hebt nur pro Bahn/Schleife ab (mit „Join paths").
- Stufe 2: 2-Farben-Loops → „Plot by color" → zwei Durchgänge, Overprint auf Papier.

## Nicht-Ziele (YAGNI)

- **Kein** `Scene`/`Lane`/`Band`/`LayerDef`-Typ — Bänder sind `Polyline[]`.
- **Kein** Re-Implementieren von `joinLanes` (== `mergePaths`, existiert).
- **Keine** Farbe in der Distortion-Pipeline, **keine** „Layers = Farben"-Umdeutung (Layers bleiben Distortions).
- **Kein** automatischer Stiftwechsel in `gcode.ts` (Mehr-Stift = mehrere Jobs + manuelle Pause).
- Kein neues Test-/Build-Framework, keine neuen Runtime-Deps.
- `colorStrategy`/Palette nicht vor Stufe 2 (kein Abnehmer).

## Offene Punkte

- Mäander-Centerline-Algorithmus (selbst-meidender Random-Walk vs. Hilbert-/Raster-Backtracking) — Detail für den Plan, beeinflusst Optik. Default-Vorschlag: gewichteter selbst-meidender Walk auf Zellraster mit Backtracking bei Sackgasse.
- Loop-Dichte für „echten" Moiré (K, s, Winkel-Offset zwischen Layern) — durch Seeds/Defaults im Plan kalibrieren, ggf. zweiter Layer leicht rotiert (`angle-b` aus dem Voronoi-Moiré-Rezept als Vorbild).
