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
import os
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
# The EBB enumerates under different /dev/cu.usbmodem* names per USB port, so
# resolve dynamically: prefer $AXIDRAW_PORT, else the first usbmodem device.
PORT_PREF = os.environ.get("AXIDRAW_PORT", "/dev/cu.usbmodem11101")
SCALE = 1.25  # 16T vs 20T pulley correction (= 20/16)


def resolve_port() -> str:
    if os.path.exists(PORT_PREF):
        return PORT_PREF
    cands = sorted(glob.glob("/dev/cu.usbmodem*"))
    return cands[0] if cands else PORT_PREF


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
    profile: str, dry: bool = False, speed: int | None = None, accel: int | None = None
) -> list[str]:
    """Pen CLI flags for a profile.
    - dry=True forces pen_pos_down == up (0) so the servo never lowers (dry trace).
    - speed overrides --speed_pendown (% of max); accel overrides --accel.
      Lower both for cleaner fine detail (small text, tight curves)."""
    flags = PEN_BASE + PROFILES.get(profile, PROFILES["pencil"])
    flags = _set_flag(flags, "--pen_pos_down", "0" if dry else "100")
    if speed is not None:
        flags = _set_flag(flags, "--speed_pendown", max(1, min(100, int(speed))))
    if accel is not None:
        flags = _set_flag(flags, "--accel", max(1, min(100, int(accel))))
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
    def getnum(attr: str):
        m = re.search(rf'{attr}\s*=\s*"([\d.]+)\s*(mm|cm|in|px)?"', raw)
        return float(m.group(1)) if m else None

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

    inner = raw[raw.index(">", raw.index("<svg")) + 1: raw.rindex("</svg>")]
    g = (
        f'<g transform="translate({H},0) rotate(90) scale({sx},{sy})" '
        f'fill="none" stroke="black" stroke-width="0.3" '
        f'stroke-linecap="round" stroke-linejoin="round">'
    )
    ow, oh = H * scale, W * scale  # rotated output canvas, scaled
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{ow:.4f}mm" '
        f'height="{oh:.4f}mm" viewBox="0 0 {H} {W}">\n{g}\n{inner}\n</g>\n</svg>'
    )


# ---------------------------------------------------------------------------
# Process / port management. One motion op at a time (LOCK); /stop bypasses it.
# ---------------------------------------------------------------------------
LOCK = threading.Lock()
PLOT_PROC: "subprocess.Popen | None" = None


def free_port() -> None:
    """tomedo's CardListenerStandalone grabs the serial port — kill it."""
    try:
        out = subprocess.run(
            ["lsof", tty_of(resolve_port())], capture_output=True, text=True, timeout=5
        ).stdout
        if "CardListener" in out:
            subprocess.run(["pkill", "-f", "CardListenerStandalone"], timeout=5)
            threading.Event().wait(1.0)
    except Exception:
        pass  # lsof/pkill missing or nothing to kill — non-fatal


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
    """Set current position as 0,0 via raw EBB 'CS' command (like plot.sh)."""
    free_port()
    try:
        import serial  # pyserial, in the venv alongside pyaxidraw

        s = serial.Serial(resolve_port(), 9600, timeout=2)
        threading.Event().wait(0.3)
        s.write(b"CS\r")
        threading.Event().wait(0.2)
        resp = s.readline().decode(errors="replace").strip()
        s.close()
        return True, f"0,0 set: {resp}"
    except Exception as e:  # noqa: BLE001
        return False, str(e)


def plot_svg(
    raw_svg: str, profile: str, dry: bool = False,
    speed: int | None = None, accel: int | None = None,
) -> tuple[bool, str]:
    """Prep + plot an SVG via a killable axicli subprocess. dry=True traces with
    the pen held up (dry outline). speed/accel override the profile defaults."""
    global PLOT_PROC
    pen = pen_flags(profile, dry, speed, accel)
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
        if self.path.split("?")[0] == "/status":
            self._json(200, {
                "ok": True,
                "plotting": PLOT_PROC is not None and PLOT_PROC.poll() is None,
                "port": resolve_port(),
                "model": 6,
                "scale": SCALE,
                "profiles": list(PROFILES.keys()),
            })
        else:
            self._json(404, {"ok": False, "error": "not found"})

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
            guarded(lambda: plot_svg(body, profile, dry, speed, accel))
        else:
            self._json(404, {"ok": False, "error": "not found"})


def main():
    host = "127.0.0.1"
    port = int(os.environ.get("AXIDRAW_BRIDGE_PORT", "4760"))
    if not shutil.which(AXICLI) and not os.path.exists(AXICLI):
        print(f"WARNING: axicli not found at {AXICLI} — plotting will fail.", file=sys.stderr)
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Laser Forge AxiDraw bridge on http://{host}:{port}  (port={resolve_port()}, model 6, ×{SCALE})")
    print("Endpoints: /status /pen-up /pen-down /set-zero /align /home /outline /plot /stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nbridge stopped")


if __name__ == "__main__":
    main()
