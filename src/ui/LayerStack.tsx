import { useState } from "react";
import { DISTORTIONS, distortionById } from "../distortions/registry";
import { useApp } from "../state/store";

export function LayerStack() {
  const layers = useApp((s) => s.layers);
  const add = useApp((s) => s.addLayer);
  const remove = useApp((s) => s.removeLayer);
  const toggle = useApp((s) => s.toggleLayer);
  const move = useApp((s) => s.moveLayer);
  const clear = useApp((s) => s.clearLayers);
  const [open, setOpen] = useState(false);

  return (
    <div style={{ padding: "10px 12px", borderBottom: "1px solid #2d2d2a" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#bbb" }}>
          PIPELINE
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button style={iconBtn} onClick={() => setOpen((o) => !o)} title="Add layer">
            +
          </button>
          {layers.length > 0 && (
            <button style={iconBtn} onClick={clear} title="Clear all">
              ✕
            </button>
          )}
        </div>
      </div>

      {open && (
        <div
          style={{
            background: "#1d1d1b",
            border: "1px solid #333",
            borderRadius: 3,
            marginBottom: 8,
            overflow: "hidden",
          }}
        >
          {DISTORTIONS.map((d) => (
            <button
              key={d.id}
              onClick={() => {
                add(d.id);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                background: "transparent",
                color: "#ddd",
                border: "none",
                borderBottom: "1px solid #2d2d2a",
                cursor: "pointer",
                fontSize: 12,
                fontFamily: "inherit",
              }}
            >
              <div style={{ fontWeight: 600 }}>{d.name}</div>
              <div style={{ fontSize: 10, color: "#777", marginTop: 2 }}>
                {d.description}
              </div>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {layers.length === 0 && (
          <div style={{ fontSize: 10, color: "#666", fontStyle: "italic" }}>
            No distortions — base generator only. Use + to add.
          </div>
        )}
        {layers.map((l, i) => {
          const d = distortionById(l.distortionId);
          return (
            <div
              key={l.uid}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 6px",
                background: l.enabled ? "#22211f" : "#181816",
                border: "1px solid #2d2d2a",
                borderRadius: 3,
                opacity: l.enabled ? 1 : 0.5,
              }}
            >
              <span style={{ fontSize: 10, color: "#666", width: 16 }}>{i + 1}.</span>
              <input
                type="checkbox"
                checked={l.enabled}
                onChange={() => toggle(l.uid)}
                style={{ accentColor: "#e96a3a" }}
              />
              <span style={{ flex: 1, fontSize: 11, color: "#ddd" }}>{d?.name}</span>
              <button style={tinyBtn} onClick={() => move(l.uid, -1)} disabled={i === 0}>
                ▲
              </button>
              <button
                style={tinyBtn}
                onClick={() => move(l.uid, 1)}
                disabled={i === layers.length - 1}
              >
                ▼
              </button>
              <button style={tinyBtn} onClick={() => remove(l.uid)} title="Remove">
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 22,
  height: 22,
  padding: 0,
  background: "#2d2d2a",
  color: "#eee",
  border: "1px solid #444",
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 14,
  lineHeight: 1,
};

const tinyBtn: React.CSSProperties = {
  width: 18,
  height: 18,
  padding: 0,
  background: "#2d2d2a",
  color: "#ccc",
  border: "1px solid #3a3a38",
  borderRadius: 2,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 9,
  lineHeight: 1,
};
