// src/plotter/penSplit.ts
import type { Polyline } from "../generators/types";

export type PenGroup = { stroke: string; polylines: Polyline[] };
const DEFAULT_STROKE = "#000000";

export type SplitOpts = {
  /**
   * Strokes that should plot FIRST, in this order. Anything not listed keeps the
   * default (darkest-first) order after them. Use this to pin an exact pen sequence;
   * omit it to get the sensible default below.
   */
  first?: string[];
};

/** Case-insensitive #hex compare so "#000000" and "#000" style casing don't split pens. */
const norm = (s: string): string => s.trim().toLowerCase();

/** Relative luminance of a #rgb / #rrggbb stroke (0 = black … 1 = white). Non-hex → 0.5. */
function luminance(stroke: string): number {
  let h = stroke.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return 0.5;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Partition by distinct stroke (undefined → #000000). Group order is deterministic so
 * "which colour plots first" is predictable, not seed-dependent:
 *   1. strokes listed in `opts.first`, in that order;
 *   2. then everything else DARKEST-FIRST — the outline/key pen (near-black) lays down
 *      before the lighter accents register onto it. Ties break by first appearance.
 */
export function splitByStroke(polylines: Polyline[], opts: SplitOpts = {}): PenGroup[] {
  const first = (opts.first ?? []).map(norm);
  const order: string[] = [];
  const map = new Map<string, Polyline[]>();
  for (const pl of polylines) {
    const key = pl.stroke ?? DEFAULT_STROKE;
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key)!.push(pl);
  }
  const pinned = (stroke: string): number => {
    const i = first.indexOf(norm(stroke));
    return i === -1 ? Infinity : i;
  };
  const sorted = order
    .map((stroke, idx) => ({ stroke, idx }))
    .sort((a, b) =>
      (pinned(a.stroke) - pinned(b.stroke)) ||
      (luminance(a.stroke) - luminance(b.stroke)) ||
      (a.idx - b.idx),
    );
  return sorted.map(({ stroke }) => ({ stroke, polylines: map.get(stroke)! }));
}
