// Test suite for src/util/mergePaths.ts
// Run: npx tsx scripts/mergepaths-test.mjs

const { mergePaths } = await import("../src/util/mergePaths.ts");

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
// Basic join
// ----------------------------------------------------------------

t("two open lines sharing an endpoint → ONE polyline; count = sum - 1", () => {
  const a = { closed: false, points: [[0, 0], [5, 0]] };
  const b = { closed: false, points: [[5, 0], [10, 0]] };
  const out = mergePaths([a, b]);
  eq(out.length, 1, "should produce exactly 1 polyline");
  eq(out[0].points.length, 3, "3 points (not 4); join point not duplicated");
  approx(out[0].points[0][0], 0, 1e-9, "starts at x=0");
  approx(out[0].points[2][0], 10, 1e-9, "ends at x=10");
});

t("reverse case: second line's END matches first line's END → reversed + joined", () => {
  // Line A: (0,0)→(5,0), Line B: (10,0)→(5,0) — B.end == A.end
  // Should produce (0,0)→(5,0)→(10,0) or reversed: (10,0)→(5,0)→(0,0)
  const a = { closed: false, points: [[0, 0], [5, 0]] };
  const b = { closed: false, points: [[10, 0], [5, 0]] };
  const out = mergePaths([a, b]);
  eq(out.length, 1, "should produce exactly 1 polyline");
  eq(out[0].points.length, 3, "3 points (not 4); join point not duplicated");
  // The joined polyline should contain all three distinct x values
  const xs = out[0].points.map((p) => p[0]).sort((a, b) => a - b);
  approx(xs[0], 0, 1e-9, "contains x=0");
  approx(xs[1], 5, 1e-9, "contains x=5");
  approx(xs[2], 10, 1e-9, "contains x=10");
});

// ----------------------------------------------------------------
// Ring / closed detection
// ----------------------------------------------------------------

t("four segments forming a square → ONE closed:true polyline", () => {
  const a = { closed: false, points: [[0, 0], [10, 0]] };
  const b = { closed: false, points: [[10, 0], [10, 10]] };
  const c = { closed: false, points: [[10, 10], [0, 10]] };
  const d = { closed: false, points: [[0, 10], [0, 0]] };
  const out = mergePaths([a, b, c, d]);
  eq(out.length, 1, "should produce exactly 1 polyline");
  eq(out[0].closed, true, "polyline should be closed:true");
  // A closed ring stores N points (no duplicated closing point)
  eq(out[0].points.length, 4, "4 unique corner points");
});

// ----------------------------------------------------------------
// Tolerance
// ----------------------------------------------------------------

t("endpoints 0.03mm apart merge at default tolerance (0.05)", () => {
  const a = { closed: false, points: [[0, 0], [5, 0]] };
  const b = { closed: false, points: [[5.03, 0], [10, 0]] };
  const out = mergePaths([a, b]);
  eq(out.length, 1, "0.03mm gap should merge at default 0.05mm tolerance");
});

t("endpoints 0.2mm apart do NOT merge at default tolerance (0.05)", () => {
  const a = { closed: false, points: [[0, 0], [5, 0]] };
  const b = { closed: false, points: [[5.2, 0], [10, 0]] };
  const out = mergePaths([a, b]);
  eq(out.length, 2, "0.2mm gap should NOT merge at default 0.05mm tolerance");
});

// ----------------------------------------------------------------
// Closed pass-through
// ----------------------------------------------------------------

t("closed polylines pass through unchanged", () => {
  const c = { closed: true, points: [[0, 0], [10, 0], [5, 10]] };
  const out = mergePaths([c]);
  eq(out.length, 1, "should still be 1 polyline");
  eq(out[0].closed, true, "still closed");
  eq(out[0].points, c.points, "points unchanged");
});

t("mixed: closed triangle + two open segments → triangle unchanged, open joined", () => {
  const closed = { closed: true, points: [[0, 0], [10, 0], [5, 10]] };
  const open1 = { closed: false, points: [[20, 0], [25, 0]] };
  const open2 = { closed: false, points: [[25, 0], [30, 0]] };
  const out = mergePaths([closed, open1, open2]);
  const closedOnes = out.filter((l) => l.closed);
  const openOnes = out.filter((l) => !l.closed);
  eq(closedOnes.length, 1, "closed triangle still present");
  eq(openOnes.length, 1, "two open segs merged into one");
  eq(openOnes[0].points.length, 3, "merged open has 3 points");
});

// ----------------------------------------------------------------
// Disjoint
// ----------------------------------------------------------------

t("two disjoint lines stay two polylines", () => {
  const a = { closed: false, points: [[0, 0], [5, 0]] };
  const b = { closed: false, points: [[20, 0], [25, 0]] };
  const out = mergePaths([a, b]);
  eq(out.length, 2, "no shared endpoints → still 2 polylines");
});

// ----------------------------------------------------------------
// Short polyline filtering
// ----------------------------------------------------------------

t("polylines with < 2 points are dropped", () => {
  const bad0 = { closed: false, points: [] };
  const bad1 = { closed: false, points: [[5, 5]] };
  const good = { closed: false, points: [[0, 0], [10, 0]] };
  const out = mergePaths([bad0, bad1, good]);
  eq(out.length, 1, "only valid polyline survives");
});

// ----------------------------------------------------------------
// Truchet real case
// ----------------------------------------------------------------

t("Truchet smith-arcs: mergePaths reduces polyline count to < 25% of input", async () => {
  const { truchet } = await import("../src/generators/truchet.ts");
  const canvas = { wMm: 200, hMm: 200 };
  const params = {
    variant: "smith-arcs",
    cols: 10,
    rows: 10,
    arcSamples: 16,
    marginMm: 15,
  };
  const art = truchet.generate(params, 42, canvas);
  const inputCount = art.polylines.length;
  const merged = mergePaths(art.polylines);
  const outputCount = merged.length;
  const ratio = outputCount / inputCount;
  if (ratio >= 0.25) {
    throw new Error(
      `Expected < 25% of input paths, got ${outputCount}/${inputCount} = ${(ratio * 100).toFixed(1)}%`,
    );
  }
  console.log(
    `    (${inputCount} → ${outputCount} polylines, ${(ratio * 100).toFixed(1)}% of input)`,
  );
});

// ----------------------------------------------------------------

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
