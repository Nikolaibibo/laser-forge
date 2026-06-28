import { useRef, useState } from "react";
import { useApp } from "../state/store";
import { byId, GENERATOR_GROUPS } from "../generators/registry";
import { DISTORTIONS } from "../distortions/registry";

/** Look up which group a generator belongs to (for the tag label). */
function generatorGroup(id: string): string | undefined {
  for (const g of GENERATOR_GROUPS) {
    if (g.items.some((item) => item.id === id)) return g.title;
  }
  return undefined;
}

export function PipelineRail() {
  const generatorId = useApp((s) => s.generatorId);
  const selectedNodeId = useApp((s) => s.selectedNodeId);
  const layers = useApp((s) => s.layers);
  const setSelectedNode = useApp((s) => s.setSelectedNode);
  const toggleLayer = useApp((s) => s.toggleLayer);
  const removeLayer = useApp((s) => s.removeLayer);
  const addLayer = useApp((s) => s.addLayer);
  const setGalleryOpen = useApp((s) => s.setGalleryOpen);

  const [menuOpen, setMenuOpen] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const gen = byId(generatorId);
  const group = generatorGroup(generatorId);
  const sourceSelected = selectedNodeId === "source";

  function handleAddLayer(distId: string) {
    addLayer(distId);
    setMenuOpen(false);
  }

  return (
    <aside className="lf-rail scroller">
      {/* SOURCE node */}
      <div
        className={`lf-node lf-node--source${sourceSelected ? " lf-node--selected" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => setSelectedNode("source")}
        onKeyDown={(e) => e.key === "Enter" && setSelectedNode("source")}
      >
        <div className="lf-node__icon">◆</div>
        <div className="lf-node__info">
          <span className="lf-node__name">{gen?.name ?? generatorId}</span>
          {group && <span className="lf-node__tag">{group}</span>}
        </div>
        <button
          className="lf-node__swap"
          title="Swap generator"
          onClick={(e) => {
            e.stopPropagation();
            setGalleryOpen(true);
          }}
        >
          ▸
        </button>
      </div>

      {/* Layer nodes */}
      {layers.map((layer, i) => {
        const def = DISTORTIONS.find((d) => d.id === layer.distortionId);
        const isSelected = selectedNodeId === layer.uid;
        return (
          <div key={layer.uid}>
            {/* Connector line */}
            <div className="lf-node__flow" aria-hidden="true" />

            <div
              className={`lf-node${isSelected ? " lf-node--selected" : ""}${!layer.enabled ? " lf-node--disabled" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedNode(layer.uid)}
              onKeyDown={(e) => e.key === "Enter" && setSelectedNode(layer.uid)}
            >
              <span className="lf-node__badge">{i + 1}</span>
              <span className="lf-node__name">{def?.name ?? layer.distortionId}</span>
              <div className="lf-node__actions">
                {/* Eye toggle */}
                <button
                  className={`lf-node__eye${layer.enabled ? " lf-node__eye--on" : ""}`}
                  title={layer.enabled ? "Disable layer" : "Enable layer"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLayer(layer.uid);
                  }}
                  aria-pressed={layer.enabled}
                >
                  {layer.enabled ? "◉" : "◎"}
                </button>
                {/* Remove button */}
                <button
                  className="lf-node__remove"
                  title="Remove layer"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeLayer(layer.uid);
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Add Layer button + popover */}
      <div className="lf-rail__add">
        <button
          ref={addBtnRef}
          className="lf-rail__add-btn"
          onClick={() => setMenuOpen((v) => !v)}
        >
          + Layer
        </button>

        {menuOpen && (
          <>
            {/* Backdrop to close menu */}
            <div
              className="lf-addmenu__backdrop"
              onClick={() => setMenuOpen(false)}
            />
            <div className="lf-addmenu" role="menu">
              {DISTORTIONS.map((d) => (
                <button
                  key={d.id}
                  className="lf-addmenu__item"
                  role="menuitem"
                  onClick={() => handleAddLayer(d.id)}
                >
                  {d.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
