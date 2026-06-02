/** Minimal abstraction over a serial port, so it can be faked in tests. */
type Sendable = { connected: boolean; send(line: string): Promise<string> };

export type StreamOpts = {
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  /** G-code command to lift the pen when aborting (e.g. "M3 S20"). */
  penUp?: string;
};

/**
 * Stream G-code lines to a GRBL port one at a time, awaiting each `ok`.
 * - Checks `signal.aborted` before each line; on abort attempts `penUp` then throws.
 * - Throws if the port response contains "ALARM".
 * - Calls `onProgress(done, total)` after each successfully sent line.
 */
export async function streamJob(
  port: Sendable,
  lines: string[],
  opts?: StreamOpts,
): Promise<void> {
  const total = lines.length;
  const onProgress = opts?.onProgress;
  const signal = opts?.signal;
  const penUpCmd = opts?.penUp;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) {
      if (penUpCmd !== undefined) {
        try {
          await port.send(penUpCmd);
        } catch {
          // ignore pen-up errors on abort
        }
      }
      throw new Error("aborted");
    }

    const resp = await port.send(lines[i]);

    if (resp.includes("ALARM")) {
      throw new Error(`GRBL alarm: ${resp}`);
    }

    onProgress?.(i + 1, total);
  }
}
