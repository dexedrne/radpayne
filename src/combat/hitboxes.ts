// Hit skeletons: a head sphere, a torso capsule and two leg capsules per actor, placed from the rig's
// bone positions (Head, Spine/neck, Hips, legs) in a handful of deterministic poses. The sim never
// reads the rendered skeleton (replays must not depend on the frame rate); instead the view scales and
// poses each model so its bones sit on these points (?hitboxes draws both to check).
//
// Numbers are metres in the actor's local frame: x = side, y = up from the feet, z = forward.
//  Radbro (RadRun rig, 24 bones): Hips 0.75, Spine 1.03, Head bone 1.15, head_end 1.68 -> a big head.
//  Milady (Pockit VRM, scaled so the Head bone sits at MILADY_HEAD_BONE): Hips ~1.05, neck ~1.52.

export type BodyType = "radbro" | "milady";
export type Stance = "stand" | "crouch" | "dive" | "prone" | "dead";

export const MILADY_HEAD_BONE = 1.6;

export const HB_HEAD = 0;
export const HB_TORSO = 1;
export const HB_LEG_L = 2;
export const HB_LEG_R = 3;
export const HB_COUNT = 4;
export const HB_NAMES = ["head", "torso", "legL", "legR"] as const;
/** Damage multiplier per hitbox (spec: headshots x3). */
export const HB_MULT = [3, 1, 0.75, 0.75] as const;

type Seg = { a: [number, number, number]; b: [number, number, number]; r: number };
type Skeleton = { stand: Seg[]; crouch: Seg[]; /** lying along +z from the hips, y = 0 axis */ lying: Seg[] };

const sph = (p: [number, number, number], r: number): Seg => ({ a: p, b: p, r });
const cap = (a: [number, number, number], b: [number, number, number], r: number): Seg => ({ a, b, r });

export const SKELETONS: Record<BodyType, Skeleton> = {
  radbro: {
    stand: [sph([0, 1.4, 0.03], 0.27), cap([0, 0.8, 0], [0, 1.06, 0], 0.2), cap([0.1, 0.12, 0], [0.09, 0.66, 0], 0.11), cap([-0.1, 0.12, 0], [-0.09, 0.66, 0], 0.11)],
    crouch: [sph([0, 1.02, 0.14], 0.27), cap([0, 0.5, 0], [0, 0.74, 0.08], 0.2), cap([0.12, 0.1, 0.16], [0.1, 0.44, 0], 0.11), cap([-0.12, 0.1, 0.16], [-0.1, 0.44, 0], 0.11)],
    lying: [sph([0, 0, 0.78], 0.27), cap([0, 0, 0], [0, 0, 0.34], 0.2), cap([0.1, 0, -0.08], [0.1, 0, -0.66], 0.11), cap([-0.1, 0, -0.08], [-0.1, 0, -0.66], 0.11)],
  },
  milady: {
    stand: [sph([0, 1.74, 0.02], 0.17), cap([0, 1.0, 0], [0, 1.44, 0], 0.19), cap([0.1, 0.1, 0], [0.1, 0.95, 0], 0.1), cap([-0.1, 0.1, 0], [-0.1, 0.95, 0], 0.1)],
    crouch: [sph([0, 1.14, 0.14], 0.17), cap([0, 0.6, 0], [0, 0.98, 0.1], 0.19), cap([0.12, 0.1, 0.18], [0.1, 0.56, 0], 0.1), cap([-0.12, 0.1, 0.18], [-0.1, 0.56, 0], 0.1)],
    lying: [sph([0, 0, 0.72], 0.17), cap([0, 0, 0], [0, 0, 0.44], 0.19), cap([0.1, 0, -0.05], [0.1, 0, -0.85], 0.1), cap([-0.1, 0, -0.05], [-0.1, 0, -0.85], 0.1)],
  },
};

/** Where an actor's hit skeleton is this step. */
export type Pose = {
  x: number;
  y: number;
  z: number;
  /** Facing (three.js rotation.y; +Z forward at 0). */
  yaw: number;
  stance: Stance;
  /** Peek lean -1..1 along local x (head and chest lean out of high cover). */
  lean: number;
  /** Lying poses: body axis height above y. */
  lieH: number;
};

export type Capsule = { ax: number; ay: number; az: number; bx: number; by: number; bz: number; r: number };

export function makeCapsules(): Capsule[] {
  return Array.from({ length: HB_COUNT }, () => ({ ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r: 0 }));
}

/** World-space hit capsules for a pose (a sphere is a capsule with a == b). Returns false for dead. */
export function poseHitboxes(body: BodyType, p: Pose, out: Capsule[]): boolean {
  if (p.stance === "dead") return false;
  const sk = SKELETONS[body];
  const lying = p.stance === "dive" || p.stance === "prone";
  const segs = lying ? sk.lying : p.stance === "crouch" ? sk.crouch : sk.stand;
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  for (let i = 0; i < HB_COUNT; i++) {
    const g = segs[i], o = out[i];
    let ax = g.a[0], ay = g.a[1], az = g.a[2], bx = g.b[0], by = g.b[1], bz = g.b[2];
    if (lying) { ay += p.lieH; by += p.lieH; }
    else if (p.lean !== 0) {
      // lean the upper body sideways: the head fully, the torso top by 70 %
      const k = p.lean * 0.34;
      if (i === HB_HEAD) { ax += k; bx += k; }
      else if (i === HB_TORSO) bx += k * 0.7;
    }
    o.ax = p.x + ax * c + az * s; o.ay = p.y + ay; o.az = p.z - ax * s + az * c;
    o.bx = p.x + bx * c + bz * s; o.by = p.y + by; o.bz = p.z - bx * s + bz * c;
    o.r = g.r;
  }
  return true;
}

/** Point an attacker aims at (chest or head centre) for a pose. */
export function aimPoint(body: BodyType, p: Pose, part: number, out: { x: number; y: number; z: number }, scratch: Capsule[]): boolean {
  if (!poseHitboxes(body, p, scratch)) return false;
  const h = scratch[part];
  out.x = (h.ax + h.bx) / 2; out.y = (h.ay + h.by) / 2; out.z = (h.az + h.bz) / 2;
  return true;
}

/**
 * Ray (o + t d, |d| = 1) against a capsule; returns the entry t or -1. Spheres are capsules with a == b.
 * (Segment-ray closest approach, then the sphere at the closest segment point; exact for spheres and
 * the cylinder part, and conservative at the caps.)
 */
export function rayCapsule(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, c: Capsule): number {
  const bax = c.bx - c.ax, bay = c.by - c.ay, baz = c.bz - c.az;
  const oax = ox - c.ax, oay = oy - c.ay, oaz = oz - c.az;
  const baba = bax * bax + bay * bay + baz * baz;
  const r2 = c.r * c.r;
  if (baba < 1e-10) return raySphere(oax, oay, oaz, dx, dy, dz, r2);
  const bard = bax * dx + bay * dy + baz * dz;
  const baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = dx * oax + dy * oay + dz * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz;
  const a = baba - bard * bard;
  const b = baba * rdoa - baoa * bard;
  const cc = baba * oaoa - baoa * baoa - r2 * baba;
  const h = b * b - a * cc;
  if (h >= 0 && a > 1e-12) {
    const t = (-b - Math.sqrt(h)) / a;
    const y = baoa + t * bard;
    if (y > 0 && y < baba && t >= 0) return t; // body
  }
  // caps
  const t0 = raySphere(oax, oay, oaz, dx, dy, dz, r2);
  const t1 = raySphere(ox - c.bx, oy - c.by, oz - c.bz, dx, dy, dz, r2);
  if (t0 < 0) return t1;
  if (t1 < 0) return t0;
  return t0 < t1 ? t0 : t1;
}

function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, r2: number): number {
  const b = ox * dx + oy * dy + oz * dz;
  const c = ox * ox + oy * oy + oz * oz - r2;
  const h = b * b - c;
  if (h < 0) return -1;
  const t = -b - Math.sqrt(h);
  if (t >= 0) return t;
  return c <= 0 ? 0 : -1; // origin inside
}

/** Nearest hitbox of a pose along a ray: writes {t, part}; returns false on a miss. */
export function rayPose(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, caps: Capsule[], out: { t: number; part: number }): boolean {
  let best = maxT, part = -1;
  for (let i = 0; i < HB_COUNT; i++) {
    const t = rayCapsule(ox, oy, oz, dx, dy, dz, caps[i]);
    // the head (tested first) keeps near-ties with the torso it overlaps: a shot through the face is a headshot
    if (t >= 0 && t < best - (part === HB_HEAD ? 0.05 : 0)) {
      best = t;
      part = i;
    }
  }
  if (part < 0) return false;
  out.t = best;
  out.part = part;
  return true;
}
