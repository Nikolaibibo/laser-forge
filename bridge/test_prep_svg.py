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

# cm units must be read as mm×10 (Caliber SVGs + vpype default output are cm).
CM = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="8.2cm" height="6.2cm" '
    'viewBox="0 0 309.92 234.33"><path d="M 0,0 L 309.92,0"/></svg>'
)
out4 = prep_svg(CM)
print("prep_svg — cm units")
# 8.2cm = 82mm wide → rotated output width = H = 62mm × scale
check("cm→mm: output width = 62 × scale", num("width", out4) == round(62.0 * SCALE, 4),
      f"got {num('width', out4)} want {62.0 * SCALE}")
# inner scale = 82mm / 309.92 vb ≈ 0.2646 (NOT 8.2/309.92 ≈ 0.0265)
check("cm→mm: inner scale ≈ 0.2646", "scale(0.2645" in out4, out4[:200])

# A bare-number width is px → mm via 96 dpi (1in = 25.4mm).
PX = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" '
    'viewBox="0 0 96 96"><path d="M 0,0 L 96,0"/></svg>'
)
out5 = prep_svg(PX)
print("prep_svg — bare px units")
# 96px = 25.4mm → rotated output width = 25.4mm × scale
check("px→mm: output width = 25.4 × scale", num("width", out5) == round(25.4 * SCALE, 4),
      f"got {num('width', out5)} want {25.4 * SCALE}")

# vpype/Inkscape emit a <metadata> block with rdf:/cc: prefixes — must be
# stripped, else the minimal wrapper <svg> has undefined namespace prefixes.
META = (
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:rdf="x" '
    'xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" '
    'width="40mm" height="40mm" viewBox="0 0 40 40">\n'
    "  <metadata><rdf:RDF><cc:Work>junk</cc:Work></rdf:RDF></metadata>\n"
    '  <defs/>\n  <g inkscape:groupmode="layer" inkscape:label="1">'
    '<path d="M 0,0 L 40,0"/></g>\n</svg>'
)
out6 = prep_svg(META)
print("prep_svg — metadata + inkscape-prefixed geometry")
check("metadata block removed", "<metadata" not in out6 and "rdf:RDF" not in out6, out6[:200])
check("geometry kept", "M 0,0 L 40,0" in out6, out6[:200])
check("inkscape ns carried to wrapper", "xmlns:inkscape" in out6, out6[:200])
# The whole point: result must parse under a strict XML parser (= what axicli does).
try:
    import xml.dom.minidom as _md
    _md.parseString(out6)
    check("prepped output is valid XML", True)
except Exception as e:  # noqa: BLE001
    check("prepped output is valid XML", False, str(e))

if FAILS:
    print(f"\n{FAILS} test(s) failed")
    sys.exit(1)
print("\nall prep_svg tests passed")
