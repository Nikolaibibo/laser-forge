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
    <div style={{ padding: "12px", borderBottom: "1px solid var(--border-color)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "var(--text-secondary)", textTransform: "uppercase" }}>
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
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: 6,
            boxShadow: "var(--glass-shadow)",
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
                color: "var(--text-primary)",
                border: "none",
                borderBottom: "1px solid var(--border-color)",
                cursor: "pointer",
                fontSize: 12,
                fontFamily: "inherit",
                transition: "all 0.15s ease",
              }}
              className="leva-c-folder" // Reuses Leva folder class logic for focus
            >
              <div style={{ fontWeight: 600 }}>{d.name}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                {d.description}
              </div>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {layers.length === 0 && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", padding: "4px 0" }}>
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
                padding: "6px 8px",
                background: l.enabled ? "var(--bg-card)" : "rgba(20, 20, 18, 0.3)",
                border: "1px solid var(--border-color)",
                borderRadius: 6,
                opacity: l.enabled ? 1 : 0.6,
                transition: "all 0.2s ease",
              }}
            >
              <span style={{ fontSize: 10, color: "var(--text-muted)", width: 16 }}>{i + 1}.</span>
              <input
                type="checkbox"
                checked={l.enabled}
                onChange={() => toggle(l.uid)}
                style={{ accentColor: "var(--accent)" }}
              />
              <span style={{ flex: 1, fontSize: 12, color: "var(--text-primary)" }}>{d?.name}</span>
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
  width: 24,
  height: 24,
  padding: 0,
  background: "var(--bg-card)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-color)",
  borderRadius: 4,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "all 0.15s ease",
};

const tinyBtn: React.CSSProperties = {
  width: 20,
  height: 20,
  padding: 0,
  background: "var(--bg-hover)",
  color: "var(--text-secondary)",
  border: "1px solid var(--border-color)",
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 9,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "all 0.15s ease",
};
