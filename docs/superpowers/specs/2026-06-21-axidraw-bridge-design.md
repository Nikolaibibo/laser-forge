# Design: Laser Forge ↔ AxiDraw über lokale pyaxidraw-Bridge

**Datum:** 2026-06-21
**Status:** Design genehmigt — Implementierung im nächsten Kontextfenster

## Ziel

Laser Forge soll den **AxiDraw-A3-Klon** (EiBotBoard) direkt aus dem Browser bedienen können — mit den generierten Grafiken, mit Basis-Funktionen (Outline, Stift, Positionieren, Plot, Stop) und in **bester Bewegungsqualität**.

## Kernentscheidung: Bridge statt Neuimplementierung

Der riskante Teil einer Browser-Lösung wäre, die **EBB-Bewegungslogik + CoreXY-Mischung + Beschleunigungs-Planung im Browser neu zu bauen** — genau das, was `axicli`/`pyaxidraw` bereits perfekt erledigt. Stattdessen:

**Eine lokale Python-Bridge importiert `pyaxidraw` direkt und stellt eine HTTP-API bereit. Laser Forge bekommt ein vollwertiges AxiDraw-Panel, dessen Buttons den lokalen Server aufrufen.**

Damit:
- Ein-Klick-UI im Browser ✅
- Volle Beschleunigungs-Planung (Bleistift-Dynamik) ✅ — geschenkt über `pyaxidraw`
- Alle in der Nacht 20.06.2026 erkämpften Korrekturen ✅ — bereits in der Engine
- **Motion-/CoreXY-Risiko: null** (bewährte Engine wird wiederverwendet, nicht nachgebaut)

## Hintergrund: die Maschine (siehe Vault `Privat/Projekte/Plotter/`)

AliExpress-A3-Klon, EiBotBoard FW 2.8.1, **CoreXY/H-Bot**, kein Homing. Kritische, bereits verifizierte Eigenheiten:
- **Achsen vertauscht (H-Bot):** EBB-X = kurze/senkrechte Achse, EBB-Y = lange/waagerechte. → Lösung per **90°-Rotation jedes SVG** (`translate(H,0) rotate(90)`).
- **Maßstab ×1,25** (16-Zahn- statt 20-Zahn-Pulley) → effektiv **100 steps/mm** (= 80 × 1,25).
- **Servo invertiert + voller Hub:** `pen_pos_up=0 / pen_pos_down=100`.
- **Home = vordere-linke Ecke.**
- **Modell 6 (SE/A2)** lifted den Y-Cap → Rahmen ist die Grenze (~340 mm), füllt A4-quer. (Servo-kompatibel verifiziert.)
- **Pen-Delays/Speed** je nach Stift (Bleistift vs. Filzstift).
- **tomedo `CardListenerStandalone`** greift den seriellen Port → muss vorher gekillt werden.

Referenz-Implementierung dieser Korrekturen: `~/.venvs/axidraw/plot.sh` (CLI-Wrapper, bleibt als Fallback).

## Architektur

### A) Bridge-Server — `bridge.py`
- **Ort:** im laser-forge-Repo unter `bridge/` (oder `~/.venvs/axidraw/`), läuft in der venv `~/.venvs/axidraw`.
- **Stack:** Python stdlib `http.server` (keine Extra-Deps), importiert `pyaxidraw`.
- **API (nur `127.0.0.1`):**
  | Methode | Endpunkt | Zweck |
  |---|---|---|
  | GET | `/status` | verbunden?, Position, Pen-State, Profil |
  | POST | `/pen-up` / `/pen-down` | Servo-Test |
  | POST | `/set-zero` | aktuelle Position = 0,0 (EBB `CS`) |
  | POST | `/align` | Motoren stromlos (`disable_xy`) |
  | POST | `/home` | zurück auf 0,0 |
  | POST | `/outline` | SVG-Body → Dry-Bounding-Box (Pen oben, interaktive `moveto`) |
  | POST | `/plot` | SVG-Body → voller Plot (`plot_run`) |
  | POST | `/stop` | Abbruch → Pen up + Motoren aus |
- **pyaxidraw-Nutzung:** interaktive API (`interactive/connect/penup/pendown/moveto/disable_xy`) für Buttons + Outline; `plot_setup(svg)` + `plot_run()` für den vollen Plot. Server serialisiert (ein Vorgang gleichzeitig); managed Connect/Disconnect-Übergang zwischen interactive und plot.
- **Korrekturen (SSoT hier):** vor `plot_run` SVG-Prep (90°-Rotation + ×1,25 wie in `plot.sh`); `ad.options`: `model=6`, `pen_pos_up=0`, `pen_pos_down=100`, `auto_rotate=False`, Speeds/Delays je Profil.
- **Pen-Profile:** `pencil` (schneller, kurzer Delay) / `felt` (langsamer, gegen Abreißen). Als Param an `/plot` + `/outline`.
- **CardListener:** Server killt `CardListenerStandalone` beim Connect.
- **CORS:** erlaubt Origin `http://localhost:5173` (vite dev) + `http://localhost:4173` (preview).

### B) `src/plotter/axidrawBridge.ts`
Typisierter `fetch`-Client (spiegelt die Rolle von `grbl.ts`, nur über HTTP): `status()`, `penUp()`, `penDown()`, `setZero()`, `align()`, `home()`, `outline(svg, profile)`, `plot(svg, profile, onProgress)`, `stop()`. Fehler/Server-nicht-erreichbar sauber surfacen.

### C) `src/ui/AxiDrawPanel.tsx`
Panel analog `PlotterPanel`:
- Server-/Verbindungs-Status (läuft die Bridge? EBB verbunden?).
- Buttons: Pen Up/Down, Set 0,0, Motors Off, Home, **Dry Outline**, **Plot** (+ Fortschrittsbalken), **Stop**.
- **Pen-Profil-Wahl** (Bleistift/Filzstift) + Speed-Regler.
- **Reichweiten-Warnung**, wenn Artwork die nutzbare Fläche überschreitet.
- Schickt das aktuelle Artwork via vorhandenem `svgExport` (mit dedupe/join) an `/outline` bzw. `/plot`.

### D) Wiring
Umschalter GRBL ↔ AxiDraw in `App.tsx` (beide Maschinen koexistieren). Optional launchd-Plist fürs `bridge.py` (Autostart, wie Nightly-Sync).

## Datenfluss
```
Artwork (Store) → svgExport() [existiert] → POST /plot
   → Bridge: SVG-Prep (90°-Rotation + ×1,25) → pyaxidraw plot_run → EBB
```

## Wiederverwendung aus bestehendem Code
- `src/render/svgExport.ts` — erzeugt schon kompatibles mm-SVG (unverändert nutzbar).
- `src/plotter/gcode.ts` — `bbox()` (für Outline-Payload), `orderPolylines` (Konzept; pyaxidraw ordnet selbst).
- `src/plotter/streamJob.ts`-Muster — Abort/Progress-Denke fürs Panel.
- `src/ui/PlotterPanel.tsx` — UI-Vorlage.

## Scope / Nicht-Ziele
**Drin (v1):** Bridge-Server, fetch-Client, AxiDraw-Panel, alle Basis-Funktionen, Pen-Profile, volle Beschleunigung (über pyaxidraw), Reichweiten-Warnung, optionaler Autostart.
**Raus (YAGNI / v2):** Motion-Neuimplementierung im Browser, Multi-Pen/Layer-Farbwechsel mit Stiftwechsel-Pausen, Remote/HTTPS-Zugriff, in-Browser-Beschleunigungsplaner.
**Bleibt:** `~/.venvs/axidraw/plot.sh` als CLI-Fallback.

## Risiken & Mitigationen
- **Mixed-Content** (HTTPS-Firebase → HTTP-localhost blockiert): Plotten läuft aus der **lokalen Instanz** (`npm run dev`). War bei WebSerial genauso nötig. Klar dokumentieren.
- **pyaxidraw interactive ↔ plot Port-Übergabe:** Server serialisiert, managed connect/disconnect sauber, nur ein Vorgang gleichzeitig.
- **CoreXY-Korrektheit:** durch Wiederverwendung der bewährten Engine + plot.sh-Prep eliminiert. Erst-Verifikation übers Kalibrier-Quadrat im Panel.
- **CardListener-Port-Grab:** Bridge killt ihn beim Connect.

## Tests
- **Bridge:** SVG-Prep (Rotation/Skalierung) als reine Funktion → Python-Unit-Test (40-mm-Quadrat → erwartete Maße). Endpoint-Smoke-Tests (Mock-AxiDraw).
- **Laser Forge:** `axidrawBridge.ts` + Panel-Logik mit gemocktem `fetch`.
- **Hardware:** Kalibrier-Quadrat (40 mm) übers Panel → nachmessen.

## Offene Implementierungs-Details (im nächsten Schritt zu klären)
- Genaue `pyaxidraw`-interactive-Methoden für `set-zero` (ggf. `ad.usb_command("CS\r")`) und `align`.
- SVG-Prep in Python portieren (1:1 aus `plot.sh` `prep_svg`).
- Fortschritts-Reporting aus `plot_run` (ggf. Segment-Zählung oder grobe Phasen).
- launchd-Plist (optional).
