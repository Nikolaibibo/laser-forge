import { useMemo, useEffect } from "react";
import { useApp } from "./state/store";
import { byId } from "./generators/registry";
import { distortionById } from "./distortions/registry";
import { schemaDefaults } from "./ui/controls/schema";
import { CanvasPreview } from "./render/CanvasPreview";
import { TopBar } from "./ui/TopBar";
import { PipelineRail } from "./ui/PipelineRail";
import { Inspector } from "./ui/Inspector";
import { Console } from "./ui/Console";
import { MachineDrawer } from "./ui/MachineDrawer";
import { readHash } from "./state/urlSync";
import type { Artwork } from "./generators/types";

// FNV-1a hash — hash layer UID to a stable per-layer seed offset so each layer is deterministic.
const hashUid = (uid: string): number => {
  let h = 2166136261;
  for (let i = 0; i < uid.length; i++) {
    h ^= uid.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
};

function Stage() {
  const generatorId = useApp((s) => s.generatorId);
  const gen = byId(generatorId)!;
  const seed = useApp((s) => s.seed);
  const w = useApp((s) => s.canvasWMm);
  const h = useApp((s) => s.canvasHMm);
  const layers = useApp((s) => s.layers);
  const layerParams = useApp((s) => s.layerParams);
  const genParams = useApp((s) => s.genParams);
  const motif = useApp((s) => s.motif);
  const baseParams = genParams[generatorId] ?? schemaDefaults(gen.schema);

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

  const setCurrentArtwork = useApp((s) => s.setCurrentArtwork);
  useEffect(() => {
    setCurrentArtwork(finalArt);
  }, [finalArt, setCurrentArtwork]);

  return <CanvasPreview artwork={finalArt} />;
}

export default function App() {
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
        genParams: {}, // TODO(Task 14): restore genParams from hash once SharePayload.p is nested
      });
    }
  }, [hydrate]);

  return (
    <div className="lf-app">
      <TopBar />
      <PipelineRail />
      <main className="lf-stage">
        <Stage />
      </main>
      <Inspector />
      <Console />
      <MachineDrawer />
    </div>
  );
}
