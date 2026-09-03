// Root-cause probe for the hatch artifact: split-row chain assignment.
// Run: npx tsx repro-hatch.ts
import { hatchPolygon, linkBoustrophedon, type ScanRow } from "../src/util/hatch";
import type { Point } from "../src/generators/types";

const len = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
};

// ---------------------------------------------------------------------------
// A) Kern des Fehlers, isoliert auf linkBoustrophedon.
// Eine breite Reihe spaltet sich in zwei Spans (wie am Loch/an der Kerbe).
// Der Stift verlaesst Reihe 0 am RECHTEN Ende (x=33). Die Kette muss in den
// RECHTEN Span weiterlaufen; der linke gehoert in eine neue Kette.
// ---------------------------------------------------------------------------
{
  const rows: ScanRow[] = [
    { y: 0.0, spans: [[-33, 33]] },
    { y: 1.2, spans: [[-33, -5], [5, 33]] },
  ];
  const chains = linkBoustrophedon(rows);
  // Reihe 0 wird als [-33,0]->[33,0] gezeichnet, Stift endet also bei x=33.
  // Die fortgesetzte Kette ist die mit 4 Punkten (2 Reihen); die Reihenfolge in
  // `done` haengt an der Span-Ordnung, also nicht auf Index 0 verlassen.
  const cont = chains.find((c) => c.length >= 4);
  check("Split-Reihe: eine Kette wird ueberhaupt fortgesetzt", !!cont,
    `Kettenlaengen ${chains.map((c) => c.length).join(",")}`);
  const first = cont ?? chains[0];
  const exit = first[1];            // Ende der ersten Reihe
  const entry = first[2];           // erster Punkt der zweiten Reihe
  const connector = entry ? len(exit, entry) : NaN;
  const nearestPossible = Math.min(
    Math.abs(exit[0] - -33), Math.abs(exit[0] - -5),
    Math.abs(exit[0] - 5), Math.abs(exit[0] - 33),
  );
  check(
    "Split-Reihe: Kette laeuft in den naeheren Span weiter",
    connector < 5,
    `Verbinder ${connector.toFixed(2)}mm, naechstmoeglich ~${nearestPossible.toFixed(2)}mm, ` +
    `Eintritt bei x=${entry?.[0]}`,
  );
}

// ---------------------------------------------------------------------------
// B) Ende-zu-Ende auf der Logo-Topologie: Ring mit radialem Schlitz.
// Legitime Verbinder folgen dem Rand. Auf einem Kreis mit R=40 und
// Reihenabstand s betraegt der Randversatz pro Reihe hoechstens ~sqrt(2*R*s),
// also ~10mm. Alles deutlich darueber schneidet quer durch die Flaeche.
// ---------------------------------------------------------------------------
function slitBand(rOuter: number, rInner: number, gapDeg: number, steps = 240): Point[] {
  const a0 = (gapDeg / 2) * (Math.PI / 180);
  const a1 = 2 * Math.PI - a0;
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = a0 + ((a1 - a0) * i) / steps;
    pts.push([rOuter * Math.cos(t), rOuter * Math.sin(t)]);
  }
  for (let i = steps; i >= 0; i--) {
    const t = a0 + ((a1 - a0) * i) / steps;
    pts.push([rInner * Math.cos(t), rInner * Math.sin(t)]);
  }
  return pts;
}

const SPACING = 1.2;
const R = 40;
const LIMIT = Math.sqrt(2 * R * SPACING) * 1.25; // ~12.3mm, Randversatz + Reserve

for (const [name, poly] of [
  ["slitBand", slitBand(R, 22, 30)],
  ["disc", Array.from({ length: 240 }, (_, i) => {
    const t = (2 * Math.PI * i) / 240;
    return [R * Math.cos(t), R * Math.sin(t)] as Point;
  })],
] as [string, Point[]][]) {
  for (const ang of [0, 30, 45, 60, 90, 120, 135]) {
    let worst = 0, at = "";
    for (const run of hatchPolygon(poly, ang, SPACING)) {
      const pts = run.points;
      for (let k = 1; k + 1 < pts.length; k += 2) {
        const d = len(pts[k], pts[k + 1]);
        if (d > worst) {
          worst = d;
          at = `(${pts[k][0].toFixed(1)},${pts[k][1].toFixed(1)})->` +
               `(${pts[k + 1][0].toFixed(1)},${pts[k + 1][1].toFixed(1)})`;
        }
      }
    }
    check(
      `${name} @${String(ang).padStart(3)}deg: kein Verbinder quer durch die Flaeche`,
      worst <= LIMIT,
      `laengster ${worst.toFixed(2)}mm (Limit ${LIMIT.toFixed(2)}) ${at}`,
    );
  }
}

console.log(`\n${failures} von ${failures + 0} Checks fehlgeschlagen: ${failures}`);
process.exit(failures > 0 ? 1 : 0);
