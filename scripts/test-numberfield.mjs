import assert from "node:assert";
import { clampStep } from "../src/ui/controls/NumberField.tsx";

assert.strictEqual(clampStep(7, 1, 10, 1), 7);
assert.strictEqual(clampStep(11, 1, 10, 1), 10);   // clamp max
assert.strictEqual(clampStep(-3, 0, 10, 1), 0);    // clamp min
assert.strictEqual(clampStep(0.024, 0, 1, 0.01), 0.02); // snap to step
assert.strictEqual(clampStep(5.6, undefined, undefined, undefined), 5.6); // free
console.log("ok");
