# Pipes v2 — Wang-Tile-Feld Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein zweites Feld-Modell `wang` im bestehenden `pipes`-Generator, das distinkte, sich nicht kreuzende Pipes mit langen Geraden erzeugt (löst das Plaid-Problem des `cross`-Tiles).

**Architecture:** Kausaler zeilenweiser Sweep über ein Kanten-Zustands-Gitter; jede Zelle verbindet 0 oder 2 ihrer 4 Kanten (nie 4 → keine Kreuzungen). Drei pure Funktionen — `chooseTile` (Kanten-Entscheidung), `wangTileStroke` (Tile-Geometrie), `wangField` (Feld-Assembly) — plus Param-/Wiring-Änderung in `generate()`. Alles stromabwärts (`mergePaths` → `offsetPath` → Farbe → `fitToCanvas`) bleibt unverändert.

**Tech Stack:** TypeScript, Vite/React. RNG: `makeRng` (alea). Tests: tsx-Scripts unter `scripts/`, kein Framework. Referenz-Spec: `docs/superpowers/specs/2026-06-03-pipes-v2-wang-tiles-design.md`.

---

## File Structure

- **Modify** `src/generators/pipes.ts` — neue Params (`model`, `density`), `classicField` extrahiert, `chooseTile` + `wangTileStroke` + `wangField` ergänzt (alle exportiert für Tests), `generate()` schaltet auf `p.model`. `sampleArc` + `tileStrokes` bleiben.
- **Create** `scripts/pipes-wang-test.mjs` — Unit-Tests für die neuen Funktionen.
- **Modify** `scripts/pipes-test.mjs` — bestehende classic-spezifische Assertions auf `model: "classic"` pinnen.

---

## Task 1: `chooseTile` — Kanten-Entscheidung (pure, Kern-Invariante)

**Files:**
- Modify: `src/generators/pipes.ts`
- Test: `scripts/pipes-wang-test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/pipes-wang-test.mjs`:

```js
// scripts/pipes-wang-test.mjs
import { chooseTile } from "../src/generators/pipes.ts";

let failed = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); failed++; } };

// Welche Kanten sind laut Ergebnis offen?
const openSet = (n, w, r) => {
  const s = new Set();
  if (n) s.add("N"); if (w) s.add("W"); if (r.e) s.add("E"); if (r.s) s.add("S");
  return s;
};
const PAIR_EDGES = { NS:["N","S"], WE:["W","E"], NE:["N","E"], NW:["N","W"], SE:["S","E"], SW:["S","W"] };

// Beide rng-Branches abdecken: low (<) und high (>=)
const rngLow = () => 0;
const rngHigh = () => 0.999;

for (const n of [0, 1]) for (const w of [0, 1]) for (const rng of [rngLow, rngHigh]) {
  const r = chooseTile(n, w, rng, 0.5, 0.5);
  const deg = n + w + r.e + r.s;
  ok(deg === 0 || deg === 2, `degree ${deg} not in {0,2} for n=${n} w=${w}`);
  if (r.pair === null) {
    ok(deg === 0, `null pair must be degree 0 (n=${n} w=${w})`);
  } else {
    const edges = openSet(n, w, r);
    const expect = new Set(PAIR_EDGES[r.pair]);
    ok(edges.size === 2 && [...expect].every((x) => edges.has(x)),
       `pair ${r.pair} must match open edges {${[...edges]}} (n=${n} w=${w})`);
  }
}

// inDeg==2 ist erzwungen Elbow NW, unabhängig von rng
ok(chooseTile(1, 1, rngLow, 0.5, 0.5).pair === "NW", "n&w → forced NW");
ok(chooseTile(1, 1, rngHigh, 0.5, 0.5).pair === "NW", "n&w → forced NW (high)");

// straightness=1 → inDeg==1 wählt immer Gerade
ok(chooseTile(1, 0, rngHigh, 1, 0).pair === "NS", "n only, straightness 1 → NS straight");
ok(chooseTile(0, 1, rngHigh, 1, 0).pair === "WE", "w only, straightness 1 → WE straight");
// straightness=0 → inDeg==1 wählt immer Turn
ok(chooseTile(1, 0, rngHigh, 0, 0).pair === "NE", "n only, straightness 0 → NE turn");
ok(chooseTile(0, 1, rngHigh, 0, 0).pair === "SW", "w only, straightness 0 → SW turn");
// density: inDeg==0
ok(chooseTile(0, 0, rngLow, 0.5, 1).pair === "SE", "empty in, density 1 → SE birth");
ok(chooseTile(0, 0, rngLow, 0.5, 0).pair === null, "empty in, density 0 → empty");

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/pipes-wang-test.mjs`
Expected: FAIL — `chooseTile` is not exported / not defined (import error or undefined).

- [ ] **Step 3: Write minimal implementation**

In `src/generators/pipes.ts`, after the imports / `sampleArc`, add:

```ts
import type { RNG } from "../util/random";

export type Pair = "NS" | "WE" | "NE" | "NW" | "SE" | "SW";

/**
 * Wählt für eine Zelle die zwei (oder null) offenen Kanten, sodass der
 * Zellgrad (n+w+e+s) ∈ {0,2} ist (kreuzungsfrei). N und W sind bereits
 * vom Sweep festgelegt; e und s werden hier gewählt.
 */
export function chooseTile(
  n: 0 | 1, w: 0 | 1, rng: RNG, straightness: number, density: number,
): { e: 0 | 1; s: 0 | 1; pair: Pair | null } {
  const inDeg = n + w;
  if (inDeg === 2) return { e: 0, s: 0, pair: "NW" };
  if (inDeg === 1) {
    if (n === 1) {
      return rng() < straightness ? { e: 0, s: 1, pair: "NS" } : { e: 1, s: 0, pair: "NE" };
    }
    return rng() < straightness ? { e: 1, s: 0, pair: "WE" } : { e: 0, s: 1, pair: "SW" };
  }
  return rng() < density ? { e: 1, s: 1, pair: "SE" } : { e: 0, s: 0, pair: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/pipes-wang-test.mjs`
Expected: `ALL PASS`

- [ ] **Step 5: Commit**

```bash
git add src/generators/pipes.ts scripts/pipes-wang-test.mjs
git commit -m "feat(pipes): chooseTile edge decision (degree 0/2, no crossings)"
```

---

## Task 2: `wangTileStroke` — Tile-Geometrie (pure)

**Files:**
- Modify: `src/generators/pipes.ts`
- Test: `scripts/pipes-wang-test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `scripts/pipes-wang-test.mjs` BEFORE the final `console.log`/`process.exit`:

```js
import { wangTileStroke } from "../src/generators/pipes.ts";

const near = (a, b) => Math.abs(a - b) < 1e-6;
const x0 = 10, y0 = 20, c = 8, r = c / 2;
const MID = {
  N: [x0 + r, y0], S: [x0 + r, y0 + c], W: [x0, y0 + r], E: [x0 + c, y0 + r],
};
for (const [pair, [a, b]] of Object.entries({
  NS: ["N", "S"], WE: ["W", "E"], NE: ["N", "E"], NW: ["N", "W"], SE: ["S", "E"], SW: ["S", "W"],
})) {
  const pts = wangTileStroke(pair, x0, y0, c, 12);
  ok(pts.length >= 2, `${pair}: at least 2 points`);
  const first = pts[0], last = pts[pts.length - 1];
  const ma = MID[a], mb = MID[b];
  const startsA = near(first[0], ma[0]) && near(first[1], ma[1]);
  const startsB = near(first[0], mb[0]) && near(first[1], mb[1]);
  const endsOther = startsA
    ? near(last[0], mb[0]) && near(last[1], mb[1])
    : near(last[0], ma[0]) && near(last[1], ma[1]);
  ok((startsA || startsB) && endsOther, `${pair}: endpoints land on edge midpoints ${a}/${b}`);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/pipes-wang-test.mjs`
Expected: FAIL — `wangTileStroke` not defined.

- [ ] **Step 3: Write minimal implementation**

In `src/generators/pipes.ts`, add (reuses existing `sampleArc`; angle conventions mirror the existing `tileStrokes` arcA/arcB):

```ts
function wangTileStroke(
  pair: Pair, x0: number, y0: number, c: number, arcSamples: number,
): Point[] {
  const r = c / 2;
  const N: Point = [x0 + r, y0], S: Point = [x0 + r, y0 + c];
  const W: Point = [x0, y0 + r], E: Point = [x0 + c, y0 + r];
  switch (pair) {
    case "NS": return [N, S];
    case "WE": return [W, E];
    case "NE": return sampleArc(x0 + c, y0, Math.PI, Math.PI / 2, r, arcSamples);
    case "NW": return sampleArc(x0, y0, 0, Math.PI / 2, r, arcSamples);
    case "SW": return sampleArc(x0, y0 + c, 0, -Math.PI / 2, r, arcSamples);
    case "SE": return sampleArc(x0 + c, y0 + c, Math.PI, (3 * Math.PI) / 2, r, arcSamples);
  }
}
export { wangTileStroke };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/pipes-wang-test.mjs`
Expected: `ALL PASS`

- [ ] **Step 5: Commit**

```bash
git add src/generators/pipes.ts scripts/pipes-wang-test.mjs
git commit -m "feat(pipes): wangTileStroke geometry (straights + corner arcs)"
```

---

## Task 3: `wangField` — Feld-Assembly (pure, deterministisch)

**Files:**
- Modify: `src/generators/pipes.ts`
- Test: `scripts/pipes-wang-test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `scripts/pipes-wang-test.mjs` before final `console.log`:

```js
import { wangField } from "../src/generators/pipes.ts";
import { makeRng } from "../src/util/random.ts";

const f1 = wangField(14, 18, 8, 12, 0.55, 0.5, makeRng(7));
const f2 = wangField(14, 18, 8, 12, 0.55, 0.5, makeRng(7));
ok(Array.isArray(f1) && f1.length > 0, "wangField produces strokes");
ok(JSON.stringify(f1) === JSON.stringify(f2), "wangField deterministic (same seed)");
ok(JSON.stringify(f1) !== JSON.stringify(wangField(14, 18, 8, 12, 0.55, 0.5, makeRng(99))),
   "wangField seed changes output");
ok(f1.every((l) => l.points.length >= 2 && l.closed === false), "no degenerate strokes, all open");
// density 0 + closed top/left boundary → fewer strokes than density 1
const sparse = wangField(14, 18, 8, 12, 0.55, 0, makeRng(7));
const dense = wangField(14, 18, 8, 12, 0.55, 1, makeRng(7));
ok(sparse.length < dense.length, "higher density → more strokes");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/pipes-wang-test.mjs`
Expected: FAIL — `wangField` not defined.

- [ ] **Step 3: Write minimal implementation**

In `src/generators/pipes.ts`, add. RNG-Reihenfolge fixiert (Rand-Vorbelegung oben → links → Sweep row-major), darum deterministisch:

```ts
function wangField(
  cols: number, rows: number, c: number, arcSamples: number,
  straightness: number, density: number, rng: RNG,
): Polyline[] {
  // Kanten-Zustand. H[x][y]: horizontale Kante über Zelle (x,y); x∈[0,cols), y∈[0,rows].
  // V[x][y]: vertikale Kante links von Zelle (x,y); x∈[0,cols], y∈[0,rows).
  const H: boolean[][] = Array.from({ length: cols }, () => Array(rows + 1).fill(false));
  const V: boolean[][] = Array.from({ length: cols + 1 }, () => Array(rows).fill(false));

  // Rand-Vorbelegung: obere N-Kanten + linke W-Kanten je mit P(density) offen.
  for (let x = 0; x < cols; x++) if (rng() < density) H[x][0] = true;
  for (let y = 0; y < rows; y++) if (rng() < density) V[0][y] = true;

  const strokes: Polyline[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const n: 0 | 1 = H[x][y] ? 1 : 0;
      const w: 0 | 1 = V[x][y] ? 1 : 0;
      const { e, s, pair } = chooseTile(n, w, rng, straightness, density);
      H[x][y + 1] = s === 1;
      V[x + 1][y] = e === 1;
      if (pair !== null) {
        strokes.push({ points: wangTileStroke(pair, x * c, y * c, c, arcSamples), closed: false });
      }
    }
  }
  return strokes;
}
export { wangField };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/pipes-wang-test.mjs`
Expected: `ALL PASS`

- [ ] **Step 5: Commit**

```bash
git add src/generators/pipes.ts scripts/pipes-wang-test.mjs
git commit -m "feat(pipes): wangField causal sweep over edge-state grid"
```

---

## Task 4: Params + `generate()` Wiring + `classicField` Extraktion

**Files:**
- Modify: `src/generators/pipes.ts`
- Modify: `scripts/pipes-test.mjs`

- [ ] **Step 1: Update existing test to pin classic + add wang end-to-end checks**

In `scripts/pipes-test.mjs`: the classic-specific assertion block (the `arcsOnly` / `mergePaths chained` check) must pin `model: "classic"`. Change the line that builds `arcsOnly`:

```js
// classic-spezifisch: cross/arc-Tiles, mergePaths verkettet zu weniger Components
const arcsOnly = pipes.generate({ ...p, model: "classic", straightness: 0, colorFraction: 0 }, 7, canvas);
```

Then append wang end-to-end assertions before the final `console.log`:

```js
// --- wang model end-to-end ---
const wcanvas = { wMm: 200, hMm: 200 };
const wp = { ...pipes.defaults, model: "wang" };
const w1 = pipes.generate(wp, 7, wcanvas);
const w2 = pipes.generate(wp, 7, wcanvas);
ok(w1.polylines.length > 0, "wang: produces polylines");
ok(JSON.stringify(w1) === JSON.stringify(w2), "wang: deterministic same seed");
const wm = wp.marginMm;
ok(w1.polylines.every((l) => l.points.every(([x, y]) =>
   x >= wm - 1 && x <= 200 - wm + 1 && y >= wm - 1 && y <= 200 - wm + 1)),
   "wang: all points within margin");
ok(pipes.generate({ ...wp, colorFraction: 0 }, 7, wcanvas).polylines.every((l) => l.stroke === undefined),
   "wang: colorFraction 0 → all mono");
ok(pipes.generate({ ...wp, colorFraction: 1 }, 7, wcanvas).polylines.some((l) => typeof l.stroke === "string"),
   "wang: colorFraction 1 → some colored");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/pipes-test.mjs`
Expected: FAIL — `model` param does nothing yet / `defaults.model` undefined → wang assertions fail or generate ignores model.

- [ ] **Step 3: Implement params + classicField + branch**

In `src/generators/pipes.ts`:

(a) Extend `Params` type — add at top of the type:
```ts
  model: "classic" | "wang";
```
and add `density: number;` after `straightness`.

(b) Extend `DEFAULTS`:
```ts
const DEFAULTS: Params = {
  model: "wang",
  cols: 14, rows: 18, lanes: 6, laneSpacingMm: 0.7,
  straightness: 0.55, density: 0.5, colorFraction: 0.35, arcSamples: 14, marginMm: 15,
};
```

(c) Extend `schema` — add as first entry and add `density`:
```ts
    model: { value: DEFAULTS.model, options: ["wang", "classic"] },
```
```ts
    density: { value: DEFAULTS.density, min: 0, max: 1, step: 0.05 },
```

(d) Extract the current double-loop into `classicField` (move the existing loop body verbatim; it already uses `tileStrokes`):
```ts
function classicField(
  cols: number, rows: number, c: number, arcSamples: number, straightness: number, rng: RNG,
): Polyline[] {
  const strokes: Polyline[] = [];
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const kind = rng() < straightness ? "cross" : (rng() < 0.5 ? "arcA" : "arcB");
      for (const pts of tileStrokes(kind, cx * c, cy * c, c, arcSamples)) {
        strokes.push({ points: pts, closed: false });
      }
    }
  }
  return strokes;
}
```

(e) In `generate()`, replace the inline stroke-building loop with the branch (keep everything after — `mergePaths`, offset, color, `fitToCanvas` — unchanged):
```ts
    const strokes = p.model === "wang"
      ? wangField(cols, rows, c, p.arcSamples, p.straightness, p.density, rng)
      : classicField(cols, rows, c, p.arcSamples, p.straightness, rng);

    const components = mergePaths(strokes, 1e-3);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/pipes-test.mjs`
Expected: `ALL PASS`

- [ ] **Step 5: Commit**

```bash
git add src/generators/pipes.ts scripts/pipes-test.mjs
git commit -m "feat(pipes): model param (wang|classic) + density, wire generate()"
```

---

## Task 5: Volle Verifikation (Regression + Build) + visueller Render

**Files:** (keine Code-Änderung außer evtl. Fixes)

- [ ] **Step 1: Regressions-Suite**

Run:
```bash
npx tsx scripts/pipes-wang-test.mjs && \
npx tsx scripts/pipes-test.mjs && \
npx tsx scripts/smoke.mjs && \
npx tsx scripts/mergepaths-test.mjs && \
npx tsx scripts/offset-test.mjs
```
Expected: jeweils `ALL PASS` (smoke iteriert alle Generatoren inkl. `pipes` mit Default `model: "wang"`).

- [ ] **Step 2: Typecheck + Build**

Run: `npm run typecheck && npm run build`
Expected: kein Fehler, `✓ built`.

- [ ] **Step 3: Visueller Render (manuell, vom Menschen)**

Run: `npm run dev` → Browser → Generator `Truchet Pipes`, `model: wang`.
Prüfen: distinkte Pipes, lange Geraden, saubere 90°-Kehren, **keine Kreuzungen**, manche Zellen leer. `density` hoch/niedrig + `straightness` durchspielen. Down-rechts-Drift beurteilen (→ Entscheidung WFC-Folge-Task ja/nein).
Dies ist ein menschlicher Verifikations-Schritt; kein automatischer Pass/Fail.

- [ ] **Step 4: Final commit (falls Fixes nötig waren)**

```bash
git add -A && git commit -m "chore(pipes): verify wang model — tests + build green"
```
(Wenn keine Änderung nötig: skip.)

---

## Self-Review

**Spec coverage:**
- Param `model`/`density` → Task 4 ✓
- Degree-0/2-Invariante (kreuzungsfrei) → `chooseTile` Task 1 + Test ✓
- Kausaler Sweep + Rand-Vorbelegung → `wangField` Task 3 ✓
- Tile-Geometrie (Geraden + 4 Elbows, Endpunkte auf Kantenmitten) → `wangTileStroke` Task 2 + Endpunkt-Test ✓
- Determinismus → Task 1/3/4 Tests ✓
- classic bit-identisch / Regression → Task 4 (pin) + Task 5 (smoke) ✓
- In-bounds + Farbe → Task 4 ✓
- Stromabwärts unverändert → Task 4 Step 3(e) lässt `mergePaths`→`fitToCanvas` unberührt ✓

**Placeholder scan:** keine TBD/TODO; alle Code-Steps vollständig.

**Type consistency:** `Pair`, `chooseTile`, `wangTileStroke`, `wangField` Signaturen über Tasks 1–4 konsistent; `RNG` aus `../util/random` importiert; `Point`/`Polyline` aus bestehenden Types. `model`/`density` in Params, DEFAULTS, schema gleich benannt.
