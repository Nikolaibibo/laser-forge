#!/usr/bin/env python3
"""Laser Forge ↔ AxiDraw bridge.

A tiny localhost HTTP server that drives the AliExpress A3 AxiDraw clone
(EiBotBoard) using the *proven* `axicli` CLI + raw serial, mirroring the
calibrated values from ``~/.venvs/axidraw/plot.sh`` 1:1.

Why subprocess instead of the pyaxidraw *interactive* Python API: the CLI path
is exactly what plot.sh already verified on this CoreXY clone (axis swap via
90° SVG rotation, ×1.25 scale, model 6, inverted full-hub servo). It carries
zero motion-planning risk and gives a cleanly killable /stop. The
pyaxidraw-interactive route (snappier buttons, true pen-up dry outline) is a
documented v2.

Run inside the venv that has pyaxidraw + pyserial:

    ~/.venvs/axidraw/bin/python bridge/bridge.py
    # or: source ~/.venvs/axidraw/bin/activate && python bridge/bridge.py

Endpoints (POST unless noted), all on 127.0.0.1 only:
    GET  /status                bridge alive? plotting? profile/port
    POST /pen-up  /pen-down     servo test
    POST /set-zero              current position = 0,0 (EBB "CS")
    POST /align                 motors de-energised (set head by hand)
    POST /home                  walk back to 0,0
    POST /outline  (SVG body)   plot a frame (the client sends a bbox rect)
    POST /plot     (SVG body)   full plot, killable
    POST /stop                  abort plot -> raise pen + motors off

Query/body param ``profile`` = "pencil" (default) | "felt".
"""

from __future__ import annotations

import glob
import json
import mimetypes
import os
import posixpath
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ---------------------------------------------------------------------------
# Calibration — SSoT mirrored from ~/.venvs/axidraw/plot.sh (do not drift).
# ---------------------------------------------------------------------------
VENV = os.path.expanduser("~/.venvs/axidraw")
AXICLI = os.path.join(VENV, "bin", "axicli")
# Built app to serve (so the Pi station is self-contained: app + API on one port,
# same origin → no mixed-content / CORS). Default: <repo>/dist next to bridge/.
STATIC_DIR = os.environ.get(
    "LASER_FORGE_DIST",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist"),
)
# The EBB enumerates under different /dev/cu.usbmodem* names per USB port, so
# resolve dynamically: prefer $AXIDRAW_PORT, else the first usbmodem device.
PORT_PREF = os.environ.get("AXIDRAW_PORT", "/dev/cu.usbmodem11101")
SCALE = 1.25  # 16T vs 20T pulley correction (= 20/16)


def resolve_port() -> str:
    if os.path.exists(PORT_PREF):
        return PORT_PREF
    # macOS: /dev/cu.usbmodem* · Linux/Pi: the EBB enumerates as /dev/ttyACM*
    # (USB CDC ACM), occasionally /dev/ttyUSB*.
    for pat in ("/dev/cu.usbmodem*", "/dev/ttyACM*", "/dev/ttyUSB*"):
        cands = sorted(glob.glob(pat))
        if cands:
            return cands[0]
    return PORT_PREF


def tty_of(port: str) -> str:
    # CardListener grabs the /dev/tty. variant of the same device.
    return port.replace("/dev/cu.", "/dev/tty.")


# Model 6 (SE/A2): high Y-cap so the frame (~340 mm) is the limit, fills A4-landscape.
def common() -> list[str]:
    return ["--model", "6", "--port", resolve_port()]

# Inverted servo + full hub are mandatory on this clone. pen_pos_down is added
# per-call (pen_flags) so a "dry" outline can force it == up (servo never drops).
PEN_BASE = ["--pen_pos_up", "0", "--no_rotate"]
PROFILES = {
    # plot.sh defaults — fast, short delays (pencil/fineliner)
    "pencil": [
        "--speed_pendown", "65", "--speed_penup", "120", "--accel", "50",
        "--pen_delay_down", "60", "--pen_delay_up", "100", "--pen_rate_lower", "55",
    ],
    # felt-tip — slower, longer settle so wet ink doesn't tear / skip
    "felt": [
        "--speed_pendown", "40", "--speed_penup", "110", "--accel", "40",
        "--pen_delay_down", "120", "--pen_delay_up", "120", "--pen_rate_lower", "40",
    ],
    # white gel fineliner on thick black card — wet ink that needs flow time and
    # a gentle landing: slow draw (even coverage / opacity, no skipping), long
    # pen_delay_down so ink starts before the carriage moves (no missing line
    # starts), slow pen_rate_lower so the tip doesn't slam the raised card.
    # Pen-down PRESSURE on thick stock is set by the clamp height, not here —
    # the full hub (pen_pos_down=100) stays mandatory on this clone.
    "gel": [
        "--speed_pendown", "22", "--speed_penup", "110", "--accel", "30",
        "--pen_delay_down", "200", "--pen_delay_up", "150", "--pen_rate_lower", "30",
    ],
}


def _set_flag(flags: list[str], name: str, value) -> list[str]:
    """Set/replace a `--flag value` pair in place (no duplicate args)."""
    flags = list(flags)
    if name in flags:
        flags[flags.index(name) + 1] = str(value)
    else:
        flags += [name, str(value)]
    return flags


def pen_flags(
    profile: str, dry: bool = False, speed: int | None = None, accel: int | None = None,
    delay_down: int | None = None, delay_up: int | None = None,
) -> list[str]:
    """Pen CLI flags for a profile.
    - dry=True forces pen_pos_down == up (0) so the servo never lowers (dry trace).
    - speed overrides --speed_pendown (% of max); accel overrides --accel.
      Lower both for cleaner fine detail (small text, tight curves).
    - delay_down/delay_up override --pen_delay_down/--pen_delay_up (ms): how long
      the tip settles after lowering (before drawing) / after raising (before the
      next move). Longer down-delay = ink starts before motion (no missing line
      starts); longer up-delay = tip fully clears before travel (no smearing)."""
    flags = PEN_BASE + PROFILES.get(profile, PROFILES["pencil"])
    flags = _set_flag(flags, "--pen_pos_down", "0" if dry else "100")
    if speed is not None:
        flags = _set_flag(flags, "--speed_pendown", max(1, min(100, int(speed))))
    if accel is not None:
        flags = _set_flag(flags, "--accel", max(1, min(100, int(accel))))
    if delay_down is not None:
        flags = _set_flag(flags, "--pen_delay_down", max(0, min(1000, int(delay_down))))
    if delay_up is not None:
        flags = _set_flag(flags, "--pen_delay_up", max(0, min(1000, int(delay_up))))
    return flags

ALLOWED_ORIGINS = {
    "http://localhost:5173", "http://127.0.0.1:5173",  # vite dev
    "http://localhost:4173", "http://127.0.0.1:4173",  # vite preview
}

# ---------------------------------------------------------------------------
# SVG prep — ported 1:1 from plot.sh prep_svg.
# Authored SVG = normal landscape (0,0 top-left, x right, y down).
# Output = rotated 90° + translated so it plots upright on the machine
# (home = front-left corner, +X = away, +Y = right), and scaled ×SCALE.
# ---------------------------------------------------------------------------
def prep_svg(raw: str, scale: float = SCALE) -> str:
    # Convert any SVG length unit to mm. A bare number is CSS px per the SVG
    # spec (96 px = 1 in). Without this, a cm-authored file (e.g. the Caliber
    # movement SVGs, or vpype's default cm output) would plot 10× too small.
    UNIT_MM = {"mm": 1.0, "cm": 10.0, "in": 25.4, "px": 25.4 / 96.0}

    def getnum(attr: str):
        m = re.search(rf'{attr}\s*=\s*"([\d.]+)\s*(mm|cm|in|px)?"', raw)
        if not m:
            return None
        return float(m.group(1)) * UNIT_MM[m.group(2) or "px"]

    W, H = getnum("width"), getnum("height")
    vb = re.search(r'viewBox\s*=\s*"([-\d.\s]+)"', raw)
    if vb:
        parts = vb.group(1).split()
        vbw, vbh = float(parts[2]), float(parts[3])
    else:
        vbw, vbh = (W, H)
    if W is None:
        W = vbw
    if H is None:
        H = vbh
    sx, sy = W / vbw, H / vbh  # viewBox units -> mm

    root_open = raw[raw.index("<svg"): raw.index(">", raw.index("<svg"))]
    inner = raw[raw.index(">", raw.index("<svg")) + 1: raw.rindex("</svg>")]
    # Drop <metadata> — vpype/Inkscape emit an rdf:/cc:/dc: block there.
    inner = re.sub(r"<metadata\b.*?</metadata>", "", inner, flags=re.DOTALL)
    # Carry over every xmlns:* prefix the source declared (inkscape:, sodipodi:,
    # xlink:, …) so the geometry's prefixed attributes resolve under our minimal
    # wrapper <svg> instead of tripping lxml's "undefined prefix" error.
    ns = " ".join(re.findall(r'xmlns:[\w.-]+="[^"]*"', root_open))
    g = (
        f'<g transform="translate({H},0) rotate(90) scale({sx},{sy})" '
        f'fill="none" stroke="black" stroke-width="0.3" '
        f'stroke-linecap="round" stroke-linejoin="round">'
    )
    ow, oh = H * scale, W * scale  # rotated output canvas, scaled
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" {ns} width="{ow:.4f}mm" '
        f'height="{oh:.4f}mm" viewBox="0 0 {H} {W}">\n{g}\n{inner}\n</g>\n</svg>'
    )


# ---------------------------------------------------------------------------
# Process / port management. One motion op at a time (LOCK); /stop bypasses it.
# ---------------------------------------------------------------------------
LOCK = threading.Lock()
PLOT_PROC: "subprocess.Popen | None" = None


def free_port() -> None:
    """tomedo's CardListenerStandalone grabs the serial port — kill it.

    Unconditional pkill: lsof frequently can't see the holder (no perms, or it
    grabs the /dev/tty.* twin of the /dev/cu.* device), so gating the kill on
    detecting it first silently skipped it and left the port held. pkill is a
    cheap no-op when the process isn't running. The settle wait lets the port
    release before axicli connects; axicli then holds it for the whole plot, so
    a tomedo respawn can't re-grab mid-plot.

    No-op on Linux (the Pi has no tomedo/CardListener) — skipping it keeps the
    interactive buttons snappy (no 1 s settle per call)."""
    if sys.platform != "darwin":
        return
    try:
        subprocess.run(["pkill", "-f", "CardListenerStandalone"], timeout=5)
        threading.Event().wait(1.0)
    except Exception:
        pass  # pkill missing or nothing to kill — non-fatal


def run_axicli(args: list[str], timeout: int = 120) -> tuple[bool, str]:
    """Blocking axicli call. Returns (ok, combined output)."""
    free_port()
    try:
        r = subprocess.run(
            [AXICLI, *args], capture_output=True, text=True, timeout=timeout
        )
        ok = r.returncode == 0
        return ok, (r.stdout + r.stderr).strip()
    except subprocess.TimeoutExpired:
        return False, "axicli timed out"
    except FileNotFoundError:
        return False, f"axicli not found at {AXICLI}"
    except Exception as e:  # noqa: BLE001
        return False, str(e)


def set_zero() -> tuple[bool, str]:
    """Set current position as 0,0 via the EBB 'CS' (Clear Step) command.

    The naive version sent 'CS\\r' right after opening the port and read a line.
    The EBB then reported `Unknown command` because stale bytes (left in the OS
    buffer by the CardListener port-grab / USB enumeration) were prepended to our
    command, and readline() waited for a '\\n' the EBB may not send. We now flush
    both buffers after opening, write CS, and read whatever comes back, treating
    an explicit 'OK' (or a clean empty reply) as success and anything containing
    'Err'/'Unknown' as failure — so a botched zero no longer reports success."""
    free_port()
    try:
        import serial  # pyserial, in the venv alongside pyaxidraw

        s = serial.Serial(resolve_port(), 9600, timeout=2)
        try:
            threading.Event().wait(0.3)
            s.reset_input_buffer()
            s.reset_output_buffer()
            s.write(b"CS\r")
            s.flush()
            threading.Event().wait(0.3)
            raw = s.read(s.in_waiting or 32)
        finally:
            s.close()
        resp = raw.decode(errors="replace").strip()
        bad = ("err" in resp.lower()) or ("unknown" in resp.lower())
        ok = not bad  # EBB replies "OK"; a clean empty read is also acceptable
        return ok, (f"0,0 set: {resp}" if ok else f"CS rejected by EBB: {resp}")
    except Exception as e:  # noqa: BLE001
        return False, str(e)


def plot_svg(
    raw_svg: str, profile: str, dry: bool = False,
    speed: int | None = None, accel: int | None = None,
    delay_down: int | None = None, delay_up: int | None = None,
) -> tuple[bool, str]:
    """Prep + plot an SVG via a killable axicli subprocess. dry=True traces with
    the pen held up (dry outline). speed/accel/delay_* override profile defaults."""
    global PLOT_PROC
    pen = pen_flags(profile, dry, speed, accel, delay_down, delay_up)
    prepped = prep_svg(raw_svg)
    tmp = tempfile.NamedTemporaryFile(
        mode="w", suffix=".svg", prefix="laserforge_", delete=False
    )
    tmp.write(prepped)
    tmp.close()
    free_port()
    try:
        proc = subprocess.Popen(
            [AXICLI, tmp.name, *common(), *pen],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
    except FileNotFoundError:
        os.unlink(tmp.name)
        return False, f"axicli not found at {AXICLI}"
    PLOT_PROC = proc
    out, _ = proc.communicate()
    rc = proc.returncode
    PLOT_PROC = None
    try:
        os.unlink(tmp.name)
    except OSError:
        pass
    if rc == 0:
        return True, (out or "").strip()
    if rc and rc < 0:  # killed by signal (e.g. /stop)
        return False, "stopped"
    return False, (out or f"axicli exited {rc}").strip()


def stop_plot() -> tuple[bool, str]:
    """Kill a running plot, then leave the machine safe (pen up + motors off)."""
    global PLOT_PROC
    proc = PLOT_PROC
    if proc and proc.poll() is None:
        try:
            proc.send_signal(signal.SIGINT)
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
        except Exception:  # noqa: BLE001
            pass
    # Best-effort: raise pen + de-energise so the head is safe.
    run_axicli(["--mode", "manual", "--manual_cmd", "raise_pen", *common(), *pen_flags("pencil")], timeout=30)
    run_axicli(["--mode", "align", *common(), *pen_flags("pencil")], timeout=30)
    return True, "stopped"


# ---------------------------------------------------------------------------
# HTTP layer
# ---------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # quieter logs
        sys.stderr.write("[bridge] " + (fmt % args) + "\n")

    # --- helpers -----------------------------------------------------------
    def _cors(self):
        origin = self.headers.get("Origin", "")
        allow = origin if origin in ALLOWED_ORIGINS else "http://localhost:5173"
        self.send_header("Access-Control-Allow-Origin", allow)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code: int, payload: dict):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> str:
        n = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(n).decode("utf-8") if n else ""

    def _profile(self) -> str:
        m = re.search(r"[?&]profile=(\w+)", self.path)
        return m.group(1) if m else "pencil"

    def _intparam(self, name: str):
        m = re.search(rf"[?&]{name}=(\d+)", self.path)
        return int(m.group(1)) if m else None

    # --- routes ------------------------------------------------------------
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/status":
            self._json(200, {
                "ok": True,
                "plotting": PLOT_PROC is not None and PLOT_PROC.poll() is None,
                "port": resolve_port(),
                "model": 6,
                "scale": SCALE,
                "profiles": list(PROFILES.keys()),
            })
        elif os.path.isdir(STATIC_DIR):
            self._serve_static(path)
        else:
            self._json(404, {"ok": False, "error": "not found"})

    def _serve_static(self, url_path: str):
        """Serve the built app from STATIC_DIR. SPA: unknown paths fall back to
        index.html. Path is sanitised to stay inside STATIC_DIR (no traversal)."""
        rel = posixpath.normpath(url_path.lstrip("/"))
        if rel in ("", ".") or rel.endswith("/"):
            rel = "index.html"
        target = os.path.join(STATIC_DIR, *rel.split("/"))
        if not os.path.abspath(target).startswith(os.path.abspath(STATIC_DIR)) or not os.path.isfile(target):
            target = os.path.join(STATIC_DIR, "index.html")  # SPA fallback
        if not os.path.isfile(target):
            self._json(404, {"ok": False, "error": "not found"})
            return
        ctype = mimetypes.guess_type(target)[0] or "application/octet-stream"
        with open(target, "rb") as fh:
            data = fh.read()
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        path = self.path.split("?")[0]
        profile = self._profile()

        # /stop must work concurrently with a blocked /plot — no LOCK.
        if path == "/stop":
            ok, msg = stop_plot()
            self._json(200 if ok else 500, {"ok": ok, "message": msg})
            return

        body = self._body()

        def guarded(fn):
            if not LOCK.acquire(blocking=False):
                self._json(409, {"ok": False, "error": "busy — another operation is running"})
                return
            try:
                ok, msg = fn()
                self._json(200 if ok else 500, {"ok": ok, "message": msg})
            finally:
                LOCK.release()

        if path == "/pen-up":
            guarded(lambda: run_axicli(["--mode", "manual", "--manual_cmd", "raise_pen", *common(), *pen_flags(profile)], timeout=30))
        elif path == "/pen-down":
            guarded(lambda: run_axicli(["--mode", "manual", "--manual_cmd", "lower_pen", *common(), *pen_flags(profile)], timeout=30))
        elif path == "/align":
            guarded(lambda: run_axicli(["--mode", "align", *common(), *pen_flags(profile)], timeout=30))
        elif path == "/home":
            guarded(lambda: run_axicli(["--mode", "manual", "--manual_cmd", "walk_home", *common()], timeout=60))
        elif path == "/set-zero":
            guarded(set_zero)
        elif path in ("/plot", "/outline"):
            if not body.strip():
                self._json(400, {"ok": False, "error": "empty SVG body"})
                return
            # /outline defaults to a dry (pen-up) trace; ?dry=0 draws the frame.
            dry = "/outline" in path and not re.search(r"[?&]dry=0\b", self.path)
            speed, accel = self._intparam("speed"), self._intparam("accel")
            delay_down, delay_up = self._intparam("delay_down"), self._intparam("delay_up")
            guarded(lambda: plot_svg(body, profile, dry, speed, accel, delay_down, delay_up))
        else:
            self._json(404, {"ok": False, "error": "not found"})


def main():
    # Default to 0.0.0.0 so other LAN devices reach the Pi station; override with
    # AXIDRAW_BRIDGE_HOST=127.0.0.1 for a Mac-local-only bridge.
    host = os.environ.get("AXIDRAW_BRIDGE_HOST", "0.0.0.0")
    port = int(os.environ.get("AXIDRAW_BRIDGE_PORT", "4760"))
    if not shutil.which(AXICLI) and not os.path.exists(AXICLI):
        print(f"WARNING: axicli not found at {AXICLI} — plotting will fail.", file=sys.stderr)
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Laser Forge AxiDraw bridge on http://{host}:{port}  (port={resolve_port()}, model 6, ×{SCALE})")
    if os.path.isdir(STATIC_DIR):
        print(f"Serving app from {STATIC_DIR}  →  open http://<this-host>:{port}/")
    else:
        print(f"(no app build at {STATIC_DIR} — API only; set LASER_FORGE_DIST to serve the app)")
    print("Endpoints: /status /pen-up /pen-down /set-zero /align /home /outline /plot /stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nbridge stopped")


if __name__ == "__main__":
    main()
