declare module "poisson-disk-sampling" {
  export default class PoissonDiskSampling {
    constructor(
      options: {
        shape: number[];
        minDistance: number;
        maxDistance?: number;
        tries?: number;
        distanceFunction?: (p: number[]) => number;
      },
      rng?: () => number,
    );
    fill(): number[][];
    addPoint(point: number[]): number[] | null;
    next(): number[] | null;
    reset(): void;
  }
}
