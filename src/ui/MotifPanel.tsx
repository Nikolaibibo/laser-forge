// src/ui/MotifPanel.tsx — SVG motif upload for the motif-consuming generators.
// Renders only while one of those generators is active. Parse errors keep the
// previous motif loaded (per spec).
import { useRef, useState, type CSSProperties } from "react";
import { useApp } from "../state/store";
import { parseSvgMotif } from "../util/svgImport";

/** Generators that read the imported motif from the store. */
const MOTIF_CONSUMERS = new Set(["blueprint", "pattern-maker", "svg"]);

const btnStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-color)",
  borderRadius: 4,
  color: "var(--text-primary)",
  cursor: "pointer",
  fontSize: 11,
  padding: "5px 12px",
  transition: "all 0.15s ease",
};

export function MotifPanel() {
  const generatorId = useApp((s) => s.generatorId);
  const motif = useApp((s) => s.motif);
  const setMotif = useApp((s) => s.setMotif);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!MOTIF_CONSUMERS.has(generatorId)) return null;

  const onFile = (f: File | undefined) => {
    if (!f) return;
    f.text().then((src) => {
      try {
        setMotif({ name: f.name, ...parseSvgMotif(src) });
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-color)", fontSize: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 6 }}>
        MOTIF
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".svg,image/svg+xml"
        style={{ display: "none" }}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = ""; // re-selecting the same file fires onChange again
        }}
      />
      <button style={btnStyle} onClick={() => fileRef.current?.click()} className="transition-all-fast">
        Load SVG…
      </button>
      {motif && (
        <div style={{ marginTop: 8, color: "#2b7a4b", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>
            {motif.name} ({motif.polylines.length} paths)
          </span>
          <button style={{ ...btnStyle, padding: "2px 6px", fontSize: 10 }} onClick={() => setMotif(null)} title="Clear motif">
            ✕
          </button>
        </div>
      )}
      {error && <div style={{ marginTop: 8, color: "#d9383a", fontSize: 11 }}>{error}</div>}
    </div>
  );
}
