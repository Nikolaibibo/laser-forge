export type ControlDef = {
  value: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: ReadonlyArray<string | number>;
  rows?: number;
  /** Conditional visibility. `get(key)` resolves the field after the last dot. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render?: (get: (key: string) => any) => boolean;
  label?: string;
  hint?: string;
};

export type ControlSchema = Record<string, ControlDef>;

export type Point = [number, number];

export type Polyline = {
  points: Point[];
  closed: boolean;
  stroke?: string; // CSS/Hex color; undefined = default pen
};

/** Editable text label (mirrors a rendered single-stroke block) for the SVG
 *  export's hidden <text> layer. Positions in mm, anchor per align. */
export type TextLabel = {
  field: string;
  text: string;
  xMm: number;
  yMm: number;
  capMm: number;
  font: string;
  align: "left" | "center" | "right";
};

export type Artwork = {
  polylines: Polyline[];
  widthMm: number;
  heightMm: number;
  /** Non-blocking notices surfaced in the UI (e.g. text too small for the pen). */
  warnings?: string[];
  /** Editable text mirrors for the export's <text> layer (blueprint/specsheet). */
  labels?: TextLabel[];
  /** Round-trip provenance embedded as <metadata> on export. */
  source?: { generator: string; params: Record<string, unknown> };
};

export type Canvas = { wMm: number; hMm: number; penWidthMm?: number };

export type GeneratorDef<P extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  name: string;
  description: string;
  defaults: P;
  schema: ControlSchema;
  generate: (params: P, seed: number, canvas: Canvas) => Artwork;
};

/**
 * Distortion operator: takes an Artwork and returns a modified Artwork.
 * These chain in a pipeline: base generator → distortion 1 → distortion 2 → ...
 */
export type DistortionDef<P extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  name: string;
  description: string;
  defaults: P;
  schema: ControlSchema;
  apply: (artwork: Artwork, params: P, seed: number) => Artwork;
};
