type Props = { label: string; value: string; onChange: (v: string) => void };
export function ColorField({ label, value, onChange }: Props) {
  return (
    <label className="lf-control lf-control--row">
      <span className="lf-control__label">{label}</span>
      <span className="lf-color">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <code className="lf-color__hex">{value}</code>
      </span>
    </label>
  );
}
