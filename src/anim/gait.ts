// Ground speeds of the locomotion loops: how fast the planted foot moves back under the body at
// timeScale 1, in m/s (measured per rig: the lower foot's backward speed while it is on the floor).
// Play a loop at bodySpeed / clipSpeed and the feet stay put. The aimed clips and their RadRun
// fallbacks share the source cycles (Aim_Run = Run_02, Aim_Walk_Fwd = Casual_Walk), so one number each.
//
// Every direction runs on the forward cycle: the legs yaw toward the move and the spine twists back
// onto the aim; moving against the aim plays the same cycle backwards with the legs facing the aim.
// (The walk-strafe clips move at ~0.4 m/s: any faster and their feet skate.)
import type { RadbroId } from "../ui/store.ts";

export type Gait = { run: number; walk: number };

export const RADBRO_GAIT: Record<RadbroId, Gait> = {
  "652": { run: 3.25, walk: 0.57 },
  "4764": { run: 3.07, walk: 0.54 },
  "2564": { run: 2.79, walk: 0.51 },
  "723": { run: 3.12, walk: 0.57 },
  // #3171 (added 2026-09-25): not yet measured on his own rig - defaulted to #723's numbers (closest
  // build, same 1.8 m rig height). Re-measure from his Run_02/Casual_Walk once he has an Aim_Run pack.
  "3171": { run: 3.12, walk: 0.57 },
};

/** The Miladys' clips come from #723's rig; scale by her leg length (hips height) against #723's. */
export const MILADY_GAIT: Gait = RADBRO_GAIT["723"];

/** Below this body speed (x leg scale) the walk cycle plays, above it the run cycle. */
export const RUN_FROM = 1.2;

/** Clip speed for a picked loop name. */
export function clipSpeed(g: Gait, clip: string): number {
  return /Run/.test(clip) ? g.run : g.walk;
}

/**
 * Legs for a move: forward cycle with the legs along the move, or (moving against the aim) the cycle
 * backwards with the legs toward the aim. `back` is the previous choice (hysteresis around 90 deg).
 */
export function legsFor(moveYaw: number, rel: number, back: boolean): { back: boolean; legYaw: number } {
  const a = Math.abs(rel);
  const b = back ? a > Math.PI / 2 - 0.3 : a > Math.PI / 2 + 0.3;
  return { back: b, legYaw: b ? moveYaw + Math.PI : moveYaw };
}
