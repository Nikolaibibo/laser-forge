// Smarter parameter-sensitivity audit.
// Picks non-equivalent values (avoids circular endpoints like -π/π),
// and runs context-gated params in their activating mode.
// npx tsx scripts/audit-params.mjs
const { GENERATORS } = await import("../src/generators/registry.ts");
const { DISTORTIONS } = await import("../src/distortions/registry.ts");

const canvas = { wMm: 200, hMm: 200 };
const SEED = 42;

const hashArt = (art) => {
  let h = 0;
  let count = 0;
  for (const l of art.polylines) {
    for (const [x, y] of l.points) {
      h = (h * 31 + Math.round(x * 1000)) | 0;
      h = (h * 31 + Math.round(y * 1000)) | 0;
      count++;
    }
  }
  return `${h}_${count}`;
};

// Pick low + high values that are not circular-equivalent.
// For number: use min + (min+max)/2 rather than min + max
const pickValues = (entry, current) => {
  if (entry == null) return null;
  if (Array.isArray(entry.options) || typeof entry.options === "object") {
    const opts = Array.isArray(entry.options) ? entry.options : Object.values(entry.options);
    const other = opts.find((o) => o !== current);
    if (other === undefined) return null;
    return [current, other];
  }
  if (typeof current === "boolean") return [false, true];
  if (typeof current === "number") {
    const min = entry.min ?? current - 1;
    const max = entry.max ?? current + 1;
    if (min === max) return null;
    // Use min and midpoint — avoids circular wraps (0 vs 2π).
    const mid = min + (max - min) * 0.37;
    if (Math.abs(min - mid) < 1e-6) return null;
    return [min, mid];
  }
  return null;
};

// Generator-specific activating-mode overrides so context-gated params
// actually contribute during the test.
const ACTIVATION = {
  rose: { step: { variant: "maurer" } },
  superformula: {
    layerMorph: { layers: 5 },
    modFreq: { modAmp: 0.3 },
    layerRotDeg: { layers: 5 },
  },
  voronoi: {
    gridSize: { mode: "truchet" },
    tileSet: { mode: "truchet" },
    tileDensity: { mode: "truchet" },
    distribution: { mode: "voronoi" },
    lloydIterations: { mode: "voronoi" },
    pointCount: { mode: "voronoi" },
  },
  attractor: {
    // segmentsPerLine only bites when the grid doesn't break polylines first
    segmentsPerLine: { cellMm: 0 },
  },
};

const runGen = (gen, params) => gen.generate(params, SEED, canvas);
const runDist = (dist, baseArt, params) => dist.apply(baseArt, params, SEED);

const dead = [];
let tested = 0;

console.log("=== Generators ===");
for (const gen of GENERATORS) {
  const activation = ACTIVATION[gen.id] ?? {};
  for (const [key, entry] of Object.entries(gen.schema)) {
    const current = gen.defaults[key];
    const values = pickValues(entry, current);
    if (!values) continue;
    const act = activation[key] ?? {};
    const base = { ...gen.defaults, ...act };
    const [lo, hi] = values;
    const hashLo = hashArt(runGen(gen, { ...base, [key]: lo }));
    const hashHi = hashArt(runGen(gen, { ...base, [key]: hi }));
    tested++;
    if (hashLo === hashHi) {
      dead.push({ where: gen.id, param: key, lo, hi, activation: act });
      console.log(
        `  ✗ ${gen.id}.${key}  ${JSON.stringify(lo)} vs ${JSON.stringify(hi)}${
          Object.keys(act).length ? ` (active: ${JSON.stringify(act)})` : ""
        }`,
      );
    }
  }
  console.log(`  ✓ ${gen.id}`);
}

console.log("\n=== Distortions ===");
const basesByGen = {
  harmonograph: runGen(
    GENERATORS.find((g) => g.id === "harmonograph"),
    GENERATORS.find((g) => g.id === "harmonograph").defaults,
  ),
  // An asymmetric input for kaleidoscope.center "canvas" vs "bounds" to differ
  asymmetric: {
    widthMm: 200,
    heightMm: 200,
    polylines: [
      { closed: false, points: [[20, 20], [60, 60], [60, 20], [20, 60]] },
      { closed: false, points: [[40, 40], [80, 50]] },
    ],
  },
};
const DIST_BASE = {
  "noise-warp": "harmonograph",
  chaikin: "harmonograph",
  kaleidoscope: "asymmetric",
};

for (const dist of DISTORTIONS) {
  const baseArt = basesByGen[DIST_BASE[dist.id]];
  for (const [key, entry] of Object.entries(dist.schema)) {
    const current = dist.defaults[key];
    const values = pickValues(entry, current);
    if (!values) continue;
    const [lo, hi] = values;
    const hashLo = hashArt(runDist(dist, baseArt, { ...dist.defaults, [key]: lo }));
    const hashHi = hashArt(runDist(dist, baseArt, { ...dist.defaults, [key]: hi }));
    tested++;
    if (hashLo === hashHi) {
      dead.push({ where: dist.id, param: key, lo, hi });
      console.log(`  ✗ ${dist.id}.${key}  ${JSON.stringify(lo)} vs ${JSON.stringify(hi)}`);
    }
  }
  console.log(`  ✓ ${dist.id}`);
}

console.log(`\n${tested} params tested, ${dead.length} dead.`);
if (dead.length > 0) {
  process.exit(1);
}
