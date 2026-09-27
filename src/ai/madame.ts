// Madame Pockit's brain (round-3 plan section 3.3), on world time like the gang. Her room (the phases,
// the grenades in flight, the add doors, the chandelier) is sim/boss.ts.
//   idle -> alert (she says her piece first: MADAME.introHold) -> phases 1-2 "the hostess": the goon's
//   cover-and-peek with bursts of 10 from her two SMGs; phase 3 "no more manners": the coat comes off,
//   then she runs and strafes like a rusher, a little faster. On top of that, whenever she sees him:
//   - the sweep: she plants her feet, two pink laser lines cross the floor along an arc (the tell:
//     0.6 s, 0.45 s in phase 3), then a burst sweeps the same arc at chest height (dive under it, or
//     break the line);
//   - from phase 2 a heart grenade: held high for 0.7 s (the wind-up: shoot it there), then lobbed where
//     he stands (two, either side of him, in phase 3).
//   A stagger (her own grenade, the chandelier, the coat throw) stops everything. At 10 % she runs for
//   the bag on her desk, then the terrace door, and fights on from there.
import type { Enemy } from "../sim/actors.ts";
import type { Game } from "../sim/game.ts";
import { ENEMY, MADAME } from "../sim/tuning.ts";
import { faceToward, followPath, perceive, stepGoon, within } from "./goon.ts";
import { startRush, stepRusher } from "./rusher.ts";

const S = MADAME.sweep;
const GR = MADAME.grenade;

export function stepMadame(g: Game, e: Enemy, dt: number): void {
  const b = g.boss;
  if (!b) { stepGoon(g, e, dt); return; }
  const p = g.player;
  b.sweepNext -= dt;
  b.grenadeNext -= dt;
  // staggered or throwing the coat off: nothing else; after the coat she runs
  if (e.stagger > 0) {
    e.stateT += dt;
    e.stagger = Math.max(0, e.stagger - dt);
    e.vx = e.vz = 0;
    e.crouch = false;
    perceive(g, e);
    if (e.stagger <= 0 && b.phase >= 3 && (b.lastStand === 0 || b.lastStand === 3)) { e.engageAt = MADAME.engage; startRush(g, e); }
    return;
  }
  if (e.state === "idle") { stepGoon(g, e, dt); return; }
  if (e.state === "alert") {
    if (!b.started) {
      b.started = true;
      e.react = Math.max(e.react, MADAME.introHold);
      b.introT = MADAME.introHold;
      g.emit({ type: "boss", what: "intro" });
    }
    stepGoon(g, e, dt);
    return;
  }
  // the last stand: the bag on her desk, then the terrace door (no shooting on the way)
  if (b.lastStand === 1 || b.lastStand === 2) { runFor(g, e, dt); return; }
  if (b.sweep) { stepSweep(g, e, dt); return; }
  if (b.wind) { stepWind(g, e, dt); return; }
  const dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz) || 1;
  const free = p.mode !== "dead" && e.sees && e.flinch <= 0;
  if (free && b.phase >= 2 && b.grenadeNext <= 0 && dist >= GR.range[0] && dist <= GR.range[1]) {
    b.wind = { t: GR.wind, n: b.phase >= 3 ? 2 : 1 };
    e.vx = e.vz = 0;
    e.crouch = false;
    g.emit({ type: "boss", what: "windup" });
    return;
  }
  if (free && b.sweepNext <= 0 && dist >= S.range[0] && dist <= S.range[1] && g.canShoot(e)) {
    const c = Math.atan2(dx, dz);
    const dir = g.rng.next() < 0.5 ? -1 : 1;
    const tell = b.phase >= 3 ? S.tell3 : S.tell;
    b.sweep = { tell, tellDur: tell, t: 0, a0: c - dir * S.arc / 2, a1: c + dir * S.arc / 2, fireT: 0, hand: 0, hit: false };
    e.facing = c;
    e.vx = e.vz = 0;
    e.crouch = false;
    e.lastShotT = g.time;
    g.emit({ type: "boss", what: "sweepTell" });
    return;
  }
  // the gang's brains underneath: a burst's end gets her own pause (bursts of 10, 1.1-1.7 s apart)
  const shots = e.shots;
  if (b.phase >= 3) {
    stepRusher(g, e, dt);
    e.vx *= MADAME.run3;
    e.vz *= MADAME.run3;
  } else stepGoon(g, e, dt);
  if (e.shots > shots && e.burstLeft === ENEMY.madame.burst) {
    e.fireT = within(MADAME.burstPause[0], MADAME.burstPause[1], g.rng.next());
    if (g.rng.next() < 0.3) g.emit({ type: "boss", what: "reload" });
  }
}

/** The sweep: the tell (feet planted, the lasers cross the arc), then the burst along it. */
function stepSweep(g: Game, e: Enemy, dt: number): void {
  const b = g.boss!, s = b.sweep!;
  const p = g.player;
  e.vx = e.vz = 0;
  e.crouch = false;
  e.stateT += dt;
  perceive(g, e);
  if (s.tell > 0) {
    s.tell -= dt;
    e.lastShotT = g.time;
    if (s.tell <= 0) g.emit({ type: "boss", what: "sweep" });
    return;
  }
  s.t += dt;
  const u = Math.min(1, s.t / S.dur);
  const a = s.a0 + (s.a1 - s.a0) * u;
  e.facing = a;
  s.fireT -= dt;
  const hp = p.health;
  while (s.fireT <= 0 && u < 1 && p.mode !== "dead") {
    s.fireT += S.interval;
    const d = Math.max(3, Math.hypot(p.x - e.x, p.z - e.z));
    const c = Math.cos(a), sn = Math.sin(a);
    const side = s.hand ? 0.22 : -0.22;
    s.hand ^= 1;
    const mx = e.x + sn * 0.5 - c * side, my = e.y + ENEMY.madame.muzzleUp, mz = e.z + c * 0.5 + sn * side;
    // along the arc at his chest height where he stands: a dive (or lying prone) goes under it
    let dx = sn * d, dy = p.y + 1.15 - my, dz = c * d;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx = dx / l + g.rng.gauss() * S.spread * 0.5;
    dy = dy / l + g.rng.gauss() * S.spread * 0.25;
    dz = dz / l + g.rng.gauss() * S.spread * 0.5;
    const l2 = Math.hypot(dx, dy, dz) || 1;
    e.lastShotT = g.time;
    e.shots++;
    g.shoot(1, e.idx, s.hand, mx, my, mz, dx / l2, dy / l2, dz / l2, S.damage * g.diff.damage, "smg", 0);
  }
  if (p.health < hp) s.hit = true;
  if (s.t >= S.dur) {
    if (s.hit) g.emit({ type: "boss", what: "laugh" });
    b.sweep = null;
    b.sweepNext = within(S.every[0], S.every[1], g.rng.next());
    e.fireT = Math.max(e.fireT, 0.8);
  }
}

/** The wind-up (the grenade held high, where it can be shot), then the lob. */
function stepWind(g: Game, e: Enemy, dt: number): void {
  const b = g.boss!, w = b.wind!;
  const p = g.player;
  e.vx = e.vz = 0;
  e.crouch = false;
  e.stateT += dt;
  perceive(g, e);
  faceToward(e, p.x, p.z, 8, dt);
  w.t -= dt;
  if (w.t > 0) return;
  b.wind = null;
  // where he will be a moment on (his speed, a little), then one either side of that in phase 3
  const tx = p.x + p.vx * 0.35, tz = p.z + p.vz * 0.35;
  if (w.n <= 1) b.throwAt(g, e, tx, tz);
  else {
    const dx = tx - e.x, dz = tz - e.z, l = Math.hypot(dx, dz) || 1;
    const rx = -dz / l, rz = dx / l;
    b.throwAt(g, e, tx + rx * GR.spread3, tz + rz * GR.spread3);
    b.throwAt(g, e, tx - rx * GR.spread3, tz - rz * GR.spread3);
  }
  b.grenadeNext = (b.phase >= 3 ? GR.every3 : GR.every2) + g.rng.next();
  e.fireT = Math.max(e.fireT, 0.6);
}

/** The last stand's run: the bag, then the terrace door; there she turns and fights. */
function runFor(g: Game, e: Enemy, dt: number): void {
  const b = g.boss!;
  e.stateT += dt;
  e.crouch = false;
  perceive(g, e);
  const [tx, tz] = b.lastStand === 1 ? b.bag : b.terrace;
  if (Math.hypot(tx - e.x, tz - e.z) < 0.7) {
    if (b.lastStand === 1) {
      b.lastStand = 2;
      e.path = [];
      e.repath = 0;
      g.emit({ type: "boss", what: "bag" });
    } else {
      b.lastStand = 3;
      e.engageAt = MADAME.engage;
      startRush(g, e);
    }
    e.vx = e.vz = 0;
    return;
  }
  e.repath -= dt;
  if (e.repath <= 0 || e.pathI >= e.path.length) {
    e.repath = 0.5;
    e.path = g.graph.path(e.x, e.y, e.z, tx, 0, tz) ?? [];
    e.path.push({ x: tx, z: tz });
    e.pathI = 0;
  }
  followPath(g, e, MADAME.lastStandRun, dt);
  if (e.vx || e.vz) faceToward(e, e.x + e.vx, e.z + e.vz, 10, dt);
}
