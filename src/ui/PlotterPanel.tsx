import { useRef, useState } from "react";
import { useApp } from "../state/store";
import { PlotterPort } from "../plotter/webserial";
import { Grbl } from "../plotter/grbl";
import { artworkToGcode, outlineGcode, bbox, flipArtworkY, DEFAULT_PEN } from "../plotter/gcode";
import { streamJob } from "../plotter/streamJob";
import { mergePaths } from "../util/mergePaths";
import { splitByStroke } from "../plotter/penSplit";

export function PlotterPanel() {
  // Read the current artwork from the store (the panel lives outside the
  // key-remounted Stage so the connection survives generator switches).
  const artwork = useApp((s) => s.currentArtwork);
  const portRef = useRef<PlotterPort | null>(null);
  const grblRef = useRef<Grbl | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState("Disconnected");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [feed, setFeed] = useState(4500);
  const [step, setStep] = useState(10);
  const [joinPaths, setJoinPaths] = useState(true);

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
    if (!artwork) return;
    const polys = joinPaths ? mergePaths(artwork.polylines) : artwork.polylines;
    const merged = { ...artwork, polylines: polys };
    const lines = artworkToGcode(merged, { ...DEFAULT_PEN, feed });
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

  async function plotByColor() {
    if (!artwork) return;
    const groups = splitByStroke(artwork.polylines);
    abortRef.current = new AbortController();
    try {
      for (let gi = 0; gi < groups.length; gi++) {
        const grp = groups[gi];
        if (abortRef.current.signal.aborted) break;
        // Confirm the pen for EVERY group, incl. the first — so you always know which
        // colour is about to plot. For swaps (gi>0) lift + park first; origin is preserved.
        if (gi > 0) await g().park();
        const cont = window.confirm(
          `Stift ${gi + 1}/${groups.length} einsetzen: ${grp.stroke}\n\nOK = plotten · Abbrechen = stoppen.`,
        );
        if (!cont) {
          abortRef.current.abort();
          break;
        }
        const polys = joinPaths ? mergePaths(grp.polylines) : grp.polylines;
        const lines = artworkToGcode({ ...artwork, polylines: polys }, { ...DEFAULT_PEN, feed });
        await streamJob(portRef.current!, lines, {
          signal: abortRef.current.signal,
          penUp: DEFAULT_PEN.penUp,
          onProgress: (done, total) => setProgress({ done, total }),
        });
      }
    } catch (e) {
      console.warn("plot-by-color stopped", e);
    } finally {
      setProgress(null);
    }
  }

  async function outline(draw: boolean) {
    if (!artwork) return;
    const polys = joinPaths ? mergePaths(artwork.polylines) : artwork.polylines;
    const merged = { ...artwork, polylines: polys };
    try {
      // bbox in MACHINE space (y flipped) so the trace matches where the art will land
      await streamJob(
        portRef.current!,
        outlineGcode(bbox(flipArtworkY(merged)), { ...DEFAULT_PEN, feed }, draw),
        {},
      );
    } catch (e) {
      console.warn("outline stopped", e);
    }
  }

  async function goHome() {
    try {
      await g().park();
    } catch (e) {
      console.warn("go-to-origin failed", e);
    }
  }

  return (
    <div style={box}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <strong>Plotter</strong>
        <span style={{ color: state === "Alarm" ? "#d9383a" : "#2b7a4b" }}>● {state}</span>
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
            <button style={btn} onClick={goHome}>
              Go to origin
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
            <button style={btn} onClick={() => outline(true)}>
              Outline
            </button>
            <button style={btn} onClick={() => outline(false)}>
              Trace (dry)
            </button>
            <button
              style={{ ...btn, background: "var(--accent)", color: "#fff", borderColor: "transparent", fontWeight: 600 }}
              onClick={plot}
            >
              Plot
            </button>
            <button style={btn} onClick={plotByColor}>
              Plot by color
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
            <label
              title="Join open polylines whose endpoints touch into longer continuous paths, reducing pen lifts."
              style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={joinPaths}
                onChange={(e) => setJoinPaths(e.target.checked)}
              />
              Join paths
            </label>
          </div>
          {artwork && (() => {
            // Show the exact pen sequence "Plot by color" will use, so you know which
            // colour plots first before committing. Only meaningful for multi-pen artwork.
            const groups = splitByStroke(artwork.polylines);
            if (groups.length < 2) return null;
            return (
              <div style={{ ...row, flexWrap: "wrap", fontSize: 12 }}>
                <span style={{ opacity: 0.7 }}>Pen-Reihenfolge:</span>
                {groups.map((grp, i) => (
                  <span key={grp.stroke} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {i + 1}.
                    <span
                      title={grp.stroke}
                      style={{
                        width: 12, height: 12, borderRadius: 2, display: "inline-block",
                        background: grp.stroke, border: "1px solid var(--line)",
                      }}
                    />
                    <span style={{ opacity: 0.6 }}>({grp.polylines.length})</span>
                  </span>
                ))}
              </div>
            );
          })()}
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
  borderTop: "1px solid var(--line)",
  background: "var(--bg-panel)",
  color: "var(--text-secondary)",
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
  background: "var(--bg-raised)",
  color: "var(--text-primary)",
  border: "1px solid var(--line)",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 11,
  fontWeight: 500,
  transition: "all 0.15s ease",
};
