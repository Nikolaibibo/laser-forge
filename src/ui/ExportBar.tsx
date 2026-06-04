import { useState } from "react";
import { useApp } from "../state/store";
import { downloadSvg } from "../render/svgExport";
import type { Artwork } from "../generators/types";
import { writeHash, type SharePayload } from "../state/urlSync";

type Props = {
  artwork: Artwork;
  currentParams: Record<string, unknown>;
};

export function ExportBar({ artwork, currentParams }: Props) {
  const seed = useApp((s) => s.seed);
  const randomSeed = useApp((s) => s.randomSeed);
  const setSeed = useApp((s) => s.setSeed);
  const generatorId = useApp((s) => s.generatorId);
  const w = useApp((s) => s.canvasWMm);
  const h = useApp((s) => s.canvasHMm);
  const setCanvas = useApp((s) => s.setCanvas);
  const penWidthMm = useApp((s) => s.penWidthMm);
  const setPenWidthMm = useApp((s) => s.setPenWidthMm);
  const layers = useApp((s) => s.layers);
  const layerParams = useApp((s) => s.layerParams);
  const [copied, setCopied] = useState(false);
  const [dedupe, setDedupe] = useState(false);
  const [join, setJoin] = useState(false);

  const copyShareLink = async () => {
    const payload: SharePayload = {
      g: generatorId,
      s: seed,
      w,
      h,
      p: currentParams,
      l: layers,
      lp: layerParams,
      pw: penWidthMm,
    };
    writeHash(payload);
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const lineCount = artwork.polylines.length;
  const pointCount = artwork.polylines.reduce((n, l) => n + l.points.length, 0);

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        padding: "10px 16px",
        borderTop: "1px solid #2d2d2a",
        background: "#141413",
        color: "#ccc",
        fontSize: 12,
        alignItems: "center",
      }}
    >
      <label>
        Seed{" "}
        <input
          type="number"
          value={seed}
          onChange={(e) => setSeed(Number(e.target.value))}
          style={inputStyle}
        />
      </label>
      <button onClick={randomSeed} style={btnStyle}>
        🎲 Reroll
      </button>
      <label>
        W{" "}
        <input
          type="number"
          value={w}
          onChange={(e) => setCanvas(Number(e.target.value), h)}
          style={{ ...inputStyle, width: 64 }}
        />
        mm
      </label>
      <label>
        H{" "}
        <input
          type="number"
          value={h}
          onChange={(e) => setCanvas(w, Number(e.target.value))}
          style={{ ...inputStyle, width: 64 }}
        />
        mm
      </label>
      <label title="Stroke width in preview + SVG export. 0.3 Fineliner · 0.5 Gel · 1–2 Filzstift.">
        Pen{" "}
        <input
          type="number"
          value={penWidthMm}
          min={0.05}
          step={0.1}
          onChange={(e) => setPenWidthMm(Number(e.target.value))}
          style={{ ...inputStyle, width: 56 }}
        />
        mm
      </label>
      <div style={{ flex: 1 }} />
      <span style={{ color: "#777" }}>
        {lineCount} lines · {pointCount.toLocaleString("en-US")} points
      </span>
      <button onClick={copyShareLink} style={btnStyle}>
        {copied ? "✓ copied" : "🔗 Copy link"}
      </button>
      <label
        title="Removes overlapping paths so the laser doesn't burn them twice."
        style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
      >
        <input
          type="checkbox"
          checked={dedupe}
          onChange={(e) => setDedupe(e.target.checked)}
        />
        Dedupe paths
      </label>
      <label
        title="Joins open polylines whose endpoints touch into longer continuous paths, reducing pen lifts."
        style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
      >
        <input
          type="checkbox"
          checked={join}
          onChange={(e) => setJoin(e.target.checked)}
        />
        Join paths
      </label>
      <button
        onClick={() => downloadSvg(artwork, `${generatorId}-${seed}.svg`, { dedupe, join, strokeWidthMm: penWidthMm })}
        style={{ ...btnStyle, background: "#e96a3a", color: "#fff" }}
      >
        ⬇ SVG
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: 88,
  background: "#222",
  color: "#fff",
  border: "1px solid #333",
  padding: "4px 6px",
  borderRadius: 3,
  fontFamily: "inherit",
  fontSize: 12,
};

const btnStyle: React.CSSProperties = {
  padding: "5px 12px",
  background: "#2d2d2a",
  color: "#eee",
  border: "1px solid #444",
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12,
};
