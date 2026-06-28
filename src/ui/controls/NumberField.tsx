import { useRef, useState, useEffect } from "react";

export function clampStep(
  value: number,
  min: number | undefined,
  max: number | undefined,
  step: number | undefined,
): number {
  let v = value;
  if (typeof step === "number" && step > 0) v = Math.round(v / step) * step;
  if (typeof min === "number") v = Math.max(min, v);
  if (typeof max === "number") v = Math.min(max, v);
  // kill float dust from step snapping
  return typeof step === "number" && step > 0 ? Number(v.toFixed(6)) : v;
}

type Props = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
};

const SCRUB_PX_PER_STEP = 4;

export function NumberField({ label, value, min, max, step, unit, onChange }: Props) {
  const hasRange = typeof min === "number" && typeof max === "number";
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const drag = useRef<{ startX: number; startVal: number } | null>(null);

  const commit = (raw: string) => {
    const n = Number(raw);
    if (!Number.isNaN(n)) onChange(clampStep(n, min, max, step));
    else setText(String(value));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (hasRange) return; // slider handles its own drag
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startVal: value };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const s = step ?? 1;
    onChange(clampStep(drag.current.startVal + Math.round(dx / SCRUB_PX_PER_STEP) * s, min, max, step));
  };
  const onPointerUp = () => (drag.current = null);

  return (
    <div className="lf-control">
      <span className="lf-control__label">{label}</span>
      <div className="lf-numfield">
        {hasRange && (
          <input
            type="range"
            className="lf-slider"
            aria-label={label}
            min={min}
            max={max}
            step={step ?? 1}
            value={value}
            onChange={(e) => onChange(clampStep(Number(e.target.value), min, max, step))}
          />
        )}
        <span
          className={hasRange ? "lf-numbox" : "lf-numbox lf-numbox--scrub"}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          title={hasRange ? undefined : "Drag to scrub · click to type"}
        >
          <input
            className="lf-numinput"
            aria-label={label}
            value={text}
            inputMode="decimal"
            onChange={(e) => setText(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
          />
          {unit && <span className="lf-unit">{unit}</span>}
        </span>
      </div>
    </div>
  );
}
