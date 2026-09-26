// Low-poly guns built from primitives (spec section 8 "Guns", round-2 plan section 4). Gun frame
// (matches the clip sets' grip offsets): origin = middle of the grip, +Z = barrel, +Y = top of the
// slide; each gun's muzzle is gun.userData.muzzle (MUZZLE for the pistols). A gun under a hand bone
// takes its grip transform; aimGun() then swings it (clamped) so the barrel meets the crosshair point.
//   makeShotgun(): the pump gun (about 1.0 m at scale 1). The clips hold it at 0.64-0.72 of that (the
//     reach of the chibi Radbros), which makes it a toy stick from across the room, so it is attached
//     with a NON-uniform scale: length x the grip scale, cross-sections a little over true size
//     (SHOTGUN_THICK): the grip, the pump point and the muzzle are all along z and stay put.
//   makeAk(): #250's AK in the shotgun's frame (grip at the origin, handguard where the pump is, muzzle as
//     far out), so the long-gun clips and the left hand's reach fit it unchanged; attached like the shotgun.
//   makeSmg(): a compact machine pistol with the magazine in the grip; the pistol grips fit it as is.
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3, type Object3D } from "three";
import type { Grip } from "../anim/grips.ts";

export const MUZZLE = new Vector3(0, 0.052, 0.2);
export const SHOTGUN_MUZZLE = new Vector3(0, 0.07, 0.67);
/** The pump's centre in gun space (the left hand's grip); it racks back SHOTGUN_RACK. */
export const SHOTGUN_PUMP = new Vector3(0, 0.035, 0.4);
export const SHOTGUN_RACK = 0.08;
export const SMG_MUZZLE = new Vector3(0, 0.06, 0.25);
/** Shotgun cross-sections over true size (x / y); the length follows the character's grip scale. */
export const SHOTGUN_THICK = 1.3;

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

// the shotgun: a lighter gunmetal and a dark walnut stock, so it reads against a dark hoodie
const gunmetal = new MeshStandardMaterial({ color: "#8f96a2", roughness: 0.36, metalness: 0.3, emissive: "#40454e" });
const walnut = new MeshStandardMaterial({ color: "#5a3b26", roughness: 0.6, metalness: 0.05, emissive: "#1c120b" });
const polymer = new MeshStandardMaterial({ color: "#2d3036", roughness: 0.55, metalness: 0.1, emissive: "#16181c" });
// the section-4 sizes, chunkier across (REVIEW F5: at the clips' attach scale the true-size gun was
// a 1-3 px stick at 10 m); lengths and the points the clips use (grip, pump, muzzle) are unchanged
const sgGrip = new BoxGeometry(0.034, 0.1, 0.05);
const sgReceiver = new BoxGeometry(0.06, 0.082, 0.22);
const sgBarrel = new CylinderGeometry(0.017, 0.017, 0.46, 10);
const sgTube = new CylinderGeometry(0.015, 0.015, 0.4, 10);
const sgPump = new CylinderGeometry(0.027, 0.027, 0.16, 12);
const sgStock = new BoxGeometry(0.046, 0.09, 0.3);
const sgGuard = new BoxGeometry(0.01, 0.03, 0.06);

/** The pump shotgun (plan section 4). The pump is gun.userData.pump (rack it by moving it along -z). */
export function makeShotgun(): Group {
  const g = new Group();
  const grip = new Mesh(sgGrip, walnut);
  grip.rotation.x = 0.22;
  const receiver = new Mesh(sgReceiver, gunmetal);
  receiver.position.set(0, 0.05, 0.1);
  const barrel = new Mesh(sgBarrel, gunmetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.07, 0.43);
  const tube = new Mesh(sgTube, gunmetal);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, 0.035, 0.4);
  const pump = new Mesh(sgPump, walnut);
  pump.rotation.x = Math.PI / 2;
  pump.position.copy(SHOTGUN_PUMP);
  const stock = new Mesh(sgStock, walnut);
  stock.position.set(0, 0.035, -0.17);
  const guard = new Mesh(sgGuard, gunmetal);
  guard.position.set(0, 0.0, 0.05);
  g.add(grip, receiver, barrel, tube, pump, stock, guard);
  g.userData.rpGun = true;
  g.userData.muzzle = SHOTGUN_MUZZLE;
  g.userData.pump = pump;
  g.traverse(o => { o.frustumCulled = false; });
  return g;
}

/** The AK's muzzle (the shotgun's reach) and its handguard centre (where the left hand holds it). */
export const AK_MUZZLE = new Vector3(0, 0.06, 0.68);
export const AK_HANDGUARD = SHOTGUN_PUMP;
// dark parkerized steel lifted for the night street, red-brown wood, the orange bakelite mag: an AK
// silhouette that reads from the shoulder camera
const akSteel = new MeshStandardMaterial({ color: "#5f646d", roughness: 0.42, metalness: 0.3, emissive: "#2a2d33" });
const akWood = new MeshStandardMaterial({ color: "#8a4322", roughness: 0.55, metalness: 0.05, emissive: "#2a1208" });
const akMagMat = new MeshStandardMaterial({ color: "#b8562a", roughness: 0.5, metalness: 0.05, emissive: "#3a170a" });
const akReceiver = new BoxGeometry(0.052, 0.07, 0.3);
const akCover = new BoxGeometry(0.046, 0.022, 0.26);
const akGrip = new BoxGeometry(0.032, 0.1, 0.045);
const akGuard = new BoxGeometry(0.01, 0.028, 0.07);
const akHand = new BoxGeometry(0.05, 0.05, 0.19);
const akGas = new CylinderGeometry(0.012, 0.012, 0.2, 8);
const akBarrel = new CylinderGeometry(0.011, 0.011, 0.2, 8);
const akBrake = new CylinderGeometry(0.015, 0.015, 0.04, 8);
const akSight = new BoxGeometry(0.01, 0.045, 0.012);
const akMag = new BoxGeometry(0.03, 0.052, 0.048);
const akStock = new BoxGeometry(0.04, 0.07, 0.28);
const akButt = new BoxGeometry(0.044, 0.12, 0.03);

/** #250's AK-47 (see AK_MUZZLE / AK_HANDGUARD). */
export function makeAk(): Group {
  const g = new Group();
  const receiver = new Mesh(akReceiver, akSteel);
  receiver.position.set(0, 0.045, 0.1);
  const cover = new Mesh(akCover, akSteel);
  cover.position.set(0, 0.09, 0.09);
  const grip = new Mesh(akGrip, akWood);
  grip.rotation.x = 0.3;
  const guard = new Mesh(akGuard, akSteel);
  guard.position.set(0, 0.0, 0.06);
  const hand = new Mesh(akHand, akWood);
  hand.position.copy(AK_HANDGUARD);
  const gas = new Mesh(akGas, akWood);
  gas.rotation.x = Math.PI / 2;
  gas.position.set(0, 0.085, 0.38);
  const barrel = new Mesh(akBarrel, akSteel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.06, 0.58);
  const brake = new Mesh(akBrake, akSteel);
  brake.rotation.x = Math.PI / 2;
  brake.position.set(0, 0.06, 0.66);
  const sight = new Mesh(akSight, akSteel);
  sight.position.set(0, 0.088, 0.6);
  // the banana mag: three short segments curving forward under the receiver, in front of the guard
  // (short: the gun is attached 1.55x over true height for the shoulder camera, the mag with it)
  const mag = new Group();
  for (let i = 0; i < 3; i++) {
    const m = new Mesh(akMag, akMagMat);
    m.position.set(0, -0.045 * i - 0.018, 0.016 * i * i + 0.008 * i);
    m.rotation.x = -0.3 * i;
    mag.add(m);
  }
  mag.position.set(0, -0.005, 0.15);
  const stock = new Mesh(akStock, akWood);
  stock.rotation.x = -0.12;
  stock.position.set(0, 0.03, -0.14);
  const butt = new Mesh(akButt, akSteel);
  butt.rotation.x = -0.12;
  butt.position.set(0, 0.01, -0.28);
  g.add(receiver, cover, grip, guard, hand, gas, barrel, brake, sight, mag, stock, butt);
  g.userData.rpGun = true;
  g.userData.muzzle = AK_MUZZLE;
  g.userData.mag = mag;
  g.traverse(o => { o.frustumCulled = false; });
  return g;
}

const smgBody = new BoxGeometry(0.045, 0.06, 0.24);
const smgBarrel = new CylinderGeometry(0.009, 0.009, 0.03, 8);
const smgMag = new BoxGeometry(0.022, 0.16, 0.035);
const smgGrip = new BoxGeometry(0.03, 0.11, 0.045);

/** A compact machine pistol: the grip where the pistol's is, the magazine through it. */
export function makeSmg(): Group {
  const g = new Group();
  const body = new Mesh(smgBody, polymer);
  body.position.set(0, 0.05, 0.06);
  const barrel = new Mesh(smgBarrel, metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.06, 0.195);
  const grip = new Mesh(smgGrip, polymer);
  grip.rotation.x = 0.22;
  const mag = new Mesh(smgMag, metal);
  mag.rotation.x = 0.22;
  mag.position.set(0, -0.075, -0.018);
  g.add(body, barrel, grip, mag);
  g.userData.rpGun = true;
  g.userData.muzzle = SMG_MUZZLE;
  g.traverse(o => { o.frustumCulled = false; });
  return g;
}

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

/** Put a gun under a hand with its grip transform (`scale` for scaled parents, or [x, y, z] for the
 *  shotgun's non-uniform size; `k` for grip size). */
export function attachGun(gun: Object3D, hand: Object3D, g: Grip, k = 1, scale: number | [number, number, number] = 1): void {
  hand.add(gun);
  gun.position.set(g.p[0] * k, g.p[1] * k, g.p[2] * k);
  gun.quaternion.set(g.q[0], g.q[1], g.q[2], g.q[3]).normalize();
  if (typeof scale === "number") gun.scale.setScalar(scale);
  else gun.scale.set(scale[0], scale[1], scale[2]);
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
  const muzzle = gun.localToWorld(va.copy((gun.userData.muzzle as Vector3 | undefined) ?? MUZZLE));
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
  return gun.localToWorld(out.copy((gun.userData.muzzle as Vector3 | undefined) ?? MUZZLE));
}
