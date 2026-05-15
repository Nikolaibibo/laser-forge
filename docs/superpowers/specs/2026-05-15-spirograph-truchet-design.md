# Spirograph + Truchet Generators

**Status:** Draft
**Date:** 2026-05-15
**Owner:** nikolai@gomedicusgroup.com

## Problem

Das Tool deckt bereits radial-elegante Generatoren (`rose`, `harmonograph`, `superformula`) und Chaos/organische (`attractor`, `differential-growth`, `flow-field`) sowie eine Strukturbasis (`voronoi`, `l-system`) ab. Was fehlt:

- Ein klassischer **Spirograph** (Hypo-/Epitrochoid): die meisten Plotter-Tools haben das, weil die Bilder sofort gut aussehen, parametrisch klar steuerbar sind und auf dem Laser perfekt funktionieren (eine geschlossene Polylinie, keine Füllungen).
- Ein **Tile-basierter Generator**, der nicht-radial ist. **Truchet-Tiles** decken diese Ecke ab und liefern zwei sehr unterschiedliche Looks (organisch-fließend mit Smith-Bögen vs. scharf-kantig mit Diagonalen).

Maurer Rose ist *bereits* als Variante in `src/generators/rose.ts` implementiert und wird hier nicht behandelt.

## Ziel

Zwei neue `GeneratorDef`-Instanzen, die sich nahtlos in das bestehende Generator-Pattern einfügen (siehe `src/generators/rose.ts` als Referenz). Beide werden in `src/generators/registry.ts` exportiert und sind anschließend über den Generator-Picker auswählbar, mit der `kaleidoscope`-Distortion kombinierbar und mit dem neuen Dedup-Toggle beim SVG-Export kompatibel.

**Aus dem Scope:**
- Animationen / Live-Editing-Tweens.
- Bezier-Glättung der Tile-Bögen (Polylinien-Sampling reicht).
- Truchet-Loop-Tracing (Verkettung benachbarter Bögen zu einer langen Polylinie). Dedup+Restitch beim Export erledigt das ohnehin.

## Erfolgskriterien

1. Beide neue Generatoren erscheinen im Generator-Picker und produzieren beim Auswählen sofort eine sinnvolle Ausgabe mit den Default-Werten.
2. Spirograph: Bei `R=5, r=3, d=5` zeichnet die Hypotrochoid-Variante eine klassische 5/3-Sterngeometrie; bei `cycles=1` schließt sich die Kurve.
3. Truchet: Bei einem 10×10-Grid mit Smith-Arcs entstehen sichtbar fließende, nicht-überlappende Bögen; bei `diagonals` entsteht ein deterministisches Pfeil-Muster aus dem `seed`.
4. `npx tsx scripts/smoke.mjs` läuft grün, beide neue Generators tauchen mit `> 0 lines, > 1 points` in der Liste auf.
5. Der `Dedupe paths`-Toggle beim Export entfernt redundante Tile-Kanten (z.B. wenn benachbarte Smith-Arcs am Tile-Übergang exakt aufeinandertreffen → bleiben einmal stehen).

## Lösungsdesign

### Spirograph

Datei: `src/generators/spirograph.ts`

```ts
type Variant = "hypotrochoid" | "epitrochoid";

type Params = {
  variant: Variant;
  R: number;        // outer/fixed circle radius (arbitrary units, fit-to-canvas scales it)
  r: number;        // rolling circle radius
  d: number;        // pen offset from rolling-circle center
  cycles: number;   // multiplier on the natural period
  samples: number;  // points per cycle
  marginMm: number;
};
```

**Math:**

- Hypotrochoid (rolling circle inside fixed circle):
  ```
  x(t) = (R − r)·cos(t) + d·cos(((R − r)/r)·t)
  y(t) = (R − r)·sin(t) − d·sin(((R − r)/r)·t)
  ```
- Epitrochoid (rolling circle outside):
  ```
  x(t) = (R + r)·cos(t) − d·cos(((R + r)/r)·t)
  y(t) = (R + r)·sin(t) − d·sin(((R + r)/r)·t)
  ```

**Natural period:** Für `R/r = p/q` (reduzierter Bruch) schließt sich die Kurve nach `t = q · 2π`. Da `R` und `r` user-eingegebene Floats sein können, approximieren wir `q` über eine GCD-Annäherung mit ganzzahlig skalierten Werten (z.B. `Math.round(R * 1000)` und `Math.round(r * 1000)`, dann `gcd`, dann `q = round(r * 1000) / gcd`). Hard-Cap bei `q ≤ 200`, damit pathologische Parameter nicht ein Millionen-Sample-Polylinien-Monster produzieren — bei Überschreitung wird `q = 200` genommen und die Kurve schließt halt nicht perfekt.

**Generate:**

```ts
generate: (p, _seed, canvas) => {
  const q = computeClosurePeriod(p.R, p.r); // returns integer in [1, 200]
  const tMax = 2 * Math.PI * q * p.cycles;
  const totalSamples = Math.max(64, Math.floor(p.samples * q * p.cycles));
  const pts: Point[] = [];
  for (let i = 0; i <= totalSamples; i++) {
    const t = (i / totalSamples) * tMax;
    if (p.variant === "hypotrochoid") {
      const Rm = p.R - p.r;
      pts.push([
        Rm * Math.cos(t) + p.d * Math.cos((Rm / p.r) * t),
        Rm * Math.sin(t) - p.d * Math.sin((Rm / p.r) * t),
      ]);
    } else {
      const Rp = p.R + p.r;
      pts.push([
        Rp * Math.cos(t) - p.d * Math.cos((Rp / p.r) * t),
        Rp * Math.sin(t) - p.d * Math.sin((Rp / p.r) * t),
      ]);
    }
  }
  return {
    polylines: fitToCanvas(
      [{ closed: p.cycles === Math.floor(p.cycles), points: pts }],
      canvas.wMm,
      canvas.hMm,
      p.marginMm,
    ),
    widthMm: canvas.wMm,
    heightMm: canvas.hMm,
  };
};
```

`computeClosurePeriod` als private Helper im selben File:

```ts
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const computeClosurePeriod = (R: number, r: number): number => {
  if (r <= 0) return 1;
  const scale = 1000;
  const ri = Math.max(1, Math.round(r * scale));
  const Ri = Math.max(1, Math.round(R * scale));
  const q = ri / gcd(Ri, ri);
  return Math.min(200, Math.max(1, Math.round(q)));
};
```

**Defaults:**

```ts
const DEFAULTS: Params = {
  variant: "hypotrochoid",
  R: 5,
  r: 3,
  d: 5,
  cycles: 1,
  samples: 400,    // per natural period q; total samples = samples * q * cycles
  marginMm: 15,
};
```

**Schema (leva):**

| Param      | min  | max  | step  |
|------------|------|------|-------|
| variant    | —    | —    | options |
| R          | 1    | 20   | 0.1   |
| r          | 0.1  | 19   | 0.1   |
| d          | 0    | 20   | 0.1   |
| cycles     | 1    | 8    | 1     |
| samples    | 100  | 2000 | 10    |
| marginMm   | 0    | 40   | 1     |

### Truchet

Datei: `src/generators/truchet.ts`

```ts
type Variant = "smith-arcs" | "diagonals";

type Params = {
  variant: Variant;
  cols: number;
  rows: number;
  arcSamples: number;
  marginMm: number;
};
```

**Tile-Größe:** Aus Canvas und Margin abgeleitet, quadratische Tiles erzwingen wir nicht (Canvas kann nicht-quadratisch sein; Tiles werden Rechtecke mit `tileW = (canvas.wMm − 2·margin) / cols`, `tileH = (canvas.hMm − 2·margin) / rows`). Smith-Arcs werden dann zu Viertelellipsen — bei nicht-quadratischen Tiles entsteht ein leichter Bogen-Stretch, was ästhetisch okay ist; alternativ kann der User durch `cols=rows` und ein quadratisches Canvas perfekte Kreise erzwingen.

**Randomness:** Über `makeRng(seed)` aus `src/util/random.ts`. Pro Tile genau ein `rng() < 0.5`-Pick für die zwei Orientierungen.

**Smith-Arcs Tile-Geometrie:**

Tile bei `(tx, ty)` mit Breite/Höhe `(w, h)`, halbe Achsen `a = w/2`, `b = h/2`. Mittelpunkte der vier Tile-Kanten: `N = (tx + a, ty)`, `E = (tx + w, ty + b)`, `S = (tx + a, ty + h)`, `W = (tx, ty + b)`.

- **Orientierung A** (`rng() < 0.5`): Viertelbogen um NW-Ecke `(tx, ty)` mit Radius `a` (in x) / `b` (in y), Winkel 0° → 90°, verbindet `E_local_N` zu `E_local_W`. Wait, let me restate: bogen um NW-Ecke `(tx, ty)` mit halbachsen `a, b` durchläuft Winkel `[0°, 90°]` → Punkte von `(tx + a, ty)` (= N) zu `(tx, ty + b)` (= W). Plus zweiter Bogen um SE-Ecke `(tx + w, ty + h)` mit denselben halbachsen, Winkel `[180°, 270°]` → Punkte von `(tx + a, ty + h)` (= S) zu `(tx + w, ty + b)` (= E).
- **Orientierung B**: Viertelbogen um NE-Ecke `(tx + w, ty)` Winkel `[90°, 180°]` → N zu E. Plus Viertelbogen um SW-Ecke `(tx, ty + h)` Winkel `[270°, 360°]` → W zu S.

Jeder Viertelbogen wird in `arcSamples + 1` Punkte gesampelt und als eigene Polylinie emittiert (`closed: false`).

**Diagonals Tile-Geometrie:**

- **Orientierung A**: eine Linie von `(tx, ty)` (NW) zu `(tx + w, ty + h)` (SE).
- **Orientierung B**: eine Linie von `(tx + w, ty)` (NE) zu `(tx, ty + h)` (SW).

Eine Polylinie mit zwei Punkten pro Tile.

**Generate:**

```ts
generate: (p, seed, canvas) => {
  const rng = makeRng(seed);
  const cols = Math.max(1, Math.floor(p.cols));
  const rows = Math.max(1, Math.floor(p.rows));
  const availW = canvas.wMm - 2 * p.marginMm;
  const availH = canvas.hMm - 2 * p.marginMm;
  const tileW = availW / cols;
  const tileH = availH / rows;
  const polylines: Polyline[] = [];

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const tx = p.marginMm + cx * tileW;
      const ty = p.marginMm + cy * tileH;
      const orientA = rng() < 0.5;
      if (p.variant === "diagonals") {
        polylines.push({
          closed: false,
          points: orientA
            ? [[tx, ty], [tx + tileW, ty + tileH]]
            : [[tx + tileW, ty], [tx, ty + tileH]],
        });
      } else {
        // smith-arcs: emit two quarter-arcs per tile
        const a = tileW / 2;
        const b = tileH / 2;
        const sampleArc = (
          cxArc: number,
          cyArc: number,
          aStart: number,
          aEnd: number,
        ): Point[] => {
          const pts: Point[] = [];
          for (let s = 0; s <= p.arcSamples; s++) {
            const t = aStart + ((aEnd - aStart) * s) / p.arcSamples;
            pts.push([cxArc + Math.cos(t) * a, cyArc + Math.sin(t) * b]);
          }
          return pts;
        };
        if (orientA) {
          polylines.push({ closed: false, points: sampleArc(tx, ty, 0, Math.PI / 2) });
          polylines.push({
            closed: false,
            points: sampleArc(tx + tileW, ty + tileH, Math.PI, (3 * Math.PI) / 2),
          });
        } else {
          polylines.push({
            closed: false,
            points: sampleArc(tx + tileW, ty, Math.PI / 2, Math.PI),
          });
          polylines.push({
            closed: false,
            points: sampleArc(tx, ty + tileH, (3 * Math.PI) / 2, Math.PI * 2),
          });
        }
      }
    }
  }
  return { polylines, widthMm: canvas.wMm, heightMm: canvas.hMm };
};
```

**Defaults:**

```ts
const DEFAULTS: Params = {
  variant: "smith-arcs",
  cols: 10,
  rows: 10,
  arcSamples: 16,
  marginMm: 15,
};
```

**Schema:**

| Param      | min  | max  | step    |
|------------|------|------|---------|
| variant    | —    | —    | options |
| cols       | 2    | 60   | 1       |
| rows       | 2    | 60   | 1       |
| arcSamples | 4    | 64   | 1       |
| marginMm   | 0    | 40   | 1       |

### Registry

Datei: `src/generators/registry.ts` — Imports anhängen und ins Array einfügen:

```ts
import { spirograph } from "./spirograph";
import { truchet } from "./truchet";

export const GENERATORS: GeneratorDef<any>[] = [
  flowField,
  harmonograph,
  rose,
  spirograph,
  superformula,
  truchet,
  attractor,
  voronoi,
  lSystem,
  differentialGrowth,
];
```

## Fehlerfälle

| Fall | Verhalten |
|------|-----------|
| Spirograph: `r = 0` | `computeClosurePeriod` gibt `1` zurück → endliche Kurve, mathematisch entartet aber kein Crash. UI verhindert via `min: 0.1`. |
| Spirograph: `R = r` (Hypo) | Mathematisch entartet zu Punkt — `R−r = 0`, Punkt mit `d`-Radius. Kein Crash, sieht ggf. langweilig aus; akzeptabel. |
| Spirograph: pathologische `R, r` (z.B. `R=π, r=e`) | `gcd`-Annäherung produziert sehr großes `q`; Cap bei 200 verhindert Performance-Crash. Kurve schließt nicht perfekt. |
| Truchet: `cols = 0` oder `rows = 0` | `Math.max(1, ...)` Clamp → mindestens 1×1 Grid. |
| Truchet: Canvas nicht quadratisch | Tiles sind Rechtecke, Smith-Arcs werden Viertelellipsen. Akzeptiert. |

## Testing

Bestehender `scripts/smoke.mjs` iteriert `GENERATORS` automatisch. Nach Hinzufügen zur Registry tauchen Spirograph und Truchet auto in der Smoke-Liste auf mit Output `> 0 lines, > 1 points`. Keine separaten Test-Skripte nötig.

**Manueller Test:**
1. `npm run dev`.
2. Spirograph wählen → Default-Output (R=5, r=3, d=5) sollte einen 5-zackigen Stern zeigen.
3. Variant auf `epitrochoid` umstellen → äußerer Look-Wechsel.
4. Truchet wählen → 10×10 Smith-Arcs.
5. Variant auf `diagonals` → Pfeil-Wald.
6. Seed-Reroll → Pattern ändert sich (nur bei Truchet, Spirograph ist deterministisch).
7. Kaleidoscope-Distortion auf Spirograph → Verstärkter Mandala-Effekt.
8. SVG-Export mit Dedupe-Toggle → bei Truchet weniger `<path>`-Elemente, da identische Tile-Kanten gemerged werden.

## Offene Punkte

Keine.
