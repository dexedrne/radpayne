// Two-bone arm IK for the long-gun hold (arsenal spec section 1.2): the game decides where the gun is,
// then each hand is solved onto it every frame, after the mixer and the spine layers.
//   solveTwoBone(upper, lower, end, target, pole, weight): law-of-cosines elbow in the plane of
//     (shoulder, target, pole), the upper and lower bones swung in world space (the aimLimb method, so it
//     works on raw glTF bones and VRM normalized bones alike), reach clamped to 99.5 % of the limb;
//     returns the wrist's distance from the target (0 when it reaches).
//   setWorldQuaternion(bone, q, weight): the bone's world rotation, exactly (the grip in the palm).
//   splitTwist(lower, end, share): half of the hand's twist about the forearm goes to the forearm, so the
//     skinned wrist does not wring like a candy wrapper.
// Nothing here knows the rest axes of a rig.
import { Quaternion, Vector3, type Object3D } from "three";
import { aimLimb } from "./rig.ts";

const va = new Vector3(), vb = new Vector3(), vc = new Vector3(), vn = new Vector3(), vp = new Vector3(), ve = new Vector3(), vw = new Vector3(), vt = new Vector3(), vx = new Vector3();
const qa = new Quaternion(), qb = new Quaternion();
const q0 = new Quaternion(), q1 = new Quaternion(), q2 = new Quaternion();

/** Reach clamp: the arm never locks fully straight (a straight elbow has no plane and pops). */
export const REACH_MAX = 0.995;

/** The limb's two lengths (upper -> lower, lower -> end) from the current pose. */
export function limbLengths(upper: Object3D, lower: Object3D, end: Object3D): [number, number] {
  upper.updateMatrixWorld(true);
  const a = upper.getWorldPosition(va), b = lower.getWorldPosition(vb), c = end.getWorldPosition(vc);
  return [a.distanceTo(b), b.distanceTo(c)];
}

/** Set a bone's world rotation (its parent's world matrix must be current), blended by `weight`. */
export function setWorldQuaternion(bone: Object3D, q: Quaternion, weight = 1): void {
  if (!bone.parent || weight <= 0.001) return;
  bone.parent.getWorldQuaternion(qa);
  qb.copy(qa).invert().multiply(q);
  if (weight >= 0.999) bone.quaternion.copy(qb);
  else bone.quaternion.slerp(qb, weight);
  bone.updateMatrixWorld(true);
}

/**
 * Move `share` of the end bone's twist (about the lower bone's axis, elbow -> wrist) onto the lower
 * bone, keeping the end's world rotation. The wrist sits on that axis, so nothing moves but the roll.
 */
export function splitTwist(lower: Object3D, end: Object3D, share = 0.5): void {
  if (share <= 0) return;
  const axis = vn.copy(end.position);
  if (axis.lengthSq() < 1e-10) return;
  axis.normalize();
  end.getWorldQuaternion(q0);
  const q = end.quaternion;
  // swing-twist: the twist is the rotation's part about the axis
  const d = q.x * axis.x + q.y * axis.y + q.z * axis.z;
  q1.set(axis.x * d, axis.y * d, axis.z * d, q.w);
  if (q1.lengthSq() < 1e-10) return;
  q1.normalize();
  q2.identity().slerp(q1, share);
  lower.quaternion.multiply(q2);
  lower.updateMatrixWorld(true);
  setWorldQuaternion(end, q0, 1);
}

export type TwoBoneResult = { reachError: number; clamped: boolean };

/**
 * Two-bone IK: bend `upper` -> `lower` -> `end` so `end`'s origin lands on `target` (world), the elbow
 * pushed toward `pole` (a world DIRECTION from the shoulder, perpendicular part used), blended by `weight`
 * (the bones' local rotations slerp from the clip pose). Returns the wrist's remaining distance.
 */
export function solveTwoBone(upper: Object3D, lower: Object3D, end: Object3D, target: Vector3, pole: Vector3, weight = 1): TwoBoneResult {
  const out = { reachError: 0, clamped: false };
  if (!upper.parent || weight <= 0.001) return out;
  q0.copy(upper.quaternion);
  q1.copy(lower.quaternion);
  upper.updateMatrixWorld(true);
  const a = va.copy(upper.getWorldPosition(va));
  const b = lower.getWorldPosition(vb);
  const c = end.getWorldPosition(vc);
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
  const toT = vt.copy(target).sub(a);
  const d = toT.length();
  if (d < 1e-6 || l1 < 1e-6 || l2 < 1e-6) return out;
  const n = toT.multiplyScalar(1 / d);
  const dMax = REACH_MAX * (l1 + l2), dMin = Math.abs(l1 - l2) + 1e-4;
  const dc = Math.min(dMax, Math.max(dMin, d));
  out.clamped = d > dMax;
  // the bend direction: the pole's part across the shoulder -> target line, else the clip's own elbow
  const perp = vp.copy(pole).addScaledVector(n, -pole.dot(n));
  if (perp.lengthSq() < 1e-8) perp.copy(b).sub(a).addScaledVector(n, -vx.copy(b).sub(a).dot(n));
  if (perp.lengthSq() < 1e-8) perp.set(0, -1, 0).addScaledVector(n, n.y);
  perp.normalize();
  const x = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const elbow = ve.copy(a).addScaledVector(n, x).addScaledVector(perp, h);
  const wrist = vw.copy(a).addScaledVector(n, dc);
  aimLimb(upper, lower, elbow, 1);
  aimLimb(lower, end, wrist, 1);
  if (weight < 0.999) {
    q2.copy(upper.quaternion);
    upper.quaternion.copy(q0).slerp(q2, weight);
    q2.copy(lower.quaternion);
    lower.quaternion.copy(q1).slerp(q2, weight);
    upper.updateMatrixWorld(true);
  }
  out.reachError = end.getWorldPosition(vc).distanceTo(target);
  return out;
}
