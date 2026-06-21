// src/plotter/axidrawBridge.ts — typed HTTP client for the local AxiDraw bridge.
//
// Mirrors the role of grbl.ts (machine control), but talks to bridge/bridge.py
// over HTTP instead of WebSerial. The bridge must be running locally:
//   ~/.venvs/axidraw/bin/python bridge/bridge.py
//
// Because the bridge is HTTP-on-localhost, plotting only works from the local
// dev/preview instance (npm run dev) — a HTTPS Firebase page can't reach it
// (mixed content), same constraint WebSerial had.

export type PenProfile = "pencil" | "felt";

export type BridgeStatus = {
  ok: boolean;
  plotting: boolean;
  port: string;
  model: number;
  scale: number;
  profiles: string[];
};

export type BridgeResult = { ok: boolean; message?: string };

const DEFAULT_BASE = "http://127.0.0.1:4760";

/** Thrown when the bridge process can't be reached at all. */
export class BridgeUnreachable extends Error {
  constructor(base: string) {
    super(
      `AxiDraw bridge not reachable at ${base}. Start it with: ` +
        `~/.venvs/axidraw/bin/python bridge/bridge.py`,
    );
    this.name = "BridgeUnreachable";
  }
}

export class AxiDrawBridge {
  constructor(private base: string = DEFAULT_BASE) {}

  private async req<T>(
    path: string,
    init?: RequestInit & {
      svg?: string;
      profile?: PenProfile;
      dry?: boolean;
      speed?: number;
      accel?: number;
    },
  ): Promise<T> {
    const q = new URLSearchParams();
    if (init?.profile) q.set("profile", init.profile);
    if (init?.dry !== undefined) q.set("dry", init.dry ? "1" : "0");
    if (init?.speed !== undefined) q.set("speed", String(init.speed));
    if (init?.accel !== undefined) q.set("accel", String(init.accel));
    const qs = q.toString();
    const url = this.base + path + (qs ? `?${qs}` : "");
    let res: Response;
    try {
      res = await fetch(url, {
        method: init?.method ?? "POST",
        headers: init?.svg ? { "Content-Type": "image/svg+xml" } : undefined,
        body: init?.svg,
        signal: init?.signal,
      });
    } catch {
      // Network-level failure = bridge not running / not reachable.
      throw new BridgeUnreachable(this.base);
    }
    const data = (await res.json().catch(() => ({}))) as T & {
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      throw new Error(
        data.error || data.message || `bridge error ${res.status}`,
      );
    }
    return data as T;
  }

  status(signal?: AbortSignal): Promise<BridgeStatus> {
    return this.req<BridgeStatus>("/status", { method: "GET", signal });
  }

  penUp(profile?: PenProfile): Promise<BridgeResult> {
    return this.req("/pen-up", { profile });
  }
  penDown(profile?: PenProfile): Promise<BridgeResult> {
    return this.req("/pen-down", { profile });
  }
  /** Set current head position as the 0,0 origin (EBB "CS"). */
  setZero(): Promise<BridgeResult> {
    return this.req("/set-zero", {});
  }
  /** De-energise the motors so the head can be moved by hand. */
  align(profile?: PenProfile): Promise<BridgeResult> {
    return this.req("/align", { profile });
  }
  /** Walk back to the 0,0 origin. */
  home(): Promise<BridgeResult> {
    return this.req("/home", {});
  }
  /**
   * Trace a frame around the artwork bbox. dry=true (default) holds the pen up
   * (placement check, no mark); dry=false draws the frame.
   */
  outline(
    svg: string,
    profile?: PenProfile,
    dry = true,
    speed?: number,
    accel?: number,
  ): Promise<BridgeResult> {
    return this.req("/outline", { svg, profile, dry, speed, accel });
  }
  /** Full plot. Resolves when the plot finishes (or rejects if stopped). */
  plot(
    svg: string,
    profile?: PenProfile,
    speed?: number,
    accel?: number,
  ): Promise<BridgeResult> {
    return this.req("/plot", { svg, profile, speed, accel });
  }
  /** Abort a running plot; bridge raises the pen and de-energises motors. */
  stop(): Promise<BridgeResult> {
    return this.req("/stop", {});
  }
}

/**
 * Build a minimal SVG containing just a rectangle around [x,y,w,h] (mm),
 * in the same mm/viewBox convention as svgExport, so the bridge's prep_svg
 * lands it exactly where the real plot will land. Used for the Outline frame.
 */
export const bboxFrameSvg = (
  x: number,
  y: number,
  w: number,
  h: number,
  pageWmm: number,
  pageHmm: number,
): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${pageWmm}mm" height="${pageHmm}mm"
     viewBox="0 0 ${pageWmm} ${pageHmm}"
     fill="none" stroke="black" stroke-width="0.3"
     stroke-linecap="round" stroke-linejoin="round">
  <path d="M ${x},${y} L ${x + w},${y} L ${x + w},${y + h} L ${x},${y + h} Z"/>
</svg>
`;
