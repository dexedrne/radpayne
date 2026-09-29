// Chapter 2's weather, the parts with no scene in them (look/weather.ts): the roof's lightning is the same
// flash on any screen and in bullet time, and never runs away; the counting floor's blackout gives every
// light its own level back even when the look re-renders while it is dark.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BLACKOUT, LIGHTNING, blackoutIntensity, newStrike, stepLightning } from "../src/app/look/weather.ts";

/** A seeded stand-in for Math.random. */
function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

test("lightning: capped and gone within about a second of world time at any frame rate, in bullet time too", () => {
  for (const hz of [30, 60, 75, 120, 144, 240]) for (const ts of [1, 0.3, 0.1]) for (let seed = 1; seed <= 20; seed++) {
    const t = newStrike(), r = rng(seed * 7919 + hz);
    const d = Math.min(1 / hz, 0.1) * ts;
    let peak = 0, since = 0, longest = 0, strikes = 0;
    for (let i = 0; i < 120 / d && strikes < 6; i++) { // up to 120 s of world time or six strikes
      const age = t.age;
      const v = stepLightning(t, d, r);
      if (t.age < age) strikes++;
      peak = Math.max(peak, v);
      since = v > 0 ? since + d : 0;
      longest = Math.max(longest, since);
    }
    assert.ok(strikes >= 3, `${hz} Hz x${ts}: it strikes`);
    assert.ok(peak <= LIGHTNING.cap + 1e-9, `${hz} Hz x${ts} seed ${seed}: peak ${peak.toFixed(2)}`);
    // the flicker window, then the decay from the cap: 0.5 + 2.6 / 6 = 0.93 s at the very most
    assert.ok(longest <= LIGHTNING.window + LIGHTNING.cap / LIGHTNING.decay + 0.05, `${hz} Hz x${ts} seed ${seed}: lit ${longest.toFixed(2)} s`);
  }
});

test("lightning: the flicker is a chance per second, so a fast screen flickers as often as 60 Hz", () => {
  // how much light a strike gives (the area under the flash, world seconds x intensity), averaged over many strikes
  const area = (hz: number, ts: number) => {
    const r = rng(12345), d = (1 / hz) * ts;
    let sum = 0, n = 0;
    for (let k = 0; k < 400; k++) {
      const t = newStrike();
      t.next = d / 2; // strike on the first step
      stepLightning(t, d, r);
      let a = t.v * d;
      t.next = 1e9;
      while (t.v > 0) a += stepLightning(t, d, r) * d;
      sum += a; n++;
    }
    return sum / n;
  };
  const at60 = area(60, 1);
  for (const [hz, ts] of [[144, 1], [240, 1], [60, 0.3], [144, 0.3]] as const) {
    const a = area(hz, ts);
    assert.ok(Math.abs(a - at60) / at60 < 0.15, `${hz} Hz x${ts}: ${a.toFixed(3)} vs 60 Hz ${at60.toFixed(3)}`);
  }
});

test("blackout: a light keeps its own level though its userData is replaced while it is dark", () => {
  const bases = new WeakMap<object, number>();
  const lamp: { intensity: number; userData: Record<string, unknown> } = { intensity: 8, userData: { rpDim: true } };
  const fill: { intensity: number; userData: Record<string, unknown> } = { intensity: 1, userData: { rpFill: true } };
  const step = (k: number) => {
    lamp.intensity = blackoutIntensity(lamp, lamp.userData.rpDim === true, k, bases);
    fill.intensity = blackoutIntensity(fill, fill.userData.rpDim === true, k, bases);
  };
  step(0);
  assert.equal(lamp.intensity, 8);
  step(1);
  assert.ok(Math.abs(lamp.intensity - 8 * BLACKOUT.lamps) < 1e-9);
  assert.ok(Math.abs(fill.intensity - BLACKOUT.fill) < 1e-9);
  // the look re-renders in the dark (a graphics setting changed from the pause menu): new userData objects
  lamp.userData = { rpDim: true };
  fill.userData = { rpFill: true };
  step(1);
  step(0);
  assert.equal(lamp.intensity, 8, "the lamp comes back to its own level");
  assert.equal(fill.intensity, 1, "so does the fill");
});
