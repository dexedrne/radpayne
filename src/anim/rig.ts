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
 * Clip names per animation state, best first: the shooter clip set (radbro<id>.gun.glb: aimed
 * dual-pistol locomotion, the shootdodge chain, hits, deaths, cover; the same set is retargeted onto
 * the Miladys), then RadRun's clips as fallbacks.
 */
export const CLIPS = {
  idle: ["Aim_Idle", "Idle"],
  relaxed: ["Idle", "Aim_Idle"],
  run: ["Aim_Run", "Run_02"],
  walk: ["Aim_Walk_Fwd", "Casual_Walk"],
  stroll: ["Casual_Walk", "Aim_Walk_Fwd"],
  back: ["Aim_Walk_Back", "Casual_Walk"],
  strafeL: ["Aim_Strafe_L", "Walk_Strafe_Left"],
  strafeR: ["Aim_Strafe_R", "Walk_Strafe_Right"],
  jump: ["Regular_Jump"],
  dive: ["Shootdodge", "Falling_To_Roll", "Free_Fall"],
  prone: ["Prone_Idle", "Free_Fall"],
  getUp: ["Prone_GetUp", "Get_Up", "Big_Land"],
  roll: ["Land_Roll", "Roll_Dodge", "Run_02"],
  hit: ["Hit_Small", "Hit_Reaction"],
  reload: ["Reload"],
  deathBack: ["Death_Back", "Falling_Down"],
  deathBack2: ["Death_Back_2", "Falling_Down"],
  deathFwd: ["Death_Fwd", "Falling_Down"],
  deathFwd2: ["Death_Fwd_2", "Falling_Down"],
  crouch: ["Cover_Crouch_Idle", "Crouch_Idle"],
  kneel: ["Kneel_Aim", "Aim_Idle"],
} as const;

/** Bones the upper-body layers (reload) drive. */
export const UPPER_BODY = /^(Spine|Spine01|Spine02|neck|Head|LeftShoulder|LeftArm|LeftForeArm|LeftHand|RightShoulder|RightArm|RightForeArm|RightHand)\./;

/**
 * Death clip for the space behind the body (metres free along the shot): the big blown-back one only
 * with room to fly, a short fall back, else forward. `k` (0..1) picks between the two variants.
 */
export function deathFor(free: number, k: number): readonly string[] {
  if (free > 4.6) return k < 0.6 ? CLIPS.deathBack : CLIPS.deathBack2;
  if (free > 1.6) return k < 0.5 ? CLIPS.deathBack2 : CLIPS.deathFwd;
  return k < 0.5 ? CLIPS.deathFwd : CLIPS.deathFwd2;
}
