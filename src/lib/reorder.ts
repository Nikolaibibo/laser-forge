/**
 * Pure helper: move item at `from` to position `to` in a new array.
 * Examples:
 *   reorder(["a","b","c"], 0, 2) => ["b","c","a"]
 *   reorder(["a","b","c"], 2, 0) => ["c","a","b"]
 *   reorder(["a","b","c"], 1, 1) => ["a","b","c"]  (no-op)
 */
export function reorder<T>(list: T[], from: number, to: number): T[] {
  if (from === to) return list.slice();
  const result = list.slice();
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}
