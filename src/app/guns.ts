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
const sgBead = new BoxGeometry(0.008, 0.01, 0.012);
const sgBand = new BoxGeometry(0.036, 0.05, 0.02);

/** The pump shotgun (plan section 4). The pump is gun.userData.pump (rack it by moving it along -z).
 *  `front`: the barrel and magazine tube run this much further ahead of the pump (the player's copy, so
 *  the gun still reads from the shoulder camera once it is shouldered; the grip, pump and stock stay put). */
export function makeShotgun(front = 0): Group {
  const g = new Group();
  const grip = new Mesh(sgGrip, walnut);
  grip.rotation.x = 0.22;
  const receiver = new Mesh(sgReceiver, gunmetal);
  receiver.position.set(0, 0.05, 0.1);
  const barrel = new Mesh(sgBarrel, gunmetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.07, 0.43 + front / 2);
  barrel.scale.y = (0.46 + front) / 0.46;
  const tube = new Mesh(sgTube, gunmetal);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, 0.035, 0.4 + front / 2);
  tube.scale.y = (0.4 + front) / 0.4;
  const pump = new Mesh(sgPump, walnut);
  pump.rotation.x = Math.PI / 2;
  pump.position.copy(SHOTGUN_PUMP);
  const stock = new Mesh(sgStock, walnut);
  stock.position.set(0, 0.035, -0.17);
  const guard = new Mesh(sgGuard, gunmetal);
  guard.position.set(0, 0.0, 0.05);
  g.add(grip, receiver, barrel, tube, pump, stock, guard);
  if (front > 0) {
    // a bead sight at the new muzzle and a barrel band where the longer tube meets it
    const bead = new Mesh(sgBead, chrome);
    bead.position.set(0, 0.092, 0.66 + front);
    const band = new Mesh(sgBand, gunmetal);
    band.position.set(0, 0.052, 0.62 + front * 0.8);
    g.add(bead, band);
  }
  g.userData.rpGun = true;
  g.userData.muzzle = front ? new Vector3(SHOTGUN_MUZZLE.x, SHOTGUN_MUZZLE.y, SHOTGUN_MUZZLE.z + front) : SHOTGUN_MUZZLE;
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

/** #250's AK-47 (see AK_MUZZLE / AK_HANDGUARD). `front`: the barrel runs this much further out (the
 *  player's copy, as the shotgun's). */
export function makeAk(front = 0): Group {
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
  barrel.position.set(0, 0.06, 0.58 + front / 2);
  barrel.scale.y = (0.2 + front) / 0.2;
  const brake = new Mesh(akBrake, akSteel);
  brake.rotation.x = Math.PI / 2;
  brake.position.set(0, 0.06, 0.66 + front);
  const sight = new Mesh(akSight, akSteel);
  sight.position.set(0, 0.088, 0.6 + front);
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
  g.userData.muzzle = front ? new Vector3(AK_MUZZLE.x, AK_MUZZLE.y, AK_MUZZLE.z + front) : AK_MUZZLE;
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
  gun.userData.gripPos = gun.position.clone();
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

/**
 * The wrist, not the gun (arsenal spec 1.6): reset the gun to its grip, then bend the HAND bone in world
 * space so the gun's barrel points from its muzzle at `target`, by at most `maxAngle` radians, blended by
 * `weight`. The gun stays in the palm exactly as the grip puts it.
 */
export function aimHand(hand: Object3D | undefined, gun: Object3D, target: Vector3 | null, weight: number, maxAngle = 0.75): void {
  const gq = gun.userData.grip as Quaternion | undefined;
  const gp = gun.userData.gripPos as Vector3 | undefined;
  if (gq) gun.quaternion.copy(gq);
  if (gp) gun.position.copy(gp);
  gun.updateMatrixWorld(true);
  if (!hand || !hand.parent || !target || weight <= 0.001) return;
  const muzzle = gun.localToWorld(va.copy((gun.userData.muzzle as Vector3 | undefined) ?? MUZZLE));
  const cur = vb.set(0, 0, 1).applyQuaternion(gun.getWorldQuaternion(qb));
  const want = vc.copy(target).sub(muzzle).normalize();
  qa.setFromUnitVectors(cur, want);
  const ang = 2 * Math.acos(Math.min(1, Math.abs(qa.w)));
  const k = Math.min(1, ang > 1e-4 ? maxAngle / ang : 1) * weight;
  if (k < 1) qa.slerp(qi.identity(), 1 - k);
  hand.parent.getWorldQuaternion(qb);
  const inv = qb.clone().invert();
  hand.quaternion.premultiply(qb).premultiply(qa).premultiply(inv);
  hand.updateMatrixWorld(true);
}

/** Muzzle world position of a gun (after its matrix is up to date). */
export function muzzleWorld(gun: Object3D, out: Vector3): Vector3 {
  return gun.localToWorld(out.copy((gun.userData.muzzle as Vector3 | undefined) ?? MUZZLE));
}

// ---- the arsenal's guns (arsenal spec 3.2): the pistol frame for the one-handed ones (the grip at the
// origin, +Z the barrel), the shotgun frame for the sniper; every one satin, never black-hole metal ----

export const HANDCANNON_MUZZLE = new Vector3(0, 0.055, 0.26);
const hcSlide = new BoxGeometry(0.046, 0.05, 0.27);
const hcFrame = new BoxGeometry(0.04, 0.03, 0.2);
const hcGrip = new BoxGeometry(0.04, 0.12, 0.055);
const hcGuard = new BoxGeometry(0.01, 0.034, 0.06);
const hcPort = new BoxGeometry(0.048, 0.02, 0.07);
const hcBore = new CylinderGeometry(0.011, 0.011, 0.012, 10);
const darkSteel = new MeshStandardMaterial({ color: "#3a3e46", roughness: 0.5, metalness: 0.2, emissive: "#1a1c21" });

/** The hand cannon: a long-slide .50 pistol in bright chrome with a big squared slide and a dark grip. */
export function makeHandCannon(): Group {
  const g = new Group();
  const slide = new Mesh(hcSlide, chrome);
  slide.position.set(0, 0.058, 0.12);
  const frame = new Mesh(hcFrame, chrome);
  frame.position.set(0, 0.025, 0.1);
  const gr = new Mesh(hcGrip, darkSteel);
  gr.rotation.x = 0.22;
  const guard = new Mesh(hcGuard, chrome);
  guard.position.set(0, 0.006, 0.05);
  const port = new Mesh(hcPort, darkSteel);
  port.position.set(0, 0.078, 0.1);
  const bore = new Mesh(hcBore, darkSteel);
  bore.rotation.x = Math.PI / 2;
  bore.position.set(0, 0.055, 0.257);
  g.add(slide, frame, gr, guard, port, bore);
  g.userData.rpGun = true;
  g.userData.muzzle = HANDCANNON_MUZZLE;
  g.userData.slide = slide;
  g.traverse(o => { o.frustumCulled = false; });
  return g;
}

export const SAWEDOFF_MUZZLE = new Vector3(0, 0.06, 0.42);
const soBarrel = new CylinderGeometry(0.02, 0.02, 0.36, 12);
const soRib = new BoxGeometry(0.012, 0.012, 0.34);
const soBlock = new BoxGeometry(0.07, 0.06, 0.1);
const soFore = new BoxGeometry(0.06, 0.035, 0.14);
const soGrip = new BoxGeometry(0.04, 0.11, 0.055);
const soStub = new BoxGeometry(0.045, 0.06, 0.07);
const soGuard = new BoxGeometry(0.01, 0.03, 0.06);

/** The sawed-off: a stubby side-by-side on a pistol-grip stock stub, walnut and gunmetal, one-handed.
 *  The barrels are gun.userData.barrels (they hinge down at z 0.12 for the reload). */
export function makeSawedOff(): Group {
  const g = new Group();
  const barrels = new Group();
  barrels.position.set(0, 0.06, 0.12);
  for (const x of [-0.021, 0.021]) {
    const b = new Mesh(soBarrel, gunmetal);
    b.rotation.x = Math.PI / 2;
    b.position.set(x, 0, 0.18);
    barrels.add(b);
  }
  const rib = new Mesh(soRib, chrome);
  rib.position.set(0, 0.022, 0.18);
  const fore = new Mesh(soFore, walnut);
  fore.position.set(0, -0.03, 0.1);
  barrels.add(rib, fore);
  const block = new Mesh(soBlock, gunmetal);
  block.position.set(0, 0.05, 0.06);
  const gr = new Mesh(soGrip, walnut);
  gr.rotation.x = 0.28;
  const stub = new Mesh(soStub, walnut);
  stub.position.set(0, -0.04, -0.035);
  stub.rotation.x = 0.28;
  const guard = new Mesh(soGuard, gunmetal);
  guard.position.set(0, 0.01, 0.045);
  g.add(barrels, block, gr, stub, guard);
  g.userData.rpGun = true;
  g.userData.muzzle = SAWEDOFF_MUZZLE;
  g.userData.barrels = barrels;
  g.traverse(o => { o.frustumCulled = false; });
  return g;
}

export const SNIPER_MUZZLE = new Vector3(0, 0.07, 0.8);
// dark green-grey furniture, steel, the scope's glass a cold blue
const snFurn = new MeshStandardMaterial({ color: "#4d5a4a", roughness: 0.6, metalness: 0.05, emissive: "#1c221b" });
const snGlass = new MeshStandardMaterial({ color: "#5fb4d9", roughness: 0.15, metalness: 0.3, emissive: "#1d4658" });
const snStock = new BoxGeometry(0.05, 0.1, 0.34);
const snGrip = new BoxGeometry(0.034, 0.1, 0.05);
const snReceiver = new BoxGeometry(0.05, 0.06, 0.26);
const snFore = new BoxGeometry(0.055, 0.05, 0.3);
const snBarrel = new CylinderGeometry(0.012, 0.014, 0.5, 10);
const snTube = new CylinderGeometry(0.024, 0.024, 0.2, 12);
const snBell = new CylinderGeometry(0.032, 0.026, 0.06, 12);
const snLens = new CylinderGeometry(0.03, 0.03, 0.006, 12);
const snRing = new BoxGeometry(0.014, 0.05, 0.02);
const snBolt = new CylinderGeometry(0.008, 0.008, 0.06, 8);
const snKnob = new BoxGeometry(0.022, 0.022, 0.022);
const snMag = new BoxGeometry(0.03, 0.05, 0.08);

/** The sniper rifle: a long bolt gun in the shotgun frame, a scope on top ((0, 0.12, 0.05-0.25)), the bolt
 *  handle at (0.03, 0.08, 0.02) (gun.userData.bolt: cycle it along -z). `front`: the barrel runs further. */
export function makeSniper(front = 0): Group {
  const g = new Group();
  const stock = new Mesh(snStock, snFurn);
  stock.position.set(0, 0.02, -0.17);
  const grip = new Mesh(snGrip, snFurn);
  grip.rotation.x = 0.3;
  const receiver = new Mesh(snReceiver, akSteel);
  receiver.position.set(0, 0.055, 0.08);
  const fore = new Mesh(snFore, snFurn);
  fore.position.set(0, 0.035, 0.36);
  const barrel = new Mesh(snBarrel, akSteel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.07, 0.55 + front / 2);
  barrel.scale.y = (0.5 + front) / 0.5;
  const tube = new Mesh(snTube, akSteel);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, 0.125, 0.15);
  const bellF = new Mesh(snBell, akSteel);
  bellF.rotation.x = Math.PI / 2;
  bellF.position.set(0, 0.125, 0.27);
  const bellB = new Mesh(snBell, akSteel);
  bellB.rotation.x = -Math.PI / 2;
  bellB.position.set(0, 0.125, 0.03);
  const lens = new Mesh(snLens, snGlass);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0.125, 0.302);
  const r1 = new Mesh(snRing, akSteel);
  r1.position.set(0, 0.095, 0.08);
  const r2 = new Mesh(snRing, akSteel);
  r2.position.set(0, 0.095, 0.21);
  const bolt = new Group();
  bolt.position.set(0.03, 0.08, 0.02);
  const shaft = new Mesh(snBolt, akSteel);
  shaft.rotation.z = Math.PI / 2;
  const knob = new Mesh(snKnob, akSteel);
  knob.position.set(0.035, -0.01, 0);
  bolt.add(shaft, knob);
  const mag = new Mesh(snMag, akSteel);
  mag.position.set(0, -0.005, 0.12);
  g.add(stock, grip, receiver, fore, barrel, tube, bellF, bellB, lens, r1, r2, bolt, mag);
  g.userData.rpGun = true;
  g.userData.muzzle = new Vector3(SNIPER_MUZZLE.x, SNIPER_MUZZLE.y, SNIPER_MUZZLE.z + front);
  g.userData.bolt = bolt;
  g.traverse(o => { o.frustumCulled = false; });
  return g;
}

const frBody = new CylinderGeometry(0.036, 0.036, 0.075, 10);
const frCap = new CylinderGeometry(0.018, 0.022, 0.03, 8);
const frSpoon = new BoxGeometry(0.012, 0.07, 0.02);
const frag = new MeshStandardMaterial({ color: "#5f6a3e", roughness: 0.6, metalness: 0.1, emissive: "#20250f" });

/** A frag grenade: a dark olive body, a steel cap and spoon (about 11 cm). */
export function makeGrenade(): Group {
  const g = new Group();
  const body = new Mesh(frBody, frag);
  body.scale.set(1, 1.15, 1);
  const cap = new Mesh(frCap, metal);
  cap.position.y = 0.05;
  const spoon = new Mesh(frSpoon, metal);
  spoon.position.set(0.03, 0.02, 0);
  g.add(body, cap, spoon);
  g.userData.rpGun = true;
  g.traverse(o => { o.frustumCulled = false; });
  return g;
}

const kBlade = new BoxGeometry(0.008, 0.032, 0.75);
const kEdge = new BoxGeometry(0.003, 0.012, 0.73);
const kGuard = new CylinderGeometry(0.042, 0.042, 0.012, 14);
const kHilt = new BoxGeometry(0.03, 0.034, 0.26);
const bladeMat = new MeshStandardMaterial({ color: "#d9dde3", roughness: 0.18, metalness: 0.55, emissive: "#4a4e56" });
const goldMat = new MeshStandardMaterial({ color: "#c9a045", roughness: 0.35, metalness: 0.6, emissive: "#3a2a0c" });
const wrapMat = new MeshStandardMaterial({ color: "#1d1f26", roughness: 0.8, metalness: 0, emissive: "#0c0d10" });

/** #4764's drawn katana in the pistol frame: the grip at the origin, the 0.75 m blade along +Z. */
export function makeKatana(): Group {
  const g = new Group();
  const hilt = new Mesh(kHilt, wrapMat);
  hilt.position.set(0, 0.02, -0.05);
  const guard = new Mesh(kGuard, goldMat);
  guard.rotation.x = Math.PI / 2;
  guard.position.set(0, 0.02, 0.085);
  const blade = new Mesh(kBlade, bladeMat);
  blade.position.set(0, 0.024, 0.47);
  const edge = new Mesh(kEdge, chrome);
  edge.position.set(0, 0.003, 0.47);
  g.add(hilt, guard, blade, edge);
  g.userData.rpGun = true;
  g.userData.muzzle = new Vector3(0, 0.024, 0.84);
  g.traverse(o => { o.frustumCulled = false; });
  return g;
}
