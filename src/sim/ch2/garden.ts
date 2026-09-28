// Room 7, the sky garden: the glass walkway over the koi pond. When its cue fires (a heavy's weight, a
// kill count) the glass cracks (GARDEN.tell: the tell, the crack runs across it), then gives: its
// colliders leave the world and whoever stands on it drops to the pond level below (a girl takes
// GARDEN.fallDamage and is dazed; he takes GARDEN.selfDamage). The pond level has its own way back up.
// Settings: {kind: "garden", glass: [collider node ids], cue: "<setpiece cue>", area: [x0, z0, x1, z1]}.
import type { Game } from "../game.ts";
import type { Fnv1a } from "../math.ts";
import { HB_TORSO } from "../../combat/hitboxes.ts";
import { goToCover } from "../../ai/goon.ts";
import { GARDEN } from "../tuning2.ts";
import { cueFired, inRect, type Stage, type StageSettings } from "../stage.ts";

export class Garden implements Stage {
  readonly kind = "garden";
  readonly glass: string[];
  readonly cue: string;
  readonly area: number[];
  /** 0 whole, 1 cracking (crackT left), 2 gone. */
  state = 0;
  crackT = 0;

  constructor(_g: Game, s: StageSettings) {
    this.glass = (s.glass as string[]) ?? [];
    this.cue = typeof s.cue === "string" ? s.cue : "crack";
    this.area = (s.area as number[]) ?? [0, 0, 0, 0];
  }

  step(g: Game, dt: number): void {
    if (this.state === 0 && cueFired(g, this.cue)) {
      this.state = 1;
      this.crackT = GARDEN.tell;
      const cx = (this.area[0] + this.area[2]) / 2, cz = (this.area[1] + this.area[3]) / 2;
      g.emit({ type: "stage", what: "crack", x: cx, z: cz });
    } else if (this.state === 1) {
      this.crackT -= dt;
      if (this.crackT <= 0) this.collapse(g);
    }
  }

  private collapse(g: Game): void {
    this.state = 2;
    const top = Math.max(...this.glass.map(id => g.level.boxes.find(b => b.node === id)?.top ?? 0));
    for (const id of this.glass) g.world.setEnabled(id, false);
    const cx = (this.area[0] + this.area[2]) / 2, cz = (this.area[1] + this.area[3]) / 2;
    g.emit({ type: "stage", what: "collapse", x: cx, z: cz });
    for (const e of g.enemies) {
      if (e.state === "dead" || e.state === "inactive" || e.fled || !inRect(this.area, e.x, e.z) || e.y < top - 0.3) continue;
      const gy = g.world.groundBelow(e.x, e.z, 0.3, e.y);
      if (Number.isFinite(gy)) e.y = gy;
      e.flinch = Math.max(e.flinch, GARDEN.daze);
      e.stagger = Math.max(e.stagger, e.kind === "heavy" ? GARDEN.daze : 0);
      e.path = []; e.pathI = 0; e.repath = 0;
      if (e.state === "move") goToCover(g, e); // (her way ran over the glass)
      g.syncEnemyPose(e);
      g.damageEnemy(e, GARDEN.fallDamage, HB_TORSO, 0, 1, null);
    }
    const p = g.player;
    if (p.mode !== "dead" && inRect(this.area, p.x, p.z) && p.y >= top - 0.3) g.hurtPlayer(GARDEN.selfDamage * g.diff.damage, -1);
  }

  save(): number[] {
    return [this.state === 2 ? 1 : 0];
  }

  load(g: Game, v: number[]): void {
    if (v[0] === 1) { this.state = 2; for (const id of this.glass) g.world.setEnabled(id, false); }
  }

  hashInto(h: Fnv1a): void {
    h.i32(this.state).f64(this.crackT);
  }
}
