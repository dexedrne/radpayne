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
// The PA and the heavies never talk over the narrator (nor the narrator over them): a line that would
// is held until the air is clear (the PA up to 8 s, the taunt 5 s, a heavy's shout ~1 s; his grunts
// are dropped), subtitle and all. The room's rusher line is the room's own (room.rusherLine).
import type { Session } from "./session.ts";
import type { GameEvent } from "../sim/types.ts";
import { bark, crowdVoice, heavyBark, narrate, pa, radbro, stopNarration, type BarkKind, type GoonVoice, type HeavyLine, type RadbroLine } from "../audio/sfx.ts";
import { useUi } from "../ui/store.ts";
import { PLAYER } from "../sim/tuning.ts";

/** this.io.now() until which goon i is talking (EnemiesView moves the mouth). */
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

/** What the director plays through and its clock (the audio in the game; fakes in the tests). */
export type DirectorIO = {
  /** Milliseconds (performance.now in the game). */
  now(): number;
  later(fn: () => void, ms: number): void;
  narrate(line: string): number;
  stopNarration(): void;
  pa(line: "pa_1" | "pa_2" | "pa_3"): number;
  heavyBark(line: HeavyLine, dist: number, pan: number): number;
  bark(voice: GoonVoice, kind: BarkKind, dist: number, pan: number, pitch?: number): number;
  radbro(line: RadbroLine, delay?: number, gain?: number): number;
  crowdVoice(line: string, dist: number, pan: number, pitch?: number): boolean;
};
export const SFX_IO: DirectorIO = {
  now: () => performance.now(), later: (fn, ms) => { setTimeout(fn, ms); }, narrate: l => narrate(l), stopNarration, pa, heavyBark, bark, radbro, crowdVoice,
};

export class Director {
  private readonly s: Session;
  private run = -1;
  private said = new Set<string>();
  private queue: Line[] = [];
  private narratorUntil = 0;
  private barkUntil = 0;
  /** When the bark on the air right now ends (real s): a forced line (a hit) never talks over it. */
  private barkPlaying = 0;
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
  /** Lines whose key hint is spent (he has done it: the breach door is open). */
  private noHint = new Set<string>();
  /** When the PA / heavy line on the air ends (real s): the narrator waits for it. */
  private otherUntil = 0;
  /** PA / heavy lines held while the narrator talks: played in order once the air is clear, dropped
   *  past `until`; `go` plays one and returns its length (0 = not played). */
  private held: Array<{ until: number; go: () => number }> = [];

  private readonly io: DirectorIO;

  constructor(s: Session, io: DirectorIO = SFX_IO) {
    this.s = s;
    this.io = io;
  }

  private reset(): void {
    this.run = this.s.run;
    this.said.clear();
    this.queue = [];
    this.narratorUntil = 0;
    this.barkUntil = 0;
    this.barkPlaying = 0;
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
    this.otherUntil = 0;
    this.held = [];
    this.noHint.clear();
    // the room's opening line (not again on a retry from a checkpoint inside the room)
    const enter = this.s.level.room.enterLine;
    if (typeof enter === "string" && !g.resumed) this.say(enter, typeof this.s.level.room.enterDelay === "number" ? this.s.level.room.enterDelay : 1.5);
  }

  private get tutorial(): boolean {
    return this.s.level.room.tutorial !== false;
  }
  /** The narrator's line for the room's first rusher (room 2's only: room.rusherLine). */
  private get rusherLine(): string {
    const c = this.s.level.room.rusherLine;
    return typeof c === "string" ? c : "";
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
    const run = this.run;
    const go = (): number => {
      const d = this.s.game.enemies[this.dj];
      if (run !== this.run || !d || d.state === "dead") return 0;
      const len = this.io.pa(line);
      if (len <= 0) { this.paSaid.delete(line); return 0; } // not loaded / muted: a later cue may try again
      this.barkUntil = this.io.now() / 1000 + len + 0.6;
      this.barkPlaying = this.io.now() / 1000 + len;
      goonTalk[this.dj] = this.io.now() + len * 1000;
      this.sub(PA[line], Math.max(1.8, len + 0.6));
      return len;
    };
    const cue = () => { if (run === this.run) this.other(8, go); };
    if (delay > 0) this.io.later(cue, delay * 1000); else cue();
  }

  /** The air is taken: the narrator mid-line, or a PA / heavy line still playing. */
  private airBusy(now: number): boolean {
    return this.narrating() || now < this.otherUntil || now < this.barkPlaying;
  }

  /** A PA / heavy line: now if the air is clear, else held (up to `wait` s) until it is. */
  private other(wait: number, go: () => number): void {
    const now = this.io.now() / 1000;
    if (this.airBusy(now)) { this.held.push({ until: now + wait, go }); return; }
    const d = go();
    if (d > 0) this.otherUntil = now + d + 0.25;
  }

  /** A heavy's line (positional); the taunt carries a subtitle. Never over the narrator: the taunt and
   *  his shouts wait a moment for the air to clear, his grunts are dropped. */
  private heavy(i: number, line: HeavyLine, force = false): void {
    const now = this.io.now() / 1000;
    const hold = line === "taunt_1" ? 5 : line === "stagger_1" || line === "death_1" || line.startsWith("spotted") || line === "alert_1" ? 1.2 : 0;
    if (this.narrating() || now < this.otherUntil) {
      if (hold > 0) { const run = this.run; this.held.push({ until: now + hold, go: () => (run === this.run ? this.heavyNow(i, line) : 0) }); }
      return;
    }
    if (now < this.barkPlaying && line !== "death_1") return; // never over another voice (his death always)
    if (!force && (now < this.barkUntil || now < (this.goonNext[i] ?? 0))) return;
    const d = this.heavyNow(i, line);
    if (d > 0) this.otherUntil = now + d + 0.25;
  }

  /** Play a heavy's line now (a dead heavy only says his death). Returns its length. */
  private heavyNow(i: number, line: HeavyLine): number {
    const now = this.io.now() / 1000;
    const e = this.s.game.enemies[i];
    if (!e || (e.state === "dead" && line !== "death_1")) return 0;
    const { dist, pan } = this.where(e.x, e.z);
    if (dist > 38) return 0;
    const d = this.io.heavyBark(line, dist, pan);
    if (d <= 0) return 0;
    this.barkUntil = now + d + 1.2;
    this.barkPlaying = now + d;
    this.goonNext[i] = now + d + 5; // the heavies are nearly silent
    if (line === "taunt_1") this.sub("you should've sold.", Math.max(1.6, d + 0.6));
    return d;
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

  /** A goon bark if nobody is talking. `force` (a hit, a rusher's charge) skips the gap and her own
   *  cooldown, never a line still on the air. */
  private bark(i: number, kind: BarkKind, force = false): void {
    const now = this.io.now() / 1000;
    if (now < this.barkPlaying) return;
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
    const d = this.io.bark(this.voiceOf(i), kind, dist, pan, this.pitchOf(i));
    if (d <= 0) return;
    this.barkUntil = now + d + 1.5; // one talker at a time, ~1.5 s between barks
    this.barkPlaying = now + d;
    this.goonNext[i] = now + d + 3.5;
    goonTalk[i] = this.io.now() + d * 1000;
  }

  /** Queue a narrator line once per attempt (the tutorial lines only while the fight is on, and only
   *  in a room that teaches). */
  say(id: string, delay = 0): void {
    if (this.said.has(id) || (id.startsWith("tut_") && (this.s.game.phase !== "play" || !this.tutorial))) return;
    this.said.add(id);
    this.queue.push({ id, at: this.io.now() / 1000 + delay });
  }

  /** The narrator is mid-line (the Radbro's own grunts wait: it is the same voice). */
  private narrating(): boolean {
    return this.io.now() / 1000 < this.narratorUntil - 0.6;
  }

  /** A short spoken bark gets the HUD subtitle when the narrator is not using it. */
  private sub(text: string, secs: number): void {
    if (this.narrating()) return;
    useUi.setState({ subtitle: { text, hint: "", until: this.io.now() + secs * 1000 } });
  }

  private playerHurt(hp: number): void {
    const now = this.io.now() / 1000;
    if (hp <= 0) return;
    if (!this.lowSaid && hp < PLAYER.maxHealth * RADBRO.lowHp) {
      this.lowSaid = true;
      const d = this.io.radbro("low_hp");
      if (d > 0) { this.hurtNext = now + d + RADBRO.hurt.cooldown; this.sub("not yet.", Math.max(1.6, d + 0.8)); }
      return;
    }
    if (now < this.hurtNext || this.narrating() || Math.random() >= RADBRO.hurt.chance) return;
    this.hurtAlt ^= 1;
    const d = this.io.radbro(this.hurtAlt ? "hurt_1" : "hurt_2");
    if (d > 0) this.hurtNext = now + RADBRO.hurt.cooldown;
  }

  onEvent(e: GameEvent): void {
    if (this.run !== this.s.run) this.reset();
    const g = this.s.game;
    const now = this.io.now() / 1000;
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
            this.io.later(() => { const w = who ? this.where(who.x, who.z) : { dist: 8, pan: 0 }; this.io.crowdVoice(line, w.dist, w.pan, 0.95 + Math.random() * 0.12); }, (0.15 + k * 0.6 + Math.random() * 0.25) * 1000);
          }
        }
        break;
      case "trigger":
        if (e.action === "spawn" && e.group === "backup" && this.dj >= 0) this.pa("pa_3", 0.3);
        // the locked office door: the line and its key hint
        if (e.action === "breach") this.say("r3_breach", 0.2);
        break;
      case "breach": {
        // his effort grunt on the dive through it (the kick from inside is the heavy's moment)
        if (!e.kick && !this.narrating()) this.io.radbro("breach", 0.05);
        // the door is open: "SHIFT: dive through the door" goes at once (and never shows later)
        this.noHint.add("r3_breach");
        const sub = useUi.getState().subtitle;
        if (sub.hint && sub.hint === HINTS.r3_breach) useUi.setState({ subtitle: { ...sub, hint: "" } });
        break;
      }
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
          if ((!this.breathed || Math.random() < RADBRO.breath) && now >= this.breathNext) { this.breathed = true; this.breathNext = now + RADBRO.breathCooldown; this.io.radbro("bt_breath", 0.05, 1); }
        } else this.btEnded = true;
        break;
      case "land":
        if (now >= this.landNext && !this.narrating() && Math.random() < RADBRO.land.chance) {
          if (this.io.radbro("dodge_land") > 0) this.landNext = now + RADBRO.land.cooldown;
        }
        break;
      case "copium":
        if (!this.narrating()) this.io.radbro("heal", RADBRO.healDelay);
        break;
      case "playerDead":
        this.io.stopNarration();
        this.queue = [];
        this.io.radbro("death");
        break;
      case "pickup":
        if (e.item === "copium") this.say("tut_copium", 0.4);
        else if (e.item === "shotgun") this.say("r3_shotgun", 0.4);
        else if (e.item === "smgs") this.say("r3_smgs", 0.4);
        break;
      case "kill":
        if (g.stats.kills === 2 && !this.said.has("tut_bullet_time")) this.say("tut_bullet_time", 0.2);
        if (g.enemies[e.target]?.kind === "heavy") this.heavy(e.target, "death_1", true);
        break;
    }
  }

  /** Every frame (real time). */
  frame(): void {
    if (this.run !== this.s.run) this.reset();
    const g = this.s.game;
    const now = this.io.now() / 1000;
    // gang barks from state changes
    for (const e of g.enemies) {
      const prev = this.lastState[e.idx] ?? e.state;
      if (e.state !== prev) {
        if (e.state === "move" && (prev === "alert" || prev === "peek") && e.cover >= 0) this.bark(e.idx, "cover");
        else if ((e.state === "peek" || e.state === "engage") && prev === "alert") this.bark(e.idx, "spotted");
        else if (e.state === "rush" && prev === "alert") { this.bark(e.idx, "charge", true); if (this.rusherLine) this.say(this.rusherLine, 0.6); }
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
      if (p) { const w = this.where(p.x, p.z); this.io.crowdVoice("whimper_1", w.dist, w.pan); }
    }
    // tutorial beats
    if (this.btEnded && this.said.has("tut_bullet_time")) this.say("tut_shootdodge", 1.2);
    const clearLine = this.clearLine;
    if (g.phase === "clear") this.say(clearLine, 0.3);
    // PA / heavy lines held for the narrator: the next one once the air is clear (stale ones dropped)
    while (this.held.length && now > this.held[0].until) this.held.shift();
    if (this.held.length && !this.airBusy(now)) {
      const h = this.held.shift()!;
      const d = h.go();
      if (d > 0) this.otherUntil = now + d + 0.25;
    }
    // narrator queue: one line at a time; room clear drops the tutorial lines still waiting and cuts
    // one in progress (the player may reach the door, and the ending, a few seconds after the clear)
    const clearAt = this.queue.findIndex(l => CLEAR_LINES.has(l.id));
    if (clearAt >= 0) this.queue = [this.queue[clearAt]];
    // a tutorial line never starts outside the fight (the final-kill cam, the clear): it is dropped
    while (this.queue.length && this.queue[0].id.startsWith("tut_") && g.phase !== "play") this.queue.shift();
    // (never over a PA / heavy line still on the air: it waits the second or two)
    if (this.queue.length && (now >= this.narratorUntil || clearAt >= 0) && now >= this.otherUntil && g.phase !== "killcam") {
      const line = this.queue[0];
      if (now >= line.at) {
        this.queue.shift();
        const d = this.io.narrate(line.id);
        const until = now + Math.max(d, 3.5);
        this.narratorUntil = until + 0.6;
        useUi.setState({ subtitle: { text: NARRATION[line.id] ?? "", hint: this.noHint.has(line.id) ? "" : HINTS[line.id] ?? "", until: this.io.now() + (until - now) * 1000 } });
      }
    }
  }
}
