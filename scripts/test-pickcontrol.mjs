import assert from "node:assert";
import { pickControl } from "../src/ui/controls/SchemaControls.tsx";

assert.strictEqual(pickControl({ value: 5, min: 0, max: 10, step: 1 }), "number");
assert.strictEqual(pickControl({ value: 5 }), "number");
assert.strictEqual(pickControl({ value: true }), "toggle");
assert.strictEqual(pickControl({ value: "a", options: ["a", "b", "c"] }), "segmented");
assert.strictEqual(pickControl({ value: 0, options: [0, 90, 180, 270] }), "segmented");
assert.strictEqual(pickControl({ value: "a", options: ["a","b","c","d","e"] }), "select");
assert.strictEqual(pickControl({ value: "#ff0000" }), "color");
assert.strictEqual(pickControl({ value: "hello" }), "text");
assert.strictEqual(pickControl({ value: "x", rows: 8 }), "text");
console.log("ok");
