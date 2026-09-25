// Voices in the room (view side, never touches the sim): the gang's barks (alert, spotted, cover,
// reload, hit) with one talker at a time, and the narrator's tutorial lines (first contact, bullet
// time, shootdodge, copium, room clear) with subtitles and a key hint on the HUD.
import type { Session } from "./session.ts";
import type { GameEvent } from "../sim/types.ts";
import { bark, narrate, type BarkKind, type GoonVoice } from "../audio/sfx.ts";
import { useUi } from "../ui/store.ts";

/** performance.now() until which goon i is talking (EnemiesView moves the mouth). */
export const goonTalk: number[] = [];

export const NARRATION: Record<string, string> = {
  tut_shoot: "the door girls saw me first. pockit miladys, strapped and not very comfy. time to get my bag back.",
  tut_bullet_time: "when it got loud, time got slow. stay in the trenches long enough and you see every bullet coming.",
  tut_shootdodge: "sometimes the only way out is sideways. in slow motion. few understand.",
  tut_copium: "copium. cheap, bitter, and it kept me standing. everybody in this city was on it.",
  room_clear: "the street went quiet. the rain didn't. it's so over... for them.",
};
const HINTS: Record<string, string> = {
  tut_shoot: "LMB: shoot · WASD: move",
  tut_bullet_time: "RMB / Q: bullet time",
  tut_shootdodge: "SHIFT: shootdodge",
  tut_copium: "H: copium",
};

type Line = { id: string; at: number };

export class Director {
  private readonly s: Session;
  private run = -1;
  private said = new Set<string>();
  private queue: Line[] = [];
  private narratorUntil = 0;
  private barkUntil = 0;
  private goonNext: number[] = [];
  private lastState: string[] = [];
  private lastBurst: number[] = [];
  private btEnded = false;

  constructor(s: Session) {
    this.s = s;
  }

  private reset(): void {
    this.run = this.s.run;
    this.said.clear();
    this.queue = [];
    this.narratorUntil = 0;
    this.barkUntil = 0;
    this.goonNext = [];
    this.lastState = [];
    this.lastBurst = [];
    this.btEnded = false;
    goonTalk.length = 0;
  }

  private voiceOf(i: number): GoonVoice {
    const e = this.s.game.enemies[i];
    return ((e?.milady ?? i) % 2 === 0 ? "goon_a" : "goon_b");
  }

  private where(x: number, z: number): { dist: number; pan: number } {
    const p = this.s.game.player;
    const dx = x - p.x, dz = z - p.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    // camera right = (cos yaw, 0, -sin yaw)
    return { dist, pan: (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / dist };
  }

  /** A goon bark if nobody is talking (hits cut in). */
  private bark(i: number, kind: BarkKind, force = false): void {
    const now = performance.now() / 1000;
    if (!force && (now < this.barkUntil || now < (this.goonNext[i] ?? 0))) return;
    const e = this.s.game.enemies[i];
    if (!e) return;
    const { dist, pan } = this.where(e.x, e.z);
    if (dist > 38) return;
    const d = bark(this.voiceOf(i), kind, dist, pan);
    if (d <= 0) return;
    this.barkUntil = now + d + 0.5;
    this.goonNext[i] = now + d + 3.5;
    goonTalk[i] = performance.now() + d * 1000;
  }

  /** Queue a narrator line once per attempt. */
  say(id: string, delay = 0): void {
    if (this.said.has(id)) return;
    this.said.add(id);
    this.queue.push({ id, at: performance.now() / 1000 + delay });
  }

  onEvent(e: GameEvent): void {
    if (this.run !== this.s.run) this.reset();
    const g = this.s.game;
    switch (e.type) {
      case "alert":
        this.bark(e.enemy, "alert");
        this.say("tut_shoot", 1.6);
        break;
      case "hurt":
        if (e.target >= 0 && e.hp > 0 && Math.random() < 0.55) this.bark(e.target, "hit", true);
        break;
      case "bt":
        if (e.on) this.say("tut_bullet_time", 0.3);
        else this.btEnded = true;
        break;
      case "pickup":
        if (e.item === "copium") this.say("tut_copium", 0.4);
        break;
      case "kill":
        if (g.stats.kills === 2 && !this.said.has("tut_bullet_time")) this.say("tut_bullet_time", 0.2);
        break;
    }
  }

  /** Every frame (real time). */
  frame(): void {
    if (this.run !== this.s.run) this.reset();
    const g = this.s.game;
    const now = performance.now() / 1000;
    // gang barks from state changes
    for (const e of g.enemies) {
      const prev = this.lastState[e.idx] ?? e.state;
      if (e.state !== prev) {
        if (e.state === "move" && (prev === "alert" || prev === "peek") && e.cover >= 0) this.bark(e.idx, "cover");
        else if ((e.state === "peek" || e.state === "engage") && prev === "alert") this.bark(e.idx, "spotted");
      }
      this.lastState[e.idx] = e.state;
      const lb = this.lastBurst[e.idx] ?? e.burstLeft;
      if (e.burstLeft > lb && e.state !== "dead" && Math.random() < 0.3) this.bark(e.idx, "reload");
      this.lastBurst[e.idx] = e.burstLeft;
    }
    // tutorial beats
    if (this.btEnded && this.said.has("tut_bullet_time")) this.say("tut_shootdodge", 1.2);
    if (g.phase === "clear") this.say("room_clear", 0.3);
    // narrator queue: one line at a time, room clear jumps the queue
    if (this.queue.length && now >= this.narratorUntil) {
      const clearAt = this.queue.findIndex(l => l.id === "room_clear");
      const i = clearAt >= 0 ? clearAt : 0;
      const line = this.queue[i];
      if (now >= line.at) {
        this.queue.splice(i, 1);
        const d = narrate(line.id);
        const until = now + Math.max(d, 3.5);
        this.narratorUntil = until + 0.6;
        useUi.setState({ subtitle: { text: NARRATION[line.id] ?? "", hint: HINTS[line.id] ?? "", until: performance.now() + (until - now) * 1000 } });
      }
    }
  }
}
