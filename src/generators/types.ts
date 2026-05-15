import type { Schema } from "leva/dist/declarations/src/types";

export type Point = [number, number];

export type Polyline = {
  points: Point[];
  closed: boolean;
};

export type Artwork = {
  polylines: Polyline[];
  widthMm: number;
  heightMm: number;
};

export type Canvas = { wMm: number; hMm: number };

export type GeneratorDef<P extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  name: string;
  description: string;
  defaults: P;
  schema: Schema;
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
  schema: Schema;
  apply: (artwork: Artwork, params: P, seed: number) => Artwork;
};
