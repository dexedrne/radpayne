// Room 4, the service elevator (round-3 plan section 2). The car never moves in the sim: it is a static
// box room, and the ride is a script in the room settings (Data {room: {ride}}) that this steps on world
// time. Legs run by the clock (the view scrolls the shaft past the gates); a stop opens the doors on one
// side of the car (their colliders go out of the world, as the breach door's does) onto that side's
// landing, wakes its gang, and closes them again once that gang is down and he is back in the car.
//   leg:  { t: seconds, roof?: s (the heavy on the roof: the thud, the hatch's tell, the drop), group?:
//           the group that drops in (the leg waits for it), cables?: s (the snap, the fall, the brakes) }
//   stop: { stop: id, side, doors: [collider node ids], groups: [groups to clear; the first comes in when
//           the doors open, later ones by their own triggers], slow?: true (the door beat), pry?: s (forced
//           open from outside, slowly), alert?: true (they know he is coming), checkpoint?: marker id,
//           last?: true (the doors stay open: the room's exit is out there), waves?: [{ group, after?: s (after
//           the doors start to open), down?: N (once N of this stop's hostiles are down; whichever comes
//           first), hatch?: true (she drops through the car's roof hatch) }] }
// Each stop saves a checkpoint (Resume.ride): a retry starts at that stop, the car just arriving.
import { alertGoon, setState } from "../ai/goon.ts";
import type { Game } from "./game.ts";
import type { Fnv1a } from "./math.ts";
import { DT, RIDE } from "./tuning.ts";

export type RideLeg = { t: number; roof?: number; group?: string; cables?: number };
/** A wave at a stop: a group brought in by the clock (after the doors start to open) or by the stop's
 *  losses, whichever comes first; `hatch`: its one hostile drops through the car's roof hatch. */
export type RideWave = { group: string; after?: number; down?: number; hatch?: boolean };
export type RideStop = { stop: string; side: string; doors: string[]; groups: string[]; slow?: boolean; pry?: number; alert?: boolean; checkpoint?: string; last?: boolean; waves?: RideWave[] };
export type RideSettings = { car: [number, number, number, number]; hatch?: [number, number]; steps: Array<RideLeg | RideStop> };
export type RidePhase = "leg" | "arrive" | "opening" | "open" | "closing";

export const isStop = (s: RideLeg | RideStop | undefined): s is RideStop => !!s && typeof (s as RideStop).stop === "string";

export class Ride {
  readonly steps: Array<RideLeg | RideStop>;
  /** The car's floor rectangle (x0, z0, x1, z1) and the roof hatch (x, z). */
  readonly car: [number, number, number, number];
  readonly hatch: [number, number];
  /** The step the ride is on, its phase and the world seconds in that phase. */
  i = 0;
  phase: RidePhase = "leg";
  t = 0;
  /** The stop's doors: 0 shut .. 1 open (the view slides them). */
  open = 0;
  /** A leg's beats done: 1 roof thud, 2 hatch, 4 cables, 8 drop, 16 brake. */
  beats = 0;
  /** The roof heavy falling through the hatch (enemy index, -1 none) and his fall speed. */
  dropping = -1;
  vy = 0;
  /** Real seconds he has stood outside a finished stop; the "back in the car" hint given. */
  out = 0;
  backSaid = false;
  /** The first step has run (the "start" event: the gate rattles shut, the car sets off). */
  started = false;
  /** The open stop's doors are out of the world (at RIDE.gap of their travel: the gap is wide enough). */
  through = false;
  /** World seconds since this stop's doors started to open (-1: not yet), and its waves brought in (bits). */
  since = -1;
  waved = 0;

  constructor(g: Game, s: RideSettings) {
    this.steps = Array.isArray(s.steps) ? s.steps : [];
    this.car = s.car ?? [-3, -3, 3, 3];
    this.hatch = s.hatch ?? [0, 0];
    this.enter(g, 0, false);
  }

  get cur(): RideLeg | RideStop | undefined {
    return this.steps[this.i];
  }

  /** The stop the car is at (or null on a leg). */
  get stop(): RideStop | null {
    const s = this.cur;
    return isStop(s) ? s : null;
  }

  /** A checkpoint retry: the car arrives at that stop again (its dead stay dead). */
  resumeAt(i: number): void {
    this.i = Math.max(0, Math.min(this.steps.length - 1, i));
    this.phase = isStop(this.cur) ? "arrive" : "leg";
    this.t = 0;
    this.open = 0;
    this.beats = 0;
    this.out = 0;
    this.backSaid = false;
    this.through = false;
    this.started = true;
    this.since = -1;
    this.waved = 0;
    this.hatchGroup = "";
  }

  /** Inside the car's floor, at least `margin` m from its walls. */
  inCar(x: number, z: number, margin: number = RIDE.inside): boolean {
    const [x0, z0, x1, z1] = this.car;
    return x > x0 + margin && x < x1 - margin && z > z0 + margin && z < z1 - margin;
  }

  /** The stop is done with and he is still outside: the car waits for him (the bot walks back in). */
  wantsIn(g: Game): boolean {
    const s = this.stop;
    return !!s && !s.last && this.phase === "open" && !this.inCar(g.player.x, g.player.z) && s.groups.every(gr => this.groupDown(g, gr));
  }

  /** The shaft's speed past the gates (m/s; negative = the car falls): the view scrolls it. */
  scroll(): number {
    const s = this.cur;
    if (!s || isStop(s)) return 0;
    if (s.cables !== undefined) {
      const drop = s.cables + RIDE.dropAfter;
      if (this.t >= drop && this.t < drop + RIDE.drop) return -9;
      if (this.t >= drop + RIDE.drop) return 0;
    }
    // ease out of the stop and into the next one
    const up = Math.min(1, this.t / 2), down = Math.min(1, Math.max(0, (s.t - this.t) / 2));
    return 1.6 * Math.min(up, down <= 0 ? 0 : down);
  }

  private enter(g: Game, i: number, emit = true): void {
    this.i = i;
    this.t = 0;
    this.open = 0;
    this.beats = 0;
    this.out = 0;
    this.backSaid = false;
    this.through = false;
    this.since = -1;
    this.waved = 0;
    this.hatchGroup = "";
    const s = this.cur;
    if (!s) return;
    if (isStop(s)) {
      this.phase = "arrive";
      if (emit) g.emit({ type: "ride", what: "arrive", stop: s.stop, side: s.side });
      if (s.checkpoint) g.checkpointAt(s.checkpoint);
    } else {
      this.phase = "leg";
      if (emit) g.emit({ type: "ride", what: i === 0 ? "start" : "depart" });
    }
  }

  private groupDown(g: Game, group: string): boolean {
    let n = 0;
    for (const e of g.enemies) if (e.group === group) { n++; if (e.state !== "dead" && !e.fled) return false; }
    return n > 0;
  }

  private spawn(g: Game, group: string, alert: boolean): void {
    for (const e of g.enemies) {
      if (e.state !== "inactive" || e.group !== group || e.fled) continue;
      setState(e, "idle");
      e.hit.hittable = true;
      if (alert) alertGoon(g, e, 0.3 + 0.4 * g.rng.next());
    }
  }

  step(g: Game, dt: number): void {
    // the roof heavy falls through the hatch and lands in a crouch
    if (this.dropping >= 0) {
      const e = g.enemies[this.dropping];
      if (!e || e.state === "dead") this.dropping = -1;
      else {
        this.vy -= RIDE.gravity * dt;
        e.y += this.vy * dt;
        const floor = g.world.groundBelow(e.x, e.z, 0.3, 0.4);
        const fy = Number.isFinite(floor) ? floor : 0;
        if (e.y <= fy) {
          e.y = fy;
          this.dropping = -1;
          g.emit({ type: "ride", what: "land" });
        }
        g.syncEnemyPose(e);
      }
    }
    if (!this.started) { this.started = true; if (!isStop(this.cur)) g.emit({ type: "ride", what: "start" }); }
    const s = this.cur;
    if (!s) return;
    this.t += dt;
    if (!isStop(s)) {
      if (s.roof !== undefined) {
        if (!(this.beats & 1) && this.t >= s.roof) { this.beats |= 1; g.emit({ type: "ride", what: "roof" }); }
        if (!(this.beats & 2) && this.t >= s.roof + RIDE.hatchTell) { this.beats |= 2; this.hatchDrop(g, s.group ?? ""); }
      }
      if (s.cables !== undefined) {
        if (!(this.beats & 4) && this.t >= s.cables) { this.beats |= 4; g.music = "elevatorWarped"; g.emit({ type: "ride", what: "cables" }); }
        if (!(this.beats & 8) && this.t >= s.cables + RIDE.dropAfter) { this.beats |= 8; g.emit({ type: "ride", what: "drop" }); }
        if (!(this.beats & 16) && this.t >= s.cables + RIDE.dropAfter + RIDE.drop) { this.beats |= 16; g.music = "elevatorDead"; g.emit({ type: "ride", what: "brake" }); }
      }
      const waiting = (s.roof !== undefined && !(this.beats & 2)) || (!!s.group && !this.groupDown(g, s.group));
      if (this.t >= s.t && !waiting) this.enter(g, this.i + 1);
      return;
    }
    if (this.since >= 0) { this.since += dt; this.stepWaves(g, s); }
    switch (this.phase) {
      case "arrive":
        if (this.t < RIDE.arrive) return;
        this.phase = "opening";
        this.t = 0;
        this.since = 0;
        if (s.groups[0]) this.spawn(g, s.groups[0], !!s.alert);
        g.emit({ type: "ride", what: "open", stop: s.stop, side: s.side, ...(s.pry ? { pry: true } : {}) });
        return;
      case "opening": {
        const dur = s.pry ?? RIDE.open;
        this.open = Math.min(1, this.t / dur);
        // the gap is wide enough to shoot (and walk) through: the doors leave the world, the door beat
        if (!this.through && this.open >= RIDE.gap) {
          this.through = true;
          for (const d of s.doors) g.world.setEnabled(d, false);
          if (s.slow) g.slowFor(RIDE.doorSlowReal, RIDE.doorSlow);
        }
        if (this.t < dur) return;
        this.open = 1;
        this.phase = "open";
        this.t = 0;
        return;
      }
      case "open": {
        if (s.last) return;
        const clear = s.groups.every(gr => this.groupDown(g, gr));
        if (!clear) return;
        const p = g.player;
        if (p.mode === "dead") return;
        if (!this.inCar(p.x, p.z)) {
          this.out += DT;
          if (this.out >= RIDE.backHint && !this.backSaid) { this.backSaid = true; g.emit({ type: "ride", what: "back" }); }
          return;
        }
        for (const d of s.doors) g.world.setEnabled(d, true);
        this.through = false;
        this.phase = "closing";
        this.t = 0;
        g.emit({ type: "ride", what: "close", stop: s.stop, side: s.side });
        return;
      }
      case "closing":
        this.open = Math.max(0, 1 - this.t / RIDE.close);
        if (this.t >= RIDE.close) this.enter(g, this.i + 1);
        return;
    }
  }

  /** A stop's waves (RideWave): each once, when its clock or its count of the stop's losses comes up. */
  private stepWaves(g: Game, s: RideStop): void {
    const waves = s.waves;
    if (!waves?.length) return;
    let down = -1;
    for (let i = 0; i < waves.length; i++) {
      if (this.waved & (1 << i)) continue;
      const w = waves[i];
      if (w.down !== undefined && down < 0) {
        down = 0;
        for (const e of g.enemies) if (s.groups.includes(e.group) && e.state === "dead") down++;
      }
      if (!((w.after !== undefined && this.since >= w.after) || (w.down !== undefined && down >= w.down))) continue;
      // (one drop through the hatch at a time: a second waits for the first to land)
      if (w.hatch && (this.dropping >= 0 || this.hatchGroup)) continue;
      this.waved |= 1 << i;
      if (w.hatch) {
        // the thud on the roof, the hatch's tell, then she drops in
        this.hatchGroup = w.group;
        this.hatchT = RIDE.hatchTell;
        g.emit({ type: "ride", what: "roof" });
      } else {
        this.spawn(g, w.group, true);
        g.emit({ type: "trigger", id: `wave-${w.group}`, action: "spawn", group: w.group });
      }
    }
    if (this.hatchGroup) {
      this.hatchT -= DT * g.timeScale;
      if (this.hatchT <= 0) { this.hatchDrop(g, this.hatchGroup); this.hatchGroup = ""; }
    }
  }
  /** A wave's drop through the hatch waiting on its tell (the group, world s left). */
  private hatchGroup = "";
  private hatchT = 0;

  /** The hatch gives: the leg's heavy drops in over the hatch, facing the player, and lands in a crouch
   *  (a stagger for the fall and RIDE.land: no firing). */
  private hatchDrop(g: Game, group: string): void {
    g.emit({ type: "ride", what: "hatch" });
    const e = g.enemies.find(k => k.group === group && k.state === "inactive" && !k.fled);
    if (!e) return;
    const p = g.player;
    e.x = this.hatch[0];
    e.z = this.hatch[1];
    e.y = RIDE.hatchY;
    e.facing = Math.atan2(p.x - e.x, p.z - e.z);
    setState(e, "alert");
    e.react = 0.25;
    e.deaf = false;
    e.hit.hittable = true;
    e.stagger = Math.sqrt((2 * RIDE.hatchY) / RIDE.gravity) + RIDE.land;
    // (a goon or a rusher has no stagger: she waits out the fall in her alert)
    if (e.kind !== "heavy") e.react = e.stagger * 0.8;
    this.dropping = e.idx;
    this.vy = 0;
    g.syncEnemyPose(e);
  }

  hashInto(h: Fnv1a): void {
    h.i32(this.i).str(this.phase).f64(this.t).f64(this.open).i32(this.beats).i32(this.dropping).f64(this.vy).f64(this.out).i32(this.through ? 1 : 0).f64(this.since).i32(this.waved).str(this.hatchGroup).f64(this.hatchT);
  }
}
