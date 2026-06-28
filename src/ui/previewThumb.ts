/**
 * previewThumb.ts — generates a thumbnail data-URL for a generator.
 * Runs the generator with schema defaults on an offscreen canvas and caches by id.
 */
import type { GeneratorDef } from "../generators/types";
import { schemaDefaults } from "./controls/schema";

/** Module-level memoization cache: gen.id → data URL. */
const cache = new Map<string, string>();

/**
 * Renders `gen` at `size×size` pixels and returns a data URL.
 * Results are cached — subsequent calls with the same id return immediately.
 * Any generator error (e.g. blueprint/specsheet/svg/pattern-maker with no motif)
 * returns an empty string so one bad generator never breaks the gallery.
 */
export function artworkToThumbDataUrl(gen: GeneratorDef, size: number): string {
  const cached = cache.get(gen.id);
  if (cached !== undefined) return cached;

  try {
    const params = schemaDefaults(gen.schema);
    const artwork = gen.generate(params as never, 1, { wMm: 100, hMm: 100 });

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      cache.set(gen.id, "");
      return "";
    }

    // Bright paper background
    ctx.fillStyle = "#fafaf7";
    ctx.fillRect(0, 0, size, size);

    if (artwork.polylines.length > 0 && artwork.widthMm > 0 && artwork.heightMm > 0) {
      // Fit artwork into square thumbnail, preserving aspect ratio with padding
      const PAD = size * 0.06;
      const available = size - PAD * 2;
      const artRatio = artwork.widthMm / artwork.heightMm;
      let drawW: number, drawH: number;
      if (artRatio >= 1) {
        drawW = available;
        drawH = available / artRatio;
      } else {
        drawH = available;
        drawW = available * artRatio;
      }
      const offsetX = PAD + (available - drawW) / 2;
      const offsetY = PAD + (available - drawH) / 2;
      const scale = drawW / artwork.widthMm;

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);
      // Hairline strokes at 0.3mm physical width
      ctx.lineWidth = 0.3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const line of artwork.polylines) {
        if (line.points.length < 2) continue;
        ctx.strokeStyle = line.stroke ?? "#111";
        ctx.beginPath();
        ctx.moveTo(line.points[0][0], line.points[0][1]);
        for (let i = 1; i < line.points.length; i++) {
          ctx.lineTo(line.points[i][0], line.points[i][1]);
        }
        if (line.closed) ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }

    const url = canvas.toDataURL();
    cache.set(gen.id, url);
    return url;
  } catch {
    // Generator threw (e.g. motif-dependent generator with no motif loaded)
    cache.set(gen.id, "");
    return "";
  }
}
