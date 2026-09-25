// Round-1 audio on the shared engine: the generated files in public/audio (decoded once after the
// first gesture), a couple of small procedural blips, and the loops (rain, the club's bass through the
// wall, the heartbeat, wet footsteps, the neon buzz, the two noir music loops).
// Bullet time: every world sound plays at rate 0.55 + 0.45 x timeScale through a low-pass that closes
// as time slows, running loops glide to the same rate, the music drops a little and muffles. The
// heartbeat and the bullet-time whooshes stay at normal pitch (they are "inside his head").
import { engine, live, sfxOn, voiceOn, whenCreated, type Engine } from "./engine.ts";

/** Files under public/audio (no extension). Keys are the paths. */
const FILES = [
  "sfx/pistol_shot", "sfx/pistol_shot_2", "sfx/pistol_shot_3", "sfx/dry_fire", "sfx/reload_mag_out", "sfx/reload_mag_in", "sfx/reload_slide",
  "sfx/shell_casing", "sfx/shell_casing_2", "sfx/shell_casing_3", "sfx/impact_concrete", "sfx/impact_concrete_2", "sfx/impact_metal", "sfx/impact_metal_2",
  "sfx/impact_glass", "sfx/impact_glass_2", "sfx/impact_body", "sfx/impact_body_2", "sfx/bullet_whiz", "sfx/bullet_whiz_2", "sfx/bt_enter", "sfx/bt_exit",
  "sfx/heartbeat_loop", "sfx/dive_whoosh", "sfx/dive_land", "sfx/dive_land_2", "sfx/footsteps_wet_loop", "sfx/copium_hiss", "sfx/rain_loop",
  "sfx/club_bass_loop", "sfx/neon_buzz", "music/street_calm", "music/fight_tense",
  ...["alert_1", "alert_2", "spotted_1", "cover_1", "cover_2", "reload_1", "hit_1", "hit_2"].flatMap(k => [`voices/goon_a/${k}`, `voices/goon_b/${k}`]),
  ...["cs1_01", "cs1_02", "cs1_03", "cs1_04", "tut_shoot", "tut_bullet_time", "tut_shootdodge", "tut_copium", "room_clear"].map(k => `voices/narrator/${k}`),
  ...["hurt_1", "hurt_2", "dodge_land", "bt_breath", "heal", "low_hp", "death"].map(k => `voices/radbro/${k}`),
] as const;

const buffers = new Map<string, AudioBuffer>();
let loading: Promise<void> | null = null;

/** Decode every file once (starts on the first call after the context exists). */
export function loadSamples(): Promise<void> {
  if (loading) return loading;
  loading = new Promise<void>(resolve => {
    whenCreated(e => {
      void Promise.all(FILES.map(async k => {
        try {
          const r = await fetch(`/audio/${k}.mp3`);
          if (!r.ok) return;
          buffers.set(k, await e.ac.decodeAudioData(await r.arrayBuffer()));
        } catch {
          /* a missing file is a silent sound */
        }
      })).then(() => resolve());
    });
  });
  return loading;
}

/** Wait for the samples, at most `ms`. */
export async function samplesReady(ms = 4000): Promise<boolean> {
  const p = loadSamples();
  await Promise.race([p, new Promise(r => setTimeout(r, ms))]);
  return buffers.size > 0;
}

export function sampleDuration(k: string): number {
  return buffers.get(k)?.duration ?? 0;
}

// ---- time scale ----------------------------------------------------------------------------------

let rate = 1;
let ts = 1;
let slow: { filter: BiquadFilterNode; out: GainNode } | null = null;
let voiceBus: BiquadFilterNode | null = null;

/** World sounds go through this low-pass (it closes in bullet time). */
function bus(e: Engine): AudioNode {
  if (!slow) {
    const filter = e.ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 18000;
    const out = e.ac.createGain();
    filter.connect(out).connect(e.sfxGain);
    slow = { filter, out };
  }
  return slow.filter;
}
/** In-world voices (barks): pitched and muffled with the world, on the voice volume. */
function vbus(e: Engine): AudioNode {
  if (!voiceBus) {
    voiceBus = e.ac.createBiquadFilter();
    voiceBus.type = "lowpass";
    voiceBus.frequency.value = 18000;
    voiceBus.connect(e.voiceGain);
  }
  return voiceBus;
}

const variant = (keys: readonly string[]) => keys[Math.floor(Math.random() * keys.length)];

type PlayOpts = { gain?: number; rate?: number; pan?: number; at?: number; dest?: AudioNode };

/** The last voice lines played (key @ seconds since the page opened): the headless run reads it. */
export const voiceLog: string[] = [];

/** One-shot buffer; returns the source (null when silent / not loaded). */
function play(e: Engine, key: string, o: PlayOpts = {}): AudioBufferSourceNode | null {
  const buf = buffers.get(key);
  if (!buf) return null;
  if (key.startsWith("voices/")) { voiceLog.push(`${key.slice(7)} @${(performance.now() / 1000).toFixed(1)}`); if (voiceLog.length > 120) voiceLog.shift(); }
  const src = e.ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = o.rate ?? rate;
  const g = e.ac.createGain();
  g.gain.value = o.gain ?? 1;
  let node: AudioNode = src.connect(g);
  if (o.pan) {
    const p = e.ac.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    node = node.connect(p);
  }
  node.connect(o.dest ?? bus(e));
  src.start(o.at ?? e.ac.currentTime);
  return src;
}

/** Called every frame by the driver with the sim's time scale. */
export function setTimeScaleAudio(timeScale: number): void {
  ts = timeScale;
  rate = 0.55 + 0.45 * timeScale;
  const e = live();
  if (!e) return;
  const t = e.ac.currentTime;
  if (slow) slow.filter.frequency.setTargetAtTime(timeScale >= 0.99 ? 18000 : 900 + 9000 * timeScale * timeScale, t, 0.05);
  if (voiceBus) voiceBus.frequency.setTargetAtTime(timeScale >= 0.99 ? 18000 : 1400 + 9000 * timeScale, t, 0.05);
  e.musicFilter.frequency.setTargetAtTime(timeScale >= 0.99 ? 16000 : 700 + 6000 * timeScale, t, 0.08);
  for (const l of loops.values()) if (l.follow) l.src.playbackRate.setTargetAtTime(l.follow === "music" ? 0.8 + 0.2 * timeScale : rate, t, 0.12);
  // the club's beat clock (the neon pulses on it)
  const now = performance.now() / 1000;
  if (clubClock.last) clubClock.pos += (now - clubClock.last) * rate;
  clubClock.last = now;
}

// ---- procedural blips -----------------------------------------------------------------------------

function tone(e: Engine, t: number, dur: number, f0: number, f1: number, gain: number, type: OscillatorType = "sine", dest?: AudioNode): void {
  const o = e.ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0 * rate, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * rate), t + dur / rate);
  const g = e.ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur / rate);
  o.connect(g).connect(dest ?? bus(e));
  o.start(t);
  o.stop(t + dur / rate + 0.05);
}

/** Distance attenuation 0..1. */
const att = (d: number) => Math.max(0.06, Math.min(1, 7 / Math.max(7, d)));

const SHOTS = ["sfx/pistol_shot", "sfx/pistol_shot_2", "sfx/pistol_shot_3"];
const CASINGS = ["sfx/shell_casing", "sfx/shell_casing_2", "sfx/shell_casing_3"];

export const sfx = {
  shot(player: boolean, dist = 0, pan = 0): void {
    const e = sfxOn();
    if (!e) return;
    play(e, variant(SHOTS), { gain: player ? 0.85 : 0.55 * att(dist), pan: player ? 0 : pan * 0.8, rate: rate * (player ? 1 : 0.94 + Math.random() * 0.08) });
    // brass on the wet street a beat later
    if (player) play(e, variant(CASINGS), { gain: 0.22, at: e.ac.currentTime + (0.28 + Math.random() * 0.2) / rate, pan: 0.3 });
  },
  impact(surface: string, dist = 0, pan = 0): void {
    const e = sfxOn();
    if (!e) return;
    const k = surface === "metal" ? ["sfx/impact_metal", "sfx/impact_metal_2"] : surface === "glass" ? ["sfx/impact_glass", "sfx/impact_glass_2"] : ["sfx/impact_concrete", "sfx/impact_concrete_2"];
    play(e, variant(k), { gain: 0.5 * att(dist), pan });
  },
  flesh(dist = 0, pan = 0): void {
    const e = sfxOn();
    if (e) play(e, variant(["sfx/impact_body", "sfx/impact_body_2"]), { gain: 0.7 * att(dist), pan });
  },
  kill(headshot: boolean): void {
    const e = sfxOn();
    if (!e) return;
    const t = e.ac.currentTime;
    tone(e, t, 0.25, headshot ? 880 : 520, headshot ? 1320 : 390, 0.05, "triangle");
  },
  hurt(): void {
    const e = sfxOn();
    if (!e) return;
    play(e, variant(["sfx/impact_body", "sfx/impact_body_2"]), { gain: 0.9 });
    tone(e, e.ac.currentTime, 0.22, 70, 40, 0.6);
  },
  /** Mag out, mag in, slide over `dur` real seconds. */
  reload(dur: number): void {
    const e = sfxOn();
    if (!e) return;
    const t = e.ac.currentTime;
    play(e, "sfx/reload_mag_out", { gain: 0.6 });
    play(e, "sfx/reload_mag_in", { gain: 0.6, at: t + dur * 0.5 });
    play(e, "sfx/reload_slide", { gain: 0.6, at: t + dur * 0.82 });
  },
  dry(): void {
    const e = sfxOn();
    if (e) play(e, "sfx/dry_fire", { gain: 0.5 });
  },
  bullettime(on: boolean): void {
    const e = sfxOn();
    if (e) play(e, on ? "sfx/bt_enter" : "sfx/bt_exit", { gain: 0.7, rate: 1, dest: e.sfxGain });
  },
  dodge(): void {
    const e = sfxOn();
    if (e) play(e, "sfx/dive_whoosh", { gain: 0.8, rate: 1, dest: e.sfxGain });
  },
  land(): void {
    const e = sfxOn();
    if (e) play(e, variant(["sfx/dive_land", "sfx/dive_land_2"]), { gain: 0.8 });
  },
  copium(): void {
    const e = sfxOn();
    if (e) play(e, "sfx/copium_hiss", { gain: 0.7 });
  },
  whiz(pan: number): void {
    const e = sfxOn();
    if (e) play(e, variant(["sfx/bullet_whiz", "sfx/bullet_whiz_2"]), { gain: 0.55, pan });
  },
  pickup(): void {
    const e = sfxOn();
    if (!e) return;
    const t = e.ac.currentTime;
    tone(e, t, 0.12, 660, 990, 0.1, "triangle");
    tone(e, t + 0.08, 0.14, 990, 1320, 0.08, "triangle");
  },
};

// ---- loops ----------------------------------------------------------------------------------------

type Loop = { src: AudioBufferSourceNode; gain: GainNode; follow: "world" | "music" | null; filter?: BiquadFilterNode };
const loops = new Map<string, Loop>();

/** Start (once) a looping buffer at gain 0; `follow` = glide its rate with bullet time. */
function loop(e: Engine, key: string, dest: AudioNode, follow: Loop["follow"], filter?: BiquadFilterNode): Loop | null {
  let l = loops.get(key);
  if (l) return l;
  const buf = buffers.get(key);
  if (!buf) return null;
  const src = e.ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = follow === "music" ? 0.8 + 0.2 * ts : follow ? rate : 1;
  const gain = e.ac.createGain();
  gain.gain.value = 0;
  if (filter) src.connect(filter).connect(gain);
  else src.connect(gain);
  gain.connect(dest);
  src.start();
  l = { src, gain, follow, filter };
  loops.set(key, l);
  return l;
}

function fade(l: Loop | null, to: number, tau = 0.3): void {
  const e = engine();
  if (l && e) l.gain.gain.setTargetAtTime(to, e.ac.currentTime, tau);
}

/** Street ambience (rain + distant traffic) while in a room. */
export function setAmbience(on: boolean): void {
  const e = live();
  if (!e) return;
  fade(loop(e, "sfx/rain_loop", bus(e), "world"), on ? 0.42 : 0, 0.6);
}

/** Heartbeat loop while bullet time / a dive is on (normal pitch). */
export function setHeartbeat(on: boolean): void {
  const e = live();
  if (!e) return;
  fade(loop(e, "sfx/heartbeat_loop", e.sfxGain, null), on ? 0.75 : 0, on ? 0.08 : 0.25);
}

/** Wet footsteps: 0 = standing, 1 = full run. */
export function setFootsteps(speed01: number): void {
  const e = live();
  if (!e) return;
  const l = loop(e, "sfx/footsteps_wet_loop", bus(e), null);
  fade(l, Math.min(1, speed01) * 0.35, 0.08);
  if (l) l.src.playbackRate.setTargetAtTime(rate * (0.75 + 0.5 * speed01), e.ac.currentTime, 0.1);
}

/** The neon's hum near the club door: 0..1. */
export function setNeonBuzz(near: number): void {
  const e = live();
  if (e) fade(loop(e, "sfx/neon_buzz", bus(e), "world"), near * near * 0.18, 0.3);
}

/** The rave's bass through the wall: `near` 0..1 = how close to the club door (louder, brighter). */
export function setClubBass(near: number): void {
  const e = live();
  if (!e) return;
  let l = loops.get("sfx/club_bass_loop") ?? null;
  if (!l) {
    const f = e.ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 180;
    l = loop(e, "sfx/club_bass_loop", bus(e), "world", f);
    if (l) { clubClock.pos = 0; clubClock.last = performance.now() / 1000; }
  }
  if (!l) return;
  fade(l, near * 0.85, 0.25);
  l.filter?.frequency.setTargetAtTime(140 + 420 * near * near, e.ac.currentTime, 0.25);
}

/** Beat clock of the bass loop (128 bpm, the kick on the beat). */
const clubClock = { pos: 0, last: 0 };
const BEAT = 60 / 128;

/**
 * The club's kick as a light hook: 0..1, peaking on each kick of the bass loop and decaying over
 * ~0.25 s (slower in bullet time), scaled by how loud the bass is. -1 when no audio is running
 * (muted / no gesture yet), so the look falls back to its own beat.
 */
export function clubPulse(): number {
  const l = loops.get("sfx/club_bass_loop");
  if (!live() || !l) return -1;
  const since = clubClock.pos % BEAT;
  const level = Math.min(1, l.gain.gain.value / 0.5);
  return Math.exp(-since * 7) * (0.35 + 0.65 * level);
}

export type MusicCue = "calm" | "fight" | null;
let cue: MusicCue = null;

/** Noir music: calm street loop, the fight loop, or silence; crossfades. */
export function setMusic(c: MusicCue): void {
  const e = live();
  if (!e || c === cue) return;
  const calm = loop(e, "music/street_calm", e.musicIn, "music");
  const fight = loop(e, "music/fight_tense", e.musicIn, "music");
  if (!calm && !fight) return;
  cue = c;
  fade(calm, c === "calm" ? 0.9 : 0, c === "calm" ? 1.2 : 0.6);
  fade(fight, c === "fight" ? 0.95 : 0, c === "fight" ? 0.35 : 1.2);
}

/** Everything in the room goes quiet (title / results). Music keeps its cue unless `music`. */
export function stopRoomAudio(music = false): void {
  for (const k of ["sfx/rain_loop", "sfx/club_bass_loop", "sfx/footsteps_wet_loop", "sfx/heartbeat_loop", "sfx/neon_buzz"]) fade(loops.get(k) ?? null, 0, 0.3);
  if (music) setMusic(null);
}

// ---- voices ---------------------------------------------------------------------------------------

export type GoonVoice = "goon_a" | "goon_b";
export type BarkKind = "alert" | "spotted" | "cover" | "reload" | "hit";
const BARKS: Record<BarkKind, string[]> = {
  alert: ["alert_1", "alert_2"], spotted: ["spotted_1"], cover: ["cover_1", "cover_2"], reload: ["reload_1"], hit: ["hit_1", "hit_2"],
};

const lastBark = new Map<string, string>();

/**
 * A goon's line in the world (pitched with bullet time). `pitch` is the goon's own voice (a small
 * per-goon rate offset, so two girls on the same voice still sound like two people); the same line is
 * never picked twice in a row for a voice. Returns its length in REAL seconds, 0 = silent.
 */
export function bark(voice: GoonVoice, kind: BarkKind, dist: number, pan: number, pitch = 1): number {
  const e = voiceOn();
  if (!e) return 0;
  const opts = BARKS[kind], prev = lastBark.get(`${voice}/${kind}`);
  const pick = opts.length > 1 ? variant(opts.filter(k => k !== prev)) : opts[0];
  lastBark.set(`${voice}/${kind}`, pick);
  const r = rate * pitch;
  const src = play(e, `voices/${voice}/${pick}`, { gain: 0.95 * att(dist * 0.7), pan: pan * 0.7, dest: vbus(e), rate: r });
  return src ? (src.buffer?.duration ?? 0) / r : 0;
}

export type RadbroLine = "hurt_1" | "hurt_2" | "dodge_land" | "bt_breath" | "heal" | "low_hp" | "death";

/**
 * The player's own voice (the narrator's, in the moment): grunts, the bullet-time breath, the copium
 * sigh, "not yet.", the death groan. Unscaled like the narrator and the bullet-time whooshes (it is
 * him, not the world), straight onto the voice volume. `delay` in real seconds. Returns its length.
 */
export function radbro(line: RadbroLine, delay = 0, gain = 0.9): number {
  const e = voiceOn();
  if (!e) return 0;
  const src = play(e, `voices/radbro/${line}`, { gain, rate: 1, dest: e.voiceGain, at: e.ac.currentTime + delay });
  return src ? (src.buffer?.duration ?? 0) : 0;
}

let narrating: AudioBufferSourceNode | null = null;

/**
 * The narrator (outside time: never pitched). Dips the music under the line; returns the line's length
 * in seconds (0 when silent or not loaded). A new line cuts the previous one.
 */
export function narrate(line: string): number {
  const e = voiceOn();
  if (!e) return 0;
  try { narrating?.stop(); } catch { /* already ended */ }
  const src = play(e, `voices/narrator/${line}`, { gain: 1, rate: 1, dest: e.voiceGain });
  if (!src) return 0;
  narrating = src;
  const t = e.ac.currentTime, d = src.buffer!.duration;
  e.talk.gain.cancelScheduledValues(t);
  e.talk.gain.setTargetAtTime(0.4, t, 0.15);
  e.talk.gain.setTargetAtTime(1, t + d, 0.4);
  src.onended = () => { if (narrating === src) narrating = null; };
  return d;
}

export function stopNarration(): void {
  try { narrating?.stop(); } catch { /* ended */ }
  narrating = null;
  const e = engine();
  if (e) { e.talk.gain.cancelScheduledValues(e.ac.currentTime); e.talk.gain.setTargetAtTime(1, e.ac.currentTime, 0.2); }
}
