import { GENERATORS } from "../src/generators/registry.ts";
import { DISTORTIONS } from "../src/distortions/registry.ts";

const canvas = { wMm: 200, hMm: 200 };

function hash(art) {
  let h = 0;
  for (const line of art.polylines) {
    for (const [x, y] of line.points) {
      h = (h * 31 + Math.round(x * 1e6)) | 0;
      h = (h * 31 + Math.round(y * 1e6)) | 0;
    }
  }
  return h;
}

let fail = 0;

console.log("=== Same seed → identical output ===");
for (const gen of GENERATORS) {
  const a = gen.generate(gen.defaults, 42, canvas);
  const b = gen.generate(gen.defaults, 42, canvas);
  const same = hash(a) === hash(b);
  if (!same) fail++;
  console.log(`${same ? "✓" : "✗"} ${gen.id.padEnd(22)} seed=42`);
}

console.log("\n=== Different seed → different output (seed-reactive gens) ===");
for (const gen of GENERATORS) {
  const a = gen.generate(gen.defaults, 42, canvas);
  const b = gen.generate(gen.defaults, 1337, canvas);
  const differ = hash(a) !== hash(b);
  console.log(`${differ ? "✓ seed-reactive   " : "○ math-deterministic"} ${gen.id}`);
}

console.log("\n=== Distortion determinism ===");
const rose = GENERATORS.find(g => g.id === "rose");
const base = rose.generate(rose.defaults, 7, canvas);
for (const d of DISTORTIONS) {
  const a = d.apply(base, d.defaults, 7, canvas);
  const b = d.apply(base, d.defaults, 7, canvas);
  const same = hash(a) === hash(b);
  if (!same) fail++;
  console.log(`${same ? "✓" : "✗"} ${d.id.padEnd(22)} seed=7`);
}

process.exit(fail === 0 ? 0 : 1);
