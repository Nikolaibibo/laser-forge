import { useApp } from "../state/store";
import { downloadSvg } from "../render/svgExport";
import { downloadGcode } from "../plotter/gcode";
import { Toggle } from "./controls/Toggle";

export function Console() {
  const currentArtwork = useApp((s) => s.currentArtwork);
  const seed = useApp((s) => s.seed);
  const generatorId = useApp((s) => s.generatorId);
  const penWidthMm = useApp((s) => s.penWidthMm);
  const dedupe = useApp((s) => s.dedupe);
  const setDedupe = useApp((s) => s.setDedupe);
  const join = useApp((s) => s.join);
  const setJoin = useApp((s) => s.setJoin);
  const drawerOpen = useApp((s) => s.drawerOpen);
  const setDrawerOpen = useApp((s) => s.setDrawerOpen);

  const lineCount = currentArtwork?.polylines.length ?? 0;
  const pointCount = currentArtwork?.polylines.reduce((n, l) => n + l.points.length, 0) ?? 0;
  const estPlotMinutes = Math.max(1, Math.round(pointCount / 1500));

  const hasArtwork = currentArtwork !== null;

  return (
    <footer className="lf-console">
      {/* Left: geometry stats */}
      <div className="lf-console__stats">
        <span className="lf-console__stat-text">
          {lineCount.toLocaleString("en-US")} lines · {pointCount.toLocaleString("en-US")} pts{hasArtwork ? ` · ~${estPlotMinutes}m` : ""}
        </span>
      </div>

      <div className="lf-console__sep" />

      {/* Middle: dedupe + join toggles */}
      <div className="lf-console__toggles">
        <div
          title="Removes overlapping paths so the laser doesn't burn them twice."
          className="lf-console__toggle-wrap"
        >
          <Toggle label="Dedupe" value={dedupe} onChange={setDedupe} />
        </div>
        <div
          title="Joins open polylines whose endpoints touch into longer continuous paths, reducing pen lifts."
          className="lf-console__toggle-wrap"
        >
          <Toggle label="Join" value={join} onChange={setJoin} />
        </div>
      </div>

      <div className="lf-console__sep" />

      {/* Right: export + plot */}
      <div className="lf-console__actions">
        <button
          className="lf-console__btn lf-console__btn--svg"
          disabled={!hasArtwork}
          onClick={() =>
            currentArtwork &&
            downloadSvg(currentArtwork, `${generatorId}-${seed}.svg`, {
              dedupe,
              join,
              strokeWidthMm: penWidthMm,
            })
          }
        >
          SVG
        </button>
        <button
          className="lf-console__btn lf-console__btn--gcode"
          disabled={!hasArtwork}
          onClick={() =>
            currentArtwork &&
            downloadGcode(currentArtwork, `${generatorId}-${seed}.gcode`, {
              dedupe,
              join,
            })
          }
        >
          G-code
        </button>
        <button
          className={
            drawerOpen
              ? "lf-console__btn lf-console__btn--plot lf-console__btn--plot-active"
              : "lf-console__btn lf-console__btn--plot"
          }
          disabled={!hasArtwork}
          aria-pressed={drawerOpen}
          onClick={() => setDrawerOpen(!drawerOpen)}
        >
          ▸ Plot
        </button>
      </div>
    </footer>
  );
}
