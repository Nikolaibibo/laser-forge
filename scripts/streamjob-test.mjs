// Test runner for streamJob. Run: npx tsx scripts/streamjob-test.mjs
const { streamJob } = await import("../src/plotter/streamJob.ts");

let pass = 0;
let fail = 0;

const t = (name, fn) => {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.then(
        () => { console.log(`✓ ${name}`); pass++; },
        (e) => { console.log(`✗ ${name}\n    ${e.message}`); fail++; }
      );
    }
    console.log(`✓ ${name}`);
    pass++;
  } catch (e) {
    console.log(`✗ ${name}\n    ${e.message}`);
    fail++;
  }
  return Promise.resolve();
};

const eq = (actual, expected, msg = "") => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n    expected: ${e}\n    actual:   ${a}`);
};

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg || "assertion failed");
};

// --- Tests ---

await t("all lines are sent and onProgress final done equals total", async () => {
  const sent = [];
  const port = {
    connected: true,
    async send(line) {
      sent.push(line);
      return "ok";
    },
  };
  const lines = ["G21", "G90", "G0 X0 Y0"];
  let lastDone = 0;
  let lastTotal = 0;
  await streamJob(port, lines, {
    onProgress(done, total) {
      lastDone = done;
      lastTotal = total;
    },
  });
  eq(sent, lines, "sent lines should match input");
  eq(lastDone, lines.length, "final done should equal total");
  eq(lastTotal, lines.length, "final total should equal lines.length");
});

await t("aborted signal throws and does NOT send any lines", async () => {
  const sent = [];
  const port = {
    connected: true,
    async send(line) {
      sent.push(line);
      return "ok";
    },
  };
  const ac = new AbortController();
  ac.abort();
  let threw = false;
  try {
    await streamJob(port, ["G21", "G90"], { signal: ac.signal });
  } catch (e) {
    threw = true;
    assert(e.message === "aborted", `expected "aborted", got "${e.message}"`);
  }
  assert(threw, "streamJob should throw when signal already aborted");
  eq(sent, [], "no lines should be sent when already aborted");
});

await t("aborted signal with penUp attempts penUp command before throwing", async () => {
  const sent = [];
  const port = {
    connected: true,
    async send(line) {
      sent.push(line);
      return "ok";
    },
  };
  const ac = new AbortController();
  ac.abort();
  let threw = false;
  try {
    await streamJob(port, ["G21", "G90"], { signal: ac.signal, penUp: "M3 S20" });
  } catch (e) {
    threw = true;
    assert(e.message === "aborted", `expected "aborted", got "${e.message}"`);
  }
  assert(threw, "should throw when signal already aborted");
  eq(sent, ["M3 S20"], "penUp should be attempted before throwing");
});

await t("penUp error on abort is swallowed, still throws aborted", async () => {
  const port = {
    connected: true,
    async send(_line) {
      throw new Error("port error");
    },
  };
  const ac = new AbortController();
  ac.abort();
  let threw = false;
  let thrownMsg = "";
  try {
    await streamJob(port, ["G21"], { signal: ac.signal, penUp: "M3 S20" });
  } catch (e) {
    threw = true;
    thrownMsg = e.message;
  }
  assert(threw, "should still throw");
  assert(thrownMsg === "aborted", `expected "aborted", got "${thrownMsg}"`);
});

await t("ALARM response causes throw", async () => {
  const port = {
    connected: true,
    async send(_line) {
      return "error:ALARM:1";
    },
  };
  let threw = false;
  let thrownMsg = "";
  try {
    await streamJob(port, ["G0 X10 Y10"], {});
  } catch (e) {
    threw = true;
    thrownMsg = e.message;
  }
  assert(threw, "should throw on ALARM response");
  assert(
    thrownMsg.startsWith("GRBL alarm:"),
    `expected message starting with "GRBL alarm:", got "${thrownMsg}"`
  );
});

await t("ALARM response includes response in message", async () => {
  const resp = "ALARM:hard limit";
  const port = {
    connected: true,
    async send(_line) {
      return resp;
    },
  };
  let thrownMsg = "";
  try {
    await streamJob(port, ["G0 X10 Y10"], {});
  } catch (e) {
    thrownMsg = e.message;
  }
  assert(
    thrownMsg === `GRBL alarm: ${resp}`,
    `expected "GRBL alarm: ${resp}", got "${thrownMsg}"`
  );
});

await t("empty lines array resolves immediately", async () => {
  const port = {
    connected: true,
    async send(_line) { return "ok"; },
  };
  await streamJob(port, [], {});
  // no throw = pass
});

await t("onProgress is called once per line in order", async () => {
  const progress = [];
  const port = {
    connected: true,
    async send(_line) { return "ok"; },
  };
  const lines = ["A", "B", "C"];
  await streamJob(port, lines, {
    onProgress(done, total) { progress.push([done, total]); },
  });
  eq(progress, [[1, 3], [2, 3], [3, 3]], "progress should be called 3 times");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
