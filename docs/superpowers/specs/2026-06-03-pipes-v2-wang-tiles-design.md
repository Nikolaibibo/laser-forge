# Pipes v2 — Wang-Tile-Feld (kausaler Sweep) — Design Spec

**Datum:** 2026-06-03
**Status:** Design approved (User-Go)
**Scope:** Ein zweites Feld-Modell für den bestehenden `pipes`-Generator: ein kantengematchtes Wang-Tile-Feld, das **distinkte, sich nicht kreuzende** Pipes mit langen Geraden erzeugt — als Lösung für das Plaid/Gitter-Problem des aktuellen `cross`-Tile-Modells. Loops-Generator ist ein **separater** Folge-Spec.

> **Warum:** Im aktuellen `pipes` (Truchet) erzeugt das `cross`-Tile (N–S-Gerade **+** O–W-Gerade in derselben Zelle, kreuzend) bei hoher `straightness` ein Gitter: jede Zeile wird eine durchgehende horizontale Pipe, jede Spalte eine vertikale, alle kreuzen sich → Plaid. Der User will dichte parallele Bänder mit **langen Geraden + sauberen Kurven**, aber **einzelne** Pipes (Referenz „Bild 3", Pipe-/Circuit-Routing).

## Beweis-Kontext (warum das Modell so aussieht)

Es gibt genau drei Arten, die 4 Kanten einer Zelle paarweise vollständig zu verbinden: `{N–S, O–W}` (= cross, **kreuzt zwingend**), `{N–O, S–W}` (= arcA), `{N–W, S–O}` (= arcB). Lange Geraden brauchen N–S- bzw. O–W-Verbindungen — die existieren bei „alle 4 Kanten verbunden" nur im kreuzenden cross-Tile. **Folgerung:** Geraden ohne Kreuzung sind nur möglich, wenn eine Zelle **nicht** alle 4 Kanten verbindet. Daher das Modell „jede Zelle verbindet 0 oder 2 Kanten".

## Kontext (echter Ist-Zustand)

- `src/generators/pipes.ts`: `pipes` GeneratorDef. Doppelschleife baut pro Zelle `strokes: Polyline[]` über `tileStrokes(kind, x0, y0, c, arcSamples)` (kind ∈ `cross`/`arcA`/`arcB`, Auswahl per `rng() < straightness`). Danach: `mergePaths(strokes, 1e-3)` → Components → `offsetPath(center, symmetricOffsets(lanes, laneSpacingMm), { minInnerRadiusMm })` → Band; Farbe pro Component (`colorFraction`, PALETTE); `fitToCanvas`.
- `src/util/offset.ts`: `offsetPath`, `symmetricOffsets` (unverändert).
- `src/util/mergePaths.ts`: Component-Tracing über Endpunkt-Nähe (1e-3), liefert offene Ketten + geschlossene Schleifen (unverändert).
- RNG: ausschließlich `makeRng(seed)` (alea) aus `src/util/random.ts`. Nie `Math.random`.
- `src/render/CanvasPreview.tsx` / `svgExport.ts`: honorieren `Polyline.stroke?` bereits (unverändert).
- `sampleArc(cx, cy, a0, a1, r, n)` existiert in `pipes.ts` und wird wiederverwendet.

## Leitplanken

- mm-Einheit · `makeRng(seed)` only · `fitToCanvas` am Ende · pure Hilfsfunktionen.
- **Additiv, nichts brechen.** `classic` (heutiges Verhalten) bleibt bit-identisch erhalten. Default-Verhalten nur über das neue `model`-Param.
- Kein neues Test-/Build-Framework, keine neuen Runtime-Deps.

## Architektur

### Param-Erweiterung (`PipesParams`)

```ts
type Params = {
  model: "classic" | "wang";   // NEU — leva-Dropdown, default "wang"
  cols: number;
  rows: number;
  lanes: number;
  laneSpacingMm: number;
  straightness: number;        // 0..1: P(Gerade fortsetzen) im Sweep
  density: number;             // NEU — 0..1, nur wang: P(Geburt) + Rand-Vorbelegung
  colorFraction: number;
  arcSamples: number;
  marginMm: number;
};
```
- `model` als leva-Options-Dropdown (`{ options: ["wang", "classic"] }`), Default `wang`.
- `density` als Slider 0..1, Default-Vorschlag `0.5`. Nur im wang-Pfad genutzt (im classic-Pfad ignoriert).
- Defaults sonst wie gehabt (`cols 14, rows 18, lanes 6, laneSpacingMm 0.7, straightness 0.55, colorFraction 0.35, arcSamples 14, marginMm 15`).

### Feld-Erzeugung umstrukturiert

Die heutige Doppelschleife wird in zwei reine Feld-Builder extrahiert, die jeweils `Polyline[]` (offene Strich-Stützpunkte, vor mergePaths) liefern:

```ts
function classicField(cols, rows, c, arcSamples, straightness, rng): Polyline[]   // = heutiger Code, unverändert
function wangField(cols, rows, c, arcSamples, straightness, density, rng): Polyline[]  // NEU
```

`generate()` wählt anhand `p.model`. **Alles danach (mergePaths → offsetPath → Farbe → fitToCanvas) bleibt unverändert.**

### Wang-Sweep (kausal, zeilenweise, contradiction-free)

**Kanten-Zustand (offen/zu):**
- Horizontale Kanten (von vertikalen Pipe-Segmenten gequert) `H[x][y]`, `x ∈ [0,cols)`, `y ∈ [0,rows]`. Für Zelle `(x,y)`: `N = H[x][y]`, `S = H[x][y+1]`.
- Vertikale Kanten `V[x][y]`, `x ∈ [0,cols]`, `y ∈ [0,rows)`. Für Zelle `(x,y)`: `W = V[x][y]`, `E = V[x+1][y]`.

**Vorbelegung Ränder:** obere N-Kanten `H[x][0]` und linke W-Kanten `V[0][y]` werden je mit Wahrscheinlichkeit `density` geöffnet (`rng() < density`). Alle anderen Kanten-Arrays starten geschlossen und werden im Sweep gesetzt.

**Sweep** (`for y in [0,rows): for x in [0,cols):`). N und W sind bereits gesetzt; wähle E und S so, dass der Zellgrad `(N+W+E+S) ∈ {0,2}`:
- `inDeg = N + W` (0/1/2):
  - **`inDeg == 2`** → `E=0, S=0`. Tile: Elbow **N–W**. (erzwungen)
  - **`inDeg == 1`** → genau eine Ausgangskante öffnen:
    - eingehend N (`N=1,W=0`): `rng() < straightness` → `S=1,E=0` (Gerade **N–S**); sonst `E=1,S=0` (Elbow **N–O**).
    - eingehend W (`W=1,N=0`): `rng() < straightness` → `E=1,S=0` (Gerade **O–W**); sonst `S=1,E=0` (Elbow **S–W**).
  - **`inDeg == 0`** → `rng() < density` → `E=1,S=1` (Geburt, Elbow **S–O**); sonst `E=0,S=0` (leere Zelle).
- Setze `H[x][y+1]=S`, `V[x+1][y]=E`. Emittiere den Strich des gewählten Tiles (außer leer).

**Ränder:** Rechte (`E` bei `x=cols-1`) und untere (`S` bei `y=rows-1`) Kanten dürfen offen sein → Pipe endet am Blattrand (offene Kette, vom Tracing abgedeckt). Keine Sonderbehandlung nötig.

**Determinismus:** RNG-Aufrufe in fester Reihenfolge (erst Rand-Vorbelegung H[*][0] dann V[0][*], dann Sweep row-major; pro Zelle max. ein `rng()`), gleicher Seed → identisches Feld.

**Bekannter Drift (bewusst akzeptiert):** Da Abbiegungen im `inDeg==1`-Fall nur nach rechts/unten möglich sind (N/W sind fix), driftet das Feld leicht nach unten-rechts. Bei hoher `straightness` mild. **Falls visuell störend → WFC-Variante als Folge-Task (nicht in diesem Spec).**

### Tile-Geometrie (pure)

```ts
// openPair: welche zwei Kanten verbunden werden
type Pair = "NS" | "WE" | "NE" | "NW" | "SE" | "SW";
function wangTileStroke(pair: Pair, x0: number, y0: number, c: number, arcSamples: number): Point[]
```
- Kantenmittelpunkte (y nach unten): `N=[x0+r,y0]`, `S=[x0+r,y0+c]`, `W=[x0,y0+r]`, `E=[x0+c,y0+r]`, `r=c/2`.
- `NS` → `[N, S]`; `WE` → `[W, E]` (Geraden, 2 Punkte).
- Elbows = Viertelbogen um die jeweilige Ecke (`sampleArc`, `arcSamples` Stützpunkte), Radius `r`:
  - `NE` → Ecke `(x0+c, y0)`, Winkel `π → π/2`.
  - `NW` → Ecke `(x0, y0)`, Winkel `0 → π/2` … (Winkel-Konventionen exakt aus bestehender `tileStrokes`-Logik übernehmen, Bogen-Tangente an Kantenmitte = senkrecht zum Radius = nahtlos an die anschließende Gerade).
  - `SE` → Ecke `(x0+c, y0+c)`; `SW` → Ecke `(x0, y0+c)`.

> **Konsistenz-Hinweis für Implementierung:** Die exakten `a0→a1`-Winkel je Elbow gegen die bestehenden arcA/arcB-Aufrufe in `tileStrokes` spiegeln, damit Tangentenrichtung + Durchlaufsinn stimmen (sonst Knick an der Kachelgrenze). Im Test visuell + via Endpunkt-Lage (Bogen-Enden liegen exakt auf den zwei Kantenmittelpunkten, ±1e-6) verifizieren.

## Erwartete Dateien

- `src/generators/pipes.ts` — `model` + `density` Params, `classicField`/`wangField` extrahiert, `wangTileStroke` ergänzt, `generate()` schaltet auf `model`.
- `scripts/pipes-wang-test.mjs` — neuer tsx-Test.

## Tests (tsx, Projekt-Konvention)

- **Grad-Invariante:** über ein generiertes Feld (mehrere Seeds) jede Zelle prüfen — Anzahl offener Kanten `(N,O,S,W)` ∈ {0,2}. ⇒ garantiert kreuzungsfrei (kein Grad-4-Tile).
- **Determinismus:** gleicher Seed → identisches `Artwork` (`JSON.stringify`-Vergleich); anderer Seed → anders.
- **Tile-Endpunkte:** `wangTileStroke`-Ausgaben starten/enden exakt auf den erwarteten Kantenmittelpunkten (±1e-6), Bogen-Tangente nahtlos.
- **In-bounds:** alle Punkte nach `fitToCanvas` in `[margin, size−margin]` (±1).
- **Farbe:** `colorFraction = 0` → keine Polyline trägt `stroke`; `> 0` → ~`round(colorFraction·#components)` Components farbig.
- **Regression:** `model = "classic"` liefert bit-identisches Ergebnis zu vor der Änderung (gleicher Seed/Params); `smoke.mjs`, bestehende Tests, `npm run typecheck` + `npm run build` grün.

## Verifikation (visuell)

- Demo-Seeds in `model: "wang"` → SVG/PNG: distinkte Pipes, lange Geraden, saubere 90°-Kehren, **keine Kreuzungen**, manche Zellen leer.
- `density` hoch → Feld dicht gefüllt (distinkte gepackte Pipes); niedrig → sparse Pipes mit Leerraum.
- Drift nach unten-rechts beurteilen (Entscheidung WFC ja/nein).
- Mono plotten/Trace-dry: Stift hebt pro Pipe ab (mit „Join paths").

## Nicht-Ziele (YAGNI / Folge-Tasks)

- **Kein WFC/Backtracking** in diesem Spec — nur falls der Drift im Render stört.
- **Kein** Over/Under-Rendering von Kreuzungen (es gibt keine Kreuzungen).
- `classic`-Pfad **nicht** ändern (nur extrahieren).
- Keine neue Farb-/Plot-Infra (`splitByStroke`/„Plot by color" existiert bereits, greift unverändert).
- **Loops-Generator** = eigener Spec danach.
- `truchet.ts` nicht anfassen.

## Offene Punkte

- `density`-Default (0.5 Startwert) + Wechselwirkung mit `straightness` für die beste Default-Optik — via leva live tunen, nach erstem Render kalibrieren.
- Ob die Rand-Vorbelegung (oben/links mit `density`) den Drift visuell genug ausgleicht — Render entscheidet.
