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
  lifts: number;
  /** Levels (1 = lowest lift) with decks. */
  decks: number[];
  catchOn: boolean;
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
  house: { walls: P3[][]; roofs: P3[][]; ridge: number; measured: boolean };
  sides: PlanSide[];
  area: number;
  weightKg: number;
}
