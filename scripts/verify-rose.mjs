// Verify rose: samples and phase actually change output
const { byId } = await import("../src/generators/registry.ts");
const rose = byId("rose");

const hash = (art) => {
  let h = 0;
  for (const l of art.polylines) {
    for (const [x, y] of l.points) {
      h = (h * 31 + Math.round(x * 1000)) | 0;
      h = (h * 31 + Math.round(y * 1000)) | 0;
    }
  }
  return h;
};

const canvas = { wMm: 200, hMm: 200 };

// Test samples matters in both variants
for (const variant of ["classic", "maurer"]) {
  const p100 = { ...rose.defaults, variant, samples: 100 };
  const p2000 = { ...rose.defaults, variant, samples: 2000 };
  const a = rose.generate(p100, 0, canvas);
  const b = rose.generate(p2000, 0, canvas);
  const pa = a.polylines.reduce((n, l) => n + l.points.length, 0);
  const pb = b.polylines.reduce((n, l) => n + l.points.length, 0);
  console.log(
    `${variant.padEnd(8)} samples: 100 → ${pa} pts, 2000 → ${pb} pts`,
    pa !== pb ? "✓" : "✗",
  );
}

// Test phase changes geometry
for (const variant of ["classic", "maurer"]) {
  const h0 = hash(rose.generate({ ...rose.defaults, variant, phase: 0 }, 0, canvas));
  const h1 = hash(rose.generate({ ...rose.defaults, variant, phase: 0.5 }, 0, canvas));
  console.log(
    `${variant.padEnd(8)} phase:   0 → hash ${h0}, 0.5 → hash ${h1}`,
    h0 !== h1 ? "✓" : "✗",
  );
}
