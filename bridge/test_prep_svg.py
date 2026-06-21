#!/usr/bin/env python3
"""Unit tests for bridge.prep_svg — the SVG axis/scale correction.

Run:  ~/.venvs/axidraw/bin/python bridge/test_prep_svg.py
(plain stdlib — no pytest needed)
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from bridge import prep_svg, SCALE  # noqa: E402

FAILS = 0


def check(name, cond, detail=""):
    global FAILS
    if cond:
        print(f"  ok   {name}")
    else:
        FAILS += 1
        print(f"  FAIL {name}  {detail}")


def num(attr, s):
    m = re.search(rf'{attr}\s*=\s*"([\d.]+)', s)
    return float(m.group(1)) if m else None


# A 40 mm calibration square, authored landscape (viewBox in mm 1:1).
SQUARE = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="40mm" '
    'viewBox="0 0 40 40" fill="none" stroke="black">\n'
    '  <path d="M 0,0 L 40,0 L 40,40 L 0,40 Z"/>\n'
    "</svg>\n"
)
out = prep_svg(SQUARE)

print("prep_svg — 40mm square")
check("output width = 40 × scale", num("width", out) == round(40 * SCALE, 4),
      f"got {num('width', out)} want {40 * SCALE}")
check("output height = 40 × scale", num("height", out) == round(40 * SCALE, 4),
      f"got {num('height', out)}")
check("viewBox stays 0 0 40 40", 'viewBox="0 0 40.0 40.0"' in out, out[:120])
check("rotates 90°", "rotate(90)" in out, out)
check("translates by H", "translate(40.0,0)" in out, out)
check("unit scale 1,1 (viewBox already mm)", "scale(1.0,1.0)" in out, out)
check("inner path preserved", "M 0,0 L 40,0" in out, out)

# A non-square landscape page (W=210, H=297 — portrait A4) to check W/H usage.
A4 = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" '
    'viewBox="0 0 210 297"><path d="M 10,10 L 200,10"/></svg>'
)
out2 = prep_svg(A4)
print("prep_svg — 210×297 page")
check("output width = H × scale", num("width", out2) == round(297 * SCALE, 4),
      f"got {num('width', out2)} want {297 * SCALE}")
check("output height = W × scale", num("height", out2) == round(210 * SCALE, 4),
      f"got {num('height', out2)} want {210 * SCALE}")
check("viewBox = 0 0 H W", 'viewBox="0 0 297.0 210.0"' in out2, out2[:140])
check("translate by H=297", "translate(297.0,0)" in out2, out2[:140])

# A viewBox that differs from mm dims should produce a non-unit inner scale.
SCALED = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" '
    'viewBox="0 0 200 100"><path d="M 0,0 L 200,0"/></svg>'
)
out3 = prep_svg(SCALED)
print("prep_svg — viewBox≠mm")
check("inner scale = mm/vb = 0.5", "scale(0.5,0.5)" in out3, out3[:160])

if FAILS:
    print(f"\n{FAILS} test(s) failed")
    sys.exit(1)
print("\nall prep_svg tests passed")
