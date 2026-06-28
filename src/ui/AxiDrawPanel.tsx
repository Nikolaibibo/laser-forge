// src/ui/AxiDrawPanel.tsx — machine control for the AxiDraw A3 clone via the
// local HTTP bridge (bridge/bridge.py). Sibling to PlotterPanel (GRBL/WebSerial).
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../state/store";
import { svgExport } from "../render/svgExport";
import { bbox } from "../plotter/gcode";
import {
  AxiDrawBridge,
  bboxFrameSvg,
  BridgeUnreachable,
  type PenProfile,
} from "../plotter/axidrawBridge";

// Usable physical envelope of this clone (model 6). The bridge's ×1.25 SVG
// scale only compensates the 16T-vs-20T pulley under-travel, so the artwork's
// mm are the *true* output mm — compare those directly to the frame.
const MACHINE_MAX_LONG = 340; // mm — the frame is the limit (~A4 landscape long edge)
const MACHINE_MAX_SHORT = 270; // mm — short axis

// Per-profile pen settle defaults (ms): [delayDown, delayUp]. Mirrors the
// PROFILES table in bridge/bridge.py. The delay sliders seed from these on
// profile change so we don't clobber e.g. gel's long down-settle by accident.
const PROFILE_DELAYS: Record<PenProfile, [number, number]> = {
  pencil: [60, 100],
  felt: [120, 120],
  gel: [200, 150],
};

type Conn = "checking" | "online" | "offline";

export function AxiDrawPanel() {
  const artwork = useApp((s) => s.currentArtwork);
  const penWidthMm = useApp((s) => s.penWidthMm);

  const bridgeRef = useRef(new AxiDrawBridge());
  const [conn, setConn] = useState<Conn>("checking");
  const [busy, setBusy] = useState(false);
  const [plotting, setPlotting] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [profile, setProfile] = useState<PenProfile>("pencil");
  const [speed, setSpeed] = useState(35); // % of max pen-down speed — lower = cleaner fine detail
  const [accel, setAccel] = useState(30); // % — lower = less overshoot on small/tight features
  // Pen settle delays (ms), seeded from the active profile. delayDown = dwell
  // after lowering before drawing; delayUp = dwell after raising before moving.
  const [delayDown, setDelayDown] = useState(PROFILE_DELAYS.pencil[0]);
  const [delayUp, setDelayUp] = useState(PROFILE_DELAYS.pencil[1]);
  const [join, setJoin] = useState(true);
  const [dedupe, setDedupe] = useState(false);

  // Reseed the delay sliders to the chosen profile's tuned defaults whenever the
  // profile changes — keeps each pen's sane baseline, still tweakable from there.
  const pickProfile = (p: PenProfile) => {
    setProfile(p);
    setDelayDown(PROFILE_DELAYS[p][0]);
    setDelayUp(PROFILE_DELAYS[p][1]);
  };

  const ping = useCallback(async () => {
    try {
      const s = await bridgeRef.current.status();
      setConn("online");
      setPlotting(s.plotting);
    } catch {
      setConn("offline");
    }
  }, []);

  useEffect(() => {
    ping();
    const t = setInterval(ping, 5000);
    return () => clearInterval(t);
  }, [ping]);

  // Run a bridge action with shared busy/message handling.
  const run = async (label: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    if (busy) return;
    setBusy(true);
    setMsg(`${label}…`);
    try {
      const r = await fn();
      setMsg(r.ok ? `${label} ✓${r.message ? " — " + r.message : ""}` : `${label} failed: ${r.message ?? ""}`);
      setConn("online");
    } catch (e) {
      if (e instanceof BridgeUnreachable) setConn("offline");
      setMsg(`${label} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const b = bridgeRef.current;

  const doPlot = async () => {
    if (!artwork) return;
    const svg = svgExport(artwork, { dedupe, join, strokeWidthMm: penWidthMm });
    setPlotting(true);
    setBusy(true);
    setMsg("Plotting… (press Stop to abort)");
    try {
      const r = await b.plot(svg, profile, speed, accel, delayDown, delayUp);
      setMsg(r.ok ? "Plot ✓ done" : `Plot stopped: ${r.message ?? ""}`);
    } catch (e) {
      if (e instanceof BridgeUnreachable) setConn("offline");
      setMsg(`Plot failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPlotting(false);
      setBusy(false);
    }
  };

  const doOutline = async (dry: boolean) => {
    if (!artwork) return;
    const [minX, minY, maxX, maxY] = bbox(artwork);
    const svg = bboxFrameSvg(minX, minY, maxX - minX, maxY - minY, artwork.widthMm, artwork.heightMm);
    run(dry ? "Dry outline" : "Draw frame", () => b.outline(svg, profile, dry, speed, accel, delayDown, delayUp));
  };

  const doStop = async () => {
    // Stop bypasses the busy gate — it must interrupt a running plot.
    setMsg("Stopping…");
    try {
      const r = await b.stop();
      setMsg(r.ok ? "Stopped ✓" : `Stop failed: ${r.message ?? ""}`);
    } catch (e) {
      setMsg(`Stop failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPlotting(false);
      setBusy(false);
    }
  };

  // Range check — physical output dims (= artwork mm) vs. the usable frame.
  let warn: string | null = null;
  if (artwork) {
    const longMm = Math.max(artwork.widthMm, artwork.heightMm);
    const shortMm = Math.min(artwork.widthMm, artwork.heightMm);
    if (longMm > MACHINE_MAX_LONG || shortMm > MACHINE_MAX_SHORT) {
      warn = `⚠ Artwork ${artwork.widthMm}×${artwork.heightMm}mm exceeds the ~${MACHINE_MAX_LONG}×${MACHINE_MAX_SHORT}mm usable frame.`;
    }
  }

  const offline = conn === "offline";

  return (
    <div style={box}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong>AxiDraw</strong>
        <span
          style={{
            color: conn === "online" ? "#2b7a4b" : conn === "offline" ? "#d9383a" : "#d97d24",
          }}
          title="Local bridge process (bridge/bridge.py)"
        >
          ● Bridge {conn === "online" ? "running" : conn === "offline" ? "offline" : "…"}
        </span>
        <button style={btn} onClick={ping} disabled={busy}>
          Refresh
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          Pen
          <select value={profile} onChange={(e) => pickProfile(e.target.value as PenProfile)}>
            <option value="pencil">Bleistift</option>
            <option value="felt">Filzstift</option>
            <option value="gel">Gel (weiß/schwarz)</option>
          </select>
        </label>
      </div>

      <div style={{ ...row, gap: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }} title="% of max pen-down speed. Lower = cleaner small text / tight curves.">
          Speed <strong style={{ width: 22, textAlign: "right" }}>{speed}</strong>
          <input type="range" min={5} max={80} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }} title="Acceleration %. Lower = less overshoot on fine/short segments.">
          Accel <strong style={{ width: 22, textAlign: "right" }}>{accel}</strong>
          <input type="range" min={5} max={80} value={accel} onChange={(e) => setAccel(Number(e.target.value))} />
        </label>
        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>niedriger = sauberere Feindetails</span>
      </div>

      <div style={{ ...row, gap: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }} title="Verweildauer (ms) nachdem die Spitze abgesenkt wurde, bevor gezeichnet wird. Höher = Tinte/Strich startet sicher vor der Bewegung (keine fehlenden Linienanfänge).">
          Delay ab <strong style={{ width: 32, textAlign: "right" }}>{delayDown}</strong>
          <input type="range" min={0} max={500} step={10} value={delayDown} onChange={(e) => setDelayDown(Number(e.target.value))} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }} title="Verweildauer (ms) nachdem die Spitze angehoben wurde, bevor weitergefahren wird. Höher = Spitze ist sicher frei (kein Verwischen).">
          Delay auf <strong style={{ width: 32, textAlign: "right" }}>{delayUp}</strong>
          <input type="range" min={0} max={500} step={10} value={delayUp} onChange={(e) => setDelayUp(Number(e.target.value))} />
        </label>
        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>ms · Reset bei Stift-Wechsel</span>
      </div>

      {offline && (
        <div style={{ color: "#d97d24", fontSize: 11, lineHeight: 1.4 }}>
          Bridge not reachable. Start it locally:
          <code style={code}>~/.venvs/axidraw/bin/python bridge/bridge.py</code>
          Plotting only works from the local <code style={code}>npm run dev</code> instance.
        </div>
      )}

      <div style={row}>
        <button style={btn} onClick={() => run("Pen up", () => b.penUp(profile))} disabled={busy || offline}>
          Pen up
        </button>
        <button style={btn} onClick={() => run("Pen down", () => b.penDown(profile))} disabled={busy || offline}>
          Pen down
        </button>
        <button style={btn} onClick={() => run("Set 0,0", () => b.setZero())} disabled={busy || offline}>
          Set 0,0 here
        </button>
        <button style={btn} onClick={() => run("Motors off", () => b.align(profile))} disabled={busy || offline} title="De-energise motors to position the head by hand">
          Motors off
        </button>
        <button style={btn} onClick={() => run("Home", () => b.home())} disabled={busy || offline}>
          Home (0,0)
        </button>
      </div>

      <div style={row}>
        <button style={btn} onClick={() => doOutline(true)} disabled={busy || offline || !artwork} title="Traces the artwork bbox with the pen UP — placement check, no mark on the paper">
          Dry outline
        </button>
        <button style={btn} onClick={() => doOutline(false)} disabled={busy || offline || !artwork} title="Draws the artwork bbox as a frame on the paper">
          Draw frame
        </button>
        <button
          style={{ ...btn, background: "var(--accent)", color: "#fff", borderColor: "transparent", fontWeight: 600 }}
          onClick={doPlot}
          disabled={busy || offline || !artwork}
        >
          Plot
        </button>
        <button style={btn} onClick={doStop} disabled={offline}>
          Stop
        </button>
        <label
          title="Joins open polylines whose endpoints touch into longer continuous paths, reducing pen lifts."
          style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}
        >
          <input type="checkbox" checked={join} onChange={(e) => setJoin(e.target.checked)} />
          Join paths
        </label>
        <label
          title="Removes overlapping/duplicate paths before plotting."
          style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}
        >
          <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} />
          Dedupe
        </label>
      </div>

      {warn && <div style={{ color: "#d97d24", fontSize: 11, lineHeight: 1.4 }}>{warn}</div>}
      {plotting && <div style={{ color: "#2b7a4b" }}>Plotting… (press Stop to abort)</div>}
      {msg && !plotting && <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{msg}</div>}
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
const code: React.CSSProperties = {
  display: "inline-block",
  margin: "0 4px",
  padding: "1px 5px",
  background: "var(--bg-hover)",
  border: "1px solid var(--line)",
  borderRadius: 4,
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--text-primary)",
};
