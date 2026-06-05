import type { DistortionDef } from "../generators/types";
import { noiseWarp } from "./noiseWarp";
import { chaikin } from "./chaikin";
import { kaleidoscope } from "./kaleidoscope";
import { textKnockout } from "./textKnockout";
import { rotate } from "./rotate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DISTORTIONS: DistortionDef<any>[] = [noiseWarp, chaikin, kaleidoscope, textKnockout, rotate];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const distortionById = (id: string): DistortionDef<any> | undefined =>
  DISTORTIONS.find((d) => d.id === id);
