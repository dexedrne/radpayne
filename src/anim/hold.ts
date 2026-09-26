// The long-gun hold (arsenal spec 1.2-1.5): the gun leads and the hands follow it.
// Every frame, after the mixer and the spine layers:
//   1. G_clip: the gun where the mixer left the right hand (the gun is a child of RightHand, at its grip).
//   2. G_target: G_clip on a long-gun clip (its stance, walk bob, the run's lowered barrel), the gun's
//      chest-relative pose from Shotgun_Aim_Idle on any other clip (jump, roll, the pistol fallbacks),
//      blended by the long-gun clips' share of the base weight; then turned about the butt onto the
//      crosshair (clamped), the low-ready offset, the reload tilt, the cant and the recoil.
//   3. Hand targets in gun space: the right hand at its grip (always); the left hand where the clip holds
//      it (the pump, the reload's feed, the fire layer's rack) or, off the long-gun clips, where
//      Shotgun_Aim_Idle holds it. A left target past the arm's reach slides back along the rail, then
//      the gun moves in toward the chest (6 cm at most).
//   4. Two-bone IK on both arms, the hands' world rotations set exactly, the twist split with the forearm.
// The gun is never turned inside the fist: with the right hand solved, it sits at G_target.
import { Quaternion, Vector3, type Object3D } from "three";
import { limbLengths, setWorldQuaternion, solveTwoBone, splitTwist } from "./ik.ts";

export type Frame = { p: Vector3; q: Quaternion };
export const newFrame = (): Frame => ({ p: new Vector3(), q: new Quaternion() });

const sTmp = new Vector3();
const fp = new Vector3();
/** A node's world position + rotation (its scale dropped). */
export function worldFrame(o: Object3D, out: Frame): Frame {
  o.matrixWorld.decompose(out.p, out.q, sTmp);
  return out;
}
/** out = a o b (b expressed in a's frame, to world). Safe when out is a or b. */
export function mulFrame(a: Frame, b: Frame, out: Frame): Frame {
  const p = fp.copy(b.p).applyQuaternion(a.q).add(a.p);
  out.q.multiplyQuaternions(a.q, b.q);
  out.p.copy(p);
  return out;
}
/** out = a^-1. */
export function invFrame(a: Frame, out: Frame): Frame {
  out.q.copy(a.q).invert();
  out.p.copy(a.p).negate().applyQuaternion(out.q);
  return out;
}
export function blendFrame(a: Frame, b: Frame, t: number, out: Frame): Frame {
  out.p.lerpVectors(a.p, b.p, t);
  out.q.slerpQuaternions(a.q, b.q, t);
  return out;
}

/** Gun-space geometry of a long gun (the shotgun frame: origin = middle of the grip, +Z = barrel). */
export type LongGunGeom = {
  /** The butt plate (turns pivot here: the stock stays in the shoulder). */
  butt: [number, number, number];
  /** The left hand's rail along z (the pump / the handguard). */
  rail: [number, number];
  /** Farthest back the left hand may slide when the rail is out of reach (the receiver's front). */
  slideTo: number;
  /** The muzzle of the player's copy (aim correction). */
  muzzle: [number, number, number];
};

export const LONG_GUN_GEOM: Record<"shotgun" | "ak", LongGunGeom> = {
  shotgun: { butt: [0, 0.04, -0.32], rail: [0.33, 0.46], slideTo: 0.25, muzzle: [0, 0.07, 0.8] },
  ak: { butt: [0, 0.01, -0.28], rail: [0.31, 0.49], slideTo: 0.25, muzzle: [0, 0.06, 0.8] },
};

/** The clips' left palm on the pump, in gun space at the clip's uniform gun scale (round-2 manifest
 *  grips.shotgun.leftPalmOnGun). */
export const CLIP_PALM: [number, number, number] = [0.012, 0.005, 0.37];

/** Where the two elbows point by default (his right / up / forward), mixed with the clip's own elbow. */
export const POLE = { right: [0.6, -0.8, -0.1], left: [-0.4, -0.7, 0.3] } as const;

export type HoldBones = {
  chest: Object3D; lArm: Object3D; lFore: Object3D; lHand: Object3D; rArm: Object3D; rFore: Object3D; rHand: Object3D;
  /** The clavicles: off the long-gun clips they take the reference hold's rotation (the shoulders come
   *  forward to the gun, as in Shotgun_Aim_Idle). */
  lClav?: Object3D; rClav?: Object3D;
};

export type HoldIn = {
  gun: Object3D;
  geom: LongGunGeom;
  /** Share of the base pose that is a long-gun clip (0..1). */
  longShare: number;
  /** IK weight (0 = the clip's arms). */
  weight: number;
  aim: Vector3 | null;
  /** Aim correction weight and its clamp (radians). */
  aimW: number;
  aimMax: number;
  /** Low-ready weight (0 = shouldered on the crosshair). */
  ready: number;
  /** Extra turn about the grip (the reload tilt): muzzle down, roll toward the left hand (radians). */
  tiltDown: number;
  tiltRoll: number;
  /** Outward cant about the barrel (radians, top toward his right). */
  cant: number;
  /** Recoil 0..1 (4 cm back, muzzle up 5 deg). */
  recoil: number;
  /** A scripted left-hand path (the AK's mag change): where the PALM goes, a gun-space point (`local`,
   *  gun units) mixed toward a world point (`world`) by `mix`, blended in by `w`; the rail rules are off
   *  meanwhile. */
  leftPath: { local: Vector3; world: Vector3; mix: number; w: number } | null;
  /** How much of the hand rotation the left hand takes from the gun (1) or keeps from the clip (0). */
  leftRot?: number;
  /** Seconds since the last solve (the clip hold's ease). */
  dt?: number;
};

export type HoldOut = {
  /** Right hand's gun vs the target (m). */
  gripErr: number;
  /** Left palm to the rail (m). */
  leftErr: number;
  reachL: number;
  reachR: number;
  /** How far the left hand slid back along the rail / the gun moved in (m). */
  slide: number;
  shift: number;
  /** How far the hold bends each wrist beyond the clip's own (rad, the swing only). */
  bendL: number;
  bendR: number;
  /** An elbow popped (jumped while its hand stayed put) since the last frame. */
  flipL: boolean;
  flipR: boolean;
};

const DEG = Math.PI / 180;
const UP = new Vector3(0, 1, 0);
/** The low ready (about the butt): muzzle down, muzzle out to his right, the gun lower (m); `twist` =
 *  the chest turned to his right (PlayerView's spine layer: the gun and both shoulders go with it, so the
 *  hands keep their reach, and the gun's length comes out past his body where the shoulder camera sees
 *  it); `aim` = how much of the aim correction stays on in the ready (none: he is not aiming). */
export const READY = { down: 17 * DEG, out: 6 * DEG, drop: 0.03, twist: 0.4, aim: 0 };
const RECOIL = { back: 0.04, up: 5 * DEG };

export class LongGunHold {
  readonly b: HoldBones;
  /** The gun in the chest's frame, and the left hand in the gun's (rigid), from Shotgun_Aim_Idle t = 0. */
  readonly gChest = newFrame();
  readonly lGun = newFrame();
  /** The left palm in the left hand's frame, and on the gun (rigid gun space) at the sample. */
  readonly palmL = new Vector3();
  readonly palmGun = new Vector3();
  /** Arm lengths (upper + fore). */
  armL = 0.4;
  armR = 0.4;
  /** Bind-pose local rotations of the hands, and the forearm's axis in each hand's bind frame (the bend
   *  measure: the wrist's swing off straight). */
  readonly bindL = new Quaternion();
  readonly bindR = new Quaternion();
  readonly axisL = new Vector3();
  readonly axisR = new Vector3();
  /** The default elbow poles in the chest's frame (POLE, from his right / up / forward in the reference:
   *  they turn with the chest, so an elbow keeps its side through a roll). */
  readonly poleLocR = new Vector3();
  readonly poleLocL = new Vector3();
  /** The clavicles' and the hands' local rotations in the reference hold. */
  readonly clavL = new Quaternion();
  readonly clavR = new Quaternion();
  readonly refHandL = new Quaternion();
  readonly refHandR = new Quaternion();
  sampled = false;
  // scratch
  private readonly gClip = newFrame();
  private readonly gBase = newFrame();
  private readonly gT = newFrame();
  private readonly rh = newFrame();
  private readonly lh = newFrame();
  private readonly chest = newFrame();
  private readonly t0 = newFrame();
  private readonly t1 = newFrame();
  private readonly lRel = newFrame();
  private readonly rRel = newFrame();
  private readonly rT = newFrame();
  private readonly lT = newFrame();
  private readonly v0 = new Vector3();
  private readonly v1 = new Vector3();
  private readonly v2 = new Vector3();
  private readonly v3 = new Vector3();
  private readonly pr = new Vector3();
  private readonly pl = new Vector3();
  private readonly q0 = new Quaternion();
  private readonly poleR = new Vector3();
  private readonly poleL = new Vector3();
  private readonly clipHandL = new Quaternion();
  private readonly clipHandR = new Quaternion();
  /** The clip's own left hand and clavicles: eased in on a pure long-gun pose. */
  private clipW = 1;
  /** Last frame's elbows and wrists relative to their shoulders (the pop measure). */
  private readonly prevEL = new Vector3();
  private readonly prevER = new Vector3();
  private readonly prevWL = new Vector3();
  private readonly prevWR = new Vector3();
  private popInit = false;

  constructor(b: HoldBones) {
    this.b = b;
    this.bindL.copy(b.lHand.quaternion);
    this.bindR.copy(b.rHand.quaternion);
    this.axisL.copy(b.lHand.position).normalize().applyQuaternion(this.q0.copy(this.bindL).invert());
    this.axisR.copy(b.rHand.position).normalize().applyQuaternion(this.q0.copy(this.bindR).invert());
  }

  /** The wrist's swing between two local hand rotations (rad; the twist about the forearm left out). */
  swing(hand: Object3D, from: Quaternion, left: boolean): number {
    const a = this.v0.copy(left ? this.axisL : this.axisR).applyQuaternion(hand.quaternion);
    const f = this.v1.copy(left ? this.axisL : this.axisR).applyQuaternion(from);
    return Math.acos(Math.max(-1, Math.min(1, a.dot(f))));
  }

  /**
   * Read the reference hold off a posed model (Shotgun_Aim_Idle at t = 0, matrices current): the gun's
   * chest-relative pose, the left hand on the gun and the palm. `clipScale` = the clips' uniform gun scale.
   */
  sample(gun: Object3D, clipScale: number): void {
    const b = this.b;
    b.chest.updateMatrixWorld(true);
    worldFrame(b.chest, this.chest);
    worldFrame(gun, this.gClip);
    worldFrame(b.lHand, this.lh);
    mulFrame(invFrame(this.chest, this.t0), this.gClip, this.gChest);
    mulFrame(invFrame(this.gClip, this.t0), this.lh, this.lGun);
    this.palmGun.set(CLIP_PALM[0] * clipScale, CLIP_PALM[1] * clipScale, CLIP_PALM[2] * clipScale);
    // the palm in the hand's frame
    this.v0.copy(this.palmGun).applyQuaternion(this.gClip.q).add(this.gClip.p);
    this.palmL.copy(this.v0).sub(this.lh.p).applyQuaternion(this.q0.copy(this.lh.q).invert());
    // the reference is sampled with the model unturned: he faces +Z, his right is -X
    const inv = this.q0.copy(this.chest.q).invert();
    this.poleLocR.set(-POLE.right[0], POLE.right[1], POLE.right[2]).applyQuaternion(inv);
    this.poleLocL.set(-POLE.left[0], POLE.left[1], POLE.left[2]).applyQuaternion(inv);
    this.refHandL.copy(b.lHand.quaternion);
    this.refHandR.copy(b.rHand.quaternion);
    if (b.lClav) this.clavL.copy(b.lClav.quaternion);
    if (b.rClav) this.clavR.copy(b.rClav.quaternion);
    const [l1, l2] = limbLengths(b.lArm, b.lFore, b.lHand);
    const [r1, r2] = limbLengths(b.rArm, b.rFore, b.rHand);
    this.armL = l1 + l2;
    this.armR = r1 + r2;
    this.sampled = true;
  }

  /** Turn frame f by q about the world point c. */
  private turnAbout(f: Frame, q: Quaternion, c: Vector3): void {
    f.q.premultiply(q);
    f.p.sub(c).applyQuaternion(q).add(c);
  }

  /** The left palm in the gun's local space (gun units: the gun's scale divided out). */
  palmOnGun(gun: Object3D, out: Vector3): Vector3 {
    worldFrame(this.b.lHand, this.t1);
    out.copy(this.palmL).applyQuaternion(this.t1.q).add(this.t1.p);
    return gun.worldToLocal(out);
  }

  /** The palm's distance to the rail on the gun (the gun's current world frame). */
  leftError(gun: Object3D, geom: LongGunGeom): number {
    worldFrame(gun, this.t0);
    worldFrame(this.b.lHand, this.t1);
    const palm = this.v0.copy(this.palmL).applyQuaternion(this.t1.q).add(this.t1.p);
    const rel = palm.sub(this.t0.p).applyQuaternion(this.q0.copy(this.t0.q).invert());
    const zs = gun.scale.z;
    const z = Math.min(geom.rail[1] * zs, Math.max(Math.min(geom.slideTo * zs, this.palmGun.z), rel.z));
    return Math.hypot(rel.x - this.palmGun.x, rel.y - this.palmGun.y, rel.z - z);
  }

  solve(h: HoldIn): HoldOut {
    const b = this.b;
    const out: HoldOut = { gripErr: 0, leftErr: 0, reachL: 0, reachR: 0, slide: 0, shift: 0, bendL: 0, bendR: 0, flipL: false, flipR: false };
    const gun = h.gun;
    // 1. the clip's gun and hands
    const gq = gun.userData.grip as Quaternion | undefined, gp = gun.userData.gripPos as Vector3 | undefined;
    if (gq) gun.quaternion.copy(gq);
    if (gp) gun.position.copy(gp);
    // How much the clip's own hold counts. The gun follows the long-gun clips by their share of the base
    // pose (smoothed); the left hand and the clavicles take the clip's only on a pure long-gun pose (eased
    // in over ~0.1 s): mid-crossfade into a jump or a roll the mixer's arms are half-way to the other
    // clip's and off the gun, so the reference hold (chest-relative) holds them there.
    const u = Math.min(1, Math.max(0, (h.longShare - 0.6) / 0.4));
    const sGun = u * u * (3 - 2 * u);
    const pure = h.longShare > 0.995 ? 1 : 0;
    this.clipW = pure ? Math.min(1, this.clipW + (h.dt ?? 1 / 60) / 0.1) : 0;
    const sClip = this.clipW * this.clipW * (3 - 2 * this.clipW);
    // off the long-gun clips the shoulders come forward to the gun as in the reference hold
    const off = (1 - sClip) * h.weight;
    if (this.sampled && off > 0.001) {
      if (b.lClav) b.lClav.quaternion.slerp(this.clavL, off);
      if (b.rClav) b.rClav.quaternion.slerp(this.clavR, off);
    }
    b.chest.updateMatrixWorld(true);
    worldFrame(gun, this.gClip);
    worldFrame(b.rHand, this.rh);
    worldFrame(b.lHand, this.lh);
    worldFrame(b.chest, this.chest);
    this.clipHandL.copy(b.lHand.quaternion);
    this.clipHandR.copy(b.rHand.quaternion);
    if (!this.sampled || h.weight <= 0.001) {
      this.clipW = 0;
      out.leftErr = this.sampled ? this.leftError(gun, h.geom) : 0;
      return out;
    }
    const s = sClip;
    // the right hand relative to its gun (the grip, exactly), the left per the clip or the reference
    mulFrame(invFrame(this.gClip, this.t0), this.rh, this.rRel);
    mulFrame(this.t0, this.lh, this.t1);
    blendFrame(this.lGun, this.t1, s, this.lRel);
    // 2. G_target
    mulFrame(this.chest, this.gChest, this.t0);
    blendFrame(this.t0, this.gClip, sGun, this.gBase);
    const gT = this.gT;
    gT.p.copy(this.gBase.p);
    gT.q.copy(this.gBase.q);
    const sc = gun.scale;
    const gunPt = (x: number, y: number, z: number, o: Vector3) => o.set(x * sc.x, y * sc.y, z * sc.z).applyQuaternion(gT.q).add(gT.p);
    const fwd = () => this.v1.set(0, 0, 1).applyQuaternion(gT.q);
    const butt = h.geom.butt;
    // the aim: turn about the butt so the barrel meets the crosshair point (twice: the muzzle moves)
    if (h.aim && h.aimW > 0.001) {
      let budget = h.aimMax;
      for (let i = 0; i < 2 && budget > 1e-5; i++) {
        const m = gunPt(h.geom.muzzle[0], h.geom.muzzle[1], h.geom.muzzle[2], this.v0);
        const want = this.v2.copy(h.aim).sub(m);
        if (want.lengthSq() < 0.25) break;
        want.normalize();
        this.q0.setFromUnitVectors(fwd(), want);
        const ang = 2 * Math.acos(Math.min(1, Math.abs(this.q0.w)));
        const k = Math.min(1, ang > 1e-5 ? budget / ang : 1) * (i === 0 ? h.aimW : 1);
        if (k < 1) this.q0.slerp(this.t1.q.identity(), 1 - k);
        budget -= ang * k;
        this.turnAbout(gT, this.q0, gunPt(butt[0], butt[1], butt[2], this.v3));
        if (h.aimW < 0.999) break;
      }
    }
    // the low ready: muzzle down and out to his right about the butt, a little lower
    if (h.ready > 0.001) {
      const c = gunPt(butt[0], butt[1], butt[2], this.v3);
      const f = fwd();
      const across = this.v2.crossVectors(f, UP);
      if (across.lengthSq() > 1e-6) {
        this.q0.setFromAxisAngle(across.normalize(), -READY.down * h.ready);
        this.turnAbout(gT, this.q0, c);
      }
      this.q0.setFromAxisAngle(UP, -READY.out * h.ready);
      this.turnAbout(gT, this.q0, c);
      gT.p.y -= READY.drop * h.ready;
    }
    // the reload tilt about the grip: muzzle down, rolled so the loading side faces the left hand
    if (Math.abs(h.tiltDown) > 1e-4 || Math.abs(h.tiltRoll) > 1e-4) {
      const f = fwd();
      const across = this.v2.crossVectors(f, UP);
      if (across.lengthSq() > 1e-6) {
        this.q0.setFromAxisAngle(across.normalize(), -h.tiltDown);
        this.turnAbout(gT, this.q0, this.v3.copy(gT.p));
      }
      this.q0.setFromAxisAngle(fwd(), h.tiltRoll);
      this.turnAbout(gT, this.q0, this.v3.copy(gT.p));
    }
    // the cant: top toward his right, about the barrel line through the butt
    if (Math.abs(h.cant) > 1e-4) {
      this.q0.setFromAxisAngle(fwd(), h.cant);
      this.turnAbout(gT, this.q0, gunPt(butt[0], butt[1], butt[2], this.v3));
    }
    // recoil: back along the barrel, muzzle up about the butt
    if (h.recoil > 0.001) {
      const f = fwd();
      gT.p.addScaledVector(f, -RECOIL.back * h.recoil);
      const across = this.v2.crossVectors(f, UP);
      if (across.lengthSq() > 1e-6) {
        this.q0.setFromAxisAngle(across.normalize(), RECOIL.up * h.recoil);
        this.turnAbout(gT, this.q0, gunPt(butt[0], butt[1], butt[2], this.v3));
      }
    }
    // 3. hand targets
    mulFrame(gT, this.rRel, this.rT);
    mulFrame(gT, this.lRel, this.lT);
    // 4. the left hand's reach: slide back along the rail, then bring the gun in toward the chest
    const shL = b.lArm.getWorldPosition(this.pl);
    const reachMax = 0.99 * this.armL;
    if (h.leftPath && h.leftPath.w > 0.001) {
      const lp = h.leftPath;
      const palm = gunPt(lp.local.x, lp.local.y, lp.local.z, this.v0).lerp(lp.world, lp.mix);
      // the wrist that puts the palm there
      palm.sub(this.v2.copy(this.palmL).applyQuaternion(this.lT.q));
      this.lT.p.lerp(palm, lp.w);
    } else {
      const f = fwd();
      const P = this.v0.copy(this.lT.p).sub(shL);
      if (P.length() > reachMax) {
        const pf = P.dot(f);
        const disc = pf * pf - P.lengthSq() + reachMax * reachMax;
        const slideMax = Math.max(0, this.palmGun.z - h.geom.slideTo * sc.z);
        const sl = disc >= 0 ? Math.min(slideMax, Math.max(0, pf - Math.sqrt(disc))) : slideMax;
        this.lT.p.addScaledVector(f, -sl);
        out.slide = sl;
        const d = this.v0.copy(this.lT.p).sub(shL).length();
        if (d > reachMax) {
          // in toward the left shoulder, across the barrel
          const v = this.v2.copy(shL).sub(this.lT.p);
          v.addScaledVector(f, -v.dot(f));
          if (v.lengthSq() > 1e-8) {
            v.normalize();
            const need = Math.min(0.06, d - reachMax);
            gT.p.addScaledVector(v, need);
            this.rT.p.addScaledVector(v, need);
            this.lT.p.addScaledVector(v, need);
            out.shift = need;
          }
        }
      }
    }
    // 5. solve: right arm first (the grip), then the left
    const w = h.weight;
    const pole = (side: "right" | "left", shoulder: Vector3, elbow: Object3D, target: Vector3, o: Vector3) => {
      const def = this.v2.copy(side === "right" ? this.poleLocR : this.poleLocL).applyQuaternion(this.chest.q);
      const n = this.v3.copy(target).sub(shoulder);
      if (n.lengthSq() < 1e-8) return o.copy(def);
      n.normalize();
      def.addScaledVector(n, -def.dot(n)).normalize();
      const clipE = elbow.getWorldPosition(o).sub(shoulder);
      clipE.addScaledVector(n, -clipE.dot(n));
      const kc = clipE.length() > 0.004 ? 0.2 + 0.5 * s : 0;
      if (kc > 0) clipE.normalize().multiplyScalar(kc);
      return clipE.addScaledVector(def, 1 - kc);
    };
    const shR = b.rArm.getWorldPosition(this.pr);
    const poleR = pole("right", shR, b.rFore, this.rT.p, this.poleR);
    const rr = solveTwoBone(b.rArm, b.rFore, b.rHand, this.rT.p, poleR, w);
    setWorldQuaternion(b.rHand, this.rT.q, w);
    splitTwist(b.rFore, b.rHand, 0.5 * w);
    b.lArm.getWorldPosition(shL);
    const poleL = pole("left", shL, b.lFore, this.lT.p, this.poleL);
    const rl = solveTwoBone(b.lArm, b.lFore, b.lHand, this.lT.p, poleL, w);
    setWorldQuaternion(b.lHand, this.lT.q, w * (h.leftRot ?? 1));
    splitTwist(b.lFore, b.lHand, 0.5 * w);
    gun.updateMatrixWorld(true);
    // 6. measures
    worldFrame(gun, this.t0);
    out.gripErr = this.t0.p.distanceTo(gT.p);
    out.reachR = rr.reachError;
    out.reachL = rl.reachError;
    out.leftErr = this.leftError(gun, h.geom);
    // the wrists against an authored hold: the clip's on a long-gun pose, else the reference's
    out.bendL = this.swing(b.lHand, this.q0.slerpQuaternions(this.refHandL, this.clipHandL, s), true);
    out.bendR = this.swing(b.rHand, this.q0.slerpQuaternions(this.refHandR, this.clipHandR, sGun), false);
    // an elbow pop: the elbow jumps (> 6 cm relative to its shoulder in one frame) while the wrist
    // barely moves (< 2 cm): the arm flipped through to another bend instead of following the hand
    const pop = (shoulder: Vector3, elbow: Object3D, hand: Object3D, prevE: Vector3, prevW: Vector3) => {
      const e = elbow.getWorldPosition(this.v0).sub(shoulder);
      const w = hand.getWorldPosition(this.v1).sub(shoulder);
      const popped = this.popInit && e.distanceTo(prevE) > 0.06 && w.distanceTo(prevW) < 0.02;
      prevE.copy(e);
      prevW.copy(w);
      return popped;
    };
    out.flipR = pop(b.rArm.getWorldPosition(this.pr), b.rFore, b.rHand, this.prevER, this.prevWR);
    out.flipL = pop(b.lArm.getWorldPosition(this.pl), b.lFore, b.lHand, this.prevEL, this.prevWL);
    this.popInit = true;
    return out;
  }
}
