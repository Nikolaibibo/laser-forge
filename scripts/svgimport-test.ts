// scripts/svgimport-test.ts — checks for the vpype-flat SVG motif parser.
// Usage: npx tsx scripts/svgimport-test.ts
import assert from "node:assert/strict";
import { parseSvgMotif } from "../src/util/svgImport";

const wrap = (body: string, attrs = 'width="100mm" height="50mm" viewBox="0 0 100 50"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

// 1. absolute M/L, doc size from width/height
{
  const r = parseSvgMotif(wrap('<path d="M 0 0 L 10 0 L 10 5"/>'));
  assert.equal(r.widthMm, 100);
  assert.equal(r.heightMm, 50);
  assert.equal(r.polylines.length, 1);
  assert.deepEqual(r.polylines[0].points, [[0, 0], [10, 0], [10, 5]]);
  assert.equal(r.polylines[0].closed, false);
}
// 2. relative m/l + z closes
{
  const r = parseSvgMotif(wrap('<path d="m 5 5 l 10 0 l 0 10 z"/>'));
  assert.deepEqual(r.polylines[0].points, [[5, 5], [15, 5], [15, 15]]);
  assert.equal(r.polylines[0].closed, true);
}
// 3. multiple subpaths in one d
{
  const r = parseSvgMotif(wrap('<path d="M 0 0 L 1 1 M 5 5 L 6 6"/>'));
  assert.equal(r.polylines.length, 2);
}
// 4. polyline / polygon / line elements
{
  const r = parseSvgMotif(wrap('<polyline points="0,0 5,5 10,0"/><polygon points="0 0 4 0 4 4"/><line x1="1" y1="2" x2="3" y2="4"/>'));
  assert.equal(r.polylines.length, 3);
  assert.equal(r.polylines[0].closed, false);
  assert.equal(r.polylines[1].closed, true);
  assert.deepEqual(r.polylines[2].points, [[1, 2], [3, 4]]);
}
// 5. group translate (vpype layer groups)
{
  const r = parseSvgMotif(wrap('<g transform="translate(10,20)"><path d="M 0 0 L 1 0"/></g>'));
  assert.deepEqual(r.polylines[0].points, [[10, 20], [11, 20]]);
}
// 6. scientific notation + comma separators
{
  const r = parseSvgMotif(wrap('<path d="M 1e1,2.5e0 L 2e1,5"/>'));
  assert.deepEqual(r.polylines[0].points, [[10, 2.5], [20, 5]]);
}
// 7. curve commands rejected with vpype hint
assert.throws(() => parseSvgMotif(wrap('<path d="M 0 0 C 1 1 2 2 3 3"/>')), /unsupported path command/);
// 8. non-translate transform rejected
assert.throws(() => parseSvgMotif(wrap('<g transform="rotate(45)"><path d="M 0 0 L 1 1"/></g>')), /unsupported transform/);
// 9. viewBox units ≠ mm → scaled to mm
{
  const r = parseSvgMotif(wrap('<path d="M 0 0 L 200 100"/>', 'width="100mm" height="50mm" viewBox="0 0 200 100"'));
  assert.deepEqual(r.polylines[0].points, [[0, 0], [100, 50]]);
}
// 10. no drawable elements → throws
assert.throws(() => parseSvgMotif(wrap("")), /no drawable/);
// 11. not an svg → throws
assert.throws(() => parseSvgMotif("<html></html>"), /not an SVG/);
// 12. viewBox with non-zero minX/minY → offset subtracted
{
  const r = parseSvgMotif(wrap('<path d="M 50 20 L 50 30"/>', 'width="100mm" height="50mm" viewBox="50 20 100 50"'));
  assert.deepEqual(r.polylines[0].points, [[0, 0], [0, 10]]);
}
// 13. unit suffix px on width/height → actionable error; single-quoted attrs work; negative-exponent translate works
assert.throws(() => parseSvgMotif(wrap('<path d="M 0 0 L 1 1"/>', 'width="100px" height="50px" viewBox="0 0 100 50"')), /re-export in mm/);
{
  const r = parseSvgMotif(wrap("<g transform='translate(1e-2,0)'><path d='M 0 0 L 1 0'/></g>"));
  assert.deepEqual(r.polylines[0].points, [[0.01, 0], [1.01, 0]]);
}
// 14. cm units convert exactly (×10) and viewBox scale follows (vpype emits cm for larger docs)
{
  const r = parseSvgMotif(wrap('<path d="M 0 0 L 200 100"/>', 'width="10cm" height="5cm" viewBox="0 0 200 100"'));
  assert.equal(r.widthMm, 100);
  assert.equal(r.heightMm, 50);
  assert.deepEqual(r.polylines[0].points, [[0, 0], [100, 50]]);
}

console.log("svgImport: all checks passed ✓ (14)");
