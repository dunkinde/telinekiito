// The 3D scaffold plan from the server (lib/layout.js): the house and each priced scaffold side. Metres around the
// house centre, x east, y north, z up.
import type { SystemKey } from "./api";

export type P2 = [number, number];
export type P3 = [number, number, number];

export interface PlanSide {
  /** Number shown on the drawing (1, 2, 3 …). */
  i: number;
  /** Engine name: "Long side A", "Wall 3", "Gable end 2" … */
  name: string;
  kind: "eaves" | "gable";
  /** Where the scaffold run starts, on the wall line. */
  at: P2;
  /** Direction along the wall, and outwards from the wall. */
  dir: P2;
  out: P2;
  bays: number;
  /** Run length as built, m (bays are shortened to fit where a side butts against a corner scaffold). */
  run?: number;
  lifts: number;
  /** Levels (1 = lowest lift) with decks. */
  decks: number[];
  catchOn: boolean;
  /** Distance from the wall to the inner standards, m (0.3; 0.6 under a temporary roof, clear of the eave overhang). */
  gap?: number;
  /** 1 when a 1.00 m compensation frame stands under the 2.00 m lifts. */
  half?: number;
  /** 0.36 m inner consoles with a deck on every decked level (under a temporary roof). */
  inner?: boolean;
  /** Access towers (hatch decks with ladders) on this side: one per connected scaffold, more every 50 m. */
  access?: number;
  /** A walking platform also on top of the 1 m base frame (work on the walls: every level is decked). */
  halfDeck?: boolean;
  /** Guardrail on the inside of the top deck (it stands above the eave, away from any wall). */
  innerRail?: boolean;
  /** Roof-catch wall on an outer 0.36 m console at the top deck (DIN 4420-1: b ≥ 0.70 m from the eave). */
  catchConsole?: boolean;
  /** Level the roof-catch grids rise 2 m above. */
  catchLevel?: number | null;
  area: number;
}

export interface ScaffoldPlan {
  v: number;
  system: SystemKey;
  systemName: string;
  /** Bay length, frame width and gap to the wall, lift height and base jack height, m. */
  bay: number;
  width: number;
  gap: number;
  lift: number;
  jack: number;
  /** Height of the compensation frame, m. */
  half?: number;
  house: { walls: P3[][]; roofs: P3[][]; ridge: number; measured: boolean };
  sides: PlanSide[];
  /** Weather sheeting on the outer face of every side. */
  sheeting?: boolean;
  /** Temporary roof: centre, ridge direction, span across it, length along it, pitch (°) and the level it rests on. */
  roof?: { at: P2; dir: P2; span: number; length: number; pitch: number; support: number; sections: number } | null;
  area: number;
  weightKg: number;
}
