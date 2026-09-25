// Voices in the room (view side, never touches the sim): the gang's barks (alert, spotted, cover,
// reload, hit) with one talker at a time, the Radbro's own voice in the fight (grunts when hit, the
// landing, the bullet-time breath, the copium sigh, "not yet." at low health, the death groan) and the
// narrator's tutorial lines (first contact, bullet time, shootdodge, copium, room clear) with subtitles
// and a key hint on the HUD. Lines, chances and cooldowns follow the voice script (audio v2).
import type { Session } from "./session.ts";
import type { GameEvent } from "../sim/types.ts";
import { bark, narrate, radbro, stopNarration, type BarkKind, type GoonVoice } from "../audio/sfx.ts";
import { useUi } from "../ui/store.ts";
import { PLAYER } from "../sim/tuning.ts";

/** performance.now() until which goon i is talking (EnemiesView moves the mouth). */
export const goonTalk: number[] = [];

/** The narrator's tutorial / room lines: subtitle == spoken line. */
export const NARRATION: Record<string, string> = {
  tut_shoot: "they saw me first. it didn't help them much.",
  tut_bullet_time: "everything slowed down. i'd had practice watching things fall.",
  tut_shootdodge: "the only way out was sideways. guns first.",
  tut_copium: "copium. it didn't fix anything. it kept me standing.",
  room_clear: "the street went quiet. the rain didn't. inside, the music never stopped.",
};
const HINTS: Record<string, string> = {
  tut_shoot: "LMB: shoot · WASD: move",
  tut_bullet_time: "RMB / Q: bullet time",
  tut_shootdodge: "SHIFT: shootdodge",
  tut_copium: "H: copium",
};

/** The Radbro's combat voice (chances, cooldowns in real seconds). */
const RADBRO = {
  hurt: { chance: 0.35, cooldown: 3 },
  land: { chance: 0.5, cooldown: 4 },
  /** bt_breath: always on the first bullet time of a fight, then this chance. */
  breath: 0.3,
  /** heal: after the copium hiss. */
  healDelay: 0.3,
  /** "not yet." once per life under this share of max health. */
  lowHp: 0.25,
};

/** Each goon's voice: a small rate offset on top of her voice (goon_a / goon_b alternate by goon). */
const PITCH = [1.0, 1.05, 0.97, 1.08, 1.03, 0.99, 1.06, 1.01];

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
  private hurtNext = 0;
  private hurtAlt = 0;
  private landNext = 0;
  private breathed = false;
  private lowSaid = false;
  private spotted = new Set<number>();

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
    this.hurtNext = 0;
    this.landNext = 0;
    this.breathed = false;
    this.lowSaid = false;
    this.spotted.clear();
    goonTalk.length = 0;
  }

  /** Goons alternate the two voices (bright / dreamy) and each has her own pitch on top. */
  private voiceOf(i: number): GoonVoice {
    return i % 2 === 0 ? "goon_a" : "goon_b";
  }
  private pitchOf(i: number): number {
    const e = this.s.game.enemies[i];
    return PITCH[((e?.milady ?? i) + i) % PITCH.length];
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
    if (kind === "spotted") {
      if (this.spotted.has(i)) return; // once per fight per goon
      this.spotted.add(i);
    }
    const d = bark(this.voiceOf(i), kind, dist, pan, this.pitchOf(i));
    if (d <= 0) return;
    this.barkUntil = now + d + 1.5; // one talker at a time, ~1.5 s between barks
    this.goonNext[i] = now + d + 3.5;
    goonTalk[i] = performance.now() + d * 1000;
  }

  /** Queue a narrator line once per attempt. */
  say(id: string, delay = 0): void {
    if (this.said.has(id)) return;
    this.said.add(id);
    this.queue.push({ id, at: performance.now() / 1000 + delay });
  }

  /** The narrator is mid-line (the Radbro's own grunts wait: it is the same voice). */
  private narrating(): boolean {
    return performance.now() / 1000 < this.narratorUntil - 0.6;
  }

  /** A short spoken bark gets the HUD subtitle when the narrator is not using it. */
  private sub(text: string, secs: number): void {
    if (this.narrating()) return;
    useUi.setState({ subtitle: { text, hint: "", until: performance.now() + secs * 1000 } });
  }

  private playerHurt(hp: number): void {
    const now = performance.now() / 1000;
    if (hp <= 0) return;
    if (!this.lowSaid && hp < PLAYER.maxHealth * RADBRO.lowHp) {
      this.lowSaid = true;
      const d = radbro("low_hp");
      if (d > 0) { this.hurtNext = now + d + RADBRO.hurt.cooldown; this.sub("not yet.", Math.max(1.6, d + 0.8)); }
      return;
    }
    if (now < this.hurtNext || this.narrating() || Math.random() >= RADBRO.hurt.chance) return;
    this.hurtAlt ^= 1;
    const d = radbro(this.hurtAlt ? "hurt_1" : "hurt_2");
    if (d > 0) this.hurtNext = now + RADBRO.hurt.cooldown;
  }

  onEvent(e: GameEvent): void {
    if (this.run !== this.s.run) this.reset();
    const g = this.s.game;
    const now = performance.now() / 1000;
    switch (e.type) {
      case "alert":
        this.bark(e.enemy, "alert");
        this.say("tut_shoot", 1.6);
        break;
      case "hurt":
        if (e.target >= 0 && e.hp > 0 && Math.random() < 0.55) this.bark(e.target, "hit", true);
        else if (e.target === -1) this.playerHurt(e.hp);
        break;
      case "bt":
        if (e.on) {
          this.say("tut_bullet_time", 0.3);
          // the breath in, under the bullet-time whoosh: the first time in a fight, then now and then
          if (!this.breathed || Math.random() < RADBRO.breath) { this.breathed = true; radbro("bt_breath", 0.05, 1); }
        } else this.btEnded = true;
        break;
      case "land":
        if (now >= this.landNext && !this.narrating() && Math.random() < RADBRO.land.chance) {
          if (radbro("dodge_land") > 0) this.landNext = now + RADBRO.land.cooldown;
        }
        break;
      case "copium":
        if (!this.narrating()) radbro("heal", RADBRO.healDelay);
        break;
      case "playerDead":
        stopNarration();
        this.queue = [];
        radbro("death");
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
