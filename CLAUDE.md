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

## Konventionen

- **Einheit ist mm.** Alle Koordinaten, Margins, Toleranzen sind in mm.
- **RNG immer über `src/util/random.ts`** (`makeRng(seed)` → seedet `alea`). Niemals `Math.random()`.
- **fitToCanvas** aus `src/util/path.ts` skaliert Polylinien in den verfügbaren Bereich mit Margin — fast jeder Generator nutzt das am Ende.
- **Polylinien** sind `{ points: Point[]; closed: boolean }`. Punkte sind `[number, number]`-Tupel. Keine Klassen.

## Testing

Es gibt **kein Test-Framework** (kein Vitest, kein Jest). Tests sind Node-Scripts unter `scripts/`, ausgeführt mit `npx tsx scripts/<name>.mjs`. Bei Assertion-Fehler `process.exit(1)`. Pattern: siehe `scripts/test-dedupe.mjs` (Assertion-Helper + 12 Tests) und `scripts/smoke.mjs` (Generator-Iteration).

Wenn du Tests für ein neues Feature schreibst: füge sie als eigenes Script in diesem Stil hinzu. Smoke testet alle Generatoren automatisch, du musst nichts dort ergänzen.

## Deploy

Firebase Hosting auf Projekt `laser-forge-nb`. **Wichtig:** Das Projekt gehört dem privaten Account `nikolaibibo@gmail.com`, NICHT `nikolai@gomedicusgroup.com`. Vor jedem Deploy `firebase login:list` checken — der GoMedicus-Account hat keinen Zugriff und der Deploy schlägt fehl.

```bash
npm run build && firebase deploy --only hosting --project laser-forge-nb
```

## Git

Remote: `https://github.com/Nikolaibibo/laser-forge.git`, Branch `main`. Commits nur wenn der User explizit fragt. Push genauso.

## Path-Dedupe-Feature

Beim SVG-Export gibt es einen optionalen "Dedupe paths"-Toggle, der überlappende Pfade entfernt, damit der Laser sie nicht doppelt brennt — Motivation war Kaleidoscope-Mandalas mit verbrannten Spiegelachsen. Die Logik sitzt in `src/util/dedupePaths.ts` (pure Funktion: snap auf 0.01 mm Grid, kollineare Intervalle vereinigen, greedy zu langen Polylinien restitchen). Spec/Plan unter `docs/superpowers/`.

## Spec-/Plan-Workflow

Größere Features bekommen vorher eine Spec und einen Plan unter `docs/superpowers/specs/` bzw. `docs/superpowers/plans/`, datiert. Pattern: `YYYY-MM-DD-<topic>-design.md` für Specs, `YYYY-MM-DD-<topic>.md` für Plans. Bestehende Beispiele zeigen den Stil.
