// Hit confirms: a crisp tick for a body hit, a cracked metal "tink" for a headshot, a meaty thump for a
// kill (deeper and longer for the last one of a wave). Built from WebAudio (filtered noise from the
// engine's shared buffer, short pitched sines) layered with trimmed, filtered slices of the impact files
// already shipped (impact_metal, impact_body, the bullet-time boom). Centre-panned (they are his
// confirmation, not a world sound), on their own little bus into the SFX volume, so the sliders and mute
// apply. Mixed to sit on top of the guns in the 2-5 kHz band without being harsh (short, band-limited,
// no energy above ~9 kHz); in bullet time they drop a little in pitch (hitRate) and lose some top.
// Each kind has a small variant pool (pitch sets, never the same twice running) plus a few cents of jitter;
// rapid body hits climb in pitch with the marker's stack.
import { sfxOn, type Engine } from "./engine.ts";
import { sampleBuffer } from "./sfx.ts";
import { centsRate, hitRate, pickVariant, stackRate, type Hit } from "../app/hitfeel.ts";

/** Loudness of each confirm (the pistols' dry shot is 0.85 on the gun bus). */
export const HIT_MIX = { body: 0.34, head: 0.46, kill: 0.58, final: 0.7 };
/** Pitch sets per kind (the variants). */
const BODY_SET = [1, 1.07, 0.94, 1.13];
const HEAD_SET = [1, 1.05, 0.96];
const KILL_SET = [1, 0.94, 1.06];

let bus: { in: GainNode; lp: BiquadFilterNode } | null = null;
const last = { body: -1, head: -1, kill: -1, at: { body: 0, head: 0, kill: 0 } as Record<string, number> };

function hitBus(e: Engine): { in: GainNode; lp: BiquadFilterNode } {
  if (!bus || bus.in.context !== e.ac) {
    const g = e.ac.createGain();
    const lp = e.ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 12000;
    lp.Q.value = 0.5;
    g.connect(lp).connect(e.sfxGain);
    bus = { in: g, lp };
  }
  return bus;
}

/** A burst of the shared noise through a filter, `dur` s with a 1 ms attack. */
function noise(e: Engine, dest: AudioNode, t: number, dur: number, type: BiquadFilterType, f: number, q: number, gain: number): void {
  const src = e.ac.createBufferSource();
  src.buffer = e.noise;
  const flt = e.ac.createBiquadFilter();
  flt.type = type;
  flt.frequency.value = Math.min(16000, f);
  flt.Q.value = q;
  const g = e.ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  src.connect(flt).connect(g).connect(dest);
  src.start(t, Math.random() * 1.5, dur + 0.02);
}

/** A sine / triangle blip gliding f0 -> f1 over `dur`. */
function ping(e: Engine, dest: AudioNode, t: number, dur: number, f0: number, f1: number, gain: number, type: OscillatorType = "sine"): void {
  const o = e.ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = e.ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.03);
}

/** A trimmed, filtered slice of a shipped file (nothing if it is not loaded yet). */
function slice(e: Engine, dest: AudioNode, key: string, t: number, o: { rate: number; gain: number; dur: number; hp?: number; lp?: number; from?: number }): void {
  const buf = sampleBuffer(key);
  if (!buf) return;
  const src = e.ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = o.rate;
  let node: AudioNode = src;
  if (o.hp) { const f = e.ac.createBiquadFilter(); f.type = "highpass"; f.frequency.value = o.hp; node = node.connect(f); }
  if (o.lp) { const f = e.ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.lp; node = node.connect(f); }
  const g = e.ac.createGain();
  g.gain.setValueAtTime(o.gain, t);
  g.gain.setValueAtTime(o.gain, t + o.dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0005, t + o.dur);
  node.connect(g).connect(dest);
  const from = Math.min(o.from ?? 0, Math.max(0, buf.duration - 0.05));
  src.start(t, from, (o.dur + 0.02) * o.rate);
}

function body(e: Engine, d: AudioNode, t: number, r: number, k: number): void {
  noise(e, d, t, 0.016, "bandpass", 3900 * r, 1.3, 0.55 * k);
  ping(e, d, t, 0.04, 2350 * r, 1650 * r, 0.16 * k, "triangle");
  slice(e, d, "sfx/impact_metal_2", t, { rate: 1.25 * r, gain: 0.22 * k, dur: 0.05, hp: 2400, lp: 8000 });
}

function tink(e: Engine, d: AudioNode, t: number, r: number, k: number): void {
  noise(e, d, t, 0.011, "highpass", 4800 * r, 0.7, 0.45 * k);
  ping(e, d, t, 0.2, 3150 * r, 3090 * r, 0.13 * k);
  ping(e, d, t, 0.13, 4630 * r, 4560 * r, 0.075 * k);
  ping(e, d, t, 0.09, 1580 * r, 1400 * r, 0.07 * k, "triangle");
  slice(e, d, "sfx/impact_metal", t, { rate: 1.45 * r, gain: 0.3 * k, dur: 0.12, hp: 1800, lp: 8500 });
}

function thump(e: Engine, d: AudioNode, t: number, r: number, k: number, big: boolean): void {
  const dur = big ? 0.42 : 0.24;
  ping(e, d, t, dur, (big ? 120 : 145) * r, (big ? 36 : 48) * r, (big ? 0.75 : 0.6) * k);
  noise(e, d, t, 0.012, "bandpass", 2300 * r, 1.1, 0.4 * k);
  noise(e, d, t, 0.07, "lowpass", 700 * r, 0.8, 0.35 * k);
  const meat = sampleBuffer("sfx/impact_body_heavy") ? "sfx/impact_body_heavy" : "sfx/impact_body";
  slice(e, d, meat, t, { rate: 0.85 * r, gain: 0.55 * k, dur: big ? 0.35 : 0.24, lp: 1500 });
  if (big) slice(e, d, "sfx/pistol_bt_boom", t + 0.01, { rate: 0.9 * r, gain: 0.35 * k, dur: 0.5, lp: 650 });
}

/**
 * Play the confirm for one hit. `level`: the marker's stack after it (0..1); `timeScale`: the world's
 * (bullet time pitches them down a little); `k`: the setting's strength (0 = silent).
 */
export function hitSound(h: Pick<Hit, "kind" | "headshot" | "waveEnd" | "final">, level: number, timeScale: number, k: number): void {
  if (k <= 0) return;
  const e = sfxOn();
  if (!e) return;
  const now = e.ac.currentTime;
  // a burst of body hits faster than the ear splits them (a blast's stragglers) plays once
  const kind = h.kind;
  if (kind !== "kill" && now - last.at[kind] < (kind === "body" ? 0.04 : 0.05)) return;
  last.at[kind] = now;
  const b = hitBus(e);
  b.lp.frequency.setTargetAtTime(timeScale >= 0.99 ? 12000 : 6000 + 6000 * timeScale, now, 0.03);
  const jitter = centsRate((Math.random() - 0.5) * 50);
  const base = hitRate(timeScale) * jitter;
  const t = now + 0.004;
  const d = b.in;
  if (kind === "body") {
    last.body = pickVariant(BODY_SET.length, last.body, Math.random());
    body(e, d, t, base * BODY_SET[last.body] * stackRate(level), HIT_MIX.body * k);
  } else if (kind === "head") {
    last.head = pickVariant(HEAD_SET.length, last.head, Math.random());
    const r = base * HEAD_SET[last.head];
    body(e, d, t, r, HIT_MIX.body * 0.6 * k);
    tink(e, d, t, r, HIT_MIX.head * k);
  } else {
    last.kill = pickVariant(KILL_SET.length, last.kill, Math.random());
    const r = base * KILL_SET[last.kill];
    const big = h.waveEnd || h.final;
    thump(e, d, t, r, (big ? HIT_MIX.final : HIT_MIX.kill) * k, big);
    body(e, d, t, r * 0.9, HIT_MIX.body * 0.7 * k);
    if (h.headshot) tink(e, d, t + 0.006, r, HIT_MIX.head * 0.85 * k);
  }
}
