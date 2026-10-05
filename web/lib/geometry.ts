// Scaffold layout for drawings: the same rules as the server's quote engine (lib/engine.js sidesFor),
// so the 3D model shows the same bays and levels the price is built from.
import type { JobType, RoofType } from "./api";

export const BAY = 3.07; // m, bay length
export const LIFT = 2.0; // m between working levels
export const JACK = 0.4; // m base jack height
export const EXTEND = 1.0; // m the scaffold runs past each corner
export const FRAME = 0.73; // m frame width (wall side to outer side)
export const GAP = 0.35; // m from the wall to the inner standards

export interface HouseShape {
  length: number;
  width: number;
  eave: number;
  roofType: RoofType;
  pitch: number;
  jobType: JobType;
  gables?: boolean;
}

export type SidePos = "front" | "back" | "left" | "right";
export interface ScaffoldSide {
  pos: SidePos;
  len: number;
  bays: number;
  lifts: number;
  catchOn: boolean;
  deckAll: boolean;
}

const liftsForEave = (eave: number) => Math.max(1, Math.round((eave - 1.2 - JACK) / LIFT));
const liftsForTop = (target: number) => Math.max(1, Math.round((target - JACK) / LIFT));
export const roofRise = (h: HouseShape) => (h.roofType === "flat" ? 0 : (h.width / 2) * Math.tan((h.pitch * Math.PI) / 180));

export function scaffoldSides(h: HouseShape): ScaffoldSide[] {
  const L = h.length, W = h.width;
  const ridge = h.eave + roofRise(h);
  const eaveLifts = liftsForEave(h.eave);
  const gable = h.roofType === "gable";
  const gableLifts = gable ? Math.max(eaveLifts, liftsForTop(ridge - 2.0)) : eaveLifts;
  const out: ScaffoldSide[] = [];
  const add = (pos: SidePos, len: number, lifts: number, catchOn: boolean, deckAll: boolean) =>
    out.push({ pos, len, lifts, catchOn, deckAll, bays: Math.max(1, Math.ceil((len + 2 * EXTEND) / BAY - 0.05)) });

  if (h.jobType === "roof") {
    add("front", L, eaveLifts, true, false);
    add("back", L, eaveLifts, true, false);
    if (gable) {
      if (h.gables) {
        add("left", W, gableLifts, false, false);
        add("right", W, gableLifts, false, false);
      }
    } else {
      add("left", W, eaveLifts, true, false);
      add("right", W, eaveLifts, true, false);
    }
  } else if (h.jobType === "facade" || h.jobType === "roof_facade") {
    const both = h.jobType === "roof_facade";
    add("front", L, eaveLifts, both, true);
    add("back", L, eaveLifts, both, true);
    add("left", W, gable ? gableLifts : eaveLifts, both && !gable, true);
    add("right", W, gable ? gableLifts : eaveLifts, both && !gable, true);
  } else {
    add("front", L, eaveLifts, false, false);
    add("back", L, eaveLifts, false, false);
    if (!gable) {
      add("left", W, eaveLifts, false, false);
      add("right", W, eaveLifts, false, false);
    }
  }
  return out;
}

/** Isometric projection: x along the house length, y along its width, z up. */
const C = Math.cos(Math.PI / 6), S = 0.5;
export const iso = (x: number, y: number, z: number): [number, number] => [(x - y) * C, (x + y) * S - z];
