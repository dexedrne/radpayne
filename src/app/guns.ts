// Low-poly pistols built from primitives (spec section 8 "Guns"). Gun frame (matches the clip set's
// grip offsets): origin = middle of the grip, +Z = barrel, +Y = top of the slide; the muzzle sits at
// MUZZLE. A gun under a hand bone takes its grip transform; aimGun() then swings it (clamped) so the
// barrel meets the crosshair point.
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3, type Object3D } from "three";
import type { Grip } from "../anim/grips.ts";

export const MUZZLE = new Vector3(0, 0.052, 0.2);

const slideGeo = new BoxGeometry(0.034, 0.036, 0.2);
const frameGeo = new BoxGeometry(0.03, 0.022, 0.16);
const barrelGeo = new CylinderGeometry(0.008, 0.008, 0.03, 8);
const gripGeo = new BoxGeometry(0.03, 0.1, 0.045);
const guardGeo = new BoxGeometry(0.008, 0.028, 0.05);
// Satin steel, not black: the street has no environment map, so a high-metalness gun renders as a black
// hole against the night. Low metalness + a small self-lift keeps the silhouette readable from behind.
const metal = new MeshStandardMaterial({ color: "#7d838e", roughness: 0.38, metalness: 0.35, emissive: "#2a2d33" });
const grip = new MeshStandardMaterial({ color: "#4a3a30", roughness: 0.75, metalness: 0.05, emissive: "#140e0b" });
const chrome = new MeshStandardMaterial({ color: "#c3c8d0", roughness: 0.25, metalness: 0.45, emissive: "#34373d" });

export function makePistol(shiny = false): Group {
  const g = new Group();
  const slide = new Mesh(slideGeo, shiny ? chrome : metal);
  slide.position.set(0, 0.052, 0.07);
  const frame = new Mesh(frameGeo, metal);
  frame.position.set(0, 0.03, 0.055);
  const barrel = new Mesh(barrelGeo, metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.052, 0.18);
  const gr = new Mesh(gripGeo, grip);
  gr.rotation.x = 0.22;
  const guard = new Mesh(guardGeo, metal);
  guard.position.set(0, 0.012, 0.045);
  g.add(slide, frame, barrel, gr, guard);
  g.userData.rpGun = true;
  g.traverse(o => { o.frustumCulled = false; });
  return g;
}

/** Put a gun under a hand with its grip transform (`scale` for scaled parents, `k` for grip size). */
export function attachGun(gun: Object3D, hand: Object3D, g: Grip, k = 1, scale = 1): void {
  hand.add(gun);
  gun.position.set(g.p[0] * k, g.p[1] * k, g.p[2] * k);
  gun.quaternion.set(g.q[0], g.q[1], g.q[2], g.q[3]).normalize();
  gun.scale.setScalar(scale);
  gun.userData.grip = gun.quaternion.clone();
}

const va = new Vector3();
const vb = new Vector3();
const vc = new Vector3();
const qa = new Quaternion();
const qb = new Quaternion();
const qi = new Quaternion();

/**
 * Reset the gun to its grip, then swing it in world space so its barrel points from the muzzle at
 * `target`, by at most `maxAngle` radians, blended by `weight`.
 */
export function aimGun(gun: Object3D, target: Vector3 | null, weight: number, maxAngle = 0.45): void {
  const gq = gun.userData.grip as Quaternion | undefined;
  if (gq) gun.quaternion.copy(gq);
  gun.updateMatrixWorld(true);
  if (!target || weight <= 0.001 || !gun.parent) return;
  const muzzle = gun.localToWorld(va.copy(MUZZLE));
  const cur = vb.set(0, 0, 1).applyQuaternion(gun.getWorldQuaternion(qb));
  const want = vc.copy(target).sub(muzzle).normalize();
  qa.setFromUnitVectors(cur, want);
  const ang = 2 * Math.acos(Math.min(1, Math.abs(qa.w)));
  const k = Math.min(1, ang > 1e-4 ? maxAngle / ang : 1) * weight;
  if (k < 1) qa.slerp(qi.identity(), 1 - k);
  // world delta -> local: L' = P^-1 * D * P * L
  gun.parent.getWorldQuaternion(qb);
  const inv = qb.clone().invert();
  gun.quaternion.premultiply(qb).premultiply(qa).premultiply(inv);
  gun.updateMatrixWorld(true);
}

/** Muzzle world position of a gun (after its matrix is up to date). */
export function muzzleWorld(gun: Object3D, out: Vector3): Vector3 {
  return gun.localToWorld(out.copy(MUZZLE));
}
