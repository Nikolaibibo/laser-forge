# Pi AxiDraw Plot Station — Design

Date: 2026-06-24

## Goal

Plot from the Laser Forge UI to the AxiDraw A3 clone (EiBotBoard) that is now
physically connected to the **gimbal Pi (192.168.x.75)** — without a Mac in the
loop and without the manual CNC.js G-code upload dance. Any device on the LAN
opens the app and drives the plotter.

## Approach

Move the existing, proven `bridge/bridge.py` (AxiDraw control via `axicli`) onto
the Pi and have it **also serve the built app (`dist/`) from the same port**.
App + API share one origin → no mixed-content, no CORS. Reach everything at
`http://gimbal.local:4760/`.

The SVG prep (90° rotate, ×1.25 scale, model 6, inverted full-hub servo), pen
profiles, killable `/stop`, and `set-zero` stay **1:1** — zero new motion-planning
risk.

## Changes

### `bridge/bridge.py` (Linux/Pi adaptations + static serving)

- `resolve_port()`: on Linux the EBB enumerates as `/dev/ttyACM*` (fallback
  `/dev/ttyUSB*`). Keep `$AXIDRAW_PORT` as override; keep the macOS
  `/dev/cu.usbmodem*` glob so the Mac path still works.
- `free_port()`: the tomedo `CardListenerStandalone` pkill + 1 s settle is
  macOS-only. Skip on Linux (no tomedo there) so buttons stay snappy.
- `main()`: bind `0.0.0.0` (configurable `AXIDRAW_BRIDGE_HOST`), keep port 4760
  (`AXIDRAW_BRIDGE_PORT`).
- **Static files:** if `LASER_FORGE_DIST` (default `<repo>/dist`) exists, serve
  `GET /` → `index.html` and `GET /assets/*` (and other static files) from it.
  API routes (`/status`, `/plot`, …) take precedence over static.
- CORS: with same-origin serving it is unnecessary; keep the existing permissive
  handling for the Mac-dev cross-origin case (add nothing Pi-specific).

### App client (`src/plotter/axidrawBridge.ts`)

- Resolve the bridge base URL:
  `import.meta.env.VITE_BRIDGE_BASE ?? (dev ports 5173/4173 → http://127.0.0.1:4760 : same-origin "")`.
- Served from the Pi (port 4760) → base `""` → relative `fetch("/status")`.
  Mac dev (5173) → `http://127.0.0.1:4760`. No behavior change for existing use.

### Pi setup (one-time, ops via SSH)

- venv `~/.venvs/axidraw` + `pip install pyaxidraw pyserial` (axicli ships with
  pyaxidraw).
- Build the app (`vite build`) and place `dist/` on the Pi (or build on the Pi).
- Add the run user to the `dialout` group for serial access.
- Start `python bridge/bridge.py` with host `0.0.0.0`. Optional: systemd unit for
  autostart (deferred unless wanted).

## Data flow

Browser (phone/Mac) → `http://gimbal.local:4760` (app + API) → bridge `prep_svg`
→ `axicli` → EBB → AxiDraw. `/stop` kills the axicli child, raises the pen, and
de-energises motors.

## Testing

1. `GET /status` returns ok with the resolved `/dev/ttyACM*` port.
2. Pen up / down (servo moves).
3. 40 mm calibration square — measure.
4. Outline dry trace (pen stays up).
5. Full plot of a small SVG; mid-plot `/stop` raises the pen.

## Out of scope (v2)

- pyaxidraw interactive API for sub-second buttons / per-segment progress.
- GRBL pen-plotter Pi bridge (separate machine, separate effort).
- systemd autostart (only if asked).
