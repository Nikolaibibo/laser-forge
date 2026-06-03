# Plotter Control — Design Spec

**Datum:** 2026-06-02
**Status:** Design approved, Spec-Review ausstehend
**Scope:** Baustein 2 von 2 (Plotter ansteuern). Baustein 1 (Hatch-Fill-Motive) ist eine separate, spätere Spec.

## Ziel

Laser Forge generiert heute Vektor-Motive und exportiert mm-SVG. Diese Spec
ergänzt die **direkte Ansteuerung von Nikolais GRBL-Pen-Plotter aus dem Browser**
via WebSerial: aktuelles Artwork als pen-aware G-code an den Plotter streamen,
plus einfache manuelle Befehle (Stift hoch/runter, Nullpunkt setzen, Jog, Outline).

Rein für den persönlichen Gebrauch (Single-User, Chromium-Desktop). Kein Backend,
keine Auth, keine Multi-User-Belange.

### Hardware-Kontext (fix)

GRBL **0.9i**, CH340 @115200 auf `/dev/cu.usbserial-140`. Servo-Stiftlift über
Spindle-PWM: **Stift hoch = `M3 S20`, runter = `M3 S160`** — **niemals `M5`**
(de-energiert den Servo → Stift fällt + zittert). Nach jedem `M3`-Wechsel ein
kurzer Dwell (`G4`). Keine Endschalter → Nullpunkt nicht persistent, wird per
`$X` + `G92` an der aktuellen Kopfposition gesetzt. Arbeitsfläche ~165×240 mm
(A5 passt, A4 nicht). Quelle: Vault `Privat/Projekte/Stift-Plotter-GRBL-Specs.md`.

## Nicht-Ziele (YAGNI v1)

- Keine Multi-Pen-Automatik / Auto-Pause für Stiftwechsel (manueller Wechsel
  zwischen Lagen wie bisher).
- Kein Job-Speichern / keine Job-Queue.
- Keine Laser-Ansteuerung (bleibt LightBurn).
- Kein Hatch-Fill / keine neuen Generatoren (separate Spec).
- Keine Firefox/Safari-Unterstützung (WebSerial = Chromium-only, bewusst ok).

## Architektur

Neues Modul `src/plotter/`, vier fokussierte Dateien + ein UI-Panel. Klare
Schichtung: Transport → GRBL-Semantik → Job-Streaming, UI darüber.

### `src/plotter/webserial.ts` — Transport

Kapselt die WebSerial-Verbindung. Hält den Port **offen, solange der Tab lebt**
(genau das löst das DTR-Reset-Problem: Reset nur einmal beim Connect).

Interface (konzeptionell):
```ts
type GrblStatus = { state: 'Idle'|'Run'|'Hold'|'Alarm'|'Unknown'; mpos: [number,number] }
interface PlotterPort {
  connect(): Promise<void>            // navigator.serial.requestPort() + open @115200
  disconnect(): Promise<void>
  send(line: string): Promise<string> // schreibt "line\r\n", wartet auf ok/error/ALARM
  onStatus(cb: (s: GrblStatus) => void): void
  onDisconnect(cb: () => void): void
  readonly connected: boolean
}
```
- Open mit `{ baudRate: 115200 }`. Nach Open ~1,5 s warten + Banner lesen.
- **Write-Queue:** serialisiert; eine Zeile gleichzeitig „in flight", nächste erst
  nach `ok`/`error` (= GRBL hat sie in den Planner-Buffer angenommen → Motion läuft
  kontinuierlich weiter, kein Stillstand am Strich-Ende). Spiegelt das bewährte
  „buffered streaming" des Python-Daemons.
- Read-Loop liest `port.readable`, splittet an `\n`, klassifiziert `ok` / `error` /
  `ALARM` / `<...>`-Statusframes. Resolved die jeweils offene `send()`-Promise.
- `disconnect`-Event von `navigator.serial` → `onDisconnect` feuern.

### `src/plotter/grbl.ts` — GRBL-Semantik

Pure Helfer, die `PlotterPort.send()` benutzen. Pen-Konstanten zentral:
```ts
const PEN = { up: 'M3 S20', down: 'M3 S160', dwellUp: 0.15, dwellDown: 0.1 }
unlock()                 // $X
status()                 // ? → GrblStatus
setOrigin()              // G90; G92 X0 Y0
penUp() / penDown()      // M3 S.. + G4 P<dwell>
jog(dx, dy, feed)        // G91; G0 X.. Y..; G90  (0.9i kann kein $J)
park()                   // M3 S20; G0 X0 Y0
```

### `src/plotter/gcode.ts` — Artwork → GRBL (pure, testbar)

Konvertiert ein `Artwork` (Polylinien in mm, `{points, closed}`) in GRBL-Zeilen.
Reine Funktion, kein Hardware-Bezug → unter `scripts/` testbar.
```ts
artworkToGcode(art: Artwork, opts: { feed, penUp, penDown, dwellUp, dwellDown }): string[]
```
- Pro Polylinie: `penUp` → `G0` zum Startpunkt → `penDown` + `G4 dwellDown` →
  `G1` durch alle Punkte mit `F<feed>` → (closed: zurück zum Startpunkt) → `penUp`.
- **Nearest-Neighbor-Sortierung** der Polylinien (Travel minimieren, wie vpype
  linesort). Existierende Polyline-Ops in `src/util/path.ts` wiederverwenden wo möglich.
- Header: `G21`, `G90`, `penUp`. Footer: `penUp`, `G0 X0 Y0`.
- **Kein** `G92` im Job (Origin wird separat über die UI gesetzt → Job startet vom
  bestehenden Nullpunkt; ermöglicht Outline→Plot in gleichen Koordinaten).
- `bbox(art)` → separater `outlineGcode(bbox)` (Rechteck zum Positionieren).

### `src/plotter/streamJob.ts` — Job-Streamer

```ts
streamJob(port, lines, { onProgress, signal }): Promise<void>
```
- Schickt Zeilen sequmuell über `port.send()` (Write-Queue regelt Backpressure
  über GRBLs `ok`).
- `onProgress(done, total)` für die UI.
- `AbortSignal` → Stop: laufende Queue leeren, `penUp` senden, Promise rejecten.
- `ALARM` in einer Antwort → Job abbrechen, Fehler hochreichen.

### UI — Plotter-Panel (`src/ui/`)

Ein Panel in der bestehenden Sidebar, passend zum Leva/Sidebar-Stil:
- **Connect / Disconnect** (Connect hinter User-Klick — WebSerial-Anforderung).
- **Status-Badge:** Idle / Run / Hold / Alarm / Disconnected.
- **Manuelle Befehle:** Stift ↑ / Stift ↓ · Jog-Pad (X± / Y±, Schrittweite-Select
  1/5/10 mm) · „Nullpunkt hier" (`G92`).
- **Job:** „Outline" (Bbox-Rechteck) · „Plotten" (aktuelles Artwork) mit
  Fortschrittsbalken · „Stop".
- **Settings:** Feed-Eingabe (Default 4500 mm/min). Stift-S-Werte fix aus der
  Vault-Doku (S20/S160) — kein UI-Regler in v1.
- Buttons, die Bewegung auslösen, sind nur bei `connected && !Alarm` aktiv.

### State (`src/state/`)

Zustand-Store um `plotter`-Slice erweitern: `connected`, `status`, `jobProgress`,
`port`-Referenz (nicht im URL-Hash persistiert — Verbindung ist Session-lokal).

## Phase 0 — WebSerial-Spike (zuerst, de-risking)

Bevor irgendwas Großes gebaut wird: kleinster Beweis, dass Browser↔GRBL via CH340
funktioniert. Minimal-Panel oder temporäre Route mit:
1. „Connect" → `navigator.serial.requestPort()` + open @115200 + Banner lesen.
2. `$X` senden, Antwort roh anzeigen.
3. Buttons: Stift hoch (`M3 S20`), runter (`M3 S160`), Jog +10/−10 mm (X & Y).
4. Rohe GRBL-Antworten in einem Log-Bereich.

**Akzeptanz:** Stift hebt/senkt physisch, Kopf fährt ±10 mm in erwartete Richtung,
keine Exceptions. → grün: Rest bauen. Rot: WebSerial-Befund dokumentieren, auf
lokale Bridge (Python-Daemon + WebSocket) als Plan B schwenken — `gcode.ts`
bleibt davon unberührt wiederverwendbar.

## Datenfluss

```
Generator/Pipeline (existiert) → Artwork (Polylinien mm)
        │
        ├─ gcode.ts  → G-code-Zeilen ─┐
        │                              │
   UI „Plotten" ──────────────────────┤
        │                              ▼
   UI Stift/Jog/Origin ──→ grbl.ts → webserial.ts (Write-Queue) → GRBL → Plotter
                                          ▲
                              streamJob.ts (Job + Progress + Stop)
```

## Fehler / Edge Cases

- **USB-Abriss mitten im Job:** `navigator.serial` `disconnect`-Event → Job
  abbrechen, Status „Disconnected", UI-Hinweis. (Sauberer als der Python-Crash:
  kein Servo-Drop ins Leere, weil JS das Event sieht.)
- **GRBL Alarm:** Antwort enthält `ALARM` → Job stoppen, Badge rot, Hinweis „`$X`
  zum Entsperren".
- **Connect ohne Port-Auswahl / abgelehnt:** Promise rejectet → freundlicher Hinweis.
- **Plotten ohne Connect:** Button disabled.
- **Kein WebSerial im Browser** (`!navigator.serial`): Panel zeigt Hinweis
  „Chrome/Edge nötig" statt Connect-Button.
- **Doppelter Connect:** idempotent — wenn schon verbunden, no-op.

## Testing

Projekt-Konvention: keine Test-Frameworks, Node-Scripts unter `scripts/`,
ausgeführt mit `npx tsx`. WebSerial selbst ist nicht headless testbar (braucht
Hardware/Browser) → der **Spike ist der manuelle Test** der Transport-Schicht.

Pure Funktionen werden scriptbar getestet:
- `scripts/gcode-test.mjs`: Beispiel-Artworks → `artworkToGcode`. Assertions:
  jede Polylinie hat penUp→G0→penDown→G4→G1-Sequenz, **kein `M5`**, Header/Footer
  korrekt, NN-Sortierung reduziert Gesamt-Travel ggü. unsortiert, closed-Pfade
  schließen.
- `scripts/outline-test.mjs`: `outlineGcode` zeichnet das korrekte Bbox-Rechteck.
- `npm run typecheck` muss grün bleiben.

## Reihenfolge der Umsetzung

1. **Spike** (Phase 0) — manuell verifizieren.
2. `gcode.ts` + Tests (pure, unabhängig vom Spike — kann parallel).
3. `webserial.ts` + `grbl.ts` (aus dem Spike herausgewachsen, gehärtet).
4. `streamJob.ts`.
5. Plotter-Panel + State-Slice.
6. End-to-end: Motiv generieren → Outline → Plotten am echten Gerät.

## Offene Punkte

Keine offenen Design-Fragen. Pen-Konstanten und Arbeitsfläche sind aus der
Vault-Doku fixiert; Feed-Default startet bei 4500 mm/min (UI-überschreibbar).
