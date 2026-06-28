import { create } from "zustand";
import type { Artwork, Polyline } from "../generators/types";
import { reorder } from "../ui/hooks/useDragReorder";

export type Layer = {
  uid: string;
  distortionId: string;
  enabled: boolean;
};

/** Imported SVG motif for the blueprint generator. Not URL-synced; gone on reload. */
export type Motif = {
  name: string;
  polylines: Polyline[];
  widthMm: number;
  heightMm: number;
};

export type AppState = {
  generatorId: string;
  seed: number;
  canvasWMm: number;
  canvasHMm: number;
  /** Pen stroke width in mm — preview + SVG export (0.3 fineliner … 1–2 felt-tip). */
  penWidthMm: number;
  layers: Layer[];
  /** Parameter values per layer (written by LayerControls). */
  layerParams: Record<string, Record<string, unknown>>;
  /** Parameter values per generator id (mirror of layerParams for the source node). */
  genParams: Record<string, Record<string, unknown>>;
  setGenParams: (genId: string, params: Record<string, unknown>) => void;
  /** Which chain node the Inspector edits: "source" or a layer uid. */
  selectedNodeId: string;
  setSelectedNode: (id: string) => void;
  setGenerator: (id: string) => void;
  setSeed: (seed: number) => void;
  randomSeed: () => void;
  setCanvas: (w: number, h: number) => void;
  setPenWidthMm: (mm: number) => void;
  addLayer: (distortionId: string) => void;
  removeLayer: (uid: string) => void;
  toggleLayer: (uid: string) => void;
  moveLayer: (uid: string, dir: -1 | 1) => void;
  reorderLayers: (from: number, to: number) => void;
  setLayerParams: (uid: string, params: Record<string, unknown>) => void;
  clearLayers: () => void;
  motif: Motif | null;
  setMotif: (m: Motif | null) => void;
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
  /** Controls the generator-gallery overlay (Task 10). */
  galleryOpen: boolean;
  setGalleryOpen: (v: boolean) => void;
};

let uidCounter = 0;
const nextUid = () => `L${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

export const useApp = create<AppState>((set) => ({
  generatorId: "flow-field",
  seed: 1337,
  canvasWMm: 200,
  canvasHMm: 200,
  penWidthMm: 0.3,
  layers: [],
  layerParams: {},
  genParams: {},
  selectedNodeId: "source",
  setGenParams: (genId, params) =>
    set((s) => ({ genParams: { ...s.genParams, [genId]: params } })),
  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setGenerator: (id) => set({ generatorId: id, selectedNodeId: "source" }),
  setSeed: (seed) => set({ seed }),
  randomSeed: () => set({ seed: Math.floor(Math.random() * 1_000_000) }),
  setCanvas: (w, h) => set({ canvasWMm: w, canvasHMm: h }),
  setPenWidthMm: (mm) => set({ penWidthMm: Math.max(0.05, mm) }),
  addLayer: (distortionId) =>
    set((s) => {
      const uid = nextUid();
      return {
        layers: [...s.layers, { uid, distortionId, enabled: true }],
        selectedNodeId: uid,
      };
    }),
  removeLayer: (uid) =>
    set((s) => {
      const next = s.layers.filter((l) => l.uid !== uid);
      const params = { ...s.layerParams };
      delete params[uid];
      const selectedNodeId = s.selectedNodeId === uid ? "source" : s.selectedNodeId;
      return { layers: next, layerParams: params, selectedNodeId };
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
  reorderLayers: (from, to) =>
    set((s) => ({ layers: reorder(s.layers, from, to) })),

  setLayerParams: (uid, params) =>
    set((s) => ({ layerParams: { ...s.layerParams, [uid]: params } })),
  clearLayers: () => set({ layers: [], layerParams: {}, selectedNodeId: "source" }),
  motif: null,
  setMotif: (m) => set({ motif: m }),
  hydrate: (s) => set(s),
  plotterConnected: false,
  plotterState: "Disconnected",
  plotterProgress: null,
  setPlotterConnected: (v) => set({ plotterConnected: v }),
  setPlotterState: (v) => set({ plotterState: v }),
  setPlotterProgress: (v) => set({ plotterProgress: v }),
  currentArtwork: null,
  setCurrentArtwork: (a) => set({ currentArtwork: a }),
  galleryOpen: false,
  setGalleryOpen: (v) => set({ galleryOpen: v }),
}));
