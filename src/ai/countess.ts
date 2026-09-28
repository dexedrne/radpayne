// The Countess's brain (room 10, the vault), on world time like the gang. Her room (the phases, the
// lift doors, the security beams, her last stand) is sim/ch2/vault.ts.
//   idle -> alert (she says her piece first: COUNTESS.introHold, no damage) ->
//   phase 1 "the ledger": up on the counting desk in the middle of the vault, she walks its edge to keep
//     him in sight and fires the rifle: a white laser on him for the tell (COUNTESS.tell), then one round
//     (move, dive or break the line), a pause, the next;
//   phase 2 "the count": down the desk's steps onto the floor, the gang's cover-and-peek with the rifle
//     (the same white tell before every round), while the vault's beams sweep;
//   phase 3 "the final score": she runs at him like a rusher and fires from closer with a quicker tell.
//   At 10 % she runs for the vault door (the world slows by itself), then fights on from there.
// A phase change gives her COUNTESS.shift of no damage (and she does nothing else).
import type { Enemy } from "../sim/actors.ts";
import type { Game } from "../sim/game.ts";
import { COUNTESS, perDiff } from "../sim/tuning2.ts";
import { faceToward, followPath, goToCover, perceive, setState, stepGoon, within } from "./goon.ts";
import { startRush, stepRusher } from "./rusher.ts";
import type { Vault } from "../sim/ch2/vault.ts";

export function stepCountess(g: Game, e: Enemy, dt: number): void {
  const v = g.stage && g.stage.kind === "vault" ? (g.stage as Vault) : null;
  if (!v) { stepGoon(g, e, dt); return; }
  const p = g.player;
  if (e.state === "idle") { stepGoon(g, e, dt); return; }
  if (e.state === "alert") {
    if (!v.started) {
      v.started = true;
      e.react = Math.max(e.react, COUNTESS.introHold);
      v.introT = COUNTESS.introHold;
      g.emit({ type: "stage", what: "intro", id: e.idx });
    }
    stepGoon(g, e, dt);
    if (e.state !== "alert" && v.phase === 1) setState(e, "engage"); // (phase 1: her own brain from here)
    return;
  }
  // a phase change: she does nothing else for a moment
  if (v.shiftT > 0 || e.stagger > 0) {
    e.stateT += dt;
    e.stagger = Math.max(0, e.stagger - dt);
    e.vx = e.vz = 0;
    e.tell = 0;
    perceive(g, e);
    return;
  }
  if (v.lastStand === 1) { runForDoor(g, v, e, dt); return; }
  const before = e.tell;
  if (v.phase === 1) desk(g, v, e, dt);
  else if (v.phase === 2 && v.lastStand === 0) {
    if (e.state === "engage" && e.perch) { e.perch = false; goToCover(g, e); }
    stepGoon(g, e, dt);
  } else stepRusher(g, e, dt);
  // the rifle's tell is hers, not the gang's sniper's
  if (before <= 0 && e.tell > 0 && v.phase > 1) {
    e.tell = perDiff(v.phase >= 3 ? COUNTESS.tell3 : COUNTESS.tell, g.difficulty);
    g.emit({ type: "stage", what: "aim", id: e.idx });
  }
  void p;
}

/** Phase 1: up on the counting desk, the edge nearest him, the rifle. */
function desk(g: Game, v: Vault, e: Enemy, dt: number): void {
  const p = g.player;
  e.stateT += dt;
  perceive(g, e);
  e.crouch = false;
  e.leanTarget = 0;
  e.vx = e.vz = 0;
  const [cx, cz] = v.center;
  if (e.tell > 0) {
    // the tell: feet planted, the laser on him; then the round (if the line is still there)
    faceToward(e, p.x, p.z, 10, dt);
    e.lastShotT = g.time;
    e.tell -= dt;
    if (e.tell <= 0) {
      e.tell = 0;
      if (g.canShoot(e) && p.mode !== "dead") { e.shots++; g.enemyFire(e, false); }
      v.shotNext = within(COUNTESS.every[0], COUNTESS.every[1], g.rng.next());
    }
    return;
  }
  // walk the desk's edge toward him (the side he is on keeps him in her sight)
  const want = Math.atan2(p.x - cx, p.z - cz);
  const at = Math.atan2(e.x - cx, e.z - cz);
  let d = want - at;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const a = at + Math.sign(d) * Math.min(Math.abs(d), (COUNTESS.walk / v.deskR) * dt * 4);
  const tx = cx + Math.sin(a) * v.deskR, tz = cz + Math.cos(a) * v.deskR;
  const mx = tx - e.x, mz = tz - e.z, ml = Math.hypot(mx, mz);
  if (ml > 0.05) { const s = Math.min(COUNTESS.walk, ml / dt); e.vx = (mx / ml) * s; e.vz = (mz / ml) * s; }
  faceToward(e, p.x, p.z, 6, dt);
  v.shotNext -= dt;
  if (v.shotNext <= 0 && e.sees && p.mode !== "dead" && g.canShoot(e)) {
    e.tell = perDiff(COUNTESS.tell, g.difficulty);
    e.vx = e.vz = 0;
    e.lastShotT = g.time;
    g.emit({ type: "stage", what: "aim", id: e.idx });
  }
}

/** The last stand: down to the vault door (no shooting on the way), then she charges. */
function runForDoor(g: Game, v: Vault, e: Enemy, dt: number): void {
  e.stateT += dt;
  e.crouch = false;
  e.tell = 0;
  perceive(g, e);
  const [tx, tz] = v.door;
  if (Math.hypot(tx - e.x, tz - e.z) < 0.8) {
    v.lastStand = 2;
    e.engageAt = COUNTESS.engage;
    startRush(g, e);
    e.vx = e.vz = 0;
    g.emit({ type: "stage", what: "cornered", id: e.idx });
    return;
  }
  e.repath -= dt;
  if (e.repath <= 0 || e.pathI >= e.path.length) {
    e.repath = 0.5;
    e.path = g.graph.path(e.x, e.y, e.z, tx, 0, tz) ?? [];
    e.path.push({ x: tx, z: tz });
    e.pathI = 0;
  }
  followPath(g, e, COUNTESS.lastStandRun, dt);
  if (e.vx || e.vz) faceToward(e, e.x + e.vx, e.z + e.vz, 10, dt);
}
