// AxiDraw bridge client tests — mocked fetch.
// Usage: npx tsx scripts/axidraw-bridge-test.ts
import {
  AxiDrawBridge,
  bboxFrameSvg,
  BridgeUnreachable,
} from "../src/plotter/axidrawBridge";

let fails = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    fails++;
    console.log(`  FAIL ${name}  ${detail}`);
  }
};

type Call = { url: string; method: string; body?: string; ctype?: string };
let calls: Call[] = [];

function mockFetch(response: { ok?: boolean; status?: number; json?: unknown }) {
  calls = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body as string | undefined,
      ctype: (init?.headers as Record<string, string>)?.["Content-Type"],
    });
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.json ?? {},
    } as Response;
  }) as typeof fetch;
}

function failFetch() {
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
}

async function main() {
  const b = new AxiDrawBridge("http://127.0.0.1:4760");

  // --- status (GET) ---
  mockFetch({ json: { ok: true, plotting: false, port: "/dev/x", model: 6, scale: 1.25, profiles: ["pencil", "felt"] } });
  const st = await b.status();
  console.log("status()");
  check("GET /status", calls[0].method === "GET" && calls[0].url.endsWith("/status"), calls[0]?.url);
  check("parses plotting flag", st.plotting === false);
  check("parses model", st.model === 6);

  // --- pen-up with profile -> query param ---
  mockFetch({ json: { ok: true, message: "raised" } });
  await b.penUp("felt");
  console.log("penUp('felt')");
  check("POST /pen-up?profile=felt", calls[0].method === "POST" && calls[0].url.endsWith("/pen-up?profile=felt"), calls[0]?.url);

  // --- plot sends SVG body + svg content-type ---
  mockFetch({ json: { ok: true, message: "done" } });
  const svg = '<svg width="10mm" height="10mm" viewBox="0 0 10 10"></svg>';
  await b.plot(svg, "pencil");
  console.log("plot()");
  check("POST /plot with profile", calls[0].url.includes("/plot?") && calls[0].url.includes("profile=pencil"), calls[0]?.url);
  check("sends svg body", calls[0].body === svg);
  check("svg content-type", calls[0].ctype === "image/svg+xml");

  // --- plot with speed/accel overrides ---
  mockFetch({ json: { ok: true } });
  await b.plot(svg, "pencil", 30, 25);
  console.log("plot(speed,accel)");
  check("speed + accel in query", calls[0].url.includes("speed=30") && calls[0].url.includes("accel=25"), calls[0]?.url);

  // --- set-zero / align / home / stop / outline route correctly ---
  mockFetch({ json: { ok: true } });
  await b.setZero();
  check("POST /set-zero", calls[0].url.endsWith("/set-zero") && calls[0].method === "POST");
  mockFetch({ json: { ok: true } });
  await b.align();
  check("POST /align", calls[0].url.endsWith("/align"));
  mockFetch({ json: { ok: true } });
  await b.home();
  check("POST /home", calls[0].url.endsWith("/home"));
  mockFetch({ json: { ok: true } });
  await b.stop();
  check("POST /stop", calls[0].url.endsWith("/stop"));
  mockFetch({ json: { ok: true } });
  await b.outline(svg, "felt");
  check("dry outline → profile + dry=1 + body", calls[0].url.includes("profile=felt") && calls[0].url.includes("dry=1") && calls[0].body === svg, calls[0]?.url);
  mockFetch({ json: { ok: true } });
  await b.outline(svg, "pencil", false);
  check("draw frame → dry=0", calls[0].url.includes("dry=0"), calls[0]?.url);

  // --- non-2xx surfaces the error message ---
  mockFetch({ ok: false, status: 500, json: { ok: false, message: "axicli timed out" } });
  let threw = "";
  try {
    await b.plot(svg);
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e);
  }
  console.log("error handling");
  check("rejects on !ok with server message", threw === "axicli timed out", threw);

  // --- network failure => BridgeUnreachable ---
  failFetch();
  let unreachable = false;
  try {
    await b.status();
  } catch (e) {
    unreachable = e instanceof BridgeUnreachable;
  }
  check("network failure => BridgeUnreachable", unreachable);

  // --- bboxFrameSvg geometry ---
  console.log("bboxFrameSvg");
  const frame = bboxFrameSvg(10, 20, 40, 30, 200, 150);
  check("page width mm", frame.includes('width="200mm"'), frame.slice(0, 120));
  check("page viewBox", frame.includes('viewBox="0 0 200 150"'));
  check("rect corners", frame.includes("M 10,20 L 50,20 L 50,50 L 10,50 Z"), frame);

  if (fails) {
    console.log(`\n${fails} test(s) failed`);
    process.exit(1);
  }
  console.log("\nall axidraw-bridge client tests passed");
}

main();
