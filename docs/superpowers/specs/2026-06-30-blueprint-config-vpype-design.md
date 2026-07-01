# Blueprint Configurability + vpype Backend Polish — Design

**Datum:** 2026-06-30
**Status:** Approved (Brainstorming-Session mit Niko, 2026-06-30)
**Herkunft:** Reale Plot-Erfahrung mit dem RP-1357 Mondlander-Blatt. Zwei Probleme zutage getreten:
(1) Exporte fahren Linien doppelt (~25 % der Segmente), (2) im Blueprint lassen sich praktisch nur Titel- und Meta-Größe steuern — Header/Subtitle/Footer hängen an festen Ratios, kein Seitenformat, keine Stiftbreiten-Logik. Referenzmaß: dasselbe Motiv durch `vpype linemerge linesort` ergab 893→367 Pfade und −55 % Leerweg.

## Ziel

Den Blueprint-Generator von „zwei Slider" zu **voll konfigurierbar** machen (jedes Textfeld unabhängig, Seitenformat-Presets, stiftbreiten-bewusste Typografie) und die **Linien-Doppelung dauerhaft beseitigen** — nativ per Default-Dedup, plus `vpype` als Profi-Politur im Pi-Bridge-Backend. Blueprint-Text wird zusätzlich **editierbar** im SVG abgelegt, ohne die Plot-Tauglichkeit zu verlieren.

## Entschiedene Grundsatzfragen

| Frage | Entscheidung |
|---|---|
| Doppelung beheben | **Nativ vorhandenes `dedupePaths`+`mergePaths` als Default ON** schalten (Console-Toggles existieren, default OFF). Das ist der Quick Win — kein neuer Algorithmus. |
| Profi-Politur | **vpype als Backend-Step im Pi-Bridge** (`bridge/bridge.py`, vpype bereits in `~/.venvs/vpype` installiert). Liefert `linesort` (Leerweg) + robustere Toleranz, die das native Dedup nicht abdeckt. Browser-Download bleibt nativ. |
| Konfig-Tiefe | **Voll konfigurierbar.** Jedes der 5 Textfelder bekommt eigene Größe + Sichtbarkeit + Font + Ausrichtung. Plus Seitenformat-Presets, Ränder, Rahmenstil. |
| Größen-Einheit | **% der Canvas-Höhe bleibt der gespeicherte Wert** (proportional über Formate, Constraint aus dem Layout-Kit). Neu: ein **Stiftbreiten-Feld** + abgeleiteter Mindest-Cap-Guard + UI-Warnung statt stillem Verkleinern. |
| Seitenformat | **Presets aufheben die alte „kein Format-System"-Nicht-Entscheidung.** A6/A5/A4/A3 + Hoch/Quer als Segmented-Control → setzt `canvasWMm/hMm`. Freie mm bleibt als „Custom" erhalten. |
| Text editierbar | **Dual-Layer-SVG.** Plot-Layer = Single-Stroke-Pfade (wie bisher, plotterfertig). Zusätzlich nicht-rendernder `<text>`-Layer mit echtem editierbarem Text + mm-Fontgröße. Plotter & vpype ignorieren `<text>`. Plus `<metadata>`-JSON für App-Round-Trip. |

## Hintergrund: was schon da ist (Code-Scan 2026-06-30)

- `src/util/dedupePaths.ts` — kollineare Überlapp-Intervalle mergen, Toleranz 0,01 mm. **Voll implementiert.**
- `src/util/mergePaths.ts` — Endpunkt-Verkettung, Toleranz 0,05 mm. **Voll implementiert.**
- `src/render/svgExport.ts` — `SvgExportOptions { dedupe?, join?, strokeWidthMm? }`, beide Bool default `false`.
- `src/ui/Console.tsx` — UI-Toggles für `dedupe`/`join`, default aus.
- `src/generators/blueprint.ts` — Params: `header/title/subtitle/meta/footer` (text), `titleFont/metaFont` (select), `titleSize/metaSize` (slider %), `frameInsetMm`, `cornerMarks`, `motifScale`, `motifRotation`, `accentTarget/accentColor`. Header=`metaSize`, Subtitle=`1.1×metaSize`, Footer=`0.8×metaSize` → **fest verdrahtet**.
- `src/generators/layout/kit.ts` — `drawFrame`/`textBlock`/`translateLines`/`placeMotif`, `CAP_UNITS=21`, `LINE_SPACING=1.3`, `LETTER_SPACING=2`.
- `bridge/bridge.py` — auf gimbal-Pi, `prep_svg` → `axicli`. **vpype-Einhängepunkt.**
- Stack: React 18 + TS 5.6 + Vite + Zustand + Leva (v0.9.35). Tests = `tsx`-Scripts in `scripts/`, kein Runner, keine CI. Deploy = manuell durch Niko (Firebase, Account `nikolaibibo@gmail.com`).

## Architektur

### Geänderte Files

```
src/generators/blueprint.ts      Schema: pro-Feld Größe/Sichtbarkeit/Font/Align, Stiftbreite, Format-Preset
src/generators/layout/kit.ts     textBlock um align-Param; Format-Preset → Canvas-Helper
src/state/store.ts               Format-Preset-Action (setzt canvasWMm/hMm), penWidthMm-Feld
src/render/svgExport.ts          dedupe/join default ON; Dual-Layer + <text> + <metadata>
src/ui/Console.tsx               dedupe/join default ON (UI); "Optimiert plotten (vpype)"-Hinweis
src/generators/types.ts          ggf. align in Block/Text-Helfer
bridge/bridge.py                 optionaler vpype-Preprocess vor prep_svg (env-gated)
scripts/blueprint-test.ts        neue Asserts (per-field sizing, format, pen-guard, dual-layer)
```

### Neue Files

```
src/util/pageFormats.ts          A6..A3 × Hoch/Quer → {wMm,hMm}; "custom"
src/util/blueprintMeta.ts        Blueprint-Params ⇄ <metadata>-JSON (Round-Trip)
scripts/blueprint-vpype-test.sh  (Pi/CI-optional) Vorher/Nachher-Pfadzahl asserten
```

### Bewusste Wiederverwendung / Nicht-Entscheidungen

- **Kein neuer Dedup-Algorithmus.** `dedupePaths`/`mergePaths` existieren und sind getestet — nur Default umstellen.
- **vpype läuft NUR auf dem Pi** (Python, bereits installiert). Kein WASM/JS-Port im Browser → keine neue Runtime-Dependency in der App.
- **Größen bleiben %-basiert** im Kit (Spec-Sheet teilt sich das Kit) — Stiftbreite ist additiver Guard, kein Bruch der Konvention.
- **`<text>`-Layer ist nicht plottbar** und das ist ok: der Plot-Layer trägt die Pfade, der `<text>`-Layer ist reine Editier-/Round-Trip-Hilfe.

## Generator-Params (Leva) — neu/geändert

| Param | Typ | Default | Notiz |
|---|---|---|---|
| `pageFormat` | select | `"a4-landscape"` | a6/a5/a4/a3 × hoch/quer + `custom`. Setzt `canvasWMm/hMm`. |
| `penWidthMm` | slider | 0.3 | Treibt Mindest-Cap-Guard + Warnung. |
| `headerSize` | slider % | 1.4 | **neu, unabhängig** (Range 0.5–6) |
| `headerShow` | toggle | on | Sichtbarkeit (ersetzt „leerer String = weg") |
| `subtitleSize` | slider % | 1.6 | **neu, unabhängig** |
| `subtitleShow` | toggle | on | |
| `footerSize` | slider % | 1.1 | **neu, unabhängig** |
| `footerShow` | toggle | on | |
| `titleSize` | slider % | 3.8 | bleibt |
| `metaSize` | slider % | 1.4 | bleibt |
| `textAlign` | select | `center` | left / center / right (pro Stack; v1 global) |
| `frameStyle` | select | `single` | none / single / double |
| `frameInsetMm` | slider | 8 | bleibt |
| `cornerMarks` | toggle | off | bleibt |
| `editableText` | toggle | on | `<text>`-Layer + Metadata in den Export legen |

Bestehende Felder (`header/title/subtitle/meta/footer`, `titleFont/metaFont`, `motifScale/motifRotation`, `accentTarget/accentColor`) bleiben. Die fest verdrahteten Ratios (Header/Subtitle/Footer) werden durch die unabhängigen Slider ersetzt.

## Stiftbreiten-bewusste Typografie

- Resolvierte Cap-Höhe pro Feld: `capMm = (size/100) × canvas.hMm`.
- **Mindest-Cap-Regel:** `capMm ≥ MIN_CAP_RATIO × penWidthMm` mit `MIN_CAP_RATIO = 8` (sauberer Single-Stroke-Schwellwert aus realem Plot-Test: 3 mm Cap bei 1 mm Stift = Blob; ~8 mm bei 1 mm = sauber).
- Unterschreitung → **UI-Warnung** („Titel 3 mm < empfohlen 8 mm bei 1 mm Stift") statt stillem Verkleinern. Layout verkleinert weiterhin nur, wenn es **horizontal** nicht passt (bestehende Overflow-Logik), aber meldet das ebenfalls.

## Dual-Layer-Export (editierbarer Text)

```xml
<svg ... >
  <metadata id="lf-blueprint">{"generator":"blueprint","params":{...},"version":1}</metadata>
  <g inkscape:groupmode="layer" inkscape:label="plot" id="plot">
    <path d="M ..."/>            <!-- Rahmen + Single-Stroke-Text + Motiv -->
  </g>
  <g inkscape:groupmode="layer" inkscape:label="text" id="labels" display="none">
    <text x=".." y=".." font-size="8mm" data-field="title">MANNED MOON LANDERS</text>
    ...
  </g>
</svg>
```

- **Plot-Layer** zuerst → was Plotter/vpype lesen. `<text>` wird von axicli/vpype ignoriert → kein Doppeldruck.
- **Text-Layer** `display="none"` → editierbar in Inkscape/Illustrator, kein Render-Konflikt.
- **`<metadata>`-JSON** → Laser Forge kann das SVG re-importieren und exakt diese Blueprint-Config wiederherstellen (echter Round-Trip, das ist die primäre „editierbar"-Erfüllung). Parser: `blueprintMeta.ts`.
- Steuerbar per `editableText`-Toggle (default on). Aus → reines Single-Stroke wie bisher (byte-kompatibler Pfad).

## vpype-Backend (Pi-Bridge)

- `bridge/bridge.py`: vor `prep_svg` optionaler Schritt, env-gated `LF_VPYPE=1` (+ `LF_VPYPE_BIN`, default `~/.venvs/vpype/bin/vpype`):
  `vpype read <in> linemerge --tolerance 0.1mm linesort linesimplify --tolerance 0.05mm write <out>`
- Transforms/Kurven flacht vpype ohnehin ab; bei unserem Export (reine M/L) ist es primär `linemerge`+`linesort`.
- Fällt vpype aus (nicht installiert / Fehler) → **Fallback auf das ungesäuberte SVG** mit Log-Warnung, nie Plot-Abbruch.
- Browser-Download nutzt vpype NICHT (kein Python im Browser) → dort greift das native Default-Dedup.

## Datenfluss

```
Params → blueprint.generate → Artwork(polylines)
  → svgExport(dedupe:true, join:true, editableText) → Dual-Layer-SVG
     ├─ Download (nativ gesäubert)
     └─ POST /plot → bridge.py → [LF_VPYPE? vpype linemerge linesort] → prep_svg → axicli → AxiDraw
Re-Import SVG → blueprintMeta.parse → store.genParams (Round-Trip)
```

## Fehlerfälle

| Fall | Verhalten |
|---|---|
| Cap-Höhe < Pen-Mindestmaß | UI-Warnung, Plot trotzdem möglich (User-Entscheid) |
| Text passt nicht in Breite | bestehende Zeilen-Skalierung + Hinweis |
| vpype auf Pi fehlt/fehlerhaft | Fallback auf Roh-SVG, Log-Warnung, Plot läuft |
| `<metadata>` fehlt/alt beim Re-Import | best effort: nur erkannte Felder setzen, Rest Default |
| `editableText` off | reiner Single-Stroke-Export (Kompat-Pfad) |
| Custom-Format gewählt | `canvasWMm/hMm` frei editierbar wie heute |

## Verifikation

1. `npm run typecheck` clean nach jedem Schritt.
2. `scripts/blueprint-test.ts`: per-field-Größen wirken unabhängig; `*Show=false` → Slot weg; Format-Preset setzt korrekte mm; Pen-Guard meldet bei zu klein; Dual-Layer = Plot-Layer Pfadzahl unverändert + `<text>` zählt zur Feldanzahl; Determinismus (gleiche Params → byte-identisch).
3. Default-Dedup-Regression: RP-1357-Export erneut → Segment-Overlap von ~25 % auf ~0 %.
4. Round-Trip: Export → Re-Import → Params identisch (diff).
5. Pi-E2E: `LF_VPYPE=1` Plot eines Blueprints; Pfadzahl vorher/nachher geloggt; `/stop` hebt Pen; vpype-Ausfall → Fallback-Plot.
6. Backward-Compat: `editableText=off` + dedupe/join wie alt → bestehende Exporte unverändert.

## Selbst entschieden (Brainstorming-Lizenz)

- `MIN_CAP_RATIO = 8` (aus realem Plot-Test abgeleitet).
- vpype-Pipeline: `linemerge 0.1mm → linesort → linesimplify 0.05mm`.
- `<text>`-Layer `display="none"` statt eigener nicht-Plot-Farbe (sauberste Trennung).
- Default-Format `a4-landscape` (entspricht dem real geplotteten Blatt).

## Explizit nicht in v1

- Per-Feld eigene X/Y-Position oder Drag-Editor (Stack bleibt; `textAlign` global).
- vpype `occult` (Hidden-Line-Removal) — separater Schritt, hier nicht nötig.
- localStorage-Persistenz der Blueprint-Config (Round-Trip läuft über SVG-`<metadata>`).
- Echte editierbare `<text>`-→-Stroke-Rückwandlung im Browser (Editing-Surface bleibt die App).
- GRBL-Pen-Plotter-Bridge (andere Maschine).
