import { useMemo, useEffect } from "react";
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
import { MotifPanel } from "./ui/MotifPanel";

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
    <>
      {layers.map((l, i) => (
        <LayerControls key={l.uid} layer={l} index={i} />
      ))}
      <CanvasPreview artwork={finalArt} />
      <ExportBar artwork={finalArt} currentParams={baseParams as Record<string, unknown>} />
    </>
  );
}

export default function App() {
  const generatorId = useApp((s) => s.generatorId);
  const hydrate = useApp((s) => s.hydrate);

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
        gridTemplateRows: "1fr auto",
        height: "100vh",
        width: "100vw",
        background: "#0c0c0b",
        color: "#eee",
        fontFamily:
          "system-ui, -apple-system, 'Inter', 'Segoe UI', sans-serif",
        overflow: "hidden",
      }}
    >
      <aside
        style={{
          gridRow: "1 / 3",
          gridColumn: 1,
          borderRight: "1px solid #2d2d2a",
          background: "#141413",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header style={{ padding: "16px 14px", borderBottom: "1px solid #2d2d2a" }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>
            Laser Forge
          </div>
          <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>
            Generative vector workbench
          </div>
        </header>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#bbb", padding: "10px 14px 4px" }}>
          BASE
        </div>
        <MotifPanel />
        <GeneratorPicker />
        <LayerStack />
        <div style={{ flex: 1 }} />
        <footer
          style={{
            padding: 14,
            fontSize: 10,
            color: "#555",
            borderTop: "1px solid #2d2d2a",
          }}
        >
          Export → vpype → LightBurn. See docs/laser-workflow.md.
        </footer>
      </aside>

      <main
        style={{
          gridColumn: 2,
          gridRow: "1 / 2",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <Stage key={generatorId} generatorId={generatorId} />
        <PlotterPanel />
      </main>

      <aside
        style={{
          gridColumn: 3,
          gridRow: "1 / 3",
          background: "#141413",
          borderLeft: "1px solid #2d2d2a",
          overflowY: "auto",
        }}
      >
        <Leva
          fill
          flat
          titleBar={{ title: "Parameter", drag: false, filter: false }}
          theme={{
            colors: {
              elevation1: "#141413",
              elevation2: "#1d1d1b",
              elevation3: "#2d2d2a",
              accent1: "#e96a3a",
              accent2: "#e96a3a",
              accent3: "#e96a3a",
              highlight1: "#bbb",
              highlight2: "#eee",
              highlight3: "#fff",
            },
          }}
        />
      </aside>
    </div>
  );
}
