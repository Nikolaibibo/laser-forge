// src/util/imageLoad.ts — decode a raster image to a small luminance grid for
// image-driven generators (TSP art / stippling). Browser-only (uses <canvas>);
// headless tests/renders use a procedural source instead.

export type SourceImage = {
  name: string;
  lum: number[]; // row-major luminance, 0 (black) … 1 (white), length w*h
  w: number;
  h: number;
};

/** Decode `file` and downsample to ≤ maxDim on the long edge, as luminance. */
export async function fileToLuminance(file: File, maxDim = 240): Promise<SourceImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("image decode failed"));
      im.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const lum = new Array<number>(w * h);
    for (let i = 0; i < w * h; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      lum[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    return { name: file.name, lum, w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}
