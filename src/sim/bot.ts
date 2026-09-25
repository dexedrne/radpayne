// A simple test bot that plays a room: aims at the nearest goon it can see (torso, head when close),
// fires, walks toward the next one along the waypoint graph, pops bullet time when two or more are
// shooting, dives when hurt, uses copium below half health, walks to the exit once the room is clear.
// Used by the Node smoke test and the browser's ?bot mode (same input frames -> same result).
import { HB_HEAD, HB_TORSO, aimPoint, makeCapsules } from "../combat/hitboxes.ts";
import type { Game } from "./game.ts";
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
  readonly frame: InputFrame = emptyInput();
  /** Aim turn rate (rad/s) and the time on target before the first shot: a human-ish handicap. */
  readonly turnRate: number;
  readonly settle: number;
  constructor(turnRate = 3.5, settle = 0.3) {
    this.turnRate = turnRate;
    this.settle = settle;
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
    if (g.phase === "killcam") { f.skip = g.killcam !== null && g.killcam.t > 0.6; return f; }
    if (p.mode === "dead") return f;
    this.dodgeCd -= 1 / 120;
    const piv = pivotOf(p, this.piv);

    // target: nearest visible live goon
    let best = -1, bd = Infinity;
    for (const e of g.enemies) {
      if (e.state === "dead" || e.state === "inactive") continue;
      const part = HB_TORSO;
      if (!aimPoint("milady", e.hit.pose, part, this.v, this.caps)) continue;
      const d = (this.v.x - piv.x) ** 2 + (this.v.z - piv.z) ** 2;
      if (d < bd && g.world.clear(piv.x, piv.y, piv.z, this.v.x, this.v.y, this.v.z, true)) { bd = d; best = e.idx; }
    }
    let shooting = 0;
    for (const e of g.enemies) if (e.state === "peek" || e.state === "engage" || (e.state === "move" && e.sees)) shooting++;

    if (best >= 0) {
      const e = g.enemies[best];
      const part = bd < 14 * 14 ? HB_HEAD : HB_TORSO;
      aimPoint("milady", e.hit.pose, part, this.v, this.caps);
      const dx = this.v.x - piv.x, dy = this.v.y - piv.y, dz = this.v.z - piv.z;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      this.turn(f, Math.atan2(-dx, -dz), Math.asin(dy / l));
      this.onTarget = g.aimEnemy === best ? this.onTarget + 1 / 120 : 0;
      f.fire = this.onTarget >= this.settle;
      // strafe while shooting
      this.strafeT -= 1 / 120;
      if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 1.2; }
      f.moveX = this.strafe * 0.6;
      if (shooting >= 2 && !g.bulletTime && g.meter > 3) f.bt = true;
      if (p.health < 70 && this.dodgeCd <= 0 && p.mode === "normal" && shooting >= 1) { f.dodge = true; this.dodgeCd = 4; }
    } else {
      if (g.bulletTime) f.bt = true; // off again
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
        if (key < 0) {
          // nothing alive and awake: walk to the next trigger we have not fired
          const t = g.triggers.find(tr => !tr.fired && tr.data.action !== "exit");
          if (t) { tx = t.x; tz = t.z; key = 500; }
        }
      }
      if (!Number.isNaN(tx)) {
        this.repath -= 1 / 120;
        if (key !== this.pathFor || this.repath <= 0) {
          this.path = g.graph.path(p.x, p.y, p.z, tx, 0, tz) ?? [{ x: tx, z: tz }];
          this.pathFor = key;
          this.repath = 1;
        }
        while (this.path.length > 1 && (this.path[0].x - p.x) ** 2 + (this.path[0].z - p.z) ** 2 < 0.5) this.path.shift();
        const wp = this.path[0];
        const dx = wp.x - p.x, dz = wp.z - p.z;
        this.turn(f, Math.atan2(-dx, -dz), 0);
        f.moveY = 1;
      }
    }
    if (p.health < 50 && p.copium > 0 && p.healLeft <= 0) f.copium = true;
    if (p.mode === "prone") f.moveY = 1;
    return f;
  }
}
