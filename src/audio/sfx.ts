// Round-1 audio on the shared engine: the generated files in public/audio (decoded once after the
// first gesture), a couple of small procedural blips, and the loops (rain, the club's bass through the
// wall, the heartbeat, wet footsteps, the neon buzz, the two noir music loops).
// Bullet time: every world sound plays at rate 0.55 + 0.45 x timeScale through a low-pass that closes
// as time slows, running loops glide to the same rate, the music drops a little and muffles. The
// heartbeat and the bullet-time whooshes stay at normal pitch (they are "inside his head").
// Round 2: the shotgun (blast, pump, the hull), the SMGs (at most 6 shots ringing, a room tail on
// release), weapon / ammo pickups and the swap, impacts by surface (wood, bottles, drywall, speaker,
// screen), indoor casings and footsteps (setIndoor), music per room (setMusic(cue, room): the rave's
// club track is diegetic and cuts on the first shot with a record scratch), the crowd on its own bus
// (at most 2 screams at once) with its cheer / panic loops, the DJ's PA lines, the heavy's voice.
// Room 3: the office room tone with the club's kick through the wall, the breach (the door bursting in,
// slowed with the world), the glass wall, a failing tube now and then, the keycard and the elevator.
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
  // round 2
  ...["shotgun_shot", "shotgun_shot_2", "shotgun_shot_3", "shotgun_pump", "shotgun_shell_in", "shotgun_shell_drop", "shotgun_shell_drop_2", "smg_shot", "smg_shot_2", "smg_shot_3",
    "smg_tail", "smg_bolt", "weapon_pickup", "ammo_pickup", "weapon_swap", "shell_casing_floor", "shell_casing_floor_2", "shell_casing_floor_3", "impact_wood", "impact_wood_2",
    "impact_bottle", "impact_bottle_2", "impact_drywall", "impact_drywall_2", "impact_speaker", "impact_screen", "impact_body_heavy", "glass_wall_shatter", "footsteps_hard_loop",
    "heavy_step", "heavy_step_2", "dive_land_floor", "dive_land_floor_2", "record_scratch", "door_breach", "door_open", "keycard_beep", "elevator_ding", "elevator_doors",
    "crowd_scatter", "crowd_panic_loop", "crowd_cheer_loop", "office_room_tone_loop", "fluorescent_flicker"].map(k => `sfx/${k}`),
  "music/rave_club", "music/fight_rave", "music/backrooms_calm",
  ...["r2_enter", "r2_scatter", "r2_rusher", "r2_clear", "r3_enter", "r3_heavy", "r3_breach", "r3_shotgun", "r3_smgs", "r3_clear", "cs2_01", "cs2_02", "cs2_03", "cs2_04"].map(k => `voices/narrator/${k}`),
  "voices/goon_a/charge_1", "voices/goon_b/charge_1", "voices/goon_b/cs2_bouncer", "voices/radbro/breach",
  ...["scream_1", "scream_2", "scream_3", "scream_4", "gasp_1", "whimper_1"].map(k => `voices/crowd/${k}`),
  ...["pa_1", "pa_2", "pa_3"].map(k => `voices/pa/${k}`),
  ...["alert_1", "spotted_1", "spotted_2", "advance_1", "taunt_1", "reload_1", "hit_1", "hit_2", "stagger_1", "death_1"].map(k => `voices/heavy/${k}`),
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
const SHOTGUN = ["sfx/shotgun_shot", "sfx/shotgun_shot_2", "sfx/shotgun_shot_3"];
const SMG = ["sfx/smg_shot", "sfx/smg_shot_2", "sfx/smg_shot_3"];
const CASINGS = ["sfx/shell_casing", "sfx/shell_casing_2", "sfx/shell_casing_3"];
const CASINGS_FLOOR = ["sfx/shell_casing_floor", "sfx/shell_casing_floor_2", "sfx/shell_casing_floor_3"];
const IMPACTS: Record<string, string[]> = {
  metal: ["sfx/impact_metal", "sfx/impact_metal_2"],
  glass: ["sfx/impact_glass", "sfx/impact_glass_2"],
  wood: ["sfx/impact_wood", "sfx/impact_wood_2"],
  bottle: ["sfx/impact_bottle", "sfx/impact_bottle_2"],
  drywall: ["sfx/impact_drywall", "sfx/impact_drywall_2"],
  speaker: ["sfx/impact_speaker"],
  screen: ["sfx/impact_screen"],
  concrete: ["sfx/impact_concrete", "sfx/impact_concrete_2"],
};

/** Indoors (the club, the back rooms): no rain, hard floors, brass on tile. */
let indoor = false;
export function setIndoor(on: boolean): void {
  indoor = on;
}

/** SMG shots still ringing (at most 6) and the tail after a burst. */
let smgVoices = 0;
let smgLast = 0;
let smgTailFor: ReturnType<typeof setTimeout> | null = null;

export const sfx = {
  /** A shot: `weapon` picks the sound (pistols / shotgun / SMGs, the gang's pistol / smg / shotgun). */
  shot(player: boolean, dist = 0, pan = 0, weapon = "pistols"): void {
    const e = sfxOn();
    if (!e) return;
    const g = player ? 0.85 : 0.55 * att(dist);
    const p = player ? 0 : pan * 0.8;
    const r = rate * (player ? 1 : 0.94 + Math.random() * 0.08);
    const t = e.ac.currentTime;
    if (weapon === "shotgun") {
      play(e, variant(SHOTGUN), { gain: g * 1.05, pan: p, rate: r });
      if (player) {
        // the pump racks at the clip's pumpBack (0.30 s on his clock), the hull hits the floor after it
        play(e, "sfx/shotgun_pump", { gain: 0.55, at: t + 0.3 / rate });
        play(e, variant(["sfx/shotgun_shell_drop", "sfx/shotgun_shell_drop_2"]), { gain: 0.28, pan: 0.35, at: t + (0.62 + Math.random() * 0.15) / rate });
      }
      return;
    }
    if (weapon === "smgs" || weapon === "smg") {
      if (smgVoices >= 6) return;
      smgVoices++;
      const src = play(e, variant(SMG), { gain: g * 0.8, pan: p, rate: r });
      if (src) src.onended = () => { smgVoices = Math.max(0, smgVoices - 1); };
      else smgVoices--;
      if (player) {
        // the room's tail once the trigger is let go
        smgLast = performance.now();
        if (smgTailFor) clearTimeout(smgTailFor);
        smgTailFor = setTimeout(() => { const ee = sfxOn(); if (ee && performance.now() - smgLast >= 110) play(ee, "sfx/smg_tail", { gain: 0.5 }); }, 130);
        if (Math.random() < 0.35) play(e, variant(indoor ? CASINGS_FLOOR : CASINGS), { gain: 0.14, at: t + (0.25 + Math.random() * 0.2) / rate, pan: 0.3 });
      }
      return;
    }
    play(e, variant(SHOTS), { gain: g, pan: p, rate: r });
    // brass on the wet street (or the club's floor) a beat later
    if (player) play(e, variant(indoor ? CASINGS_FLOOR : CASINGS), { gain: 0.22, at: t + (0.28 + Math.random() * 0.2) / rate, pan: 0.3 });
  },
  impact(surface: string, dist = 0, pan = 0): void {
    const e = sfxOn();
    if (!e) return;
    const k = IMPACTS[surface] ?? IMPACTS.concrete;
    play(e, variant(k), { gain: (surface === "bottle" || surface === "screen" ? 0.42 : 0.5) * att(dist), pan });
  },
  /** A heavy hit: the big dull punch (stylised). */
  fleshHeavy(dist = 0, pan = 0): void {
    const e = sfxOn();
    if (e) play(e, "sfx/impact_body_heavy", { gain: 0.75 * att(dist), pan });
  },
  swap(): void {
    const e = sfxOn();
    if (e) play(e, "sfx/weapon_swap", { gain: 0.6 });
  },
  weaponPickup(ammoOnly: boolean): void {
    const e = sfxOn();
    if (e) play(e, ammoOnly ? "sfx/ammo_pickup" : "sfx/weapon_pickup", { gain: 0.7 });
  },
  /** The shotgun's reload: a shell every 0.3 s (4 of them), the pump at 1.6 of 2.0 s. */
  reloadShotgun(dur: number): void {
    const e = sfxOn();
    if (!e) return;
    const t = e.ac.currentTime, k = dur / 2;
    for (const at of [0.3, 0.6, 0.9, 1.2]) play(e, "sfx/shotgun_shell_in", { gain: 0.5, at: t + at * k });
    play(e, "sfx/shotgun_pump", { gain: 0.55, at: t + 1.6 * k });
  },
  /** The first shot in the club: the DJ's record scratch stops the music dead, the crowd shrieks. */
  scatter(): void {
    const e = sfxOn();
    if (!e) return;
    play(e, "sfx/record_scratch", { gain: 0.8, rate: 1, dest: e.sfxGain });
    play(e, "sfx/crowd_scatter", { gain: 0.6, at: e.ac.currentTime + 0.15 });
  },
  heavyStep(dist: number, pan: number): void {
    const e = sfxOn();
    if (e) play(e, variant(["sfx/heavy_step", "sfx/heavy_step_2"]), { gain: 0.5 * att(dist), pan });
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
    if (e) play(e, variant(indoor ? ["sfx/dive_land_floor", "sfx/dive_land_floor_2"] : ["sfx/dive_land", "sfx/dive_land_2"]), { gain: 0.8 });
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
  /** The office door gives (a dive through it, or a kick from inside): slowed with the world. */
  breach(dist = 0, pan = 0): void {
    const e = sfxOn();
    if (e) play(e, "sfx/door_breach", { gain: 0.95 * att(dist), pan });
  },
  /** A one-shot in the room (the glass wall, a failing tube, the keycard, the elevator): world time. */
  at(key: "glass_wall_shatter" | "fluorescent_flicker" | "keycard_beep" | "elevator_ding" | "elevator_doors" | "door_open", dist = 0, pan = 0, gain = 0.7, delay = 0): void {
    const e = sfxOn();
    if (e) play(e, `sfx/${key}`, { gain: gain * att(dist), pan, at: e.ac.currentTime + delay });
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

/** Footsteps (wet on the street, hard indoors): 0 = standing, 1 = full run. */
export function setFootsteps(speed01: number): void {
  const e = live();
  if (!e) return;
  const on = loop(e, indoor ? "sfx/footsteps_hard_loop" : "sfx/footsteps_wet_loop", bus(e), null);
  const off = loops.get(indoor ? "sfx/footsteps_wet_loop" : "sfx/footsteps_hard_loop") ?? null;
  fade(off, 0, 0.08);
  fade(on, Math.min(1, speed01) * (indoor ? 0.3 : 0.35), 0.08);
  if (on) on.src.playbackRate.setTargetAtTime(rate * (0.75 + 0.5 * speed01), e.ac.currentTime, 0.1);
}

/** The club crowd's loops: "party" (the cheer under the music), "panic" (the stampede, fading out over
 *  ~6 s), "off". */
export function setCrowd(state: "party" | "panic" | "off"): void {
  const e = live();
  if (!e || state === crowdState) return;
  const cheer = loop(e, "sfx/crowd_cheer_loop", bus(e), "world");
  const panic = loop(e, "sfx/crowd_panic_loop", bus(e), "world");
  if (state === "panic" && crowdState !== "panic") {
    fade(cheer, 0, 0.08);
    if (panic) {
      const t = e.ac.currentTime;
      panic.gain.gain.cancelScheduledValues(t);
      panic.gain.gain.setTargetAtTime(0.5, t, 0.05);
      panic.gain.gain.setTargetAtTime(0, t + 1.5, 1.6); // gone within ~6 s
    }
  } else if (state === "party") {
    fade(cheer, 0.3, 0.6);
    fade(panic, 0, 0.3);
  } else if (state === "off") {
    fade(cheer, 0, 0.3);
    fade(panic, 0, 0.3);
  }
  crowdState = state;
}
let crowdState: "party" | "panic" | "off" | "" = "";

/** The back rooms' air: fluorescent hum and HVAC (0..1; the club's kick comes through the wall with
 *  setClubBass). */
export function setRoomTone(level: number): void {
  const e = live();
  if (e) fade(loop(e, "sfx/office_room_tone_loop", bus(e), "world"), level * 0.5, 0.6);
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

/** calm: the room's calm loop (the rave: the club track at full level); fight: the fight loop;
 *  clear: after the room is cleared (the rave: the club track back at 35 %, low-passed: "still playing"). */
export type MusicCue = "calm" | "fight" | "clear" | null;
let cue: MusicCue = null;
let cueRoom = "street";

type MusicSet = { calm: string; fight: string; calmGain: number; fightGain: number; clear?: { gain: number; lowpass: number }; hardCut?: boolean };
const MUSIC: Record<string, MusicSet> = {
  street: { calm: "music/street_calm", fight: "music/fight_tense", calmGain: 0.9, fightGain: 0.95 },
  // the club's own track is diegetic: the first shot cuts it dead (the record scratch) and the fight comes in
  rave: { calm: "music/rave_club", fight: "music/fight_rave", calmGain: 0.9, fightGain: 0.9, clear: { gain: 0.35, lowpass: 900 }, hardCut: true },
  backrooms: { calm: "music/backrooms_calm", fight: "music/fight_tense", calmGain: 0.85, fightGain: 0.95 },
};

/** Music per room (`room` = the level's room.music): the calm loop, the fight loop, or silence; crossfades. */
export function setMusic(c: MusicCue, room = cueRoom): void {
  const e = live();
  const set = MUSIC[room] ?? MUSIC.street;
  if (!e || (c === cue && room === cueRoom)) return;
  // another room's music out
  if (room !== cueRoom) for (const [k, o] of Object.entries(MUSIC)) if (k !== room) for (const key of [o.calm, o.fight]) if (key !== set.calm && key !== set.fight) fade(loops.get(key) ?? null, 0, 0.8);
  let calm = loops.get(set.calm) ?? null;
  if (!calm) {
    const f = e.ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 20000;
    calm = loop(e, set.calm, e.musicIn, "music", f);
  }
  const fight = loop(e, set.fight, e.musicIn, "music");
  if (!calm && !fight) return;
  const prev = cue;
  cue = c;
  cueRoom = room;
  const clearing = c === "clear" && !!set.clear;
  const calmGain = c === "calm" ? set.calmGain : clearing ? set.clear!.gain : c === "clear" ? set.calmGain : 0;
  const cut = set.hardCut && c === "fight" && prev === "calm";
  fade(calm, calmGain, cut ? 0.03 : c === "calm" || c === "clear" ? 1.2 : 0.6);
  fade(fight, c === "fight" ? set.fightGain : 0, c === "fight" ? (cut ? 0.1 : 0.35) : 1.2);
  calm?.filter?.frequency.setTargetAtTime(clearing ? set.clear!.lowpass : 20000, e.ac.currentTime, 0.4);
}

/** Everything in the room goes quiet (title / results). Music keeps its cue unless `music`. */
export function stopRoomAudio(music = false): void {
  for (const k of ["sfx/rain_loop", "sfx/club_bass_loop", "sfx/footsteps_wet_loop", "sfx/footsteps_hard_loop", "sfx/heartbeat_loop", "sfx/neon_buzz", "sfx/crowd_cheer_loop", "sfx/crowd_panic_loop", "sfx/office_room_tone_loop"]) fade(loops.get(k) ?? null, 0, 0.3);
  crowdState = "";
  if (music) setMusic(null);
}

// ---- voices ---------------------------------------------------------------------------------------

export type GoonVoice = "goon_a" | "goon_b";
export type BarkKind = "alert" | "spotted" | "cover" | "reload" | "hit" | "charge";
const BARKS: Record<BarkKind, string[]> = {
  alert: ["alert_1", "alert_2"], spotted: ["spotted_1"], cover: ["cover_1", "cover_2"], reload: ["reload_1"], hit: ["hit_1", "hit_2"], charge: ["charge_1"],
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

export type RadbroLine = "hurt_1" | "hurt_2" | "dodge_land" | "bt_breath" | "heal" | "low_hp" | "death" | "breach";

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
 * in seconds (0 when silent or not loaded). A new line cuts the previous one. `speaker` = another
 * voice folder for a cutscene line (the bouncer's, goon_b).
 */
export function narrate(line: string, speaker = "narrator"): number {
  const e = voiceOn();
  if (!e) return 0;
  try { narrating?.stop(); } catch { /* already ended */ }
  const src = play(e, `voices/${speaker}/${line}`, { gain: 1, rate: 1, dest: e.voiceGain });
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

// ---- round 2 voices -------------------------------------------------------------------------------

export type HeavyLine = "alert_1" | "spotted_1" | "spotted_2" | "advance_1" | "taunt_1" | "reload_1" | "hit_1" | "hit_2" | "stagger_1" | "death_1";

/** A heavy's line in the world (positional, pitched with bullet time like the gang). Returns its length. */
export function heavyBark(line: HeavyLine, dist: number, pan: number): number {
  const e = voiceOn();
  if (!e) return 0;
  // bullet time slows him only a little: his register stays well clear of the narrator's
  const r = Math.max(0.9, rate);
  const src = play(e, `voices/heavy/${line}`, { gain: 1.0 * att(dist * 0.6), pan: pan * 0.85, dest: vbus(e), rate: r });
  return src ? (src.buffer?.duration ?? 0) / r : 0;
}

/** The DJ on the PA (the filter is baked in): not positional (the room's speakers), not pitched. */
export function pa(line: "pa_1" | "pa_2" | "pa_3"): number {
  const e = voiceOn();
  if (!e) return 0;
  const src = play(e, `voices/pa/${line}`, { gain: 0.9, rate: 1, dest: e.voiceGain });
  return src ? (src.buffer?.duration ?? 0) : 0;
}

let crowdVoices = 0;
/** A civilian's squeal on the crowd bus (under the barks, at most 2 at once). */
export function crowdVoice(line: string, dist: number, pan: number, pitch = 1): boolean {
  const e = voiceOn();
  if (!e || crowdVoices >= 2) return false;
  const src = play(e, `voices/crowd/${line}`, { gain: 0.6 * att(dist * 0.8), pan: pan * 0.8, dest: vbus(e), rate: rate * pitch });
  if (!src) return false;
  crowdVoices++;
  src.onended = () => { crowdVoices = Math.max(0, crowdVoices - 1); };
  return true;
}
