// Test suite for src/plotter/gcode.ts
// Run: npx tsx scripts/gcode-test.mjs

const { orderPolylines, artworkToGcode, bbox, outlineGcode, DEFAULT_PEN } =
  await import("../src/plotter/gcode.ts");

let pass = 0;
let fail = 0;

const t = (name, fn) => {
  try {
    fn();
    console.log(`✓ ${name}`);
    pass++;
  } catch (e) {
    console.log(`✗ ${name}\n    ${e.message}`);
    fail++;
  }
};

const eq = (actual, expected, msg = "") => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n    expected: ${e}\n    actual:   ${a}`);
};

const approx = (a, b, eps = 1e-6, msg = "") => {
  if (Math.abs(a - b) > eps)
    throw new Error(`${msg}: expected ${b} ±${eps}, got ${a}`);
};

// ----------------------------------------------------------------
// orderPolylines
// ----------------------------------------------------------------

t("orderPolylines: nearer line to origin comes first", () => {
  // line A: starts at (20,0)
  const lineA = { closed: false, points: [[20, 0], [25, 0]] };
  // line B: starts at (3,0) — much closer to origin
  const lineB = { closed: false, points: [[3, 0], [8, 0]] };
  const result = orderPolylines([lineA, lineB]);
  eq(result.length, 2, "should return 2 lines");
  // first line should be the one starting at (3,0)
  eq(result[0].points[0], [3, 0], "nearest line (B) should come first");
});

t("orderPolylines: open line reversed when its END is nearer to pen", () => {
  // pen starts at (0,0)
  // line A: endpoints at (1,0) and (10,0) — end (1,0) is nearer than start (10,0)... wait
  // Actually: start (10,0) and end (1,0):
  const lineA = { closed: false, points: [[10, 0], [1, 0]] };
  const result = orderPolylines([lineA]);
  eq(result.length, 1, "should return 1 line");
  // end (1,0) is closer to origin than start (10,0), so line should be reversed
  eq(result[0].points[0], [1, 0], "line reversed: near-end (1,0) becomes start");
  eq(result[0].points[result[0].points.length - 1], [10, 0], "original start becomes end");
});

t("orderPolylines: closed line is NEVER reversed", () => {
  // closed line whose end is closer to origin than start
  const line = { closed: true, points: [[10, 0], [5, 5], [1, 0]] };
  const result = orderPolylines([line]);
  eq(result[0].points[0], [10, 0], "closed line not reversed, start stays at (10,0)");
  eq(result[0].closed, true, "still closed");
});

t("orderPolylines: two lines, second routed from end of first", () => {
  // after drawing lineA (ends at 10,0), we should pick the closest start of lineB or lineC
  const lineA = { closed: false, points: [[0, 0], [10, 0]] }; // starts near origin
  const lineB = { closed: false, points: [[10.1, 0], [20, 0]] }; // starts near end of A
  const lineC = { closed: false, points: [[50, 0], [60, 0]] }; // far
  const result = orderPolylines([lineC, lineB, lineA]);
  eq(result[0].points[0], [0, 0], "lineA first (closest to origin)");
  eq(result[1].points[0], [10.1, 0], "lineB second (closest to end of A)");
  eq(result[2].points[0], [50, 0], "lineC last");
});

t("orderPolylines: filters lines with fewer than 2 points", () => {
  const bad1 = { closed: false, points: [] };
  const bad2 = { closed: false, points: [[1, 1]] };
  const good = { closed: false, points: [[0, 0], [5, 0]] };
  const result = orderPolylines([bad1, bad2, good]);
  eq(result.length, 1, "only valid line survives");
});

t("orderPolylines: does not mutate input", () => {
  const line = { closed: false, points: [[10, 0], [1, 0]] };
  const originalStart = line.points[0];
  orderPolylines([line]);
  eq(line.points[0], originalStart, "input unchanged");
  eq(line.points[0], [10, 0], "original start is still [10,0]");
});

// ----------------------------------------------------------------
// artworkToGcode
// ----------------------------------------------------------------

const simpleArt = {
  widthMm: 100,
  heightMm: 100,
  polylines: [
    { closed: false, points: [[0, 0], [10, 0], [10, 10]] },
  ],
};

const opts = DEFAULT_PEN;

t("artworkToGcode: header is G21 then G90", () => {
  const lines = artworkToGcode(simpleArt, opts);
  eq(lines[0], "G21", "first line is G21");
  eq(lines[1], "G90", "second line is G90");
});

t("artworkToGcode: output NEVER contains M5", () => {
  const lines = artworkToGcode(simpleArt, opts);
  const withM5 = lines.filter((l) => l.includes("M5"));
  eq(withM5.length, 0, "no M5 lines allowed");
});

t("artworkToGcode: contains M3 S160 (pen down) and M3 S20 (pen up)", () => {
  const lines = artworkToGcode(simpleArt, opts);
  const hasDown = lines.some((l) => l === "M3 S160");
  const hasUp = lines.some((l) => l === "M3 S20");
  if (!hasDown) throw new Error("missing M3 S160 (pen down)");
  if (!hasUp) throw new Error("missing M3 S20 (pen up)");
});

t("artworkToGcode: contains G4 P0.1 (dwell-down)", () => {
  const lines = artworkToGcode(simpleArt, opts);
  const hasDwellDown = lines.some((l) => l === "G4 P0.1");
  if (!hasDwellDown) throw new Error("missing G4 P0.1 (dwell down)");
});

t("artworkToGcode: last line is G0 X0 Y0", () => {
  const lines = artworkToGcode(simpleArt, opts);
  eq(lines[lines.length - 1], "G0 X0 Y0", "last line should return to origin");
});

t("artworkToGcode: closed triangle returns to start point with final G1", () => {
  const tri = {
    widthMm: 50,
    heightMm: 50,
    polylines: [
      { closed: true, points: [[0, 0], [10, 0], [5, 10]] },
    ],
  };
  const lines = artworkToGcode(tri, opts);
  // The final G1 before pen-up should go back to start [0,0]
  // Find the last G1 line before the pen-up sequence
  const g1Lines = lines.filter((l) => l.startsWith("G1 "));
  const lastG1 = g1Lines[g1Lines.length - 1];
  if (!lastG1.includes("X0") || !lastG1.includes("Y0"))
    throw new Error(`last G1 should return to start (0,0), got: ${lastG1}`);
});

t("artworkToGcode: travel to first point uses G0 (rapid)", () => {
  const art = {
    widthMm: 100,
    heightMm: 100,
    polylines: [
      { closed: false, points: [[5, 7], [15, 7]] },
    ],
  };
  const lines = artworkToGcode(art, opts);
  const hasG0Travel = lines.some((l) => l === "G0 X5 Y7");
  if (!hasG0Travel) throw new Error("missing G0 travel to start of polyline");
});

t("artworkToGcode: draw lines use G1 with feed", () => {
  const art = {
    widthMm: 100,
    heightMm: 100,
    polylines: [
      { closed: false, points: [[0, 0], [10, 0]] },
    ],
  };
  const lines = artworkToGcode(art, opts);
  const g1Lines = lines.filter((l) => l.startsWith("G1 "));
  if (g1Lines.length === 0) throw new Error("no G1 draw lines found");
  if (!g1Lines[0].includes(`F${opts.feed}`))
    throw new Error(`G1 should include feed F${opts.feed}, got: ${g1Lines[0]}`);
});

// ----------------------------------------------------------------
// bbox
// ----------------------------------------------------------------

t("bbox: correct min/max", () => {
  const art = {
    widthMm: 200,
    heightMm: 200,
    polylines: [
      { closed: false, points: [[-5, 3], [10, 20]] },
      { closed: false, points: [[2, -8], [7, 15]] },
    ],
  };
  const [minx, miny, maxx, maxy] = bbox(art);
  approx(minx, -5, 1e-9, "minx");
  approx(miny, -8, 1e-9, "miny");
  approx(maxx, 10, 1e-9, "maxx");
  approx(maxy, 20, 1e-9, "maxy");
});

t("bbox: single point artwork", () => {
  const art = {
    widthMm: 10,
    heightMm: 10,
    polylines: [{ closed: false, points: [[3, 7]] }],
  };
  const [minx, miny, maxx, maxy] = bbox(art);
  approx(minx, 3, 1e-9, "minx");
  approx(miny, 7, 1e-9, "miny");
  approx(maxx, 3, 1e-9, "maxx");
  approx(maxy, 7, 1e-9, "maxy");
});

// ----------------------------------------------------------------
// outlineGcode
// ----------------------------------------------------------------

t("outlineGcode: starts G0 at bbox corner", () => {
  const box = [5, 10, 50, 80];
  const lines = outlineGcode(box, opts);
  // Should contain G0 to corner (x0,y0)
  const hasCornerG0 = lines.some((l) => l === "G0 X5 Y10");
  if (!hasCornerG0)
    throw new Error(`missing G0 to bbox corner X5 Y10. Lines: ${lines.slice(0, 10).join(", ")}`);
});

t("outlineGcode: never contains M5", () => {
  const box = [0, 0, 100, 100];
  const lines = outlineGcode(box, opts);
  const withM5 = lines.filter((l) => l.includes("M5"));
  eq(withM5.length, 0, "no M5 in outlineGcode");
});

t("outlineGcode: draws all four corners", () => {
  const box = [5, 10, 50, 80];
  const lines = outlineGcode(box, opts);
  const g1s = lines.filter((l) => l.startsWith("G1 "));
  // Should visit (50,10), (50,80), (5,80), and back to (5,10)
  const hasTopRight = g1s.some((l) => l.includes("X50") && l.includes("Y10"));
  const hasBottomRight = g1s.some((l) => l.includes("X50") && l.includes("Y80"));
  const hasBottomLeft = g1s.some((l) => l.includes("X5") && l.includes("Y80"));
  const hasReturn = g1s.some((l) => l.includes("X5") && l.includes("Y10"));
  if (!hasTopRight) throw new Error("missing top-right corner G1 X50 Y10");
  if (!hasBottomRight) throw new Error("missing bottom-right corner G1 X50 Y80");
  if (!hasBottomLeft) throw new Error("missing bottom-left corner G1 X5 Y80");
  if (!hasReturn) throw new Error("missing return to start corner G1 X5 Y10");
});

t("outlineGcode: ends with G0 X0 Y0", () => {
  const box = [5, 10, 50, 80];
  const lines = outlineGcode(box, opts);
  eq(lines[lines.length - 1], "G0 X0 Y0", "last line returns to origin");
});

t("outlineGcode: header is G21 then G90", () => {
  const box = [0, 0, 100, 100];
  const lines = outlineGcode(box, opts);
  eq(lines[0], "G21", "first line is G21");
  eq(lines[1], "G90", "second line is G90");
});

// ----------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
