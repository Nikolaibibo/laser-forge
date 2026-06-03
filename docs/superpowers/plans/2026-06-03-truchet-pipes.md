# Truchet Pipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Spec:** `docs/superpowers/specs/2026-06-03-truchet-pipes-design.md`

**Goal:** Ein „Truchet Pipes"-Generator im plotterpen-Stil: Kachelfeld (Geraden + 90°-Bögen) → durchgehende Pipes als dichte Parallel-Bänder, Farbe pro Component. Plus minimale Farb-Infra (`Polyline.stroke?` + Preview + SVG), damit das Ergebnis in Farbe sichtbar ist.

**Architecture:** Kachelfeld erzeugt pro Zelle 2 Striche (offene Polylinien). **Component-Tracing = `mergePaths`-Reuse** (Striche teilen exakte Kantenmittelpunkte → werden zu durchgehenden Centerlines verkettet). Jede Centerline → `offsetPath` → K-Spur-Band → Farbe → `fitToCanvas`.

**Invarianten:** mm · `makeRng(seed)` only (nie `Math.random`) · `fitToCanvas` am Ende · additiv (`stroke?` optional, mono bleibt identisch) · tsx-Tests unter `scripts/` · nach jedem Task `npm run typecheck` grün.

---

## Task 1: Farb-Infra — `Polyline.stroke?` + Preview + SVG

**Files:**
- Modify: `src/generators/types.ts`, `src/render/CanvasPreview.tsx`, `src/render/svgExport.ts`
- Test: `scripts/stroke-test.mjs`

- [ ] **Step 1: `Polyline.stroke?`**

In `src/generators/types.ts`:
```ts
export type Polyline = {
  points: Point[];
  closed: boolean;
  stroke?: string; // CSS/Hex-Farbe; undefined = Default-Stift
};
```

- [ ] **Step 2: Preview honoriert stroke**

In `src/render/CanvasPreview.tsx`, in der Zeichenschleife pro Polyline vor `ctx.beginPath()`:
```tsx
ctx.strokeStyle = line.stroke ?? "#111";
```
(Das vorhandene `ctx.strokeStyle = "#111"` vor der Schleife kann bleiben; der per-Polyline-Set überschreibt es.)

- [ ] **Step 3: SVG per-path stroke**

In `src/render/svgExport.ts`, in der `.map`-Funktion, die `<path>`-Strings baut: wenn `l.stroke` gesetzt ist, ein `stroke="…"`-Attribut anhängen, sonst unverändert (erbt das globale Schwarz des `<svg>`):
```ts
return l.stroke
  ? `<path d="${d}" stroke="${l.stroke}"/>`
  : `<path d="${d}"/>`;
```

- [ ] **Step 4: Failing test zuerst** (`scripts/stroke-test.mjs`)

```js
// scripts/stroke-test.mjs
import { svgExport } from "../src/render/svgExport.ts";
let failed = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); failed++; } };

const art = {
  widthMm: 100, heightMm: 100,
  polylines: [
    { points: [[0,0],[10,10]], closed: false },                    // mono
    { points: [[0,0],[20,20]], closed: false, stroke: "#e0584f" }, // colored
  ],
};
const svg = svgExport(art);
ok(svg.includes('stroke="#e0584f"'), "colored polyline emits per-path stroke");
ok((svg.match(/<path /g) || []).length === 2, "two paths emitted");
// Mono-Pfad bekommt KEIN eigenes stroke-Attribut (erbt global):
const monoPath = svg.split("\n").find((l) => l.includes('d="M 0,0 L 10,10"'));
ok(monoPath && !monoPath.includes("stroke="), "mono polyline has no per-path stroke");

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
```

Order: write test → run (`npx tsx scripts/stroke-test.mjs`) → confirm it fails against the *current* mono svgExport (no stroke attr) → implement Steps 1-3 → rerun → ALL PASS.

- [ ] **Step 5: Regression + typecheck**

Run: `npx tsx scripts/stroke-test.mjs` → ALL PASS
Run: existing `npx tsx scripts/export-test.mjs` → still green (mono output unchanged)
Run: `npm run typecheck` → clean

- [ ] **Step 6: Commit**

```bash
git add src/generators/types.ts src/render/CanvasPreview.tsx src/render/svgExport.ts scripts/stroke-test.mjs
git commit -m "feat(color): optional Polyline.stroke honored in preview + svg (additive, mono unchanged)"
```

---

## Task 2: `pipes` Generator — Kachelfeld → Components → Bänder → Farbe

**Files:**
- Create: `src/generators/pipes.ts`
- Modify: `src/generators/registry.ts` (add `pipes`, remove `meander` from GENERATORS — keep meander.ts file)
- Test: `scripts/pipes-test.mjs`

- [ ] **Step 1: Failing test** (`scripts/pipes-test.mjs`)

```js
// scripts/pipes-test.mjs
import { pipes } from "../src/generators/pipes.ts";
let failed = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); failed++; } };

const canvas = { wMm: 200, hMm: 200 };
const p = { ...pipes.defaults };
const a1 = pipes.generate(p, 7, canvas);
const a2 = pipes.generate(p, 7, canvas);

ok(a1.widthMm === 200 && a1.heightMm === 200, "artwork carries canvas size");
ok(a1.polylines.length > 0, "produces polylines");
ok(JSON.stringify(a1) === JSON.stringify(a2), "deterministic: same seed → identical");
ok(JSON.stringify(a1) !== JSON.stringify(pipes.generate(p, 99, canvas)), "seed changes output");
ok(a1.polylines.every((l) => l.points.length >= 2), "no degenerate polylines");

// in-bounds
const m = p.marginMm;
ok(a1.polylines.every((l) => l.points.every(([x,y]) => x>=m-1 && x<=200-m+1 && y>=m-1 && y<=200-m+1)),
   "all points within margin");

// colorFraction = 0 → no polyline carries stroke
const mono = pipes.generate({ ...p, colorFraction: 0 }, 7, canvas);
ok(mono.polylines.every((l) => l.stroke === undefined), "colorFraction 0 → all mono");

// colorFraction = 1 → at least some polylines carry a stroke
const colored = pipes.generate({ ...p, colorFraction: 1 }, 7, canvas);
ok(colored.polylines.some((l) => typeof l.stroke === "string"), "colorFraction 1 → some colored");

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run test → RED** (`npx tsx scripts/pipes-test.mjs`, module missing).

- [ ] **Step 3: Implement `src/generators/pipes.ts`**

```ts
// src/generators/pipes.ts
import type { GeneratorDef, Point, Polyline } from "./types";
import { makeRng, type RNG } from "../util/random";
import { fitToCanvas } from "../util/path";
import { offsetPath, symmetricOffsets } from "../util/offset";
import { mergePaths } from "../util/mergePaths";

type Params = {
  cols: number;
  rows: number;
  lanes: number;
  laneSpacingMm: number;
  straightness: number;   // 0..1 Anteil Kreuz-Kacheln
  colorFraction: number;  // 0..1 Anteil farbiger Components
  arcSamples: number;
  marginMm: number;
};

const DEFAULTS: Params = {
  cols: 14, rows: 18, lanes: 6, laneSpacingMm: 0.7,
  straightness: 0.55, colorFraction: 0.35, arcSamples: 14, marginMm: 15,
};

const PALETTE = ["#e0584f", "#4f86e0", "#5fcaa8"]; // Default-Pipes grau (#9a9a9a)
const GREY = "#9a9a9a";

/** Sampelt einen Bogen (a0→a1, n Segmente) um (cx,cy) mit Radius r. */
function sampleArc(cx: number, cy: number, a0: number, a1: number, r: number, n: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return pts;
}

/** Liefert die zwei Striche (offene Punktlisten) einer Kachel. y zeigt nach unten (Screen-Konvention). */
function tileStrokes(
  kind: "cross" | "arcA" | "arcB",
  x0: number, y0: number, c: number, arcSamples: number,
): Point[][] {
  const r = c / 2;
  const N: Point = [x0 + r, y0], S: Point = [x0 + r, y0 + c];
  const W: Point = [x0, y0 + r], E: Point = [x0 + c, y0 + r];
  if (kind === "cross") {
    return [[N, S], [W, E]];
  }
  if (kind === "arcA") {
    // N–E um NE-Ecke (a0=π → a1=π/2), S–W um SW-Ecke (a0=0 → a1=−π/2)
    return [
      sampleArc(x0 + c, y0, Math.PI, Math.PI / 2, r, arcSamples),
      sampleArc(x0, y0 + c, 0, -Math.PI / 2, r, arcSamples),
    ];
  }
  // arcB: N–W um NW-Ecke (a0=0 → a1=π/2), S–E um SE-Ecke (a0=π → a1=3π/2)
  return [
    sampleArc(x0, y0, 0, Math.PI / 2, r, arcSamples),
    sampleArc(x0 + c, y0 + c, Math.PI, (3 * Math.PI) / 2, r, arcSamples),
  ];
}

export const pipes: GeneratorDef<Params> = {
  id: "pipes",
  name: "Truchet Pipes",
  description:
    "Kachelfeld aus Geraden + 90°-Bögen; durchgehende Pipes als dichte Parallel-Bänder. straightness steuert die Länge der Geraden; colorFraction färbt einen Teil der Pipes. Reseed mischt das Feld neu.",
  defaults: DEFAULTS,
  schema: {
    cols: { value: DEFAULTS.cols, min: 3, max: 40, step: 1 },
    rows: { value: DEFAULTS.rows, min: 3, max: 40, step: 1 },
    lanes: { value: DEFAULTS.lanes, min: 2, max: 16, step: 1 },
    laneSpacingMm: { value: DEFAULTS.laneSpacingMm, min: 0.3, max: 3, step: 0.1 },
    straightness: { value: DEFAULTS.straightness, min: 0, max: 1, step: 0.05 },
    colorFraction: { value: DEFAULTS.colorFraction, min: 0, max: 1, step: 0.05 },
    arcSamples: { value: DEFAULTS.arcSamples, min: 4, max: 32, step: 1 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
  },
  generate: (p, seed, canvas) => {
    const rng = makeRng(seed);
    const cols = Math.max(2, Math.floor(p.cols));
    const rows = Math.max(2, Math.floor(p.rows));
    // Zelle groß genug, dass das Band in den Bogen passt (Radius c/2 ≥ Bandhälfte + Spielraum).
    const bandHalf = ((p.lanes - 1) * p.laneSpacingMm) / 2;
    const c = Math.max(10, (bandHalf + 2 * p.laneSpacingMm) * 2);

    // 1) Alle Tile-Striche erzeugen (row-major, deterministisch).
    const strokes: Polyline[] = [];
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const kind = rng() < p.straightness ? "cross" : (rng() < 0.5 ? "arcA" : "arcB");
        for (const pts of tileStrokes(kind, cx * c, cy * c, c, p.arcSamples)) {
          strokes.push({ points: pts, closed: false });
        }
      }
    }

    // 2) Component-Tracing via mergePaths-Reuse (Striche teilen exakte Kantenmittelpunkte).
    const components = mergePaths(strokes, 1e-3);

    // 3) Pro Component: Farbe würfeln, in K Spuren offsetten, stroke setzen.
    const offsets = symmetricOffsets(p.lanes, p.laneSpacingMm);
    let colorIdx = 0;
    const all: Polyline[] = [];
    for (const comp of components) {
      // geschlossene Schleife → an einem Punkt aufschneiden (offene Centerline)
      const center = comp.closed ? [...comp.points, comp.points[0]] : comp.points;
      const colored = rng() < p.colorFraction;
      const stroke = colored ? PALETTE[colorIdx++ % PALETTE.length] : undefined;
      const band = offsetPath(center, offsets, { minInnerRadiusMm: p.laneSpacingMm });
      for (const lane of band) {
        all.push(stroke ? { ...lane, stroke } : lane);
      }
    }
    void GREY; // Default-Pipes bleiben undefined (= Preview #111 / SVG global); GREY reserviert für späteres explizites Grau

    const fitted = fitToCanvas(all, canvas.wMm, canvas.hMm, p.marginMm);
    return { polylines: fitted, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
```

> **Hinweis zum Implementierer:** `fitToCanvas` muss `stroke` erhalten. Prüfe `src/util/path.ts`: falls `fitToCanvas` neue Polyline-Objekte baut und `stroke` weglässt, ergänze dort das Durchreichen von `stroke` (`stroke: l.stroke`) — minimal, additiv. Verifiziere das, sonst schlägt der `colorFraction`-Test fehl.

- [ ] **Step 4: Registrieren + meander entfernen**

In `src/generators/registry.ts`: `import { pipes } from "./pipes";`, `pipes` ins `GENERATORS`-Array. **Entferne** `meander` aus dem Array und den `meander`-Import (die Datei `meander.ts` bleibt liegen).

- [ ] **Step 5: Tests grün**

Run: `npx tsx scripts/pipes-test.mjs` → ALL PASS
Run: `npx tsx scripts/smoke.mjs` → grün (pipes valid, meander nicht mehr gelistet)
Run: `npm run typecheck` → clean

- [ ] **Step 6: Geometrie-Sanity (zusätzlicher Test in pipes-test.mjs)**

Bogen-Endpunkte müssen exakt auf den Kantenmittelpunkten landen (sonst verkettet mergePaths nicht). Vor `console.log` ergänzen:
```js
// Bei straightness 0 (nur Bögen) müssen Components entstehen, d.h. mergePaths verkettet:
// Anzahl Components < Anzahl Roh-Striche (2·cols·rows) ⇒ Verkettung griff.
const arcsOnly = pipes.generate({ ...p, straightness: 0, colorFraction: 0 }, 7, canvas);
const rawStrokes = 2 * Math.floor(p.cols) * Math.floor(p.rows) * p.lanes; // grobe Obergrenze
ok(arcsOnly.polylines.length < rawStrokes, "mergePaths chained strokes into fewer, longer components");
```

- [ ] **Step 7: Commit**

```bash
git add src/generators/pipes.ts src/generators/registry.ts scripts/pipes-test.mjs
# falls fitToCanvas angepasst: git add src/util/path.ts
git commit -m "feat(generator): truchet pipes (tile field → mergePaths components → offset bands → per-component color)"
```

---

## Self-Review

**Spec-Coverage:** Kachel-Modell (cross/arcA/arcB) → Task 2 Step 3 `tileStrokes`; Kontinuität via gemeinsame Kantenmittelpunkte → `mergePaths`-Reuse (Step 3) + Geometrie-Sanity (Step 6); Band → `offsetPath`; Farbe pro Component → Step 3 + `Polyline.stroke?` (Task 1); Preview/SVG-Farbe → Task 1; meander aus Picker → Task 2 Step 4. Nicht-Ziele (plot-by-color, SVG-Gruppen, loops, organic) bewusst ausgelassen.

**Reuse-Entscheidung:** Component-Tracing nutzt `mergePaths` statt eigenem Graph-Tracer — Striche teilen exakte (doppelt identisch berechnete) Kantenmittelpunkt-Koordinaten, Toleranz 1e-3 mm reicht; `mergePaths` ist getestet (`scripts/mergepaths-test.mjs`). Spart einen Tracer + Risiko.

**Determinismus:** `makeRng(seed)` für Kachelwahl + Farbe; Striche row-major erzeugt; `mergePaths` iteriert in Array-Reihenfolge → deterministisch. Test vergleicht `JSON.stringify`.

**Risiko / Verifikation:** Bogen-Endpunkt-Genauigkeit ist die kritische Annahme (sonst keine Verkettung). Step 6 prüft, dass Verkettung greift (Component-Zahl < Roh-Strich-Zahl). `fitToCanvas`-stroke-Durchreichen explizit als Implementierer-Check markiert (Test `colorFraction 0/1` fängt einen Fehler).

**Bewusste Vereinfachung (kein versteckter Cap):** geschlossene Components werden aufgeschnitten (Step 3, `comp.closed` → Punkt anhängen) statt closed-loop-Offset — in Spec als YAGNI vermerkt.
