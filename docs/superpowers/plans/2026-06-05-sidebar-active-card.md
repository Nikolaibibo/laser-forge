# Sidebar Active Card + Generator Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the always-expanded 16-generator list with a compact active-generator card that opens the list as a sidebar overlay, and move the PIPELINE section above the fold.

**Architecture:** `GeneratorPicker` becomes a two-state component (collapsed card / full-sidebar overlay) with local `useState` only. `App.tsx` reorders the sidebar (GENERATOR → MOTIF → PIPELINE) and drops the stray "BASE" label. No store, URL-sync, or dependency changes.

**Tech Stack:** React 18 + TypeScript, zustand store (read-only here), inline styles (codebase convention). No test runner exists in this repo — verification is `npm run build` (tsc + vite) plus a manual browser check.

**Spec:** `docs/superpowers/specs/2026-06-05-sidebar-active-card-design.md`

---

### Task 1: Rewrite `GeneratorPicker` as card + overlay

**Files:**
- Modify: `src/ui/GeneratorPicker.tsx` (full rewrite, currently 61 lines)

Context for the implementer:
- `GENERATOR_GROUPS` (from `../generators/registry`) is `{ title: string; items: GeneratorDef[] }[]` — 3 groups, 16 generators total. Each item has `id`, `name`, `description`.
- `useApp((s) => s.generatorId)` is the active id, `useApp((s) => s.setGenerator)` switches it.
- The overlay positions itself with `position: absolute; inset: 0` — it fills the nearest positioned ancestor. Task 2 sets `position: relative` on the sidebar `<aside>` in `App.tsx`. Until Task 2 lands, the overlay may fill the viewport instead of the sidebar; that is expected mid-stack and fixed by Task 2.

- [ ] **Step 1: Replace the file content**

Replace the entire content of `src/ui/GeneratorPicker.tsx` with:

```tsx
// src/ui/GeneratorPicker.tsx — active-generator card + full-sidebar overlay list.
// Generator switching is rare (pick one, tune for a long time), so the 16-entry
// list lives behind one click instead of permanently eating ~900px of sidebar.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { GENERATOR_GROUPS } from "../generators/registry";
import { useApp } from "../state/store";

const sectionLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1,
  color: "#bbb",
};

const cardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  textAlign: "left",
  padding: "10px 12px",
  background: "#1d1d1b",
  border: "1px solid #2d2d2a",
  borderRadius: 4,
  cursor: "pointer",
  fontFamily: "inherit",
};

const overlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 10,
  background: "#141413",
  overflowY: "auto",
};

const closeBtn: CSSProperties = {
  width: 22,
  height: 22,
  padding: 0,
  background: "#2d2d2a",
  color: "#eee",
  border: "1px solid #444",
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12,
  lineHeight: 1,
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
    <div style={{ padding: "10px 14px", borderBottom: "1px solid #2d2d2a" }}>
      <div style={{ ...sectionLabel, marginBottom: 6 }}>GENERATOR</div>

      <button style={cardStyle} onClick={() => setOpen(true)} title="Change generator">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#fff" }}>
            {active?.name ?? id}
          </div>
          <div style={{ fontSize: 10, color: "#777", marginTop: 2 }}>
            {activeGroup?.title}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#888",
              marginTop: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {active?.description}
          </div>
        </div>
        <span style={{ color: "#e96a3a", fontSize: 14, flexShrink: 0 }}>⇄</span>
      </button>

      {open && (
        <div ref={overlayRef} style={overlayStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 14px",
              borderBottom: "1px solid #2d2d2a",
              position: "sticky",
              top: 0,
              background: "#141413",
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
                  color: "#777",
                  padding: "12px 14px 4px",
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
                      background: isActive ? "#2d2d2a" : "transparent",
                      color: isActive ? "#fff" : "#bbb",
                      border: "none",
                      borderLeft: isActive
                        ? "3px solid #e96a3a"
                        : "3px solid transparent",
                      cursor: "pointer",
                      fontSize: 13,
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{g.name}</div>
                    <div
                      style={{
                        fontSize: 11,
                        color: isActive ? "#aaa" : "#666",
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
```

- [ ] **Step 2: Verify the build**

Run: `cd /Users/nikolaibockholt/Documents/web/laser-forge && npm run build`
Expected: tsc + vite build complete with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/GeneratorPicker.tsx
git commit -m "feat: generator picker as active card with overlay list"
```

---

### Task 2: Reorder sidebar in `App.tsx`, unify section hierarchy

**Files:**
- Modify: `src/App.tsx:106-142` (the left `<aside>` block)

Three changes inside the left `<aside>`:
1. Add `position: "relative"` so the overlay from Task 1 fills the sidebar (not the viewport).
2. Remove the stray `BASE` label `<div>`.
3. Reorder children: header → `<GeneratorPicker />` → `<MotifPanel />` → `<LayerStack />` → spacer → footer. (Today it is MOTIF → generators → pipeline.)

- [ ] **Step 1: Apply the edit**

In `src/App.tsx`, replace this block:

```tsx
      <aside
        style={{
          gridRow: "1 / 3",
          gridColumn: 1,
          borderRight: "1px solid #2d2d2a",
          background: "#141413",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header style={{ padding: "16px 14px", borderBottom: "1px solid #2d2d2a" }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>
            Laser Forge
          </div>
          <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>
            Generative vector workbench
          </div>
        </header>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#bbb", padding: "10px 14px 4px" }}>
          BASE
        </div>
        <MotifPanel />
        <GeneratorPicker />
        <LayerStack />
        <div style={{ flex: 1 }} />
```

with:

```tsx
      <aside
        style={{
          gridRow: "1 / 3",
          gridColumn: 1,
          borderRight: "1px solid #2d2d2a",
          background: "#141413",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        <header style={{ padding: "16px 14px", borderBottom: "1px solid #2d2d2a" }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>
            Laser Forge
          </div>
          <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>
            Generative vector workbench
          </div>
        </header>
        <GeneratorPicker />
        <MotifPanel />
        <LayerStack />
        <div style={{ flex: 1 }} />
```

(The footer and everything after the spacer stay unchanged.)

- [ ] **Step 2: Verify the build**

Run: `cd /Users/nikolaibockholt/Documents/web/laser-forge && npm run build`
Expected: tsc + vite build complete with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: sidebar reorder — generator card, motif, pipeline above the fold"
```

---

### Task 3: Manual browser verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `cd /Users/nikolaibockholt/Documents/web/laser-forge && npm run dev`
Expected: Vite serves on `http://localhost:5173`.

- [ ] **Step 2: Verify the checklist in the browser**

Open `http://localhost:5173` and check:

1. Sidebar shows (top → bottom): header, GENERATOR card, PIPELINE — no scrolling needed to see the pipeline.
2. Card shows the active generator's name, group, and one-line description.
3. Clicking the card opens the overlay covering the full sidebar; the active entry is highlighted and in view.
4. Selecting another generator closes the overlay and updates card + canvas.
5. `Esc` closes the overlay; clicking on the canvas (outside the sidebar) closes it too.
6. Switch to the Blueprint generator → MOTIF section appears between card and PIPELINE; switch away → it disappears.
7. No "BASE" label anywhere.

- [ ] **Step 3: Report results**

Report any deviation from the checklist instead of fixing ad hoc — UI judgment calls go back to Nikolai.
