// src/plotter/penSplit.ts
import type { Polyline } from "../generators/types";

export type PenGroup = { stroke: string; polylines: Polyline[] };
const DEFAULT_STROKE = "#000000";

/** Partition by distinct stroke (undefined → #000000); group order = first appearance. */
export function splitByStroke(polylines: Polyline[]): PenGroup[] {
  const order: string[] = [];
  const map = new Map<string, Polyline[]>();
  for (const pl of polylines) {
    const key = pl.stroke ?? DEFAULT_STROKE;
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key)!.push(pl);
  }
  return order.map((stroke) => ({ stroke, polylines: map.get(stroke)! }));
}
