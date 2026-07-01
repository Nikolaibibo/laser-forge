import { useApp } from "../state/store";
import { writeHash } from "../state/urlSync";
import {
  PAGE_FORMATS,
  detectPageFormat,
  pageFormatSize,
  type PageFormatId,
} from "../util/pageFormats";

const clamp = (v: number) =>
  Number.isFinite(v) ? Math.min(1000, Math.max(10, v)) : 10;

const clampPen = (v: number) =>
  Number.isFinite(v) ? Math.max(0.05, v) : 0.05;

export function TopBar() {
  const w = useApp((s) => s.canvasWMm);
  const h = useApp((s) => s.canvasHMm);
  const setCanvas = useApp((s) => s.setCanvas);
  const penWidthMm = useApp((s) => s.penWidthMm);
  const setPenWidthMm = useApp((s) => s.setPenWidthMm);
  const seed = useApp((s) => s.seed);
  const setSeed = useApp((s) => s.setSeed);
  const randomSeed = useApp((s) => s.randomSeed);
  const generatorId = useApp((s) => s.generatorId);
  const layers = useApp((s) => s.layers);
  const layerParams = useApp((s) => s.layerParams);
  const genParams = useApp((s) => s.genParams);

  function handleShare() {
    writeHash({
      g: generatorId,
      s: seed,
      w,
      h,
      p: genParams,
      l: layers,
      lp: layerParams,
      pw: penWidthMm,
    });
    navigator.clipboard.writeText(window.location.href).catch(() => {});
  }

  return (
    <header className="lf-topbar">
      <div className="lf-wordmark">
        <span className="lf-diamond">◆</span> LASER FORGE
      </div>

      <div className="lf-topbar-center">
        {/* Page format preset → sets canvas W×H; "Custom" when W×H matches no preset */}
        <label className="lf-field">
          <span className="lf-field-label">Format</span>
          <select
            className="lf-field-input"
            value={detectPageFormat(w, h)}
            onChange={(e) => {
              const size = pageFormatSize(e.target.value as PageFormatId);
              if (size) setCanvas(size.wMm, size.hMm);
            }}
          >
            {detectPageFormat(w, h) === "custom" && (
              <option value="custom">Custom</option>
            )}
            {PAGE_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <span className="lf-divider-char">·</span>

        {/* Canvas W × H */}
        <label className="lf-field">
          <span className="lf-field-label">W</span>
          <input
            type="number"
            className="lf-field-input"
            value={w}
            min={10}
            max={1000}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v > 0) setCanvas(v, h);
            }}
            onBlur={(e) => setCanvas(clamp(Number(e.target.value)), h)}
          />
        </label>
        <span className="lf-divider-char">×</span>
        <label className="lf-field">
          <span className="lf-field-label">H</span>
          <input
            type="number"
            className="lf-field-input"
            value={h}
            min={10}
            max={1000}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v > 0) setCanvas(w, v);
            }}
            onBlur={(e) => setCanvas(w, clamp(Number(e.target.value)))}
          />
        </label>
        <span className="lf-unit-label">mm</span>

        <div className="lf-sep" />

        {/* Pen */}
        <label className="lf-field">
          <span className="lf-field-label">Pen</span>
          <input
            type="number"
            className="lf-field-input"
            value={penWidthMm}
            min={0.05}
            max={5}
            step={0.05}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v > 0) setPenWidthMm(v);
            }}
            onBlur={(e) => setPenWidthMm(clampPen(Number(e.target.value)))}
          />
        </label>
        <span className="lf-unit-label">mm</span>

        <div className="lf-sep" />

        {/* Seed */}
        <label className="lf-field">
          <span className="lf-field-label">Seed</span>
          <input
            type="number"
            className="lf-field-input"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value))}
          />
        </label>
        <button
          className="lf-icon-btn"
          onClick={randomSeed}
          title="Reroll seed"
        >
          ⟲
        </button>
      </div>

      <div className="lf-topbar-right">
        <button className="lf-share-btn" onClick={handleShare}>
          ⇄ Share
        </button>
      </div>
    </header>
  );
}
