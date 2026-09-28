// Room 9, the counting floor: the shutters and the blackout.
//  - The shutters (colliders) start rolled up, out of the world. When their cue fires their lights warn
//    (COUNT.tell), then they are down: the floor is cut in two and the way round is the catwalk. Anyone
//    standing under one is pushed out to the nearer side. Waypoint links through a shutter carry Data
//    {door: <shutter>}: the gang walks them only while it is up (Graph.gates).
//  - The blackout: when its cue fires the lights go for COUNT.dark (the screens and every hostile's rim
//    stay lit); the gang aims worse in it (COUNT.darkAccuracy).
// Settings: {kind: "counting", shutters: [collider node ids], cue, dark: "<cue>"}.
import type { Enemy } from "../actors.ts";
import type { Game } from "../game.ts";
import type { Fnv1a } from "../math.ts";
import { COUNT } from "../tuning2.ts";
import { ENEMY, PLAYER } from "../tuning.ts";
import { goToCover } from "../../ai/goon.ts";
import { cueFired, type Stage, type StageSettings } from "../stage.ts";

export class Counting implements Stage {
  readonly kind = "counting";
  readonly shutters: string[];
  readonly cue: string;
  readonly darkCue: string;
  /** Shutters: 0 up, 1 warning (t left), 2 down. Blackout: 0 not yet, 1 dark (darkT left), 2 over. */
  state = 0;
  t = 0;
  dark = 0;
  darkT = 0;
  private readonly o = { x: 0, z: 0 };

  constructor(g: Game, s: StageSettings) {
    this.shutters = (s.shutters as string[]) ?? [];
    this.cue = typeof s.cue === "string" ? s.cue : "shutters";
    this.darkCue = typeof s.dark === "string" ? s.dark : "dark";
    for (const id of this.shutters) g.world.setEnabled(id, false);
  }

  accuracy(_g: Game, _e: Enemy): number {
    return this.dark === 1 ? COUNT.darkAccuracy : 1;
  }

  step(g: Game, dt: number): void {
    if (this.state === 0 && cueFired(g, this.cue)) {
      this.state = 1;
      this.t = COUNT.tell;
      g.emit({ type: "stage", what: "shutterWarn" });
    } else if (this.state === 1) {
      this.t -= dt;
      if (this.t <= 0) this.drop(g);
    }
    if (this.dark === 0 && cueFired(g, this.darkCue)) {
      this.dark = 1;
      this.darkT = COUNT.dark;
      g.emit({ type: "stage", what: "dark" });
    } else if (this.dark === 1) {
      this.darkT -= dt;
      if (this.darkT <= 0) { this.dark = 2; g.emit({ type: "stage", what: "lights" }); }
    }
  }

  private drop(g: Game): void {
    this.state = 2;
    for (const id of this.shutters) g.world.setEnabled(id, true);
    const p = g.player;
    g.world.pushOut(p.x, p.z, PLAYER.radius + 0.02, p.y, p.y + 1.7, p.y + PLAYER.stepUp, this.o);
    p.x = this.o.x; p.z = this.o.z;
    for (const e of g.enemies) {
      if (e.state === "dead" || e.state === "inactive") continue;
      g.world.pushOut(e.x, e.z, ENEMY[e.kind].radius + 0.02, e.y, e.y + 1.8, e.y + PLAYER.stepUp, this.o);
      e.x = this.o.x; e.z = this.o.z;
      e.path = []; e.pathI = 0; e.repath = 0;
      if (e.state === "move") goToCover(g, e); // (her way may run through a shutter now)
      g.syncEnemyPose(e);
    }
    g.emit({ type: "stage", what: "shutters" });
  }

  save(): number[] {
    return [this.state === 2 ? 1 : 0, this.dark >= 1 ? 1 : 0];
  }

  load(g: Game, v: number[]): void {
    if (v[0] === 1) { this.state = 2; for (const id of this.shutters) g.world.setEnabled(id, true); }
    if (v[1] === 1) this.dark = 2;
  }

  hashInto(h: Fnv1a): void {
    h.i32(this.state).f64(this.t).i32(this.dark).f64(this.darkT);
  }
}
