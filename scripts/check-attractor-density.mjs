const { byId } = await import("../src/generators/registry.ts");
const g = byId("attractor");

for (const c of [0, 0.3, 0.5, 1, 2, 4]) {
  const art = g.generate({ ...g.defaults, cellMm: c }, 42, { wMm: 200, hMm: 200 });
  const pts = art.polylines.reduce((n, l) => n + l.points.length, 0);
  console.log(
    `cellMm=${c.toString().padStart(4)} → ${art.polylines.length
      .toString()
      .padStart(4)} lines · ${pts.toString().padStart(6)} pts`,
  );
}
