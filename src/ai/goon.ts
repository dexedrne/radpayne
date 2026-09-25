// Goon state machine (spec section 5):
//   idle -> alert (reaction delay) -> move to cover -> cover <-> peek & shoot -> reposition (move)
//   no usable cover -> engage (stand, strafe, shoot). Hits flinch (no firing for a moment).
// Runs on world time, so bullet time stretches every reaction and burst by 1 / 0.3.
import type { Enemy } from "../sim/actors.ts";
import type { Game } from "../sim/game.ts";
import { AI, ENEMY } from "../sim/tuning.ts";

const G = ENEMY.goon;

export function setState(e: Enemy, s: Enemy["state"]): void {
  e.state = s;
  e.stateT = 0;
}

/** Alert an idle goon (seen the player, heard a shot, got hit, a trigger, a friend shouted). */
export function alertGoon(g: Game, e: Enemy, extraDelay = 0): void {
  if (e.state !== "idle") return;
  setState(e, "alert");
  e.react = g.diff.reaction * (0.85 + 0.3 * g.rng.next()) + extraDelay;
  g.emit({ type: "alert", enemy: e.idx });
}

const within = (lo: number, hi: number, r: number) => lo + (hi - lo) * r;

/** Pick the best free cover point that protects from the player and has a path; -1 if none. */
export function pickCover(g: Game, e: Enemy): number {
  const p = g.player;
  let best = -1, bestScore = Infinity;
  const covers = g.graph.covers;
  for (let i = 0; i < covers.length; i++) {
    const c = covers[i];
    if (c.claimed >= 0 && c.claimed !== e.idx) continue;
    const px = p.x - c.x, pz = p.z - c.z;
    const pd = Math.sqrt(px * px + pz * pz);
    if (pd < AI.coverMinDist) continue;
    // protects: the cover faces the player
    if ((c.fx * px + c.fz * pz) / pd < 0.35) continue;
    const d = Math.sqrt((c.x - e.x) ** 2 + (c.z - e.z) ** 2);
    if (d > 30) continue;
    const score = d + 0.35 * Math.abs(pd - 13) + (i === e.lastCover ? 40 : 0);
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return best;
}

function releaseCover(g: Game, e: Enemy): void {
  if (e.cover >= 0 && g.graph.covers[e.cover].claimed === e.idx) g.graph.covers[e.cover].claimed = -1;
  e.lastCover = e.cover;
  e.cover = -1;
}

/** Head for a cover point (claims it) or fall back to engaging in the open. */
function goToCover(g: Game, e: Enemy): void {
  releaseCover(g, e);
  if (e.perch) { // fire escape / balcony: shoot from where it stands
    setState(e, "engage");
    e.timer = within(1.2, 2.4, g.rng.next());
    return;
  }
  const ci = pickCover(g, e);
  if (ci >= 0) {
    const c = g.graph.covers[ci];
    const path = g.graph.path(e.x, e.y, e.z, c.x, c.y, c.z);
    if (path) {
      c.claimed = e.idx;
      e.cover = ci;
      e.path = path;
      e.pathI = 0;
      setState(e, "move");
      return;
    }
  }
  setState(e, "engage");
  e.timer = within(1.2, 2.4, g.rng.next());
}

/** Cover no longer protects (the player walked around it). */
function flanked(g: Game, e: Enemy): boolean {
  if (e.cover < 0) return true;
  const c = g.graph.covers[e.cover];
  const px = g.player.x - c.x, pz = g.player.z - c.z;
  const pd = Math.sqrt(px * px + pz * pz) || 1;
  return (c.fx * px + c.fz * pz) / pd < 0.1 || pd < 2.5;
}

function faceToward(e: Enemy, x: number, z: number, rate: number, dt: number): void {
  const want = Math.atan2(x - e.x, z - e.z);
  let d = want - e.facing;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const k = Math.min(1, rate * dt);
  e.facing += d * k;
}

/** Walk the current path; returns true on arrival. */
function followPath(g: Game, e: Enemy, speed: number, dt: number): boolean {
  if (e.pathI >= e.path.length) { e.vx = e.vz = 0; return true; }
  const t = e.path[e.pathI];
  const dx = t.x - e.x, dz = t.z - e.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < AI.arrive) {
    e.pathI++;
    return e.pathI >= e.path.length;
  }
  const s = Math.min(speed, d / dt);
  e.vx = (dx / d) * s;
  e.vz = (dz / d) * s;
  return false;
}

/** One AI step for a goon on world time `dt`. */
export function stepGoon(g: Game, e: Enemy, dt: number): void {
  const p = g.player;
  e.stateT += dt;
  if (e.flinch > 0) e.flinch -= dt;
  const playerAlive = p.mode !== "dead";

  // perception (staggered line-of-sight checks)
  if ((g.stepN + e.idx) % AI.losEvery === 0) {
    e.sees = playerAlive && g.canSee(e);
    if (e.sees) { e.lastSeenX = p.x; e.lastSeenZ = p.z; }
  }

  e.vx = 0;
  e.vz = 0;
  e.leanTarget = 0;
  let wantCrouch = false;

  switch (e.state) {
    case "inactive":
    case "dead":
      return;
    case "idle": {
      if (e.sees) alertGoon(g, e);
      break;
    }
    case "alert": {
      faceToward(e, p.x, p.z, 6, dt);
      e.react -= dt;
      if (e.react <= 0) {
        g.shout(e);
        goToCover(g, e);
      }
      break;
    }
    case "move": {
      const arrived = followPath(g, e, G.run, dt);
      if (e.sees && e.flinch <= 0) {
        faceToward(e, p.x, p.z, 8, dt);
        tryFire(g, e, dt, true);
      } else if (e.vx || e.vz) faceToward(e, e.x + e.vx, e.z + e.vz, 10, dt);
      if (arrived) {
        if (e.cover >= 0) {
          setState(e, "cover");
          e.timer = within(AI.coverWait[0], AI.coverWait[1], g.rng.next()) * 0.6;
          e.peeksMax = AI.peeksBeforeMove[0] + Math.floor(g.rng.next() * (AI.peeksBeforeMove[1] - AI.peeksBeforeMove[0] + 1));
          e.peeks = 0;
        } else setState(e, "engage");
      } else if (e.stateT > 12) goToCover(g, e); // stuck: pick again
      break;
    }
    case "cover": {
      const c = g.graph.covers[e.cover];
      if (!c) { goToCover(g, e); break; }
      faceToward(e, p.x, p.z, 5, dt);
      wantCrouch = !c.high;
      e.timer -= dt;
      if (flanked(g, e)) { goToCover(g, e); break; }
      if (e.timer <= 0 && playerAlive) {
        setState(e, "peek");
        e.timer = within(AI.peekTime[0], AI.peekTime[1], g.rng.next());
        e.burstLeft = G.burst;
        e.fireT = 0.25 + 0.2 * g.rng.next(); // aim before the first shot
      }
      break;
    }
    case "peek": {
      const c = g.graph.covers[e.cover];
      if (!c) { goToCover(g, e); break; }
      faceToward(e, p.x, p.z, 8, dt);
      if (c.high) e.leanTarget = c.side;
      e.timer -= dt;
      if (e.flinch <= 0) tryFire(g, e, dt, false);
      if (flanked(g, e)) { goToCover(g, e); break; }
      if (e.timer <= 0 || !playerAlive) {
        e.peeks++;
        if (e.peeks >= e.peeksMax) goToCover(g, e);
        else {
          setState(e, "cover");
          e.timer = within(AI.coverWait[0], AI.coverWait[1], g.rng.next());
        }
      }
      break;
    }
    case "engage": {
      faceToward(e, p.x, p.z, 8, dt);
      // strafe sideways relative to the player, flip now and then
      e.timer -= dt;
      if (e.timer <= 0) {
        e.strafe = g.rng.next() < 0.5 ? -1 : 1;
        e.timer = within(1.2, 2.4, g.rng.next());
        if (g.graph.covers.length && e.stateT > 3 && !e.perch) { goToCover(g, e); break; }
      }
      if (e.perch) { // hold the platform; duck behind the rail now and then
        wantCrouch = e.strafe < 0 && !e.sees;
        if (e.sees && e.flinch <= 0) tryFire(g, e, dt, true);
        break;
      }
      const dx = p.x - e.x, dz = p.z - e.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      let vx = (-dz / d) * e.strafe * G.walk, vz = (dx / d) * e.strafe * G.walk;
      if (d > 16) { vx += (dx / d) * G.walk; vz += (dz / d) * G.walk; }
      e.vx = vx;
      e.vz = vz;
      if (e.sees && e.flinch <= 0) tryFire(g, e, dt, true);
      break;
    }
  }

  // lean / crouch ease (world time)
  e.lean += (e.leanTarget - e.lean) * Math.min(1, 10 * dt);
  e.crouch = wantCrouch;
}

/** Bursts: `burst` shots at the fire interval, then a pause. */
function tryFire(g: Game, e: Enemy, dt: number, moving: boolean): void {
  e.fireT -= dt;
  if (e.fireT > 0) return;
  if (!g.canShoot(e)) { e.fireT = 0.15; return; }
  g.enemyFire(e, moving);
  e.burstLeft--;
  if (e.burstLeft <= 0) {
    e.burstLeft = G.burst;
    e.fireT = G.fireInterval * (2.2 + 1.5 * g.rng.next());
  } else e.fireT = G.fireInterval * (0.85 + 0.3 * g.rng.next());
}

/** Kill cleanup: release cover. */
export function onGoonDeath(g: Game, e: Enemy): void {
  releaseCover(g, e);
  e.vx = e.vz = 0;
}
