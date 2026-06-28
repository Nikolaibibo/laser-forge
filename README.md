# Laser Forge

Persönliche Werkbank für generative Vektor-Motive. Output geht direkt in
Laser oder Plotter.

**Live:** https://laser-forge-nb.web.app

## Das Modell

```
    Basis-Generator
           ↓
      [Distortion 1]
           ↓
      [Distortion 2]
           ↓          ← Pipeline beliebig lang
           ↓
        Artwork → SVG
```

Ein Basis-Generator erzeugt ein Artwork (Polylines in mm). Optional läuft das
Artwork durch eine Pipeline aus Distortion-Layern. Alles ist
**seed-deterministisch** und **shareable** via URL-Hash.

## Basis-Generatoren

Vollständige, aktuelle Liste: **`src/generators/registry.ts`** (Single Source of
Truth). Auswahl der „Laser"-Gruppe:

| Name | Charakter |
|------|-----------|
| **Flow Field** | Tyler-Hobbs-Look, viele strömende Linien via Simplex-Noise |
| **Harmonograph** | 4 gekoppelte Pendel, ein eleganter Strich |
| **Rose / Maurer Rose** | Rhodonea-Blumen + Stern-Interferenz-Variante |
| **Spirograph** | Hypo- und Epitrochoid, klassische Sternmuster |
| **Superformula** | Gielis Formel, radiale Symmetrie von Stern bis Blob |
| **Truchet** | Tile-Grid mit Smith-Bögen oder Diagonalen, maze-artig |
| **Strange Attractor** | Clifford / De Jong / Svensson, chaotisches Garngewebe |
| **Voronoi / Delaunay** | Zellstrukturen aus Poisson-Disk-Sampling |
| **Voronoi Moiré** | Zwei Hatch-Lagen mit Winkel-Offset → Moiré, zwei Stifte |
| **Contours / Topographic** | Marching-Squares-Isolinien über ein Feld (noise/ripple/waves/quasicrystal) |
| **String Art / Modular** | Sehnen am Kreis, Hüllkurve = Kurve (Kardioide, Sternpolygone) |
| **TSP Art / Stippling** | Bild → gewichtetes Stippling → eine durchgehende Linie (2-opt) |
| **Ridgeline / Joy Division** | Gestapelte Höhenprofile mit Hidden-Line-Removal |
| **L-System** | Koch, Dragon, Plant, Sierpinski, Hilbert |
| **Differential Growth** | Anders-Hoff-artige organische Ringe |

Dazu **Space-Filling Curve** (Hilbert/Moore/Gosper/Dragon/Sierpiński, ein Strich)
in der Pen-Plotter-Gruppe sowie die Pen-Plotter- (pipes/ribbons/loops/folds/text),
Pattern-, Layout- und Import-Generatoren — siehe `registry.ts`.

**Input-getrieben:** `TSP Art` liest ein hochgeladenes Bild (IMAGE-Block im
Inspector), die Layout-/Pattern-Generatoren ein importiertes SVG (MOTIF-Block).

## Distortions (6)

| Name | Was es tut |
|------|-----------|
| **Noise Warp** | Jeden Punkt entlang Simplex-Noise-Feld verschieben |
| **Chaikin Smooth** | Ecken rekursiv abrunden (Corner Cutting) |
| **Radial Kaleidoscope** | N-fache Rotationskopien → Mandala aus jedem Input |
| **Rotate Page** | Ganzes Artwork in Viertelschritten drehen (90/270 tauschen Breite und Höhe) — z.B. Landscape-Design auf Portrait-Hardware plotten |
| **Text Knockout** | Text als Negativfläche in das darunterliegende Artwork schneiden — Muster-Hintergrund mit freistehenden Buchstaben |
| **Path Join** | Offene Polylinien, die sich Endpunkte teilen, zu langen Pfaden verketten → drastisch weniger Stift-Absetzer beim Plotten |

**Kombiniert:** Rose → Kaleidoscope(8) → Noise Warp → Chaikin = ein komplett
eigener Look aus ein paar Klicks.

## Setup

```bash
npm install
npm run dev     # http://localhost:5173
npm run build
```

## Workflow

1. Basis-Generator wählen → Parameter schrauben
2. Distortion-Layer hinzufügen (+ in PIPELINE-Panel)
3. Optional: **Dedupe paths** anhaken — entfernt überlappende Pfade (wichtig bei Kaleidoscope-Mandalas, sonst brennt der Laser sie doppelt)
4. **⬇ SVG** → Download (mm, paths-only)
5. Durch `vpype` optimieren → in LightBurn brennen — siehe [docs/laser-workflow.md](docs/laser-workflow.md)

## Architektur

```
src/
  generators/     # Basis-Generatoren (pure functions; einige lesen Store-Input)
  distortions/    # Distortion-Layer (Artwork → Artwork)
  plotter/        # GRBL (gcode) + AxiDraw-Bridge-Client + penSplit (Multi-Pen)
  render/         # Canvas-Preview + SVG-Export
  state/          # Zustand-Store + URL-Hash-Sync (motif + sourceImage)
  ui/             # Sidebar, Inspector, Pipeline, Console, Machine-Panels
  util/           # Seeded PRNG, Simplex-Noise, Polyline-Ops, imageLoad
```

**Neue Basis-Form hinzufügen:** File in `src/generators/`, in
`generators/registry.ts` eintragen. Das war's — UI + Pipeline hängen sich
automatisch dran.

**Neue Distortion hinzufügen:** File in `src/distortions/`, in
`distortions/registry.ts` eintragen. Erscheint automatisch im "+"-Menü.

## Scripts

```bash
npx tsx scripts/smoke.mjs                 # Alle Generatoren + Distortions testen
npx tsx scripts/<name>-test.ts            # Pro-Generator-Test (z.B. tsp-art-test.ts)
npx tsx scripts/render-demo.ts <id> <seed> <out.svg> [canvas=WxH] [pen=mm] [k=v]
npx tsx scripts/test-dedupe.mjs           # Path-Dedupe-Unit-Tests
npm run typecheck
```

## Plotten (AxiDraw)

Die App spricht direkt mit einem lokalen Bridge-Server (`bridge/bridge.py`, treibt
`axicli`). Am komfortabelsten läuft das auf der **gimbal-Pi Plot-Station** unter
`http://gimbal.local:4760/` — der Pi serviert App + Bridge-API auf einem Port, der
Plot läuft autonom ohne Mac. Stift-Profile, Speed/Accel, Pen-Settle-Delays und
**Plot je Farbe** (Multi-Pen, ein Pass pro `stroke`-Farbe) im AxiDraw-Panel.
Setup-Details: `bridge/README.md` + `docs/superpowers/specs/2026-06-24-pi-axidraw-plot-station-design.md`.

## Deploy

Zwei getrennte Ziele:

```bash
# 1) Plot-Station (primär): App auf den Pi (Frontend-only, kein Restart nötig)
npm run build
rsync -az --delete dist/ nikolai@gimbal.local:~/laser-forge-bridge/dist/

# 2) Öffentliches Hosting (ohne Bridge/Plotten)
npm run build
firebase deploy --only hosting --project laser-forge-nb
```

Firebase-Hosting läuft unter dem privaten Account `nikolaibibo@gmail.com` (nicht
der GoMedicus-Account). Details für beide Wege: `CLAUDE.md`.

## Referenzen

- [Tyler Hobbs — Flow Fields](https://www.tylerxhobbs.com/words/flow-fields)
- [Anders Hoff / inconvergent](https://inconvergent.net/)
- [Jason Webb — SuperformulaSVG](https://github.com/jasonwebb/SuperformulaSVG-for-web)
- [vpype](https://github.com/abey79/vpype)
- [Turtletoy](https://turtletoy.net/) · [Drawingbots.net](https://drawingbots.net/)
