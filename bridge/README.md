# AxiDraw bridge

Local HTTP bridge that lets Laser Forge drive the AxiDraw A3 clone (EiBotBoard)
from the browser. It mirrors `~/.venvs/axidraw/plot.sh` 1:1 (model 6, inverted
full-hub servo, ×1.25 scale, 90° axis-swap rotation, CardListener kill) by
shelling out to `axicli` — the proven path, so zero motion-planning risk.

## Run

```bash
~/.venvs/axidraw/bin/python bridge/bridge.py
# or:  source ~/.venvs/axidraw/bin/activate && python bridge/bridge.py
```

Then open Laser Forge from the **local** dev/preview instance (not the Firebase
URL — HTTPS→HTTP-localhost is blocked, same constraint WebSerial had):

```bash
npm run dev      # http://localhost:5173
```

In the app, pick the **AxiDraw** tab in the machine dock (bottom of the canvas).

## Env

| Var | Default | Meaning |
|-----|---------|---------|
| `AXIDRAW_PORT` | auto-detect | serial port of the EBB. If unset/absent, the bridge picks the first `/dev/cu.usbmodem*` (the EBB enumerates under different names per USB port). |
| `AXIDRAW_BRIDGE_PORT` | `4760` | HTTP port the bridge listens on |

## Endpoints (127.0.0.1 only)

`GET /status` · `POST /pen-up` `/pen-down` `/set-zero` `/align` `/home`
`/outline` (SVG body) `/plot` (SVG body) `/stop`. Query params:
`?profile=pencil|felt` · `?speed=<1-100>` `?accel=<1-100>` (override profile;
lower = cleaner fine detail) · `?delay_down=<0-1000>` `?delay_up=<0-1000>` (pen
settle, ms: dwell after lowering before drawing / after raising before moving;
override profile) · `/outline?dry=1` (default, pen-up trace) or `?dry=0` (draws the frame).

## Tests

```bash
~/.venvs/axidraw/bin/python bridge/test_prep_svg.py   # SVG prep (rotation/scale)
npx tsx scripts/axidraw-bridge-test.ts                # TS client, mocked fetch
```

Hardware check: plot the 40 mm calibration square (`~/.venvs/axidraw/cal40.svg`
geometry) via the panel and measure.

## Notes / v2

- **Outline** supports both a **dry** pen-up trace (default — `pen_pos_down`
  forced to 0 so the servo never drops) and a drawn frame (`?dry=0`), both over
  the proven `axicli`+`prep_svg` path, so geometry matches the real plot exactly.
- Snappier (sub-second) interactive buttons would need the pyaxidraw
  *interactive* API + the CoreXY coordinate transform — still v2.
- Progress during `/plot` is coarse (running → done); a per-segment bar is v2.
- Optional launchd autostart plist (like the MARVIN nightly-sync) — not built.
