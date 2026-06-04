# Blueprint Layout Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drawscape-style blueprint compositions (imported SVG motif + Hershey-typeset frame) as a new `blueprint` generator, end-to-end to SVG/G-Code export.

**Architecture:** New pure-string SVG parser (`util/svgImport.ts`) feeds a `motif` field in the zustand store; a new generator (`generators/blueprint.ts`) lays out frame + text slots + motif per Template A; a small `MotifPanel` handles upload. Three Hershey serif fonts get vendored via the existing build script. Spec: `docs/superpowers/specs/2026-06-04-blueprint-layout-module-design.md`.

**Tech Stack:** TypeScript, React 18, zustand, leva, tsx check-scripts (repo convention — no test runner). Verification: `npm run typecheck` + `npx tsx scripts/*-test.ts` + deterministic render checks.

**Repo:** `/Users/nikolaibockholt/Documents/web/laser-forge` — alle Pfade relativ dazu. Vor Start: `git status` clean, auf `main`.

---

## Task 1: Hershey-Serif-Fonts vendoren (timesr / timesrb / timesi)

**Files:**
- Create: `scripts/hershey/timesr.jhf`, `scripts/hershey/timesrb.jhf`, `scripts/hershey/timesi.jhf` (Download)
- Modify: `scripts/hershey/build.ts`
- Create (generiert): `src/generators/hersheyTimesr.ts`, `src/generators/hersheyTimesrb.ts`, `src/generators/hersheyTimesi.ts`
- Modify: `src/generators/text.ts` (Font-Registry + Schema-Options)

- [x] **Step 1: JHF-Dateien herunterladen**

```bash
cd /Users/nikolaibockholt/Documents/web/laser-forge/scripts/hershey
curl -fsSL -o timesr.jhf  https://raw.githubusercontent.com/kamalmostafa/hershey-fonts/master/hershey-fonts/timesr.jhf
curl -fsSL -o timesrb.jhf https://raw.githubusercontent.com/kamalmostafa/hershey-fonts/master/hershey-fonts/timesrb.jhf
curl -fsSL -o timesi.jhf  https://raw.githubusercontent.com/kamalmostafa/hershey-fonts/master/hershey-fonts/timesi.jhf
wc -l *.jhf
```

Expected: drei neue Dateien, je ≥96 Zeilen (physische Zeilen können >96 sein — JHF wrappt lange Glyphen, siehe Step 2). Fallback bei 404: `https://media.unpythonic.net/emergent-files/software/hershey/hershey.zip` entpacken und die drei `.jhf` herauskopieren.

- [x] **Step 2: build.ts um Continuation-Line-Joining + neue Fonts erweitern**

JHF-Format: Spalten 0–4 Glyph-ID, Spalten 5–7 Vertex-Count (inkl. Left/Right-Paar), Daten ab Spalte 8. Lange Glyphen wrappen über mehrere physische Zeilen — `futural.jhf`/`cursive.jhf` sind ungewrappt, die Times-Schnitte potenziell nicht. In `scripts/hershey/build.ts`:

Die `FONTS`-Liste (Zeile 10–13) ersetzen durch:

```typescript
const FONTS = [
  { jhf: "futural.jhf", out: "hersheyFutural.ts", exportName: "FUTURAL", label: 'Hershey Simplex ("futural")' },
  { jhf: "cursive.jhf", out: "hersheyCursive.ts", exportName: "CURSIVE", label: 'Hershey Cursive ("cursive")' },
  { jhf: "timesr.jhf",  out: "hersheyTimesr.ts",  exportName: "TIMESR",  label: 'Hershey Times Roman ("timesr")' },
  { jhf: "timesrb.jhf", out: "hersheyTimesrb.ts", exportName: "TIMESRB", label: 'Hershey Times Roman Bold ("timesrb")' },
  { jhf: "timesi.jhf",  out: "hersheyTimesi.ts",  exportName: "TIMESI",  label: 'Hershey Times Italic ("timesi")' },
];
```

Die Zeile `const lines = jhf.split("\n").filter((l) => l.trim().length > 0);` (Zeile 19) ersetzen durch:

```typescript
  // JHF logical records: cols 0-4 glyph id, cols 5-7 vertex count (incl. the
  // left/right pair = 2 chars per vertex). Long glyphs wrap across physical
  // lines — join until the declared data length is reached.
  const physical = jhf.split("\n").filter((l) => l.length > 0);
  const lines: string[] = [];
  for (let i = 0; i < physical.length; ) {
    let line = physical[i++];
    const nverts = parseInt(line.slice(5, 8), 10);
    while (line.length - 8 < nverts * 2 && i < physical.length) line += physical[i++];
    lines.push(line);
  }
```

- [x] **Step 3: Build laufen lassen**

```bash
cd /Users/nikolaibockholt/Documents/web/laser-forge
npx tsx scripts/hershey/build.ts
```

Expected: 5 Zeilen `wrote .../src/generators/hershey*.ts (96 glyphs)`. **Wenn eine Font ≠96 Glyphen meldet, STOPP** — Wrapping-Logik prüfen (Daten-Länge je Zeile gegen `nverts*2` diffen), nicht einfach weitermachen.

- [x] **Step 4: Font-Registry in text.ts erweitern**

In `src/generators/text.ts`:

Imports (nach Zeile 4 `import { CURSIVE } ...`) ergänzen:

```typescript
import { TIMESR } from "./hersheyTimesr";
import { TIMESRB } from "./hersheyTimesrb";
import { TIMESI } from "./hersheyTimesi";
```

Die Zeilen 12–16 (`HersheyFontId` + `FONTS`) ersetzen durch:

```typescript
export type HersheyFontId = "simplex" | "cursive" | "serif" | "serifBold" | "serifItalic";
export const FONT_IDS: HersheyFontId[] = ["simplex", "cursive", "serif", "serifBold", "serifItalic"];
const FONTS: Record<HersheyFontId, Record<number, HersheyGlyph>> = {
  simplex: FUTURAL,
  cursive: CURSIVE,
  serif: TIMESR,
  serifBold: TIMESRB,
  serifItalic: TIMESI,
};
```

Im Schema des Text-Generators (Zeile 162) die Font-Options erweitern:

```typescript
    font: { value: DEFAULTS.font, options: FONT_IDS },
```

- [x] **Step 5: Typecheck + Sicht-Render**

```bash
npm run typecheck
npx tsx scripts/render-demo.ts text 7 /tmp/serif-check.svg font=serif text=CALIBER lanesMin=2 lanesMax=2
```

Expected: typecheck exit 0; Render-Zeile `text seed=7 → /tmp/serif-check.svg (N polylines, M bytes)` mit N > 0. Optional PNG: `rsvg-convert -w 600 /tmp/serif-check.svg -o /tmp/serif-check.png` und anschauen — Serif-Buchstabenformen erkennbar.

- [x] **Step 6: Commit**

```bash
git add scripts/hershey/ src/generators/hersheyTimesr.ts src/generators/hersheyTimesrb.ts src/generators/hersheyTimesi.ts src/generators/text.ts
git commit -m "feat: vendor Hershey Times fonts (serif/serifBold/serifItalic)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: SVG-Import-Parser (`util/svgImport.ts`)

**Files:**
- Test: `scripts/svgimport-test.ts` (zuerst!)
- Create: `src/util/svgImport.ts`

- [x] **Step 1: Check-Script schreiben (Repo-Konvention statt Test-Runner)**

`scripts/svgimport-test.ts` anlegen:

```typescript
// scripts/svgimport-test.ts — checks for the vpype-flat SVG motif parser.
// Usage: npx tsx scripts/svgimport-test.ts
import assert from "node:assert/strict";
import { parseSvgMotif } from "../src/util/svgImport";

const wrap = (body: string, attrs = 'width="100mm" height="50mm" viewBox="0 0 100 50"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

// 1. absolute M/L, doc size from width/height
{
  const r = parseSvgMotif(wrap('<path d="M 0 0 L 10 0 L 10 5"/>'));
  assert.equal(r.widthMm, 100);
  assert.equal(r.heightMm, 50);
  assert.equal(r.polylines.length, 1);
  assert.deepEqual(r.polylines[0].points, [[0, 0], [10, 0], [10, 5]]);
  assert.equal(r.polylines[0].closed, false);
}
// 2. relative m/l + z closes
{
  const r = parseSvgMotif(wrap('<path d="m 5 5 l 10 0 l 0 10 z"/>'));
  assert.deepEqual(r.polylines[0].points, [[5, 5], [15, 5], [15, 15]]);
  assert.equal(r.polylines[0].closed, true);
}
// 3. multiple subpaths in one d
{
  const r = parseSvgMotif(wrap('<path d="M 0 0 L 1 1 M 5 5 L 6 6"/>'));
  assert.equal(r.polylines.length, 2);
}
// 4. polyline / polygon / line elements
{
  const r = parseSvgMotif(wrap('<polyline points="0,0 5,5 10,0"/><polygon points="0 0 4 0 4 4"/><line x1="1" y1="2" x2="3" y2="4"/>'));
  assert.equal(r.polylines.length, 3);
  assert.equal(r.polylines[0].closed, false);
  assert.equal(r.polylines[1].closed, true);
  assert.deepEqual(r.polylines[2].points, [[1, 2], [3, 4]]);
}
// 5. group translate (vpype layer groups)
{
  const r = parseSvgMotif(wrap('<g transform="translate(10,20)"><path d="M 0 0 L 1 0"/></g>'));
  assert.deepEqual(r.polylines[0].points, [[10, 20], [11, 20]]);
}
// 6. scientific notation + comma separators
{
  const r = parseSvgMotif(wrap('<path d="M 1e1,2.5e0 L 2e1,5"/>'));
  assert.deepEqual(r.polylines[0].points, [[10, 2.5], [20, 5]]);
}
// 7. curve commands rejected with vpype hint
assert.throws(() => parseSvgMotif(wrap('<path d="M 0 0 C 1 1 2 2 3 3"/>')), /unsupported path command/);
// 8. non-translate transform rejected
assert.throws(() => parseSvgMotif(wrap('<g transform="rotate(45)"><path d="M 0 0 L 1 1"/></g>')), /unsupported transform/);
// 9. viewBox units ≠ mm → scaled to mm
{
  const r = parseSvgMotif(wrap('<path d="M 0 0 L 200 100"/>', 'width="100mm" height="50mm" viewBox="0 0 200 100"'));
  assert.deepEqual(r.polylines[0].points, [[0, 0], [100, 50]]);
}
// 10. no drawable elements → throws
assert.throws(() => parseSvgMotif(wrap("")), /no drawable/);
// 11. not an svg → throws
assert.throws(() => parseSvgMotif("<html></html>"), /not an SVG/);

console.log("svgImport: all checks passed ✓");
```

- [x] **Step 2: Check laufen lassen — muss fehlschlagen**

```bash
npx tsx scripts/svgimport-test.ts
```

Expected: FAIL — `Cannot find module '../src/util/svgImport'`.

- [x] **Step 3: Parser implementieren**

`src/util/svgImport.ts` anlegen:

```typescript
// src/util/svgImport.ts — parse vpype-style flat SVGs (lines only) into Polylines.
// Scope per spec: M/L/m/l/Z paths, polyline/polygon/line elements, translate()-only
// transforms. Curves/other transforms throw with a "flatten with vpype" hint.
// Pure string parsing — no DOMParser, so it runs in node scripts too.
import type { Point, Polyline } from "../generators/types";

export type MotifData = { polylines: Polyline[]; widthMm: number; heightMm: number };

const NUM_RE = /-?\.?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g;

const num = (s: string): number => {
  const v = parseFloat(s);
  if (!isFinite(v)) throw new Error(`invalid number: "${s}"`);
  return v;
};

/** Strip unit suffix. vpype writes mm; px/unitless are taken as viewBox units. */
const mm = (s: string): number => num(s.replace(/(mm|px|pt|cm|in)\s*$/i, ""));

const attr = (tag: string, name: string): string | undefined => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
  return m?.[1];
};

/** Only translate(x[,y]) is supported (vpype layer groups). Anything else → error. */
const parseTranslate = (t: string | undefined): [number, number] => {
  if (!t) return [0, 0];
  const m = t.trim().match(/^translate\(\s*(-?[\d.eE+]+)[\s,]*(-?[\d.eE+]+)?\s*\)$/);
  if (!m) throw new Error(`unsupported transform "${t}" — flatten the SVG with vpype first`);
  return [num(m[1]), m[2] !== undefined ? num(m[2]) : 0];
};

function parsePathD(d: string, off: [number, number]): Polyline[] {
  const bad = (d.match(/[A-Za-z]/g) ?? []).find((c) => !"MmLlZz".includes(c));
  if (bad) {
    throw new Error(`unsupported path command "${bad}" — flatten curves with vpype first`);
  }
  const tokens = d.match(new RegExp(`[MmLlZz]|${NUM_RE.source}`, "g")) ?? [];
  const polys: Polyline[] = [];
  let cur: Point[] = [];
  let mode: "M" | "m" | "L" | "l" | null = null;
  let x = 0;
  let y = 0;
  let i = 0;
  const flush = (closed: boolean) => {
    if (cur.length >= 2) polys.push({ points: cur, closed });
    cur = [];
  };
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === "Z" || t === "z") {
      flush(true);
      mode = null;
      i++;
      continue;
    }
    if (t === "M" || t === "m" || t === "L" || t === "l") {
      if (t === "M" || t === "m") flush(false);
      mode = t;
      i++;
      continue;
    }
    if (!mode) throw new Error("path data: coordinates before any command");
    if (i + 1 >= tokens.length) throw new Error("path data: dangling coordinate");
    const nx = num(t);
    const ny = num(tokens[i + 1]);
    i += 2;
    if (mode === "M" || mode === "L") {
      x = nx;
      y = ny;
    } else {
      x += nx;
      y += ny;
    }
    cur.push([x + off[0], y + off[1]]);
    if (mode === "M") mode = "L"; // implicit lineto after moveto
    if (mode === "m") mode = "l";
  }
  flush(false);
  return polys;
}

function parsePoints(raw: string, off: [number, number], closed: boolean): Polyline | null {
  const nums = (raw.match(NUM_RE) ?? []).map(num);
  const pts: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i] + off[0], nums[i + 1] + off[1]]);
  return pts.length >= 2 ? { points: pts, closed } : null;
}

export function parseSvgMotif(svg: string): MotifData {
  const svgTag = svg.match(/<svg\b[^>]*>/)?.[0];
  if (!svgTag) throw new Error("not an SVG file (no <svg> element)");

  const vb = attr(svgTag, "viewBox")?.split(/[\s,]+/).map(num);
  const wAttr = attr(svgTag, "width");
  const hAttr = attr(svgTag, "height");
  const widthMm = wAttr ? mm(wAttr) : vb ? vb[2] : 0;
  const heightMm = hAttr ? mm(hAttr) : vb ? vb[3] : 0;
  if (!(widthMm > 0) || !(heightMm > 0)) throw new Error("SVG has no usable width/height or viewBox");

  // viewBox-unit → mm scale (vpype writes 1 unit = 1 mm; handle the general case anyway).
  const sx = vb ? widthMm / (vb[2] || 1) : 1;
  const sy = vb ? heightMm / (vb[3] || 1) : 1;
  const ox = vb ? vb[0] : 0;
  const oy = vb ? vb[1] : 0;

  const polylines: Polyline[] = [];
  const stack: [number, number][] = [[0, 0]];
  const tagRe = /<\/?(svg|g|path|polyline|polygon|line)\b[^>]*?>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(svg))) {
    const tag = m[0];
    const name = m[1];
    const closing = tag.startsWith("</");
    const selfClosing = tag.endsWith("/>");
    const off = stack[stack.length - 1];
    if (name === "g") {
      if (closing) {
        if (stack.length > 1) stack.pop();
      } else {
        const [tx, ty] = parseTranslate(attr(tag, "transform"));
        if (!selfClosing) stack.push([off[0] + tx, off[1] + ty]);
      }
      continue;
    }
    if (closing || name === "svg") continue;
    const [tx, ty] = parseTranslate(attr(tag, "transform"));
    const o: [number, number] = [off[0] + tx, off[1] + ty];
    if (name === "path") {
      const d = attr(tag, "d");
      if (d) polylines.push(...parsePathD(d, o));
    } else if (name === "polyline" || name === "polygon") {
      const p = parsePoints(attr(tag, "points") ?? "", o, name === "polygon");
      if (p) polylines.push(p);
    } else if (name === "line") {
      const x1 = num(attr(tag, "x1") ?? "0");
      const y1 = num(attr(tag, "y1") ?? "0");
      const x2 = num(attr(tag, "x2") ?? "0");
      const y2 = num(attr(tag, "y2") ?? "0");
      polylines.push({ points: [[x1 + o[0], y1 + o[1]], [x2 + o[0], y2 + o[1]]], closed: false });
    }
  }
  if (polylines.length === 0) {
    throw new Error("no drawable line elements found (path/polyline/polygon/line)");
  }

  const scaled = polylines.map((l) => ({
    ...l,
    points: l.points.map(([px, py]): Point => [(px - ox) * sx, (py - oy) * sy]),
  }));
  return { polylines: scaled, widthMm, heightMm };
}
```

- [x] **Step 4: Checks laufen lassen — müssen passen**

```bash
npx tsx scripts/svgimport-test.ts && npm run typecheck
```

Expected: `svgImport: all checks passed ✓` und typecheck exit 0.

- [x] **Step 5: Commit**

```bash
git add src/util/svgImport.ts scripts/svgimport-test.ts
git commit -m "feat: SVG motif import parser (vpype-flat scope)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Motif-State im Store

**Files:**
- Modify: `src/state/store.ts`

- [x] **Step 1: Motif-Feld + Setter ergänzen**

In `src/state/store.ts`:

Import (Zeile 2) erweitern:

```typescript
import type { Artwork, Polyline } from "../generators/types";
```

Nach dem `Layer`-Type (Zeile 8) ergänzen:

```typescript
/** Imported SVG motif for the blueprint generator. Not URL-synced; gone on reload. */
export type Motif = {
  name: string;
  polylines: Polyline[];
  widthMm: number;
  heightMm: number;
};
```

Im `AppState`-Type (vor `hydrate`, Zeile 31) ergänzen:

```typescript
  motif: Motif | null;
  setMotif: (m: Motif | null) => void;
```

In der `create`-Implementierung (vor `hydrate: (s) => set(s)`, Zeile 89) ergänzen:

```typescript
  motif: null,
  setMotif: (m) => set({ motif: m }),
```

- [x] **Step 2: Typecheck + Commit**

```bash
npm run typecheck
git add src/state/store.ts
git commit -m "feat: motif state for blueprint generator

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Expected: typecheck exit 0.

---

## Task 4: Blueprint-Generator (Template A) + Registry

**Files:**
- Test: `scripts/fixtures/motif-gear.svg`, `scripts/blueprint-test.ts` (zuerst!)
- Create: `src/generators/blueprint.ts`
- Modify: `src/generators/registry.ts`

- [x] **Step 1: Fixture anlegen**

`scripts/fixtures/motif-gear.svg` (vpype-artiges Test-Motiv — 12-Eck + Raute + Achse):

```xml
<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
  <g id="layer1">
    <path d="M 80 50 L 75.98 65 L 65 75.98 L 50 80 L 35 75.98 L 24.02 65 L 20 50 L 24.02 35 L 35 24.02 L 50 20 L 65 24.02 L 75.98 35 Z" />
    <path d="M 30 50 L 50 30 L 70 50 L 50 70 Z M 40 50 L 60 50" />
    <line x1="50" y1="10" x2="50" y2="90" />
  </g>
</svg>
```

- [x] **Step 2: Check-Script schreiben**

`scripts/blueprint-test.ts` anlegen:

```typescript
// scripts/blueprint-test.ts — layout + determinism checks for the blueprint generator.
// Usage: npx tsx scripts/blueprint-test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { blueprint } from "../src/generators/blueprint";
import { parseSvgMotif } from "../src/util/svgImport";
import { useApp } from "../src/state/store";
import { svgExport } from "../src/render/svgExport";

const here = dirname(fileURLToPath(import.meta.url));
const canvas = { wMm: 148, hMm: 210 }; // A5 portrait
const P = { ...blueprint.defaults };

// 1. no motif → placeholder renders, artwork spans canvas
useApp.getState().setMotif(null);
{
  const art = blueprint.generate(P, 1, canvas);
  assert.equal(art.widthMm, 148);
  assert.equal(art.heightMm, 210);
  assert.ok(art.polylines.length > 0, "expected polylines with placeholder motif");
}
// 2. frame is the first polyline: closed, at frameInsetMm
{
  const art = blueprint.generate(P, 1, canvas);
  const f = art.polylines[0];
  assert.equal(f.closed, true);
  assert.deepEqual(f.points[0], [P.frameInsetMm, P.frameInsetMm]);
}
// 3. slot collapse: empty subtitle → fewer polylines than with subtitle
{
  const a = blueprint.generate({ ...P, subtitle: "" }, 1, canvas);
  const b = blueprint.generate({ ...P, subtitle: "Manual-Wind Chronograph" }, 1, canvas);
  assert.ok(b.polylines.length > a.polylines.length, "subtitle should add polylines");
}
// 4. accentTarget frame → frame polyline carries accentColor
{
  const art = blueprint.generate({ ...P, accentTarget: "frame" as const }, 1, canvas);
  assert.equal(art.polylines[0].stroke, P.accentColor);
}
// 5. corner marks add exactly 8 segments
{
  const a = blueprint.generate({ ...P, cornerMarks: false }, 1, canvas);
  const b = blueprint.generate({ ...P, cornerMarks: true }, 1, canvas);
  assert.equal(b.polylines.length - a.polylines.length, 8);
}
// 6. motif embedding: all points stay inside the canvas
{
  const fixture = readFileSync(join(here, "fixtures/motif-gear.svg"), "utf8");
  useApp.getState().setMotif({ name: "gear", ...parseSvgMotif(fixture) });
  const art = blueprint.generate(P, 1, canvas);
  for (const l of art.polylines) {
    for (const [x, y] of l.points) {
      assert.ok(x >= 0 && x <= 148 && y >= 0 && y <= 210, `point outside canvas: ${x},${y}`);
    }
  }
}
// 7. determinism: identical SVG bytes on repeat generate
{
  const s1 = svgExport(blueprint.generate(P, 7, canvas), {});
  const s2 = svgExport(blueprint.generate(P, 7, canvas), {});
  assert.equal(s1, s2);
}

console.log("blueprint: all checks passed ✓");
```

- [x] **Step 3: Check laufen lassen — muss fehlschlagen**

```bash
npx tsx scripts/blueprint-test.ts
```

Expected: FAIL — `Cannot find module '../src/generators/blueprint'`.

- [x] **Step 4: Generator implementieren**

`src/generators/blueprint.ts` anlegen:

```typescript
// src/generators/blueprint.ts — Drawscape-style blueprint composition: imported
// SVG motif framed by Hershey single-stroke typography. Template A "Classic".
// Spec: docs/superpowers/specs/2026-06-04-blueprint-layout-module-design.md
// Reads the imported motif from the app store (only impurity — same motif +
// same params → identical output; seed is unused, the layout has no randomness).
import type { GeneratorDef, Point, Polyline } from "./types";
import { layoutTextStrokes, FONT_IDS, type HersheyFontId } from "./text";
import { fitToCanvas, polylineBounds } from "../util/path";
import { useApp } from "../state/store";

type Params = {
  template: "classic";
  header: string;
  title: string;
  subtitle: string;
  meta: string;
  footer: string;
  titleFont: HersheyFontId;
  metaFont: HersheyFontId;
  titleHeightMm: number;
  metaHeightMm: number;
  frameInsetMm: number;
  cornerMarks: boolean;
  motifScale: number;
  accentTarget: "none" | "frame" | "meta";
  accentColor: string;
};

const DEFAULTS: Params = {
  template: "classic",
  header: "",
  title: "OMEGA CALIBER 321",
  subtitle: "",
  meta: "",
  footer: "",
  titleFont: "serif",
  metaFont: "simplex",
  titleHeightMm: 8,
  metaHeightMm: 3,
  frameInsetMm: 8,
  cornerMarks: false,
  motifScale: 0.8,
  accentTarget: "none",
  accentColor: "#1a3a52",
};

const LETTER_SPACING = 2; // font units — matches the text generator's feel
const LINE_SPACING = 1.3;
const CAP_UNITS = 21; // Hershey glyph extent (cap −12 … baseline 9)

type Block = { lines: Polyline[]; wMm: number; hMm: number };

/**
 * Lay out a text block in mm, local coords: glyph bbox top at y=0, centered on
 * x=0. Empty/whitespace-only text → null (the slot collapses, per spec).
 * Caps at capMm; if the widest line would exceed maxWMm the block scales down.
 */
function block(
  str: string,
  font: HersheyFontId,
  capMm: number,
  maxWMm: number,
  stroke?: string,
): Block | null {
  const t = str.trim();
  if (!t) return null;
  const strokes = layoutTextStrokes(t, LETTER_SPACING, LINE_SPACING, font);
  const raw: Polyline[] = strokes
    .filter((s) => s.points.length >= 2)
    .map((s) => ({ points: s.points, closed: false, stroke }));
  if (raw.length === 0) return null;
  const b = polylineBounds(raw);
  const wUnits = b.maxX - b.minX || 1;
  const hUnits = b.maxY - b.minY || 1;
  let scale = capMm / CAP_UNITS;
  if (wUnits * scale > maxWMm) scale = maxWMm / wUnits;
  const lines = raw.map((l) => ({
    ...l,
    points: l.points.map(([x, y]): Point => [
      (x - (b.minX + b.maxX) / 2) * scale,
      (y - b.minY) * scale,
    ]),
  }));
  return { lines, wMm: wUnits * scale, hMm: hUnits * scale };
}

const translate = (lines: Polyline[], dx: number, dy: number): Polyline[] =>
  lines.map((l) => ({ ...l, points: l.points.map(([x, y]): Point => [x + dx, y + dy]) }));

export const blueprint: GeneratorDef<Params> = {
  id: "blueprint",
  name: "Blueprint",
  description:
    "Drawscape-style blueprint composition: an imported SVG motif (vpype-flat, " +
    "loaded via the Motif panel) framed by Hershey single-stroke typography. " +
    "Template A: header / motif / title / subtitle / meta / footer, centered " +
    "stack inside a thin frame. Empty text slots collapse. Canvas size = paper " +
    "format (80×80, 100×100, 148×210, 210×297).",
  defaults: DEFAULTS,
  schema: {
    template: { value: DEFAULTS.template, options: ["classic"] },
    header: { value: DEFAULTS.header },
    title: { value: DEFAULTS.title },
    subtitle: { value: DEFAULTS.subtitle },
    meta: { value: DEFAULTS.meta },
    footer: { value: DEFAULTS.footer },
    titleFont: { value: DEFAULTS.titleFont, options: FONT_IDS },
    metaFont: { value: DEFAULTS.metaFont, options: FONT_IDS },
    titleHeightMm: { value: DEFAULTS.titleHeightMm, min: 3, max: 20, step: 0.5 },
    metaHeightMm: { value: DEFAULTS.metaHeightMm, min: 1.5, max: 8, step: 0.25 },
    frameInsetMm: { value: DEFAULTS.frameInsetMm, min: 3, max: 25, step: 0.5 },
    cornerMarks: { value: DEFAULTS.cornerMarks },
    motifScale: { value: DEFAULTS.motifScale, min: 0.3, max: 1, step: 0.05 },
    accentTarget: { value: DEFAULTS.accentTarget, options: ["none", "frame", "meta"] },
    accentColor: { value: DEFAULTS.accentColor, render: (get) => get("Blueprint.accentTarget") !== "none" },
  },
  generate: (p, _seed, canvas) => {
    const out: Polyline[] = [];
    const accent = (t: "frame" | "meta") => (p.accentTarget === t ? p.accentColor : undefined);

    // Frame — always polylines[0] (blueprint-test relies on it).
    const fx0 = p.frameInsetMm;
    const fy0 = p.frameInsetMm;
    const fx1 = canvas.wMm - p.frameInsetMm;
    const fy1 = canvas.hMm - p.frameInsetMm;
    out.push({
      closed: true,
      stroke: accent("frame"),
      points: [[fx0, fy0], [fx1, fy0], [fx1, fy1], [fx0, fy1]],
    });

    // Corner marks: crop-mark style, outside the frame, aligned with its edges.
    if (p.cornerMarks) {
      const o = 2;
      const len = Math.max(1, Math.min(4, p.frameInsetMm - o - 0.5));
      const corners: [number, number, number, number][] = [
        [fx0, fy0, -1, -1],
        [fx1, fy0, 1, -1],
        [fx1, fy1, 1, 1],
        [fx0, fy1, -1, 1],
      ];
      for (const [x, y, sxn, syn] of corners) {
        out.push({ closed: false, points: [[x + sxn * o, y], [x + sxn * (o + len), y]] });
        out.push({ closed: false, points: [[x, y + syn * o], [x, y + syn * (o + len)]] });
      }
    }

    // Inner content area.
    const pad = Math.max(3, Math.min(canvas.wMm, canvas.hMm) * 0.03);
    const ix0 = fx0 + pad;
    const ix1 = fx1 - pad;
    const iy0 = fy0 + pad;
    const iy1 = fy1 - pad;
    const cx = (ix0 + ix1) / 2;
    const maxW = ix1 - ix0;
    const gap = p.metaHeightMm * 0.9;

    // Text blocks (null = collapsed slot). Header/title render uppercased —
    // Hershey has no case transform.
    const header = block(p.header.toUpperCase(), p.metaFont, p.metaHeightMm, maxW);
    const title = block(p.title.toUpperCase(), p.titleFont, p.titleHeightMm, maxW);
    const subtitle = block(p.subtitle, p.metaFont, p.metaHeightMm * 1.1, maxW);
    const meta = block(p.meta, p.metaFont, p.metaHeightMm, maxW, accent("meta"));
    const footer = block(p.footer, p.metaFont, p.metaHeightMm * 0.8, maxW);

    // Top-down: header.
    let top = iy0;
    if (header) {
      out.push(...translate(header.lines, cx, top));
      top += header.hMm + gap;
    }

    // Bottom-up: footer, meta, subtitle, title.
    let bottom = iy1;
    if (footer) {
      bottom -= footer.hMm;
      out.push(...translate(footer.lines, cx, bottom));
      bottom -= gap;
    }
    if (meta) {
      bottom -= meta.hMm;
      out.push(...translate(meta.lines, cx, bottom));
      bottom -= gap;
    }
    if (subtitle) {
      bottom -= subtitle.hMm;
      out.push(...translate(subtitle.lines, cx, bottom));
      bottom -= gap;
    }
    if (title) {
      bottom -= title.hMm;
      out.push(...translate(title.lines, cx, bottom));
      bottom -= p.titleHeightMm * 0.8; // breathing room between motif and title
    }

    // Motif slot: whatever vertical space remains.
    const slotH = Math.max(5, bottom - top);
    const mw = maxW * p.motifScale;
    const mh = slotH * p.motifScale;
    const mx = ix0 + (maxW - mw) / 2;
    const my = top + (slotH - mh) / 2;
    const motif = useApp.getState().motif;
    if (motif && motif.polylines.length > 0) {
      out.push(...translate(fitToCanvas(motif.polylines, mw, mh, 0), mx, my));
    } else {
      // Placeholder: slot box + diagonals, so the layout stays tunable.
      out.push({ closed: true, points: [[mx, my], [mx + mw, my], [mx + mw, my + mh], [mx, my + mh]] });
      out.push({ closed: false, points: [[mx, my], [mx + mw, my + mh]] });
      out.push({ closed: false, points: [[mx + mw, my], [mx, my + mh]] });
    }

    return { polylines: out, widthMm: canvas.wMm, heightMm: canvas.hMm };
  },
};
```

**Hinweis Glyph-Abdeckung:** Hershey-Fonts decken ASCII 32–127 ab. `·`, Umlaute, `–` fallen auf Space zurück (Verhalten von `layoutTextStrokes`). Für Meta-Zeilen `.` oder `-` als Separator verwenden.

- [x] **Step 5: Registry erweitern**

In `src/generators/registry.ts`:

Import ergänzen (nach Zeile 16):

```typescript
import { blueprint } from "./blueprint";
```

In `GENERATOR_GROUPS` (Zeile 20) eine neue Gruppe zwischen "Pen Plotter" und "Laser" einfügen:

```typescript
  { title: "Layout", items: [blueprint] },
```

- [x] **Step 6: Checks laufen lassen — müssen passen**

```bash
npx tsx scripts/blueprint-test.ts && npm run typecheck
```

Expected: `blueprint: all checks passed ✓` und typecheck exit 0.

- [x] **Step 7: Commit**

```bash
git add src/generators/blueprint.ts src/generators/registry.ts scripts/blueprint-test.ts scripts/fixtures/motif-gear.svg
git commit -m "feat: blueprint generator (Template A Classic Drawscape)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: MotifPanel + App-Wiring

**Files:**
- Create: `src/ui/MotifPanel.tsx`
- Modify: `src/App.tsx`

- [x] **Step 1: MotifPanel implementieren**

`src/ui/MotifPanel.tsx` anlegen:

```tsx
// src/ui/MotifPanel.tsx — SVG motif upload for the blueprint generator.
// Renders only while the blueprint generator is active. Parse errors keep the
// previous motif loaded (per spec).
import { useRef, useState, type CSSProperties } from "react";
import { useApp } from "../state/store";
import { parseSvgMotif } from "../util/svgImport";

const btnStyle: CSSProperties = {
  background: "#1d1d1b",
  border: "1px solid #2d2d2a",
  borderRadius: 4,
  color: "#eee",
  cursor: "pointer",
  fontSize: 11,
  padding: "4px 10px",
};

export function MotifPanel() {
  const generatorId = useApp((s) => s.generatorId);
  const motif = useApp((s) => s.motif);
  const setMotif = useApp((s) => s.setMotif);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (generatorId !== "blueprint") return null;

  const onFile = (f: File | undefined) => {
    if (!f) return;
    f.text().then((src) => {
      try {
        setMotif({ name: f.name, ...parseSvgMotif(src) });
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div style={{ padding: "10px 14px", borderBottom: "1px solid #2d2d2a", fontSize: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#bbb", marginBottom: 6 }}>
        MOTIF
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".svg,image/svg+xml"
        style={{ display: "none" }}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = ""; // re-selecting the same file fires onChange again
        }}
      />
      <button style={btnStyle} onClick={() => fileRef.current?.click()}>
        Load SVG…
      </button>
      {motif && (
        <div style={{ marginTop: 6, color: "#9ab89a", display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {motif.name} ({motif.polylines.length} paths)
          </span>
          <button style={{ ...btnStyle, padding: "0 6px" }} onClick={() => setMotif(null)} title="Clear motif">
            ✕
          </button>
        </div>
      )}
      {error && <div style={{ marginTop: 6, color: "#e0584f" }}>{error}</div>}
    </div>
  );
}
```

- [x] **Step 2: App.tsx verdrahten**

In `src/App.tsx`:

Import ergänzen (nach Zeile 14):

```typescript
import { MotifPanel } from "./ui/MotifPanel";
```

In `Stage` (nach Zeile 32 `const layerParams = ...`) Motif-Subscription ergänzen und die `baseArt`-Deps erweitern — der Blueprint-Generator liest das Motiv aus dem Store, ohne Dep regeneriert die Preview beim Upload nicht:

```typescript
  const motif = useApp((s) => s.motif);
  const baseParams = useGeneratorParams(gen);

  const baseArt = useMemo(
    () => gen.generate(baseParams, seed, { wMm: w, hMm: h }),
    // motif: blueprint reads it from the store — re-generate on upload/clear
    [gen, baseParams, seed, w, h, motif],
  );
```

(Die bestehende `const baseParams`-Zeile und das bestehende `useMemo` werden ersetzt; `motif` kommt als zusätzliche Dep dazu.)

Im linken Aside (Zeile 125–126) `MotifPanel` zwischen `GeneratorPicker` und `LayerStack` mounten:

```tsx
        <GeneratorPicker />
        <MotifPanel />
        <LayerStack />
```

- [ ] **Step 3: Manueller Browser-Check**

```bash
npm run typecheck && npm run dev
```

Im Browser (localhost:5173):
1. Generator "Blueprint" (Gruppe "Layout") wählen → Motiv-Panel erscheint, Preview zeigt Rahmen + Titel + Platzhalter-Kreuz.
2. `scripts/fixtures/motif-gear.svg` über "Load SVG…" laden → Motiv ersetzt Platzhalter, Preview aktualisiert sofort.
3. Kaputte Datei laden (z. B. eine `.txt` als `.svg`) → rote Fehlermeldung, Gear-Motiv bleibt.
4. ✕ klicken → Platzhalter wieder da.
5. Anderen Generator wählen → Panel verschwindet.

Expected: alle 5 Punkte wie beschrieben.

- [x] **Step 4: Commit**

```bash
git add src/ui/MotifPanel.tsx src/App.tsx
git commit -m "feat: motif upload panel + blueprint store wiring

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: render-demo-Erweiterung + End-to-End-Verifikation

**Files:**
- Modify: `scripts/render-demo.ts`

- [x] **Step 1: motif= und canvas= Overrides einbauen**

In `scripts/render-demo.ts`:

Imports (Zeile 5–7) erweitern:

```typescript
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { byId } from "../src/generators/registry";
import { svgExport } from "../src/render/svgExport";
import { parseSvgMotif } from "../src/util/svgImport";
import { useApp } from "../src/state/store";
```

In der Override-Schleife (Zeile 18) vor der Typ-Koerzierung zwei Spezial-Keys ergänzen (nach dem bestehenden `pen`-Block):

```typescript
  if (k === "motif") {
    const src = readFileSync(v, "utf8");
    useApp.getState().setMotif({ name: basename(v), ...parseSvgMotif(src) });
    continue;
  }
  if (k === "canvas") {
    const [cw, ch] = v.split("x").map(Number);
    canvasW = cw;
    canvasH = ch;
    continue;
  }
```

Dafür oberhalb der Schleife (nach Zeile 17 `let penWidthMm ...`):

```typescript
let canvasW = 160;
let canvasH = 230;
```

Und Zeile 31 ersetzen durch:

```typescript
const art = gen.generate(params, seed, { wMm: canvasW, hMm: canvasH });
```

- [x] **Step 2: End-to-End-Render (A5, volle Caliber-Befüllung)**

```bash
npx tsx scripts/render-demo.ts blueprint 1 /tmp/blueprint-a5.svg canvas=148x210 \
  motif=scripts/fixtures/motif-gear.svg \
  header=TIMEPIECE 'title=OMEGA CALIBER 321' \
  'subtitle=Manual-Wind Chronograph 1946-1968' \
  'meta=27mm . 17 Jewels . 18000 vph . Lemania CH 27 C12 base' \
  'footer=PLOTTED 2026 . BERGEDORF' \
  cornerMarks=true pen=0.3
rsvg-convert -w 740 /tmp/blueprint-a5.svg -o /tmp/blueprint-a5.png
```

Expected: SVG mit >0 polylines; PNG zeigt: Rahmen + Druckmarken, TIMEPIECE oben, Gear-Motiv mittig, OMEGA CALIBER 321 (Serif, groß), Untertitel, Meta-Zeile, Footer unten — alles zentriert, nichts überlappt, nichts außerhalb des Rahmens.

- [x] **Step 3: Determinismus + Formate**

```bash
npx tsx scripts/render-demo.ts blueprint 1 /tmp/bp-d1.svg canvas=148x210 motif=scripts/fixtures/motif-gear.svg
npx tsx scripts/render-demo.ts blueprint 1 /tmp/bp-d2.svg canvas=148x210 motif=scripts/fixtures/motif-gear.svg
diff /tmp/bp-d1.svg /tmp/bp-d2.svg && echo "DETERMINISTIC ✓"
npx tsx scripts/render-demo.ts blueprint 1 /tmp/bp-80.svg  canvas=80x80  motif=scripts/fixtures/motif-gear.svg
npx tsx scripts/render-demo.ts blueprint 1 /tmp/bp-a4.svg  canvas=210x297 motif=scripts/fixtures/motif-gear.svg
rsvg-convert -w 400 /tmp/bp-80.svg -o /tmp/bp-80.png
rsvg-convert -w 740 /tmp/bp-a4.svg -o /tmp/bp-a4.png
```

Expected: `DETERMINISTIC ✓`; 80×80- und A4-Renders proportional sauber (Titel skaliert ggf. auf Rahmenbreite runter).

- [x] **Step 4: Bestands-Regression**

```bash
npx tsx scripts/svgimport-test.ts && npx tsx scripts/blueprint-test.ts && npm run typecheck
npx tsx scripts/render-demo.ts pipes 7 /tmp/pipes-regression.svg
```

Expected: alle Checks ✓, pipes rendert unverändert (bestehende Generators unangetastet).

- [x] **Step 5: Commit**

```bash
git add scripts/render-demo.ts
git commit -m "feat: render-demo motif= and canvas= overrides for blueprint

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 6: PNG-Renders für Nikos Ästhetik-Verdict bereitstellen**

`/tmp/blueprint-a5.png`, `/tmp/bp-80.png`, `/tmp/bp-a4.png` an Niko zeigen. Danach (separat, mit Niko): echtes `Caliber_occult.svg` laden, Plot-Test, ggf. Parameter-Tuning. Firebase-Deploy (`--account nikolaibibo@gmail.com`) erst nach Verdict.

---

## Nicht in diesem Plan (Spec-konform)

- Templates B + C (Folge-Tickets — Slot-Architektur liegt bereit)
- localStorage-Persistenz des Motivs
- Beliebige SVGs (Beziers/Transforms ≠ translate)
- Bemaßungslinien / Meta-Tabellen (Template B)
