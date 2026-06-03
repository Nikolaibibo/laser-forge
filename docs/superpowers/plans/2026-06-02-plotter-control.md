# Plotter Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den GRBL-Pen-Plotter direkt aus Laser Forge ansteuern (WebSerial) — aktuelles Artwork als pen-aware G-code streamen plus manuelle Befehle (Stift hoch/runter, Nullpunkt, Jog, Outline).

**Architecture:** Neues Modul `src/plotter/` mit vier geschichteten Dateien (Transport → GRBL-Semantik → G-code-Konverter → Job-Streamer) + ein Plotter-Panel in der Sidebar. Pure Funktionen (`gcode.ts`) werden via `scripts/`-tsx getestet; die Transport-Schicht via Phase-0-Spike manuell am echten Gerät verifiziert.

**Tech Stack:** TypeScript, React 18, Zustand, WebSerial API (Chromium), tsx für Test-Scripts. GRBL 0.9i / CH340 @115200.

---

## File Structure

- `src/plotter/gcode.ts` — **pure**: `Artwork` → GRBL-Zeilen, NN-Sortierung, Outline, Bbox. Keine Hardware/DOM-Abhängigkeit.
- `src/plotter/webserial.ts` — WebSerial-Transport: Port öffnen/halten, Read-Loop, Write-Queue (send→ok), Disconnect.
- `src/plotter/grbl.ts` — GRBL-Befehlshelfer auf dem Transport (unlock/status/origin/jog/pen/park).
- `src/plotter/streamJob.ts` — Job-Streamer mit Progress + Abort.
- `src/state/store.ts` — **modify**: `plotter`-Slice (connected/status/progress).
- `src/ui/PlotterPanel.tsx` — Steuer-Panel.
- `src/App.tsx` — **modify**: Panel einhängen, Artwork durchreichen.
- `scripts/gcode-test.mjs` — Tests für `gcode.ts`.

Pen-Konstanten (aus Vault-Doku, fix): hoch `M3 S20`, runter `M3 S160`, dwellUp 0.15 s, dwellDown 0.1 s, Feed-Default 4500. **Nie `M5`.**

---

## Task 0: WebSerial-Spike (de-risking, manuell)

Beweist Browser↔GRBL über CH340, bevor irgendetwas Großes gebaut wird. Wird später durch das echte Panel ersetzt — bewusst Wegwerf-Qualität.

**Files:**
- Create: `src/plotter/spike.tsx`
- Modify: `src/App.tsx` (temporär Spike rendern)

- [ ] **Step 1: Spike-Komponente**

```tsx
// src/plotter/spike.tsx
import { useRef, useState } from "react";

export function PlotterSpike() {
  const portRef = useRef<any>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const push = (s: string) => setLog((l) => [...l.slice(-40), s]);

  async function connect() {
    if (!(navigator as any).serial) return push("KEIN WebSerial (Chrome/Edge nötig)");
    const port = await (navigator as any).serial.requestPort();
    await port.open({ baudRate: 115200 });
    portRef.current = port;
    // Read-Loop
    (async () => {
      const dec = new TextDecoder();
      const reader = port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) push("< " + dec.decode(value).replace(/\r?\n/g, "⏎"));
        }
      } catch (e) { push("read-err " + e); } finally { reader.releaseLock(); }
    })();
    writerRef.current = port.writable.getWriter();
    push("connected @115200");
    await send("$X");
  }
  async function send(cmd: string) {
    const w = writerRef.current; if (!w) return push("nicht verbunden");
    await w.write(new TextEncoder().encode(cmd + "\r\n"));
    push("> " + cmd);
  }

  return (
    <div style={{ padding: 16, fontFamily: "monospace", color: "#ddd" }}>
      <button onClick={connect}>Connect</button>{" "}
      <button onClick={() => send("M3 S20")}>Stift ↑</button>{" "}
      <button onClick={() => send("M3 S160")}>Stift ↓</button>{" "}
      <button onClick={() => send("G91")} >rel</button>{" "}
      <button onClick={() => send("G0 X10")}>X+10</button>{" "}
      <button onClick={() => send("G0 X-10")}>X−10</button>{" "}
      <button onClick={() => send("G0 Y10")}>Y+10</button>{" "}
      <button onClick={() => send("G0 Y-10")}>Y−10</button>{" "}
      <button onClick={() => send("?")}>status</button>
      <pre style={{ maxHeight: 300, overflow: "auto" }}>{log.join("\n")}</pre>
    </div>
  );
}
```

- [ ] **Step 2: Spike temporär rendern**

In `src/App.tsx` ganz oben im JSX (vor dem normalen Layout) `<PlotterSpike />` einsetzen, Import ergänzen. (Wird in Task 8 wieder entfernt.)

- [ ] **Step 3: Manuell verifizieren**

Run: `npm run dev` → Chrome `http://localhost:5173`. Plotter an, USB dran. Connect → Port wählen → Banner/`ok` im Log. Stift ↑/↓ → Servo bewegt sich (kein Fallen). rel + X+10 → Kopf fährt 10 mm.

Expected: physische Bewegung, GRBL-Antworten im Log, keine Exception.

- [ ] **Step 4: Befund festhalten**

Ergebnis (grün/rot + Notizen) als Kommentar oben in `src/plotter/spike.tsx`. **Grün → weiter mit Task 1.** Rot → Plan B (lokale Bridge) in der Spec vermerken; `gcode.ts` (Task 1–3) ist davon unabhängig und wird trotzdem gebaut.

- [ ] **Step 5: Commit**

```bash
git add src/plotter/spike.tsx src/App.tsx
git commit -m "spike: webserial GRBL connection proof"
```

---

## Task 1: G-code-Konverter — Setup + NN-Sortierung

**Files:**
- Create: `src/plotter/gcode.ts`
- Test: `scripts/gcode-test.mjs`

- [ ] **Step 1: Failing test für `orderPolylines`**

```js
// scripts/gcode-test.mjs
import { orderPolylines, artworkToGcode, outlineGcode, bbox } from "../src/plotter/gcode.ts";

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); failed++; } };

// NN: zwei Linien, die zweite näher am Ursprung → kommt zuerst
const a = { points: [[100, 100], [110, 100]], closed: false };
const b = { points: [[5, 5], [15, 5]], closed: false };
const ordered = orderPolylines([a, b]);
ok(ordered[0].points[0][0] === 5, "NN picks nearest-to-origin first");

// Reverse: Linie, deren ENDE näher ist, wird umgedreht
const c = { points: [[50, 0], [1, 0]], closed: false };
const ord2 = orderPolylines([c]);
ok(ord2[0].points[0][0] === 1, "NN reverses so start is nearest");

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npx tsx scripts/gcode-test.mjs`
Expected: FAIL — Modul/Funktion existiert nicht.

- [ ] **Step 3: `gcode.ts` mit `orderPolylines` + Helfern**

```ts
// src/plotter/gcode.ts
import type { Artwork, Polyline } from "../generators/types";

export type PenOpts = {
  feed: number;      // mm/min Draw-Feed
  penUp: string;     // z.B. "M3 S20"
  penDown: string;   // z.B. "M3 S160"
  dwellUp: number;   // s
  dwellDown: number; // s
};

export const DEFAULT_PEN: PenOpts = {
  feed: 4500, penUp: "M3 S20", penDown: "M3 S160", dwellUp: 0.15, dwellDown: 0.1,
};

const f = (n: number): string => (Math.round(n * 1000) / 1000).toString();

/** Nearest-neighbour-Reihenfolge; dreht offene Polylinien um, wenn ihr Ende näher liegt. */
export function orderPolylines(lines: Polyline[]): Polyline[] {
  const remaining = lines
    .filter((l) => l.points.length >= 2)
    .map((l) => ({ closed: l.closed, points: [...l.points] }));
  const out: Polyline[] = [];
  let cx = 0, cy = 0;
  while (remaining.length) {
    let bi = 0, bd = Infinity, brev = false;
    for (let i = 0; i < remaining.length; i++) {
      const pts = remaining[i].points;
      const [sx, sy] = pts[0];
      const [ex, ey] = pts[pts.length - 1];
      const ds = (sx - cx) ** 2 + (sy - cy) ** 2;
      const de = (ex - cx) ** 2 + (ey - cy) ** 2;
      if (ds < bd) { bd = ds; bi = i; brev = false; }
      if (!remaining[i].closed && de < bd) { bd = de; bi = i; brev = true; }
    }
    const pl = remaining.splice(bi, 1)[0];
    if (brev) pl.points.reverse();
    out.push(pl);
    const last = pl.points[pl.points.length - 1];
    cx = last[0]; cy = last[1];
  }
  return out;
}
```

- [ ] **Step 4: Test grün**

Run: `npx tsx scripts/gcode-test.mjs`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/plotter/gcode.ts scripts/gcode-test.mjs
git commit -m "feat(plotter): polyline nearest-neighbour ordering"
```

---

## Task 2: `artworkToGcode`

**Files:**
- Modify: `src/plotter/gcode.ts`
- Test: `scripts/gcode-test.mjs`

- [ ] **Step 1: Failing tests ergänzen**

In `scripts/gcode-test.mjs` vor der `console.log`-Zeile einfügen:

```js
const art = { widthMm: 100, heightMm: 100, polylines: [
  { points: [[10, 10], [20, 20], [30, 10]], closed: false },
] };
const g = artworkToGcode(art);
const txt = g.join("\n");
ok(g[0] === "G21" && g[1] === "G90", "header G21/G90");
ok(!txt.includes("M5"), "NEVER emits M5");
ok(txt.includes("M3 S160"), "pen down present");
ok(txt.includes("M3 S20"), "pen up present");
ok(/G4 P0\.1\b/.test(txt), "dwell-down 0.1 present");
ok(g[g.length - 1] === "G0 X0 Y0", "footer parks at origin");
// closed-Pfad schließt zum Startpunkt zurück
const artC = { widthMm: 100, heightMm: 100, polylines: [
  { points: [[0, 0], [10, 0], [10, 10]], closed: true },
] };
const gc = artworkToGcode(artC).join("\n");
ok(gc.includes("G1 X0 Y0"), "closed path returns to start");
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npx tsx scripts/gcode-test.mjs`
Expected: FAIL — `artworkToGcode is not a function`.

- [ ] **Step 3: `artworkToGcode` implementieren**

In `src/plotter/gcode.ts` anhängen:

```ts
export function artworkToGcode(art: Artwork, opts: PenOpts = DEFAULT_PEN): string[] {
  const { feed, penUp, penDown, dwellUp, dwellDown } = opts;
  const g: string[] = ["G21", "G90", penUp, `G4 P${dwellUp}`];
  for (const pl of orderPolylines(art.polylines)) {
    const pts = pl.points;
    if (pts.length < 2) continue;
    const [sx, sy] = pts[0];
    g.push(penUp, `G4 P${dwellUp}`, `G0 X${f(sx)} Y${f(sy)}`, penDown, `G4 P${dwellDown}`);
    for (let i = 1; i < pts.length; i++) g.push(`G1 X${f(pts[i][0])} Y${f(pts[i][1])} F${feed}`);
    if (pl.closed) g.push(`G1 X${f(sx)} Y${f(sy)} F${feed}`);
  }
  g.push(penUp, `G4 P${dwellUp}`, "G0 X0 Y0");
  return g;
}
```

- [ ] **Step 4: Test grün**

Run: `npx tsx scripts/gcode-test.mjs`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/plotter/gcode.ts scripts/gcode-test.mjs
git commit -m "feat(plotter): artwork to GRBL gcode (pen-aware, no M5)"
```

---

## Task 3: `bbox` + `outlineGcode`

**Files:**
- Modify: `src/plotter/gcode.ts`
- Test: `scripts/gcode-test.mjs`

- [ ] **Step 1: Failing tests ergänzen**

```js
const box = bbox({ widthMm: 100, heightMm: 100, polylines: [
  { points: [[10, 20], [40, 60]], closed: false },
] });
ok(box[0] === 10 && box[1] === 20 && box[2] === 40 && box[3] === 60, "bbox correct");
const ol = outlineGcode(box).join("\n");
ok(ol.includes("G0 X10 Y20"), "outline starts at bbox corner");
ok(!ol.includes("M5"), "outline never emits M5");
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npx tsx scripts/gcode-test.mjs`
Expected: FAIL — `bbox is not a function`.

- [ ] **Step 3: Implementieren**

In `src/plotter/gcode.ts` anhängen:

```ts
export function bbox(art: Artwork): [number, number, number, number] {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const l of art.polylines) for (const [x, y] of l.points) {
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  return [minx, miny, maxx, maxy];
}

export function outlineGcode(box: [number, number, number, number], opts: PenOpts = DEFAULT_PEN): string[] {
  const [x0, y0, x1, y1] = box;
  const { feed, penUp, penDown, dwellUp, dwellDown } = opts;
  return [
    "G21", "G90", penUp, `G4 P${dwellUp}`,
    `G0 X${f(x0)} Y${f(y0)}`, penDown, `G4 P${dwellDown}`,
    `G1 X${f(x1)} Y${f(y0)} F${feed}`, `G1 X${f(x1)} Y${f(y1)} F${feed}`,
    `G1 X${f(x0)} Y${f(y1)} F${feed}`, `G1 X${f(x0)} Y${f(y0)} F${feed}`,
    penUp, `G4 P${dwellUp}`, "G0 X0 Y0",
  ];
}
```

- [ ] **Step 4: Test grün + typecheck**

Run: `npx tsx scripts/gcode-test.mjs` → ALL PASS
Run: `npm run typecheck` → keine Fehler

- [ ] **Step 5: Commit**

```bash
git add src/plotter/gcode.ts scripts/gcode-test.mjs
git commit -m "feat(plotter): bbox + outline gcode for positioning"
```

---

## Task 4: WebSerial-Transport (`webserial.ts`)

Aus dem Spike herausgewachsen, gehärtet: Write-Queue (send→ok), Status-Parsing, Disconnect. Manuell verifiziert (nicht headless testbar).

**Files:**
- Create: `src/plotter/webserial.ts`

- [ ] **Step 1: Transport implementieren**

```ts
// src/plotter/webserial.ts
export type GrblState = "Idle" | "Run" | "Hold" | "Alarm" | "Unknown";
export type GrblStatus = { state: GrblState; mpos: [number, number] };

export class PlotterPort {
  private port: any = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private buf = "";
  private pending: ((line: string) => void) | null = null;
  private statusCb: ((s: GrblStatus) => void) | null = null;
  private disconnectCb: (() => void) | null = null;
  connected = false;

  static available(): boolean {
    return typeof navigator !== "undefined" && !!(navigator as any).serial;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    const serial = (navigator as any).serial;
    this.port = await serial.requestPort();
    await this.port.open({ baudRate: 115200 });
    this.connected = true;
    serial.addEventListener?.("disconnect", (e: any) => {
      if (e.target === this.port) this.handleDisconnect();
    });
    this.readLoop();
    await new Promise((r) => setTimeout(r, 1500)); // Banner abwarten
    await this.send("$X");
  }

  private async readLoop() {
    const dec = new TextDecoder();
    const reader = this.port.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        this.buf += dec.decode(value);
        let nl: number;
        while ((nl = this.buf.indexOf("\n")) >= 0) {
          const line = this.buf.slice(0, nl).trim();
          this.buf = this.buf.slice(nl + 1);
          this.handleLine(line);
        }
      }
    } catch { this.handleDisconnect(); } finally { reader.releaseLock(); }
  }

  private handleLine(line: string) {
    if (line.startsWith("<")) { // <Idle|MPos:..>
      const state = (line.match(/<(\w+)/)?.[1] ?? "Unknown") as GrblState;
      const m = line.match(/MPos:([-\d.]+),([-\d.]+)/);
      this.statusCb?.({ state, mpos: m ? [parseFloat(m[1]), parseFloat(m[2])] : [0, 0] });
      return;
    }
    if (line === "ok" || line.startsWith("error") || line.includes("ALARM")) {
      const p = this.pending; this.pending = null; p?.(line);
    }
  }

  async send(line: string): Promise<string> {
    if (!this.connected) throw new Error("not connected");
    if (!this.writer) this.writer = this.port.writable.getWriter();
    // eine Zeile gleichzeitig „in flight"
    while (this.pending) await new Promise((r) => setTimeout(r, 5));
    const done = new Promise<string>((res) => { this.pending = res; });
    await this.writer.write(new TextEncoder().encode(line + "\r\n"));
    return done;
  }

  onStatus(cb: (s: GrblStatus) => void) { this.statusCb = cb; }
  onDisconnect(cb: () => void) { this.disconnectCb = cb; }

  private handleDisconnect() {
    if (!this.connected) return;
    this.connected = false;
    this.pending?.("error: disconnect"); this.pending = null;
    this.disconnectCb?.();
  }

  async disconnect() {
    try { this.writer?.releaseLock(); await this.port?.close(); } catch {}
    this.connected = false;
  }
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: keine Fehler. (Falls `navigator.serial`-Typen fehlen: `any`-Casts sind absichtlich, kein `@types/w3c-web-serial` nötig.)

- [ ] **Step 3: Commit**

```bash
git add src/plotter/webserial.ts
git commit -m "feat(plotter): hardened webserial transport (write-queue, status, disconnect)"
```

---

## Task 5: GRBL-Befehlshelfer (`grbl.ts`)

**Files:**
- Create: `src/plotter/grbl.ts`

- [ ] **Step 1: Implementieren**

```ts
// src/plotter/grbl.ts
import { PlotterPort } from "./webserial";
import { DEFAULT_PEN, type PenOpts } from "./gcode";

export class Grbl {
  constructor(public port: PlotterPort, public pen: PenOpts = DEFAULT_PEN) {}
  unlock() { return this.port.send("$X"); }
  status() { return this.port.send("?"); }
  async setOrigin() { await this.port.send("G90"); return this.port.send("G92 X0 Y0"); }
  async penUp() { await this.port.send(this.pen.penUp); return this.port.send(`G4 P${this.pen.dwellUp}`); }
  async penDown() { await this.port.send(this.pen.penDown); return this.port.send(`G4 P${this.pen.dwellDown}`); }
  async jog(dx: number, dy: number, feed = 3000) {
    await this.port.send("G91");
    await this.port.send(`G1 X${dx} Y${dy} F${feed}`);
    return this.port.send("G90");
  }
  async park() { await this.penUp(); return this.port.send("G0 X0 Y0"); }
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck` → keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/plotter/grbl.ts
git commit -m "feat(plotter): GRBL command helpers"
```

---

## Task 6: Job-Streamer (`streamJob.ts`)

**Files:**
- Create: `src/plotter/streamJob.ts`
- Test: `scripts/streamjob-test.mjs`

- [ ] **Step 1: Failing test mit Fake-Port**

```js
// scripts/streamjob-test.mjs
import { streamJob } from "../src/plotter/streamJob.ts";
let failed = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); failed++; } };

const sent = [];
const fakePort = { connected: true, async send(l) { sent.push(l); return "ok"; } };
let prog = 0;
await streamJob(fakePort, ["G21", "G1 X1 Y1"], { onProgress: (d) => { prog = d; } });
ok(sent.length === 2, "all lines sent");
ok(prog === 2, "progress reached total");

// Abort
const ctrl = new AbortController();
const slowPort = { connected: true, async send() { await new Promise(r=>setTimeout(r,20)); return "ok"; } };
ctrl.abort();
let threw = false;
try { await streamJob(slowPort, ["a","b","c"], { signal: ctrl.signal }); } catch { threw = true; }
ok(threw, "aborts when signal already aborted");

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npx tsx scripts/streamjob-test.mjs`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implementieren**

```ts
// src/plotter/streamJob.ts
type Sendable = { connected: boolean; send(line: string): Promise<string> };
export type StreamOpts = {
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  penUp?: string; // zum Hochheben bei Abbruch
};

export async function streamJob(port: Sendable, lines: string[], opts: StreamOpts = {}): Promise<void> {
  const total = lines.length;
  for (let i = 0; i < total; i++) {
    if (opts.signal?.aborted) {
      if (opts.penUp) { try { await port.send(opts.penUp); } catch {} }
      throw new Error("aborted");
    }
    const resp = await port.send(lines[i]);
    if (resp.includes("ALARM")) throw new Error("GRBL alarm: " + resp);
    opts.onProgress?.(i + 1, total);
  }
}
```

- [ ] **Step 4: Test grün + typecheck**

Run: `npx tsx scripts/streamjob-test.mjs` → ALL PASS
Run: `npm run typecheck` → keine Fehler

- [ ] **Step 5: Commit**

```bash
git add src/plotter/streamJob.ts scripts/streamjob-test.mjs
git commit -m "feat(plotter): job streamer with progress + abort"
```

---

## Task 7: Zustand-Slice für Plotter-State

**Files:**
- Modify: `src/state/store.ts`

- [ ] **Step 1: Store-Datei lesen**

Run: `sed -n '1,60p' src/state/store.ts` — Pattern (Typ + `create`-Aufruf) anschauen, damit der Slice exakt in den bestehenden Stil passt.

- [ ] **Step 2: Slice ergänzen**

In den State-Typ aufnehmen und im `create`-Initializer setzen (Namen an bestehenden Stil angleichen):

```ts
// im State-Typ:
plotterConnected: boolean;
plotterState: string;            // "Idle" | "Run" | "Alarm" | "Disconnected" ...
plotterProgress: { done: number; total: number } | null;
setPlotterConnected: (b: boolean) => void;
setPlotterState: (s: string) => void;
setPlotterProgress: (p: { done: number; total: number } | null) => void;

// im create(...) Body:
plotterConnected: false,
plotterState: "Disconnected",
plotterProgress: null,
setPlotterConnected: (b) => set({ plotterConnected: b }),
setPlotterState: (s) => set({ plotterState: s }),
setPlotterProgress: (p) => set({ plotterProgress: p }),
```

Die `PlotterPort`-Instanz NICHT in den Store (kein serialisierbarer State) — sie lebt in einer `useRef` im Panel (Task 8).

- [ ] **Step 3: typecheck**

Run: `npm run typecheck` → keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/state/store.ts
git commit -m "feat(plotter): zustand slice for connection state"
```

---

## Task 8: Plotter-Panel + Spike entfernen

**Files:**
- Create: `src/ui/PlotterPanel.tsx`
- Modify: `src/App.tsx` (Panel einhängen, Artwork durchreichen, Spike raus)
- Delete: `src/plotter/spike.tsx`

- [ ] **Step 1: Panel implementieren**

```tsx
// src/ui/PlotterPanel.tsx
import { useRef, useState } from "react";
import type { Artwork } from "../generators/types";
import { PlotterPort } from "../plotter/webserial";
import { Grbl } from "../plotter/grbl";
import { artworkToGcode, outlineGcode, bbox, DEFAULT_PEN } from "../plotter/gcode";
import { streamJob } from "../plotter/streamJob";

export function PlotterPanel({ artwork }: { artwork: Artwork }) {
  const portRef = useRef<PlotterPort | null>(null);
  const grblRef = useRef<Grbl | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState("Disconnected");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [feed, setFeed] = useState(4500);
  const [step, setStep] = useState(10);

  if (!PlotterPort.available()) {
    return <div style={box}>Plotter: Chrome/Edge nötig (WebSerial).</div>;
  }

  async function connect() {
    const port = new PlotterPort();
    port.onStatus((s) => setState(s.state));
    port.onDisconnect(() => { setConnected(false); setState("Disconnected"); abortRef.current?.abort(); });
    await port.connect();
    portRef.current = port; grblRef.current = new Grbl(port, { ...DEFAULT_PEN, feed });
    setConnected(true); setState("Idle");
  }
  const g = () => grblRef.current!;
  async function plot() {
    const lines = artworkToGcode(artwork, { ...DEFAULT_PEN, feed });
    abortRef.current = new AbortController();
    try {
      await streamJob(portRef.current!, lines, {
        signal: abortRef.current.signal, penUp: DEFAULT_PEN.penUp,
        onProgress: (done, total) => setProgress({ done, total }),
      });
    } finally { setProgress(null); }
  }
  async function outline() {
    await streamJob(portRef.current!, outlineGcode(bbox(artwork), { ...DEFAULT_PEN, feed }), {});
  }

  return (
    <div style={box}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <strong>Plotter</strong>
        <span style={{ color: state === "Alarm" ? "#e55" : "#6c6" }}>● {state}</span>
        {!connected
          ? <button style={btn} onClick={connect}>Connect</button>
          : <button style={btn} onClick={() => portRef.current?.disconnect()}>Disconnect</button>}
      </div>
      {connected && (
        <>
          <div style={row}>
            <button style={btn} onClick={() => g().penUp()}>Stift ↑</button>
            <button style={btn} onClick={() => g().penDown()}>Stift ↓</button>
            <button style={btn} onClick={() => g().setOrigin()}>Nullpunkt hier</button>
          </div>
          <div style={row}>
            <button style={btn} onClick={() => g().jog(0, step)}>Y+</button>
            <button style={btn} onClick={() => g().jog(0, -step)}>Y−</button>
            <button style={btn} onClick={() => g().jog(-step, 0)}>X−</button>
            <button style={btn} onClick={() => g().jog(step, 0)}>X+</button>
            <select value={step} onChange={(e) => setStep(Number(e.target.value))}>
              <option value={1}>1mm</option><option value={5}>5mm</option><option value={10}>10mm</option>
            </select>
          </div>
          <div style={row}>
            <button style={btn} onClick={outline}>Outline</button>
            <button style={{ ...btn, background: "#e96a3a", color: "#fff" }} onClick={plot}>Plotten</button>
            <button style={btn} onClick={() => abortRef.current?.abort()}>Stop</button>
            <label>Feed <input type="number" value={feed} onChange={(e) => setFeed(Number(e.target.value))} style={{ width: 64 }} /></label>
          </div>
          {progress && <div>Plotten… {progress.done}/{progress.total} ({Math.round(progress.done / progress.total * 100)}%)</div>}
        </>
      )}
    </div>
  );
}
const box: React.CSSProperties = { padding: 12, borderTop: "1px solid #2d2d2a", background: "#141413", color: "#ccc", fontSize: 12, display: "flex", flexDirection: "column", gap: 8 };
const row: React.CSSProperties = { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" };
const btn: React.CSSProperties = { padding: "5px 10px", background: "#2d2d2a", color: "#eee", border: "1px solid #444", borderRadius: 3, cursor: "pointer" };
```

- [ ] **Step 2: In App einhängen, Spike raus**

In `src/App.tsx`: `import { PlotterPanel } from "./ui/PlotterPanel";`, `<PlotterPanel artwork={artwork} />` neben/unter der `ExportBar` rendern (gleiche `artwork`-Quelle wie ExportBar nutzen). Spike-Import + `<PlotterSpike />` entfernen.

- [ ] **Step 3: Delete Spike**

```bash
rm src/plotter/spike.tsx
```

- [ ] **Step 4: typecheck + Build**

Run: `npm run typecheck` → keine Fehler
Run: `npm run build` → grün

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(plotter): control panel (connect, pen, jog, origin, outline, plot, stop)"
```

---

## Task 9: End-to-End am echten Gerät (manuell)

**Files:** keine (Verifikation)

- [ ] **Step 1: Live testen**

Run: `npm run dev` → Chrome. Plotter an, A5 aufgeklebt, Stift drin.
1. Connect → Status Idle.
2. Kopf von Hand auf Blatt-Ecke schieben → „Nullpunkt hier".
3. „Outline" → Rechteck der Artwork-Bbox wird abgefahren, sitzt aufs Blatt.
4. „Plotten" → aktuelles Motiv wird gezeichnet, Fortschritt läuft, Stift hebt an Strich-Enden sofort ab (keine Klecks-Perlen).
5. „Stop" mitten im Job → Stift hebt, Bewegung endet.

Expected: sauberer Plot, kein `M5`-Servo-Drop, kein Stillstands-Klecks, Stop funktioniert.

- [ ] **Step 2: Befund in Vault festhalten**

Ergebnis in `~/Documents/obsidian/nikolai/Privat/Projekte/Stift-Plotter-GRBL-Specs.md` ergänzen (WebSerial-Steuerung funktioniert / Einschränkungen), danach `qmd embed`.

- [ ] **Step 3: Commit (nur falls Code-Anpassungen aus dem Test)**

```bash
git add -A && git commit -m "fix(plotter): adjustments from end-to-end test"
```

---

## Self-Review

**Spec-Coverage:** webserial→Task 4, grbl→Task 5, gcode→Task 1–3, streamJob→Task 6, UI-Panel→Task 8, State→Task 7, Spike (Phase 0)→Task 0, Disconnect-Handling→Task 4+8, Tests→Task 1/2/3/6, E2E→Task 9. Alle Spec-Abschnitte abgedeckt.

**Placeholder-Scan:** Keine TBD/„später"; jeder Code-Step zeigt vollständigen Code. Task 7 referenziert bewusst „bestehender Stil" + liest die Datei zuerst (Step 1), weil der genaue Store-Typ erst zur Laufzeit gelesen wird — kein Platzhalter, sondern bewusster Lese-Schritt.

**Typ-Konsistenz:** `PenOpts`/`DEFAULT_PEN` (Task 1) konsistent in gcode/grbl/Panel; `PlotterPort` (Task 4) konsistent in grbl/Panel; `Grbl` (Task 5) konsistent im Panel; `streamJob`-Signatur (Task 6) konsistent im Panel; `Artwork`/`Polyline` aus `src/generators/types.ts` korrekt importiert.
