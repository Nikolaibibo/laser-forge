import { useEffect, useRef } from "react";
import type { Artwork } from "../generators/types";

type Props = {
  artwork: Artwork;
};

export function CanvasPreview({ artwork }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const draw = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      // Fit artwork into wrap maintaining aspect ratio
      const artRatio = artwork.widthMm / artwork.heightMm;
      const wrapRatio = rect.width / rect.height;
      let dispW: number, dispH: number;
      if (artRatio > wrapRatio) {
        dispW = rect.width;
        dispH = rect.width / artRatio;
      } else {
        dispH = rect.height;
        dispW = rect.height * artRatio;
      }
      canvas.style.width = `${dispW}px`;
      canvas.style.height = `${dispH}px`;
      canvas.width = Math.floor(dispW * dpr);
      canvas.height = Math.floor(dispH * dpr);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      // Paper
      ctx.fillStyle = "#fafaf7";
      ctx.fillRect(0, 0, dispW, dispH);

      // mm → px scale
      const scale = dispW / artwork.widthMm;
      ctx.save();
      ctx.scale(scale, scale);
      ctx.strokeStyle = "#111";
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
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [artwork]);

  return (
    <div
      ref={wrapRef}
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#1d1d1b",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
          background: "#fafaf7",
        }}
      />
    </div>
  );
}
