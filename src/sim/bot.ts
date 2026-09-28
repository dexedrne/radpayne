// A simple test bot that plays a room: aims at the nearest hostile it can see (torso, head when close),
// fires, walks toward the next one along the waypoint graph, pops bullet time when two or more are
// shooting, dives when hurt, uses copium below half health, walks to the exit once the room is clear.
// It never shoots the crowd (they are not hostiles), picks up the weapons it walks past (and goes for
// one lying within 20 m when nothing is in sight), and takes the shotgun up close, the SMGs at range.
// At a locked breach door (room 3) it dives through when it is within 4 m and heading for it.
// With `blade` (#4764, ?bot&blade) it plays the katana's guard: bullet time as soon as anyone shoots, the
// guard held (at least past a tap) while a round flies at it from the front, the crosshair on the one it
// wants the round to go back to.
// Used by the Node smoke test and the browser's ?bot mode (same input frames -> same result).
import { HB_HEAD, HB_TORSO, aimPoint, makeCapsules } from "../combat/hitboxes.ts";
import { PICKUPS, SLOT_ORDER, WEAPONS, ammoLeft, slotOf, type WeaponId } from "../combat/weapons.ts";
import { insideTrigger, type Game } from "./game.ts";
import { GUARD } from "./tuning.ts";
import { bossAim, grenadeEscape } from "./boss.ts";
import { pivotOf } from "./player.ts";
import { hideRange, segLive, segNearest } from "./cover.ts";
import { emptyInput, type InputFrame } from "./types.ts";

export class Bot {
  private readonly caps = makeCapsules();
  private readonly v = { x: 0, y: 0, z: 0 };
  private readonly piv = { x: 0, y: 0, z: 0 };
  private path: Array<{ x: number; z: number }> = [];
  private pathFor = -2;
  /** Room 5: her wind-ups seen (the bot goes for every other one, as a player who is watching her
   *  might: the rest get thrown, and it runs out of their rings). */
  private winds = 0;
  private windOn = false;
  /** Pickups with no way to them right now (behind the car's shut doors): world time to try again. */
  private noWay = new Map<number, number>();
  private repath = 0;
  private dodgeCd = 0;
  private strafe = 1;
  private strafeT = 0;
  private onTarget = 0;
  /** Unstick: progress check while walking (hop over low stuff, sidestep). */
  private stuckT = 0;
  private stuckN = 0;
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
  private nadeCd = 0;
  /** Test / dev: keep this weapon in hand whenever it has rounds (the view checks of one gun). */
  only: WeaponId | null = null;
  /** #4764: guard against the rounds in bullet time and send them back (the katana smoke). */
  blade = false;
  /** Real seconds the guard stays held (past a tap: a quick let-go would be the cut). */
  private guardFor = 0;
  private fired = false;
  /** Seconds without a target (bullet time goes off only after a moment: no on / off every step). */
  private lost = 0;
  /** Chapter 2: seconds of firing at the same target without a hit (behind a rail, over a pit's edge),
   *  and the targets it walks toward for a while instead of shooting at (enemy index -> world time). */
  private dry = 0;
  private dryFor = -1;
  private hitsSeen = 0;
  private readonly ignore = new Map<number, number>();
  /** Chapter 2: the walk target it has made no headway toward (a wall between, a pen): its key, the
   *  closest it got, since when; and the enemies it leaves as walk targets for a while. */
  private headKey = -1;
  private headBest = Infinity;
  private headT = 0;
  private readonly walkSkip = new Map<number, number>();
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
    f.melee = f.throw = f.interact = f.zoom = f.guard = f.cover = f.aim = false;
    f.slot = 0;
    f.moveX = f.moveY = 0;
    f.yaw = p.yaw;
    f.pitch = p.pitch;
    if (g.phase === "killcam") { f.skip = !this.demo && g.killcam !== null && g.killcam.t > 0.6; return f; }
    if (p.mode === "dead") return f;
    this.dodgeCd -= 1 / 120;
    this.swapCd -= 1 / 120;
    this.nadeCd -= 1 / 120;
    const piv = pivotOf(p, this.piv, g.world);

    // target: nearest visible live hostile
    let best = -1, bd = Infinity;
    for (const e of g.enemies) {
      if (e.state === "dead" || e.state === "inactive") continue;
      if (g.stage && (this.ignore.get(e.idx) ?? -1) > g.time) continue;
      const part = HB_TORSO;
      if (!aimPoint(e.hit.body, e.hit.pose, part, this.v, this.caps)) continue;
      const d = (this.v.x - piv.x) ** 2 + (this.v.z - piv.z) ** 2;
      if (d < bd && g.world.clear(piv.x, piv.y, piv.z, this.v.x, this.v.y, this.v.z, true)) { bd = d; best = e.idx; }
    }
    let shooting = 0;
    for (const e of g.enemies) if (e.state === "peek" || e.state === "engage" || (e.state === "move" && e.sees)) shooting++;

    this.lost = best >= 0 ? 0 : this.lost + 1 / 120;
    // room 5: a shot worth more than any girl (the grenade in her hand, the chandelier's chain over her)
    let special = g.boss ? bossAim(g) : null;
    const windOn = !!g.boss?.wind;
    if (windOn && !this.windOn) this.winds++;
    this.windOn = windOn;
    if (windOn && this.winds % 2 === 0) special = null;
    if (special && g.world.clear(piv.x, piv.y, piv.z, special.x, special.y, special.z, true)) {
      const dx = special.x - piv.x, dy = special.y - piv.y, dz = special.z - piv.z;
      const yaw = Math.atan2(-dx, -dz), pitch = Math.asin(dy / (Math.hypot(dx, dy, dz) || 1));
      this.turn(f, yaw, pitch);
      let dyaw = yaw - f.yaw;
      while (dyaw > Math.PI) dyaw -= 2 * Math.PI;
      while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
      f.fire = Math.abs(dyaw) < 0.015 && Math.abs(pitch - f.pitch) < 0.015;
      if (!WEAPONS[p.weapon.id].auto) { f.fire = f.fire && !this.fired; this.fired = f.fire; }
      this.lost = 0;
    } else if (best >= 0) {
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
      this.pickWeapon(g, f, Math.sqrt(bd), e.kind === "heavy");
      // the sniper beyond 22 m: scoped, standing still
      if (p.weapon.id === "sniper" && Math.sqrt(bd) > 22) f.zoom = true;
      // melee when one is in reach; a grenade into a cluster at 8-18 m
      const reach = g.katana ? 1.8 : 1.4;
      if (Math.sqrt(bd) < reach && p.meleeT <= 0 && p.mode === "normal") { f.melee = true; f.fire = false; }
      if (p.grenades > 0 && this.nadeCd <= 0 && p.mode === "normal") {
        const d = Math.sqrt(bd);
        let near = 0;
        for (const o of g.enemies) if (o !== e && o.state !== "dead" && o.state !== "inactive" && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 < 3.5 * 3.5) near++;
        if (near >= 1 && d >= 8 && d <= 18 && g.aimEnemy === best) { f.throw = true; this.nadeCd = 6; }
      }
      // strafe while shooting
      this.strafeT -= 1 / 120;
      if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 1.2; }
      f.moveX = f.zoom ? 0 : this.strafe * 0.6;
      if (shooting >= 2 && !g.bulletTime && g.meter > 3) f.bt = true;
      if (p.health < 70 && this.dodgeCd <= 0 && p.mode === "normal" && shooting >= 1) { f.dodge = true; this.dodgeCd = 4; }
      if (this.demo) {
        if (!this.demoBt && shooting >= 1 && !g.bulletTime && g.meter > 3) { f.bt = true; this.demoBt = true; }
        if (!this.demoDodge && g.stats.kills >= 1 && p.mode === "normal" && p.grounded) { f.dodge = true; f.moveX = this.strafe; this.demoDodge = true; this.dodgeCd = 4; }
      }
    } else {
      if (g.bulletTime && this.lost > 0.6) f.bt = true; // off again (not the moment a target blinks out of sight)
      // room 4, a stop's gang out of sight: hold the car a while (in cover by a door), let them come
      const ride = g.ride;
      const hold = this.cover && g.phase === "play" && !!ride?.stop && ride.phase !== "arrive" && ride.inCar(p.x, p.z, 0) && !ride.wantsIn(g) && this.lost < 5;
      if (hold && p.cover < 0 && p.dashSeg < 0 && g.coverTarget && !g.coverTarget.dash && this.coverCd <= 0) { f.cover = true; this.coverCd = 1; }
      // walk toward the nearest live goon (or the exit once clear)
      let tx = NaN, tz = NaN, key = -1;
      // (chapter 2 rooms have floors above 0 and platforms: the target's own height; rooms 1-5 path at 0 as always)
      let ty = 0;
      if (hold) { /* holding */ } else if (g.phase === "clear") {
        const ex = g.level.markers.find(m => m.kind === "trigger" && m.data.action === "exit");
        if (ex) { tx = ex.x; tz = ex.z; ty = ex.y - 1; key = 999; }
      } else {
        let nd = Infinity;
        for (const e of g.enemies) {
          if (e.state === "dead" || e.state === "inactive") continue;
          if (g.stage && (this.walkSkip.get(e.idx) ?? -1) > g.time) continue;
          const d = (e.x - p.x) ** 2 + (e.z - p.z) ** 2;
          if (d < nd) { nd = d; tx = e.x; tz = e.z; ty = e.y; key = e.idx; }
        }
        // a weapon or ammo lying within 20 m that it can use: fetch it first
        let kd = 20 * 20;
        for (let i = 0; i < g.pickups.length; i++) {
          const k = g.pickups[i];
          const d = PICKUPS[k.item];
          // not the secrets, nothing up a climb, nothing it cannot take, nowhere it found no way to lately
          if (k.taken || !d || k.secret || k.behind || k.y > p.y + 1.2 || !g.canTake(k.item) || (this.noWay.get(i) ?? -1) > g.time) continue;
          const dd = (k.x - p.x) ** 2 + (k.z - p.z) ** 2;
          if (dd < kd) { kd = dd; tx = k.x; tz = k.z; ty = k.y; key = 700 + i; }
        }
        // room 4: a finished stop waits for him in the car
        if (g.ride?.wantsIn(g)) { const c = g.ride.car; tx = (c[0] + c[2]) / 2; tz = (c[1] + c[3]) / 2; key = 600; }
        if (key < 0) {
          // nothing alive and awake: walk to the next trigger we have not fired (not the fallbacks)
          const t = g.triggers.find(tr => !tr.fired && tr.data.action !== "exit" && typeof tr.data.afterKills !== "number");
          if (t) { tx = t.x; tz = t.z; ty = p.y; key = 500; }
        }
      }
      if (!Number.isNaN(tx)) {
        this.repath -= 1 / 120;
        if (key !== this.pathFor || this.repath <= 0) {
          // a goon walled into her spot (a booth) has no path: go to the waypoint nearest to her instead
          if (!g.stage) ty = 0;
          let path = g.graph.path(p.x, p.y, p.z, tx, ty, tz);
          if (!path) {
            const n = g.graph.nearest(tx, ty, tz, false);
            const w = n >= 0 ? g.graph.nodes[n] : null;
            path = w ? g.graph.path(p.x, p.y, p.z, w.x, w.y, w.z) : null;
            // a pickup with no way to it (a landing whose doors have shut): leave it for now
            if (!path && key >= 700 && key < 700 + g.pickups.length) { this.noWay.set(key - 700, g.time + 5); this.pathFor = -2; this.repath = 0; }
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
        // chapter 2: no headway toward this target in 8 s (back and forth at a wall): leave it for a while
        if (g.stage && key >= 0) {
          const dd = Math.hypot(tx - p.x, tz - p.z);
          if (key !== this.headKey) { this.headKey = key; this.headBest = dd; this.headT = 0; }
          else if (dd < this.headBest - 1) { this.headBest = dd; this.headT = 0; }
          else if ((this.headT += 1 / 120) > 8) {
            if (key >= 700 && key < 700 + g.pickups.length) this.noWay.set(key - 700, g.time + 20);
            else if (key < 500) this.walkSkip.set(key, g.time + 8);
            this.headKey = -1; this.pathFor = -2; this.repath = 0;
          }
        }
        // no progress for a second: hop (low barriers) and sidestep, then repath
        this.stuckT += 1 / 120;
        if ((p.x - this.stuckX) ** 2 + (p.z - this.stuckZ) ** 2 > 0.25) { this.stuckT = 0; this.stuckX = p.x; this.stuckZ = p.z; this.stuckN = 0; }
        if (this.stuckT > 1) { f.jump = true; this.sidestep = 0.6; this.stuckT = 0; this.repath = 0; this.strafe = -this.strafe; this.stuckN++; }
        // still stuck after a few tries (a ledge, a desk): the nearest waypoint first, whatever the line
        if (this.stuckN >= 3 && this.sidestep <= 0) {
          const n0 = g.graph.nearest(p.x, p.y, p.z, true), n = n0 >= 0 ? n0 : g.graph.nearest(p.x, p.y, p.z, false), w = n >= 0 ? g.graph.nodes[n] : null;
          if (w) { this.path = [{ x: w.x, z: w.z }, ...this.path]; this.repath = 1.5; }
          this.stuckN = 0;
        }
        if (this.sidestep > 0) { this.sidestep -= 1 / 120; f.moveX = this.strafe; }
      }
    }
    if (this.blade && g.katana) this.guard(g, f, shooting);
    else if (this.cover) this.useCover(g, f, best, shooting);
    // chapter 2: shooting and shooting at one it cannot hit: go to her instead for a few seconds
    if (g.stage) {
      if (g.stats.hits !== this.hitsSeen || best !== this.dryFor) { this.hitsSeen = g.stats.hits; this.dryFor = best; this.dry = 0; }
      else if (f.fire && best >= 0) this.dry += 1 / 120;
      if (this.dry > 3 && best >= 0) { this.ignore.set(best, g.time + 4); this.dry = 0; }
    }
    // out of a heart grenade's ring
    const esc = g.boss ? grenadeEscape(g) : null;
    if (esc && p.mode === "normal") {
      // (in cover: out of it first, pulling back from it; a run to cover is called off)
      const c = p.cover >= 0 ? g.cover[p.cover] : null;
      const wx = c ? c.nx : esc.x, wz = c ? c.nz : esc.z;
      const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw);
      f.moveY = wx * -sy + wz * -cy;
      f.moveX = wx * cy - wz * sy;
      f.cover = p.dashSeg >= 0;
      f.aim = false;
      this.coverCd = Math.max(this.coverCd, 2);
    }
    // chapter 2: the room's own timing (the vault's beams: a jump over the low one, a dive under the high)
    const hint = g.stage?.botHint?.(g);
    if (hint?.jump) f.jump = true;
    if (hint?.dodge && p.dodgeCooldown <= 0) { f.dodge = true; if (!f.moveX && !f.moveY) f.moveX = this.strafe; }
    if (p.health < 50 && p.copium > 0 && p.healLeft <= 0) f.copium = true;
    if (p.mode === "prone") f.moveY = 1;
    return f;
  }

  /** Cover (sim/cover.ts), the way a careful player plays it: in a fight, into the marked cover that
   *  faces the one it is shooting; in it, up (aim held) to shoot in bursts, down again to reload, when hit
   *  or after a while; along high cover to its open edge; out when flanked, when nobody is in view from
   *  it for a while, or when a frag lands near; away from a frag lying close, in or out of cover. */
  private useCover(g: Game, f: InputFrame, best: number, shooting: number): void {
    const p = g.player;
    const dt = 1 / 120;
    this.coverCd -= dt;
    const toWorld = (wx: number, wz: number) => {
      const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw);
      f.moveY = wx * -sy + wz * -cy;
      f.moveX = wx * cy - wz * sy;
    };
    // a frag lying close: get away from it (out of cover first)
    for (const gr of g.grenadesLive) {
      if ((gr.by ?? -1) < 0 || !gr.landed) continue;
      const dx = p.x - gr.x, dz = p.z - gr.z, d = Math.hypot(dx, dz);
      if (d > 5) continue;
      if (p.cover >= 0 || p.dashSeg >= 0) { f.cover = p.dashSeg >= 0; const c = g.cover[p.cover]; if (c) toWorld(c.nx, c.nz); this.coverCd = 1.5; return; }
      toWorld(dx / (d || 1), dz / (d || 1));
      f.aim = false;
      return;
    }
    if (p.mode !== "normal") return;
    // the room is clear: out of cover (the walk to the door)
    if (g.phase !== "play") { const c = g.cover[p.cover]; if (c) toWorld(c.nx, c.nz); else if (p.dashSeg >= 0) f.cover = true; return; }
    const hurt = g.realTime - g.hurtAt < 0.35;
    if (p.dashSeg >= 0) { f.fire = false; f.moveX = f.moveY = 0; return; }
    if (p.cover < 0) {
      this.popT = 0;
      this.idleT = 0;
      // room 4: the car arriving at a stop: into cover by the doors about to open (they may know he comes)
      const ride = g.ride, st = ride?.stop;
      const arriving = !!st && !!ride && (ride.phase === "arrive" || ride.phase === "opening") && ride.inCar(p.x, p.z, 0);
      // in a fight: walk (shooting) to a cover close by that faces the one it is fighting, and take it
      const want = shooting >= 1 || hurt || p.health < 80 || arriving;
      if (!want || this.coverCd > 0 || (best < 0 && !arriving)) { this.goal = null; return; }
      let fx: number, fz: number;
      if (best >= 0) {
        const e = g.enemies[best];
        if (e.kind === "heavy" && Math.hypot(e.x - p.x, e.z - p.z) < 9) return;
        fx = e.x; fz = e.z;
      } else {
        // (the landing beyond the doors: 6 m out from the car's middle on that side)
        const [x0, z0, x1, z1] = ride!.car, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sd = st!.side;
        fx = cx + (sd === "e" ? 9 : sd === "w" ? -9 : 0); fz = cz + (sd === "s" ? 9 : sd === "n" ? -9 : 0);
      }
      this.goalT += dt;
      if (!this.goal || this.goalT > 3) { this.goal = this.pickGoal(g, fx, fz); this.goalT = 0; }
      const gl = this.goal;
      if (!gl) { this.coverCd = 1; return; }
      const dx = gl.x - p.x, dz = gl.z - p.z, d = Math.hypot(dx, dz);
      if (d < 1.2) { f.cover = true; this.goal = null; this.coverCd = 0.6; return; }
      toWorld(dx / d, dz / d);
      return;
    }
    const c = g.cover[p.cover];
    f.moveX = f.moveY = 0;
    // a heavy walking in with the pump gun: no place to be pinned (away from him, and stay out a while)
    const hv = g.enemies.find(e => e.kind === "heavy" && e.state !== "dead" && e.state !== "inactive" && Math.hypot(e.x - p.x, e.z - p.z) < 8);
    if (hv) { const hx = p.x - hv.x, hz = p.z - hv.z, hl = Math.hypot(hx, hz) || 1; toWorld(c.nx * 0.7 + (hx / hl) * 0.3, c.nz * 0.7 + (hz / hl) * 0.3); this.coverCd = 3; this.popT = 0; return; }
    // flanked (one that can hit it from round the side), or nobody in view for a while: out
    const flank = g.enemies.some(e => e.sees && e.state !== "dead" && (((e.x - p.x) * -c.nx + (e.z - p.z) * -c.nz) / (Math.hypot(e.x - p.x, e.z - p.z) || 1)) < 0.25);
    this.idleT = best >= 0 ? 0 : this.idleT + dt;
    // (in the elevator's car it waits longer for them to show: the landing is theirs)
    const patience = g.ride && g.ride.inCar(p.x, p.z, 0) ? 7 : 2.5;
    if (flank || this.idleT > patience) {
      toWorld(c.nx, c.nz);
      this.coverCd = flank ? 2.5 : 4;
      this.popT = 0;
      return;
    }
    // high cover mid-wall: along it to the open edge nearer the fight
    if (c.high && p.coverEnd === 0) {
      const aOpen = !Number.isNaN(c.cornerA), bOpen = !Number.isNaN(c.cornerB);
      const dir = aOpen && bOpen ? (p.coverU < c.len / 2 ? -1 : 1) : aOpen ? -1 : bOpen ? 1 : 0;
      if (dir === 0) { toWorld(c.nx, c.nz); this.coverCd = 2; return; }
      toWorld(c.tx * dir, c.tz * dir);
      f.fire = false;
      return;
    }
    // up in bursts: up while it has rounds and nothing just hit it, down to reload, when hit, after a while
    const w = p.weapon;
    const empty = w.mags[0] + w.mags[1] <= 0;
    if (this.popT > 0) {
      this.popT -= dt;
      if (hurt && p.health < 60) this.popT = Math.min(this.popT, 0.1);
      if (w.reloadT > 0 || empty) this.popT = 0;
      if (this.popT > 0) { f.aim = true; return; }
      this.downT = 0.5 + ((g.stepN * 7) % 60) / 100;
    }
    f.fire = false;
    if (this.downT > 0) { this.downT -= dt; if (!empty && w.mags[0] + w.mags[1] < WEAPONS[w.id].mag * 0.5 && w.reloadT <= 0) f.reload = true; return; }
    if (empty || w.reloadT > 0) { if (w.reloadT <= 0) f.reload = true; return; }
    this.popT = 1.3 + ((g.stepN * 13) % 80) / 100;
    f.aim = true;
  }
  /** A cover within 7 m that faces (x, z) (the one it is fighting) and that it can walk straight to: the
   *  spot (a high one's open edge), null when there is none. */
  private pickGoal(g: Game, x: number, z: number): { x: number; z: number } | null {
    const p = g.player;
    let best: { x: number; z: number } | null = null, bs = Infinity;
    for (const c of g.cover) {
      if (Math.abs(c.y - p.y) > 0.45 || !segLive(g.world, c)) continue;
      const n = segNearest(c, p.x, p.z);
      let u = n.u;
      if (c.high) {
        const [lo, hi] = hideRange(c);
        const a = !Number.isNaN(c.cornerA), b = !Number.isNaN(c.cornerB);
        if (!a && !b) continue;
        u = a && (!b || Math.abs(u - lo) < Math.abs(u - hi)) ? lo : hi;
      }
      const px = c.ax + c.tx * u, pz = c.az + c.tz * u;
      const d = Math.hypot(px - p.x, pz - p.z);
      if (d > 7) continue;
      const ex = x - px, ez = z - pz, ed = Math.hypot(ex, ez) || 1;
      const faces = (ex * -c.nx + ez * -c.nz) / ed;
      if (faces < 0.55 || ed < 5) continue;
      const sc = d + 4 * (1 - faces);
      if (sc >= bs || !g.world.clear(p.x, p.y + 0.45, p.z, px, c.y + 0.45, pz, false)) continue;
      bs = sc;
      best = { x: px, z: pz };
    }
    return best;
  }
  private goal: { x: number; z: number } | null = null;
  private goalT = 0;
  private coverCd = 0;
  private popT = 0;
  private downT = 0;
  private idleT = 0;
  /** Take cover in a fight (the balance runs compare it with a bot that never does). */
  cover = true;

  /** The katana's guard: bullet time once anyone shoots at it; in bullet time the guard stays up (no
   *  shooting: the rounds it sends back do the work) while the meter lasts, held at least 0.3 s (never a
   *  tap); out of bullet time, up for a round it sees coming at it from the front within 9 m. */
  private guard(g: Game, f: InputFrame, shooting: number): void {
    const p = g.player;
    this.guardFor = Math.max(0, this.guardFor - 1 / 120);
    const fight = shooting >= 1 && this.lost === 0;
    if (fight && !g.bulletTime && g.meter > 2 && p.mode === "normal") f.bt = true;
    const low = p.guard ? p.guardMeter < 12 : p.guardMeter < 40;
    if (p.mode !== "normal" || low || p.guardBroken > 0) { this.guardFor = 0; return; }
    if (g.bulletTime && fight) this.guardFor = Math.max(this.guardFor, 0.3);
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    for (const b of g.projectiles) {
      if (b.team !== 1 || !b.alive) continue;
      const tx = p.x - b.x, ty = p.y + 1.1 - b.y, tz = p.z - b.z, d = Math.hypot(tx, ty, tz) || 1;
      if (d > 9 || (tx * b.dx + ty * b.dy + tz * b.dz) / d < 0.97) continue;
      if ((-b.dx * fx - b.dz * fz) / (Math.hypot(b.dx, b.dz) || 1) < GUARD.arcCos + 0.1) continue;
      this.guardFor = Math.max(this.guardFor, 0.3);
      break;
    }
    if (this.guardFor > 0) { f.guard = true; f.fire = false; f.melee = false; }
  }

  /** The sawed-off under 4 m, the shotgun under 9 m, the hand cannon on a heavy, the sniper past 22 m,
   *  the rifle at 9-40 m, the SMGs as before, the base gun when the rest are dry. */
  private pickWeapon(g: Game, f: InputFrame, dist: number, heavy: boolean): void {
    const p = g.player;
    if (this.swapCd > 0 || p.owned.length < 2 || p.weapon.reloadT > 0 && ammoLeft(p.weapon) > 0) return;
    const has = (id: WeaponId) => p.owned.includes(id) && ammoLeft(p.arsenal[id]!) > 0;
    const base = p.owned[0];
    const want: WeaponId = this.only && has(this.only) ? this.only
      : dist < 4 && has("sawedoff") ? "sawedoff"
      : dist < 9 && has("shotgun") ? "shotgun"
      : heavy && has("handcannon") ? "handcannon"
      : dist > 22 && has("sniper") ? "sniper"
      : dist >= 9 && dist <= 40 && has("rifle") ? "rifle"
      : base === "ak" ? base : has("smgs") ? "smgs" : has("shotgun") && dist < 14 ? "shotgun" : base;
    if (want !== p.weapon.id) {
      // a category key: a second press next step reaches its other member
      f.slot = slotOf(want);
      this.swapCd = SLOT_ORDER.filter(w => p.owned.includes(w) && slotOf(w) === f.slot).length > 1 ? 2 / 120 : 1.5;
    }
  }
}
