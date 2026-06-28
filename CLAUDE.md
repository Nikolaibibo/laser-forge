# CLAUDE.md — laser-forge

Knappes Briefing für Claude. Nur Sachen, die aus dem Code nicht direkt offensichtlich sind.

## Was das Projekt ist

Browser-Tool zum Generieren von Vektor-Motiven für Laser/Plotter. Alles wird auf einen mm-basierten Canvas gerendert und als SVG mit reinen `<path>`-Elementen exportiert.

## Code-Pattern: Generatoren und Distortionen

Beide folgen demselben Muster:

- Eine Datei pro Generator/Distortion unter `src/generators/` bzw. `src/distortions/`
- Exportiert ein `GeneratorDef` / `DistortionDef` aus `src/generators/types.ts`
- Wird in `registry.ts` registriert — UI hängt sich automatisch dran
- `generate(params, seed, canvas)` → `Artwork` (Generator)
- `apply(artwork, params, seed)` → `Artwork` (Distortion)

`src/generators/rose.ts` ist das beste Referenzbeispiel — saubere parametrische Kurve mit Variant-Switch.

### Distortions (Stand: Juni 2026)

Aktuelle Liste aus `src/distortions/registry.ts`:

| Id | Name | Was es tut |
|----|------|-----------|
| `noise-warp` | Noise Warp | Punkt-für-Punkt Verschiebung entlang Simplex-Noise-Feld |
| `chaikin` | Chaikin Smooth | Rekursives Corner-Cutting |
| `kaleidoscope` | Radial Kaleidoscope | N-fache Rotationskopien → Mandala |
| `text-knockout` | Text Knockout | Text als Negativfläche ins Artwork schneiden; nutzt Hershey-Fonts und Occlusion-Engine (`src/util/occlusion.ts`) |
| `rotate` | Rotate Page | Viertelschritt-Rotation des ganzen Artworks inkl. Seiten-Abmessungen; 90/270 tauschen `widthMm`/`heightMm` |
| `path-join` | Path Join | Verkettet offene Polylinien an gemeinsamen Endpunkten zu langen Pfaden (weniger Stift-Absetzer); Kern in `src/util/mergePaths.ts` |

### Generator-Klassen (Stand: Juni 2026)

Aktuelle, vollständige Liste immer aus `registry.ts` lesen — NICHT aus diesem Doc.

- **Pure** (Default): `generate(params, seed, canvas)` ohne Außenwelt. Mehrheit der Generatoren.
- **Store-lesend (input-driven):** manche lesen den Zustand-Store direkt via `useApp.getState()`:
  - `motif` — importiertes **Vektor**-SVG (Consumers: blueprint, specsheet, patternMaker, svg). Liste = `MOTIF_CONSUMERS` im Inspector.
  - `sourceImage` — importiertes **Raster**-Bild als Luminanz-Gitter (Consumer: `tspArt`). Liste = `IMAGE_CONSUMERS` im Inspector. Decode passiert in `src/util/imageLoad.ts` via `<canvas>` → **browser-only**. Bild-getriebene Generatoren MÜSSEN einen prozeduralen Fallback haben, sonst sind sie headless (tsx-Tests/render-demo) nicht renderbar (siehe `proceduralField` in `tspArt.ts`).
- **Mehrfarbig / Multi-Pen:** `Polyline.stroke` trägt eine Pro-Stift-Farbe. Ein Artwork kann mehrere Farben enthalten (z.B. `voronoiMoire` = zwei Hatch-Lagen). `src/plotter/penSplit.ts` (`splitByStroke`) teilt nach Farbe → der Plotter fährt eine Lage pro Stift.
- **Geometrie-Wiederverwendung:** d3-delaunay (Voronoi/Delaunay), Konvex-Hatch + Sutherland-Hodgman-Inset in `voronoiMoire.ts`, Marching-Squares + Stitch in `contours.ts` (feld-agnostisch — neue Felder = neue Effekte), L-System-Turtle in `spaceFilling.ts`.

## Konventionen

- **Einheit ist mm.** Alle Koordinaten, Margins, Toleranzen sind in mm.
- **RNG immer über `src/util/random.ts`** (`makeRng(seed)` → seedet `alea`). Niemals `Math.random()`.
- **fitToCanvas** aus `src/util/path.ts` skaliert Polylinien in den verfügbaren Bereich mit Margin — fast jeder Generator nutzt das am Ende.
- **Polylinien** sind `{ points: Point[]; closed: boolean }`. Punkte sind `[number, number]`-Tupel. Keine Klassen.

## Testing

Es gibt **kein Test-Framework** (kein Vitest, kein Jest). Tests sind Node-Scripts unter `scripts/`, ausgeführt mit `npx tsx scripts/<name>`. Sowohl `.mjs` (ältere, mit `node:assert`/eigenem Helper) als auch `.ts` (neuere, `import assert from "node:assert/strict"`) — beide laufen über `tsx`. Bei Assertion-Fehler wirft/exit≠0. Referenz: `scripts/test-dedupe.mjs` (Helper-Stil) und z.B. `scripts/voronoi-moire-test.ts` / `scripts/tsp-art-test.ts` (Generator-Stil: Dimensionen, Determinismus, Geometrie-Invarianten, Clamping).

Konvention: **jeder neue Generator bekommt ein eigenes `scripts/<name>-test.ts`.** `scripts/smoke.mjs` iteriert zusätzlich alle Generatoren automatisch — dort musst du nichts ergänzen. Vor Commit immer `npx tsc -b --noEmit`.

**Headless-Renders zum Ästhetik-Check:** `npx tsx scripts/render-demo.ts <genId> <seed> <out.svg> [canvas=WxH] [pen=mm] [k=v …]` → SVG, dann `rsvg-convert -b white -w 700 out.svg -o out.png`. Param-Overrides werden gegen die Defaults gecoerct; `pen=` setzt die Export-Strichbreite (kein Generator-Param). Bild-getriebene Generatoren rendern headless nur mit prozeduraler Quelle (kein `<canvas>`-Decode in Node).

## Deploy — ZWEI getrennte Ziele

1. **gimbal-Pi Plot-Station** (primär fürs Plotten) — `http://gimbal.local:4760/`.
   Der Pi läuft `bridge/bridge.py` als systemd-Service `laser-forge-bridge.service`
   und serviert die gebaute App (`dist/`) auf demselben Port (same-origin → kein
   Mixed-Content, Plotten geht direkt vom Pi). **Kein git-Clone auf dem Pi** —
   ein flaches Verzeichnis `/home/nikolai/laser-forge-bridge/` mit `bridge.py` +
   `dist/`. Deploy = Dateien rüberkopieren (SSH-User `nikolai`, alle Heim-Pis
   gleiches Passwort):
   ```bash
   npm run build
   rsync -az --delete dist/ nikolai@gimbal.local:~/laser-forge-bridge/dist/
   ```
   `dist/` wird pro Request frisch gelesen → **reiner Frontend-Deploy braucht
   KEINEN Service-Restart.** Nur bei Python-Änderungen an `bridge.py`:
   ```bash
   scp bridge/bridge.py nikolai@gimbal.local:~/laser-forge-bridge/bridge.py
   ssh nikolai@gimbal.local 'sudo systemctl restart laser-forge-bridge.service'
   ```
   Vor dem Überschreiben von `bridge.py` einmal gegen die Repo-Version diffen —
   die Pi-Version soll byte-identisch sein (Host/Port kommen aus systemd-Env-Vars,
   nicht aus Code-Patches).

2. **Firebase Hosting** (öffentlich, OHNE Bridge/Plotten) — https://laser-forge-nb.web.app
   Projekt `laser-forge-nb` unter dem PRIVATEN Account `nikolaibibo@gmail.com`
   (NICHT GoMedicus). `firebase login:list` checken, sonst schlägt der Deploy fehl.
   Diesen Deploy macht Nikolai i.d.R. **manuell**:
   ```bash
   npm run build && firebase deploy --only hosting --project laser-forge-nb
   ```

## AxiDraw-Bridge (Plotten)

`bridge/bridge.py` = lokaler HTTP-Server, der `axicli` (pyaxidraw) treibt.
TS-Client `src/plotter/axidrawBridge.ts`, UI `src/ui/AxiDrawPanel.tsx`. Pendant
für GRBL/WebSerial = `src/ui/PlotterPanel.tsx`.

- Läuft am Mac (für `npm run dev` auf Port 5173/4173 → Bridge auf `127.0.0.1:4760`)
  ODER auf dem gimbal-Pi (serviert dort auch die App, same-origin). Base-URL-Logik
  in `axidrawBridge.ts`.
- Stift-**Profile** (pencil/felt/gel) + Override-Query-Params: `speed`, `accel`,
  `delay_down`/`delay_up` (Pen-Settle in ms). Clone = model 6, invertierter Servo,
  voller Hub — `PROFILES` + Kommentare in `bridge.py` NICHT ohne Hardware-Test ändern.
- **Plot je Farbe** (Multi-Pen): `splitByStroke` teilt nach `Polyline.stroke`,
  plottet eine Lage pro Farbe, Pen-up + `confirm`-Dialog für den Stiftwechsel
  zwischen den Lagen, Origin bleibt erhalten (kein Re-Home). In `AxiDrawPanel`
  und `PlotterPanel` gespiegelt.

## Git

Remote: `https://github.com/Nikolaibibo/laser-forge.git`, Branch `main`. Commits nur wenn der User explizit fragt. Push genauso.

## Path-Dedupe-Feature

Beim SVG-Export gibt es einen optionalen "Dedupe paths"-Toggle, der überlappende Pfade entfernt, damit der Laser sie nicht doppelt brennt — Motivation war Kaleidoscope-Mandalas mit verbrannten Spiegelachsen. Die Logik sitzt in `src/util/dedupePaths.ts` (pure Funktion: snap auf 0.01 mm Grid, kollineare Intervalle vereinigen, greedy zu langen Polylinien restitchen). Spec/Plan unter `docs/superpowers/`.

## Spec-/Plan-Workflow

Größere Features bekommen vorher eine Spec und einen Plan unter `docs/superpowers/specs/` bzw. `docs/superpowers/plans/`, datiert. Pattern: `YYYY-MM-DD-<topic>-design.md` für Specs, `YYYY-MM-DD-<topic>.md` für Plans. Bestehende Beispiele zeigen den Stil.
