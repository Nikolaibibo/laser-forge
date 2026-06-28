import type { ControlSchema } from "../../generators/types";

export function schemaDefaults(schema: ControlSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(schema)) out[key] = schema[key].value;
  return out;
}

export function localKey(key: string): string {
  const i = key.lastIndexOf(".");
  return i === -1 ? key : key.slice(i + 1);
}

export function resolveVisibility(
  schema: ControlSchema,
  values: Record<string, unknown>,
): string[] {
  const get = (key: string) => values[localKey(key)];
  return Object.keys(schema).filter((field) => {
    const def = schema[field];
    return def.render ? !!def.render(get) : true;
  });
}
