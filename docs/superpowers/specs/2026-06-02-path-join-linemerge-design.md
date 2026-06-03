# Path Join (linemerge) — Design Spec

**Datum:** 2026-06-02
**Status:** Design approved (Richtung bestätigt), Spec-Review ausstehend
**Scope:** Eine Optimierung, die zusammenhängende Polylinien zu durchgängigen Pfaden verbindet → weniger Stift-Absetzer beim Plotten. Zielt primär auf die WebSerial-Plot-Pipeline, sekundär auf den SVG-Export.

## Problem

Mehrere Generatoren (zuerst aufgefallen bei **Truchet**) geben Geometrie als viele
**kurze, separate Polylinien** aus, obwohl sie sich an den Endpunkten exakt berühren
und *visuell* zu langen, fließenden Kurven verketten. Beispiel Truchet smith-arcs:
pro Tile zwei Viertelbögen als eigene Polylinien — eine Kurve über zehn Tiles liegt
als ~zehn Schnipsel vor. Folge: der Plotter **hebt den Stift zwischen jedem Schnipsel**.

Die bestehende NN-Sortierung in `src/plotter/gcode.ts` verkürzt nur die *Leerwege*
zwischen den Schnipseln — sie reduziert **nicht die Anzahl der Absetzer**. Dafür muss
man Endpunkte *verbinden* (linemerge), nicht nur umsortieren.

`src/util/dedupePaths.ts` ist verwandt, aber löst ein anderes Problem (überlappende/
kollineare Segmente entfernen). Hier geht es um **Verketten an gemeinsamen Endpunkten**.

## Ziel

- Eine reine Funktion `mergePaths(polylines, tolerance) → polylines`, die Polylinien,
  deren Endpunkte (innerhalb `tolerance`) zusammenfallen, zu längeren durchgängigen
  Polylinien verkettet (mit Umkehren wo nötig).
- In der **Plotter-Pipeline** anwendbar (Toggle „Join paths", default an) → drastisch
  weniger Stift-Absetzer.
- Im **SVG-Export** als Toggle (neben „Dedupe paths") verfügbar.

## Nicht-Ziele (YAGNI)

- **Kein** generator-spezifisches Loop-Tracing (die elegantere Truchet-Kür über den
  Grad-2-Graphen) — separate, spätere Spec, falls linemerge nicht reicht.
- **Keine** Glättung/Vereinfachung der Pfade (das ist `linesimplify`, anderes Thema).
- **Keine** Änderung an `dedupePaths` (bleibt orthogonal; siehe Reihenfolge unten).
- Keine neue Distortion im „+"-Menü (Optimierung, nicht Ästhetik — konsistent mit
  dem Toggle-Muster von Dedupe).

## Architektur

### `src/util/mergePaths.ts` — reine Funktion

```ts
import type { Polyline, Point } from "../generators/types";
export function mergePaths(polylines: Polyline[], tolerance?: number): Polyline[];
```

Algorithmus (angelehnt an die Snap-/Restitch-Logik in `dedupePaths.ts`):

1. **Closed-Polylinien bleiben unangetastet** — sie haben keine freien Enden zum
   Verketten und werden unverändert durchgereicht (am Ende wieder angehängt).
2. Für offene Polylinien (≥2 Punkte): jeden **Endpunkt auf ein `tolerance`-Grid
   snappen** (Default `tolerance = 0.05 mm`; großzügiger als Dedupes 0.01, weil Arc-
   Sampling minimal abweichende Endkoordinaten erzeugen kann). Snap-Key = gerundete
   `x,y`.
3. **Endpunkt-Index** aufbauen: Map vom Snap-Key auf die Liste der (Polyline-Index,
   Welches-Ende)-Einträge.
4. **Greedy verketten:** offene Polyline nehmen, am aktuellen freien Ende im Index
   eine andere offene Polyline mit gleichem Snap-Key suchen; passt sie, anhängen
   (zweite ggf. umdrehen, doppelten Verbindungspunkt nicht duplizieren), beide als
   verbraucht markieren, am neuen freien Ende weitersuchen. An beiden Enden wachsen
   lassen, bis kein Treffer mehr.
5. Wird beim Verketten ein **geschlossener Ring** (Start-Snap == End-Snap), als
   `closed: true` markieren.
6. Übrige (unverkettbare) offene Polylinien unverändert übernehmen.

Wichtig: ein Snap-Key darf nur **einmal** verbraucht werden (sonst Mehrfach-Joins an
einem Punkt — bei Truchet smith-arcs ist jeder Mittelpunkt aber genau Grad 2, passt).
Bei Knoten mit Grad >2 (z.B. diagonals, die sich in Ecken treffen) deterministisch den
ersten freien Partner nehmen — Rest bleibt separater Pfad (akzeptabel; reduziert
Absetzer trotzdem stark).

### Integration 1 — Plotter (primär)

`src/ui/PlotterPanel.tsx`: neuer Toggle **„Join paths"** (default `true`). `plot()`
und `outline()` bauen das Artwork vorher um:
```ts
const polys = joinPaths ? mergePaths(artwork.polylines) : artwork.polylines;
const merged = { ...artwork, polylines: polys };
artworkToGcode(merged, { ...DEFAULT_PEN, feed });
```
`mergePaths` läuft **vor** `orderPolylines` (das in `artworkToGcode` steckt): erst
verketten → dann die wenigen langen Pfade NN-sortieren. Reihenfolge ggü. Dedupe:
falls beide aktiv, **erst dedupe, dann merge** (Overlaps weg, dann verbinden).

### Integration 2 — SVG-Export (sekundär)

`src/ui/ExportBar.tsx` + `src/render/svgExport.ts`: Toggle „Join paths" neben
„Dedupe paths"; `SvgExportOptions` um `join?: boolean` erweitern; in `svgExport`
nach dem optionalen Dedupe `mergePaths` anwenden.

## Datenfluss

```
finalArt.polylines
   ├─ [dedupe?]  (bestehend)
   ├─ [merge?]   mergePaths   ← neu
   → SVG-Export   bzw.   artworkToGcode → streamJob → Plotter
```

## Tests — `scripts/mergepaths-test.mjs` (tsx, Projekt-Konvention)

Reine Funktion, gut testbar. Mindestens:
- **Zwei offene Linien, geteilter Endpunkt** → eine Polyline; Punktzahl = Summe − 1
  (kein doppelter Verbindungspunkt).
- **Umkehr-Fall:** zweite Linie teilt ihren *Endpunkt* mit dem Endpunkt der ersten →
  korrekt umgedreht verkettet, Geometrie stimmt.
- **Ring:** vier Segmente im Quadrat → eine `closed: true` Polyline.
- **Toleranz:** Endpunkte 0.03 mm auseinander mergen bei default-Toleranz, 0.2 mm
  nicht.
- **Closed-Polylinien** werden unverändert durchgereicht.
- **Kein Treffer:** zwei disjunkte Linien bleiben zwei.
- **Truchet-Realfall:** `truchet`-Generator (smith-arcs) erzeugen, `mergePaths`
  anwenden → Polylinien-Anzahl sinkt drastisch (Assertion: < 25 % der Ausgangszahl).
- `npm run typecheck` grün.

## Akzeptanz

- `mergePaths` reduziert bei Truchet smith-arcs die Pfadzahl massiv; geplottet hebt
  der Stift nur noch pro Schleife ab statt pro Viertelbogen.
- Toggle im Plotter-Panel (default an) + im Export.
- Bestehende Tests (gcode, dedupe) bleiben grün; `npm run build` ok.

## Offene Punkte

Keine offenen Design-Fragen. Default-Toleranz 0.05 mm (UI-seitig vorerst nicht
einstellbar — Konstante; bei Bedarf später Parameter). Grad-3-Knoten:
deterministisch erster Partner, Rest bleibt eigener Pfad.
