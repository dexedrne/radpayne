// Heavy (round-2 plan section 3): a rival Radbro in black with a pump shotgun. Slow, never takes cover.
//   idle -> alert (reaction) -> advance along the waypoint graph at 1.5 m/s (he stops walking in at
//   ~4.5 m) and fires whenever he is within 12 m with a line of sight. Every shot has a tell: he raises
//   the gun for 0.35 s with a faint red laser sight on (e.tell > 0), stands still, then fires 8 pellets.
//   A single hit of 40+ damage staggers him for 0.6 s (e.stagger > 0), which cancels the shot in the
//   tell. Six shells, then a 1.6 s reload.
// Runs on world time like the goon.
import type { Enemy } from "../sim/actors.ts";
import type { Game } from "../sim/game.ts";
import { ENEMY, HEAVY } from "../sim/tuning.ts";
import { alertGoon, faceToward, followPath, perceive, setState, slotFree } from "./goon.ts";

const H = ENEMY.heavy;

export function stepHeavy(g: Game, e: Enemy, dt: number): void {
  const p = g.player;
  e.stateT += dt;
  if (e.flinch > 0) e.flinch -= dt;
  const playerAlive = p.mode !== "dead";
  perceive(g, e);
  e.vx = 0;
  e.vz = 0;
  e.leanTarget = 0;
  e.crouch = false;
  if (e.fireT > 0) e.fireT -= dt;
  if (e.reloadT > 0) e.reloadT = Math.max(0, e.reloadT - dt);

  // a stagger stops everything (and has already cancelled the tell)
  if (e.stagger > 0) {
    e.stagger = Math.max(0, e.stagger - dt);
    e.tell = 0;
    return;
  }

  switch (e.state) {
    case "inactive":
    case "dead":
      return;
    case "idle":
      if (e.sees) alertGoon(g, e);
      return;
    case "alert":
      faceToward(e, p.x, p.z, 4, dt);
      e.react -= dt;
      if (e.react <= 0) {
        g.shout(e);
        setState(e, "advance");
        e.repath = 0;
        e.fireT = Math.max(e.fireT, 0.3);
      }
      return;
    default:
      if (e.state !== "advance") setState(e, "advance");
  }

  const dx = p.x - e.x, dz = p.z - e.z;
  const dist = Math.sqrt(dx * dx + dz * dz) || 1;

  // the tell: gun up, laser on, feet planted; the shot at the end of it
  if (e.tell > 0) {
    faceToward(e, p.x, p.z, 7, dt);
    e.tell -= dt;
    if (e.tell <= 0) {
      e.tell = 0;
      if (playerAlive && g.canShoot(e)) {
        e.lastShotT = g.time;
        g.enemyFire(e, false);
        e.shells--;
        if (e.shells <= 0) { e.shells = HEAVY.shells; e.reloadT = HEAVY.reload; }
      }
      e.fireT = H.fireInterval * (1 + 0.3 * g.rng.next());
    }
    return;
  }

  // start a shot: in range, seen, gun ready, a shooter slot free
  if (playerAlive && e.sees && dist <= HEAVY.range && e.fireT <= 0 && e.reloadT <= 0 && e.flinch <= 0 && g.canShoot(e) && slotFree(g, e)) {
    e.tell = HEAVY.tell;
    e.lastShotT = g.time; // holds his slot through the tell
    faceToward(e, p.x, p.z, 7, dt);
    return;
  }

  // advance (not while reloading: he stands and racks shells in)
  if (playerAlive && dist > HEAVY.holdAt && e.reloadT <= 0) {
    e.repath -= dt;
    if (e.repath <= 0 || e.pathI >= e.path.length) {
      e.repath = HEAVY.repath;
      e.path = g.graph.path(e.x, e.y, e.z, p.x, p.y, p.z) ?? [{ x: p.x, z: p.z }];
      e.pathI = 0;
    }
    followPath(g, e, H.walk, dt);
  }
  if (e.sees) faceToward(e, p.x, p.z, 5, dt);
  else if (e.vx || e.vz) faceToward(e, e.x + e.vx, e.z + e.vz, 6, dt);
}
