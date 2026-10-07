// Scaffold layout for drawings: the same rules as the server's quote engine (lib/engine.js sidesFor),
// so the 3D model shows the same bays and levels the price is built from.
import type { JobType, RoofType } from "./api";

export const BAY = 3.07; // m, bay length (Layher Blitz; each scaffold system has its own, see SYSTEM_BAY in api.ts)
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
  /** Bay length of the chosen scaffold system (default 3.07 m). */
  bay?: number;
}

export type SidePos = "front" | "back" | "left" | "right";
export interface ScaffoldSide {
  pos: SidePos;
  len: number;
  bays: number;
  /** Bay length, m. */
  bay: number;
  lifts: number;
  /** 1 when a 1.00 m compensation frame stands under the 2.00 m lifts. */
  half: number;
  catchOn: boolean;
  deckAll: boolean;
}

// Same deck rules as lib/engine.js: the lowest deck at or above a target on 2.00 m lifts, with or without a 1.00 m
// compensation frame; eave decks at most 1.5 m under the eave (DIN 4420-1), the roof-catch wall reaching 1.5 − b
// above the eave (b = 0.89 m on a 0.36 m console), gables reaching the ridge from 2 m below.
const deckFor = (target: number) => {
  const a = Math.max(1, Math.ceil((target - JACK) / LIFT - 1e-9)), b = Math.max(1, Math.ceil((target - JACK - 1) / LIFT - 1e-9));
  return JACK + 1 + LIFT * b < JACK + LIFT * a - 1e-9 ? { lifts: b, half: 1 } : { lifts: a, half: 0 };
};
const eaveTarget = (eave: number, catchOn: boolean) => (catchOn ? Math.max(eave - 1.5, eave + 1.5 - 0.89 - 2) : eave - 1.5);
export const roofRise = (h: HouseShape) => (h.roofType === "flat" ? 0 : (h.width / 2) * Math.tan((h.pitch * Math.PI) / 180));

export function scaffoldSides(h: HouseShape): ScaffoldSide[] {
  const L = h.length, W = h.width;
  const ridge = h.eave + roofRise(h);
  const eaveLifts = h.eave - 1.5;
  const gable = h.roofType === "gable";
  const gableLifts = gable ? Math.max(eaveLifts, ridge - 2.0) : eaveLifts;
  const out: ScaffoldSide[] = [];
  const add = (pos: SidePos, len: number, target: number, catchOn: boolean, deckAll: boolean) =>
    out.push({ pos, len, ...deckFor(catchOn ? Math.max(target, eaveTarget(h.eave, true)) : target), catchOn, deckAll, bay: h.bay || BAY, bays: Math.max(1, Math.ceil((len + 2 * EXTEND) / (h.bay || BAY) - 0.05)) });

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
