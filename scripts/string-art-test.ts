import assert from "node:assert/strict";
import { stringArt } from "../src/generators/stringArt";

const canvas = { wMm: 200, hMm: 200 };
const P = { ...stringArt.defaults };

// 1. timesTable: ~N chords (minus i→i self-loops), each a 2-point segment.
{
  const art = stringArt.generate({ ...P, mode: "timesTable", points: 200, multiplier: 2 }, 1, canvas);
  assert.equal(art.widthMm, 200);
  assert(art.polylines.length > 150 && art.polylines.length <= 200, "≈N chords");
  for (const l of art.polylines) assert.equal(l.points.length, 2, "chord = 2 points");
}

// 2. multiplier changes the envelope (different chord set).
{
  const c2 = stringArt.generate({ ...P, mode: "timesTable", multiplier: 2 }, 1, canvas);
  const c3 = stringArt.generate({ ...P, mode: "timesTable", multiplier: 3 }, 1, canvas);
  assert.notDeepEqual(c2, c3, "×2 ≠ ×3");
}

// 3. star: coprime step → one closed loop; gcd>1 → multiple components.
{
  const coprime = stringArt.generate({ ...P, mode: "star", points: 12, step: 5 }, 1, canvas);
  assert.equal(coprime.polylines.length, 1, "gcd(12,5)=1 → single star");
  assert.equal(coprime.polylines[0].closed, true, "star is closed");
  const composite = stringArt.generate({ ...P, mode: "star", points: 12, step: 4 }, 1, canvas);
  assert.equal(composite.polylines.length, 4, "gcd(12,4)=4 → 4 components");
}

// 4. mysticRose is capped so it stays plottable.
{
  const art = stringArt.generate({ ...P, mode: "mysticRose", points: 720 }, 1, canvas);
  // 150-point cap → 150*149/2 = 11175 chords.
  assert.equal(art.polylines.length, (150 * 149) / 2, "rose capped at 150 pts");
}

// 5. Seed-independent.
{
  const a = stringArt.generate(P, 1, canvas);
  const b = stringArt.generate(P, 777, canvas);
  assert.deepEqual(a, b, "deterministic");
}

console.log("string-art: all checks passed ✓");
