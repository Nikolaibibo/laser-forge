import { useRef, useState } from "react";
import type { Artwork } from "../generators/types";
import { PlotterPort } from "../plotter/webserial";
import { Grbl } from "../plotter/grbl";
import { artworkToGcode, outlineGcode, bbox, DEFAULT_PEN } from "../plotter/gcode";
import { streamJob } from "../plotter/streamJob";

export function PlotterPanel({ artwork }: { artwork: Artwork }) {
  const portRef = useRef<PlotterPort | null>(null);
  const grblRef = useRef<Grbl | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState("Disconnected");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [feed, setFeed] = useState(4500);
  const [step, setStep] = useState(10);

  if (!PlotterPort.available()) {
    return <div style={box}>Plotter: needs Chrome/Edge (WebSerial).</div>;
  }

  async function connect() {
    const port = new PlotterPort();
    port.onStatus((s) => setState(s.state));
    port.onDisconnect(() => {
      setConnected(false);
      setState("Disconnected");
      abortRef.current?.abort();
    });
    await port.connect();
    portRef.current = port;
    grblRef.current = new Grbl(port, { ...DEFAULT_PEN, feed });
    setConnected(true);
    setState("Idle");
  }

  const g = () => grblRef.current!;

  async function plot() {
    const lines = artworkToGcode(artwork, { ...DEFAULT_PEN, feed });
    abortRef.current = new AbortController();
    try {
      await streamJob(portRef.current!, lines, {
        signal: abortRef.current.signal,
        penUp: DEFAULT_PEN.penUp,
        onProgress: (done, total) => setProgress({ done, total }),
      });
    } catch (e) {
      console.warn("plot stopped", e);
    } finally {
      setProgress(null);
    }
  }

  async function outline() {
    try {
      await streamJob(
        portRef.current!,
        outlineGcode(bbox(artwork), { ...DEFAULT_PEN, feed }),
        {},
      );
    } catch (e) {
      console.warn("outline stopped", e);
    }
  }

  return (
    <div style={box}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <strong>Plotter</strong>
        <span style={{ color: state === "Alarm" ? "#e55" : "#6c6" }}>● {state}</span>
        {!connected ? (
          <button
            style={btn}
            onClick={() => connect().catch((e) => setState("err: " + e.message))}
          >
            Connect
          </button>
        ) : (
          <button style={btn} onClick={() => portRef.current?.disconnect()}>
            Disconnect
          </button>
        )}
      </div>
      {connected && (
        <>
          <div style={row}>
            <button style={btn} onClick={() => g().penUp()}>
              Pen up
            </button>
            <button style={btn} onClick={() => g().penDown()}>
              Pen down
            </button>
            <button style={btn} onClick={() => g().setOrigin()}>
              Set origin here
            </button>
          </div>
          <div style={row}>
            <button style={btn} onClick={() => g().jog(0, step)}>
              Y+
            </button>
            <button style={btn} onClick={() => g().jog(0, -step)}>
              Y−
            </button>
            <button style={btn} onClick={() => g().jog(-step, 0)}>
              X−
            </button>
            <button style={btn} onClick={() => g().jog(step, 0)}>
              X+
            </button>
            <select value={step} onChange={(e) => setStep(Number(e.target.value))}>
              <option value={1}>1mm</option>
              <option value={5}>5mm</option>
              <option value={10}>10mm</option>
            </select>
          </div>
          <div style={row}>
            <button style={btn} onClick={outline}>
              Outline
            </button>
            <button
              style={{ ...btn, background: "#e96a3a", color: "#fff" }}
              onClick={plot}
            >
              Plot
            </button>
            <button style={btn} onClick={() => abortRef.current?.abort()}>
              Stop
            </button>
            <label>
              Feed{" "}
              <input
                type="number"
                value={feed}
                onChange={(e) => setFeed(Number(e.target.value))}
                style={{ width: 64 }}
              />
            </label>
          </div>
          {progress && (
            <div>
              Plotting… {progress.done}/{progress.total} (
              {Math.round((progress.done / progress.total) * 100)}%)
            </div>
          )}
        </>
      )}
    </div>
  );
}

const box: React.CSSProperties = {
  padding: 12,
  borderTop: "1px solid #2d2d2a",
  background: "#141413",
  color: "#ccc",
  fontSize: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const row: React.CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  flexWrap: "wrap",
};
const btn: React.CSSProperties = {
  padding: "5px 10px",
  background: "#2d2d2a",
  color: "#eee",
  border: "1px solid #444",
  borderRadius: 3,
  cursor: "pointer",
};
