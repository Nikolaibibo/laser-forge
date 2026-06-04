# Blueprint-Layout-Modul — Design

**Datum:** 2026-06-04
**Status:** Approved (Brainstorming-Session mit Niko)
**Herkunft:** Ersetzt das Figma-MCP-Briefing `Claude-Code-Briefing-Blueprint-Layouts.md` — Entscheidung: voll in Laser Forge statt Figma.

## Ziel

Drawscape-artige Blueprint-Kompositionen (technisches Motiv + typografischer Rahmen) direkt in Laser Forge erzeugen und als plotterfähiges SVG/G-Code exportieren. Referenz-Look: https://drawscape.io/blueprints — Mittellinien-Layout, dünne Linien, Serif-Titel, Mono/Sans-Meta, großzügiger Weißraum, dünner Begrenzungsrahmen.

**v1-Scope:** Template A "Classic Drawscape", end-to-end mit dem Caliber-Testmotiv (`Caliber_occult.svg`). Templates B (Technical Specification) + C (Editorial) sind Folge-Tickets — die Slot-Architektur legt sie bereits an.

## Entschiedene Grundsatzfragen

| Frage | Entscheidung |
|---|---|
| Figma vs. Laser Forge | **Voll in Laser Forge.** Figma-Briefing obsolet. Single-Stroke-Typo ist in Figma nicht machbar, Export-Roundtrip entfällt. |
| Typografie | **Hershey erweitern:** `timesr` (Serif), `timesrb` (Serif bold, multi-stroke), `timesi` (Serif italic) zusätzlich zu vorhandenen `futural`/`cursive` vendoren. Alles single-stroke-plotterfähig. |
| SVG-Import-Scope | **Nur vpype-Output:** flache SVGs, nur Linien (M/L-Paths, `polyline`/`line`-Elemente). Rohe SVGs (Beziers, Transforms) werden weiterhin extern via vpype aufbereitet. |
| Integration | **Generator + Motiv-Panel** (kein eigener Composer-Mode). Neuer `GeneratorDef` in neuer Gruppe "Layout", Upload-Panel nur sichtbar wenn Blueprint aktiv. |

## Architektur

### Neue Files

```
src/util/svgImport.ts            SVG-Parser: vpype-Output → Polyline[]
src/generators/blueprint.ts      GeneratorDef "blueprint" + Template-A-Layoutfunktion
src/ui/MotifPanel.tsx            Upload-Button + Dateiname + Clear
src/generators/hersheyTimesr.ts  generiert via scripts/hershey/build.ts
src/generators/hersheyTimesrb.ts generiert via scripts/hershey/build.ts
src/generators/hersheyTimesi.ts  generiert via scripts/hershey/build.ts
```

### Geänderte Files

- `src/state/store.ts` — neues State-Feld:
  ```typescript
  motif: { name: string; polylines: Polyline[]; widthMm: number; heightMm: number } | null
  ```
  plus Setter/Clear-Action.
- `src/generators/registry.ts` — neue Gruppe `"Layout"` mit `blueprint` in `GENERATOR_GROUPS`.
- `scripts/hershey/build.ts` — Font-Liste um `timesr`, `timesrb`, `timesi` erweitern.
- App-Shell (`App.tsx` o. ä.) — `MotifPanel` mounten, sichtbar nur bei aktivem Blueprint-Generator.

### Bewusste Nicht-Entscheidungen / Wiederverwendung

- **Kein neues Format-System.** Das Layout passt sich dem bestehenden Canvas (`canvasWMm`/`canvasHMm` aus der ExportBar) an. 80×80, 100×100, A5 (148×210), A4 (210×297) sind einfach Canvas-Werte; Margins/Proportionen rechnen relativ.
- **Export unverändert.** Bestehender SVG-Export (stroke-only, dedupe/merge) + G-Code (flipArtworkY, penWidthMm). vpype danach optional, aber nicht mehr nötig.
- **Text:** vorhandenes `layoutTextStrokes()` aus `src/generators/text.ts` (zentriert pro Zeile, Zeilenumbruch vorhanden).
- **Motiv-Einpassung:** vorhandenes `fitToCanvas()` aus `src/util/path.ts`.

## Generator-Params (leva)

| Param | Typ | Default | Notiz |
|---|---|---|---|
| `template` | select | `"classic"` | v1 nur Classic; B/C später |
| `header` | text | `""` | Kategorie, wird uppercased (z. B. TIMEPIECE) |
| `title` | text | `"OMEGA CALIBER 321"` | wird uppercased |
| `subtitle` | text | `""` | |
| `meta` | text | `""` | `·`-separierte Datenzeile |
| `footer` | text | `""` | |
| `titleFont` | select | `timesr` | timesr / timesrb / timesi / futural / cursive |
| `metaFont` | select | `futural` | |
| `titleHeightMm` | slider | 8 | Cap-Höhe Titel (Range 3–20) |
| `metaHeightMm` | slider | 3 | Cap-Höhe Meta/Header/Footer (Range 1.5–8) |
| `frameInsetMm` | slider | 8 | Abstand Rahmen → Canvas-Rand (Range 3–25) |
| `cornerMarks` | toggle | off | Druckmarken außerhalb der Rahmenecken |
| `motifScale` | slider | ~0.8 | Anteil der Rahmenbreite für den Motiv-Slot |
| `accentTarget` | select | `none` | none / frame / meta |
| `accentColor` | color | `#1a3a52` | "Blueprint Blue", nur wirksam wenn accentTarget ≠ none |

**Slot-Kollaps:** Leerer Text-String → Slot entfällt komplett (kein reservierter Leerraum). Pflicht laut Briefing: Motiv, Titel, Rahmen — alles andere optional.

## Template-A-Layout (Classic Drawscape)

Vertikaler, zentrierter Stack innerhalb des Rahmens:

```
┌──────────────────────────┐  ← Rahmen (single line, frameInsetMm)
│        HEADER            │  ← Caps, metaFont, klein
│   ┌──────────────┐       │
│   │  MOTIV-SLOT  │       │  ← Rest-Höhe, Motiv via fitToCanvas
│   └──────────────┘       │
│      HAUPTTITEL          │  ← Caps, titleFont, groß
│      Untertitel          │
│   Jahr · Maße · Werk     │  ← Meta, metaFont
│        Footer            │
└──────────────────────────┘
```

- Slot-Höhen werden aus den Font-Höhen + Abständen berechnet; der Motiv-Slot bekommt die verbleibende Höhe.
- Hershey kennt keine Versalien-Transformation → Header/Titel werden im Code uppercased.
- Templates B/C docken später als weitere Layoutfunktionen an dieselben Slots an (B braucht zusätzlich Meta-Tabelle + Bemaßungs-Ticks, C eine Beschreibungs-Textbox).

## SVG-Import (`src/util/svgImport.ts`)

- **Input:** SVG-String (File-Upload via `MotifPanel`).
- **Unterstützt:** `<path>` mit ausschließlich M/L/m/l/Z-Kommandos, `<polyline>`, `<polygon>`, `<line>`. `viewBox` + `width`/`height` (mm-Einheiten, vpype-Standard) für die Maß-Ableitung.
- **Nicht unterstützt (harter Fehler mit klarer Meldung):** C/Q/A-Kurvenkommandos, `transform`-Attribute, `<use>`, Text-Elemente. Meldung verweist auf vpype-Aufbereitung.
- **Output:** `{ polylines: Polyline[], widthMm, heightMm }`. Farben/Layer des Quell-SVGs werden ignoriert — Motiv rendert im Default-Pen (Akzentfarbe steuert nur Rahmen/Meta).

## Datenfluss

```
Upload → svgImport.ts → store.motif → blueprint.generate(params, seed, canvas)
       → Artwork → bestehender Preview / SVG-Export / G-Code-Export
```

Der Generator liest `store.motif` (einzige Unreinheit gegenüber dem puren Generator-Contract). Determinismus bleibt: gleiche Params + gleiches Motiv → byte-identisches SVG. `seed` ist für Template A ohne Funktion (kein Zufall im Layout), bleibt aber Teil der Signatur.

## Fehlerfälle

| Fall | Verhalten |
|---|---|
| Ungültiges / nicht-flaches SVG | Fehlermeldung im MotifPanel, voriges Motiv bleibt geladen |
| Kein Motiv geladen | Platzhalter-Box mit Diagonalkreuz im Motiv-Slot — Layout bleibt tunebar |
| Browser-Reload | Motiv weg, neu hochladen. localStorage-Cache bewusst **nicht** v1 |
| Text passt nicht in Rahmenbreite | Zeilenumbruch via vorhandenem layoutTextStrokes; wenn einzelnes Wort zu breit → Skalierung der Zeile auf Rahmenbreite |

## Verifikation

1. `tsc` typecheck nach jedem Schritt.
2. Determinismus-Check: gleiche Params + gleiches Motiv-Fixture → byte-identisches SVG (zweifacher Lauf, diff).
3. `scripts/render-demo.ts` um Motiv-Fixture-Support erweitern (Test-SVG einchecken unter `scripts/fixtures/`).
4. End-to-end: `Caliber_occult.svg` importieren → PNG-Renders für Nikos Ästhetik-Verdict → G-Code-Export → Testplot.
5. Backward-Compat: bestehende Generators unverändert (registry-Diff minimal), bestehende Exports byte-identisch.

## Selbst entschieden (Briefing-Lizenz)

- Akzentblau: `#1a3a52`
- Druckmarken: kurze Winkel außerhalb der vier Rahmenecken, 2 mm Versatz
- Font-Defaults: `timesr` (Titel) / `futural` (Meta)

## Explizit nicht in v1

- Templates B + C (Folge-Tickets)
- localStorage/IndexedDB-Persistenz des Motivs
- Beliebige SVGs (Beziers/Transforms) importieren
- Bemaßungslinien, Maßstab-Indikatoren, Meta-Tabellen (gehören zu Template B)
- Figma-Anbindung jeglicher Art
