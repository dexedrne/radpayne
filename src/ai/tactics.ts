// The gang against his cover, and against a spot he holds (the difficulty's `suppress`, `flank`, `grenade`,
// `camp`, `rush`; Chill has none of it). "Holding" is staying within TACTICS.hold m of one spot, in cover or
// not: a man planted in the open is flanked and fragged as surely as one behind a crate (he is only shot
// less behind the crate). Once per step, on world time:
//  - suppression: a share of the goons (fixed per goon) keep firing at his cover when they cannot hit him
//    behind it: the rounds go where his chest would be if he stood up (tryFire in goon.ts asks
//    `suppresses`); pop up into it and he is hit.
//  - flanking: while he holds a spot, up to `flank` goons go for cover points round the side of where he
//    faces the gang (his cover's front, else the way to the gang) (pickFlank), and shoot from there.
//  - frags: after `camp` s in one spot a goon who knows where he is lobs a frag at it (one every `grenade`
//    s from the whole gang); the red ring under it is his warning.
//  - camping: after `rush` s in one spot a rusher (else a goon) comes in close to dig him out.
// Everything reads the seeded rng or fixed per-goon hashes, so replays hold.
import type { Enemy } from "../sim/actors.ts";
import type { Game } from "../sim/game.ts";
import { hash01 } from "../sim/math.ts";
import { GRENADE } from "../sim/tuning.ts";
import { goToCover, pickFlank } from "./goon.ts";
import { startRush } from "./rusher.ts";

export const TACTICS = {
  /** Holding a spot: staying within this many metres of it. He must have held it this long (world s)
   *  before anyone flanks. */
  hold: 3,
  flankAfter: 1.5,
  /** Flank points: this far from him (rush: closer), and within this walk of her. */
  flankRange: [5, 18] as const,
  rushRange: [3, 8] as const,
  flankTravel: 26,
  /** She knows where he is if she saw him within this long (world s). */
  knows: 6,
  /** A frag's lob: from 5 to 22 m; the flight takes `flight` s plus `perM` a metre; it lands within
   *  `scatter` m of his spot. The blast hurts him `player` x the difficulty's damage (a frag of his own
   *  is GRENADE.self). */
  throwRange: [5, 22] as const,
  flight: 0.8,
  perM: 0.04,
  scatter: 0.7,
  player: 0.35,
  /** Suppressing fire aims at his chest height over his cover; bursts wait this much longer. */
  suppressUp: 1.3,
  suppressPause: 1.6,
} as const;

/** Per-room tactics state (hashed with the game): the spot he holds, for how long, the gang's last frag,
 *  a rusher sent in for this spot, and the way he faces the gang from it (unit xz). */
export type Tactics = { x: number; z: number; t: number; nadeAt: number; rushSent: boolean; fx: number; fz: number };
export const makeTactics = (): Tactics => ({ x: 1e9, z: 1e9, t: 0, nadeAt: -1e9, rushSent: false, fx: 0, fz: -1 });

const fighting = (e: Enemy) => e.state === "cover" || e.state === "peek" || e.state === "engage" || e.state === "move";

/** Whether this goon lays down fire on his cover (fixed per goon: the difficulty's share of them). */
export function suppresses(g: Game, e: Enemy): boolean {
  const D = g.diff;
  if (D.suppress <= 0 || g.player.cover < 0 || e.kind === "heavy" || e.kind === "madame" || e.weapon === "sniper") return false;
  if (g.time - e.seenAt > TACTICS.knows) return false;
  return hash01(g.seed, e.idx, 0x5b, 7) < D.suppress;
}

export function stepTactics(g: Game, dt: number): void {
  const D = g.diff, p = g.player, T = g.tactics;
  if (p.mode === "dead") return;
  if (Math.hypot(p.x - T.x, p.z - T.z) > TACTICS.hold) {
    // a new spot: the old roles end (the flankers find new ones when he settles again)
    T.x = p.x; T.z = p.z; T.t = 0; T.rushSent = false;
    for (const e of g.enemies) e.role = "";
    return;
  }
  T.t += dt;
  // the way he faces the gang: his cover's front, else toward the ones who know where he is
  const s = p.cover >= 0 ? g.cover[p.cover] : null;
  if (s) { T.fx = -s.nx; T.fz = -s.nz; }
  else {
    let ax = 0, az = 0;
    for (const e of g.enemies) if (fighting(e) && g.time - e.seenAt <= TACTICS.knows) { const d = Math.hypot(e.x - p.x, e.z - p.z) || 1; ax += (e.x - p.x) / d; az += (e.z - p.z) / d; }
    const l = Math.hypot(ax, az);
    if (l > 1e-3) { T.fx = ax / l; T.fz = az / l; }
  }
  // flankers: up to D.flank at once, the goons who know where he is, lowest index first
  if (D.flank > 0 && T.t >= TACTICS.flankAfter) {
    let n = 0;
    for (const e of g.enemies) if (e.role === "flank" && e.state !== "dead") n++;
    for (const e of g.enemies) {
      if (n >= D.flank) break;
      // (settled ones only: in cover, peeking, in the open; and only when there is a point round his side)
      if (e.kind !== "goon" || e.perch || e.hold || e.role || e.weapon === "sniper" || e.state === "move" || !fighting(e) || g.time - e.seenAt > TACTICS.knows * 2) continue;
      if (pickFlank(g, e, false) < 0) continue;
      e.role = "flank";
      goToCover(g, e);
      if (e.role === "flank") n++;
    }
  }
  // camping: a rusher (else a goon) comes in close
  if (D.rush > 0 && !T.rushSent && T.t >= D.rush) {
    T.rushSent = true;
    const r = g.enemies.find(e => e.kind === "rusher" && e.state !== "dead" && e.state !== "inactive" && e.state !== "idle" && !e.fled);
    if (r) { r.role = "rush"; if (r.state !== "engage") startRush(g, r); }
    else {
      const k = g.enemies.find(e => e.kind === "goon" && !e.perch && e.role !== "flank" && e.weapon !== "sniper" && fighting(e) && pickFlank(g, e, true) >= 0);
      if (k) { k.role = "rush"; goToCover(g, k); }
    }
  }
  // a frag at the cover he has held too long
  if (D.grenade > 0 && T.t >= D.camp && g.time - T.nadeAt >= D.grenade) {
    for (const e of g.enemies) {
      if ((e.kind !== "goon" && e.kind !== "rusher") || e.fled || !fighting(e) || e.flinch > 0 || g.time - e.seenAt > TACTICS.knows) continue;
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d < TACTICS.throwRange[0] || d > TACTICS.throwRange[1]) continue;
      // a lob needs the air over the line clear (a ceiling, a wall between)
      const mx = (e.x + p.x) / 2, mz = (e.z + p.z) / 2, top = Math.max(e.y, p.y) + Math.min(3, 1.4 + d * 0.08);
      if (!g.world.clear(e.x, e.y + 1.7, e.z, mx, top, mz, true) || !g.world.clear(mx, top, mz, p.x, p.y + 0.6, p.z, true)) continue;
      T.nadeAt = g.time;
      throwFrag(g, e, d);
      break;
    }
  }
}

/** Her frag, lobbed at his spot (a little scatter), from her raised hand. */
function throwFrag(g: Game, e: Enemy, d: number): void {
  const p = g.player;
  const a = g.rng.next() * Math.PI * 2, r = g.rng.next() * TACTICS.scatter;
  const tx = p.x + Math.cos(a) * r, tz = p.z + Math.sin(a) * r;
  const ox = e.x + Math.sin(e.facing) * 0.3, oy = e.y + 1.8, oz = e.z + Math.cos(e.facing) * 0.3;
  const T = TACTICS.flight + TACTICS.perM * d;
  const vy = (p.y + 0.1 - oy + 0.5 * GRENADE.gravity * T * T) / T;
  g.enemyGrenade(e, ox, oy, oz, (tx - ox) / T, vy, (tz - oz) / T);
}
