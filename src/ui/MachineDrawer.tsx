import { useState } from "react";
import { useApp } from "../state/store";
import { PlotterPanel } from "./PlotterPanel";
import { AxiDrawPanel } from "./AxiDrawPanel";

type Machine = "grbl" | "axidraw";

export function MachineDrawer() {
  const drawerOpen = useApp((s) => s.drawerOpen);
  const setDrawerOpen = useApp((s) => s.setDrawerOpen);
  const plotterConnected = useApp((s) => s.plotterConnected);
  const plotterState = useApp((s) => s.plotterState);

  const [machine, setMachine] = useState<Machine>("grbl");

  if (!drawerOpen) return null;

  return (
    <div className="lf-drawer">
      <div className="lf-drawer__header">
        {/* Tab switcher */}
        <div className="lf-drawer__tabs">
          <button
            className={`lf-drawer__tab${machine === "grbl" ? " lf-drawer__tab--active" : ""}`}
            onClick={() => setMachine("grbl")}
          >
            GRBL / Laser
          </button>
          <button
            className={`lf-drawer__tab${machine === "axidraw" ? " lf-drawer__tab--active" : ""}`}
            onClick={() => setMachine("axidraw")}
          >
            AxiDraw
          </button>
        </div>

        {/* Connection status */}
        <div className="lf-drawer__status">
          <span
            className="lf-led"
            style={{ background: plotterConnected ? "var(--ok)" : "var(--text-muted)" }}
            aria-label={plotterConnected ? "Connected" : "Disconnected"}
          />
          <span className="lf-drawer__state-text">{plotterState}</span>
        </div>

        {/* Close button */}
        <button
          className="lf-drawer__close"
          onClick={() => setDrawerOpen(false)}
          aria-label="Close machine panel"
        >
          ×
        </button>
      </div>

      <div className="lf-drawer__body scroller">
        {machine === "grbl" ? <PlotterPanel /> : <AxiDrawPanel />}
      </div>
    </div>
  );
}
