type V = string | number;
type Props = { label: string; value: V; options: ReadonlyArray<V>; onChange: (v: V) => void };
export function Segmented({ label, value, options, onChange }: Props) {
  return (
    <label className="lf-control lf-control--col">
      <span className="lf-control__label">{label}</span>
      <div className="lf-segmented" role="radiogroup">
        {options.map((o) => (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={o === value}
            className={o === value ? "lf-seg lf-seg--on" : "lf-seg"}
            onClick={() => onChange(o)}
          >
            {String(o)}
          </button>
        ))}
      </div>
    </label>
  );
}
