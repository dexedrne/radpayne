// Room 6, the roof in the storm: the helicopter off the edge and its searchlight, and the girls it lowers
// onto the helipad on ropes.
//  - The light patrols its path over the roof until the gang is awake, then follows him, slower than he
//    runs. Standing in it (and in the lamp's line: an overhang or a tall box keeps it off) he is seen by
//    everyone and they aim better (ROOF.accuracy); the first time, the idle gang wakes.
//  - The lamp can be shot out (ROOF.lampHp): the light dies and the helicopter leaves.
//  - Its ropes are ways in for the arrivals (sim/arrive.ts): a group whose ways name a drop zone comes
//    down on ropes from the helicopter over it, one girl at a time by the arrivals' rule (no zone near
//    him or behind him: the helicopter takes the girls to the other zone, or holds them). It flies over
//    the zone first ("wait" until it is there); each girl is lowered from ROOF.ropeY at ROOF.ropeSpeed
//    (she can be shot on the rope; she cannot shoot until she is down). With the lamp out the helicopter
//    has left: the ropes are no way in, and the group takes its next way (a door).
// Settings: {kind: "roof", heli: [x, y, z] (its hover point), path: [[x, z], ...] (the light's patrol
// loop), ropes: {zone: {at: [x, y, z] (the roof under its hover point), slots: [[x, z], ...]}}}.
import type { Enemy } from "../actors.ts";
import type { Game } from "../game.ts";
import type { Fnv1a } from "../math.ts";
import { setState } from "../../ai/goon.ts";
import { ROOF, perDiff } from "../tuning2.ts";
import type { Stage, StageSettings, StageTarget } from "../stage.ts";

type Zone = { name: string; at: [number, number, number]; slots: Array<[number, number, number]> };

export class Roof implements Stage {
  readonly kind = "roof";
  /** The helicopter (its lamp is at its nose), where it is flying to, and whether it has left. */
  hx: number; hy: number; hz: number;
  tx: number; ty: number; tz: number;
  readonly home: [number, number, number];
  gone = false;
  /** The light's spot on the roof; its patrol leg; he is in it; the lamp's health. */
  lx: number; lz: number;
  leg = 0;
  lit = false;
  litEver = false;
  lamp: number = ROOF.lampHp;
  readonly path: Array<[number, number]>;
  /** The drop zones (the arrivals' rope ways), the one it is asked to fly to (-1: none) and for how long
   *  more (world s), the one it last lowered a girl over and how long it holds there. */
  readonly zones: Zone[];
  want = -1;
  wantT = 0;
  over = -1;
  padT = 0;
  /** Enemies on a rope (index -> the ground under her). */
  readonly roping = new Map<number, number>();

  constructor(g: Game, s: StageSettings) {
    this.home = (s.heli as [number, number, number]) ?? [0, 14, -30];
    [this.hx, this.hy, this.hz] = this.home;
    [this.tx, this.ty, this.tz] = this.home;
    this.path = (s.path as Array<[number, number]>) ?? [[0, 0]];
    [this.lx, this.lz] = this.path[0];
    const ropes = (s.ropes ?? {}) as Record<string, { at: [number, number, number]; slots: Array<[number, number]> }>;
    this.zones = Object.entries(ropes).map(([name, z]) => ({
      name, at: z.at,
      slots: z.slots.map(([x, sz]) => { const gy = g.world.groundBelow(x, sz, 0.3, z.at[1] + 2); return [x, Number.isFinite(gy) ? gy : z.at[1], sz] as [number, number, number]; }),
    }));
  }

  private zoneOf(name: string): number {
    return this.zones.findIndex(z => z.name === name);
  }

  /** Where it hovers to lower girls over a zone. */
  private hover(z: Zone): [number, number, number] {
    return [z.at[0], z.at[1] + ROOF.ropeY + 3.5, z.at[2]];
  }

  waySlots(name: string): Array<[number, number, number]> | null {
    const k = this.zoneOf(name);
    return k < 0 ? null : this.zones[k].slots;
  }

  /** Over that zone now: ready; on its way (or still lowering a girl over the other): wait; gone: no. */
  wayReady(_g: Game, name: string): "ready" | "wait" | "no" {
    const k = this.zoneOf(name);
    if (k < 0 || !this.lightOn) return "no";
    if (this.roping.size > 0 && this.over >= 0 && this.over !== k) return "wait";
    this.want = k;
    this.wantT = 1;
    const [x, y, z] = this.hover(this.zones[k]);
    return Math.hypot(this.hx - x, this.hy - y, this.hz - z) < 1.5 ? "ready" : "wait";
  }

  /** Lower her on a rope at the slot. */
  bring(g: Game, e: Enemy, name: string, slot: [number, number, number]): void {
    const k = this.zoneOf(name);
    const p = g.player;
    const n = this.roping.size;
    e.x = slot[0]; e.z = slot[2]; e.y = slot[1] + ROOF.ropeY + (n % 3) * 0.9;
    e.vx = e.vz = 0;
    setState(e, "alert");
    e.react = (e.y - slot[1]) / ROOF.ropeSpeed + ROOF.ropeWait;
    e.facing = Math.atan2(p.x - e.x, p.z - e.z);
    e.hit.hittable = true;
    e.deaf = false;
    this.roping.set(e.idx, slot[1]);
    g.syncEnemyPose(e);
    if (this.over !== k || this.padT <= 0) g.emit({ type: "stage", what: "drop", x: slot[0], z: slot[2], group: e.group });
    this.over = k;
    this.padT = 4;
  }

  /** The lamp (the helicopter's nose, a little under it). */
  lampAt(): { x: number; y: number; z: number } {
    return { x: this.hx, y: this.hy - 0.9, z: this.hz };
  }

  get lightOn(): boolean {
    return this.lamp > 0 && !this.gone;
  }

  intercept(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): StageTarget | null {
    if (!this.lightOn) return null;
    const c = this.lampAt(), r = ROOF.lampRadius;
    const lx = c.x - ox, ly = c.y - oy, lz = c.z - oz;
    const t = lx * dx + ly * dy + lz * dz;
    if (t < 0) return null;
    const d2 = lx * lx + ly * ly + lz * lz - t * t;
    if (d2 > r * r) return null;
    const th = t - Math.sqrt(r * r - d2);
    return th >= 0 && th <= maxT ? { t: th, kind: "lamp", id: 0 } : null;
  }

  hitTarget(g: Game, _t: StageTarget, _ox: number, _oy: number, _oz: number, damage: number): void {
    if (!this.lightOn) return;
    g.stats.hits++;
    this.lamp -= damage;
    const c = this.lampAt();
    g.emit({ type: "stage", what: "lampHit", x: c.x, y: c.y, z: c.z });
    if (this.lamp <= 0) {
      this.lamp = 0;
      this.lit = false;
      this.leave();
      g.emit({ type: "stage", what: "lampOut", x: c.x, y: c.y, z: c.z });
    }
  }

  private leave(): void {
    this.gone = true;
    // (away over the edge: from the first drop zone out past its hover point)
    const c = this.zones[0]?.at ?? [0, 0, 0];
    this.tx = this.home[0] + (this.home[0] - c[0]) * 3;
    this.ty = this.home[1] + 30;
    this.tz = this.home[2] + (this.home[2] - c[2]) * 3;
  }

  accuracy(_g: Game, _e: Enemy): number {
    return this.lit ? perDiff(ROOF.accuracy, _g.difficulty) : 1;
  }

  step(g: Game, dt: number): void {
    const p = g.player;
    // the helicopter flies to its target: over the zone it lowers girls on, else the one it is asked to
    // fly to, else home
    if (!this.gone) {
      if (this.padT > 0) this.padT = Math.max(0, this.padT - dt);
      if (this.wantT > 0) this.wantT = Math.max(0, this.wantT - dt);
      const holding = this.over >= 0 && (this.roping.size > 0 || this.padT > 0);
      const k = holding ? this.over : this.wantT > 0 ? this.want : -1;
      if (!holding) this.over = -1;
      const want = k >= 0 ? this.hover(this.zones[k]) : this.home;
      this.tx = want[0]; this.ty = want[1]; this.tz = want[2];
    }
    const dx = this.tx - this.hx, dy = this.ty - this.hy, dz = this.tz - this.hz, d = Math.hypot(dx, dy, dz);
    const step = Math.min(d, ROOF.fly * (this.gone ? 1.6 : 1) * dt);
    if (d > 1e-6) { this.hx += (dx / d) * step; this.hy += (dy / d) * step; this.hz += (dz / d) * step; }
    // the light: its patrol until the gang is awake, then after him
    if (this.lightOn) {
      const awake = g.enemies.some(e => e.state !== "idle" && e.state !== "inactive" && e.state !== "dead" && !e.fled);
      let gx: number, gz: number, speed: number;
      if (awake && p.mode !== "dead") { gx = p.x; gz = p.z; speed = perDiff(ROOF.track, g.difficulty); }
      else {
        const [px, pz] = this.path[this.leg % this.path.length];
        if (Math.hypot(px - this.lx, pz - this.lz) < 0.3) this.leg = (this.leg + 1) % this.path.length;
        gx = px; gz = pz; speed = ROOF.patrol;
      }
      const ex = gx - this.lx, ez = gz - this.lz, el = Math.hypot(ex, ez);
      const mv = Math.min(el, speed * dt);
      if (el > 1e-6) { this.lx += (ex / el) * mv; this.lz += (ez / el) * mv; }
      const c = this.lampAt();
      const was = this.lit;
      this.lit = p.mode !== "dead" && Math.hypot(p.x - this.lx, p.z - this.lz) <= ROOF.radius && g.world.clear(c.x, c.y, c.z, p.x, p.y + 1.2, p.z, true);
      if (this.lit && !was) {
        g.emit({ type: "stage", what: "lit", x: p.x, z: p.z });
        if (!this.litEver) {
          this.litEver = true;
          for (const e of g.enemies) if (e.state === "idle") { setState(e, "alert"); e.react = g.diff.reaction + 0.3 * g.rng.next(); g.emit({ type: "alert", enemy: e.idx }); }
        }
      }
    } else this.lit = false;
    // the girls on the ropes
    for (const [i, ground] of this.roping) {
      const e = g.enemies[i];
      if (!e || e.state === "dead") { this.roping.delete(i); continue; }
      e.vx = e.vz = 0;
      e.y = Math.max(ground, e.y - ROOF.ropeSpeed * dt);
      if (e.state !== "alert") setState(e, "alert");
      e.react = Math.max(e.react, (e.y - ground) / ROOF.ropeSpeed + ROOF.ropeWait * 0.5);
      if (e.y <= ground) { this.roping.delete(i); g.emit({ type: "stage", what: "landed", id: i, x: e.x, z: e.z }); }
      g.syncEnemyPose(e);
    }
  }

  onKill(g: Game, e: Enemy): void {
    // shot off her rope: she falls to the pad
    const ground = this.roping.get(e.idx);
    if (ground !== undefined) { this.roping.delete(e.idx); e.y = ground; g.syncEnemyPose(e); }
  }

  save(): number[] {
    return [this.lamp];
  }

  load(g: Game, v: number[]): void {
    if (typeof v[0] === "number") this.lamp = v[0];
    if (this.lamp <= 0) { this.lamp = 0; this.leave(); [this.hx, this.hy, this.hz] = [this.tx, this.ty, this.tz]; }
    void g;
  }

  hashInto(h: Fnv1a): void {
    h.f64(this.hx).f64(this.hy).f64(this.hz).f64(this.lx).f64(this.lz).f64(this.lamp).i32(this.lit ? 1 : 0).i32(this.leg).f64(this.padT).i32(this.roping.size);
    h.i32(this.want).f64(this.wantT).i32(this.over);
  }
}
