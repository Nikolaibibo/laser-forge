import { createNoise2D, createNoise3D } from "simplex-noise";
import { makeRng } from "./random";

export const makeNoise2D = (seed: number) => createNoise2D(makeRng(seed));
export const makeNoise3D = (seed: number) => createNoise3D(makeRng(seed));
