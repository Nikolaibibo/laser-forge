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

## Basis-Generatoren (10)

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
| **L-System** | Koch, Dragon, Plant, Sierpinski, Hilbert |
| **Differential Growth** | Anders-Hoff-artige organische Ringe |

## Distortions (3)

| Name | Was es tut |
|------|-----------|
| **Noise Warp** | Jeden Punkt entlang Simplex-Noise-Feld verschieben |
| **Chaikin Smooth** | Ecken rekursiv abrunden (Corner Cutting) |
| **Radial Kaleidoscope** | N-fache Rotationskopien → Mandala aus jedem Input |

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
  generators/     # Basis-Generatoren (pure functions)
  distortions/    # Distortion-Layer (Artwork → Artwork)
  render/         # Canvas-Preview + SVG-Export
  state/          # Zustand-Store + URL-Hash-Sync
  ui/             # Sidebar, LayerStack, Leva-Panel, Export-Bar
  util/           # Seeded PRNG, Simplex-Noise, Polyline-Ops
```

**Neue Basis-Form hinzufügen:** File in `src/generators/`, in
`generators/registry.ts` eintragen. Das war's — UI + Pipeline hängen sich
automatisch dran.

**Neue Distortion hinzufügen:** File in `src/distortions/`, in
`distortions/registry.ts` eintragen. Erscheint automatisch im "+"-Menü.

## Scripts

```bash
npx tsx scripts/smoke.mjs          # Alle Generatoren + Distortions testen
npx tsx scripts/test-dedupe.mjs    # Path-Dedupe-Unit-Tests
npx tsx scripts/export-test.mjs    # Sample-SVGs nach /tmp/laser-forge-samples/
npm run typecheck
```

## Deploy

```bash
npm run build
firebase deploy --only hosting --project laser-forge-nb
```

Hosting läuft unter `nikolaibibo@gmail.com` (nicht der GoMedicus-Account).

## Referenzen

- [Tyler Hobbs — Flow Fields](https://www.tylerxhobbs.com/words/flow-fields)
- [Anders Hoff / inconvergent](https://inconvergent.net/)
- [Jason Webb — SuperformulaSVG](https://github.com/jasonwebb/SuperformulaSVG-for-web)
- [vpype](https://github.com/abey79/vpype)
- [Turtletoy](https://turtletoy.net/) · [Drawingbots.net](https://drawingbots.net/)
