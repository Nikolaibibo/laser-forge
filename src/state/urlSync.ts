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
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const decodePayload = (hash: string): SharePayload | null => {
  try {
    const binary = atob(hash);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
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
