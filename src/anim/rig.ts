// Procedural layers on top of the clips (spec section 7 "src/anim"): the upper-body aim (arms point
// the guns at the crosshair, the spine twists toward the aim while the legs run their own way), the
// dive / prone body tilt, and clip lookup with fallbacks so the pistol clip set can drop in by name.
import { Quaternion, Vector3, type Bone, type Object3D } from "three";
import type { AnimPlayer } from "./animPlayer.ts";

const qa = new Quaternion();
const qb = new Quaternion();
const va = new Vector3();
const vb = new Vector3();
const vc = new Vector3();

export function findBone(root: Object3D, name: string): Bone | undefined {
  let out: Bone | undefined;
  root.traverse(o => { if (!out && o.name === name) out = o as Bone; });
  return out;
}

/** Rotate a bone about a world-space axis through its pivot (after the mixer wrote its pose). */
export function rotateBoneWorld(bone: Object3D | undefined, axisWorld: Vector3, angle: number): void {
  if (!bone || !bone.parent || Math.abs(angle) < 1e-5) return;
  bone.parent.getWorldQuaternion(qa);
  vc.copy(axisWorld).applyQuaternion(qb.copy(qa).invert()).normalize();
  qb.setFromAxisAngle(vc, angle);
  bone.quaternion.premultiply(qb);
  bone.updateMatrixWorld(true);
}

/**
 * Swing `upper` (in world space) so the line upper -> end points at `target`, blended by `weight`.
 * Works for any rig (raw glTF bones or VRM normalized bones): nothing depends on the rest axes.
 */
export function aimLimb(upper: Object3D | undefined, end: Object3D | undefined, target: Vector3, weight: number): void {
  if (!upper || !end || !upper.parent || weight <= 0.001) return;
  upper.updateMatrixWorld(true);
  const from = upper.getWorldPosition(va);
  const cur = end.getWorldPosition(vb).sub(from);
  const want = vc.copy(target).sub(from);
  if (cur.lengthSq() < 1e-8 || want.lengthSq() < 1e-8) return;
  cur.normalize();
  want.normalize();
  qa.setFromUnitVectors(cur, want); // world-space delta
  if (weight < 1) qa.slerp(qb.identity(), 1 - weight);
  // apply in world space: L' = P^-1 * D * P * L
  upper.parent.getWorldQuaternion(qb);
  const inv = qb.clone().invert();
  upper.quaternion.premultiply(qb).premultiply(qa).premultiply(inv);
  upper.updateMatrixWorld(true);
}

/** First clip name the player has (the pistol set first, the RadRun clips as fallbacks). */
export function pick(pl: AnimPlayer, names: readonly string[]): string {
  for (const n of names) if (pl.has(n)) return n;
  return "";
}

/**
 * Clip names per animation state, best first. The pistol clip set (bought once, copied onto every
 * Radbro and retargeted onto the Miladys) plugs in by these names; until then the RadRun clips stand
 * in and the procedural aim layer points the arms.
 */
export const CLIPS = {
  idle: ["Pistol_Aim_Idle", "Idle"],
  run: ["Pistol_Run", "Run_02"],
  walk: ["Pistol_Walk", "Casual_Walk"],
  back: ["Pistol_Walk_Back", "Casual_Walk"],
  strafeL: ["Pistol_Strafe_Left", "Walk_Strafe_Left"],
  strafeR: ["Pistol_Strafe_Right", "Walk_Strafe_Right"],
  jump: ["Pistol_Jump", "Regular_Jump"],
  dive: ["Pistol_Dive", "Falling_To_Roll", "Free_Fall"],
  prone: ["Pistol_Prone", "Prone_Idle", "Free_Fall"],
  getUp: ["Pistol_Get_Up", "Get_Up", "Big_Land"],
  roll: ["Pistol_Roll", "Roll_Dodge", "Run_02"],
  hit: ["Pistol_Hit", "Hit_Reaction"],
  death: ["Pistol_Death", "Dying", "Falling_Down"],
  death2: ["Pistol_Death_2", "Prone_Death", "Falling_Down"],
  crouch: ["Pistol_Crouch_Aim", "Crouch_Idle", "Big_Land"],
} as const;

/** Clips that already hold a pistol pose: the procedural arm aim blends down on them. */
export const AIMED = new Set(["Pistol_Aim_Idle", "Pistol_Run", "Pistol_Walk", "Pistol_Walk_Back", "Pistol_Strafe_Left", "Pistol_Strafe_Right", "Pistol_Crouch_Aim", "Pistol_Dive", "Pistol_Prone"]);
