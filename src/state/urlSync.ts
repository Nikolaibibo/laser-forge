import type { Layer } from "./store";

export type SharePayload = {
  g: string;
  s: number;
  w: number;
  h: number;
  p: Record<string, unknown>;
  l?: Layer[];
  lp?: Record<string, Record<string, unknown>>;
  /** Pen width in mm (optional — older links default to 0.3). */
  pw?: number;
};

export const encodePayload = (data: SharePayload): string => {
  const json = JSON.stringify(data);
  // btoa is UTF-16 unsafe, but our params are ASCII/numbers — good enough
  return btoa(json);
};

export const decodePayload = (hash: string): SharePayload | null => {
  try {
    const json = atob(hash);
    return JSON.parse(json) as SharePayload;
  } catch {
    return null;
  }
};

export const writeHash = (data: SharePayload) => {
  const enc = encodePayload(data);
  window.history.replaceState(null, "", `#p=${enc}`);
};

export const readHash = (): SharePayload | null => {
  const m = window.location.hash.match(/^#p=(.+)$/);
  if (!m) return null;
  return decodePayload(m[1]);
};
