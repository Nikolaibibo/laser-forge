# Export-Path-Deduplication

**Status:** Draft
**Date:** 2026-05-15
**Owner:** nikolai@gomedicusgroup.com

## Problem

Beim Lasern von Mandalas und ähnlichen radialsymmetrischen Mustern entstehen sichtbare Verbrennungen, wo der Laser denselben Pfad mehrfach abfährt. Ursachen im aktuellen Generator-Pipeline:

- **Kaleidoscope-Distortion** (`src/distortions/kaleidoscope.ts`) spiegelt Polylinien entlang radialer Achsen. Liegt eine Quell-Linie nahe der Achse, deckt die Spiegelung das gleiche Segment ab — zwei Polylinien beschreiben physisch denselben Strich.
- **Parametrische Kurven** (`rose`, `harmonograph`, `superformula`) überzeichnen sich bei bestimmten Parameter-Kombinationen selbst.
- **Float-Jitter** zwischen mathematisch identischen Punkten verhindert simples Set-basiertes Erkennen.

Der Laser-Spot brennt jeden Pfad-Pass tiefer; bei zwei oder mehr Pässen entstehen sichtbar dunklere bzw. verkohlte Linien, die das Ergebnis ruinieren.

## Ziel

Eine optionale Transformation an `Artwork.polylines`, die *vor* der SVG-Serialisierung läuft und sicherstellt, dass jeder Punkt im Werkstück höchstens einmal überstrichen wird. Die Originaldaten (State-Store, Preview) bleiben unverändert.

**Aus dem Scope ausgeschlossen:**
- Verschmelzung nahezu paralleler Linien innerhalb einer Dickentoleranz (z.B. Hatching-Schatten zusammenfallen lassen) — würde gewollte Designentscheidungen zerstören.
- Splitting an Kreuzungspunkten ohne gemeinsamen Endpunkt — eigenes, deutlich größeres Feature.
- Laser-Travel-Reihenfolge-Optimierung — separates Thema.

## Erfolgskriterien

1. Bei aktiviertem Toggle enthält das exportierte SVG keine zwei `<path>`-Elemente, die exakt dieselbe Strichmenge im Werkstück abdecken.
2. Bei kollinearer Teilüberlappung (Segment A überdeckt einen Teil von Segment B auf derselben Geraden) ist im Ergebnis nur die Vereinigung beider Intervalle vorhanden.
3. Dichte Kurven (rose, harmonograph) werden nicht fälschlich vereinfacht — jedes kurze Segment einer Kurve hat eine eigene Richtung und bleibt erhalten.
4. Bei deaktiviertem Toggle ist der Export bit-identisch zum bisherigen Verhalten (keine versteckte Bedingung).
5. Performance: 10k Segmente in < 50 ms auf dem Entwickler-Rechner.

## Lösungsdesign

### Datenfluss

```
Artwork.polylines
       │
       ▼
ExportBar: Checkbox-Status
       │
       ▼
downloadSvg(art, name, { dedupe })
       │
       ▼
svgExport(art, { dedupe })
       │
       ▼  (nur falls dedupe === true)
dedupePaths(polylines, TOLERANCE_MM)
       │
       ▼
SVG-Serialisierung
```

`dedupePaths` ist ein neues, reines Modul unter `src/util/dedupePaths.ts`. Es hat keine Zustand-, Store- oder DOM-Abhängigkeiten — nur die `Polyline`/`Point`-Typen aus `src/generators/types.ts`.

### Algorithmus

Konstante: `TOLERANCE_MM = 0.01` (intern als `tol`).

**Schritt 1: Segmentieren & Snap**
- Für jede Polyline alle aufeinanderfolgenden Punktpaare als Segment emittieren.
- Bei `closed === true` zusätzlich ein Schließsegment vom letzten zum ersten Punkt anhängen.
- Jeden Punkt auf Ganzzahl-Schlüssel snappen: `(Math.round(x/tol), Math.round(y/tol))`.
- Segmente mit identischen Snap-Endpunkten (Länge 0) verwerfen.

**Schritt 2: Linien-Schlüssel**
Für jedes Segment den Schlüssel der unendlichen Geraden berechnen, auf der es liegt:
- Richtungsvektor `(dx, dy) = b − a`, normalisiert.
- Kanonisierung: Wenn `dy < 0` oder (`dy === 0` und `dx < 0`), Vorzeichen flippen. So liefern A→B und B→A denselben Schlüssel.
- Senkrechter, vorzeichenbehafteter Abstand zum Ursprung: `offset = dx * a.y − dy * a.x`.
- Schlüssel-String: `${round(dx)}|${round(dy)}|${round(offset)}` mit einer ausreichend feinen Rundung (z.B. 6 Nachkommastellen für `dx`, `dy`; Tol-Schritte für `offset`).

**Schritt 3: Pro Linie Intervalle vereinigen**
Segmente in Buckets pro Linien-Schlüssel ablegen. Für jeden Bucket:
- Jedes Segment auf den 1D-Parameter `t = (a − p0) · d` projizieren, wobei `p0` ein fixer Referenzpunkt auf der Geraden ist (z.B. erstes Segment-Endpunkt) und `d` die Einheitsrichtung.
- Resultierende `[t_min, t_max]`-Intervalle nach `t_min` sortieren.
- Überlappende oder berührende Intervalle (`next.min ≤ current.max`) zur Vereinigung mergen.
- Die gemergten Intervalle in Endpunkt-Paare zurückrechnen (`p0 + t·d`) und auf das Snap-Gitter runden, um numerischen Drift zu vermeiden.

Ergebnis: minimale Segmentmenge, die exakt dieselbe Strichmenge abdeckt.

**Schritt 4: Endpunkt-Graph**
- `adjacency: Map<nodeKey, Edge[]>`, wobei `nodeKey` der Snap-Schlüssel ist und `Edge = { to: nodeKey, used: boolean, points: [Point, Point] }`.
- Jede Kante zweimal eintragen (einmal pro Endpunkt), wobei `used` für beide Richtungen geteilt wird (per Referenz).

**Schritt 5: Greedy-Walks**
- Solange offene Kanten existieren:
  - Startknoten wählen: bevorzugt einen Knoten mit ungeradem Grad an offenen Kanten (das ist ein Pfadende). Falls keiner existiert, beliebigen Knoten mit offenen Kanten (das wird eine geschlossene Polyline).
  - Vom Startknoten aus: nächste unbenutzte Kante nehmen, Punkt anhängen, `used = true` setzen, zum Nachbarknoten gehen. Wiederholen bis keine offene Kante mehr am aktuellen Knoten.
  - Bei Sackgasse: aktuellen Walk als Polyline emittieren. `closed = (startKey === endKey && walk.length > 2)`.
- Tipp: Bei mehreren offenen Kanten an einem Knoten erst diejenige wählen, deren Richtung am ähnlichsten zur Eingangsrichtung ist (Cosinus-Ähnlichkeit). Das hält Kurven optisch zusammenhängend und vermeidet, dass eine glatte Kurve am Schnittpunkt mit einer Geraden „abbiegt".

### API

```ts
// src/util/dedupePaths.ts
export const DEDUPE_TOLERANCE_MM = 0.01;

export const dedupePaths = (
  polylines: Polyline[],
  toleranceMm: number = DEDUPE_TOLERANCE_MM,
): Polyline[];
```

```ts
// src/render/svgExport.ts
export type SvgExportOptions = { dedupe?: boolean };

export const svgExport = (art: Artwork, opts?: SvgExportOptions): string;
export const downloadSvg = (art: Artwork, filename?: string, opts?: SvgExportOptions): void;
```

### UI

`src/ui/ExportBar.tsx`:
- Neuer lokaler State `const [dedupe, setDedupe] = useState(false)`.
- Checkbox direkt links neben dem orangen SVG-Button:
  ```
  <label>
    <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} />
    Doppelpfade entfernen
  </label>
  ```
- Klick auf SVG-Button: `downloadSvg(artwork, filename, { dedupe })`.
- Keine Persistierung im Zustand-Store — reine, ephemere Export-Option.

Default ist **aus**, damit das Verhalten ohne explizite Aktion identisch bleibt.

## Fehlerfälle und Edge Cases

| Fall | Verhalten |
|------|-----------|
| Zwei identische Polylinien | Alle Segmente sind exakte Duplikate → bleiben einmal übrig. |
| Kollineare Teilüberlappung | Intervalle gemergt → Vereinigung übrig. |
| Kreuzung ohne geteilten Endpunkt | Verschiedene Linien-Schlüssel → kein Eingriff, beide Striche bleiben. |
| Geschlossene Polylinie | Schließsegment wird mit segmentiert; Re-Stitch erkennt zurückkehrenden Walk und setzt `closed: true`. |
| Dichte Kurve (rose, harmonograph) | Pro Segment eigene Richtung → eigene Buckets → keine fälschliche Vereinfachung. |
| Float-Jitter zwischen Kaleidoscope-Spiegelungen | 0.01 mm Snap löst das auf (Laser-Spot ≈ 0.1 mm). |
| Leere Eingabe (`polylines.length === 0`) | Funktion gibt `[]` zurück. |
| Polyline mit < 2 Punkten | Wird übersprungen (keine Segmente). |
| Polyline mit zwei identischen aufeinanderfolgenden Punkten | Degeneriertes Segment wird in Schritt 1 verworfen, restliche Segmente bleiben. |

## Testing

**Unit-Tests** (`src/util/dedupePaths.test.ts`, sofern Test-Setup vorhanden — falls nicht: separates Test-Setup ist nicht Teil dieser Spec, dann werden die Cases als minimale Test-Skripte unter `scripts/` abgelegt und manuell ausgeführt):

1. Zwei exakt identische Segmente → ein Segment im Output.
2. Zwei Segmente auf derselben Geraden mit Teilüberlappung → ein Segment, das die Vereinigung darstellt.
3. Drei Segmente bilden eine Kette (`A→B`, `B→C`, `C→D`) → eine Polyline mit Punkten `[A, B, C, D]`.
4. Zwei kreuzende Segmente, die keinen Endpunkt teilen → beide bleiben unverändert.
5. Geschlossenes Dreieck (drei Segmente, Endpunkte verkettet) → eine Polyline mit `closed: true`.
6. Dichte Sinuskurve aus 100 Segmenten → 100 Segmente bleiben übrig (keine fälschliche Reduktion).
7. Leere Eingabe → `[]`.
8. Float-Jitter: zwei Segmente, deren Endpunkte um 1e-9 mm differieren → werden als Duplikat erkannt.

**Manueller Test**:
- App starten, einen Generator wählen, der nach Anwendung des Kaleidoscope-Distortion ein Mandala produziert.
- Polylinien- und Punkte-Counter in der ExportBar notieren.
- SVG einmal mit deaktivierter Checkbox, einmal mit aktivierter Checkbox exportieren.
- Beide SVGs in einem Vektor-Viewer (z.B. Inkscape) öffnen, vergrößern und Symmetrieachsen prüfen — keine doppelten Linien sichtbar.
- Datei-Größe und `<path>`-Anzahl vergleichen; mit Dedup erwartet: weniger oder gleich.

## Offene Punkte

Keine. Algorithmus, Toleranz, UI-Form und Re-Stitch-Verhalten sind in der Brainstorming-Phase entschieden.
