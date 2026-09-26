// A simple test bot that plays a room: aims at the nearest hostile it can see (torso, head when close),
// fires, walks toward the next one along the waypoint graph, pops bullet time when two or more are
// shooting, dives when hurt, uses copium below half health, walks to the exit once the room is clear.
// It never shoots the crowd (they are not hostiles), picks up the weapons it walks past (and goes for
// one lying within 20 m when nothing is in sight), and takes the shotgun up close, the SMGs at range.
// At a locked breach door (room 3) it dives through when it is within 4 m and heading for it.
// Used by the Node smoke test and the browser's ?bot mode (same input frames -> same result).
import { HB_HEAD, HB_TORSO, aimPoint, makeCapsules } from "../combat/hitboxes.ts";
import { PICKUPS, WEAPONS, ammoLeft, slotOf, type WeaponId } from "../combat/weapons.ts";
import { insideTrigger, type Game } from "./game.ts";
import { pivotOf } from "./player.ts";
import { emptyInput, type InputFrame } from "./types.ts";

export class Bot {
  private readonly caps = makeCapsules();
  private readonly v = { x: 0, y: 0, z: 0 };
  private readonly piv = { x: 0, y: 0, z: 0 };
  private path: Array<{ x: number; z: number }> = [];
  private pathFor = -2;
  private repath = 0;
  private dodgeCd = 0;
  private strafe = 1;
  private strafeT = 0;
  private onTarget = 0;
  /** Unstick: progress check while walking (hop over low stuff, sidestep). */
  private stuckT = 0;
  private stuckX = 0;
  private stuckZ = 0;
  private sidestep = 0;
  readonly frame: InputFrame = emptyInput();
  /** Aim turn rate (rad/s) and the time on target before the first shot: a human-ish handicap. */
  readonly turnRate: number;
  readonly settle: number;
  /** Demo run (the browser check): bullet time at first contact, a sideways shootdodge after the first kill, the full kill cam. */
  readonly demo: boolean;
  private demoBt = false;
  private demoDodge = false;
  private swapCd = 0;
  /** Test / dev: keep this weapon in hand whenever it has rounds (the view checks of one gun). */
  only: WeaponId | null = null;
  private fired = false;
  /** Seconds without a target (bullet time goes off only after a moment: no on / off every step). */
  private lost = 0;
  constructor(turnRate = 3.5, settle = 0.3, demo = false) {
    this.turnRate = turnRate;
    this.settle = settle;
    this.demo = demo;
  }

  /** Turn the aim toward yaw / pitch at most turnRate per step. */
  private turn(f: InputFrame, yaw: number, pitch: number): void {
    const max = this.turnRate / 120;
    let dy = yaw - f.yaw;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    f.yaw += Math.max(-max, Math.min(max, dy));
    f.pitch += Math.max(-max, Math.min(max, pitch - f.pitch));
  }

  next(g: Game): InputFrame {
    const f = this.frame;
    const p = g.player;
    f.fire = f.bt = f.dodge = f.jump = f.reload = f.copium = f.skip = false;
    f.slot = 0;
    f.moveX = f.moveY = 0;
    f.yaw = p.yaw;
    f.pitch = p.pitch;
    if (g.phase === "killcam") { f.skip = !this.demo && g.killcam !== null && g.killcam.t > 0.6; return f; }
    if (p.mode === "dead") return f;
    this.dodgeCd -= 1 / 120;
    this.swapCd -= 1 / 120;
    const piv = pivotOf(p, this.piv, g.world);

    // target: nearest visible live hostile
    let best = -1, bd = Infinity;
    for (const e of g.enemies) {
      if (e.state === "dead" || e.state === "inactive") continue;
      const part = HB_TORSO;
      if (!aimPoint(e.hit.body, e.hit.pose, part, this.v, this.caps)) continue;
      const d = (this.v.x - piv.x) ** 2 + (this.v.z - piv.z) ** 2;
      if (d < bd && g.world.clear(piv.x, piv.y, piv.z, this.v.x, this.v.y, this.v.z, true)) { bd = d; best = e.idx; }
    }
    let shooting = 0;
    for (const e of g.enemies) if (e.state === "peek" || e.state === "engage" || (e.state === "move" && e.sees)) shooting++;

    this.lost = best >= 0 ? 0 : this.lost + 1 / 120;
    if (best >= 0) {
      const e = g.enemies[best];
      // the shotgun spreads: aim at the chest with it
      const part = bd < 14 * 14 && p.weapon.id !== "shotgun" ? HB_HEAD : HB_TORSO;
      aimPoint(e.hit.body, e.hit.pose, part, this.v, this.caps);
      const dx = this.v.x - piv.x, dy = this.v.y - piv.y, dz = this.v.z - piv.z;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      this.turn(f, Math.atan2(-dx, -dz), Math.asin(dy / l));
      this.onTarget = g.aimEnemy === best ? this.onTarget + 1 / 120 : 0;
      f.fire = this.onTarget >= this.settle;
      // semi-auto: a fresh press per shot
      if (!WEAPONS[p.weapon.id].auto) { f.fire = f.fire && !this.fired; this.fired = f.fire; }
      this.pickWeapon(g, f, Math.sqrt(bd));
      // strafe while shooting
      this.strafeT -= 1 / 120;
      if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 1.2; }
      f.moveX = this.strafe * 0.6;
      if (shooting >= 2 && !g.bulletTime && g.meter > 3) f.bt = true;
      if (p.health < 70 && this.dodgeCd <= 0 && p.mode === "normal" && shooting >= 1) { f.dodge = true; this.dodgeCd = 4; }
      if (this.demo) {
        if (!this.demoBt && shooting >= 1 && !g.bulletTime && g.meter > 3) { f.bt = true; this.demoBt = true; }
        if (!this.demoDodge && g.stats.kills >= 1 && p.mode === "normal" && p.grounded) { f.dodge = true; f.moveX = this.strafe; this.demoDodge = true; this.dodgeCd = 4; }
      }
    } else {
      if (g.bulletTime && this.lost > 0.6) f.bt = true; // off again (not the moment a target blinks out of sight)
      // walk toward the nearest live goon (or the exit once clear)
      let tx = NaN, tz = NaN, key = -1;
      if (g.phase === "clear") {
        const ex = g.level.markers.find(m => m.kind === "trigger" && m.data.action === "exit");
        if (ex) { tx = ex.x; tz = ex.z; key = 999; }
      } else {
        let nd = Infinity;
        for (const e of g.enemies) {
          if (e.state === "dead" || e.state === "inactive") continue;
          const d = (e.x - p.x) ** 2 + (e.z - p.z) ** 2;
          if (d < nd) { nd = d; tx = e.x; tz = e.z; key = e.idx; }
        }
        // a weapon or ammo lying within 20 m that it can use: fetch it first
        let kd = 20 * 20;
        for (let i = 0; i < g.pickups.length; i++) {
          const k = g.pickups[i];
          const d = PICKUPS[k.item];
          if (k.taken || !d || (!d.weapon && !p.owned.includes(d.ammo))) continue;
          const dd = (k.x - p.x) ** 2 + (k.z - p.z) ** 2;
          if (dd < kd) { kd = dd; tx = k.x; tz = k.z; key = 700 + i; }
        }
        if (key < 0) {
          // nothing alive and awake: walk to the next trigger we have not fired (not the fallbacks)
          const t = g.triggers.find(tr => !tr.fired && tr.data.action !== "exit" && typeof tr.data.afterKills !== "number");
          if (t) { tx = t.x; tz = t.z; key = 500; }
        }
      }
      if (!Number.isNaN(tx)) {
        this.repath -= 1 / 120;
        if (key !== this.pathFor || this.repath <= 0) {
          // a goon walled into her spot (a booth) has no path: go to the waypoint nearest to her instead
          let path = g.graph.path(p.x, p.y, p.z, tx, 0, tz);
          if (!path) {
            const n = g.graph.nearest(tx, 0, tz, false);
            const w = n >= 0 ? g.graph.nodes[n] : null;
            path = w ? g.graph.path(p.x, p.y, p.z, w.x, w.y, w.z) : null;
          }
          this.path = path ?? [{ x: tx, z: tz }];
          this.pathFor = key;
          this.repath = 1;
        }
        while (this.path.length > 1 && (this.path[0].x - p.x) ** 2 + (this.path[0].z - p.z) ** 2 < 0.5) this.path.shift();
        const wp = this.path[0];
        const dx = wp.x - p.x, dz = wp.z - p.z;
        this.turn(f, Math.atan2(-dx, -dz), 0);
        // walk straight at the waypoint whatever the view is doing (camera-relative input, like a
        // player strafing round a corner): walking along the view while it turns drifts off the path
        const dl = Math.hypot(dx, dz) || 1;
        const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw);
        f.moveY = (dx * -sy + dz * -cy) / dl;
        f.moveX = (dx * cy - dz * sy) / dl;
        // a locked door in the way: dive through it (inside its trigger, within 4 m, heading for it)
        if (p.mode === "normal" && p.grounded && p.dodgeCooldown <= 0) for (const t of g.triggers) {
          if (t.fired || t.data.action !== "breach" || !insideTrigger(t, p.x, p.y + 0.9, p.z)) continue;
          const b = g.doorOf(t);
          if (!b) continue;
          const ox = b.cx - p.x, oz = b.cz - p.z, od = Math.hypot(ox, oz);
          if (od < 4 && (ox * dx + oz * dz) / (od * dl) > 0.85) f.dodge = true;
        }
        // no progress for a second: hop (low barriers) and sidestep, then repath
        this.stuckT += 1 / 120;
        if ((p.x - this.stuckX) ** 2 + (p.z - this.stuckZ) ** 2 > 0.25) { this.stuckT = 0; this.stuckX = p.x; this.stuckZ = p.z; }
        if (this.stuckT > 1) { f.jump = true; this.sidestep = 0.6; this.stuckT = 0; this.repath = 0; this.strafe = -this.strafe; }
        if (this.sidestep > 0) { this.sidestep -= 1 / 120; f.moveX = this.strafe; }
      }
    }
    if (p.health < 50 && p.copium > 0 && p.healLeft <= 0) f.copium = true;
    if (p.mode === "prone") f.moveY = 1;
    return f;
  }

  /** The shotgun within 9 m, the SMGs past it, the pistols when the others are dry. */
  private pickWeapon(g: Game, f: InputFrame, dist: number): void {
    const p = g.player;
    if (this.swapCd > 0 || p.owned.length < 2 || p.weapon.reloadT > 0 && ammoLeft(p.weapon) > 0) return;
    const has = (id: WeaponId) => p.owned.includes(id) && ammoLeft(p.arsenal[id]!) > 0;
    const base = p.owned[0];
    const want: WeaponId = this.only && has(this.only) ? this.only : dist < 9 && has("shotgun") ? "shotgun" : base === "ak" ? base : has("smgs") ? "smgs" : has("shotgun") && dist < 14 ? "shotgun" : base;
    if (want !== p.weapon.id) { f.slot = slotOf(want); this.swapCd = 1.5; }
  }
}
