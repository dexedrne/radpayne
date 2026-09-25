// Voices in the room (view side, never touches the sim): the gang's barks (alert, spotted, cover,
// reload, hit) with one talker at a time, the Radbro's own voice in the fight (grunts when hit, the
// landing, the bullet-time breath, the copium sigh, "not yet." at low health, the death groan) and the
// narrator's tutorial lines (first contact, bullet time, shootdodge, copium, room clear) with subtitles
// and a key hint on the HUD. Lines, chances and cooldowns follow the voice script (audio v2).
// Round 2 (plan section 6): the room's own lines from its settings (room.enterLine / clearLine; the
// tutorial lines only where room.tutorial is not false), the rave's scatter line and crowd screams at
// the first shot, the DJ on the PA (the goon with marker data {dj: true}: pa_1 at the first alert,
// pa_2 ~6 s after the scatter, pa_3 when the backup comes; skipped once she is down), the rushers'
// charge, the heavies' few flat words (positional, one taunt per room, subtitled), and the pickup lines.
import type { Session } from "./session.ts";
import type { GameEvent } from "../sim/types.ts";
import { bark, crowdVoice, heavyBark, narrate, pa, radbro, stopNarration, type BarkKind, type GoonVoice, type HeavyLine } from "../audio/sfx.ts";
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
  r2_enter: "a hundred girls on the floor. most of them were just dancing. most.",
  r2_scatter: "one shot and the floor emptied. the ones who stayed had guns.",
  r2_rusher: "some of them didn't bother with cover. they just came at me.",
  r2_clear: "the lasers kept sweeping an empty floor. the song didn't know it was over.",
  r3_enter: "the back of the house. low ceilings, narrow halls, and nowhere to dive but through.",
  r3_heavy: "radbros. my own kind, in black, with shotguns. everybody has a price.",
  r3_breach: "the door was locked. i wasn't going to knock.",
  r3_shotgun: "a shotgun. it didn't ask questions. it ended them.",
  r3_smgs: "two machine pistols. about as subtle as a fire alarm.",
  r3_clear: "the elevator was at the end of the hall. the key was warm in my hand.",
};
const HINTS: Record<string, string> = {
  tut_shoot: "LMB: shoot · WASD: move",
  tut_bullet_time: "RMB / Q: bullet time",
  tut_shootdodge: "SHIFT: shootdodge",
  tut_copium: "H: copium",
  r2_scatter: "red crosshair = armed",
  r3_heavy: "stay out of shotgun range",
  r3_breach: "SHIFT: dive through the door",
  r3_shotgun: "1-3 / WHEEL: switch weapon",
  r3_smgs: "3: dual SMGs",
};
/** The DJ's PA lines (subtitled). */
const PA: Record<string, string> = { pa_1: "girls? we have a guest.", pa_2: "party's over, cutie.", pa_3: "send the rest." };
/** Clear lines are the room's last word: a queued one drops the tutorial lines still waiting. */
const CLEAR_LINES = new Set(["room_clear", "r2_clear", "r3_clear"]);

/** The Radbro's combat voice (chances, cooldowns in real seconds). */
const RADBRO = {
  hurt: { chance: 0.35, cooldown: 3 },
  land: { chance: 0.5, cooldown: 4 },
  /** bt_breath: always on the first bullet time of a fight, then this chance, at most every breathCooldown s. */
  breath: 0.3,
  breathCooldown: 6,
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
  private breathNext = 0;
  private lowSaid = false;
  private spotted = new Set<number>();
  /** Round 2: the DJ (goon index, -1 = none), the PA lines said, the heavy taunt said, the scatter. */
  private dj = -1;
  private paSaid = new Set<string>();
  private taunted = false;
  private scatterAt = -1;
  private whimperNext = 0;
  private lastReload: number[] = [];

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
    this.breathNext = 0;
    this.lowSaid = false;
    this.spotted.clear();
    goonTalk.length = 0;
    const g = this.s.game;
    this.dj = g.enemies.findIndex(e => this.s.level.markers.some(m => m.kind === "enemy" && m.id === e.id && m.data.dj === true));
    this.paSaid.clear();
    this.taunted = false;
    this.scatterAt = -1;
    this.whimperNext = 0;
    this.lastReload = [];
    // the room's opening line
    const enter = this.s.level.room.enterLine;
    if (typeof enter === "string") this.say(enter, typeof this.s.level.room.enterDelay === "number" ? this.s.level.room.enterDelay : 1.5);
  }

  private get tutorial(): boolean {
    return this.s.level.room.tutorial !== false;
  }
  private get clearLine(): string {
    const c = this.s.level.room.clearLine;
    return typeof c === "string" ? c : "room_clear";
  }

  /** The DJ on the PA (once per line, only while she stands), subtitled. */
  private pa(line: "pa_1" | "pa_2" | "pa_3", delay = 0): void {
    const e = this.s.game.enemies[this.dj];
    if (!e || e.state === "dead" || this.paSaid.has(line)) return;
    this.paSaid.add(line);
    const go = () => {
      const d = this.s.game.enemies[this.dj];
      if (!d || d.state === "dead") return;
      const len = pa(line);
      if (len <= 0) { this.paSaid.delete(line); return; } // not loaded / muted: a later cue may try again
      this.barkUntil = performance.now() / 1000 + len + 0.6;
      goonTalk[this.dj] = performance.now() + len * 1000;
      this.sub(PA[line], Math.max(1.8, len + 0.6));
    };
    if (delay > 0) setTimeout(go, delay * 1000); else go();
  }

  /** A heavy's line (positional); the taunt carries a subtitle. */
  private heavy(i: number, line: HeavyLine, force = false): void {
    const now = performance.now() / 1000;
    if (!force && (now < this.barkUntil || now < (this.goonNext[i] ?? 0))) return;
    const e = this.s.game.enemies[i];
    if (!e) return;
    const { dist, pan } = this.where(e.x, e.z);
    if (dist > 38) return;
    const d = heavyBark(line, dist, pan);
    if (d <= 0) return;
    this.barkUntil = now + d + 1.2;
    this.goonNext[i] = now + d + 5; // the heavies are nearly silent
    if (line === "taunt_1") this.sub("you should've sold.", Math.max(1.6, d + 0.6));
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
    if (e.kind === "heavy") {
      // the heavy's own few words (never the girls' voices)
      const line: HeavyLine | null = kind === "alert" ? "alert_1" : kind === "hit" ? (Math.random() < 0.5 ? "hit_1" : "hit_2") : kind === "spotted" ? (Math.random() < 0.5 ? "spotted_1" : "spotted_2") : kind === "reload" ? "reload_1" : null;
      if (line && (kind !== "hit" || Math.random() < 0.5)) this.heavy(i, line, force);
      return;
    }
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

  /** Queue a narrator line once per attempt (the tutorial lines only while the fight is on, and only
   *  in a room that teaches). */
  say(id: string, delay = 0): void {
    if (this.said.has(id) || (id.startsWith("tut_") && (this.s.game.phase !== "play" || !this.tutorial))) return;
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
      case "alert": {
        const en = g.enemies[e.enemy];
        this.bark(e.enemy, "alert");
        this.say("tut_shoot", 1.6);
        if (en?.kind === "heavy") this.say("r3_heavy", 1.0);
        if (this.dj >= 0) this.pa("pa_1", 0.4);
        break;
      }
      case "firstShot":
        if (this.s.level.room.music === "rave") {
          this.scatterAt = now;
          this.say("r2_scatter", 1.5);
          if (this.dj >= 0) this.pa("pa_2", 6);
          // the civilians squeal on their own bus: 2-3 of them over 1.5 s
          const n = 2 + (Math.random() < 0.5 ? 1 : 0);
          for (let k = 0; k < n; k++) {
            const line = ["scream_1", "scream_2", "scream_3", "scream_4", "gasp_1"][Math.floor(Math.random() * 5)];
            const who = g.crowd.people[Math.floor(Math.random() * Math.max(1, g.crowd.people.length))];
            setTimeout(() => { const w = who ? this.where(who.x, who.z) : { dist: 8, pan: 0 }; crowdVoice(line, w.dist, w.pan, 0.95 + Math.random() * 0.12); }, (0.15 + k * 0.6 + Math.random() * 0.25) * 1000);
          }
        }
        break;
      case "trigger":
        if (e.action === "spawn" && e.group === "backup" && this.dj >= 0) this.pa("pa_3", 0.3);
        break;
      case "stagger":
        this.heavy(e.enemy, "stagger_1", true);
        break;
      case "swap":
        break;
      case "hurt":
        if (e.target >= 0 && e.hp > 0 && Math.random() < 0.55) this.bark(e.target, "hit", true);
        else if (e.target === -1) this.playerHurt(e.hp);
        break;
      case "bt":
        if (e.on) {
          this.say("tut_bullet_time", 0.3);
          // the breath in, under the bullet-time whoosh: the first time in a fight, then now and then
          if ((!this.breathed || Math.random() < RADBRO.breath) && now >= this.breathNext) { this.breathed = true; this.breathNext = now + RADBRO.breathCooldown; radbro("bt_breath", 0.05, 1); }
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
        else if (e.item === "shotgun") this.say("r3_shotgun", 0.4);
        else if (e.item === "smgs") this.say("r3_smgs", 0.4);
        break;
      case "kill":
        if (g.stats.kills === 2 && !this.said.has("tut_bullet_time")) this.say("tut_bullet_time", 0.2);
        if (g.enemies[e.target]?.kind === "heavy") { const w = this.where(g.enemies[e.target].x, g.enemies[e.target].z); heavyBark("death_1", w.dist, w.pan); }
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
        else if (e.state === "rush" && prev === "alert") { this.bark(e.idx, "charge", true); this.say("r2_rusher", 0.6); }
        else if (e.state === "advance" && prev === "alert") this.bark(e.idx, "spotted");
      }
      this.lastState[e.idx] = e.state;
      if (e.kind === "heavy") {
        // one taunt per room, close and in sight; "hang on." now and then at a reload
        const { dist } = this.where(e.x, e.z);
        if (!this.taunted && e.state === "advance" && e.sees && dist < 10) { this.taunted = true; this.heavy(e.idx, "taunt_1", true); }
        const lr = this.lastReload[e.idx] ?? 0;
        if (e.reloadT > 0 && lr <= 0 && Math.random() < 0.5) this.heavy(e.idx, "reload_1");
        this.lastReload[e.idx] = e.reloadT;
        if (e.state === "advance" && Math.random() < 0.0015) this.heavy(e.idx, "advance_1");
      } else {
        const lb = this.lastBurst[e.idx] ?? e.burstLeft;
        if (e.burstLeft > lb && e.state !== "dead" && Math.random() < 0.3) this.bark(e.idx, "reload");
        this.lastBurst[e.idx] = e.burstLeft;
      }
    }
    // a girl cowering nearby whimpers now and then
    if (this.scatterAt >= 0 && now > this.whimperNext) {
      this.whimperNext = now + 4 + Math.random() * 3;
      const p = g.crowd.people.find(d => d.state === "cower" && this.where(d.x, d.z).dist < 10);
      if (p) { const w = this.where(p.x, p.z); crowdVoice("whimper_1", w.dist, w.pan); }
    }
    // tutorial beats
    if (this.btEnded && this.said.has("tut_bullet_time")) this.say("tut_shootdodge", 1.2);
    const clearLine = this.clearLine;
    if (g.phase === "clear") this.say(clearLine, 0.3);
    // narrator queue: one line at a time; room clear drops the tutorial lines still waiting and cuts
    // one in progress (the player may reach the door, and the ending, a few seconds after the clear)
    const clearAt = this.queue.findIndex(l => CLEAR_LINES.has(l.id));
    if (clearAt >= 0) this.queue = [this.queue[clearAt]];
    if (this.queue.length && (now >= this.narratorUntil || clearAt >= 0)) {
      const line = this.queue[0];
      if (now >= line.at) {
        this.queue.shift();
        const d = narrate(line.id);
        const until = now + Math.max(d, 3.5);
        this.narratorUntil = until + 0.6;
        useUi.setState({ subtitle: { text: NARRATION[line.id] ?? "", hint: HINTS[line.id] ?? "", until: performance.now() + (until - now) * 1000 } });
      }
    }
  }
}
