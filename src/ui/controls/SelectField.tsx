type V = string | number;
type Props = { label: string; value: V; options: ReadonlyArray<V>; onChange: (v: V) => void };
export function SelectField({ label, value, options, onChange }: Props) {
  return (
    <label className="lf-control lf-control--row">
      <span className="lf-control__label">{label}</span>
      <select
        className="lf-select"
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const match = options.find((o) => String(o) === raw);
          onChange(match ?? raw);
        }}
      >
        {options.map((o) => (
          <option key={String(o)} value={String(o)}>{String(o)}</option>
        ))}
      </select>
    </label>
  );
}
