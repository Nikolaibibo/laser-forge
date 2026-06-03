// scripts/stroke-test.mjs
import { svgExport } from "../src/render/svgExport.ts";
let failed = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); failed++; } };

const art = {
  widthMm: 100, heightMm: 100,
  polylines: [
    { points: [[0,0],[10,10]], closed: false },
    { points: [[0,0],[20,20]], closed: false, stroke: "#e0584f" },
  ],
};
const svg = svgExport(art);
ok(svg.includes('stroke="#e0584f"'), "colored polyline emits per-path stroke");
ok((svg.match(/<path /g) || []).length === 2, "two paths emitted");
const monoPath = svg.split("\n").find((l) => l.includes('d="M 0,0 L 10,10"'));
ok(monoPath && !monoPath.includes("stroke="), "mono polyline has no per-path stroke");

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
