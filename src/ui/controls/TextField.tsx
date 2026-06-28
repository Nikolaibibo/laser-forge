type Props = { label: string; value: string; rows?: number; onChange: (v: string) => void };
export function TextField({ label, value, rows, onChange }: Props) {
  return (
    <label className="lf-control lf-control--col">
      <span className="lf-control__label">{label}</span>
      {rows ? (
        <textarea className="lf-textarea" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="lf-textinput" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}
