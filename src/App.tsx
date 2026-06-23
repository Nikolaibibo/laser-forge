import { useMemo, useEffect, useState } from "react";
import { Leva } from "leva";
import { useApp } from "./state/store";
import { byId } from "./generators/registry";
import { distortionById } from "./distortions/registry";
import { useGeneratorParams } from "./ui/ParamPanel";
import { CanvasPreview } from "./render/CanvasPreview";
import { ExportBar } from "./ui/ExportBar";
import { GeneratorPicker } from "./ui/GeneratorPicker";
import { LayerStack } from "./ui/LayerStack";
import { LayerControls } from "./ui/LayerControls";
import { readHash } from "./state/urlSync";
import type { Artwork } from "./generators/types";
import { PlotterPanel } from "./ui/PlotterPanel";
import { AxiDrawPanel } from "./ui/AxiDrawPanel";
import { MotifPanel } from "./ui/MotifPanel";

type Machine = "grbl" | "axidraw";

/** GRBL (WebSerial) ↔ AxiDraw (local bridge) selector; both coexist. */
function MachineDock() {
  const [machine, setMachine] = useState<Machine>("grbl");
  const tab = (m: Machine): React.CSSProperties => ({
    padding: "6px 14px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    background: machine === m ? "var(--bg-hover)" : "transparent",
    color: machine === m ? "var(--text-primary)" : "var(--text-secondary)",
    border: "1px solid var(--border-color)",
    borderBottom: "none",
    borderRadius: "4px 4px 0 0",
    fontFamily: "inherit",
    transition: "all 0.15s ease",
  });
  return (
    <div style={{ background: "var(--bg-sidebar)", borderTop: "1px solid var(--border-color)" }}>
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "8px 12px 0",
          background: "rgba(0, 0, 0, 0.02)",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <button style={tab("grbl")} onClick={() => setMachine("grbl")}>
          GRBL / Laser
        </button>
        <button style={tab("axidraw")} onClick={() => setMachine("axidraw")}>
          AxiDraw
        </button>
      </div>
      {machine === "grbl" ? <PlotterPanel /> : <AxiDrawPanel />}
    </div>
  );
}

// Hash layer UID to a stable per-layer seed offset so each layer is deterministic.
const hashUid = (uid: string): number => {
  let h = 2166136261;
  for (let i = 0; i < uid.length; i++) {
    h ^= uid.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
};

function Stage({ generatorId }: { generatorId: string }) {
  const gen = byId(generatorId)!;
  const seed = useApp((s) => s.seed);
  const w = useApp((s) => s.canvasWMm);
  const h = useApp((s) => s.canvasHMm);
  const layers = useApp((s) => s.layers);
  const layerParams = useApp((s) => s.layerParams);
  const motif = useApp((s) => s.motif);
  const baseParams = useGeneratorParams(gen);

  const baseArt = useMemo(
    () => gen.generate(baseParams, seed, { wMm: w, hMm: h }),
    // motif: blueprint reads it from the store — re-generate on upload/clear
    [gen, baseParams, seed, w, h, motif],
  );

  const finalArt = useMemo<Artwork>(() => {
    let cur = baseArt;
    for (const l of layers) {
      if (!l.enabled) continue;
      const dist = distortionById(l.distortionId);
      if (!dist) continue;
      const params = layerParams[l.uid] ?? dist.defaults;
      cur = dist.apply(cur, params, seed + hashUid(l.uid));
    }
    return cur;
  }, [baseArt, layers, layerParams, seed]);

  // Publish the current artwork so the (stable, non-remounted) PlotterPanel can read it.
  const setCurrentArtwork = useApp((s) => s.setCurrentArtwork);
  useEffect(() => {
    setCurrentArtwork(finalArt);
  }, [finalArt, setCurrentArtwork]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", minHeight: 0 }}>
      {layers.map((l, i) => (
        <LayerControls key={l.uid} layer={l} index={i} />
      ))}
      <CanvasPreview artwork={finalArt} />
      <ExportBar artwork={finalArt} currentParams={baseParams as Record<string, unknown>} />
    </div>
  );
}

export default function App() {
  const generatorId = useApp((s) => s.generatorId);
  const hydrate = useApp((s) => s.hydrate);

  // Get Zustand values for global header inputs
  const w = useApp((s) => s.canvasWMm);
  const h = useApp((s) => s.canvasHMm);
  const setCanvas = useApp((s) => s.setCanvas);
  const penWidthMm = useApp((s) => s.penWidthMm);
  const setPenWidthMm = useApp((s) => s.setPenWidthMm);

  useEffect(() => {
    const h = readHash();
    if (h) {
      hydrate({
        generatorId: h.g,
        seed: h.s,
        canvasWMm: h.w,
        canvasHMm: h.h,
        layers: h.l ?? [],
        layerParams: h.lp ?? {},
        penWidthMm: h.pw ?? 0.3,
      });
    }
  }, [hydrate]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "280px 1fr 320px",
        gridTemplateRows: "56px 1fr",
        height: "100vh",
        width: "100vw",
        background: "var(--bg-base)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-sans)",
        overflow: "hidden",
      }}
    >
      {/* Global Header Bar */}
      <header
        style={{
          gridColumn: "1 / 4",
          gridRow: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 18px",
          background: "var(--bg-sidebar)",
          borderBottom: "1px solid var(--border-color)",
          zIndex: 30,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.5, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "var(--accent)" }}>🔥</span> Laser Forge
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>
            Generative vector workbench
          </div>
        </div>

        {/* Global dimensions & pen inputs */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={headerLabelStyle}>Canvas</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="number"
                value={w}
                onChange={(e) => setCanvas(Number(e.target.value), h)}
                style={headerInputStyle}
                title="Canvas Width in millimeters"
              />
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>×</span>
              <input
                type="number"
                value={h}
                onChange={(e) => setCanvas(w, Number(e.target.value))}
                style={headerInputStyle}
                title="Canvas Height in millimeters"
              />
              <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500, marginLeft: 2 }}>mm</span>
            </div>
          </div>

          <div style={{ height: 16, width: 1, background: "var(--border-color)" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={headerLabelStyle}>Pen Stroke</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="number"
                value={penWidthMm}
                min={0.05}
                step={0.1}
                onChange={(e) => setPenWidthMm(Number(e.target.value))}
                style={{ ...headerInputStyle, width: 52 }}
                title="Pen Width in millimeters"
              />
              <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500, marginLeft: 2 }}>mm</span>
            </div>
          </div>
        </div>

        {/* Quick status/info link */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a
            href="https://github.com/Nikolaibibo/laser-forge"
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 11, color: "var(--text-muted)", textDecoration: "none", fontWeight: 500 }}
            className="transition-all-fast"
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            v0.1.0 · GitHub
          </a>
        </div>
      </header>

      {/* Column 1: Generator & Pipeline (Left) */}
      <aside
        style={{
          gridColumn: 1,
          gridRow: 2,
          borderRight: "1px solid var(--border-color)",
          background: "var(--bg-sidebar)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
        className="scroller"
      >
        <GeneratorPicker />
        <MotifPanel />
        <LayerStack />
        <div style={{ flex: 1 }} />
        <footer
          style={{
            padding: 14,
            fontSize: 10,
            color: "var(--text-muted)",
            borderTop: "1px solid var(--border-color)",
            lineHeight: 1.4,
          }}
        >
          Export → vpype → LightBurn.<br />See docs/laser-workflow.md.
        </footer>
      </aside>

      {/* Column 2: Canvas Workspace (Center) */}
      <main
        style={{
          gridColumn: 2,
          gridRow: 2,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          minWidth: 0,
          background: "var(--bg-base)",
        }}
      >
        <Stage key={generatorId} generatorId={generatorId} />
        <MachineDock />
      </main>

      {/* Column 3: Parameters controls panel (Right) */}
      <aside
        style={{
          gridColumn: 3,
          gridRow: 2,
          background: "var(--bg-sidebar)",
          borderLeft: "1px solid var(--border-color)",
          overflowY: "auto",
        }}
        className="scroller"
      >
        <Leva
          fill
          flat
          titleBar={{ title: "Parameter", drag: false, filter: false }}
          theme={{
            colors: {
              elevation1: "transparent",
              elevation2: "var(--bg-card)",
              elevation3: "var(--bg-hover)",
              accent1: "var(--accent)",
              accent2: "var(--accent)",
              accent3: "var(--accent)",
              highlight1: "var(--text-secondary)",
              highlight2: "var(--text-primary)",
              highlight3: "#fff",
            },
          }}
        />
      </aside>
    </div>
  );
}

const headerLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const headerInputStyle: React.CSSProperties = {
  width: 58,
  background: "var(--bg-input)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-color)",
  padding: "4px 8px",
  borderRadius: 6,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  textAlign: "center",
  outline: "none",
  transition: "border-color 0.2s ease",
};
