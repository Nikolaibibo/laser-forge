import assert from "node:assert";
import { encodePayload, decodePayload } from "../src/state/urlSync.ts";
const payload = {
  g: "flow-field", s: 42, w: 200, h: 200,
  p: { "flow-field": { lineCount: 80, noiseScale: 0.01 } },
  l: [], lp: {}, pw: 0.3,
};
const round = decodePayload(encodePayload(payload));
assert.deepStrictEqual(round.p, payload.p);
assert.strictEqual(round.g, "flow-field");
console.log("ok");
