import assert from "node:assert";
import { reorder } from "../src/ui/hooks/useDragReorder.ts";
assert.deepStrictEqual(reorder(["a","b","c"], 0, 2), ["b","c","a"]);
assert.deepStrictEqual(reorder(["a","b","c"], 2, 0), ["c","a","b"]);
assert.deepStrictEqual(reorder(["a","b","c"], 1, 1), ["a","b","c"]);
console.log("ok");
