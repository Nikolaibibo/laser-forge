import assert from "node:assert";
import { useApp } from "../src/state/store.ts";

const s = () => useApp.getState();

// default selection is the source
assert.strictEqual(s().selectedNodeId, "source");

// switching generator selects source + leaves genParams settable
s().setGenParams("flow-field", { lineCount: 40 });
assert.deepStrictEqual(s().genParams["flow-field"], { lineCount: 40 });
s().setSelectedNode("xyz");
s().setGenerator("rose");
assert.strictEqual(s().selectedNodeId, "source");
assert.strictEqual(s().generatorId, "rose");

// adding a layer selects it
s().clearLayers();
s().addLayer("chaikin");
const uid = s().layers[0].uid;
assert.strictEqual(s().selectedNodeId, uid);

// removing the selected layer falls back to source
s().removeLayer(uid);
assert.strictEqual(s().selectedNodeId, "source");
console.log("ok");
