// Generators + pipeline smoke test.
// npx tsx scripts/smoke.mjs
const { GENERATORS } = await import("../src/generators/registry.ts");
const { DISTORTIONS } = await import("../src/distortions/registry.ts");

console.log("=== Base generators ===");
let ok = 0;
let fail = 0;
for (const gen of GENERATORS) {
  try {
    const art = gen.generate(gen.defaults, 42, { wMm: 200, hMm: 200 });
    const lc = art.polylines.length;
    const pc = art.polylines.reduce((n, l) => n + l.points.length, 0);
    if (lc === 0 || pc < 2) throw new Error("empty output");
    console.log(`✓ ${gen.id.padEnd(22)} ${lc.toString().padStart(5)} lines · ${pc.toString().padStart(7)} points`);
    ok++;
  } catch (e) {
    console.log(`✗ ${gen.id.padEnd(22)} ${e.message}`);
    fail++;
  }
}

console.log("\n=== Distortions (applied to rose) ===");
const baseArt = GENERATORS.find((g) => g.id === "rose").generate(
  { variant: "classic", n: 5, d: 1, step: 71, cycles: 1, samples: 2000, phase: 0, marginMm: 15 },
  7,
  { wMm: 200, hMm: 200 },
);
for (const d of DISTORTIONS) {
  try {
    const out = d.apply(baseArt, d.defaults, 7);
    const lc = out.polylines.length;
    const pc = out.polylines.reduce((n, l) => n + l.points.length, 0);
    console.log(`✓ ${d.id.padEnd(22)} ${lc.toString().padStart(5)} lines · ${pc.toString().padStart(7)} points`);
    ok++;
  } catch (e) {
    console.log(`✗ ${d.id.padEnd(22)} ${e.message}`);
    fail++;
  }
}

console.log("\n=== Chained pipeline: rose → kaleidoscope(8) → noise-warp → chaikin ===");
let cur = baseArt;
cur = DISTORTIONS.find((x) => x.id === "kaleidoscope").apply(
  cur,
  { segments: 8, keepOriginal: true, mirror: false, center: "canvas" },
  1,
);
cur = DISTORTIONS.find((x) => x.id === "noise-warp").apply(cur, { amountMm: 2, noiseScale: 0.03, octaves: 2 }, 2);
cur = DISTORTIONS.find((x) => x.id === "chaikin").apply(cur, { iterations: 2, tension: 0.25 }, 3);
console.log(
  `  → ${cur.polylines.length} lines · ${cur.polylines.reduce((n, l) => n + l.points.length, 0)} points`,
);

console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
