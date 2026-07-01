// scripts/blueprint-test.ts — layout + determinism checks for the blueprint generator.
// Usage: npx tsx scripts/blueprint-test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { blueprint } from "../src/generators/blueprint";
import { parseSvgMotif } from "../src/util/svgImport";
import { useApp } from "../src/state/store";
import { svgExport } from "../src/render/svgExport";
import { parseMeta } from "../src/util/blueprintMeta";
import { PAGE_FORMATS, pageFormatSize, detectPageFormat } from "../src/util/pageFormats";

const here = dirname(fileURLToPath(import.meta.url));
const canvas = { wMm: 148, hMm: 210 }; // A5 portrait
const P = { ...blueprint.defaults };

// 1. no motif → placeholder renders, artwork spans canvas
useApp.getState().setMotif(null);
{
  const art = blueprint.generate(P, 1, canvas);
  assert.equal(art.widthMm, 148);
  assert.equal(art.heightMm, 210);
  assert.ok(art.polylines.length > 0, "expected polylines with placeholder motif");
}
// 2. frame is the first polyline: closed, at frameInsetMm
{
  const art = blueprint.generate(P, 1, canvas);
  const f = art.polylines[0];
  assert.equal(f.closed, true);
  assert.deepEqual(f.points[0], [P.frameInsetMm, P.frameInsetMm]);
}
// 3. slot collapse: empty subtitle → fewer polylines than with subtitle
{
  const a = blueprint.generate({ ...P, subtitle: "" }, 1, canvas);
  const b = blueprint.generate({ ...P, subtitle: "Manual-Wind Chronograph" }, 1, canvas);
  assert.ok(b.polylines.length > a.polylines.length, "subtitle should add polylines");
}
// 4. accentTarget frame → frame polyline carries accentColor
{
  const art = blueprint.generate({ ...P, accentTarget: "frame" as const }, 1, canvas);
  assert.equal(art.polylines[0].stroke, P.accentColor);
}
// 5. corner marks add exactly 8 segments
{
  const a = blueprint.generate({ ...P, cornerMarks: false }, 1, canvas);
  const b = blueprint.generate({ ...P, cornerMarks: true }, 1, canvas);
  assert.equal(b.polylines.length - a.polylines.length, 8);
}
// 6. motif embedding: all points stay inside the canvas
{
  const fixture = readFileSync(join(here, "fixtures/motif-gear.svg"), "utf8");
  useApp.getState().setMotif({ name: "gear", ...parseSvgMotif(fixture) });
  const art = blueprint.generate(P, 1, canvas);
  for (const l of art.polylines) {
    for (const [x, y] of l.points) {
      assert.ok(x >= 0 && x <= 148 && y >= 0 && y <= 210, `point outside canvas: ${x},${y}`);
    }
  }
}
// 7. determinism: identical SVG bytes on repeat generate
{
  const s1 = svgExport(blueprint.generate(P, 7, canvas), {});
  const s2 = svgExport(blueprint.generate(P, 7, canvas), {});
  assert.equal(s1, s2);
}

// 8. vertical overflow: extreme params on 80×80 — text must never overlap the motif slot
{
  useApp.getState().setMotif(null);
  const art = blueprint.generate(
    { ...P, header: "TIMEPIECE", subtitle: "Manual-Wind Chronograph", meta: "27mm . 17 Jewels", footer: "PLOTTED 2026", titleSize: 10, frameInsetMm: 25 },
    1,
    { wMm: 80, hMm: 80 },
  );
  // placeholder = last 3 polylines (box + 2 diagonals)
  const box = art.polylines[art.polylines.length - 3];
  assert.equal(box.closed, true);
  const ys = box.points.map((pt) => pt[1]);
  const boxTop = Math.min(...ys), boxBot = Math.max(...ys);
  assert.ok(boxBot - boxTop >= 2, `motif slot too small: ${boxBot - boxTop}`);
  // every text polyline (not frame idx 0, not last 3) stays fully outside the slot's y-range
  for (let i = 1; i < art.polylines.length - 3; i++) {
    for (const [, y] of art.polylines[i].points) {
      assert.ok(y <= boxTop + 1e-6 || y >= boxBot - 1e-6, `text intrudes motif slot at y=${y} (slot ${boxTop}..${boxBot}, polyline ${i})`);
    }
  }
}
// 9. multi-line title via \n renders in-bounds and deterministically
{
  const a = blueprint.generate({ ...P, title: "OMEGA\nCALIBER 321" }, 1, canvas);
  const b = blueprint.generate({ ...P, title: "OMEGA\nCALIBER 321" }, 1, canvas);
  assert.deepEqual(a, b);
  for (const l of a.polylines) for (const [x, y] of l.points) {
    assert.ok(x >= 0 && x <= 148 && y >= 0 && y <= 210);
  }
}
// 10. umlauts synthesized (Ö = O + 2 diaeresis dashes), ß expands to ss
{
  const a = blueprint.generate({ ...P, footer: "BORNSEN" }, 1, canvas);
  const b = blueprint.generate({ ...P, footer: "BÖRNSEN" }, 1, canvas);
  assert.equal(b.polylines.length - a.polylines.length, 2, "Ö should add exactly 2 dash strokes");
  const c = blueprint.generate({ ...P, footer: "Straße" }, 1, canvas);
  const d = blueprint.generate({ ...P, footer: "Strasse" }, 1, canvas);
  assert.equal(c.polylines.length, d.polylines.length, "ß should lay out like ss");
}
// 11. motif rotation: 180° = point-rotated (not mirrored), same count, still in slot; 0° unchanged
{
  const fixture = readFileSync(join(here, "fixtures/motif-gear.svg"), "utf8");
  useApp.getState().setMotif({ name: "gear", ...parseSvgMotif(fixture) });
  const r0 = blueprint.generate({ ...P, motifRotation: 0 as const }, 1, canvas);
  const r180 = blueprint.generate({ ...P, motifRotation: 180 as const }, 1, canvas);
  assert.equal(r0.polylines.length, r180.polylines.length);
  // gear fixture is not 180°-symmetric around its center? It nearly is — use the
  // asymmetric inner bar (M 40 50 L 60 50 sits left-weighted): compare first motif
  // polyline's first point — must differ between 0° and 180°.
  const m0 = r0.polylines[r0.polylines.length - 3].points[0];
  const m180 = r180.polylines[r180.polylines.length - 3].points[0];
  assert.notDeepEqual(m0, m180, "180° rotation should move motif points");
  for (const l of r180.polylines) for (const [x, y] of l.points) {
    assert.ok(x >= 0 && x <= 148 && y >= 0 && y <= 210, `rotated point outside canvas: ${x},${y}`);
  }
  // 90°: portrait/landscape swap still fits
  const r90 = blueprint.generate({ ...P, motifRotation: 90 as const }, 1, canvas);
  for (const l of r90.polylines) for (const [x, y] of l.points) {
    assert.ok(x >= 0 && x <= 148 && y >= 0 && y <= 210);
  }
}

// 12. independent per-field sizing: headerSize scales the header cap height alone
{
  useApp.getState().setMotif(null);
  const iso = { ...P, title: "", meta: "", subtitleShow: false, footerShow: false, frameStyle: "none" as const, motifScale: 0 };
  // real (non-degenerate) polylines only — drops the motifScale:0 placeholder point
  const capH = (sz: number) => {
    const ys = blueprint.generate({ ...iso, header: "SPEC", headerSize: sz }, 1, canvas)
      .polylines.filter((l) => l.points.some((p) => p[0] !== l.points[0][0] || p[1] !== l.points[0][1]))
      .flatMap((l) => l.points.map((p) => p[1]));
    return Math.max(...ys) - Math.min(...ys);
  };
  assert.ok(capH(5) > capH(1) * 2, `headerSize should scale independently: ${capH(5)} vs ${capH(1)}`);
}
// 13. per-field show toggle collapses that field
{
  const iso = { ...P, title: "", meta: "", frameStyle: "none" as const, motifScale: 0, header: "SPEC" };
  const on = blueprint.generate({ ...iso, headerShow: true }, 1, canvas).polylines.length;
  const off = blueprint.generate({ ...iso, headerShow: false }, 1, canvas).polylines.length;
  assert.ok(on > off, "headerShow=false should collapse the header");
}
// 14. textAlign shifts the whole block horizontally
{
  const iso = { ...P, title: "", meta: "", frameStyle: "none" as const, motifScale: 0, header: "A" };
  const minX = (a: "left" | "right") =>
    Math.min(...blueprint.generate({ ...iso, textAlign: a }, 1, canvas).polylines.flatMap((l) => l.points.map((p) => p[0])));
  assert.ok(minX("left") < minX("right") - 5, "left align should sit further left than right");
}
// 15. frameStyle: none has no frame rect, double adds an inner rect
{
  const rects = (fs: "none" | "single" | "double") =>
    blueprint.generate({ ...P, frameStyle: fs }, 1, canvas).polylines.filter((l) => l.closed && l.points.length === 4).length;
  assert.equal(rects("none"), rects("single") - 1, "none = single - 1 rect");
  assert.equal(rects("double"), rects("single") + 1, "double = single + 1 rect");
}
// 16. pen-width guard: small cap warns at a fat pen, clean at a thin one; geometry unchanged
{
  useApp.getState().setMotif(null);
  const warns = (pen: number) =>
    blueprint.generate({ ...P, meta: "" }, 1, { wMm: 148, hMm: 210, penWidthMm: pen }).warnings ?? [];
  // titleSize 3.8% of 210 = 7.98mm: at a 1mm pen (min 8mm) it warns; at 0.3mm (min 2.4mm) it doesn't.
  assert.ok(warns(1.0).some((w) => w.startsWith("Title")), "fat pen should warn on a small title");
  assert.ok(!warns(0.3).some((w) => w.startsWith("Title")), "thin pen should not warn on the title");
  const g = (pen: number) => blueprint.generate({ ...P, meta: "" }, 1, { wMm: 148, hMm: 210, penWidthMm: pen }).polylines.length;
  assert.equal(g(1.0), g(0.3), "pen width must not change geometry (warnings are side-info)");
}
// 17. editable dual-layer export + metadata round-trip
{
  const params = { ...P, header: "SPEC", meta: "A · B & <C>" };
  const art = blueprint.generate(params, 1, canvas);
  const ed = svgExport(art); // editableText defaults true
  const flat = svgExport(art, { editableText: false });
  const n = (s: string, re: RegExp) => (s.match(re) || []).length;
  assert.ok(ed.includes('<metadata id="lf-blueprint">') && ed.includes('inkscape:label="text"'), "editable export has metadata + text layer");
  assert.equal(n(ed, /<text /g), art.labels!.length, "one <text> per shown label");
  assert.equal(n(ed, /<path /g), n(flat, /<path /g), "the text layer adds no plot paths");
  assert.ok(ed.includes("A · B &amp; &lt;C&gt;"), "text content is XML-escaped");
  assert.ok(!flat.includes("<text") && !flat.includes("<metadata"), "flat export is plain");
  const rt = parseMeta(ed);
  assert.ok(rt && rt.generator === "blueprint", "round-trip finds the source");
  assert.deepEqual(rt!.params, params, "round-trip params deep-equal the originals");
  assert.equal(parseMeta(flat), null, "flat export has no metadata to parse");
}
// 18. page-format presets
{
  assert.deepEqual(pageFormatSize("a4-landscape"), { wMm: 297, hMm: 210 });
  assert.deepEqual(pageFormatSize("a4-portrait"), { wMm: 210, hMm: 297 });
  assert.equal(pageFormatSize("custom"), null);
  assert.equal(detectPageFormat(297, 210), "a4-landscape");
  assert.equal(detectPageFormat(200, 200), "custom");
  assert.equal(PAGE_FORMATS.length, 8);
}

console.log("blueprint: all checks passed ✓");
