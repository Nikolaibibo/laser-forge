# Export-Path-Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optionaler Toggle in der ExportBar, der beim SVG-Export überlappende Pfade entfernt, damit der Laser keine doppelt gebrannten Linien produziert.

**Architecture:** Eine reine Util-Funktion `dedupePaths(polylines, tol)` segmentiert die Eingabe, snappt Endpunkte auf ein 0.01 mm Gitter, gruppiert Segmente nach Linien-Schlüssel, vereinigt kollineare Intervalle und stitcht das Ergebnis greedy zu möglichst langen Polylinien zusammen. `svgExport` ruft diese Funktion auf, wenn `{ dedupe: true }` durchgereicht wird. Ein Checkbox-State in `ExportBar.tsx` steuert das Flag.

**Tech Stack:** TypeScript, React 18, Vite, tsx (für ad-hoc-Test-Scripts unter `scripts/`). Es gibt kein Test-Framework — Tests laufen als Node-Scripts, die per `process.exit(1)` bei Assertion-Fehler failen.

**File map:**
- `src/util/dedupePaths.ts` (neu) — Pure dedup-Funktion + Konstante.
- `src/render/svgExport.ts` (modifizieren) — neue Options-Param `{ dedupe }`, ruft `dedupePaths` bei `true`.
- `src/ui/ExportBar.tsx` (modifizieren) — Checkbox + State + Übergabe an `downloadSvg`.
- `scripts/test-dedupe.mjs` (neu) — Ad-hoc Test-Runner mit Assertion-Helper.

---

### Task 1: Skelett der Dedup-Util mit leerer Implementierung

**Files:**
- Create: `src/util/dedupePaths.ts`

- [ ] **Step 1: Datei mit Signatur und Konstante anlegen**

```ts
// src/util/dedupePaths.ts
import type { Point, Polyline } from "../generators/types";

export const DEDUPE_TOLERANCE_MM = 0.01;

/**
 * Removes duplicate and partially overlapping collinear path segments.
 * Snaps endpoints to a `toleranceMm` grid, merges overlapping intervals on
 * each shared infinite line, then re-stitches surviving segments into
 * longest-possible polylines. Pure: no mutation of the input.
 */
export const dedupePaths = (
  polylines: Polyline[],
  toleranceMm: number = DEDUPE_TOLERANCE_MM,
): Polyline[] => {
  if (polylines.length === 0) return [];
  // TODO: filled in by subsequent tasks
  return polylines;
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no new errors)

- [ ] **Step 3: Commit skipped (project is not a git repo)**

---

### Task 2: Test-Runner-Skelett mit Assertion-Helpern

**Files:**
- Create: `scripts/test-dedupe.mjs`

- [ ] **Step 1: Test-Runner-Datei anlegen**

```js
// scripts/test-dedupe.mjs
// Ad-hoc test runner for dedupePaths. Run: npx tsx scripts/test-dedupe.mjs
const { dedupePaths, DEDUPE_TOLERANCE_MM } = await import("../src/util/dedupePaths.ts");

let pass = 0;
let fail = 0;

const t = (name, fn) => {
  try {
    fn();
    console.log(`✓ ${name}`);
    pass++;
  } catch (e) {
    console.log(`✗ ${name}\n    ${e.message}`);
    fail++;
  }
};

const eq = (actual, expected, msg = "") => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n    expected: ${e}\n    actual:   ${a}`);
};

const approx = (a, b, eps = 1e-6) => {
  if (Math.abs(a - b) > eps) throw new Error(`expected ${b} ±${eps}, got ${a}`);
};

// Counts total segments across all polylines (treating each consecutive
// point-pair as one segment, plus the closing segment for closed polylines).
const countSegments = (lines) =>
  lines.reduce((n, l) => n + Math.max(0, l.points.length - 1) + (l.closed ? 1 : 0), 0);

// --- Tests follow in subsequent tasks ---

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Smoke-run**

Run: `npx tsx scripts/test-dedupe.mjs`
Expected: `0 passed, 0 failed` and exit code 0.

---

### Task 3: Failing-Test für exakte Duplikate

**Files:**
- Modify: `scripts/test-dedupe.mjs` — vor dem Schluss-Block `console.log(...)` einfügen

- [ ] **Step 1: Test einfügen**

Direkt vor `console.log(\`\n${pass} passed, ${fail} failed\`);` einfügen:

```js
t("exact duplicate segments collapse to one", () => {
  const a = { closed: false, points: [[0, 0], [10, 0]] };
  const b = { closed: false, points: [[0, 0], [10, 0]] };
  const out = dedupePaths([a, b]);
  eq(countSegments(out), 1, "should have exactly 1 segment after dedup");
});
```

- [ ] **Step 2: Lauf, erwarte FAIL**

Run: `npx tsx scripts/test-dedupe.mjs`
Expected: `✗ exact duplicate segments collapse to one` (skeleton returns input unchanged, so 2 segments survive).

---

### Task 4: Snap-Helper + Schritt-1-Implementierung (Segmentieren & Snappen)

**Files:**
- Modify: `src/util/dedupePaths.ts`

- [ ] **Step 1: Komplette Datei ersetzen**

```ts
// src/util/dedupePaths.ts
import type { Point, Polyline } from "../generators/types";

export const DEDUPE_TOLERANCE_MM = 0.01;

type SnapKey = string; // `${ix}|${iy}` integer-grid coordinates
type Segment = { aKey: SnapKey; bKey: SnapKey; a: Point; b: Point };

const snap = (p: Point, tol: number): { key: SnapKey; pt: Point } => {
  const ix = Math.round(p[0] / tol);
  const iy = Math.round(p[1] / tol);
  return { key: `${ix}|${iy}`, pt: [ix * tol, iy * tol] };
};

const collectSegments = (polylines: Polyline[], tol: number): Segment[] => {
  const segs: Segment[] = [];
  for (const l of polylines) {
    if (l.points.length < 2) continue;
    const snapped = l.points.map((p) => snap(p, tol));
    for (let i = 0; i < snapped.length - 1; i++) {
      const a = snapped[i];
      const b = snapped[i + 1];
      if (a.key === b.key) continue; // degenerate after snap
      segs.push({ aKey: a.key, bKey: b.key, a: a.pt, b: b.pt });
    }
    if (l.closed && snapped.length >= 2) {
      const a = snapped[snapped.length - 1];
      const b = snapped[0];
      if (a.key !== b.key) segs.push({ aKey: a.key, bKey: b.key, a: a.pt, b: b.pt });
    }
  }
  return segs;
};

export const dedupePaths = (
  polylines: Polyline[],
  toleranceMm: number = DEDUPE_TOLERANCE_MM,
): Polyline[] => {
  if (polylines.length === 0) return [];
  const segs = collectSegments(polylines, toleranceMm);
  // TODO: tasks 5–7 add line-key grouping, interval merging, re-stitch.
  // For now, emit each surviving segment as a 2-point polyline so we have
  // something testable end-to-end.
  return segs.map((s) => ({ closed: false, points: [s.a, s.b] }));
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Test-Lauf**

Run: `npx tsx scripts/test-dedupe.mjs`
Expected: Test aus Task 3 schlägt immer noch fehl (`2` statt `1`), aber kein Crash. Das ist erwartet — Dedup-Logik kommt in Task 6.

---

### Task 5: Linien-Schlüssel-Funktion

**Files:**
- Modify: `src/util/dedupePaths.ts`

- [ ] **Step 1: `lineKey` + `projectOnto` Helfer hinzufügen**

Direkt unter dem `collectSegments`-Funktion einfügen:

```ts
const LINE_KEY_PRECISION = 1e6; // 6 decimal places for direction components

/**
 * Returns a canonical key for the infinite line containing segment [a, b].
 * Reversed segments produce the same key.
 * Also returns the unit direction `d` (canonicalized) and a reference point
 * `p0` on the line, used for 1D projection in the interval-merge step.
 */
const lineKey = (
  a: Point,
  b: Point,
): { key: string; d: Point; p0: Point } => {
  let dx = b[0] - a[0];
  let dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  // Canonicalize direction so (dx,dy) and (-dx,-dy) collide.
  if (dy < 0 || (dy === 0 && dx < 0)) {
    dx = -dx;
    dy = -dy;
  }
  // Signed perpendicular offset from origin: cross(d, a)
  const offset = dx * a[1] - dy * a[0];
  const rk = (n: number) => Math.round(n * LINE_KEY_PRECISION) / LINE_KEY_PRECISION;
  const key = `${rk(dx)}|${rk(dy)}|${rk(offset)}`;
  return { key, d: [dx, dy], p0: a };
};

const projectOnto = (p: Point, p0: Point, d: Point): number =>
  (p[0] - p0[0]) * d[0] + (p[1] - p0[1]) * d[1];
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

---

### Task 6: Intervall-Merge auf jeder Geraden

**Files:**
- Modify: `src/util/dedupePaths.ts`

- [ ] **Step 1: `dedupePaths` mit Bucket-Grouping + Interval-Merge ersetzen**

Ersetze den Body von `dedupePaths` (alles unterhalb von `if (polylines.length === 0) return [];`) durch:

```ts
  const segs = collectSegments(polylines, toleranceMm);
  if (segs.length === 0) return [];

  type Bucket = { d: Point; p0: Point; intervals: [number, number][] };
  const buckets = new Map<string, Bucket>();

  for (const s of segs) {
    const { key, d, p0 } = lineKey(s.a, s.b);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { d, p0, intervals: [] };
      buckets.set(key, bucket);
    }
    const ta = projectOnto(s.a, bucket.p0, bucket.d);
    const tb = projectOnto(s.b, bucket.p0, bucket.d);
    bucket.intervals.push(ta < tb ? [ta, tb] : [tb, ta]);
  }

  const merged: Segment[] = [];
  for (const bucket of buckets.values()) {
    bucket.intervals.sort((x, y) => x[0] - y[0]);
    let [curMin, curMax] = bucket.intervals[0];
    for (let i = 1; i < bucket.intervals.length; i++) {
      const [nMin, nMax] = bucket.intervals[i];
      if (nMin <= curMax + toleranceMm * 0.5) {
        if (nMax > curMax) curMax = nMax;
      } else {
        merged.push(intervalToSegment(curMin, curMax, bucket, toleranceMm));
        curMin = nMin;
        curMax = nMax;
      }
    }
    merged.push(intervalToSegment(curMin, curMax, bucket, toleranceMm));
  }

  // For now, emit each merged segment as its own polyline; re-stitch in Task 7.
  return merged
    .filter((s) => s.aKey !== s.bKey)
    .map((s) => ({ closed: false, points: [s.a, s.b] }));
};

const intervalToSegment = (
  tMin: number,
  tMax: number,
  bucket: { d: Point; p0: Point },
  tol: number,
): Segment => {
  const a: Point = [bucket.p0[0] + tMin * bucket.d[0], bucket.p0[1] + tMin * bucket.d[1]];
  const b: Point = [bucket.p0[0] + tMax * bucket.d[0], bucket.p0[1] + tMax * bucket.d[1]];
  const sa = snap(a, tol);
  const sb = snap(b, tol);
  return { aKey: sa.key, bKey: sb.key, a: sa.pt, b: sb.pt };
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Test aus Task 3 erneut laufen**

Run: `npx tsx scripts/test-dedupe.mjs`
Expected: `✓ exact duplicate segments collapse to one` — `1 passed, 0 failed`.

- [ ] **Step 4: Failing Test für kollineare Teilüberlappung hinzufügen**

In `scripts/test-dedupe.mjs` vor dem Schluss-Block einfügen:

```js
t("collinear partial overlap merges to union", () => {
  const a = { closed: false, points: [[0, 0], [5, 0]] };
  const b = { closed: false, points: [[3, 0], [10, 0]] };
  const out = dedupePaths([a, b]);
  eq(countSegments(out), 1, "should merge into single 0→10 segment");
  // Endpoint check: the union spans x=0 to x=10
  const allX = out.flatMap((l) => l.points.map((p) => p[0])).sort((x, y) => x - y);
  approx(allX[0], 0);
  approx(allX[allX.length - 1], 10);
});

t("crossing segments without shared endpoint stay intact", () => {
  const a = { closed: false, points: [[0, 0], [10, 0]] };
  const b = { closed: false, points: [[5, -5], [5, 5]] };
  const out = dedupePaths([a, b]);
  eq(countSegments(out), 2, "horizontal + vertical crossing → 2 segments");
});

t("dense curve segments are not over-merged", () => {
  // 50-point sine curve; each segment has a different direction
  const points = [];
  for (let i = 0; i < 50; i++) {
    const x = i;
    const y = Math.sin(i * 0.3) * 5;
    points.push([x, y]);
  }
  const out = dedupePaths([{ closed: false, points }]);
  eq(countSegments(out), 49, "49 segments from 50 points");
});
```

- [ ] **Step 5: Lauf**

Run: `npx tsx scripts/test-dedupe.mjs`
Expected: alle vier Tests grün — `4 passed, 0 failed`.

---

### Task 7: Re-Stitching zu langen Polylinien

**Files:**
- Modify: `src/util/dedupePaths.ts`

- [ ] **Step 1: `restitch`-Funktion hinzufügen**

Direkt nach `intervalToSegment` (am Ende der Datei) einfügen:

```ts
type Edge = { to: SnapKey; toPt: Point; used: boolean };

const restitch = (segs: Segment[]): Polyline[] => {
  // Build adjacency. Each edge is shared between both endpoints via reference,
  // so flipping `used` once removes it from both.
  const adj = new Map<SnapKey, Edge[]>();
  const nodePt = new Map<SnapKey, Point>();
  const add = (from: SnapKey, fromPt: Point, to: SnapKey, toPt: Point, edge: Edge) => {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push(edge);
    nodePt.set(from, fromPt);
    nodePt.set(to, toPt);
  };
  for (const s of segs) {
    const fwd: Edge = { to: s.bKey, toPt: s.b, used: false };
    const bwd: Edge = { to: s.aKey, toPt: s.a, used: false };
    // Tie the two half-edges together so marking one used hides the other.
    const pair = { used: false };
    Object.defineProperty(fwd, "used", {
      get: () => pair.used,
      set: (v) => {
        pair.used = v;
      },
    });
    Object.defineProperty(bwd, "used", {
      get: () => pair.used,
      set: (v) => {
        pair.used = v;
      },
    });
    add(s.aKey, s.a, s.bKey, s.b, fwd);
    add(s.bKey, s.b, s.aKey, s.a, bwd);
  }

  const oddDegreeNodes = (): SnapKey[] => {
    const out: SnapKey[] = [];
    for (const [k, edges] of adj) {
      const open = edges.filter((e) => !e.used).length;
      if (open % 2 === 1) out.push(k);
    }
    return out;
  };

  const anyOpenNode = (): SnapKey | undefined => {
    for (const [k, edges] of adj) {
      if (edges.some((e) => !e.used)) return k;
    }
    return undefined;
  };

  const walk = (startKey: SnapKey): Polyline => {
    const pts: Point[] = [nodePt.get(startKey)!];
    let cur = startKey;
    while (true) {
      const edges = adj.get(cur) ?? [];
      const next = edges.find((e) => !e.used);
      if (!next) break;
      next.used = true;
      pts.push(next.toPt);
      cur = next.to;
    }
    const closed = pts.length > 2 && cur === startKey;
    return { closed, points: pts };
  };

  const polylines: Polyline[] = [];
  // Prefer odd-degree starts (proper path ends) so we don't break an open
  // chain into multiple pieces by accident.
  for (const start of oddDegreeNodes()) {
    const open = (adj.get(start) ?? []).some((e) => !e.used);
    if (open) polylines.push(walk(start));
  }
  // Remaining components are even-degree → closed loops.
  let next = anyOpenNode();
  while (next !== undefined) {
    polylines.push(walk(next));
    next = anyOpenNode();
  }
  return polylines.filter((l) => l.points.length >= 2);
};
```

- [ ] **Step 2: `dedupePaths` umstellen, um `restitch` zu nutzen**

Ersetze die `return merged.filter(...).map(...)` Zeile am Ende von `dedupePaths` durch:

```ts
  const cleaned = merged.filter((s) => s.aKey !== s.bKey);
  return restitch(cleaned);
};
```

(Die `intervalToSegment`-Definition bleibt unverändert; sie steht jetzt zwischen `dedupePaths` und `restitch`.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Test für Re-Stitching hinzufügen**

In `scripts/test-dedupe.mjs` vor dem Schluss-Block einfügen:

```js
t("chained segments restitch into one polyline", () => {
  const a = { closed: false, points: [[0, 0], [1, 0]] };
  const b = { closed: false, points: [[1, 0], [2, 1]] };
  const c = { closed: false, points: [[2, 1], [3, 1]] };
  const out = dedupePaths([a, b, c]);
  eq(out.length, 1, "three chained segments → 1 polyline");
  eq(out[0].points.length, 4, "polyline has 4 points");
});

t("triangle restitches into closed polyline", () => {
  const a = { closed: false, points: [[0, 0], [10, 0]] };
  const b = { closed: false, points: [[10, 0], [5, 10]] };
  const c = { closed: false, points: [[5, 10], [0, 0]] };
  const out = dedupePaths([a, b, c]);
  eq(out.length, 1, "triangle → 1 polyline");
  eq(out[0].closed, true, "polyline is closed");
});

t("empty input returns empty array", () => {
  const out = dedupePaths([]);
  eq(out, []);
});

t("float jitter below tolerance collapses", () => {
  const a = { closed: false, points: [[0, 0], [10, 0]] };
  const b = { closed: false, points: [[1e-9, 0], [10 + 1e-9, 0]] };
  const out = dedupePaths([a, b]);
  eq(countSegments(out), 1, "near-identical segments collapse");
});
```

- [ ] **Step 5: Lauf**

Run: `npx tsx scripts/test-dedupe.mjs`
Expected: `8 passed, 0 failed`.

---

### Task 8: SVG-Export-API um `{ dedupe }`-Option erweitern

**Files:**
- Modify: `src/render/svgExport.ts`

- [ ] **Step 1: Komplette Datei ersetzen**

```ts
import type { Artwork } from "../generators/types";
import { dedupePaths } from "../util/dedupePaths";

const round = (n: number, digits = 3): string => {
  const m = Math.pow(10, digits);
  return String(Math.round(n * m) / m);
};

export type SvgExportOptions = {
  /** Remove duplicate and overlapping collinear path segments before serializing. */
  dedupe?: boolean;
};

/**
 * Serialize an Artwork to clean, plotter/laser-friendly SVG.
 * - viewBox in millimetres
 * - <path> elements only (no <circle>, <rect>, no text)
 * - stroke only, no fill, black
 * - vector-effect so preview stroke weight is independent of scale
 */
export const svgExport = (art: Artwork, opts: SvgExportOptions = {}): string => {
  const { widthMm, heightMm } = art;
  const lines = opts.dedupe ? dedupePaths(art.polylines) : art.polylines;
  const paths = lines
    .filter((l) => l.points.length >= 2)
    .map((l) => {
      const d =
        "M " +
        l.points
          .map(([x, y], i) => (i === 0 ? `${round(x)},${round(y)}` : `L ${round(x)},${round(y)}`))
          .join(" ") +
        (l.closed ? " Z" : "");
      return `<path d="${d}"/>`;
    })
    .join("\n  ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${widthMm}mm" height="${heightMm}mm"
     viewBox="0 0 ${widthMm} ${heightMm}"
     fill="none" stroke="black" stroke-width="0.3"
     stroke-linecap="round" stroke-linejoin="round">
  ${paths}
</svg>
`;
};

export const downloadSvg = (
  art: Artwork,
  filename = "laser-forge.svg",
  opts: SvgExportOptions = {},
) => {
  const blob = new Blob([svgExport(art, opts)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Smoke-Test, dass Default-Verhalten unverändert ist**

In `scripts/test-dedupe.mjs` vor dem Schluss-Block hinzufügen:

```js
t("svgExport without options is identical to previous behavior", async () => {
  const { svgExport } = await import("../src/render/svgExport.ts");
  const art = {
    widthMm: 100,
    heightMm: 100,
    polylines: [
      { closed: false, points: [[0, 0], [10, 0]] },
      { closed: false, points: [[0, 0], [10, 0]] }, // duplicate
    ],
  };
  const off = svgExport(art);
  const on = svgExport(art, { dedupe: true });
  // Without dedupe: 2 paths. With dedupe: 1 path.
  const countPaths = (s) => (s.match(/<path /g) || []).length;
  eq(countPaths(off), 2, "default leaves duplicates in");
  eq(countPaths(on), 1, "dedupe option removes duplicates");
});
```

- [ ] **Step 4: Lauf**

Run: `npx tsx scripts/test-dedupe.mjs`
Expected: `9 passed, 0 failed`.

---

### Task 9: Checkbox in der ExportBar

**Files:**
- Modify: `src/ui/ExportBar.tsx`

- [ ] **Step 1: State und Checkbox einbauen**

Im `ExportBar`-Component, nach der Zeile `const [copied, setCopied] = useState(false);`, einfügen:

```tsx
  const [dedupe, setDedupe] = useState(false);
```

Dann den SVG-Button-Block ersetzen (die letzten zwei JSX-Elemente vor dem schließenden `</div>`):

Alte Zeilen (ungefähr `ExportBar.tsx:92-100`):
```tsx
      <button onClick={copyShareLink} style={btnStyle}>
        {copied ? "✓ copied" : "🔗 Copy link"}
      </button>
      <button
        onClick={() => downloadSvg(artwork, `${generatorId}-${seed}.svg`)}
        style={{ ...btnStyle, background: "#e96a3a", color: "#fff" }}
      >
        ⬇ SVG
      </button>
```

Ersetzen durch:

```tsx
      <button onClick={copyShareLink} style={btnStyle}>
        {copied ? "✓ copied" : "🔗 Copy link"}
      </button>
      <label
        title="Entfernt überlappende Pfade, damit der Laser sie nicht doppelt brennt."
        style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
      >
        <input
          type="checkbox"
          checked={dedupe}
          onChange={(e) => setDedupe(e.target.checked)}
        />
        Doppelpfade entfernen
      </label>
      <button
        onClick={() => downloadSvg(artwork, `${generatorId}-${seed}.svg`, { dedupe })}
        style={{ ...btnStyle, background: "#e96a3a", color: "#fff" }}
      >
        ⬇ SVG
      </button>
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Dev-Server starten und manuell testen**

Run: `npm run dev` (im Hintergrund starten oder in separatem Terminal).

Manueller Test-Ablauf:
1. App im Browser öffnen (`http://localhost:5173` o.ä.).
2. Generator `rose` wählen (oder einen anderen, der ein Mandala produziert).
3. Distortion `kaleidoscope` hinzufügen, Segmente auf 6 setzen.
4. Polylinien-Counter unten in der ExportBar notieren (z.B. `120 lines · 12,000 points`).
5. SVG ohne Häkchen exportieren — Datei sichern als `before.svg`.
6. Häkchen bei „Doppelpfade entfernen" setzen, erneut exportieren — `after.svg`.
7. Beide Dateien in Inkscape oder einem anderen Vektor-Viewer öffnen.
8. Erwartung: `after.svg` hat weniger `<path>`-Elemente, sichtbare Spiegelachsen sind nicht mehr doppelt gezeichnet.

Stoppe den Dev-Server nach dem Test.

---

### Task 10: Build + Final Smoke

**Files:** keine

- [ ] **Step 1: Production Build**

Run: `npm run build`
Expected: PASS, kein Output-Fehler.

- [ ] **Step 2: Bestehende Smoke-Suite**

Run: `npx tsx scripts/smoke.mjs`
Expected: gleiche Output-Counts wie vor den Änderungen (Dedup ist opt-in und berührt die Smoke-Pipeline nicht).

- [ ] **Step 3: Dedup-Tests final**

Run: `npx tsx scripts/test-dedupe.mjs`
Expected: `9 passed, 0 failed`.

---

## Self-Review (post-write)

**Spec coverage:**
- Erfolgskriterium 1 (keine zwei `<path>`s decken dieselbe Strichmenge) → Tasks 6 + 8 + manueller Test in Task 9.
- Erfolgskriterium 2 (kollineare Teilüberlappung → Vereinigung) → Task 6, Test „collinear partial overlap merges to union".
- Erfolgskriterium 3 (dichte Kurven nicht über-vereinfacht) → Task 6, Test „dense curve segments are not over-merged".
- Erfolgskriterium 4 (deaktiviert → bit-identisches Default-Verhalten) → Task 8, Test „svgExport without options is identical".
- Erfolgskriterium 5 (Performance < 50 ms für 10k Segmente) → nicht explizit gebenchmarkt; Algorithmus ist O(N log N), 10k ist klein. Falls bei manuellem Test mit großem Mandala Lag auffällt, Folgetask.

**Placeholder-Scan:** Keine offenen TODOs außer dem expliziten Zwischenstand-TODO in Task 4, das in Task 6/7 ersetzt wird.

**Type-Konsistenz:** `Segment`, `SnapKey`, `Edge`, `Bucket` werden alle innerhalb derselben Datei in konsistenter Form definiert. `SvgExportOptions` wird in Task 8 definiert und in Task 9 importiert via `downloadSvg`-Signatur (kein direkter Import nötig, `downloadSvg` akzeptiert das Options-Objekt).
