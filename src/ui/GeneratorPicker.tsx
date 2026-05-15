import { GENERATORS } from "../generators/registry";
import { useApp } from "../state/store";

export function GeneratorPicker() {
  const id = useApp((s) => s.generatorId);
  const set = useApp((s) => s.setGenerator);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {GENERATORS.map((g) => {
        const active = g.id === id;
        return (
          <button
            key={g.id}
            onClick={() => set(g.id)}
            style={{
              textAlign: "left",
              padding: "10px 14px",
              background: active ? "#2d2d2a" : "transparent",
              color: active ? "#fff" : "#bbb",
              border: "none",
              borderLeft: active ? "3px solid #e96a3a" : "3px solid transparent",
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "inherit",
            }}
          >
            <div style={{ fontWeight: 600 }}>{g.name}</div>
            <div
              style={{
                fontSize: 11,
                color: active ? "#aaa" : "#666",
                marginTop: 2,
                lineHeight: 1.3,
              }}
            >
              {g.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}
