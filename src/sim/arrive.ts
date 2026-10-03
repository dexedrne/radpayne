// Chapter 2's arrivals: how the gang a spawn trigger brings in (a wave, the helicopter's rope drops)
// comes into the room, and the rule every way in (the vault's lifts too: ch2/vault.ts) answers to.
//  - The rule (arrivalOk, numbers in tuning2.ts ARRIVE): she comes in at least ARRIVE.minDist from him;
//    never inside or next to his cover zone (coverZone: the cover he is in and any he could reach in a
//    step); never behind his back at close range (more than ARRIVE.backAngle off his aim, or on his side
//    of the cover he is in, closer than ARRIVE.backDist). By a door, a stair or the far end of a bridge (her own spot or a named way) she
//    also never comes in where he would watch her appear (inSight: on screen, in the open); the
//    helicopter's ropes and the vault's lifts show their arrivals (the rope, the lift's lamp and door).
//    Only when the room has stood empty of the gang for ARRIVE.sightWait with her waiting does the sight
//    part give way (the rest of the rule never does).
//  - The ways in: each girl's own spot (her marker, inside a door, a stair, a lift: "self"), the room's
//    named ways (room.arrive.ways: {name: [[x, y, z], ...]}, slots inside a doorway) and the stage's own
//    (the roof's ropes: Stage.waySlots / wayReady / bring). A group lists the ways it may use, in order
//    (room.arrive.groups: {group: ["self", "machine", ...]}; a group not listed has "self" only): when
//    the first fails the rule now, she takes the next, else she waits until one passes.
//  - The trickle: one at a time, ARRIVE.gap world seconds apart, and only while fewer than ARRIVE.maxUp of
//    the gang are standing (the room's own girls count).
// Deterministic (part of hash()); a checkpoint's resume queues the living girls of the waves it had
// brought in again (they come in by the rule from where he stands then).
import type { Enemy } from "./actors.ts";
import type { Game } from "./game.ts";
import type { Fnv1a } from "./math.ts";
import type { RayHit } from "./world.ts";
import { segLive, type CoverSeg } from "./cover.ts";
import { pivotOf } from "./player.ts";
import { SHOULDER } from "./aim.ts";
import { alertGoon, setState } from "../ai/goon.ts";
import { ARRIVE, perDiff } from "./tuning2.ts";

export type Slot = [number, number, number];
/** A stretch of a cover segment (its standing line from a to b) on floor y. */
export type ZonePart = { ax: number; az: number; bx: number; bz: number; y: number };

/** His cover zone: the stretch of the cover he is in round his spot, and of every live cover on his floor
 *  within a step of him (each `ARRIVE.step` either side of the nearest point). */
export function coverZone(g: Game, out: ZonePart[] = []): ZonePart[] {
  out.length = 0;
  const p = g.player;
  for (let i = 0; i < g.cover.length; i++) {
    const s = g.cover[i];
    if (Math.abs(s.y - p.y) > 0.7 || !segLive(g.world, s)) continue;
    const u0 = i === p.cover ? p.coverU : Math.max(0, Math.min(s.len, (p.x - s.ax) * s.tx + (p.z - s.az) * s.tz));
    if (i !== p.cover && Math.hypot(s.ax + s.tx * u0 - p.x, s.az + s.tz * u0 - p.z) > ARRIVE.step) continue;
    const a = Math.max(0, u0 - ARRIVE.step), b = Math.min(s.len, u0 + ARRIVE.step);
    out.push({ ax: s.ax + s.tx * a, az: s.az + s.tz * a, bx: s.ax + s.tx * b, bz: s.az + s.tz * b, y: s.y });
  }
  return out;
}

/** Distance on the floor plan from (x, z) to a zone part. */
export function zoneDist(q: ZonePart, x: number, z: number): number {
  const dx = q.bx - q.ax, dz = q.bz - q.az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - q.ax) * dx + (z - q.az) * dz) / l2)) : 0;
  return Math.hypot(q.ax + dx * t - x, q.az + dz * t - z);
}

/** In his cover zone (inside it or next to it: within ARRIVE.zone of it, on its floor). */
export function inCoverZone(zone: readonly ZonePart[], x: number, y: number, z: number): boolean {
  for (const q of zone) if (Math.abs(y - q.y) < 1.5 && zoneDist(q, x, z) < ARRIVE.zone) return true;
  return false;
}

/** Behind his back at close range: closer than ARRIVE.backDist, and more than ARRIVE.backAngle off his
 *  aim or on his side of the cover he is in (the side it does not cover). */
export function behindHim(g: Game, x: number, z: number): boolean {
  const p = g.player;
  const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
  if (d >= ARRIVE.backDist || d < 1e-6) return d < 1e-6;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  if ((fx * dx + fz * dz) / d < Math.cos(ARRIVE.backAngle)) return true;
  const s: CoverSeg | undefined = p.cover >= 0 ? g.cover[p.cover] : undefined;
  return !!s && (s.nx * dx + s.nz * dz) / d > 0.2;
}

const pivTmp = { x: 0, y: 0, z: 0 };
const rayTmp: RayHit = { t: 0, box: null, nx: 0, ny: 0, nz: 0 };
/** Where he would watch her appear: inside ARRIVE.sightCone of his aim as the camera sees it (from behind
 *  his shoulder, pulled in by a wall like the camera), with a clear line (glass and rails let it through)
 *  from the camera or his eye to her head or her middle. */
export function inSight(g: Game, x: number, y: number, z: number): boolean {
  const p = g.player;
  const piv = pivotOf(p, pivTmp, g.world);
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  const h = g.world.raycast(piv.x, piv.y, piv.z, -fx, 0, -fz, SHOULDER.arm, false, rayTmp);
  const arm = h ? Math.max(SHOULDER.minArm, h.t - 0.2) : SHOULDER.arm;
  const cx = piv.x - fx * arm, cz = piv.z - fz * arm;
  const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
  if (d > 1e-6 && (fx * dx + fz * dz) / d < Math.cos(ARRIVE.sightCone)) return false;
  for (const up of ARRIVE.sightAt) {
    if (g.world.clear(cx, piv.y, cz, x, y + up, z, true)) return true;
    if (g.world.clear(piv.x, piv.y, piv.z, x, y + up, z, true)) return true;
  }
  return false;
}

const zoneTmp: ZonePart[] = [];
/** The rule: may one of the gang come in at (x, y, z) now? `unseen`: and not where he would watch her
 *  appear (a door, a stair, a bridge's end, an open lift: inSight). */
export function arrivalOk(g: Game, x: number, y: number, z: number, unseen = false): boolean {
  const p = g.player;
  if (Math.hypot(x - p.x, z - p.z) < ARRIVE.minDist) return false;
  if (behindHim(g, x, z)) return false;
  if (inCoverZone(coverZone(g, zoneTmp), x, y, z)) return false;
  return !unseen || !inSight(g, x, y, z);
}

/** The gang standing in the room now (awake or not; not those still to come in, the dead or the fled). */
export function standing(g: Game): number {
  let n = 0;
  for (const e of g.enemies) if (e.state !== "inactive" && e.state !== "dead" && !e.fled) n++;
  return n;
}

/** Room for one more to come in (fewer than ARRIVE.maxUp standing). */
export function arrivalRoom(g: Game): boolean {
  return standing(g) < perDiff(ARRIVE.maxUp, g.difficulty);
}

/** She comes in at the slot: there, awake, looking for him. */
export function comeIn(g: Game, e: Enemy, slot: Slot): void {
  e.x = slot[0]; e.y = slot[1]; e.z = slot[2];
  e.vx = e.vz = 0;
  e.facing = Math.atan2(g.player.x - e.x, g.player.z - e.z);
  setState(e, "idle");
  e.hit.hittable = true;
  e.deaf = false;
  e.path = []; e.pathI = 0; e.repath = 0;
  g.syncEnemyPose(e);
  alertGoon(g, e, 0.3 + 0.4 * g.rng.next());
}

type Cfg = { ways?: Record<string, number[][]>; groups?: Record<string, string[]> };

export class Arrivals {
  readonly ways = new Map<string, Slot[]>();
  readonly groups = new Map<string, string[]>();
  /** Each girl's own spot (her marker), by enemy index. */
  readonly home: Slot[];
  /** Enemy indices waiting to come in, in the order their waves were called. */
  readonly queue: number[] = [];
  /** World seconds until the next may come in. */
  gap = 0;
  /** World seconds the room has stood empty of the gang with girls waiting (ARRIVE.sightWait). */
  held = 0;
  /** Round robin over each way's slots. */
  private readonly turn = new Map<string, number>();

  constructor(g: Game, cfg: unknown) {
    const c = (cfg && typeof cfg === "object" ? cfg : {}) as Cfg;
    for (const [name, slots] of Object.entries(c.ways ?? {})) this.ways.set(name, slots.map(s => [s[0], s[1], s[2]] as Slot));
    for (const [group, ways] of Object.entries(c.groups ?? {})) this.groups.set(group, [...ways]);
    this.home = g.enemies.map(e => [e.x, e.y, e.z] as Slot);
  }

  /** A wave is called: its girls still to come in join the queue. */
  enqueue(g: Game, group?: string): void {
    for (const e of g.enemies) if (e.state === "inactive" && !e.fled && (!group || e.group === group) && !this.queue.includes(e.idx)) this.queue.push(e.idx);
  }

  /** The ways her group may come in by (in order). */
  waysOf(e: Enemy): string[] {
    return this.groups.get(e.group) ?? ["self"];
  }

  /** Where she would come in now (the first of her ways with a slot that passes the rule), or null (she
   *  waits). A stage's way that needs a moment (the helicopter flying over the pad) holds her for it. */
  pick(g: Game, e: Enemy): { way: string; slot: Slot } | null {
    // (out of his sight by a door, a stair, a bridge: until the room has stood empty a while)
    const unseen = this.held < ARRIVE.sightWait;
    for (const w of this.waysOf(e)) {
      if (w === "self") {
        const h = this.home[e.idx];
        if (arrivalOk(g, h[0], h[1], h[2], unseen)) return { way: w, slot: h };
        continue;
      }
      const own = g.stage?.waySlots?.(w);
      const slots = own ?? this.ways.get(w);
      if (!slots || !slots.length) continue;
      const t = this.turn.get(w) ?? 0;
      let slot: Slot | null = null;
      for (let i = 0; i < slots.length && !slot; i++) { const s = slots[(t + i) % slots.length]; if (arrivalOk(g, s[0], s[1], s[2], unseen && !own)) slot = s; }
      if (!slot) continue;
      if (own) {
        const ready = g.stage?.wayReady?.(g, w) ?? "no";
        if (ready === "no") continue;
        if (ready === "wait") return null;
      }
      return { way: w, slot };
    }
    return null;
  }

  step(g: Game, dt: number): void {
    this.gap = Math.max(0, this.gap - dt);
    this.held = this.queue.length && g.phase === "play" && standing(g) === 0 ? this.held + dt : 0;
    if (!this.queue.length || this.gap > 0 || g.phase !== "play" || g.player.mode === "dead" || !arrivalRoom(g)) return;
    for (let k = 0; k < this.queue.length; k++) {
      const e = g.enemies[this.queue[k]];
      if (!e || e.state !== "inactive" || e.fled) { this.queue.splice(k--, 1); continue; }
      const at = this.pick(g, e);
      if (!at) continue;
      this.queue.splice(k, 1);
      if (at.way !== "self") {
        const slots = g.stage?.waySlots?.(at.way) ?? this.ways.get(at.way)!;
        this.turn.set(at.way, (slots.indexOf(at.slot) + 1) % slots.length);
      }
      if (g.stage?.waySlots?.(at.way)) g.stage.bring!(g, e, at.way, at.slot);
      else comeIn(g, e, at.slot);
      g.emit({ type: "stage", what: "arrive", id: e.idx, x: at.slot[0], z: at.slot[2], group: e.group });
      this.gap = perDiff(ARRIVE.gap, g.difficulty);
      this.held = 0;
      return;
    }
  }

  hashInto(h: Fnv1a): void {
    h.f64(this.gap).f64(this.held).i32(this.queue.length);
    for (const i of this.queue) h.i32(i);
  }
}
