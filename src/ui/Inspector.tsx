// src/ui/Inspector.tsx — right-side panel; renders schema-driven controls
// for whichever node is selected in the signal chain ("source" or a layer uid).
import { useRef, useState, useEffect } from "react";
import { useApp } from "../state/store";
import { byId } from "../generators/registry";
import { distortionById } from "../distortions/registry";
import { schemaDefaults } from "./controls/schema";
import { SchemaControls } from "./controls/SchemaControls";
import { parseSvgMotif } from "../util/svgImport";

/** Generators that read the imported motif from the store. */
const MOTIF_CONSUMERS = new Set(["blueprint", "pattern-maker", "svg", "specsheet"]);

export function Inspector() {
  const selectedNodeId = useApp((s) => s.selectedNodeId);
  const generatorId = useApp((s) => s.generatorId);
  const genParams = useApp((s) => s.genParams);
  const setGenParams = useApp((s) => s.setGenParams);
  const layers = useApp((s) => s.layers);
  const layerParams = useApp((s) => s.layerParams);
  const setLayerParams = useApp((s) => s.setLayerParams);
  const motif = useApp((s) => s.motif);
  const setMotif = useApp((s) => s.setMotif);

  const [motifError, setMotifError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Clear stale parse-error when the user switches to a different generator.
  useEffect(() => { setMotifError(null); }, [generatorId]);

  const isSource = selectedNodeId === "source";

  // --- Resolve the selected node ---
  if (isSource) {
    const gen = byId(generatorId);
    if (!gen) {
      return (
        <aside className="lf-inspector scroller">
          <div className="lf-inspector__empty">No generator selected</div>
        </aside>
      );
    }

    const schema = gen.schema;
    const values = genParams[generatorId] ?? schemaDefaults(schema);
    const onChange = (field: string, value: unknown) =>
      setGenParams(generatorId, { ...values, [field]: value });

    const showMotif = MOTIF_CONSUMERS.has(generatorId);

    const onFile = (f: File | undefined) => {
      if (!f) return;
      f.text()
        .then((src) => {
          try {
            setMotif({ name: f.name, ...parseSvgMotif(src) });
            setMotifError(null);
          } catch (e) {
            setMotifError(e instanceof Error ? e.message : String(e));
          }
        })
        .catch((e) => setMotifError(e instanceof Error ? e.message : String(e)));
    };

    return (
      <aside className="lf-inspector scroller">
        <div className="lf-inspector__head">
          <div className="lf-inspector__name">{gen.name}</div>
          {gen.description && (
            <div className="lf-inspector__desc">{gen.description}</div>
          )}
        </div>

        {showMotif && (
          <div className="lf-motif">
            <div className="lf-motif__label">MOTIF</div>
            <input
              ref={fileRef}
              type="file"
              accept=".svg,image/svg+xml"
              style={{ display: "none" }}
              onChange={(e) => {
                onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className="lf-motif__row">
              <button
                className="lf-motif__btn transition-all-fast"
                onClick={() => fileRef.current?.click()}
              >
                Load SVG…
              </button>
              {motif && (
                <button
                  className="lf-motif__btn lf-motif__btn--clear transition-all-fast"
                  onClick={() => { setMotif(null); setMotifError(null); }}
                  title="Clear motif"
                >
                  Clear
                </button>
              )}
            </div>
            {motif && (
              <div className="lf-motif__chip">
                <span className="lf-motif__filename">{motif.name}</span>
                <span className="lf-motif__meta">
                  {motif.polylines.length} path{motif.polylines.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
            {motifError && (
              <div className="lf-motif__error">{motifError}</div>
            )}
          </div>
        )}

        <SchemaControls key={selectedNodeId + ":" + generatorId} schema={schema} values={values} onChange={onChange} />
      </aside>
    );
  }

  // --- Layer node ---
  const layer = layers.find((l) => l.uid === selectedNodeId);
  if (!layer) {
    return (
      <aside className="lf-inspector scroller">
        <div className="lf-inspector__empty">No node selected</div>
      </aside>
    );
  }

  const dist = distortionById(layer.distortionId);
  if (!dist) {
    return (
      <aside className="lf-inspector scroller">
        <div className="lf-inspector__empty">Unknown distortion</div>
      </aside>
    );
  }

  const schema = dist.schema;
  const values = layerParams[selectedNodeId] ?? schemaDefaults(schema);
  const onChange = (field: string, value: unknown) =>
    setLayerParams(selectedNodeId, { ...values, [field]: value });

  return (
    <aside className="lf-inspector scroller">
      <div className="lf-inspector__head">
        <div className="lf-inspector__name">{dist.name}</div>
        {dist.description && (
          <div className="lf-inspector__desc">{dist.description}</div>
        )}
      </div>
      <SchemaControls schema={schema} values={values} onChange={onChange} />
    </aside>
  );
}
