// Ad-hoc test runner for dedupePaths. Run: npx tsx scripts/test-dedupe.mjs
const { dedupePaths, DEDUPE_TOLERANCE_MM } = await import("../src/util/dedupePaths.ts");

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

const approx = (a, b, eps = 1e-6) => {
  if (Math.abs(a - b) > eps) throw new Error(`expected ${b} ±${eps}, got ${a}`);
};

const countSegments = (lines) =>
  lines.reduce((n, l) => n + Math.max(0, l.points.length - 1) + (l.closed ? 1 : 0), 0);

// --- Tests follow in subsequent tasks ---

t("exact duplicate segments collapse to one", () => {
  const a = { closed: false, points: [[0, 0], [10, 0]] };
  const b = { closed: false, points: [[0, 0], [10, 0]] };
  const out = dedupePaths([a, b]);
  eq(countSegments(out), 1, "should have exactly 1 segment after dedup");
});

t("collinear partial overlap merges to union", () => {
  const a = { closed: false, points: [[0, 0], [5, 0]] };
  const b = { closed: false, points: [[3, 0], [10, 0]] };
  const out = dedupePaths([a, b]);
  eq(countSegments(out), 1, "should merge into single 0→10 segment");
  const allX = out.flatMap((l) => l.points.map((p) => p[0])).sort((x, y) => x - y);
  approx(allX[0], 0);
  approx(allX[allX.length - 1], 10);
});

t("crossing segments without shared endpoint stay intact", () => {
  const a = { closed: false, points: [[0, 0], [10, 0]] };
  const b = { closed: false, points: [[5, -5], [5, 5]] };
  const out = dedupePaths([a, b]);
  eq(countSegments(out), 2, "horizontal + vertical crossing → 2 segments");
});

t("dense curve segments are not over-merged", () => {
  const points = [];
  for (let i = 0; i < 50; i++) {
    const x = i;
    const y = Math.sin(i * 0.3) * 5;
    points.push([x, y]);
  }
  const out = dedupePaths([{ closed: false, points }]);
  eq(countSegments(out), 49, "49 segments from 50 points");
});

t("chained segments restitch into one polyline", () => {
  const a = { closed: false, points: [[0, 0], [1, 0]] };
  const b = { closed: false, points: [[1, 0], [2, 1]] };
  const c = { closed: false, points: [[2, 1], [3, 1]] };
  const out = dedupePaths([a, b, c]);
  eq(out.length, 1, "three chained segments → 1 polyline");
  eq(out[0].points.length, 4, "polyline has 4 points");
});

t("triangle restitches into closed polyline", () => {
  const a = { closed: false, points: [[0, 0], [10, 0]] };
  const b = { closed: false, points: [[10, 0], [5, 10]] };
  const c = { closed: false, points: [[5, 10], [0, 0]] };
  const out = dedupePaths([a, b, c]);
  eq(out.length, 1, "triangle → 1 polyline");
  eq(out[0].closed, true, "polyline is closed");
});

t("empty input returns empty array", () => {
  const out = dedupePaths([]);
  eq(out, []);
});

t("float jitter below tolerance collapses", () => {
  const a = { closed: false, points: [[0, 0], [10, 0]] };
  const b = { closed: false, points: [[1e-9, 0], [10 + 1e-9, 0]] };
  const out = dedupePaths([a, b]);
  eq(countSegments(out), 1, "near-identical segments collapse");
});

t("svgExport without options is identical to previous behavior", async () => {
  const { svgExport } = await import("../src/render/svgExport.ts");
  const art = {
    widthMm: 100,
    heightMm: 100,
    polylines: [
      { closed: false, points: [[0, 0], [10, 0]] },
      { closed: false, points: [[0, 0], [10, 0]] }, // duplicate
    ],
  };
  const off = svgExport(art);
  const on = svgExport(art, { dedupe: true });
  const countPaths = (s) => (s.match(/<path /g) || []).length;
  eq(countPaths(off), 2, "default leaves duplicates in");
  eq(countPaths(on), 1, "dedupe option removes duplicates");
});

t("closed polyline input deduplicates correctly", () => {
  const tri = { closed: true, points: [[0, 0], [10, 0], [5, 10]] };
  const out = dedupePaths([tri, tri]);
  eq(out.length, 1, "duplicated closed triangle → 1 polyline");
  eq(out[0].closed, true, "result is still closed");
  eq(countSegments(out), 3, "3 segments: a triangle");
});

t("single-point polyline produces no output", () => {
  const out = dedupePaths([{ closed: false, points: [[5, 5]] }]);
  eq(out, []);
});

t("zero-point polyline produces no output", () => {
  const out = dedupePaths([{ closed: false, points: [] }]);
  eq(out, []);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
