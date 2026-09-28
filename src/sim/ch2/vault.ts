// Room 10, the vault: the Countess's fight (her brain is ai/countess.ts); this is the room around her,
// stepped on world time after the enemies:
//  - the phases at COUNTESS.phase2 / phase3 of her health (each change: COUNTESS.shift of no damage),
//    her last stand at COUNTESS.lastStand (she runs for the vault door, the world slows by itself);
//  - the lift doors: each wave's group comes through its door after a lamp over it (the tell), the first
//    batch, then pairs while few of them stand; a wave starts with its phase;
//  - the security beams, from phase 2: a red beam turns about the counting desk, high (chest: dive under
//    it or lie prone) or low (shins: jump it), shown dim and still for the tell first, then sweeping
//    half a turn; tall cover between it and him keeps it off; once per sweep, BEAM.damage;
//  - her fall: the adds still standing run for the lifts (not counted), so the clear is her kill cam.
// Settings: {kind: "vault", center: [x, z], column: r (the desk's radius: no beam inside), radius: R
// (the beams' reach), deskR: her walk on the desk, door: [x, z] (the vault door), floorY, waves:
// [{group, door: collider node id, phase}]}.
import type { Enemy } from "../actors.ts";
import type { Game } from "../game.ts";
import type { Fnv1a } from "../math.ts";
import { HB_HEAD } from "../../combat/hitboxes.ts";
import { alertGoon, goToCover, setState } from "../../ai/goon.ts";
import { startRush } from "../../ai/rusher.ts";
import { BEAM, COUNTESS, perDiff } from "../tuning2.ts";
import type { Stage, StageBoss, StageHint, StageSettings } from "../stage.ts";

type Wave = { group: string; door: string; phase: number; lamp: number; lit: boolean; queue: number[]; next: number; x: number; z: number; ox: number; oz: number };
/** 0 off, 1 the tell, 2 sweeping. `a` the angle now (0 = +Z, like facing), dir +-1, high or low. */
export type Beam = { state: number; t: number; a0: number; a: number; dir: number; high: boolean; hit: boolean; dur: number };

const TAU = Math.PI * 2;

export class Vault implements Stage {
  readonly kind = "vault";
  readonly idx: number;
  readonly center: [number, number];
  readonly column: number;
  readonly radius: number;
  readonly deskR: number;
  readonly door: [number, number];
  readonly floorY: number;
  /** A collider out of the world until the fight starts (the vault door's gate: no fighting from the corridor). */
  readonly lock: string;
  locked = false;
  readonly waves: Wave[];
  phase = 1;
  started = false;
  introT = 0;
  shiftT = 0;
  /** 0 not yet, 1 running for the door, 2 cornered (fights on). */
  lastStand = 0;
  shotNext = 1.2;
  beam: Beam = { state: 0, t: 0, a0: 0, a: 0, dir: 1, high: true, hit: false, dur: 3 };
  beamNext = 0;
  beams = 0;
  downed = false;
  /** Her health when her rifle's tell began (-1: no tell): enough damage during it breaks her aim. */
  tellHp = -1;

  constructor(g: Game, s: StageSettings) {
    this.idx = g.enemies.findIndex(e => e.kind === "countess");
    this.center = (s.center as [number, number]) ?? [0, 0];
    this.column = typeof s.column === "number" ? s.column : BEAM.column;
    this.radius = typeof s.radius === "number" ? s.radius : 14;
    this.deskR = typeof s.deskR === "number" ? s.deskR : 2;
    this.door = (s.door as [number, number]) ?? this.center;
    this.floorY = typeof s.floorY === "number" ? s.floorY : 0;
    this.lock = typeof s.lock === "string" ? s.lock : "";
    if (this.lock) g.world.setEnabled(this.lock, false);
    const her = g.enemies[this.idx];
    if (her) { her.perch = true; her.coverUsed = true; }
    this.waves = ((s.waves as Array<{ group: string; door: string; phase: number }>) ?? []).map(w => {
      const box = g.level.boxes.find(b => b.node === w.door);
      const x = box?.cx ?? 0, z = box?.cz ?? 0;
      const dx = x - this.center[0], dz = z - this.center[1], l = Math.hypot(dx, dz) || 1;
      return { group: w.group, door: w.door, phase: w.phase, lamp: 0, lit: false, queue: g.enemies.filter(e => e.group === w.group).map(e => e.idx), next: 0, x, z, ox: x + (dx / l) * 1.6, oz: z + (dz / l) * 1.6 };
    });
  }

  her(g: Game): Enemy | undefined {
    return g.enemies[this.idx];
  }

  damageMul(e: Enemy, part: number): number {
    if (e.kind !== "countess") return 1;
    if (this.introT > 0 || this.shiftT > 0) return 0;
    // standing still for the tell, she is open: that is the moment (in bullet time, the long one)
    return (part === HB_HEAD ? COUNTESS.head : 1) * (e.tell > 0 ? COUNTESS.tellOpen : 1);
  }

  clampDamage(e: Enemy, amount: number): number {
    if (e.kind !== "countess") return amount;
    return this.lastStand === 0 && e.hp - amount <= 0 ? Math.max(0, e.hp - 1) : amount;
  }

  busy(): boolean {
    return this.introT > 0 || this.shiftT > 0 || this.lastStand === 1;
  }

  boss(g: Game): StageBoss | null {
    const e = this.her(g);
    return e ? { name: "THE COUNTESS", idx: this.idx, phase: this.phase, started: this.started, immune: this.introT > 0 || this.shiftT > 0, notches: [COUNTESS.phase2, COUNTESS.phase3] } : null;
  }

  private lightWaves(g: Game, phase: number): void {
    for (const w of this.waves) if (w.phase === phase && !w.lit && w.queue.length) {
      w.lit = true;
      w.lamp = COUNTESS.doors.lamp;
      g.emit({ type: "stage", what: "lamp", x: w.x, z: w.z });
    }
  }

  private liveOf(g: Game, group: string): number {
    let n = 0;
    for (const e of g.enemies) if (e.group === group && e.state !== "dead" && e.state !== "inactive" && !e.fled) n++;
    return n;
  }

  private spawn(g: Game, w: Wave, n: number): void {
    for (let k = 0; k < n && w.queue.length; k++) {
      const e = g.enemies[w.queue.shift()!];
      if (!e || e.state !== "inactive" || e.fled) continue;
      setState(e, "idle");
      e.hit.hittable = true;
      e.deaf = false;
      alertGoon(g, e, 0.15 + 0.3 * g.rng.next());
    }
  }

  step(g: Game, dt: number): void {
    const e = this.her(g);
    if (!e) return;
    this.introT = Math.max(0, this.introT - dt);
    const wasShift = this.shiftT > 0;
    this.shiftT = Math.max(0, this.shiftT - dt);
    const alive = e.state !== "dead" && e.state !== "inactive";
    // the gate shuts behind him once she has seen him and he is in the vault
    if (this.started && this.lock && !this.locked && Math.hypot(g.player.x - this.center[0], g.player.z - this.center[1]) < this.radius - 0.6) { this.locked = true; g.world.setEnabled(this.lock, true); g.emit({ type: "stage", what: "locked" }); }
    // the phases
    if (alive && this.started) {
      const f = e.hp / e.maxHp;
      if (this.phase === 1 && this.introT <= 0 && !this.waves.some(w => w.lit) ) this.lightWaves(g, 1);
      if (this.phase === 1 && f <= COUNTESS.phase2) {
        this.phase = 2;
        this.shiftT = COUNTESS.shift;
        e.tell = 0;
        e.perch = false;
        this.beamNext = 1.5;
        g.emit({ type: "stage", what: "phase2", id: e.idx });
        this.lightWaves(g, 2);
      } else if (this.phase === 2 && f <= COUNTESS.phase3) {
        this.phase = 3;
        this.shiftT = COUNTESS.shift;
        e.tell = 0;
        this.beamNext = Math.min(this.beamNext, 2);
        g.emit({ type: "stage", what: "phase3", id: e.idx });
        this.lightWaves(g, 3);
      } else if (this.phase === 3 && this.lastStand === 0 && f <= COUNTESS.lastStand) {
        this.lastStand = 1;
        e.tell = 0;
        e.stagger = 0;
        setState(e, "rush");
        e.path = []; e.pathI = 0; e.repath = 0;
        g.slowFor(COUNTESS.lastStandReal, COUNTESS.lastStandSlow);
        g.emit({ type: "stage", what: "lastStand", id: e.idx });
      }
    }
    // a phase change is over: phase 2 goes down the steps to cover, phase 3 charges
    if (wasShift && this.shiftT <= 0 && alive && this.lastStand === 0) {
      if (this.phase === 2) { setState(e, "alert"); e.react = 0; goToCover(g, e); }
      else if (this.phase === 3) { e.engageAt = COUNTESS.engage; startRush(g, e); }
    }
    // the lift doors
    for (const w of this.waves) {
      if (w.lit && w.lamp > 0) {
        w.lamp -= dt;
        if (w.lamp <= 0) {
          if (g.world.setEnabled(w.door, false)) g.emit({ type: "stage", what: "door", x: w.x, z: w.z });
          if (alive) this.spawn(g, w, COUNTESS.doors.first);
          w.next = COUNTESS.doors.every;
        }
      } else if (w.lit && w.queue.length && alive) {
        w.next -= dt;
        if (w.next <= 0 && this.liveOf(g, w.group) < COUNTESS.doors.maxLive) { this.spawn(g, w, COUNTESS.doors.pair); w.next = COUNTESS.doors.every; }
      }
    }
    // her aim broken: enough damage during the tell and the round never comes (a stagger)
    if (alive && e.tell > 0) {
      if (this.tellHp < 0) this.tellHp = e.hp;
      else if (this.tellHp - e.hp >= COUNTESS.breakAt && this.lastStand !== 1) {
        e.tell = 0;
        e.stagger = COUNTESS.stagger;
        this.tellHp = -1;
        g.emit({ type: "stage", what: "stagger", id: e.idx });
      }
    } else this.tellHp = -1;
    this.stepBeam(g, dt, alive);
  }

  /** The player's angle about the desk (0 = +Z) and his distance from its centre. */
  private polar(x: number, z: number): { a: number; r: number } {
    const dx = x - this.center[0], dz = z - this.center[1];
    return { a: Math.atan2(dx, dz), r: Math.hypot(dx, dz) };
  }

  private stepBeam(g: Game, dt: number, alive: boolean): void {
    const b = this.beam;
    const p = g.player;
    if (b.state === 0) {
      if (!alive || this.phase < 2 || this.lastStand === 1 || p.mode === "dead") return;
      this.beamNext -= dt;
      if (this.beamNext > 0) return;
      const pp = this.polar(p.x, p.z);
      b.dir = g.rng.next() < 0.5 ? -1 : 1;
      // it starts well to one side of him, so the sweep comes at him readably
      b.a0 = pp.a - b.dir * 1.2;
      b.a = b.a0;
      b.high = this.beams % 2 === 0 ? g.rng.next() < 0.5 : !b.high;
      b.state = 1;
      b.t = perDiff(BEAM.tell, g.difficulty);
      b.dur = perDiff(BEAM.dur, g.difficulty);
      b.hit = false;
      this.beams++;
      g.emit({ type: "stage", what: b.high ? "beamHigh" : "beamLow" });
      return;
    }
    if (b.state === 1) {
      b.t -= dt;
      if (b.t <= 0) { b.state = 2; b.t = 0; g.emit({ type: "stage", what: "beamGo" }); }
      return;
    }
    // sweeping: did it cross him this step?
    const prev = b.a;
    b.t += dt;
    const u = Math.min(1, b.t / b.dur);
    b.a = b.a0 + b.dir * BEAM.arc * u;
    if (!b.hit && p.mode !== "dead") {
      const pp = this.polar(p.x, p.z);
      let rel = (pp.a - prev) * b.dir;
      rel = ((rel % TAU) + TAU) % TAU;
      const swept = Math.abs(b.a - prev);
      if (rel <= swept && pp.r >= this.column && pp.r <= this.radius && this.touches(g)) {
        b.hit = true;
        g.hurtPlayer(BEAM.damage * g.diff.damage, -1);
        g.emit({ type: "stage", what: "beamHit", x: p.x, z: p.z });
      }
    }
    if (u >= 1 || !alive) {
      b.state = 0;
      const [lo, hi] = this.phase >= 3 ? BEAM.every3 : BEAM.every;
      this.beamNext = lo + (hi - lo) * g.rng.next();
      g.emit({ type: "stage", what: "beamEnd" });
    }
  }

  /** The beam at its height meets him: high: standing (not diving or prone); low: his feet under
   *  BEAM.clear; tall cover between it and him keeps it off. */
  touches(g: Game): boolean {
    const p = g.player, b = this.beam;
    const feet = p.y - this.floorY;
    if (b.high ? p.mode === "dive" || p.mode === "prone" : feet >= BEAM.clear) return false;
    const h = this.floorY + (b.high ? BEAM.high : BEAM.low);
    const dx = p.x - this.center[0], dz = p.z - this.center[1], d = Math.hypot(dx, dz) || 1;
    const sx = this.center[0] + (dx / d) * (this.column + 0.05), sz = this.center[1] + (dz / d) * (this.column + 0.05);
    return g.world.clear(sx, h, sz, p.x, h, p.z, true);
  }

  /** Seconds until the sweeping beam reaches him (Infinity: not coming). */
  timeToHim(g: Game): number {
    const b = this.beam, p = g.player;
    if (b.state === 0 || b.hit) return Infinity;
    const pp = this.polar(p.x, p.z);
    if (pp.r < this.column || pp.r > this.radius) return Infinity;
    let rel = (pp.a - b.a) * b.dir;
    rel = ((rel % TAU) + TAU) % TAU;
    const left = BEAM.arc - Math.abs(b.a - b.a0);
    if (rel > left) return Infinity;
    const w = BEAM.arc / b.dur;
    return (b.state === 1 ? b.t : 0) + rel / w;
  }

  botHint(g: Game): StageHint | null {
    const p = g.player;
    const e = this.her(g);
    // her tell about to end with the line on him: dive (as a player watching the laser would)
    if (e && e.tell > 0 && e.tell < 0.22 && p.mode === "normal" && p.grounded && g.canShoot(e)) return { dodge: true };
    const t = this.timeToHim(g);
    if (!Number.isFinite(t)) return null;
    if (this.beam.high) return t < 0.3 && p.mode === "normal" && p.grounded ? { dodge: true } : null;
    return t < 0.3 && t > 0.08 && p.mode === "normal" && p.grounded ? { jump: true } : null;
  }

  onKill(g: Game, e: Enemy): void {
    if (e.kind !== "countess" || this.downed) return;
    this.downed = true;
    this.beam.state = 0;
    for (const w of this.waves) { for (const i of w.queue) { const a = g.enemies[i]; if (a && a.state === "inactive") a.fled = true; } w.queue.length = 0; }
    for (const a of g.enemies) {
      if (a.kind === "countess" || a.state === "dead" || a.fled) continue;
      if (a.state === "inactive") { a.fled = true; continue; }
      let best: Wave | null = null, bd = Infinity;
      for (const w of this.waves) { const d = Math.hypot(w.x - a.x, w.z - a.z) + (g.world.off.has(w.door) ? 0 : 1000); if (d < bd) { bd = d; best = w; } }
      a.fled = true;
      setState(a, "flee");
      a.hit.hittable = false;
      a.tell = 0;
      a.stagger = 0;
      const tx = best?.ox ?? a.x, tz = best?.oz ?? a.z;
      a.path = g.graph.path(a.x, a.y, a.z, tx, 0, tz) ?? [];
      a.path.push({ x: tx, z: tz });
      a.pathI = 0;
    }
    g.emit({ type: "stage", what: "down", id: e.idx });
  }

  hashInto(h: Fnv1a): void {
    h.i32(this.phase).i32(this.locked ? 1 : 0).i32(this.started ? 1 : 0).f64(this.introT).f64(this.shiftT).i32(this.lastStand).f64(this.shotNext).f64(this.beamNext).i32(this.beams);
    h.i32(this.beam.state).f64(this.beam.t).f64(this.beam.a).i32(this.beam.high ? 1 : 0).i32(this.beam.hit ? 1 : 0);
    for (const w of this.waves) h.f64(w.lamp).i32(w.lit ? 1 : 0).i32(w.queue.length).f64(w.next);
  }
}
