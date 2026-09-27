// Aim assist, for the gamepad only (the mouse never gets it): near a living hostile the right stick
// slows down (friction), and while he aims (L2, or R2 held) the aim drifts lightly toward her torso
// (a pull, never a snap). Only a target the crosshair's pivot can see: never through a wall, never the
// dead, the fled or a group still waiting unseen, never the crowd. It reads the game and changes only
// the latch's yaw / pitch, which go into the input frame like any stick motion: a recorded log replays
// the same without it.
import { HB_TORSO, aimPoint, makeCapsules } from "../combat/hitboxes.ts";
import { wrapAngle } from "../sim/aim.ts";
import { pivotOf } from "../sim/player.ts";
import type { Game } from "../sim/game.ts";

export type AssistLevel = "off" | "low" | "normal";

export const ASSIST = {
  /** slow: the stick's speed drops by up to this share on the target; pull: share of the error closed per second at full aim. */
  low: { slow: 0.3, pull: 1.1 },
  normal: { slow: 0.5, pull: 2.2 },
  /** The zone around her torso (m), as an angle: never under minDeg or over maxDeg. */
  radius: 1.1,
  minDeg: 1.5,
  maxDeg: 7,
  /** No assist past this (m). */
  range: 60,
} as const;

export type AssistTarget = { enemy: number; dyaw: number; dpitch: number; err: number; radius: number };

export type AssistScratch = { caps: ReturnType<typeof makeCapsules>; v: { x: number; y: number; z: number }; piv: { x: number; y: number; z: number } };
export const assistScratch = (): AssistScratch => ({ caps: makeCapsules(), v: { x: 0, y: 0, z: 0 }, piv: { x: 0, y: 0, z: 0 } });

/** The hostile nearest the crosshair inside her zone, in plain sight from the aim pivot; null if none. */
export function assistTarget(g: Game, yaw: number, pitch: number, s: AssistScratch = assistScratch()): AssistTarget | null {
  if (g.phase !== "play" && g.phase !== "clear") return null;
  const p = g.player;
  if (p.mode === "dead" || p.health <= 0) return null;
  const piv = pivotOf(p, s.piv, g.world);
  const cp = Math.cos(pitch);
  let best: AssistTarget | null = null, bestK = Infinity;
  for (const e of g.enemies) {
    if (e.state === "dead" || e.state === "inactive" || e.state === "flee" || e.fled || e.hp <= 0) continue;
    if (!aimPoint(e.hit.body, e.hit.pose, HB_TORSO, s.v, s.caps)) continue;
    const dx = s.v.x - piv.x, dy = s.v.y - piv.y, dz = s.v.z - piv.z;
    const flat = Math.hypot(dx, dz), dist = Math.hypot(flat, dy);
    if (dist < 0.5 || dist > ASSIST.range) continue;
    const dyaw = wrapAngle(Math.atan2(-dx, -dz) - yaw);
    const dpitch = Math.atan2(dy, flat) - pitch;
    const err = Math.hypot(dyaw * cp, dpitch);
    const radius = Math.min(ASSIST.maxDeg, Math.max(ASSIST.minDeg, (Math.atan(ASSIST.radius / dist) * 180) / Math.PI)) * (Math.PI / 180);
    if (err > radius || err / radius >= bestK) continue;
    // in plain sight: any box between (a wall, a crate, a closed door) and she is not a target
    if (!g.world.clear(piv.x, piv.y, piv.z, s.v.x, s.v.y, s.v.z, false)) continue;
    best = { enemy: e.idx, dyaw, dpitch, err, radius };
    bestK = err / radius;
  }
  return best;
}

/**
 * What the assist does this frame: `slow` multiplies the stick's look speed; (dyaw, dpitch) is the pull,
 * added to the aim. `aiming` 0..1 (L2's pull, or R2 held); `dt` real seconds.
 */
export function assistStep(level: AssistLevel, t: AssistTarget | null, aiming: number, dt: number): { slow: number; dyaw: number; dpitch: number } {
  if (!t || level === "off") return { slow: 1, dyaw: 0, dpitch: 0 };
  const L = ASSIST[level];
  const k = 1 - t.err / t.radius; // 0 at the zone's edge, 1 on her
  const slow = 1 - L.slow * k;
  const f = aiming > 0 ? Math.min(0.5, L.pull * aiming * (0.35 + 0.65 * k) * dt) : 0;
  return { slow, dyaw: t.dyaw * f, dpitch: t.dpitch * f };
}
