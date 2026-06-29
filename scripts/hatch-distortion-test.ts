// scripts/hatch-distortion-test.ts — checks for the hatch fill distortion.
// Run: npx tsx scripts/hatch-distortion-test.ts
import assert from "node:assert/strict";
import { hatch } from "../src/distortions/hatch";
import type { Artwork } from "../src/generators/types";

const closedSquare = {
  points: [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][],
  closed: true,
  stroke: "#1a3a52",
};
const openLine = {
  points: [[0, 0], [20, 5]] as [number, number][],
  closed: false,
};
const art: Artwork = { widthMm: 100, heightMm: 100, polylines: [closedSquare, openLine] };

// Open polyline passes through unchanged.
{
  const r = hatch.apply(art, { ...hatch.defaults, keepOutline: false }, 1);
  assert.ok(r.polylines.some((l) => !l.closed && l.points.length === 2 && l.points[1][0] === 20),
    "open line survives unchanged");
}

// keepOutline=true → outline present + fill added; fill inherits stroke.
{
  const r = hatch.apply(art, { ...hatch.defaults, keepOutline: true, spacingMm: 2 }, 1);
  const outline = r.polylines.find((l) => l.closed);
  assert.ok(outline, "outline kept");
  const fills = r.polylines.filter((l) => !l.closed && l !== openLine);
  assert.ok(fills.length >= 1, "fill produced");
  assert.ok(fills.every((f) => f.stroke === "#1a3a52"), "fill inherits source stroke");
}

// More layers → at least as many fill polylines as one layer.
{
  const one = hatch.apply(art, { ...hatch.defaults, keepOutline: false, layers: 1, spacingMm: 2 }, 1);
  const three = hatch.apply(art, { ...hatch.defaults, keepOutline: false, layers: 3, spacingMm: 2 }, 1);
  const fillCount = (a: Artwork) => a.polylines.filter((l) => l.points[1]?.[0] !== 20).length;
  assert.ok(fillCount(three) > fillCount(one), "3 layers add more fill than 1");
}

// Degenerate closed polyline (2 points) passes through, no crash.
{
  const degenerate: Artwork = {
    widthMm: 10, heightMm: 10,
    polylines: [{ points: [[0, 0], [5, 5]], closed: true }],
  };
  const r = hatch.apply(degenerate, hatch.defaults, 1);
  assert.equal(r.polylines.length, 1, "degenerate passes through");
}

console.log("hatch distortion: all checks passed ✓");
