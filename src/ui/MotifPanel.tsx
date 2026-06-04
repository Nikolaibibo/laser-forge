// src/ui/MotifPanel.tsx — SVG motif upload for the blueprint generator.
// Renders only while the blueprint generator is active. Parse errors keep the
// previous motif loaded (per spec).
import { useRef, useState, type CSSProperties } from "react";
import { useApp } from "../state/store";
import { parseSvgMotif } from "../util/svgImport";

const btnStyle: CSSProperties = {
  background: "#1d1d1b",
  border: "1px solid #2d2d2a",
  borderRadius: 4,
  color: "#eee",
  cursor: "pointer",
  fontSize: 11,
  padding: "4px 10px",
};

export function MotifPanel() {
  const generatorId = useApp((s) => s.generatorId);
  const motif = useApp((s) => s.motif);
  const setMotif = useApp((s) => s.setMotif);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (generatorId !== "blueprint") return null;

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
    <div style={{ padding: "10px 14px", borderBottom: "1px solid #2d2d2a", fontSize: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#bbb", marginBottom: 6 }}>
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
      <button style={btnStyle} onClick={() => fileRef.current?.click()}>
        Load SVG…
      </button>
      {motif && (
        <div style={{ marginTop: 6, color: "#9ab89a", display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {motif.name} ({motif.polylines.length} paths)
          </span>
          <button style={{ ...btnStyle, padding: "0 6px" }} onClick={() => setMotif(null)} title="Clear motif">
            ✕
          </button>
        </div>
      )}
      {error && <div style={{ marginTop: 6, color: "#e0584f" }}>{error}</div>}
    </div>
  );
}
