import { create } from "zustand";
import type { Artwork } from "../generators/types";

export type Layer = {
  uid: string;
  distortionId: string;
  enabled: boolean;
};

export type AppState = {
  generatorId: string;
  seed: number;
  canvasWMm: number;
  canvasHMm: number;
  layers: Layer[];
  /** Parameter values per layer (written by LayerControls). */
  layerParams: Record<string, Record<string, unknown>>;
  setGenerator: (id: string) => void;
  setSeed: (seed: number) => void;
  randomSeed: () => void;
  setCanvas: (w: number, h: number) => void;
  addLayer: (distortionId: string) => void;
  removeLayer: (uid: string) => void;
  toggleLayer: (uid: string) => void;
  moveLayer: (uid: string, dir: -1 | 1) => void;
  setLayerParams: (uid: string, params: Record<string, unknown>) => void;
  clearLayers: () => void;
  hydrate: (state: Partial<AppState>) => void;
  // Plotter state (PlotterPort instance lives in a useRef in PlotterPanel — not stored here)
  plotterConnected: boolean;
  plotterState: string;
  plotterProgress: { done: number; total: number } | null;
  setPlotterConnected: (v: boolean) => void;
  setPlotterState: (v: string) => void;
  setPlotterProgress: (v: { done: number; total: number } | null) => void;
  /** Current rendered artwork, published by Stage so the (stable) PlotterPanel can read it
   *  without living inside the key-remounted Stage subtree. */
  currentArtwork: Artwork | null;
  setCurrentArtwork: (a: Artwork | null) => void;
};

let uidCounter = 0;
const nextUid = () => `L${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

export const useApp = create<AppState>((set) => ({
  generatorId: "flow-field",
  seed: 1337,
  canvasWMm: 200,
  canvasHMm: 200,
  layers: [],
  layerParams: {},
  setGenerator: (id) => set({ generatorId: id }),
  setSeed: (seed) => set({ seed }),
  randomSeed: () => set({ seed: Math.floor(Math.random() * 1_000_000) }),
  setCanvas: (w, h) => set({ canvasWMm: w, canvasHMm: h }),
  addLayer: (distortionId) =>
    set((s) => ({
      layers: [...s.layers, { uid: nextUid(), distortionId, enabled: true }],
    })),
  removeLayer: (uid) =>
    set((s) => {
      const next = s.layers.filter((l) => l.uid !== uid);
      const params = { ...s.layerParams };
      delete params[uid];
      return { layers: next, layerParams: params };
    }),
  toggleLayer: (uid) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.uid === uid ? { ...l, enabled: !l.enabled } : l)),
    })),
  moveLayer: (uid, dir) =>
    set((s) => {
      const i = s.layers.findIndex((l) => l.uid === uid);
      if (i === -1) return {};
      const j = i + dir;
      if (j < 0 || j >= s.layers.length) return {};
      const next = s.layers.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return { layers: next };
    }),
  setLayerParams: (uid, params) =>
    set((s) => ({ layerParams: { ...s.layerParams, [uid]: params } })),
  clearLayers: () => set({ layers: [], layerParams: {} }),
  hydrate: (s) => set(s),
  plotterConnected: false,
  plotterState: "Disconnected",
  plotterProgress: null,
  setPlotterConnected: (v) => set({ plotterConnected: v }),
  setPlotterState: (v) => set({ plotterState: v }),
  setPlotterProgress: (v) => set({ plotterProgress: v }),
  currentArtwork: null,
  setCurrentArtwork: (a) => set({ currentArtwork: a }),
}));
