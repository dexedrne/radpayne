// Room 8, the airship: the cargo hold's loading door blows. When its cue fires the klaxon sounds
// (AIR.tell: the tell, the red light), then the door is gone and for AIR.dur the sky pulls everything in
// the hold toward the opening: him at AIR.pull (he runs at 5 m/s: he can hold his ground, or get pinned
// on the cargo net across the opening, where he is safe), the girls harder; one who gets within AIR.gone
// of the opening is out (a kill that is not his: no kill cam, no meter). Heavies and perched girls stand.
// Settings: {kind: "airship", door: collider node id, cue, hold: [x0, z0, x1, z1], out: [x, z] (the
// opening's centre)}.
import type { Game } from "../game.ts";
import type { Fnv1a } from "../math.ts";
import { HB_TORSO } from "../../combat/hitboxes.ts";
import { AIR } from "../tuning2.ts";
import { ENEMY, PLAYER } from "../tuning.ts";
import { cueFired, inRect, type Stage, type StageSettings } from "../stage.ts";

export class Airship implements Stage {
  readonly kind = "airship";
  readonly door: string;
  readonly cue: string;
  readonly hold: number[];
  readonly out: [number, number];
  /** 0 shut, 1 klaxon (t left), 2 wind (t left), 3 open and still. */
  state = 0;
  t = 0;
  private readonly o = { x: 0, z: 0 };

  constructor(_g: Game, s: StageSettings) {
    this.door = typeof s.door === "string" ? s.door : "cargo-door";
    this.cue = typeof s.cue === "string" ? s.cue : "blow";
    this.hold = (s.hold as number[]) ?? [0, 0, 0, 0];
    this.out = (s.out as [number, number]) ?? [0, 0];
  }

  get wind(): boolean {
    return this.state === 2;
  }

  step(g: Game, dt: number): void {
    if (this.state === 0 && cueFired(g, this.cue)) {
      this.state = 1;
      this.t = AIR.tell;
      g.emit({ type: "stage", what: "klaxon", x: this.out[0], z: this.out[1] });
    } else if (this.state === 1) {
      this.t -= dt;
      if (this.t <= 0) {
        this.state = 2;
        this.t = AIR.dur;
        g.world.setEnabled(this.door, false);
        g.emit({ type: "stage", what: "blow", x: this.out[0], z: this.out[1] });
      }
    } else if (this.state === 2) {
      this.t -= dt;
      this.pull(g, dt);
      if (this.t <= 0) { this.state = 3; g.emit({ type: "stage", what: "calm", x: this.out[0], z: this.out[1] }); }
    }
  }

  private pull(g: Game, dt: number): void {
    const [ox, oz] = this.out;
    const p = g.player;
    if (p.mode !== "dead" && inRect(this.hold, p.x, p.z)) {
      const dx = ox - p.x, dz = oz - p.z, d = Math.hypot(dx, dz) || 1;
      g.world.pushOut(p.x + (dx / d) * AIR.pull * dt, p.z + (dz / d) * AIR.pull * dt, PLAYER.radius, p.y, p.y + 1.7, p.y + PLAYER.stepUp, this.o);
      p.x = this.o.x; p.z = this.o.z;
    }
    for (const e of g.enemies) {
      if (e.state === "dead" || e.state === "inactive" || e.fled || e.kind === "heavy" || e.kind === "countess" || e.perch || !inRect(this.hold, e.x, e.z)) continue;
      const dx = ox - e.x, dz = oz - e.z, d = Math.hypot(dx, dz) || 1;
      if (d <= AIR.gone) {
        g.emit({ type: "stage", what: "gone", id: e.idx, x: e.x, z: e.z });
        g.damageEnemy(e, 9999, HB_TORSO, dx / d, dz / d, null);
        // out into the sky (the body is gone from the hold)
        e.x = ox + (dx / d) * 3; e.z = oz + (dz / d) * 3; e.y -= 400;
        g.syncEnemyPose(e);
        continue;
      }
      // the hold's crates stop her; near the opening nothing does (the net will not hold a girl)
      const nx = e.x + (dx / d) * AIR.pullGang * dt, nz = e.z + (dz / d) * AIR.pullGang * dt;
      if (d > AIR.gone + 1.6) { g.world.pushOut(nx, nz, ENEMY[e.kind].radius, e.y, e.y + 1.8, e.y + PLAYER.stepUp, this.o); e.x = this.o.x; e.z = this.o.z; }
      else { e.x = nx; e.z = nz; }
      e.flinch = Math.max(e.flinch, 0.1);
      g.syncEnemyPose(e);
    }
  }

  save(): number[] {
    return [this.state >= 2 ? 1 : 0];
  }

  load(g: Game, v: number[]): void {
    if (v[0] === 1) { this.state = 3; g.world.setEnabled(this.door, false); }
  }

  hashInto(h: Fnv1a): void {
    h.i32(this.state).f64(this.t);
  }
}
