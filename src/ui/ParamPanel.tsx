import { useControls } from "leva";
import type { GeneratorDef } from "../generators/types";

/**
 * Render the leva controls for a specific generator and return the live param values.
 * Component must be keyed by generatorId so leva re-mounts on generator change.
 */
export function useGeneratorParams<P extends Record<string, unknown>>(
  gen: GeneratorDef<P>,
): P {
  // leva's useControls accepts a schema map; return object is reactive.
  // We cast because leva's types are very loose.
  const values = useControls(gen.name, gen.schema as never, [gen.id]);
  return values as unknown as P;
}
