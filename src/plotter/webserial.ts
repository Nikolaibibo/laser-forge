export type GrblState = "Idle" | "Run" | "Hold" | "Alarm" | "Unknown";
export type GrblStatus = { state: GrblState; mpos: [number, number] };

export class PlotterPort {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private port: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private writer: any = null;
  private readBuffer = "";
  private pendingResolve: ((line: string) => void) | null = null;
  private statusCb: ((s: GrblStatus) => void) | null = null;
  private disconnectCb: (() => void) | null = null;

  connected = false;

  static available(): boolean {
    return !!(navigator as any).serial; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  async connect(): Promise<void> {
    const serial = (navigator as any).serial; // eslint-disable-line @typescript-eslint/no-explicit-any
    this.port = await serial.requestPort();
    await this.port.open({ baudRate: 115200 });
    this.connected = true;

    // Listen for USB disconnect events
    serial.addEventListener("disconnect", (e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (e.target === this.port) {
        this.handleDisconnect();
      }
    });

    this.startReadLoop();

    // Wait for GRBL banner (~1500 ms)
    await new Promise<void>((r) => setTimeout(r, 1500));

    await this.send("$X");
  }

  private startReadLoop(): void {
    const port = this.port;
    (async () => {
      const dec = new TextDecoder();
      const reader = port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            this.readBuffer += dec.decode(value);
            let nl: number;
            while ((nl = this.readBuffer.indexOf("\n")) !== -1) {
              const line = this.readBuffer.slice(0, nl).replace(/\r$/, "").trim();
              this.readBuffer = this.readBuffer.slice(nl + 1);
              if (line.length > 0) {
                this.handleLine(line);
              }
            }
          }
        }
      } catch {
        // USB unplug or port close — surface as disconnect
        this.handleDisconnect();
      } finally {
        try { reader.releaseLock(); } catch { /* ignore */ }
      }
    })();
  }

  private handleLine(line: string): void {
    if (line.startsWith("<")) {
      // Status frame: <State|MPos:x,y,z|...>
      const stateMatch = line.match(/<(\w+)/);
      const mposMatch = line.match(/MPos:([-\d.]+),([-\d.]+)/);
      const state = (stateMatch?.[1] ?? "Unknown") as GrblState;
      const mpos: [number, number] = mposMatch
        ? [parseFloat(mposMatch[1]), parseFloat(mposMatch[2])]
        : [0, 0];
      this.statusCb?.({ state, mpos });
    } else if (
      line === "ok" ||
      line.startsWith("error") ||
      line.includes("ALARM")
    ) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      resolve?.(line);
    }
  }

  async send(line: string): Promise<string> {
    if (!this.connected) {
      throw new Error("PlotterPort: not connected");
    }

    // Lazily acquire the writer
    if (!this.writer) {
      this.writer = this.port.writable.getWriter();
    }

    // Serialize: wait until any in-flight send clears
    while (this.pendingResolve !== null) {
      await new Promise<void>((r) => setTimeout(r, 5));
    }

    return new Promise<string>((resolve) => {
      this.pendingResolve = resolve;
      const encoded = new TextEncoder().encode(`${line}\r\n`);
      // Fire-and-forget the write; errors surface via read-loop/disconnect
      (this.writer.write(encoded) as Promise<void>).catch(() => {
        this.handleDisconnect();
      });
    });
  }

  onStatus(cb: (s: GrblStatus) => void): void {
    this.statusCb = cb;
  }

  onDisconnect(cb: () => void): void {
    this.disconnectCb = cb;
  }

  private handleDisconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    const resolve = this.pendingResolve;
    this.pendingResolve = null;
    resolve?.("error: disconnect");
    this.disconnectCb?.();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    try { this.writer?.releaseLock(); } catch { /* ignore */ }
    this.writer = null;
    try { await this.port?.close(); } catch { /* ignore */ }
  }
}
