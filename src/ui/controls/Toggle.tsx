type Props = { label: string; value: boolean; onChange: (v: boolean) => void };
export function Toggle({ label, value, onChange }: Props) {
  return (
    <label className="lf-control lf-control--row">
      <span className="lf-control__label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        className={value ? "lf-toggle lf-toggle--on" : "lf-toggle"}
        onClick={() => onChange(!value)}
      >
        <span className="lf-toggle__knob" />
      </button>
    </label>
  );
}
