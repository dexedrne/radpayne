// One bullet line against the world boxes and the actors' hit skeletons. Hitscan traces the whole line
// at once; a bullet-time projectile traces the piece it covers each step, so a projectile through a
// still scene lands exactly where the hitscan would (test/projectile.test.ts).
import type { World, RayHit } from "../sim/world.ts";
import { makeCapsules, poseHitboxes, rayPose, type BodyType, type Capsule, type Pose } from "./hitboxes.ts";

export type HitActor = {
  body: BodyType;
  pose: Pose;
  /** Scratch capsules, refreshed by the trace. */
  caps: Capsule[];
  /** Dead / inactive actors are skipped. */
  hittable: boolean;
  /** Team: bullets only hit the other team. */
  team: 0 | 1;
};

export function makeHitActor(body: BodyType, team: 0 | 1): HitActor {
  return { body, pose: { x: 0, y: 0, z: 0, yaw: 0, stance: "stand", lean: 0, lieH: 0.4 }, caps: makeCapsules(), hittable: true, team };
}

export const HIT_NONE = 0;
export const HIT_WORLD = 1;
export const HIT_ACTOR = 2;

export type TraceHit = {
  kind: number;
  t: number;
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  /** Actor index into the list passed in (-1 for the world). */
  actor: number;
  part: number;
  surface: string;
};

export const makeTraceHit = (): TraceHit => ({ kind: HIT_NONE, t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, actor: -1, part: -1, surface: "" });

const wHit: RayHit = { t: 0, box: null, nx: 0, ny: 0, nz: 0 };
const aHit = { t: 0, part: -1 };

/**
 * Trace o + t d (|d| = 1) for t in [0, maxT]. `team` = the shooter's team (its own team is skipped).
 * Returns the nearest hit (kind HIT_NONE and t = maxT when nothing was hit).
 */
export function trace(world: World, actors: readonly HitActor[], team: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out: TraceHit): TraceHit {
  out.kind = HIT_NONE;
  out.t = maxT;
  out.actor = -1;
  out.part = -1;
  out.surface = "";
  out.nx = out.ny = out.nz = 0;
  const w = world.raycast(ox, oy, oz, dx, dy, dz, maxT, true, wHit);
  if (w) {
    out.kind = HIT_WORLD;
    out.t = w.t;
    out.nx = w.nx; out.ny = w.ny; out.nz = w.nz;
    out.surface = w.box?.surface ?? "ground";
  }
  for (let i = 0; i < actors.length; i++) {
    const a = actors[i];
    if (!a.hittable || a.team === team) continue;
    // broad phase: a 1.3 m sphere around the body centre
    const p = a.pose;
    const cx = p.x - ox, cy = p.y + 0.9 - oy, cz = p.z - oz;
    const along = cx * dx + cy * dy + cz * dz;
    if (along < -1.5 || along > out.t + 1.5) continue;
    const px = cx - along * dx, py = cy - along * dy, pz = cz - along * dz;
    if (px * px + py * py + pz * pz > 1.3 * 1.3) continue;
    if (!poseHitboxes(a.body, p, a.caps)) continue;
    if (rayPose(ox, oy, oz, dx, dy, dz, out.t, a.caps, aHit)) {
      out.kind = HIT_ACTOR;
      out.t = aHit.t;
      out.actor = i;
      out.part = aHit.part;
      out.surface = "flesh";
      out.nx = -dx; out.ny = -dy; out.nz = -dz;
    }
  }
  out.x = ox + dx * out.t;
  out.y = oy + dy * out.t;
  out.z = oz + dz * out.t;
  return out;
}
