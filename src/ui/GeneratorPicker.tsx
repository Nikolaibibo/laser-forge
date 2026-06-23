// src/ui/GeneratorPicker.tsx — active-generator card + full-sidebar overlay list.
// Generator switching is rare (pick one, tune for a long time), so the 16-entry
// list lives behind one click instead of permanently eating ~900px of sidebar.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { GENERATOR_GROUPS } from "../generators/registry";
import { useApp } from "../state/store";

const sectionLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1.2,
  color: "var(--text-secondary)",
  textTransform: "uppercase",
};

const cardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  textAlign: "left",
  padding: "12px 14px",
  background: "var(--bg-card)",
  border: "1px solid var(--border-color)",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
};

const overlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 20,
  background: "var(--bg-sidebar)",
  backdropFilter: "var(--glass-blur)",
  WebkitBackdropFilter: "var(--glass-blur)",
  overflowY: "auto",
};

const closeBtn: CSSProperties = {
  width: 24,
  height: 24,
  padding: 0,
  background: "var(--bg-hover)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-color)",
  borderRadius: 4,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "all 0.2s ease",
};

export function GeneratorPicker() {
  const id = useApp((s) => s.generatorId);
  const set = useApp((s) => s.setGenerator);
  const [open, setOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const activeGroup = GENERATOR_GROUPS.find((g) => g.items.some((it) => it.id === id));
  const active = activeGroup?.items.find((it) => it.id === id);

  // Close on Esc and on click outside the overlay.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  // Bring the active entry into view when the overlay opens.
  useEffect(() => {
    if (open) activeRef.current?.scrollIntoView({ block: "center" });
  }, [open]);

  return (
    <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-color)" }}>
      <div style={{ ...sectionLabel, marginBottom: 6 }}>GENERATOR</div>

      <button style={cardStyle} onClick={() => setOpen(true)} title="Change generator">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
            {active?.name ?? id}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
            {activeGroup?.title}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-secondary)",
              marginTop: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {active?.description}
          </div>
        </div>
        <span style={{ color: "var(--accent)", fontSize: 14, flexShrink: 0 }}>⇄</span>
      </button>

      {open && (
        <div ref={overlayRef} style={overlayStyle} className="scroller">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 14px",
              borderBottom: "1px solid var(--border-color)",
              position: "sticky",
              top: 0,
              background: "var(--bg-sidebar)",
              zIndex: 1,
            }}
          >
            <div style={sectionLabel}>SELECT GENERATOR</div>
            <button style={closeBtn} onClick={() => setOpen(false)} title="Close">
              ✕
            </button>
          </div>

          {GENERATOR_GROUPS.map((group) => (
            <div key={group.title}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                  padding: "16px 14px 4px",
                }}
              >
                {group.title}
              </div>
              {group.items.map((g) => {
                const isActive = g.id === id;
                return (
                  <button
                    key={g.id}
                    ref={isActive ? activeRef : undefined}
                    onClick={() => {
                      set(g.id);
                      setOpen(false);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 14px",
                      background: isActive ? "var(--bg-hover)" : "transparent",
                      color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                      border: "none",
                      borderLeft: isActive
                        ? "3px solid var(--accent)"
                        : "3px solid transparent",
                      cursor: "pointer",
                      fontSize: 13,
                      fontFamily: "inherit",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{g.name}</div>
                    <div
                      style={{
                        fontSize: 11,
                        color: isActive ? "var(--text-secondary)" : "var(--text-muted)",
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
          ))}
        </div>
      )}
    </div>
  );
}
