# Plotter-Ribbons Implementation Plan — Offset-Engine, Mäander, Loops, optionale Farbe

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-02-ribbons-offset-meander-loops-design.md`

**Goal:** Neue Plotter-Motive — versetzte „Ribbon"-Bänder (Mäander, große Schleifen) plus eine optionale, additive Farb-/Mehr-Stift-Fähigkeit. Drei Stufen, jede shippbar **und plottbar**. Geometrie zuerst (mono), Farbe als ein sauberer Schnitt zuletzt.

**Architecture:** Eine pure Geometrie-Util (`src/util/offset.ts`), zwei neue Generatoren (`src/generators/meander.ts`, `loops.ts`) nach dem `rose.ts`-Muster + Registry-Eintrag, dann optionales `Polyline.stroke?` mit gracefuller Degradation in Preview/SVG/Plotter (`src/plotter/penSplit.ts` + „Plot by color"). Pure Funktionen via `scripts/`-tsx getestet.

**Tech Stack:** TypeScript, React 18, Zustand, leva. RNG = `makeRng(seed)` (alea). tsx für Test-Scripts. Einheit mm.

**Invarianten (gelten in jedem Task):**
- RNG nur `makeRng(seed)` aus `src/util/random.ts`. Nie `Math.random`.
- `fitToCanvas` aus `src/util/path.ts` am Ende jedes Generators.
- Additiv: alles ohne `stroke` bleibt **bitidentisch** zu heute.
- Tests als tsx-Script unter `scripts/`, Stil wie `scripts/mergepaths-test.mjs`. Kein Test-Framework.
- Nach jedem Task `npm run typecheck` grün.

---

# STUFE 0 — Offset-Engine + Mäander (mono, plottet sofort)

## Task 1: `offsetPath` + `symmetricOffsets` (pure)

**Files:**
- Create: `src/util/offset.ts`
- Test: `scripts/offset-test.mjs`

- [ ] **Step 1: Failing test**

```js
// scripts/offset-test.mjs
import { offsetPath, symmetricOffsets } from "../src/util/offset.ts";
let failed = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); failed++; } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// symmetricOffsets: 3 Spuren, Abstand 2 → [-2, 0, 2]
const so = symmetricOffsets(3, 2);
ok(near(so[0], -2) && near(so[1], 0) && near(so[2], 2), "symmetric offsets centered");

// Gerade Linie entlang +X, Offset entlang Normale (±)
const center = [[0, 0], [10, 0], [20, 0]];
const lanes = offsetPath(center, [-1, 1]);
ok(lanes.length === 2, "one polyline per offset");
ok(lanes[0].points.length === 3, "preserves vertex count");
// Normale einer +X-Linie zeigt ±Y → y-Versatz, x bleibt
ok(near(lanes[0].points[0][1], -1) || near(lanes[0].points[0][1], 1), "offset moves along normal (y)");
ok(near(lanes[0].points[0][0], 0), "offset keeps x on straight line");
ok(Math.abs(lanes[0].points[0][1] - lanes[1].points[0][1]) > 1.5, "two offsets are on opposite sides");

// 180°-Kehre (Halbkreis): innere Spur darf sich nicht selbst überschneiden
const N = 40, R = 20;
const arc = Array.from({ length: N + 1 }, (_, i) => {
  const t = Math.PI * (i / N); // 0..π
  return [Math.cos(t) * R, Math.sin(t) * R];
});
const band = offsetPath(arc, symmetricOffsets(5, 2), { minInnerRadiusMm: 1 });
// innerste Spur: aufeinanderfolgende Punkte dürfen die Richtung nicht "umklappen"
const inner = band[0].points; // offset = -4 (innen, wenn Normale nach außen zeigt) ODER äußerste — egal: prüfe Monotonie der Bogenlänge
let backtracks = 0;
for (let i = 2; i < inner.length; i++) {
  const ax = inner[i-1][0]-inner[i-2][0], ay = inner[i-1][1]-inner[i-2][1];
  const bx = inner[i][0]-inner[i-1][0], by = inner[i][1]-inner[i-1][1];
  if (ax*bx + ay*by < 0) backtracks++; // Richtungsumkehr = Kollaps
}
ok(backtracks === 0, "inner lane does not fold back on a 180° turn");

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npx tsx scripts/offset-test.mjs`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implementieren**

```ts
// src/util/offset.ts
import type { Point, Polyline } from "../generators/types";

export type OffsetOpts = {
  /** Miter-Cap: begrenzt die Skalierung der gemittelten Normale an scharfen Ecken (mm-unabhängig). Default 4. */
  miterLimit?: number;
  /** Reserviert: minimaler Innenradius (mm) — der Generator garantiert turnRadius ≥ Bandbreite/2. */
  minInnerRadiusMm?: number;
};

/** Symmetrische Spur-Offsets: (i − (K−1)/2)·spacing. */
export const symmetricOffsets = (k: number, spacing: number): number[] =>
  Array.from({ length: k }, (_, i) => (i - (k - 1) / 2) * spacing);

/**
 * Versetzt eine offene Centerline um jeden Wert in `offsets` (signiert, mm) entlang
 * der gemittelten Punktnormale. Ein Eintrag → eine versetzte offene Polyline.
 * Reine Geometrie, kein RNG. Miter-Skalierung hält den parallelen Abstand in Kurven;
 * `miterLimit` deckelt sie an scharfen Ecken (verhindert Spikes).
 */
export function offsetPath(center: Point[], offsets: number[], opts: OffsetOpts = {}): Polyline[] {
  const miterLimit = opts.miterLimit ?? 4;
  const n = center.length;
  if (n < 2) return offsets.map(() => ({ closed: false, points: center.map((p) => [p[0], p[1]] as Point) }));

  // Gemittelte Einheitsnormale + Miter-Skalierung je Stützpunkt.
  const nx: number[] = [], ny: number[] = [], scale: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = center[Math.max(0, i - 1)];
    const next = center[Math.min(n - 1, i + 1)];
    let tx = next[0] - prev[0], ty = next[1] - prev[1];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    nx.push(-ty); ny.push(tx); // Normale = Tangente +90°
    scale.push(1);
  }
  for (let i = 1; i < n - 1; i++) {
    const a = center[i - 1], b = center[i], c = center[i + 1];
    let d1x = b[0] - a[0], d1y = b[1] - a[1]; const l1 = Math.hypot(d1x, d1y) || 1; d1x /= l1; d1y /= l1;
    let d2x = c[0] - b[0], d2y = c[1] - b[1]; const l2 = Math.hypot(d2x, d2y) || 1; d2x /= l2; d2y /= l2;
    const dot = Math.max(-1, Math.min(1, d1x * d2x + d1y * d2y));
    const cosHalf = Math.sqrt((1 + dot) / 2);
    scale[i] = cosHalf > 1e-4 ? Math.min(1 / cosHalf, miterLimit) : miterLimit;
  }

  return offsets.map((off) => {
    const points: Point[] = [];
    for (let i = 0; i < n; i++) {
      const s = off * scale[i];
      points.push([center[i][0] + nx[i] * s, center[i][1] + ny[i] * s]);
    }
    return { closed: false, points };
  });
}
```

- [ ] **Step 4: Test grün + typecheck**

Run: `npx tsx scripts/offset-test.mjs` → ALL PASS
Run: `npm run typecheck` → keine Fehler

- [ ] **Step 5: Commit**

```bash
git add src/util/offset.ts scripts/offset-test.mjs
git commit -m "feat(offset): pure offsetPath + symmetricOffsets (miter-limited parallel lanes)"
```

---

## Task 2: Mäander-Generator (`generateMeander`, mono)

**Files:**
- Create: `src/generators/meander.ts`
- Modify: `src/generators/registry.ts`
- Test: `scripts/meander-test.mjs`

- [ ] **Step 1: Failing test**

```js
// scripts/meander-test.mjs
import { meander } from "../src/generators/meander.ts";
let failed = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); failed++; } };

const canvas = { wMm: 200, hMm: 200 };
const p = { ...meander.defaults };
const a1 = meander.generate(p, 1234, canvas);
const a2 = meander.generate(p, 1234, canvas);

ok(a1.widthMm === 200 && a1.heightMm === 200, "artwork carries canvas size");
ok(a1.polylines.length > 0, "produces polylines");
ok(JSON.stringify(a1) === JSON.stringify(a2), "deterministic: same seed → identical artwork");

const a3 = meander.generate(p, 9999, canvas);
ok(JSON.stringify(a1) !== JSON.stringify(a3), "different seed → different artwork");

// K Spuren: Polylinien-Anzahl ist Vielfaches von lanes (pro Centerline ein Band)
ok(a1.polylines.every((l) => l.points.length >= 2), "no degenerate polylines");

// in-bounds (fitToCanvas + Margin)
const m = p.marginMm;
const inBounds = a1.polylines.every((l) => l.points.every(([x, y]) =>
  x >= m - 1 && x <= 200 - m + 1 && y >= m - 1 && y <= 200 - m + 1));
ok(inBounds, "all points within canvas margin");

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npx tsx scripts/meander-test.mjs`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implementieren**

Centerline = selbst-meidender Random-Walk auf Zellraster mit Backtracking; Ecken werden zu gerundeten Kehren resampled (Radius = `turnRadiusMm`, garantiert ≥ Bandbreite/2). Dann `offsetPath` → K Spuren.

```ts
// src/generators/meander.ts
import type { GeneratorDef, Point, Polyline } from "./types";
import { makeRng, type RNG } from "../util/random";
import { fitToCanvas } from "../util/path";
import { offsetPath, symmetricOffsets } from "../util/offset";

type Params = {
  cols: number;            // Rasterspalten
  rows: number;            // Rasterzeilen
  lanes: number;           // K parallele Spuren
  laneSpacingMm: number;   // s
  turnRadiusMm: number;    // Kehrenradius (wird auf ≥ Bandbreite/2 angehoben)
  coverage: number;        // 0..1 Anteil besuchter Zellen (Ziel-Länge)
  marginMm: number;
};

const DEFAULTS: Params = {
  cols: 24, rows: 24, lanes: 5, laneSpacingMm: 1.4,
  turnRadiusMm: 6, coverage: 0.6, marginMm: 15,
};

/** Selbst-meidender Walk auf einem cols×rows-Gitter; liefert Zellkoordinaten (Integer). */
function selfAvoidingWalk(rng: RNG, cols: number, rows: number, target: number): Point[] {
  const key = (x: number, y: number) => y * cols + x;
  const visited = new Set<number>();
  const path: Point[] = [];
  let x = Math.floor(rng() * cols), y = Math.floor(rng() * rows);
  visited.add(key(x, y)); path.push([x, y]);
  const dirs: Point[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const stack: Point[] = [[x, y]];
  while (path.length < target && stack.length > 0) {
    // Nachbarn shuffeln (Fisher–Yates über rng)
    const opts = dirs
      .map((d) => [x + d[0], y + d[1]] as Point)
      .filter(([nx, ny]) => nx >= 0 && nx < cols && ny >= 0 && ny < rows && !visited.has(key(nx, ny)));
    if (opts.length === 0) { // Sackgasse → Backtrack
      stack.pop();
      const top = stack[stack.length - 1];
      if (!top) break;
      [x, y] = top;
      continue;
    }
    const pick = opts[Math.floor(rng() * opts.length)];
    [x, y] = pick;
    visited.add(key(x, y)); path.push([x, y]); stack.push([x, y]);
  }
  return path;
}

/** Verrundet die Ecken einer Zellpfad-Polyline zu Bögen mit Radius r (im Zell-Raum, in mm umgerechnet). */
function roundCorners(cells: Point[], cellMm: number, r: number, samples = 6): Point[] {
  const pts = cells.map(([cx, cy]): Point => [cx * cellMm, cy * cellMm]);
  if (pts.length < 3) return pts;
  const out: Point[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    let inx = b[0] - a[0], iny = b[1] - a[1]; const il = Math.hypot(inx, iny) || 1; inx /= il; iny /= il;
    let onx = c[0] - b[0], ony = c[1] - b[1]; const ol = Math.hypot(onx, ony) || 1; onx /= ol; ony /= ol;
    const rr = Math.min(r, il / 2, ol / 2);
    const p1: Point = [b[0] - inx * rr, b[1] - iny * rr];
    const p2: Point = [b[0] + onx * rr, b[1] + ony * rr];
    out.push(p1);
    for (let s = 1; s < samples; s++) { // quadratische Bézier b als Kontrollpunkt
      const t = s / samples, mt = 1 - t;
      out.push([mt * mt * p1[0] + 2 * mt * t * b[0] + t * t * p2[0],
                mt * mt * p1[1] + 2 * mt * t * b[1] + t * t * p2[1]]);
    }
    out.push(p2);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export const meander: GeneratorDef<Params> = {
  id: "meander",
  name: "Meander Ribbon",
  description:
    "Selbst-meidende Bahn auf einem Raster, zu einem K-Spur-Band versetzt. Gerundete Haarnadel-Kehren; reseed verschiebt den Pfad.",
  defaults: DEFAULTS,
  schema: {
    cols: { value: DEFAULTS.cols, min: 4, max: 60, step: 1 },
    rows: { value: DEFAULTS.rows, min: 4, max: 60, step: 1 },
    lanes: { value: DEFAULTS.lanes, min: 1, max: 24, step: 1 },
    laneSpacingMm: { value: DEFAULTS.laneSpacingMm, min: 0.3, max: 5, step: 0.1 },
    turnRadiusMm: { value: DEFAULTS.turnRadiusMm, min: 1, max: 20, step: 0.5 },
    coverage: { value: DEFAULTS.coverage, min: 0.1, max: 1, step: 0.05 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
  },
  generate: (p, seed, canvas) => {
    const rng = makeRng(seed);
    const cols = Math.max(2, Math.floor(p.cols));
    const rows = Math.max(2, Math.floor(p.rows));
    const target = Math.max(2, Math.floor(cols * rows * p.coverage));
    const cells = selfAvoidingWalk(rng, cols, rows, target);

    // Bandbreite = (K−1)·s; Radius muss ≥ Bandbreite/2 sein, sonst kollabieren innere Spuren.
    const bandWidth = (p.lanes - 1) * p.laneSpacingMm;
    const cellMm = 10; // Roh-Skala; fitToCanvas normalisiert am Ende
    const r = Math.max(p.turnRadiusMm, bandWidth / 2 + p.laneSpacingMm);
    const center = roundCorners(cells, cellMm, r);

    const lanes = offsetPath(center, symmetricOffsets(p.lanes, p.laneSpacingMm), {
      minInnerRadiusMm: p.laneSpacingMm,
    });

    const fitted = fitToCanvas(lanes as Polyline[], canvas.wMm, canvas.hMm, p.marginMm);
    return { polylines: fitted, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
```

- [ ] **Step 4: Registrieren**

In `src/generators/registry.ts`: `import { meander } from "./meander";` und `meander` ins `GENERATORS`-Array aufnehmen.

- [ ] **Step 5: Tests grün (inkl. smoke)**

Run: `npx tsx scripts/meander-test.mjs` → ALL PASS
Run: `npx tsx scripts/smoke.mjs` → alle Generatoren inkl. `meander` produzieren gültige Artworks
Run: `npm run typecheck` → keine Fehler

- [ ] **Step 6: Visuell + Commit**

Run: `npm run dev` → Generator „Meander Ribbon" wählen, reroll, Preview ansehen (genestete Haarnadeln). SVG exportieren, optional mono plotten (Trace dry).

```bash
git add src/generators/meander.ts src/generators/registry.ts scripts/meander-test.mjs
git commit -m "feat(generator): meander ribbon (self-avoiding walk + offset band, mono)"
```

---

# STUFE 1 — Loop-Generator (mono dichtes Schleifen-Feld)

## Task 3: Loop-Generator (`generateLoops`, mono)

**Files:**
- Create: `src/generators/loops.ts`
- Modify: `src/generators/registry.ts`
- Test: `scripts/loops-test.mjs`

- [ ] **Step 1: Failing test**

```js
// scripts/loops-test.mjs
import { loops } from "../src/generators/loops.ts";
let failed = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); failed++; } };

const canvas = { wMm: 200, hMm: 200 };
const p = { ...loops.defaults };
const a1 = loops.generate(p, 42, canvas);
const a2 = loops.generate(p, 42, canvas);
ok(a1.polylines.length > 0, "produces polylines");
ok(JSON.stringify(a1) === JSON.stringify(a2), "deterministic per seed");
ok(a1.polylines.every((l) => l.points.length >= 2), "no degenerate polylines");

// Polylinien-Anzahl ≈ Σ(layer.loops) · lanes
const expected = p.layers.reduce((n, L) => n + L.loops, 0) * p.lanes;
ok(a1.polylines.length === expected, `polyline count = Σloops·lanes (${expected})`);

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npx tsx scripts/loops-test.mjs`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implementieren**

```ts
// src/generators/loops.ts
import type { GeneratorDef, Point, Polyline } from "./types";
import { makeRng, type RNG } from "../util/random";
import { fitToCanvas } from "../util/path";
import { offsetPath, symmetricOffsets } from "../util/offset";

export type LoopLayer = { color?: string; loops: number }; // color erst Stufe 2
type Params = {
  layers: LoopLayer[];
  lanes: number;           // großes K
  laneSpacingMm: number;   // kleines s → dichtes Band
  marginMm: number;
};

const DEFAULTS: Params = {
  layers: [{ loops: 3 }, { loops: 3 }],
  lanes: 14, laneSpacingMm: 0.8, marginMm: 15,
};

/** Eine große geschlossene Rounded-Loop-Centerline (geschlossener kubischer Spline durch zufällige Punkte). */
function loopCenterline(rng: RNG, scale: number, samples = 120): Point[] {
  const k = 4 + Math.floor(rng() * 3); // 4..6 Kontrollpunkte
  const ctrl: Point[] = Array.from({ length: k }, (_, i) => {
    const ang = (i / k) * Math.PI * 2 + (rng() - 0.5) * 0.6;
    const rad = scale * (0.5 + rng() * 0.5);
    return [Math.cos(ang) * rad, Math.sin(ang) * rad];
  });
  // Catmull–Rom (geschlossen) → glatte Schleife
  const pts: Point[] = [];
  for (let i = 0; i < k; i++) {
    const p0 = ctrl[(i - 1 + k) % k], p1 = ctrl[i], p2 = ctrl[(i + 1) % k], p3 = ctrl[(i + 2) % k];
    for (let s = 0; s < samples / k; s++) {
      const t = s / (samples / k), t2 = t * t, t3 = t2 * t;
      pts.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0]) * t2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1]) * t2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1]) * t3),
      ]);
    }
  }
  pts.push(pts[0]); // schließen
  return pts;
}

export const loops: GeneratorDef<Params> = {
  id: "loops",
  name: "Overprint Loops",
  description:
    "Wenige große, sich überlappende Schleifen pro Layer, jeweils zu dichten Bändern versetzt. Mono in Stufe 1; Farb-Overprint ab Stufe 2.",
  defaults: DEFAULTS,
  schema: {
    lanes: { value: DEFAULTS.lanes, min: 2, max: 40, step: 1 },
    laneSpacingMm: { value: DEFAULTS.laneSpacingMm, min: 0.2, max: 3, step: 0.1 },
    marginMm: { value: DEFAULTS.marginMm, min: 0, max: 40, step: 1 },
    // layers vorerst über defaults; UI-Editor für layers ist Folgearbeit.
  },
  generate: (p, seed, canvas) => {
    const rng = makeRng(seed);
    const scale = 50;
    const all: Polyline[] = [];
    p.layers.forEach((layer, li) => {
      for (let i = 0; i < layer.loops; i++) {
        const center = loopCenterline(rng, scale * (0.8 + 0.4 * rng()));
        // leichter Winkel-Offset je Layer → Moiré (analog Voronoi-Moiré angle-b)
        const band = offsetPath(center, symmetricOffsets(p.lanes, p.laneSpacingMm));
        for (const b of band) all.push({ ...b, closed: false }); // Stufe 1: kein stroke
      }
    });
    const fitted = fitToCanvas(all, canvas.wMm, canvas.hMm, p.marginMm);
    return { polylines: fitted, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
```

- [ ] **Step 4: Registrieren + Tests**

In `registry.ts`: `import { loops } from "./loops";` + ins Array.
Run: `npx tsx scripts/loops-test.mjs` → ALL PASS
Run: `npx tsx scripts/smoke.mjs` → grün
Run: `npm run typecheck` → keine Fehler

- [ ] **Step 5: Visuell + Commit**

`npm run dev` → „Overprint Loops" → dichtes, überlagertes Schleifen-Feld (mono).

```bash
git add src/generators/loops.ts src/generators/registry.ts scripts/loops-test.mjs
git commit -m "feat(generator): overprint loops (dense offset bands, mono)"
```

---

# STUFE 2 — Optionale Farbe / Mehr-Stift (additiv)

## Task 4: `Polyline.stroke?` + Preview honoriert Farbe

**Files:**
- Modify: `src/generators/types.ts`
- Modify: `src/render/CanvasPreview.tsx`

- [ ] **Step 1: Typ erweitern**

In `src/generators/types.ts` das `Polyline`-Type um ein optionales Feld ergänzen:

```ts
export type Polyline = {
  points: Point[];
  closed: boolean;
  stroke?: string; // CSS/Hex-Farbe; undefined = Default-Stift
};
```

- [ ] **Step 2: typecheck (Regression)**

Run: `npm run typecheck`
Expected: keine Fehler (Feld ist optional → keine bestehende Stelle bricht).

- [ ] **Step 3: Preview honoriert `stroke`**

In `src/render/CanvasPreview.tsx`, in der Zeichenschleife pro Polyline die Strokefarbe setzen (vor `ctx.beginPath()`):

```tsx
for (const line of artwork.polylines) {
  if (line.points.length < 2) continue;
  ctx.strokeStyle = line.stroke ?? "#111";   // <-- additiv: ohne stroke wie bisher
  ctx.beginPath();
  ctx.moveTo(line.points[0][0], line.points[0][1]);
  for (let i = 1; i < line.points.length; i++) ctx.lineTo(line.points[i][0], line.points[i][1]);
  if (line.closed) ctx.closePath();
  ctx.stroke();
}
```

(Das bisherige `ctx.strokeStyle = "#111"` vor der Schleife kann bleiben — der per-Polyline-Set überschreibt es.)

- [ ] **Step 4: Verifizieren**

Run: `npm run dev` — bestehende Generatoren (ohne stroke) zeichnen unverändert schwarz. (Farbe wird erst in Task 7 von Generatoren gesetzt.)
Run: `npm run typecheck` → keine Fehler

- [ ] **Step 5: Commit**

```bash
git add src/generators/types.ts src/render/CanvasPreview.tsx
git commit -m "feat(color): optional Polyline.stroke + preview honors it (additive, mono unchanged)"
```

---

## Task 5: `splitByStroke` + SVG-Export gruppiert nach Farbe

**Files:**
- Create: `src/plotter/penSplit.ts`
- Test: `scripts/pensplit-test.mjs`
- Modify: `src/render/svgExport.ts`

- [ ] **Step 1: Failing test für `splitByStroke`**

```js
// scripts/pensplit-test.mjs
import { splitByStroke } from "../src/plotter/penSplit.ts";
let failed = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); failed++; } };

const L = (stroke) => ({ points: [[0,0],[1,1]], closed: false, ...(stroke ? { stroke } : {}) });

// Alle ohne stroke → genau eine Default-Gruppe (== heutiges Mono)
const g0 = splitByStroke([L(), L(), L()]);
ok(g0.length === 1, "no stroke → single group");
ok(g0[0].stroke === "#000000", "default group is black");
ok(g0[0].polylines.length === 3, "all polylines in default group");

// Gemischt → Reihenfolge = erstes Auftreten
const g1 = splitByStroke([L("#e96a3a"), L(), L("#3a7de9"), L("#e96a3a")]);
ok(g1.length === 3, "three distinct pens (orange, default, blue)");
ok(g1[0].stroke === "#e96a3a" && g1[1].stroke === "#000000" && g1[2].stroke === "#3a7de9", "order = first appearance");
ok(g1[0].polylines.length === 2, "orange group has both orange lines");

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npx tsx scripts/pensplit-test.mjs`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: `penSplit.ts` implementieren**

```ts
// src/plotter/penSplit.ts
import type { Polyline } from "../generators/types";

export type PenGroup = { stroke: string; polylines: Polyline[] };
const DEFAULT_STROKE = "#000000";

/** Partitioniert nach distinktem stroke (undefined → #000000); Gruppen-Reihenfolge = erstes Auftreten. */
export function splitByStroke(polylines: Polyline[]): PenGroup[] {
  const order: string[] = [];
  const map = new Map<string, Polyline[]>();
  for (const pl of polylines) {
    const key = pl.stroke ?? DEFAULT_STROKE;
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key)!.push(pl);
  }
  return order.map((stroke) => ({ stroke, polylines: map.get(stroke)! }));
}
```

- [ ] **Step 4: Test grün**

Run: `npx tsx scripts/pensplit-test.mjs` → ALL PASS

- [ ] **Step 5: SVG-Export nach Farbe gruppieren**

In `src/render/svgExport.ts`: nach dem optionalen `dedupe`/`join` die Linien per `splitByStroke` gruppieren; je Gruppe ein `<g stroke="…">`. **Wichtig:** `mergePaths` darf nur Linien gleicher Farbe verketten → vor dem Merge partitionieren.

```ts
import { splitByStroke } from "../plotter/penSplit";
// ... innerhalb svgExport, nach dedupe:
const groups = splitByStroke(opts.dedupe ? dedupePaths(art.polylines) : art.polylines);
const body = groups.map((grp) => {
  const lines = opts.join ? mergePaths(grp.polylines) : grp.polylines;
  const paths = lines.filter((l) => l.points.length >= 2).map((l) => {
    const d = "M " + l.points.map(([x, y], i) => (i === 0 ? `${round(x)},${round(y)}` : `L ${round(x)},${round(y)}`)).join(" ") + (l.closed ? " Z" : "");
    return `<path d="${d}"/>`;
  }).join("\n    ");
  // Default-Schwarz behält das globale stroke des <svg>; farbige Gruppen overriden
  return grp.stroke === "#000000" ? paths : `<g stroke="${grp.stroke}">\n    ${paths}\n  </g>`;
}).join("\n  ");
// ... body in das <svg>-Template einsetzen statt der bisherigen `paths`-Variable
```

- [ ] **Step 6: Regression + Commit**

Run: `npx tsx scripts/export-test.mjs` (bestehender Export-Test) → grün; ggf. Erwartung für mono unverändert.
Run: `npm run typecheck` → keine Fehler

```bash
git add src/plotter/penSplit.ts scripts/pensplit-test.mjs src/render/svgExport.ts
git commit -m "feat(color): splitByStroke + per-color SVG groups (mono path output unchanged)"
```

---

## Task 6: „Plot by color" im PlotterPanel (Mehr-Stift via Pause)

**Files:**
- Modify: `src/ui/PlotterPanel.tsx`

- [ ] **Step 1: Plot-by-color-Funktion ergänzen**

In `PlotterPanel.tsx` zusätzlich zum bestehenden `plot()` eine Variante, die nach Farbe splittet und zwischen den Gruppen auf Stiftwechsel wartet. Single-Pen-`gcode.ts` bleibt unangetastet — pro Gruppe ein normaler Job.

```tsx
import { splitByStroke } from "../plotter/penSplit";

async function plotByColor() {
  if (!artwork) return;
  const base = joinPaths ? mergePaths(artwork.polylines) : artwork.polylines;
  const groups = splitByStroke(base);
  abortRef.current = new AbortController();
  try {
    for (let gi = 0; gi < groups.length; gi++) {
      const grp = groups[gi];
      if (gi > 0) {
        // Stiftwechsel: Kopf hochheben, parken, auf Bestätigung warten
        await g().park();
        const cont = window.confirm(`Stift ${gi + 1}/${groups.length} einsetzen: ${grp.stroke}\n\nOK = weiter plotten, Abbrechen = stoppen.`);
        if (!cont) { abortRef.current.abort(); break; }
      }
      const lines = artworkToGcode({ ...artwork, polylines: grp.polylines }, { ...DEFAULT_PEN, feed });
      await streamJob(portRef.current!, lines, {
        signal: abortRef.current.signal, penUp: DEFAULT_PEN.penUp,
        onProgress: (done, total) => setProgress({ done, total }),
      });
    }
  } catch (e) {
    console.warn("plot-by-color stopped", e);
  } finally {
    setProgress(null);
  }
}
```

- [ ] **Step 2: Button einhängen**

Im Plotter-Button-Row neben „Plot" einen zweiten Button:

```tsx
<button style={btn} onClick={plotByColor}>Plot by color</button>
```

(`window.confirm` bewusst minimal — origin hält GRBL über `park()`/`G92`; ein hübscheres Modal ist optionale Folgearbeit.)

- [ ] **Step 3: typecheck + Build**

Run: `npm run typecheck` → keine Fehler
Run: `npm run build` → grün

- [ ] **Step 4: Commit**

```bash
git add src/ui/PlotterPanel.tsx
git commit -m "feat(plotter): plot-by-color — one single-pen job per color with pen-swap pause"
```

---

## Task 7: Farbe in Mäander + Loops verdrahten

**Files:**
- Modify: `src/generators/meander.ts`
- Modify: `src/generators/loops.ts`
- Test: erweitere `scripts/meander-test.mjs`, `scripts/loops-test.mjs`

- [ ] **Step 1: Mäander `colorFraction` + `accentColor` (Desktop-SPEC Task 1)**

`MeanderParams` um `colorFraction: number` (default 0) + `accentColor: string` erweitern, schema-Einträge ergänzen. Da der Mäander hier *eine* Centerline hat, ist „Komponente" = eine Spur (Lane); Größe = Summe der Segmentlängen der Spur. Die größten `round(colorFraction · K)` Spuren bekommen `stroke = accentColor`:

```ts
// nach dem offsetPath(...)-Aufruf, vor fitToCanvas:
const laneLen = (l: Polyline) => l.points.reduce((s, p, i) =>
  i === 0 ? 0 : s + Math.hypot(p[0]-l.points[i-1][0], p[1]-l.points[i-1][1]), 0);
const k = lanes.length;
const accentCount = Math.round(p.colorFraction * k);
const order = lanes.map((l, i) => ({ i, len: laneLen(l) })).sort((a, b) => b.len - a.len);
const accentSet = new Set(order.slice(0, accentCount).map((o) => o.i));
const colored = lanes.map((l, i) => accentSet.has(i) ? { ...l, stroke: p.accentColor } : l);
const fitted = fitToCanvas(colored as Polyline[], canvas.wMm, canvas.hMm, p.marginMm);
```

Test ergänzen: bei `colorFraction = 0` trägt **keine** Polyline `stroke` (bitidentisch zu Stufe 0); bei `colorFraction = 0.4` tragen genau `round(0.4·K)` Polylinien `accentColor`.

- [ ] **Step 2: Loops Layer-Farbe (Desktop-SPEC Task 5)**

In `loops.ts` beim Sammeln die Layer-Farbe als `stroke` setzen (wenn gesetzt):

```ts
for (const b of band) all.push(layer.color ? { ...b, closed: false, stroke: layer.color } : { ...b, closed: false });
```

Defaults auf zwei Farben heben, damit Overprint sichtbar wird:
```ts
layers: [{ color: "#e96a3a", loops: 3 }, { color: "#3a7de9", loops: 3 }],
```
Test ergänzen: jede Polyline trägt eine der beiden Layer-Farben; zwei distinkte `stroke`-Werte vorhanden.

- [ ] **Step 3: Tests grün + smoke + typecheck**

Run: `npx tsx scripts/meander-test.mjs` → ALL PASS
Run: `npx tsx scripts/loops-test.mjs` → ALL PASS
Run: `npx tsx scripts/smoke.mjs` → grün
Run: `npm run typecheck` → keine Fehler

- [ ] **Step 4: Visuell verifizieren**

`npm run dev`:
- Meander mit `colorFraction = 0.3` → längste Spuren in `accentColor`.
- Loops → zwei Farbfelder; „Overprint preview" (falls Toggle gebaut) bzw. mental: beim Plot überlagern sie sich zur dritten Farbe.
- „Plot by color" → zwei Durchgänge mit Stiftwechsel-Prompt.

- [ ] **Step 5: Commit**

```bash
git add src/generators/meander.ts src/generators/loops.ts scripts/meander-test.mjs scripts/loops-test.mjs
git commit -m "feat(color): meander colorFraction (largest lanes) + loops per-layer color (overprint)"
```

---

## Task 8: Doku (vpype-Pipeline + Overprint-Preview)

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README-Snippets**

Abschnitt „Multi-color / Overprint" ergänzen:
- vpype pro Farbebene: `vpype read in.svg linemerge --tolerance 0.1mm linesort reloop write out.svg`
- Overprint = physisch (zwei Stift-Durchgänge via „Plot by color", gleicher Origin) bzw. Screen-Preview `mix-blend-mode: multiply`.
- Hinweis: SVG behält getrennte Farbebenen (`<g stroke>`); der „dritte Farbton" entsteht auf Papier/Preview, nicht im SVG.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: multi-color/overprint workflow (vpype per layer, plot-by-color, multiply preview)"
```

---

## Self-Review

**Spec-Coverage:** offsetPath→Task 1; meander→Task 2; loops→Task 3; `Polyline.stroke?`+Preview→Task 4; splitByStroke+SVG-Gruppen→Task 5; „Plot by color"→Task 6; colorFraction(T1)+loop-overprint(T5)→Task 7; vpype/Overprint-Doku→Task 8. Desktop-SPEC Task 2 (joinLanes) bewusst NICHT enthalten (== bestehendes `mergePaths`).

**Additivität / Regression:** `Polyline.stroke?` optional → kein bestehender Call bricht. Preview/SVG/Plot ohne `stroke` bleiben bitidentisch (Tasks 4–6 prüfen das explizit: `splitByStroke` → eine `#000000`-Gruppe; mono-SVG unverändert). `gcode.ts` wird nie angefasst — Mehr-Stift = mehrere Jobs.

**Determinismus:** beide Generatoren nutzen ausschließlich `makeRng(seed)`; Tests vergleichen `JSON.stringify` bei gleichem Seed (Task 2, 3).

**Typ-Konsistenz:** `Polyline`/`Point`/`Artwork` aus `src/generators/types.ts`; `PenGroup`/`splitByStroke` (Task 5) konsistent in svgExport (Task 5) + PlotterPanel (Task 6); `offsetPath`/`symmetricOffsets` (Task 1) konsistent in meander (Task 2) + loops (Task 3).

**Offene Punkte aus der Spec (im Plan adressiert):** Centerline-Algo = selbst-meidender Walk + Backtracking (Task 2, Step 3); Loop-Moiré-Dichte = großes K / kleines s + Catmull-Rom-Loops, Winkel-Offset je Layer als Folge-Tuning (Task 3/7). Beide kalibrierbar über leva-Params + Seeds ohne Architektur-Änderung.

**Bewusste Vereinfachungen (kein versteckter Cap):** `loops`-`layers` werden vorerst über `defaults` gesteuert (kein leva-Editor für Array-of-Objects) — UI-Editor ist Folgearbeit, in Task 3 Step 3 vermerkt. „Plot by color" nutzt `window.confirm` statt Custom-Modal — in Task 6 Step 2 vermerkt.
```
