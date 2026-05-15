import { useEffect } from "react";
import { useControls } from "leva";
import type { Layer } from "../state/store";
import { useApp } from "../state/store";
import { distortionById } from "../distortions/registry";

/**
 * Renders Leva controls for a single layer and mirrors the values into the
 * zustand store. Keyed by layer.uid in the parent so Leva scope is isolated.
 */
export function LayerControls({ layer, index }: { layer: Layer; index: number }) {
  const dist = distortionById(layer.distortionId);
  const setLayerParams = useApp((s) => s.setLayerParams);
  const folderName = dist ? `${index + 1}. ${dist.name}` : `Layer ${index + 1}`;

  const values = useControls(folderName, dist?.schema ?? {}, [layer.uid]);

  useEffect(() => {
    setLayerParams(layer.uid, values as Record<string, unknown>);
  }, [values, layer.uid, setLayerParams]);

  return null;
}
