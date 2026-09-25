// Procedural SFX on the shared engine (no files yet; generated sounds replace these later by name).
// Everything pitches with the time scale: new one-shots play at rate 0.55 + 0.45 x timeScale and the
// whole mix goes through a low-pass that closes in bullet time. A heartbeat loops while bullet time is
// on; the club's bass thumps through the wall, louder near the door.
import { engine, live, sfxOn, whenCreated, type Engine } from "./engine.ts";

let rate = 1;
let slow: { filter: BiquadFilterNode; out: GainNode } | null = null;
let heart: { gain: GainNode; timer: number } | null = null;
let club: { gain: GainNode; filter: BiquadFilterNode; timer: number; next: number } | null = null;

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

/** Called every frame by the driver with the sim's time scale. */
export function setTimeScaleAudio(ts: number): void {
  rate = 0.55 + 0.45 * ts;
  const e = live();
  if (!e || !slow) return;
  const f = ts >= 0.99 ? 18000 : 900 + 9000 * ts * ts;
  slow.filter.frequency.setTargetAtTime(f, e.ac.currentTime, 0.05);
  // the music goes muffled too
  e.musicFilter.frequency.setTargetAtTime(ts >= 0.99 ? 16000 : 700 + 6000 * ts, e.ac.currentTime, 0.08);
}

function noiseBurst(e: Engine, t: number, dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = "bandpass", sweepTo?: number): void {
  const src = e.ac.createBufferSource();
  src.buffer = e.noise;
  src.playbackRate.value = rate;
  src.loopStart = Math.random();
  const f = e.ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq * rate, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo * rate), t + dur / rate);
  f.Q.value = q;
  const g = e.ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur / rate);
  src.connect(f).connect(g).connect(bus(e));
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur / rate + 0.05);
}

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
const att = (d: number) => Math.max(0.08, Math.min(1, 6 / Math.max(6, d)));

export const sfx = {
  shot(player: boolean, dist = 0): void {
    const e = sfxOn();
    if (!e) return;
    const t = e.ac.currentTime;
    const a = player ? 1 : 0.7 * att(dist);
    noiseBurst(e, t, 0.16, player ? 1800 : 1300, 0.7, 0.9 * a);
    noiseBurst(e, t, 0.35, 420, 0.5, 0.35 * a, "lowpass", 90);
    tone(e, t, 0.12, player ? 150 : 120, 45, 0.7 * a);
  },
  impact(surface: string, dist = 0): void {
    const e = sfxOn();
    if (!e) return;
    const t = e.ac.currentTime;
    const a = 0.5 * att(dist);
    if (surface === "metal") { tone(e, t, 0.18, 2400 + Math.random() * 800, 1400, 0.12 * a, "triangle"); noiseBurst(e, t, 0.05, 5000, 1, 0.3 * a); }
    else noiseBurst(e, t, 0.07, 2600, 0.9, 0.45 * a);
  },
  flesh(): void {
    const e = sfxOn();
    if (!e) return;
    const t = e.ac.currentTime;
    noiseBurst(e, t, 0.1, 600, 0.8, 0.5, "lowpass", 150);
    tone(e, t, 0.08, 90, 50, 0.4);
  },
  kill(headshot: boolean): void {
    const e = sfxOn();
    if (!e) return;
    const t = e.ac.currentTime;
    tone(e, t, 0.25, headshot ? 880 : 520, headshot ? 1320 : 390, 0.08, "triangle");
  },
  hurt(): void {
    const e = sfxOn();
    if (!e) return;
    const t = e.ac.currentTime;
    tone(e, t, 0.22, 70, 40, 0.8);
    noiseBurst(e, t, 0.12, 400, 0.6, 0.4, "lowpass");
  },
  reload(): void {
    const e = sfxOn();
    if (!e) return;
    const t = e.ac.currentTime;
    for (const [dt, f] of [[0, 3200], [0.22, 2400], [0.9, 2800], [1.1, 3600]] as const) noiseBurst(e, t + dt / rate, 0.04, f, 4, 0.35);
  },
  dry(): void {
    const e = sfxOn();
    if (e) noiseBurst(e, e.ac.currentTime, 0.03, 4200, 6, 0.3);
  },
  whoosh(up: boolean): void {
    const e = sfxOn();
    if (!e) return;
    const t = e.ac.currentTime;
    noiseBurst(e, t, 0.55, up ? 300 : 2400, 1.4, 0.35, "bandpass", up ? 2400 : 250);
    tone(e, t, 0.6, up ? 60 : 180, up ? 180 : 45, 0.25);
  },
  dodge(): void {
    const e = sfxOn();
    if (e) noiseBurst(e, e.ac.currentTime, 0.45, 800, 1, 0.3, "bandpass", 300);
  },
  land(): void {
    const e = sfxOn();
    if (!e) return;
    const t = e.ac.currentTime;
    tone(e, t, 0.2, 80, 40, 0.8);
    noiseBurst(e, t, 0.15, 300, 0.7, 0.5, "lowpass");
  },
  copium(): void {
    const e = sfxOn();
    if (!e) return;
    const t = e.ac.currentTime;
    for (let i = 0; i < 5; i++) noiseBurst(e, t + i * 0.045, 0.03, 5200 + i * 300, 5, 0.25);
    tone(e, t + 0.35, 0.18, 220, 140, 0.25, "sine");
  },
  pickup(): void {
    const e = sfxOn();
    if (!e) return;
    const t = e.ac.currentTime;
    tone(e, t, 0.12, 660, 990, 0.12, "triangle");
    tone(e, t + 0.08, 0.14, 990, 1320, 0.1, "triangle");
  },
  alert(): void {
    const e = sfxOn();
    if (e) tone(e, e.ac.currentTime, 0.18, 740, 1100, 0.05, "square");
  },
  clear(): void {
    const e = sfxOn();
    if (!e) return;
    const t = e.ac.currentTime;
    [392, 494, 587, 784].forEach((f, i) => tone(e, t + i * 0.09, 0.6, f, f, 0.08, "triangle"));
  },
};

/** Heartbeat loop while bullet time is on. */
export function setHeartbeat(on: boolean): void {
  const e = engine();
  if (!e) return;
  if (on && !heart) {
    const gain = e.ac.createGain();
    gain.gain.value = 0.9;
    gain.connect(e.sfxGain);
    const beat = () => {
      const x = live();
      if (!x) return;
      const t = x.ac.currentTime;
      tone(x, t, 0.14, 62, 40, 0.9, "sine", gain);
      tone(x, t + 0.22, 0.16, 55, 36, 0.7, "sine", gain);
    };
    beat();
    heart = { gain, timer: window.setInterval(beat, 820) };
  } else if (!on && heart) {
    clearInterval(heart.timer);
    const h = heart;
    heart = null;
    h.gain.gain.setTargetAtTime(0, e.ac.currentTime, 0.1);
    setTimeout(() => h.gain.disconnect(), 600);
  }
}

/**
 * The rave's bass through the wall: a 124 bpm kick + bass behind a low-pass. `near` 0..1 = how close
 * to the club door (louder and brighter); 0 stops it.
 */
export function setClubBass(near: number): void {
  whenCreated(e => {
    if (!club) {
      const filter = e.ac.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 160;
      const gain = e.ac.createGain();
      gain.gain.value = 0;
      filter.connect(gain).connect(e.musicIn);
      const beat = 60 / 124;
      const c = { gain, filter, timer: 0, next: e.ac.currentTime + 0.1 };
      c.timer = window.setInterval(() => {
        const x = live();
        if (!x) return;
        const now = x.ac.currentTime;
        if (c.next < now) c.next = now + 0.05;
        while (c.next < now + 0.3) {
          const t = c.next;
          const o = x.ac.createOscillator();
          o.frequency.setValueAtTime(110 * rate, t);
          o.frequency.exponentialRampToValueAtTime(42 * rate, t + 0.18 / rate);
          const g = x.ac.createGain();
          g.gain.setValueAtTime(1, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.35 / rate);
          o.connect(g).connect(filter);
          o.start(t);
          o.stop(t + 0.4 / rate);
          c.next += beat / rate;
        }
      }, 100);
      club = c;
    }
    const t = e.ac.currentTime;
    club.gain.gain.setTargetAtTime(near * 0.9, t, 0.2);
    club.filter.frequency.setTargetAtTime(120 + 260 * near, t, 0.2);
  });
}
