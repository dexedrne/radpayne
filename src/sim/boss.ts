// Room 5, the penthouse: Madame Pockit's fight (round-3 plan section 3). Her brain is ai/madame.ts;
// this is the room around her, stepped on world time after the enemies:
//  - the phases: at 66 % of her health the party (door A's adds, her heart grenades), at 33 % no more
//    manners (the coat comes off: she cannot be hurt while she throws it; door B's adds; she runs like a
//    rusher, two grenades at a time), at 10 % the last stand (she runs for the bag on her desk, then the
//    terrace door, and the world drops into slow motion by itself: the finale shot);
//  - her heart grenades: a wind-up with the grenade held high (shot there, it goes off on her: damage
//    and a stagger), a lob to where he stood, a pink ring where it lands, the blast at the fuse (shot in
//    the air or on the floor, it pops harmlessly);
//  - the chandelier over the round rug: two hits on its chain drop it; on her, damage and a knockdown;
//  - the add doors: a red lamp over the door lights before it opens, then the adds come in (the first
//    batch, then pairs while few of them stand);
//  - her fall: the adds still standing run for their doors (they no longer count), so the clear is her.
// Room settings: Data {room: {boss: {chandelier: [x, y, z] (the chain's point), rug: [x, z, r], bag:
// [x, z], terrace: [x, z], doors: [{door: collider node, group}]}}}.
import { HB_TORSO } from "../combat/hitboxes.ts";
import { alertGoon, faceToward, followPath, setState } from "../ai/goon.ts";
import type { Enemy } from "./actors.ts";
import type { Game } from "./game.ts";
import type { Fnv1a } from "./math.ts";
import { MADAME } from "./tuning.ts";

/** `flight`: the lob's time in the air; `fuse`: world s from the throw to the blast. */
export type Grenade = { id: number; x: number; y: number; z: number; x0: number; y0: number; z0: number; vx: number; vy: number; vz: number; tx: number; ty: number; tz: number; age: number; landed: boolean; flight: number; fuse: number };
export type AddDoor = { door: string; group: string; x: number; z: number; ox: number; oz: number; lamp: number; lit: boolean; open: boolean; queue: number[]; next: number };
export type BossSettings = { chandelier?: [number, number, number]; rug?: [number, number, number]; bag?: [number, number]; terrace?: [number, number]; doors?: Array<{ door: string; group: string }> };
/** What his shot met first: the grenade in her hand, a grenade (by id), the chandelier's chain. */
export type BossTarget = { t: number; kind: "hand" | "grenade" | "chain"; id: number };
export type Sweep = { tell: number; tellDur: number; t: number; a0: number; a1: number; fireT: number; hand: number; hit: boolean };

const G = MADAME.grenade;

export class Boss {
  /** Her enemy index. */
  readonly idx: number;
  phase = 1;
  /** The coat is on (hits on it do MADAME.coat); coatT: world s left of throwing it off (no damage). */
  coat = true;
  coatT = 0;
  /** Her first alert happened (the intro line); introT: world s left of it (she cannot be hurt). */
  started = false;
  introT = 0;
  sweep: Sweep | null = null;
  sweepNext: number = MADAME.sweep.first;
  /** A grenade held high (the wind-up), `n` to throw. */
  wind: { t: number; n: number } | null = null;
  grenadeNext: number = G.first;
  readonly grenades: Grenade[] = [];
  private nextId = 1;
  chain: number = MADAME.chandelier.hits;
  chandelier: "up" | "falling" | "down" = "up";
  fallT = 0;
  rugSaid = false;
  /** 0 not yet, 1 running for the bag, 2 for the terrace door, 3 cornered (fights on). */
  lastStand = 0;
  readonly doors: AddDoor[];
  readonly chainAt: [number, number, number];
  readonly rug: [number, number, number];
  readonly bag: [number, number];
  readonly terrace: [number, number];

  constructor(g: Game) {
    this.idx = g.enemies.findIndex(e => e.kind === "madame");
    const s = (g.level.room.boss && typeof g.level.room.boss === "object" ? g.level.room.boss : {}) as BossSettings;
    this.chainAt = s.chandelier ?? [0, 5, 0];
    this.rug = s.rug ?? [this.chainAt[0], this.chainAt[2], 2.4];
    const her = g.enemies[this.idx];
    this.bag = s.bag ?? [her?.x ?? 0, her?.z ?? 0];
    this.terrace = s.terrace ?? this.bag;
    this.doors = (s.doors ?? []).map(d => {
      const box = g.level.boxes.find(b => b.node === d.door);
      const x = box?.cx ?? 0, z = box?.cz ?? 0;
      // outward: away from the hall's centre (the adds wait there; the runners leave that way)
      const l = Math.hypot(x, z) || 1;
      return { door: d.door, group: d.group, x, z, ox: x + (x / l) * 1.4, oz: z + (z / l) * 1.4, lamp: 0, lit: false, open: false, queue: g.enemies.filter(e => e.group === d.group).map(e => e.idx), next: 0 };
    });
  }

  her(g: Game): Enemy {
    return g.enemies[this.idx];
  }

  /** Damage factor on her: nothing while she throws the coat off, the coat's share on the body, her
   *  head's share of a headshot. */
  damageMul(part: number): number {
    if (this.coatT > 0 || this.introT > 0) return 0;
    if (part === 0) return MADAME.head;
    return this.coat ? MADAME.coat : 1;
  }

  /** A hit that would finish her before her last stand leaves her on 1 (she always gets it). */
  clampDamage(e: Enemy, amount: number): number {
    return this.lastStand === 0 && e.hp - amount <= 0 ? Math.max(0, e.hp - 1) : amount;
  }

  /** The grenade in her hand (overhead, a little to her right). */
  handPoint(e: Enemy): { x: number; y: number; z: number } {
    const c = Math.cos(e.facing), s = Math.sin(e.facing);
    return { x: e.x - c * 0.3 + s * 0.1, y: e.y + 2.35, z: e.z + s * 0.3 + c * 0.1 };
  }

  /** The nearest small target on his shot's line before `maxT` (null: none). */
  intercept(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): BossTarget | null {
    let best: BossTarget | null = null;
    const test = (cx: number, cy: number, cz: number, r: number, kind: BossTarget["kind"], id: number) => {
      const lx = cx - ox, ly = cy - oy, lz = cz - oz;
      const t = lx * dx + ly * dy + lz * dz;
      if (t < 0) return;
      const d2 = lx * lx + ly * ly + lz * lz - t * t;
      if (d2 > r * r) return;
      const th = t - Math.sqrt(r * r - d2);
      if (th < 0 || th > maxT || (best && th >= best.t)) return;
      best = { t: th, kind, id };
    };
    const e = this.herOrNull;
    if (this.wind && e && e.state !== "dead") { const h = this.handPoint(e); test(h.x, h.y, h.z, G.hitRadius, "hand", 0); }
    for (const gr of this.grenades) test(gr.x, gr.y + (gr.landed ? 0.12 : 0), gr.z, G.hitRadius * (gr.landed ? 0.8 : 1), "grenade", gr.id);
    if (this.chandelier === "up") test(this.chainAt[0], this.chainAt[1], this.chainAt[2], MADAME.chandelier.chainRadius, "chain", 0);
    return best;
  }
  /** Set each step (the game's intercept runs without the game at hand). */
  private herOrNull: Enemy | null = null;

  hitTarget(g: Game, t: BossTarget, ox: number, oy: number, oz: number): void {
    g.stats.hits++;
    const e = this.her(g);
    if (t.kind === "hand") {
      if (!this.wind) return;
      this.wind = null;
      // (the next wind-up comes on the usual clock, as after a throw)
      this.grenadeNext = (this.phase >= 3 ? G.every3 : G.every2) + g.rng.next();
      const h = this.handPoint(e);
      this.blast(g, h.x, h.y, h.z, true);
      // it went off on her: damage (the kill cam replays his shot when it finishes her) and a stagger
      const l = Math.hypot(e.x - ox, e.z - oz) || 1;
      g.damageEnemy(e, G.hand, HB_TORSO, (e.x - ox) / l, (e.z - oz) / l, { ox, oy, oz, x: h.x, y: h.y, z: h.z }, false, "heart");
      if (e.state !== "dead") { e.stagger = Math.max(e.stagger, G.stagger); this.sweep = null; g.emit({ type: "boss", what: "stagger" }); }
    } else if (t.kind === "grenade") {
      const i = this.grenades.findIndex(k => k.id === t.id);
      if (i < 0) return;
      const gr = this.grenades[i];
      this.grenades.splice(i, 1);
      g.emit({ type: "grenade", what: "pop", id: gr.id, x: gr.x, y: gr.y, z: gr.z });
    } else if (t.kind === "chain") {
      if (this.chandelier !== "up") return;
      this.chain--;
      g.emit({ type: "boss", what: "chain", hit: true });
      if (this.chain <= 0) {
        this.chandelier = "falling";
        this.fallT = MADAME.chandelier.fall;
        this.chainShot = { ox, oy, oz };
        g.emit({ type: "boss", what: "chandelier" });
      }
    }
  }
  private chainShot = { ox: 0, oy: 0, oz: 0 };

  /** A heart grenade goes off: him (behind cover at the ring's height he is safe) and her adds; `hand`:
   *  in her hand (her own damage is dealt by the caller). */
  private blast(g: Game, x: number, y: number, z: number, hand: boolean): void {
    g.emit({ type: "grenade", what: "blast", id: 0, x, y, z, ...(hand ? { hand: true } : {}) });
    const R = G.radius;
    const p = g.player;
    const d = Math.hypot(p.x - x, p.z - z);
    if (p.mode !== "dead" && d <= R && Math.abs(p.y - y) < 2.5 && g.world.clear(x, Math.max(y, p.y) + 0.45, z, p.x, p.y + 0.9, p.z, true)) {
      g.hurtPlayer((G.center + (G.edge - G.center) * (d / R)) * g.diff.damage, this.idx);
    }
    for (const e of g.enemies) {
      if (e.kind === "madame" || e.state === "dead" || e.state === "inactive" || e.fled) continue;
      const de = Math.hypot(e.x - x, e.z - z);
      if (de > R) continue;
      const l = de || 1;
      g.damageEnemy(e, G.center + (G.edge - G.center) * (de / R), HB_TORSO, (e.x - x) / l, (e.z - z) / l, null);
    }
  }

  /** Lob a grenade from her hand toward (tx, tz): longer in the air the farther it goes; under a low
   *  ceiling (a door's vestibule) it lands short, where the lob still clears it. */
  throwAt(g: Game, e: Enemy, tx: number, tz: number): void {
    const h = this.handPoint(e);
    const dx = tx - h.x, dz = tz - h.z, dl = Math.hypot(dx, dz) || 1;
    for (let k = 0; k < 40 && dl - k * 0.5 > 2; k++) {
      const floor = g.world.groundBelow(tx, tz, 0.1, e.y + 1.2);
      if (g.world.ceilingAbove(tx, tz, 0.1, (Number.isFinite(floor) ? floor : 0) + 0.5) - (Number.isFinite(floor) ? floor : 0) >= G.headroom) break;
      tx -= (dx / dl) * 0.5;
      tz -= (dz / dl) * 0.5;
    }
    const ty0 = g.world.groundBelow(tx, tz, 0.1, e.y + 1.2);
    const ty = Number.isFinite(ty0) ? ty0 : 0;
    const T = Math.min(G.flightMax, G.flight + G.flightPerM * Math.hypot(tx - h.x, tz - h.z));
    const gr: Grenade = {
      id: this.nextId++, x: h.x, y: h.y, z: h.z, x0: h.x, y0: h.y, z0: h.z,
      vx: (tx - h.x) / T, vy: (ty - h.y) / T + 0.5 * G.gravity * T, vz: (tz - h.z) / T, tx, ty, tz, age: 0, landed: false, flight: T, fuse: T + G.fuse,
    };
    this.grenades.push(gr);
    g.emit({ type: "grenade", what: "throw", id: gr.id, x: h.x, y: h.y, z: h.z });
  }

  private spawnAdds(g: Game, d: AddDoor, n: number): void {
    for (let k = 0; k < n && d.queue.length; k++) {
      const e = g.enemies[d.queue.shift()!];
      if (!e || e.state !== "inactive" || e.fled) continue;
      setState(e, "idle");
      e.hit.hittable = true;
      e.deaf = false;
      alertGoon(g, e, 0.15 + 0.3 * g.rng.next());
    }
  }

  private liveAdds(g: Game, d: AddDoor): number {
    let n = 0;
    for (const e of g.enemies) if (e.group === d.group && e.state !== "dead" && e.state !== "inactive" && !e.fled) n++;
    return n;
  }

  private light(g: Game, i: number): void {
    const d = this.doors[i];
    if (!d || d.lit) return;
    d.lit = true;
    d.lamp = MADAME.doors.lamp;
    g.emit({ type: "boss", what: "lamp", door: d.door });
  }

  step(g: Game, dt: number): void {
    const e = this.her(g);
    if (!e) return;
    this.herOrNull = e;
    this.coatT = Math.max(0, this.coatT - dt);
    this.introT = Math.max(0, this.introT - dt);
    // the phases (her health share)
    if (e.state !== "dead" && e.state !== "inactive") {
      const f = e.hp / e.maxHp;
      if (this.phase === 1 && f <= MADAME.phase2) {
        this.phase = 2;
        this.grenadeNext = Math.min(this.grenadeNext, G.first);
        g.emit({ type: "boss", what: "phase2" });
        this.light(g, 0);
      } else if (this.phase === 2 && f <= MADAME.phase3) {
        this.phase = 3;
        // the coat comes off: a moment she cannot be hurt, and nothing else
        this.coat = false;
        this.coatT = MADAME.coatThrow;
        e.stagger = Math.max(e.stagger, MADAME.coatThrow);
        e.coverUsed = true;
        this.sweep = null;
        this.wind = null;
        this.grenadeNext = Math.max(this.grenadeNext, 1.5);
        g.emit({ type: "boss", what: "phase3" });
        this.light(g, 1);
      } else if (this.phase === 3 && this.lastStand === 0 && f <= MADAME.lastStand) {
        this.lastStand = 1;
        this.sweep = null;
        this.wind = null;
        e.stagger = 0;
        setState(e, "rush");
        e.path = [];
        e.pathI = 0;
        e.repath = 0;
        g.slowFor(MADAME.lastStandReal, MADAME.lastStandSlow);
        g.emit({ type: "boss", what: "lastStand" });
      }
    }
    // the add doors
    for (const d of this.doors) {
      if (d.lit && !d.open) {
        d.lamp -= dt;
        if (d.lamp <= 0) {
          d.open = true;
          g.world.setEnabled(d.door, false);
          g.emit({ type: "boss", what: "door", door: d.door });
          if (e.state !== "dead") this.spawnAdds(g, d, MADAME.doors.first);
          d.next = MADAME.doors.every;
        }
      } else if (d.open && d.queue.length && e.state !== "dead") {
        d.next -= dt;
        if (d.next <= 0 && this.liveAdds(g, d) < MADAME.doors.maxLive) {
          this.spawnAdds(g, d, MADAME.doors.pair);
          d.next = MADAME.doors.every;
        }
      }
    }
    // grenades: the lob, then the fuse
    for (let i = 0; i < this.grenades.length; i++) {
      const gr = this.grenades[i];
      gr.age += dt;
      if (!gr.landed) {
        if (gr.age >= gr.flight) {
          gr.landed = true;
          gr.x = gr.tx; gr.y = gr.ty; gr.z = gr.tz;
          g.emit({ type: "grenade", what: "land", id: gr.id, x: gr.x, y: gr.y, z: gr.z });
        } else {
          const a = gr.age;
          gr.x = gr.x0 + gr.vx * a;
          gr.y = gr.y0 + gr.vy * a - 0.5 * G.gravity * a * a;
          gr.z = gr.z0 + gr.vz * a;
        }
      }
      if (gr.age >= gr.fuse) {
        this.grenades.splice(i--, 1);
        this.blast(g, gr.x, gr.y, gr.z, false);
      }
    }
    // the chandelier
    if (this.chandelier === "falling") {
      this.fallT -= dt;
      if (this.fallT <= 0) {
        this.chandelier = "down";
        g.emit({ type: "boss", what: "crash" });
        const [rx, rz, rr] = this.rug;
        if (e.state !== "dead" && e.state !== "inactive" && Math.hypot(e.x - rx, e.z - rz) <= rr) {
          const c = this.chainShot;
          const l = Math.hypot(e.x - c.ox, e.z - c.oz) || 1;
          e.stagger = Math.max(e.stagger, MADAME.chandelier.knock);
          this.sweep = null;
          this.wind = null;
          g.damageEnemy(e, MADAME.chandelier.damage, HB_TORSO, (e.x - c.ox) / l, (e.z - c.oz) / l, { ...c, x: e.x, y: e.y + 1.2, z: e.z }, false, "chandelier");
          if (e.hp > 0) g.emit({ type: "boss", what: "stagger" });
        }
      }
    }
    // the narrator's hint the first time she steps onto the rug with the chandelier still up
    if (!this.rugSaid && this.chandelier === "up" && this.started && e.state !== "dead" && Math.hypot(e.x - this.rug[0], e.z - this.rug[1]) <= this.rug[2]) {
      this.rugSaid = true;
      g.emit({ type: "boss", what: "rug" });
    }
  }

  /** She is down: her grenades fizzle, the adds still standing run for their doors, the rest never come. */
  down(g: Game): void {
    this.sweep = null;
    this.wind = null;
    this.grenades.length = 0;
    for (const d of this.doors) {
      for (const i of d.queue) { const a = g.enemies[i]; if (a && a.state === "inactive") a.fled = true; }
      d.queue.length = 0;
    }
    for (const a of g.enemies) {
      if (a.kind === "madame" || a.state === "dead" || a.fled) continue;
      if (a.state === "inactive") { a.fled = true; continue; }
      // run for the nearest open door (her own, usually)
      let best = this.doors[0], bd = Infinity;
      for (const d of this.doors) { const dd = Math.hypot(d.x - a.x, d.z - a.z) + (d.open ? 0 : 1000); if (dd < bd) { bd = dd; best = d; } }
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
    g.emit({ type: "boss", what: "down" });
  }

  hashInto(h: Fnv1a): void {
    h.i32(this.phase).i32(this.coat ? 1 : 0).f64(this.coatT).f64(this.introT).i32(this.lastStand).i32(this.chain).str(this.chandelier).f64(this.fallT);
    h.f64(this.sweepNext).f64(this.grenadeNext).f64(this.sweep ? this.sweep.t + this.sweep.tell : -1).f64(this.wind ? this.wind.t : -1);
    for (const gr of this.grenades) h.f64(gr.x).f64(gr.y).f64(gr.z).f64(gr.age).f64(gr.fuse);
    for (const d of this.doors) h.f64(d.lamp).i32(d.open ? 1 : 0).i32(d.queue.length).f64(d.next);
  }
}

/** The bot's (and the browser check's) boss sense: a point worth a shot right now (the grenade in her
 *  hand, the chandelier's chain while she stands under it), or null. */
export function bossAim(g: Game): { x: number; y: number; z: number } | null {
  const b = g.boss;
  if (!b) return null;
  const e = b.her(g);
  if (!e || e.state === "dead" || e.state === "inactive") return null;
  if (b.wind && b.wind.t > 0.12) return b.handPoint(e);
  if (b.chandelier === "up" && Math.hypot(e.x - b.rug[0], e.z - b.rug[1]) <= b.rug[2] - 0.4) return { x: b.chainAt[0], y: b.chainAt[1], z: b.chainAt[2] };
  return null;
}

/** Out of a grenade's ring: the way to run (unit xz), or null when he is clear of every ring. */
export function grenadeEscape(g: Game): { x: number; z: number } | null {
  const b = g.boss;
  if (!b) return null;
  const p = g.player;
  let ex = 0, ez = 0, px = 0, pz = 0;
  for (const gr of b.grenades) {
    const dx = p.x - gr.tx, dz = p.z - gr.tz, d = Math.hypot(dx, dz);
    if (d > MADAME.grenade.radius + 0.6) continue;
    // (between two rings the pushes can cancel: then out square to the line between them)
    if (!px && !pz) { px = d > 1e-3 ? -dz / d : 0; pz = d > 1e-3 ? dx / d : 1; }
    const l = d || 1;
    ex += (d > 1e-3 ? dx / l : 1) * (MADAME.grenade.radius + 0.6 - d);
    ez += (d > 1e-3 ? dz / l : 0) * (MADAME.grenade.radius + 0.6 - d);
  }
  const l = Math.hypot(ex, ez);
  if (l > 0.25) return { x: ex / l, z: ez / l };
  return px || pz ? { x: px, z: pz } : null;
}

/** An add running for her door once Madame Pockit is down: gone (inactive) at the door. */
export function stepFlee(g: Game, e: Enemy, dt: number): void {
  e.stateT += dt;
  e.crouch = false;
  e.leanTarget = 0;
  const arrived = followPath(g, e, MADAME.flee, dt);
  if (e.vx || e.vz) faceToward(e, e.x + e.vx, e.z + e.vz, 10, dt);
  if (arrived || e.stateT > MADAME.fleeMax) {
    setState(e, "inactive");
    e.vx = e.vz = 0;
    e.hit.hittable = false;
  }
}
