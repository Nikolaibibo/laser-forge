# Laser / Plotter Workflow

Laser Forge exportiert bewusst "nacktes" SVG. Die Optimierung für die Maschine
passiert nachgelagert — dafür gibt es bessere Tools.

## Was die App liefert

- `<svg>` mit `viewBox="0 0 {widthMm} {heightMm}"` und `width/height` in `mm`
- nur `<path>`-Elemente, keine Texte, keine Gradienten, keine Fills
- schwarzer Stroke, 0.3 mm Default-Breite, `fill="none"`
- Dateiname: `{generatorId}-{seed}.svg`

Das heißt: alles, was du siehst, ist bereits laser-/plotter-kompatibel.

## vpype als Post-Processor

[vpype](https://github.com/abey79/vpype) ist der De-facto-Standard für SVG-
Optimierung in der Plotter-Szene. Installation:

```bash
pipx install vpype
# oder
pip install vpype
```

Empfohlene Pipeline für ein Laser-Forge-Export:

```bash
vpype read forge-output.svg \
  linemerge --tolerance 0.1mm \
  linesort \
  reloop \
  linesimplify --tolerance 0.05mm \
  write forge-optimized.svg
```

Was jeder Schritt tut:

- **linemerge** — verbindet Linien, die sich fast berühren (weniger Pen-Up-Bewegungen)
- **linesort** — optimiert die Reihenfolge der Linien (Traveling-Salesman-Heuristik,
  reduziert Leerwege)
- **reloop** — setzt Startpunkt geschlossener Pfade auf den nächstgelegenen Punkt
  zur vorherigen Endposition
- **linesimplify** — entfernt redundante Punkte auf fast-geraden Segmenten

Bei komplexen Flow-Field-Ergebnissen (1000+ Linien) spart `linesort` gerne 30-50 %
der Gravurzeit.

### vpype GUI

Für eine visuelle Vorschau:

```bash
vpype read forge-output.svg linemerge linesort show
```

## LightBurn Import

1. In LightBurn: **File → Import** → das optimierte SVG auswählen.
2. LightBurn importiert alles auf einen Layer (meistens C00, schwarz).
3. **Operation wählen:**
   - **Fill Engrave** (Flächengravur) — nicht sinnvoll bei Strichzeichnungen
   - **Line** (Stroke-Gravur) ← das willst du meistens
   - **Line + Fill** — wenn der Pfad geschlossen ist
4. **Multiple Operations:** Wenn du Cut und Engrave mischen willst, weise
   in LightBurn selbst unterschiedlichen Elementen unterschiedliche Layer zu
   (Rechtsklick → Layer). Laser Forge trennt in V1 nicht automatisch.

### Parameter-Startwerte (nicht verbindlich)

| Material | Line Speed | Line Power |
|----------|-----------:|-----------:|
| 3 mm Sperrholz Pappel, Stroke | 2000 mm/min | 25 % |
| 3 mm Sperrholz, Cut | 300 mm/min | 80 % |
| Akryl 3 mm, Stroke | 2000 mm/min | 20 % |
| Papier 200 g/m², Stroke | 3500 mm/min | 12 % |

**Immer auf Restmaterial probieren.** Leistungen variieren stark nach Laser-Typ
und Fokus.

## Pen-Plotter (AxiDraw etc.)

Die SVG-Datei lässt sich direkt in den AxiDraw-Inkscape-Plugin oder in
[saxi](https://github.com/nornagon/saxi) laden. Pro-Tipp: nach vpype `penup`-
Travel so weit wie möglich reduzieren, sonst läuft der Plotter ewig leer.

## Troubleshooting

- **"LightBurn zeigt nur ein Rechteck"** — der viewBox ist da, aber die Paths
  sind außerhalb. Prüf `marginMm`-Parameter, evtl. negativ/zu groß.
- **"Linien doppelt gefahren"** — vpype `linemerge` hat die Berührpunkte nicht
  erkannt. `--tolerance` höher setzen (z.B. 0.3mm).
- **"Laser schließt den Pfad nicht"** — bei Flow-Field-Linien ist das richtig
  (sind offene Linien). Bei Voronoi-Cells sollte der Pfad mit `Z` enden — steht
  in der SVG-Ausgabe drin.
