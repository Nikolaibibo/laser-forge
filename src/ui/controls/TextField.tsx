type Props = { label: string; value: string; rows?: number; onChange: (v: string) => void };
export function TextField({ label, value, rows, onChange }: Props) {
  return (
    <div className="lf-control lf-control--col">
      <span className="lf-control__label">{label}</span>
      {rows ? (
        <textarea className="lf-textarea" aria-label={label} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type="text" className="lf-textinput" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
