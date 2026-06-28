import type { ControlDef, ControlSchema } from "../../generators/types";
import { resolveVisibility } from "./schema";
import { NumberField } from "./NumberField";
import { Toggle } from "./Toggle";
import { Segmented } from "./Segmented";
import { SelectField } from "./SelectField";
import { TextField } from "./TextField";
import { ColorField } from "./ColorField";

export type ControlKind = "number" | "toggle" | "segmented" | "select" | "color" | "text";

export function pickControl(def: ControlDef): ControlKind {
  if (def.options) return def.options.length <= 4 ? "segmented" : "select";
  const v = def.value;
  if (typeof v === "boolean") return "toggle";
  if (typeof v === "number") return "number";
  if (typeof v === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return "color";
  return "text";
}

function titleCase(field: string): string {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\bMm\b/g, "mm")
    .replace(/\bDeg\b/g, "°")
    .trim();
}

type Props = {
  schema: ControlSchema;
  values: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
};

export function SchemaControls({ schema, values, onChange }: Props) {
  const visible = resolveVisibility(schema, values);
  return (
    <div className="lf-controls">
      {visible.map((field) => {
        const def = schema[field];
        const label = def.label ?? titleCase(field);
        const kind = pickControl(def);
        const v = values[field] ?? def.value;
        switch (kind) {
          case "number":
            return (
              <NumberField key={field} label={label} value={Number(v)}
                min={def.min} max={def.max} step={def.step}
                onChange={(n) => onChange(field, n)} />
            );
          case "toggle":
            return <Toggle key={field} label={label} value={!!v} onChange={(b) => onChange(field, b)} />;
          case "segmented":
            return (
              <Segmented key={field} label={label} value={v as string | number}
                options={def.options!} onChange={(o) => onChange(field, o)} />
            );
          case "select":
            return (
              <SelectField key={field} label={label} value={v as string | number}
                options={def.options!} onChange={(o) => onChange(field, o)} />
            );
          case "color":
            return <ColorField key={field} label={label} value={String(v)} onChange={(c) => onChange(field, c)} />;
          default:
            return <TextField key={field} label={label} value={String(v)} rows={def.rows} onChange={(t) => onChange(field, t)} />;
        }
      })}
    </div>
  );
}
