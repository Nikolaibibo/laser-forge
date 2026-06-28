import assert from "node:assert";
import { schemaDefaults, localKey, resolveVisibility } from "../src/ui/controls/schema.ts";

// schemaDefaults pulls .value from every entry
const schema = {
  count: { value: 5, min: 1, max: 10, step: 1 },
  label: { value: "hi" },
  colorCount: { value: 1, min: 1, max: 6, step: 1 },
  color2: { value: "#fff", render: (get) => get("Gen.colorCount") >= 2 },
};
assert.deepStrictEqual(schemaDefaults(schema), { count: 5, label: "hi", colorCount: 1, color2: "#fff" });

// localKey strips folder prefix
assert.strictEqual(localKey("Text Ribbons.colorCount"), "colorCount");
assert.strictEqual(localKey("colorCount"), "colorCount");

// resolveVisibility honors render() against current values
assert.deepStrictEqual(
  resolveVisibility(schema, { count: 5, label: "hi", colorCount: 1, color2: "#fff" }).sort(),
  ["colorCount", "count", "label"],
);
assert.deepStrictEqual(
  resolveVisibility(schema, { count: 5, label: "hi", colorCount: 3, color2: "#fff" }).sort(),
  ["color2", "colorCount", "count", "label"],
);
console.log("ok");
