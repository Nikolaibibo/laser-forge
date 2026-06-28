# Laser Forge UI Redesign ("Signal Chain") Implementation Plan

> **STATUS: DONE — merged as commit 97339e6 on 2026-06-28.**
> The checkboxes below were not kept in sync during implementation and remain unchecked, but all work is complete and in main. This plan is archived for reference only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the organically-grown Laser Forge UI with a cohesive CAD/technical "Signal Chain" interface (generator + distortions = one selectable node chain), custom schema-driven controls, and a searchable preview-driven generator gallery — removing the Leva dependency.

**Architecture:** Keep all generator/distortion math, render pipeline, export, and bridge code untouched. Replace the entire `src/ui/*` presentation layer and `src/index.css` token system. Move generator parameter state out of Leva into the Zustand store (`genParams` keyed by generatorId, mirroring the existing `layerParams`). A new `SchemaControls` renderer reads the existing `schema` objects (re-typed off Leva) and renders native CAD controls.

**Tech Stack:** React 18 + TypeScript (strict) + Vite, Zustand 4, vanilla CSS custom properties. No Leva. Tests: standalone `tsx` scripts under `scripts/` using `node:assert` (matches existing `scripts/smoke.mjs`, `scripts/test-dedupe.mjs`).

## Global Constraints

- Desktop only. No responsive/mobile work.
- TypeScript strict mode is on (`tsconfig.json`) — no `any` leaks; `npm run typecheck` must stay green.
- Units are millimeters; pen width floor is `0.05mm` (`setPenWidthMm` clamps).
- Determinism: generator output depends only on `(params, seed, canvas)`; each layer gets `seed + hashUid(layer.uid)`. Do not change this contract.
- Single global accent = laser-orange `#f97316`. z-index scale: `10` raised / `20` drawer / `30` gallery / `50` toasts. 8px spacing grid, 4px radius, 1px hairline borders.
- Logic changes get a `tsx` test; presentational changes verify via `npm run typecheck` + `npm run dev` visual check. Never claim a visual task "done" without the dev server rendering it.
- No new runtime dependencies. Remove `leva` by end of plan.
- Firebase deploy stays a manual step performed by the user — never deploy.

---

## File Structure

**New files:**
- `src/ui/controls/schema.ts` — schema helpers: `schemaDefaults()`, `resolveVisibility()`, `localKey()`.
- `src/ui/controls/SchemaControls.tsx` — schema → control renderer (Leva replacement).
- `src/ui/controls/NumberField.tsx` — drag-scrub + slider numeric control.
- `src/ui/controls/Toggle.tsx`, `Segmented.tsx`, `SelectField.tsx`, `TextField.tsx`, `ColorField.tsx` — leaf controls.
- `src/ui/TopBar.tsx` — wordmark, canvas W×H, pen, seed+reroll, share.
- `src/ui/PipelineRail.tsx` — chain: `SourceNode` + `LayerNode` list + `+ Layer` menu.
- `src/ui/Inspector.tsx` — renders SchemaControls for the selected node.
- `src/ui/GeneratorGallery.tsx` — searchable grid with live previews.
- `src/ui/previewThumb.ts` — render a generator's defaults to a small data-URL, cached.
- `src/ui/Console.tsx` — stats + dedupe/join + export buttons + Plot trigger.
- `src/ui/MachineDrawer.tsx` — slide-up wrapper hosting `PlotterPanel`/`AxiDrawPanel`.
- `src/ui/hooks/useDragReorder.ts` — pointer-based list reorder hook.
- `src/theme/tokens.ts` — TS mirror of CSS token names (typed access for inline-when-necessary).

**Modified files:**
- `src/generators/types.ts` — replace Leva `Schema` import with local `ControlSchema`/`ControlDef`.
- `src/state/store.ts` — add `genParams`, `setGenParams`, `selectedNodeId`, `setSelectedNode`; selection side-effects.
- `src/state/urlSync.ts` — serialize `genParams` (fixes shared-link param loss).
- `src/App.tsx` — new grid shell wiring TopBar/PipelineRail/Canvas/Inspector/Console/MachineDrawer; remove Leva host.
- `src/index.css` — replace token block + remove all `.leva-*` overrides + glass/ExportBar styles; add control + grid styles.
- `package.json` — remove `leva`.

**Deleted files (Task 14):**
- `src/ui/ParamPanel.tsx`, `src/ui/LayerControls.tsx`, `src/ui/GeneratorPicker.tsx`, `src/ui/LayerStack.tsx`, `src/ui/ExportBar.tsx`, `src/ui/MotifPanel.tsx` (motif folds into Inspector).

**Untouched:** everything in `src/generators/*` (except `types.ts`), `src/distortions/*`, `src/render/*`, `src/plotter/*`, `bridge/*`, `src/ui/PlotterPanel.tsx`, `src/ui/AxiDrawPanel.tsx` (logic reused as-is; only their host changes).

---

## Phase 0 — Foundations (no visible UI change yet)

### Task 1: Local schema types + helpers (de-Leva the type layer)

**Files:**
- Modify: `src/generators/types.ts:1`
- Create: `src/ui/controls/schema.ts`
- Test: `scripts/test-schema.mjs`

**Interfaces:**
- Produces:
  - `ControlSchema = Record<string, ControlDef>`
  - `ControlDef = { value: unknown; min?: number; max?: number; step?: number; options?: ReadonlyArray<string|number>; rows?: number; render?: (get: (key: string) => unknown) => boolean; label?: string; hint?: string }`
  - `schemaDefaults(schema: ControlSchema): Record<string, unknown>` — `{ field: def.value }` for every entry.
  - `localKey(key: string): string` — returns substring after the last `.` (so `"Text Ribbons.colorCount"` → `"colorCount"`).
  - `resolveVisibility(schema: ControlSchema, values: Record<string, unknown>): string[]` — list of field names whose `render` (if present) returns true given a getter that resolves `localKey(key)` against `values`.

- [ ] **Step 1: Write the failing test** — `scripts/test-schema.mjs`

```js
import assert from "node:assert";
import { schemaDefaults, localKey, resolveVisibility } from "../src/ui/controls/schema.ts";

// schemaDefaults pulls .value from every entry
const schema = {
  count: { value: 5, min: 1, max: 10, step: 1 },
  label: { value: "hi" },
  colorCount: { value: 1, min: 1, max: 6, step: 1 },
  color2: { value: "#fff", render: (get) => get("Gen.colorCount") >= 2 },
};
assert.deepStrictEqual(schemaDefaults(schema), { count: 5, label: "hi", colorCount: 1, color2: "#fff" });

// localKey strips folder prefix
assert.strictEqual(localKey("Text Ribbons.colorCount"), "colorCount");
assert.strictEqual(localKey("colorCount"), "colorCount");

// resolveVisibility honors render() against current values
assert.deepStrictEqual(
  resolveVisibility(schema, { count: 5, label: "hi", colorCount: 1, color2: "#fff" }).sort(),
  ["colorCount", "count", "label"],
);
assert.deepStrictEqual(
  resolveVisibility(schema, { count: 5, label: "hi", colorCount: 3, color2: "#fff" }).sort(),
  ["color2", "colorCount", "count", "label"],
);
console.log("ok");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-schema.mjs`
Expected: FAIL — `Cannot find module .../src/ui/controls/schema.ts`.

- [ ] **Step 3: Create `src/ui/controls/schema.ts`**

```ts
import type { ControlSchema } from "../../generators/types";

export function schemaDefaults(schema: ControlSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(schema)) out[key] = schema[key].value;
  return out;
}

export function localKey(key: string): string {
  const i = key.lastIndexOf(".");
  return i === -1 ? key : key.slice(i + 1);
}

export function resolveVisibility(
  schema: ControlSchema,
  values: Record<string, unknown>,
): string[] {
  const get = (key: string) => values[localKey(key)];
  return Object.keys(schema).filter((field) => {
    const def = schema[field];
    return def.render ? !!def.render(get) : true;
  });
}
```

- [ ] **Step 4: Replace the Leva type import in `src/generators/types.ts`**

Replace line 1 (`import type { Schema } from "leva/dist/declarations/src/types";`) with:

```ts
export type ControlDef = {
  value: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: ReadonlyArray<string | number>;
  rows?: number;
  /** Conditional visibility. `get(key)` resolves the field after the last dot. */
  render?: (get: (key: string) => unknown) => boolean;
  label?: string;
  hint?: string;
};

export type ControlSchema = Record<string, ControlDef>;
```

Then change both `schema: Schema;` occurrences (lines 24 and 37) to `schema: ControlSchema;`.

- [ ] **Step 5: Run test + typecheck**

Run: `npx tsx scripts/test-schema.mjs && npm run typecheck`
Expected: prints `ok`; typecheck passes EXCEPT the still-Leva-wired `ParamPanel.tsx`/`LayerControls.tsx` may error (they cast `schema as never` — confirm errors are only there). If other generator files error on the new `ControlDef` type, note them — every existing schema entry only uses `value/min/max/step/options/rows/render`, so they should satisfy `ControlDef`.

- [ ] **Step 6: Commit**

```bash
git add src/generators/types.ts src/ui/controls/schema.ts scripts/test-schema.mjs
git commit -m "feat: local ControlSchema type + schema helpers (de-Leva types)"
```

---

### Task 2: Store — genParams + selection model

**Files:**
- Modify: `src/state/store.ts`
- Test: `scripts/test-store.mjs`

**Interfaces:**
- Consumes: `schemaDefaults` (Task 1) is NOT imported here (store stays schema-agnostic); defaults are written by the Inspector. Store stores raw `Record<string,unknown>`.
- Produces (added to `AppState`):
  - `genParams: Record<string, Record<string, unknown>>`
  - `setGenParams: (genId: string, params: Record<string, unknown>) => void`
  - `selectedNodeId: string` — `"source"` or a layer `uid`.
  - `setSelectedNode: (id: string) => void`
  - Behavior: `setGenerator(id)` also sets `selectedNodeId="source"`. `addLayer(distortionId)` also selects the new layer's uid. `removeLayer(uid)` resets selection to `"source"` if the removed layer was selected.

- [ ] **Step 1: Write the failing test** — `scripts/test-store.mjs`

```js
import assert from "node:assert";
import { useApp } from "../src/state/store.ts";

const s = () => useApp.getState();

// default selection is the source
assert.strictEqual(s().selectedNodeId, "source");

// switching generator selects source + leaves genParams settable
s().setGenParams("flow-field", { lineCount: 40 });
assert.deepStrictEqual(s().genParams["flow-field"], { lineCount: 40 });
s().setSelectedNode("xyz");
s().setGenerator("rose");
assert.strictEqual(s().selectedNodeId, "source");
assert.strictEqual(s().generatorId, "rose");

// adding a layer selects it
s().clearLayers();
s().addLayer("chaikin");
const uid = s().layers[0].uid;
assert.strictEqual(s().selectedNodeId, uid);

// removing the selected layer falls back to source
s().removeLayer(uid);
assert.strictEqual(s().selectedNodeId, "source");
console.log("ok");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-store.mjs`
Expected: FAIL — `selectedNodeId` undefined / `setGenParams` not a function.

- [ ] **Step 3: Implement store changes** in `src/state/store.ts`

Add to the `AppState` type (after `layerParams` block, before `setGenerator`):

```ts
  /** Parameter values per generator id (mirror of layerParams for the source node). */
  genParams: Record<string, Record<string, unknown>>;
  setGenParams: (genId: string, params: Record<string, unknown>) => void;
  /** Which chain node the Inspector edits: "source" or a layer uid. */
  selectedNodeId: string;
  setSelectedNode: (id: string) => void;
```

In the `create` body: add initial values `genParams: {}, selectedNodeId: "source",` and the actions:

```ts
  setGenParams: (genId, params) =>
    set((s) => ({ genParams: { ...s.genParams, [genId]: params } })),
  setSelectedNode: (id) => set({ selectedNodeId: id }),
```

Change `setGenerator` to:

```ts
  setGenerator: (id) => set({ generatorId: id, selectedNodeId: "source" }),
```

Change `addLayer` to select the new layer:

```ts
  addLayer: (distortionId) =>
    set((s) => {
      const uid = nextUid();
      return {
        layers: [...s.layers, { uid, distortionId, enabled: true }],
        selectedNodeId: uid,
      };
    }),
```

Change `removeLayer` to reset selection when needed (extend the existing body's return):

```ts
  removeLayer: (uid) =>
    set((s) => {
      const next = s.layers.filter((l) => l.uid !== uid);
      const params = { ...s.layerParams };
      delete params[uid];
      const selectedNodeId = s.selectedNodeId === uid ? "source" : s.selectedNodeId;
      return { layers: next, layerParams: params, selectedNodeId };
    }),
```

Add `genParams` to the `hydrate` allow-through implicitly (it already does `set(s)`), and update `clearLayers` to also reset selection:

```ts
  clearLayers: () => set({ layers: [], layerParams: {}, selectedNodeId: "source" }),
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx tsx scripts/test-store.mjs && npm run typecheck`
Expected: prints `ok`. (Typecheck failures only in not-yet-touched Leva files are acceptable until Task 14.)

- [ ] **Step 5: Commit**

```bash
git add src/state/store.ts scripts/test-store.mjs
git commit -m "feat: store genParams + selectedNode chain selection model"
```

---

### Task 3: CAD design tokens

**Files:**
- Modify: `src/index.css:20-49` (token block), `:122-130` (grid), remove `:95-120` glass/anim + `:132-228` Leva overrides.
- Create: `src/theme/tokens.ts`

**Interfaces:**
- Produces: CSS custom properties (names below) + `tokens` object in `src/theme/tokens.ts` mirroring the same hex values for typed inline use.

- [ ] **Step 1: Replace the `:root` token block** in `src/index.css` (lines 20-49) with:

```css
:root {
  --font-sans: 'Outfit', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Chrome (cool charcoal) */
  --bg-chrome: #11151b;
  --bg-panel: #161b22;
  --bg-raised: #1c222b;
  --bg-hover: #232a34;
  --bg-canvas: #f7f8fa;          /* the plotter "bed" stays bright */

  --line: #2a313b;               /* 1px hairlines */
  --line-strong: #39424f;

  --text-primary: #e6e9ee;
  --text-secondary: #aab2bf;
  --text-muted: #8b95a3;

  --accent: #f97316;             /* laser-orange */
  --accent-hover: #fb8a3c;
  --accent-glow: rgba(249, 115, 22, 0.16);
  --ok: #3fb950;
  --err: #f85149;

  --space: 8px;
  --radius: 4px;

  --z-raised: 10;
  --z-drawer: 20;
  --z-gallery: 30;
  --z-toast: 50;
}
```

- [ ] **Step 2: Update base + grid styles**

Change `html, body, #root` background (line 56) to `var(--bg-chrome)`. Replace the `.plotter-bed-grid` block (lines 123-130) with a bright-bed version:

```css
.plotter-bed-grid {
  background-color: var(--bg-canvas);
  background-image:
    radial-gradient(rgba(0, 0, 0, 0.05) 1px, transparent 0),
    radial-gradient(rgba(0, 0, 0, 0.05) 1px, transparent 0);
  background-size: 20px 20px;
  background-position: 0 0, 10px 10px;
}
```

Delete the glass-panel block (lines 96-102), the fadeIn/animate-fade-in/transition-all-fast still may be referenced — keep `.transition-all-fast` and `fadeIn`; delete `.glass-panel`. Delete ALL `.leva-*` and `#leva__root` rules (lines 132-228).

- [ ] **Step 3: Create `src/theme/tokens.ts`**

```ts
/** TS mirror of CSS custom properties for cases needing typed inline values
 *  (e.g. canvas 2D drawing). Prefer the CSS var() in JSX styles. */
export const tokens = {
  bgChrome: "#11151b",
  bgPanel: "#161b22",
  bgRaised: "#1c222b",
  bgHover: "#232a34",
  bgCanvas: "#f7f8fa",
  line: "#2a313b",
  lineStrong: "#39424f",
  textPrimary: "#e6e9ee",
  textSecondary: "#aab2bf",
  textMuted: "#8b95a3",
  accent: "#f97316",
  accentHover: "#fb8a3c",
  ok: "#3fb950",
  err: "#f85149",
} as const;
```

- [ ] **Step 4: Verify build does not break on CSS**

Run: `npm run typecheck`
Expected: no NEW errors from `tokens.ts`. (App still renders old UI here; colors will look wrong until App is rebuilt — that's fine, this task only ships tokens.)

- [ ] **Step 5: Commit**

```bash
git add src/index.css src/theme/tokens.ts
git commit -m "feat: CAD design tokens (charcoal chrome, bright bed, laser-orange)"
```

---

## Phase 1 — Custom controls (Leva replacement core)

### Task 4: Leaf controls — NumberField, Toggle, Segmented, SelectField, TextField, ColorField

**Files:**
- Create: `src/ui/controls/NumberField.tsx`, `Toggle.tsx`, `Segmented.tsx`, `SelectField.tsx`, `TextField.tsx`, `ColorField.tsx`
- Test: `scripts/test-numberfield.mjs` (pure clamp/scrub math only)

**Interfaces:**
- Produces (each is a controlled component; props shown):
  - `NumberField({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; unit?: string; onChange: (v: number) => void })` — if `min`+`max` defined → slider + mono value box; else drag-scrub box. Horizontal drag changes value by `step` per `scrubPxPerStep` px; typing commits on blur/Enter.
  - `Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void })`
  - `Segmented({ label, value, options, onChange }: { label: string; value: string | number; options: ReadonlyArray<string|number>; onChange: (v: string|number) => void })` — used when `options.length <= 4`.
  - `SelectField(...)` — same props as Segmented; native `<select>` for `> 4` options.
  - `TextField({ label, value, rows, onChange }: { label: string; value: string; rows?: number; onChange: (v: string) => void })` — `<input>` if no `rows`, `<textarea>` if `rows`.
  - `ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void })` — swatch button + `<input type="color">`.
  - Helper exported from `NumberField.tsx`: `clampStep(value: number, min: number | undefined, max: number | undefined, step: number | undefined): number` — clamps to range and snaps to step.

- [ ] **Step 1: Write the failing test** — `scripts/test-numberfield.mjs`

```js
import assert from "node:assert";
import { clampStep } from "../src/ui/controls/NumberField.tsx";

assert.strictEqual(clampStep(7, 1, 10, 1), 7);
assert.strictEqual(clampStep(11, 1, 10, 1), 10);   // clamp max
assert.strictEqual(clampStep(-3, 0, 10, 1), 0);    // clamp min
assert.strictEqual(clampStep(0.024, 0, 1, 0.01), 0.02); // snap to step
assert.strictEqual(clampStep(5.6, undefined, undefined, undefined), 5.6); // free
console.log("ok");
```

- [ ] **Step 2: Run to verify fail**

Run: `npx tsx scripts/test-numberfield.mjs`
Expected: FAIL — module/export missing.

- [ ] **Step 3: Implement `NumberField.tsx`** (with `clampStep` + the component). Slider variant when `min`&`max` set; otherwise drag-scrub.

```tsx
import { useRef, useState, useEffect } from "react";

export function clampStep(
  value: number,
  min: number | undefined,
  max: number | undefined,
  step: number | undefined,
): number {
  let v = value;
  if (typeof step === "number" && step > 0) v = Math.round(v / step) * step;
  if (typeof min === "number") v = Math.max(min, v);
  if (typeof max === "number") v = Math.min(max, v);
  // kill float dust from step snapping
  return typeof step === "number" && step > 0 ? Number(v.toFixed(6)) : v;
}

type Props = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
};

const SCRUB_PX_PER_STEP = 4;

export function NumberField({ label, value, min, max, step, unit, onChange }: Props) {
  const hasRange = typeof min === "number" && typeof max === "number";
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const drag = useRef<{ startX: number; startVal: number } | null>(null);

  const commit = (raw: string) => {
    const n = Number(raw);
    if (!Number.isNaN(n)) onChange(clampStep(n, min, max, step));
    else setText(String(value));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (hasRange) return; // slider handles its own drag
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startVal: value };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const s = step ?? 1;
    onChange(clampStep(drag.current.startVal + Math.round(dx / SCRUB_PX_PER_STEP) * s, min, max, step));
  };
  const onPointerUp = () => (drag.current = null);

  return (
    <label className="lf-control">
      <span className="lf-control__label">{label}</span>
      <div className="lf-numfield">
        {hasRange && (
          <input
            type="range"
            className="lf-slider"
            min={min}
            max={max}
            step={step ?? 1}
            value={value}
            onChange={(e) => onChange(clampStep(Number(e.target.value), min, max, step))}
          />
        )}
        <span
          className={hasRange ? "lf-numbox" : "lf-numbox lf-numbox--scrub"}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          title={hasRange ? undefined : "Drag to scrub · click to type"}
        >
          <input
            className="lf-numinput"
            value={text}
            inputMode="decimal"
            onChange={(e) => setText(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
          />
          {unit && <span className="lf-unit">{unit}</span>}
        </span>
      </div>
    </label>
  );
}
```

- [ ] **Step 4: Implement the other 5 leaf controls** (`Toggle.tsx`, `Segmented.tsx`, `SelectField.tsx`, `TextField.tsx`, `ColorField.tsx`) with the exact prop signatures from the Interfaces block. Each renders a `<label className="lf-control">` with a `<span className="lf-control__label">{label}</span>` and its input, using CSS classes (styled in Step 6). Keep each file under ~40 lines.

Example `Toggle.tsx`:

```tsx
type Props = { label: string; value: boolean; onChange: (v: boolean) => void };
export function Toggle({ label, value, onChange }: Props) {
  return (
    <label className="lf-control lf-control--row">
      <span className="lf-control__label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        className={value ? "lf-toggle lf-toggle--on" : "lf-toggle"}
        onClick={() => onChange(!value)}
      >
        <span className="lf-toggle__knob" />
      </button>
    </label>
  );
}
```

`Segmented.tsx`:

```tsx
type V = string | number;
type Props = { label: string; value: V; options: ReadonlyArray<V>; onChange: (v: V) => void };
export function Segmented({ label, value, options, onChange }: Props) {
  return (
    <label className="lf-control lf-control--col">
      <span className="lf-control__label">{label}</span>
      <div className="lf-segmented" role="radiogroup">
        {options.map((o) => (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={o === value}
            className={o === value ? "lf-seg lf-seg--on" : "lf-seg"}
            onClick={() => onChange(o)}
          >
            {String(o)}
          </button>
        ))}
      </div>
    </label>
  );
}
```

`SelectField.tsx`:

```tsx
type V = string | number;
type Props = { label: string; value: V; options: ReadonlyArray<V>; onChange: (v: V) => void };
export function SelectField({ label, value, options, onChange }: Props) {
  return (
    <label className="lf-control lf-control--row">
      <span className="lf-control__label">{label}</span>
      <select
        className="lf-select"
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const match = options.find((o) => String(o) === raw);
          onChange(match ?? raw);
        }}
      >
        {options.map((o) => (
          <option key={String(o)} value={String(o)}>{String(o)}</option>
        ))}
      </select>
    </label>
  );
}
```

`TextField.tsx`:

```tsx
type Props = { label: string; value: string; rows?: number; onChange: (v: string) => void };
export function TextField({ label, value, rows, onChange }: Props) {
  return (
    <label className="lf-control lf-control--col">
      <span className="lf-control__label">{label}</span>
      {rows ? (
        <textarea className="lf-textarea" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="lf-textinput" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}
```

`ColorField.tsx`:

```tsx
type Props = { label: string; value: string; onChange: (v: string) => void };
export function ColorField({ label, value, onChange }: Props) {
  return (
    <label className="lf-control lf-control--row">
      <span className="lf-control__label">{label}</span>
      <span className="lf-color">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <code className="lf-color__hex">{value}</code>
      </span>
    </label>
  );
}
```

- [ ] **Step 5: Run number test + typecheck**

Run: `npx tsx scripts/test-numberfield.mjs && npm run typecheck`
Expected: prints `ok`; no new type errors in `src/ui/controls/*`.

- [ ] **Step 6: Add control styles to `src/index.css`** (append a `/* === Controls === */` section): `.lf-control`, `.lf-control--row` (label left, input right, space-between), `.lf-control--col` (stacked), `.lf-control__label` (mono-adjacent sans, 11px, `--text-secondary`, uppercase letter-spacing), `.lf-slider` (4px track, `--accent` thumb), `.lf-numbox`/`.lf-numinput` (mono, `--bg-raised`, hairline border, `--accent` focus ring), `.lf-numbox--scrub` (`cursor: ew-resize`), `.lf-unit` (`--text-muted`), `.lf-toggle`/`--on`/`__knob` (28×16 pill, slides, `--accent` when on), `.lf-segmented`/`.lf-seg`/`--on`, `.lf-select`, `.lf-textinput`/`.lf-textarea`, `.lf-color`/`__hex`. All use tokens; numeric values render in `--font-mono`.

- [ ] **Step 7: Commit**

```bash
git add src/ui/controls scripts/test-numberfield.mjs src/index.css
git commit -m "feat: custom CAD leaf controls (number/toggle/segmented/select/text/color)"
```

---

### Task 5: SchemaControls renderer

**Files:**
- Create: `src/ui/controls/SchemaControls.tsx`
- Test: `scripts/test-pickcontrol.mjs`

**Interfaces:**
- Consumes: leaf controls (Task 4); `resolveVisibility`, `localKey` (Task 1).
- Produces:
  - `pickControl(def: ControlDef): "number" | "toggle" | "segmented" | "select" | "color" | "text"` — decision logic: `options` present → `segmented` if `≤4` else `select`; `typeof value === "boolean"` → `toggle`; `typeof value === "number"` → `number`; string starting with `#` and length 4 or 7 → `color`; else `text`.
  - `SchemaControls({ schema, values, onChange }: { schema: ControlSchema; values: Record<string, unknown>; onChange: (field: string, value: unknown) => void })` — renders one control per visible field (per `resolveVisibility`), choosing the control via `pickControl`, wiring `min/max/step/options/rows`, and deriving a human label from the field name (camelCase → "Title Case", unless `def.label`).

- [ ] **Step 1: Write the failing test** — `scripts/test-pickcontrol.mjs`

```js
import assert from "node:assert";
import { pickControl } from "../src/ui/controls/SchemaControls.tsx";

assert.strictEqual(pickControl({ value: 5, min: 0, max: 10, step: 1 }), "number");
assert.strictEqual(pickControl({ value: 5 }), "number");
assert.strictEqual(pickControl({ value: true }), "toggle");
assert.strictEqual(pickControl({ value: "a", options: ["a", "b", "c"] }), "segmented");
assert.strictEqual(pickControl({ value: 0, options: [0, 90, 180, 270] }), "segmented");
assert.strictEqual(pickControl({ value: "a", options: ["a","b","c","d","e"] }), "select");
assert.strictEqual(pickControl({ value: "#ff0000" }), "color");
assert.strictEqual(pickControl({ value: "hello" }), "text");
assert.strictEqual(pickControl({ value: "x", rows: 8 }), "text");
console.log("ok");
```

- [ ] **Step 2: Run to verify fail**

Run: `npx tsx scripts/test-pickcontrol.mjs`
Expected: FAIL — export missing.

- [ ] **Step 3: Implement `SchemaControls.tsx`**

```tsx
import type { ControlDef, ControlSchema } from "../../generators/types";
import { resolveVisibility } from "./schema";
import { NumberField } from "./NumberField";
import { Toggle } from "./Toggle";
import { Segmented } from "./Segmented";
import { SelectField } from "./SelectField";
import { TextField } from "./TextField";
import { ColorField } from "./ColorField";

export type ControlKind = "number" | "toggle" | "segmented" | "select" | "color" | "text";

export function pickControl(def: ControlDef): ControlKind {
  if (def.options) return def.options.length <= 4 ? "segmented" : "select";
  const v = def.value;
  if (typeof v === "boolean") return "toggle";
  if (typeof v === "number") return "number";
  if (typeof v === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return "color";
  return "text";
}

function titleCase(field: string): string {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\bMm\b/g, "mm")
    .replace(/\bDeg\b/g, "°")
    .trim();
}

type Props = {
  schema: ControlSchema;
  values: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
};

export function SchemaControls({ schema, values, onChange }: Props) {
  const visible = resolveVisibility(schema, values);
  return (
    <div className="lf-controls">
      {visible.map((field) => {
        const def = schema[field];
        const label = def.label ?? titleCase(field);
        const kind = pickControl(def);
        const v = values[field] ?? def.value;
        switch (kind) {
          case "number":
            return (
              <NumberField key={field} label={label} value={Number(v)}
                min={def.min} max={def.max} step={def.step}
                onChange={(n) => onChange(field, n)} />
            );
          case "toggle":
            return <Toggle key={field} label={label} value={!!v} onChange={(b) => onChange(field, b)} />;
          case "segmented":
            return (
              <Segmented key={field} label={label} value={v as string | number}
                options={def.options!} onChange={(o) => onChange(field, o)} />
            );
          case "select":
            return (
              <SelectField key={field} label={label} value={v as string | number}
                options={def.options!} onChange={(o) => onChange(field, o)} />
            );
          case "color":
            return <ColorField key={field} label={label} value={String(v)} onChange={(c) => onChange(field, c)} />;
          default:
            return <TextField key={field} label={label} value={String(v)} rows={def.rows} onChange={(t) => onChange(field, t)} />;
        }
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx tsx scripts/test-pickcontrol.mjs && npm run typecheck`
Expected: prints `ok`; no new errors in controls.

- [ ] **Step 5: Commit**

```bash
git add src/ui/controls/SchemaControls.tsx scripts/test-pickcontrol.mjs
git commit -m "feat: SchemaControls renderer (schema -> CAD controls, conditional visibility)"
```

---

## Phase 2 — Layout shell + panels

> From here, tasks are presentational. Each verifies with `npm run typecheck` + a `npm run dev` visual check (the implementer loads http://localhost:5173 and confirms the described behavior). No `tsx` unit tests unless a task adds logic (Tasks 8, 9, 10 do).

### Task 6: App grid shell + TopBar + de-Leva'd Stage

**Files:**
- Create: `src/ui/TopBar.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: store (`canvasWMm`, `canvasHMm`, `setCanvas`, `penWidthMm`, `setPenWidthMm`, `seed`, `setSeed`, `randomSeed`), `byId`, `distortionById`, `schemaDefaults`, `CanvasPreview`.
- Produces: `TopBar()` (no props) renders the 44px bar. `App` renders the new CSS grid: rows `44px 1fr 44px`, columns `240px 1fr 300px`; TopBar spans row 1 all columns; PipelineRail col 1 / row 2; canvas `<main>` col 2 / row 2; Inspector col 3 / row 2; Console spans row 3 all columns. (PipelineRail, Inspector, Console, MachineDrawer are imported but may be stubbed in this task and filled by Tasks 7-12 — to keep this task testable, stub them as empty `<aside>`/`<div>` returning their zone background, then wire real ones in later tasks.)

- [ ] **Step 1: Build `TopBar.tsx`** — flex bar: left `◆ LASER FORGE` wordmark (accent diamond, sans 800); center group = Canvas `W × H mm` (two `NumberField`-style mono inputs; clamp 10–1000 on commit), divider, Pen `mm` input, divider, Seed mono input + `⟲` reroll button (calls `randomSeed`); right = `⇄ Share` button (calls a `copyShareLink` passed via props OR inline using `writeHash` — see Task 11 note; for now a Share button that calls `writeHash` with current payload + `navigator.clipboard`). Use CSS classes `.lf-topbar`, `.lf-wordmark`, `.lf-field`, etc. (styles appended to index.css).

- [ ] **Step 2: Rewrite `App.tsx`** — remove `import { Leva } from "leva"`, `useGeneratorParams`, `ExportBar`, `GeneratorPicker`, `LayerStack`, `LayerControls`, `MotifPanel`, the `MachineDock` component. New structure:

```tsx
import { useMemo, useEffect } from "react";
import { useApp } from "./state/store";
import { byId } from "./generators/registry";
import { distortionById } from "./distortions/registry";
import { schemaDefaults } from "./ui/controls/schema";
import { CanvasPreview } from "./render/CanvasPreview";
import { TopBar } from "./ui/TopBar";
import { PipelineRail } from "./ui/PipelineRail";
import { Inspector } from "./ui/Inspector";
import { Console } from "./ui/Console";
import { MachineDrawer } from "./ui/MachineDrawer";
import { readHash } from "./state/urlSync";
import type { Artwork } from "./generators/types";

const hashUid = (uid: string): number => { /* keep existing impl verbatim */ };

function Stage() {
  const generatorId = useApp((s) => s.generatorId);
  const gen = byId(generatorId)!;
  const seed = useApp((s) => s.seed);
  const w = useApp((s) => s.canvasWMm);
  const h = useApp((s) => s.canvasHMm);
  const layers = useApp((s) => s.layers);
  const layerParams = useApp((s) => s.layerParams);
  const genParams = useApp((s) => s.genParams);
  const motif = useApp((s) => s.motif);
  const baseParams = genParams[generatorId] ?? schemaDefaults(gen.schema);

  const baseArt = useMemo(
    () => gen.generate(baseParams, seed, { wMm: w, hMm: h }),
    [gen, baseParams, seed, w, h, motif],
  );
  const finalArt = useMemo<Artwork>(() => {
    let cur = baseArt;
    for (const l of layers) {
      if (!l.enabled) continue;
      const dist = distortionById(l.distortionId);
      if (!dist) continue;
      const params = layerParams[l.uid] ?? dist.defaults;
      cur = dist.apply(cur, params, seed + hashUid(l.uid));
    }
    return cur;
  }, [baseArt, layers, layerParams, seed]);

  const setCurrentArtwork = useApp((s) => s.setCurrentArtwork);
  useEffect(() => { setCurrentArtwork(finalArt); }, [finalArt, setCurrentArtwork]);

  return <CanvasPreview artwork={finalArt} />;
}
```

App returns the grid: `<div className="lf-app">` (grid in CSS) with `<TopBar/>`, `<PipelineRail/>`, `<main className="lf-stage"><Stage/></main>`, `<Inspector/>`, `<Console/>`, `<MachineDrawer/>`. Keep the `readHash`/`hydrate` effect, adding `genParams: h.p ?? {}` to the hydrate call. Move grid sizing to a `.lf-app` CSS rule.

- [ ] **Step 3: Add `.lf-app`, `.lf-topbar`, `.lf-stage` grid + bar styles to index.css.** `.lf-stage` uses `.plotter-bed-grid` look, `display:flex`, `min-height:0`.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run dev`
Expected: typecheck passes for App/TopBar/Stage (PipelineRail/Inspector/Console/MachineDrawer may be stubs). App loads at http://localhost:5173 showing TopBar + bright canvas with the default flow-field render + empty side zones. Seed reroll re-renders.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/ui/TopBar.tsx src/index.css
git commit -m "feat: CAD grid shell + TopBar; Stage reads genParams (no Leva)"
```

---

### Task 7: Inspector

**Files:**
- Create: `src/ui/Inspector.tsx`

**Interfaces:**
- Consumes: store (`selectedNodeId`, `generatorId`, `genParams`, `setGenParams`, `layers`, `layerParams`, `setLayerParams`, `motif`, `setMotif`), `byId`, `distortionById`, `schemaDefaults`, `SchemaControls`.
- Produces: `Inspector()` (no props). Resolves the selected node:
  - if `selectedNodeId === "source"`: schema = `byId(generatorId).schema`; values = `genParams[generatorId] ?? schemaDefaults(schema)`; onChange writes `setGenParams(generatorId, { ...values, [field]: value })`. Header = generator name + description. If generator id ∈ {`blueprint`,`specsheet`,`pattern-maker`} also render a Motif section (Load SVG / clear) above the controls (reuse parse logic from the old MotifPanel — import the existing `parseSvgMotif`).
  - else (layer uid): find layer; schema = `distortionById(layer.distortionId).schema`; values = `layerParams[uid] ?? schemaDefaults(schema)`; onChange writes `setLayerParams(uid, {...})`. Header = distortion name + description.

- [ ] **Step 1: Build `Inspector.tsx`** per the interface. Wrap in `<aside className="lf-inspector scroller">`. Header `<div className="lf-inspector__head">` with node name (sans 700) + description (`--text-muted`, 11px). Body = `<SchemaControls .../>`.
- [ ] **Step 2: Motif section** — extract the file-parse handler from the old `src/ui/MotifPanel.tsx` (find `parseSvgMotif` import + the `<input type=file>` handler) and render a compact `.lf-motif` block (filename chip + Load/Clear). Only when source is a motif consumer.
- [ ] **Step 3: Add `.lf-inspector*` + `.lf-motif` styles to index.css.**
- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run dev`
Expected: Right panel shows flow-field params as CAD controls; editing a slider re-renders the canvas live; switching generator (via store, temporarily set in console or after Task 8) shows that generator's params; for blueprint, a Load-SVG motif control appears.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Inspector.tsx src/index.css
git commit -m "feat: Inspector — schema-driven params for the selected node + motif slot"
```

---

### Task 8: PipelineRail (source + layers + add menu)

**Files:**
- Create: `src/ui/PipelineRail.tsx`
- Test: `scripts/test-pipeline-select.mjs`

**Interfaces:**
- Consumes: store (`generatorId`, `selectedNodeId`, `setSelectedNode`, `layers`, `toggleLayer`, `removeLayer`, `addLayer`, `motif`), `byId`, `DISTORTIONS` registry (`src/distortions/registry`).
- Produces: `PipelineRail()` (no props). Renders SourceNode card (icon ◆ + generator name + group tag; `▸` opens gallery — dispatch via a local `galleryOpen` state lifted to a store flag OR a context; simplest: add `galleryOpen`/`setGalleryOpen` to the store in this task). Renders one `LayerNode` per layer (number badge, name, eye toggle → `toggleLayer`, `×` → `removeLayer`; click selects). `+ Layer` button opens a popover listing `DISTORTIONS` → `addLayer(id)`. Selected node gets `--accent` outline.
- Adds to store: `galleryOpen: boolean; setGalleryOpen: (v: boolean) => void` (initial `false`).

- [ ] **Step 1: Write the failing test** — `scripts/test-pipeline-select.mjs` (exercises the store interactions the rail relies on; pure store, no DOM)

```js
import assert from "node:assert";
import { useApp } from "../src/state/store.ts";
const s = () => useApp.getState();
s().clearLayers();
s().setGenerator("flow-field");
assert.strictEqual(s().selectedNodeId, "source");
s().addLayer("noise-warp");
const uid = s().layers[0].uid;
assert.strictEqual(s().selectedNodeId, uid);
s().setSelectedNode("source");
assert.strictEqual(s().selectedNodeId, "source");
s().setGalleryOpen(true);
assert.strictEqual(s().galleryOpen, true);
console.log("ok");
```

- [ ] **Step 2: Add `galleryOpen` to store**, run test to verify it fails first.

Run: `npx tsx scripts/test-pipeline-select.mjs`
Expected: FAIL until `setGalleryOpen` exists; then PASS.

- [ ] **Step 3: Build `PipelineRail.tsx`** per interface. Use `<aside className="lf-rail scroller">`. SourceNode `.lf-node lf-node--source`, layer nodes `.lf-node`, connector line `.lf-node__flow` between them. Add-menu = a `.lf-addmenu` popover.
- [ ] **Step 4: Add `.lf-rail`, `.lf-node*`, `.lf-addmenu` styles to index.css.** Selected = `box-shadow: 0 0 0 1px var(--accent)`.
- [ ] **Step 5: Verify**

Run: `npx tsx scripts/test-pipeline-select.mjs && npm run typecheck && npm run dev`
Expected: `ok`; left rail shows source + clicking selects (Inspector follows); + Layer adds a distortion node which becomes selected; eye toggles enable/disable (canvas updates); × removes.

- [ ] **Step 6: Commit**

```bash
git add src/state/store.ts src/ui/PipelineRail.tsx scripts/test-pipeline-select.mjs src/index.css
git commit -m "feat: PipelineRail — source + layer nodes, select/toggle/remove/add"
```

---

### Task 9: Drag-to-reorder layers

**Files:**
- Create: `src/ui/hooks/useDragReorder.ts`
- Modify: `src/ui/PipelineRail.tsx`
- Test: `scripts/test-reorder.mjs`

**Interfaces:**
- Produces: `reorder<T>(list: T[], from: number, to: number): T[]` (pure) and `useDragReorder({ count, onReorder }: { count: number; onReorder: (from: number, to: number) => void })` returning per-item drag handlers.
- Store: reuse existing `moveLayer(uid, dir)` is insufficient for arbitrary moves — add `reorderLayers(from: number, to: number)` to the store (splice move on both `layers`; `layerParams` untouched since keyed by uid).

- [ ] **Step 1: Write the failing test** — `scripts/test-reorder.mjs`

```js
import assert from "node:assert";
import { reorder } from "../src/ui/hooks/useDragReorder.ts";
assert.deepStrictEqual(reorder(["a","b","c"], 0, 2), ["b","c","a"]);
assert.deepStrictEqual(reorder(["a","b","c"], 2, 0), ["c","a","b"]);
assert.deepStrictEqual(reorder(["a","b","c"], 1, 1), ["a","b","c"]);
console.log("ok");
```

- [ ] **Step 2: Run to verify fail.** `npx tsx scripts/test-reorder.mjs` → FAIL.
- [ ] **Step 3: Implement `reorder` + `useDragReorder`** (pointer-based: on drag over a sibling midpoint, call `onReorder`). Add `reorderLayers` to store using `reorder`.
- [ ] **Step 4: Wire into `PipelineRail`** layer nodes (drag handle on `.lf-node__grip`); remove any leftover up/down arrow affordance.
- [ ] **Step 5: Verify.** `npx tsx scripts/test-reorder.mjs && npm run typecheck && npm run dev` → `ok`; dragging a layer node reorders the pipeline and the canvas updates accordingly.
- [ ] **Step 6: Commit**

```bash
git add src/ui/hooks/useDragReorder.ts src/ui/PipelineRail.tsx src/state/store.ts scripts/test-reorder.mjs
git commit -m "feat: drag-to-reorder pipeline layers"
```

---

### Task 10: GeneratorGallery with live previews

**Files:**
- Create: `src/ui/GeneratorGallery.tsx`, `src/ui/previewThumb.ts`
- Test: `scripts/test-gallery-filter.mjs`

**Interfaces:**
- Consumes: `GENERATORS` registry (full list with `id`,`name`,`description`,`group`/category — confirm the registry exposes group; if not, derive from registry order/metadata in `src/generators/registry.ts`), store (`generatorId`, `setGenerator`, `galleryOpen`, `setGalleryOpen`), `schemaDefaults`, `artworkToThumbDataUrl`.
- Produces:
  - `previewThumb.ts`: `artworkToThumbDataUrl(gen: GeneratorDef, size: number): string` — runs `gen.generate(schemaDefaults(gen.schema), 1, { wMm: 100, hMm: 100 })`, draws polylines to an offscreen `<canvas>` of `size×size`, returns `toDataURL()`. Memoized in a module-level `Map<string,string>` by `gen.id`.
  - `filterGenerators(all: {id:string;name:string;group:string}[], query: string): typeof all` (pure) — case-insensitive match on name or group.
  - `GeneratorGallery()` (no props) — renders only when `galleryOpen`. Full-height slide-over (`z-gallery`), search input (autofocus), groups, card grid with thumbnails; click → `setGenerator(id)` + `setGalleryOpen(false)`. Keyboard: type filters, `Esc` closes, `↑/↓/Enter` move/select.

- [ ] **Step 1: Write the failing test** — `scripts/test-gallery-filter.mjs`

```js
import assert from "node:assert";
import { filterGenerators } from "../src/ui/GeneratorGallery.tsx";
const all = [
  { id: "flow-field", name: "Flow Field", group: "Laser" },
  { id: "pipes", name: "Truchet Pipes", group: "Pen Plotter" },
  { id: "rose", name: "Rose", group: "Laser" },
];
assert.deepStrictEqual(filterGenerators(all, "ros").map((g) => g.id), ["rose"]);
assert.deepStrictEqual(filterGenerators(all, "laser").map((g) => g.id), ["flow-field", "rose"]);
assert.deepStrictEqual(filterGenerators(all, "").map((g) => g.id), ["flow-field", "pipes", "rose"]);
console.log("ok");
```

- [ ] **Step 2: Run to verify fail.** `npx tsx scripts/test-gallery-filter.mjs` → FAIL.
- [ ] **Step 3: Confirm registry group metadata.** Read `src/generators/registry.ts`; if generators carry a `group`/category, use it; if grouping is implicit (array order), add an explicit `group` field to each registry entry (small, mechanical) so the gallery can section them. Keep the five groups: Import / Pen Plotter / Pattern / Layout / Laser.
- [ ] **Step 4: Implement `previewThumb.ts`** (offscreen canvas render + Map cache). Guard against generators that read motif (blueprint/specsheet/pattern-maker) — they render with no motif; that's fine (frame only).
- [ ] **Step 5: Implement `GeneratorGallery.tsx`** with `filterGenerators` + keyboard nav. Wire its trigger: SourceNode `▸` (Task 8) already calls `setGalleryOpen(true)`.
- [ ] **Step 6: Verify.** `npx tsx scripts/test-gallery-filter.mjs && npm run typecheck && npm run dev` → `ok`; clicking the source `▸` opens a gallery with live thumbnails; typing filters; Enter/click switches the generator and closes; Esc closes.
- [ ] **Step 7: Commit**

```bash
git add src/ui/GeneratorGallery.tsx src/ui/previewThumb.ts src/generators/registry.ts scripts/test-gallery-filter.mjs src/index.css
git commit -m "feat: searchable generator gallery with cached live previews"
```

---

### Task 11: Console (stats + dedupe/join + export + Plot)

**Files:**
- Create: `src/ui/Console.tsx`
- Modify: `src/state/store.ts` (lift `dedupe`/`join`/`drawerOpen` flags so TopBar Share + Console + MachineDrawer share them)

**Interfaces:**
- Consumes: store (`currentArtwork`, `seed`, `generatorId`, `canvasWMm`, `canvasHMm`, `penWidthMm`, `layers`, `layerParams`, `genParams`), `downloadSvg`, `downloadGcode`, `writeHash`.
- Store additions: `dedupe: boolean; join: boolean; setDedupe; setJoin; drawerOpen: boolean; setDrawerOpen` (so the Plot button toggles the MachineDrawer).
- Produces: `Console()` — left: `{lineCount} lines · {pointCount} pts · ~{estPlotMinutes}m` (mono); middle: dedupe/join `Toggle`s (reuse Task 4 control, inline labels + `title` tooltips, copy verbatim from old ExportBar lines 178 & 190); right: `SVG`, `G-code` buttons (call `downloadSvg`/`downloadGcode` with `{ dedupe, join, strokeWidthMm: penWidthMm }` / `{ dedupe, join }`), and `▸ Plot` toggling `drawerOpen`. Reads artwork from `currentArtwork` (published by Stage). `estPlotMinutes` = simple heuristic: `pointCount / 1500` rounded, min 1 — label it "~" (approx).

- [ ] **Step 1: Add `dedupe/join/drawerOpen` to store** (with setters), default `false`.
- [ ] **Step 2: Build `Console.tsx`** per interface in a `<footer className="lf-console">`. Use `--font-mono` for stats. SVG button = accent fill; Plot button = accent outline.
- [ ] **Step 3: Move Share to use shared state** — TopBar's Share (Task 6) builds the `SharePayload` (`{ g, s, w, h, p: genParams[generatorId] ?? {}, l: layers, lp: layerParams, pw }`) and writes the hash. (This finally populates the previously-unused `p` field.)
- [ ] **Step 4: Add `.lf-console*` styles.**
- [ ] **Step 5: Verify.** `npm run typecheck && npm run dev` → bottom console shows live stats; dedupe/join toggle; SVG and G-code download; Share copies a URL; Plot toggles the (next task) drawer.
- [ ] **Step 6: Commit**

```bash
git add src/ui/Console.tsx src/state/store.ts src/ui/TopBar.tsx src/index.css
git commit -m "feat: Console — stats, dedupe/join, SVG/G-code, Plot trigger; Share carries genParams"
```

---

### Task 12: MachineDrawer (host PlotterPanel / AxiDrawPanel)

**Files:**
- Create: `src/ui/MachineDrawer.tsx`

**Interfaces:**
- Consumes: store (`drawerOpen`, `setDrawerOpen`, `plotterConnected`, `plotterState`), existing `PlotterPanel`, `AxiDrawPanel` (rendered unchanged).
- Produces: `MachineDrawer()` — when `drawerOpen`, a panel sliding up over the console (`z-drawer`) with two tabs (GRBL / Laser, AxiDraw — same `useState<Machine>` switch as the old `MachineDock`, lines 21-56), a close `×`, and a connection-status LED (`--ok` when `plotterConnected`, else `--text-muted`) bound to `plotterState`. Body renders the selected panel.

- [ ] **Step 1: Build `MachineDrawer.tsx`** reusing the tab logic from old `App.tsx` `MachineDock` (copy the `Machine` type + switch), restyled as `.lf-drawer`. Render `<PlotterPanel/>`/`<AxiDrawPanel/>` unchanged.
- [ ] **Step 2: Add `.lf-drawer*` + `.lf-led` styles.** Drawer animates up (transform), respects `prefers-reduced-motion`.
- [ ] **Step 3: Verify.** `npm run typecheck && npm run dev` → Plot opens the drawer; GRBL/AxiDraw tabs switch; the existing panels work (connect/jog/plot logic unchanged); close hides it. (Hardware connect needs a device; at minimum the panels render and Connect prompts WebSerial.)
- [ ] **Step 4: Commit**

```bash
git add src/ui/MachineDrawer.tsx src/index.css
git commit -m "feat: MachineDrawer hosting GRBL/AxiDraw panels (slide-up, status LED)"
```

---

## Phase 3 — Remove Leva + cleanup + optional purity

### Task 13: Delete dead UI + remove Leva dependency

**Files:**
- Delete: `src/ui/ParamPanel.tsx`, `src/ui/LayerControls.tsx`, `src/ui/GeneratorPicker.tsx`, `src/ui/LayerStack.tsx`, `src/ui/ExportBar.tsx`, `src/ui/MotifPanel.tsx`
- Modify: `package.json` (drop `leva`), `src/index.css` (confirm no `.leva-*`/`.glass-panel` left)

- [ ] **Step 1: Grep for stragglers.**

Run: `grep -rn "leva" src/ package.json` and `grep -rn "ParamPanel\|LayerControls\|GeneratorPicker\|LayerStack\|ExportBar\|MotifPanel\|MachineDock" src/`
Expected: only the import of `parseSvgMotif` (moved to Inspector) and no other references. Fix any remaining import.

- [ ] **Step 2: Delete the six dead files.**

```bash
git rm src/ui/ParamPanel.tsx src/ui/LayerControls.tsx src/ui/GeneratorPicker.tsx src/ui/LayerStack.tsx src/ui/ExportBar.tsx src/ui/MotifPanel.tsx
```

- [ ] **Step 3: Remove `leva` from `package.json` dependencies and reinstall.**

```bash
npm uninstall leva
```

- [ ] **Step 4: Full verification.**

Run: `npm run typecheck && npm run build && npm run dev`
Expected: zero type errors; production build succeeds; app fully works with no Leva. Then run the existing smoke test to confirm generators still produce geometry: `npx tsx scripts/smoke.mjs` (Expected: all generators report polyline counts, no throws).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove Leva + dead UI components (full custom UI)"
```

---

### Task 14: URL-sync genParams round-trip (fixes shared-link param loss)

**Files:**
- Modify: `src/state/urlSync.ts`, `src/App.tsx` (hydrate already passes `genParams: h.p ?? {}` from Task 6 — verify), `src/ui/TopBar.tsx` (Share payload already includes `p` from Task 11 — verify)
- Test: `scripts/test-urlsync.mjs`

**Interfaces:**
- `urlSync.ts`: `SharePayload.p` is repurposed to `Record<string, Record<string, unknown>>` (genParams keyed by generatorId). Update the type + any encode/decode. `encodePayload`/`decodePayload` are already JSON-based, so only the type changes.

- [ ] **Step 1: Write the failing test** — `scripts/test-urlsync.mjs`

```js
import assert from "node:assert";
import { encodePayload, decodePayload } from "../src/state/urlSync.ts";
const payload = {
  g: "flow-field", s: 42, w: 200, h: 200,
  p: { "flow-field": { lineCount: 80, noiseScale: 0.01 } },
  l: [], lp: {}, pw: 0.3,
};
const round = decodePayload(encodePayload(payload));
assert.deepStrictEqual(round.p, payload.p);
assert.strictEqual(round.g, "flow-field");
console.log("ok");
```

(If `encodePayload`/`decodePayload` are not exported, export them; the file currently exposes `writeHash`/`readHash` — add the lower-level exports or test via `writeHash`+`readHash` against a stubbed `location.hash`. Prefer exporting the pure encode/decode.)

- [ ] **Step 2: Run to verify fail.** `npx tsx scripts/test-urlsync.mjs` → FAIL (type/shape or missing export).
- [ ] **Step 3: Update `SharePayload.p` type** to `Record<string, Record<string, unknown>>` and export `encodePayload`/`decodePayload` if needed.
- [ ] **Step 4: Verify round-trip + manual share.** `npx tsx scripts/test-urlsync.mjs && npm run dev` → `ok`; tweak a generator param, Share, open the copied URL in a new tab → params restored (not just generator id).
- [ ] **Step 5: Commit**

```bash
git add src/state/urlSync.ts src/App.tsx src/ui/TopBar.tsx scripts/test-urlsync.mjs
git commit -m "feat: persist generator params in share links (genParams round-trip)"
```

---

### Task 15 (OPTIONAL — do only if low-risk): motif as generator parameter

> Spec marks this "do it only if low-risk, else defer." Decide AFTER Task 13: if it touches more than blueprint/specsheet/patternMaker + one call site, **defer** and skip this task.

**Files:**
- Modify: `src/generators/types.ts` (extend `generate` signature), `src/generators/blueprint.ts`, `src/generators/specsheet.ts`, `src/generators/patternMaker.ts`, `src/App.tsx` (Stage passes motif)

**Interfaces:**
- `GeneratorDef.generate: (params: P, seed: number, canvas: Canvas, motif?: Motif | null) => Artwork` — optional 4th arg; only the three motif consumers read it. Stage passes `motif`. Removes the `useApp.getState().motif` reads inside generators (pure functions again).

- [ ] **Step 1:** Add optional `motif?: Motif | null` 4th param to the `generate` type.
- [ ] **Step 2:** In the three generators, replace `useApp.getState().motif` with the `motif` arg; drop the store import.
- [ ] **Step 3:** Stage calls `gen.generate(baseParams, seed, { wMm:w, hMm:h }, motif)`.
- [ ] **Step 4: Verify.** `npm run typecheck && npx tsx scripts/smoke.mjs && npm run dev` → blueprint/specsheet/pattern-maker still compose the motif; no store reads inside generators.
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: pass motif as generate() arg (pure generators)"
```

---

## Self-Review

**Spec coverage:**
- Signal-chain layout + 4 fixed zones → Tasks 6, 7, 8, 11, 12. ✔
- Generator switching (searchable, preview-driven gallery) → Task 10. ✔
- Custom schema-driven controls replacing Leva → Tasks 1, 4, 5, 7; removal Task 13. ✔
- Drag-to-reorder layers → Task 9. ✔
- CAD aesthetic + tokens (charcoal chrome, bright bed, laser-orange, z-scale) → Task 3 + per-task styles. ✔
- Console (stats incl. est. plot time, dedupe/join, SVG/G-code, Plot) → Task 11. ✔
- MachineDrawer reusing PlotterPanel/AxiDrawPanel → Task 12. ✔
- `selectedNodeId` in store → Task 2. ✔
- Motif purity cleanup (conditional/deferred) → Task 15 (optional). ✔
- Canvas-bounds clamping → Task 6 TopBar (10–1000mm). ✔
- Success criteria (zero leva imports, parity controls, export unchanged) → Task 13 verification (`smoke.mjs`, build). ✔

**Placeholder scan:** No "TBD"/"handle edge cases". Presentational tasks intentionally specify interface + structure + acceptance + verification rather than full JSX, with all props/return types fixed; logic tasks carry complete code + tests. Style steps enumerate exact class names + token usage.

**Type consistency:** `ControlSchema`/`ControlDef` (Task 1) used identically in types.ts, schema.ts, SchemaControls.tsx. `schemaDefaults`/`resolveVisibility`/`localKey` names consistent across Tasks 1/5/7. Store additions (`genParams`,`setGenParams`,`selectedNodeId`,`setSelectedNode`,`galleryOpen`,`setGalleryOpen`,`dedupe`,`join`,`drawerOpen`,`reorderLayers`) introduced once and reused with matching signatures. `SharePayload.p` repurposed once (Task 14) consistent with Share writer (Task 11) and hydrate reader (Task 6).

**Known follow-ups (out of scope):** canvas rulers/coordinate readout (spec'd optional — add post-MVP if wanted); undo/redo; responsive.
