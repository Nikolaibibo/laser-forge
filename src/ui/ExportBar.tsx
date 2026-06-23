import { useState, useRef, useEffect } from "react";
import { useApp } from "../state/store";
import { downloadSvg } from "../render/svgExport";
import { downloadGcode } from "../plotter/gcode";
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
  const penWidthMm = useApp((s) => s.penWidthMm);
  const layers = useApp((s) => s.layers);
  const layerParams = useApp((s) => s.layerParams);
  const [copied, setCopied] = useState(false);
  const [dedupe, setDedupe] = useState(false);
  const [join, setJoin] = useState(false);

  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    
    // Ignore interactive elements
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "BUTTON" ||
      target.tagName === "SELECT" ||
      target.tagName === "LABEL" ||
      target.closest("button") ||
      target.closest("input") ||
      target.closest("select") ||
      target.closest("label")
    ) {
      return;
    }

    e.preventDefault();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      setPosition({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y,
      });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDragging]);

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
      className="glass-panel animate-fade-in"
      onPointerDown={handlePointerDown}
      style={{
        position: "absolute",
        bottom: 24,
        left: "50%",
        transform: `translateX(-50%) translate(${position.x}px, ${position.y}px)`,
        display: "flex",
        gap: 12,
        padding: "8px 14px",
        borderRadius: 12,
        alignItems: "center",
        zIndex: 10,
        whiteSpace: "nowrap",
        boxShadow: isDragging ? "0 20px 40px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.05)" : "var(--glass-shadow)",
        border: isDragging ? "1px solid var(--accent)" : "var(--glass-border)",
        transition: isDragging ? "none" : "box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        cursor: isDragging ? "grabbing" : "default",
      }}
    >
      {/* Drag handle */}
      <div
        onDoubleClick={() => setPosition({ x: 0, y: 0 })}
        style={{
          display: "flex",
          alignItems: "center",
          cursor: isDragging ? "grabbing" : "grab",
          padding: "4px 8px 4px 2px",
          color: "var(--text-muted)",
          userSelect: "none",
          touchAction: "none",
        }}
        title="Drag to reposition · double-click to recenter"
      >
        <svg width="8" height="16" viewBox="0 0 8 16" fill="currentColor">
          <circle cx="2" cy="2" r="1.2" />
          <circle cx="2" cy="6" r="1.2" />
          <circle cx="2" cy="10" r="1.2" />
          <circle cx="2" cy="14" r="1.2" />
          <circle cx="6" cy="2" r="1.2" />
          <circle cx="6" cy="6" r="1.2" />
          <circle cx="6" cy="10" r="1.2" />
          <circle cx="6" cy="14" r="1.2" />
        </svg>
      </div>
      {/* Seed controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={labelStyle}>Seed</span>
        <input
          type="number"
          value={seed}
          onChange={(e) => setSeed(Number(e.target.value))}
          style={inputStyle}
        />
        <button onClick={randomSeed} style={btnStyle} title="Reroll Seed">
          🎲 Reroll
        </button>
      </div>

      <div style={dividerStyle} />

      {/* Stats */}
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Geometry
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>
          {lineCount} lines · {pointCount.toLocaleString("en-US")} pts
        </span>
      </div>

      <div style={dividerStyle} />

      {/* Dedupe & Join toggles */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <label
          title="Removes overlapping paths so the laser doesn't burn them twice."
          style={checkboxLabelStyle}
        >
          <input
            type="checkbox"
            checked={dedupe}
            onChange={(e) => setDedupe(e.target.checked)}
            style={checkboxStyle}
          />
          Dedupe
        </label>
        <label
          title="Joins open polylines whose endpoints touch into longer continuous paths, reducing pen lifts."
          style={checkboxLabelStyle}
        >
          <input
            type="checkbox"
            checked={join}
            onChange={(e) => setJoin(e.target.checked)}
            style={checkboxStyle}
          />
          Join
        </label>
      </div>

      <div style={dividerStyle} />

      {/* Share & Download triggers */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={copyShareLink} style={btnStyle}>
          {copied ? "✓ copied" : "🔗 Share"}
        </button>
        <button
          onClick={() => downloadSvg(artwork, `${generatorId}-${seed}.svg`, { dedupe, join, strokeWidthMm: penWidthMm })}
          style={svgBtnStyle}
        >
          ⬇ SVG
        </button>
        <button
          title="GRBL G-code for CNC machines."
          onClick={() => downloadGcode(artwork, `${generatorId}-${seed}.gcode`, { dedupe, join })}
          style={gcodeBtnStyle}
        >
          ⬇ G-code
        </button>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const inputStyle: React.CSSProperties = {
  width: 76,
  background: "var(--bg-input)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-color)",
  padding: "4px 8px",
  borderRadius: 6,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  outline: "none",
};

const dividerStyle: React.CSSProperties = {
  width: 1,
  height: 24,
  background: "var(--border-color)",
  margin: "0 4px",
};

const btnStyle: React.CSSProperties = {
  padding: "5px 12px",
  background: "var(--bg-hover)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-color)",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 500,
  transition: "all 0.15s ease",
};

const svgBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: "var(--accent)",
  borderColor: "transparent",
  color: "#fff",
  fontWeight: 600,
};

const gcodeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: "#3a7ae9",
  borderColor: "transparent",
  color: "#fff",
  fontWeight: 600,
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  cursor: "pointer",
  fontSize: 11,
  color: "var(--text-secondary)",
  fontWeight: 500,
};

const checkboxStyle: React.CSSProperties = {
  accentColor: "var(--accent)",
  cursor: "pointer",
};
