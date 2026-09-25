// Rusher (round-2 plan section 2): a Milady with an SMG who does not bother with cover.
//   idle -> alert (reaction) -> rush: paths straight at the player until she is 5-9 m away (her own
//   distance, seeded) -> engage: strafes left / right, flipping every 1.2 s, and fires bursts of 6.
//   Out of range or out of sight she rushes again. Below 25 HP she takes cover ONCE (move -> cover ->
//   one peek), then rushes again.
// Runs on world time like the goon.
import type { Enemy } from "../sim/actors.ts";
import type { Game } from "../sim/game.ts";
import { AI, ENEMY, RUSHER } from "../sim/tuning.ts";
import { alertGoon, faceToward, followPath, perceive, pickCover, releaseCover, setState, tryFire, within } from "./goon.ts";

const R = ENEMY.rusher;

/** Start (or restart) the charge. */
export function startRush(g: Game, e: Enemy): void {
  releaseCover(g, e);
  setState(e, "rush");
  e.repath = 0;
  e.path = [];
  e.pathI = 0;
}

export function stepRusher(g: Game, e: Enemy, dt: number): void {
  const p = g.player;
  e.stateT += dt;
  if (e.flinch > 0) e.flinch -= dt;
  const playerAlive = p.mode !== "dead";
  perceive(g, e);
  e.vx = 0;
  e.vz = 0;
  e.leanTarget = 0;
  let crouch = false;
  const dx = p.x - e.x, dz = p.z - e.z;
  const dist = Math.sqrt(dx * dx + dz * dz) || 1;

  // hurt: one trip to cover
  if (!e.coverUsed && e.hp < RUSHER.coverBelow && (e.state === "rush" || e.state === "engage")) {
    e.coverUsed = true;
    const ci = pickCover(g, e);
    const c = ci >= 0 ? g.graph.covers[ci] : null;
    const path = c ? g.graph.path(e.x, e.y, e.z, c.x, c.y, c.z) : null;
    if (c && path) {
      c.claimed = e.idx;
      e.cover = ci;
      e.path = path;
      e.pathI = 0;
      setState(e, "move");
    }
  }

  switch (e.state) {
    case "inactive":
    case "dead":
      return;
    case "idle":
      if (e.sees) alertGoon(g, e);
      break;
    case "alert":
      faceToward(e, p.x, p.z, 6, dt);
      e.react -= dt;
      if (e.react <= 0) { g.shout(e); startRush(g, e); }
      break;
    case "rush": {
      if (!playerAlive) break;
      if (dist <= e.engageAt && e.sees) {
        setState(e, "engage");
        e.timer = RUSHER.strafeEvery;
        e.strafe = g.rng.next() < 0.5 ? -1 : 1;
        e.burstLeft = R.burst;
        e.fireT = 0.2 + 0.15 * g.rng.next();
        break;
      }
      e.repath -= dt;
      if (e.repath <= 0 || e.pathI >= e.path.length) {
        e.repath = RUSHER.repath;
        e.path = g.graph.path(e.x, e.y, e.z, p.x, p.y, p.z) ?? [{ x: p.x, z: p.z }];
        e.pathI = 0;
      }
      followPath(g, e, R.run, dt);
      if (e.vx || e.vz) faceToward(e, e.x + e.vx, e.z + e.vz, 10, dt);
      break;
    }
    case "engage": {
      faceToward(e, p.x, p.z, 9, dt);
      e.timer -= dt;
      if (e.timer <= 0) { e.strafe = -e.strafe; e.timer = RUSHER.strafeEvery; }
      // strafe across the line to him; drift in or out to hold her distance
      let vx = (-dz / dist) * e.strafe * R.walk, vz = (dx / dist) * e.strafe * R.walk;
      const hold = dist - e.engageAt;
      if (Math.abs(hold) > 1) { vx += (dx / dist) * Math.sign(hold) * R.walk * 0.5; vz += (dz / dist) * Math.sign(hold) * R.walk * 0.5; }
      e.vx = vx;
      e.vz = vz;
      if (e.sees && e.flinch <= 0 && playerAlive) tryFire(g, e, dt, true);
      // lost him (a corner, too far): charge again
      if ((!e.sees && e.stateT > 0.8) || dist > e.engageAt + 5) startRush(g, e);
      break;
    }
    case "move": {
      const arrived = followPath(g, e, R.run, dt);
      if (e.vx || e.vz) faceToward(e, e.x + e.vx, e.z + e.vz, 10, dt);
      if (arrived) {
        setState(e, "cover");
        e.timer = within(AI.coverWait[0], AI.coverWait[1], g.rng.next());
      } else if (e.stateT > 8) startRush(g, e);
      break;
    }
    case "cover": {
      const c = g.graph.covers[e.cover];
      faceToward(e, p.x, p.z, 5, dt);
      crouch = !!c && !c.high;
      e.timer -= dt;
      if (e.timer <= 0 && playerAlive) {
        setState(e, "peek");
        e.timer = within(AI.peekTime[0], AI.peekTime[1], g.rng.next());
        e.burstLeft = R.burst;
        e.fireT = 0.25;
      }
      break;
    }
    case "peek": {
      const c = g.graph.covers[e.cover];
      faceToward(e, p.x, p.z, 8, dt);
      if (c?.high) e.leanTarget = c.side;
      e.timer -= dt;
      if (e.flinch <= 0) tryFire(g, e, dt, false);
      if (e.timer <= 0 || !playerAlive) startRush(g, e);
      break;
    }
    default:
      startRush(g, e);
  }
  e.lean += (e.leanTarget - e.lean) * Math.min(1, 10 * dt);
  e.crouch = crouch;
}
