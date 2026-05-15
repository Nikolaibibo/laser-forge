import { create } from "zustand";

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
}));
