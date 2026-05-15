import Alea from "alea";

export type RNG = () => number;

export const makeRng = (seed: number): RNG => Alea(String(seed));

export const randRange = (rng: RNG, min: number, max: number): number =>
  min + rng() * (max - min);

export const randInt = (rng: RNG, min: number, max: number): number =>
  Math.floor(randRange(rng, min, max + 1));

export const pick = <T>(rng: RNG, arr: readonly T[]): T =>
  arr[Math.floor(rng() * arr.length)];

export const gaussian = (rng: RNG): number => {
  // Box–Muller
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
