// The weather's numbers and steps with no scene in them (look/sky.tsx draws them; test/weather.test.ts
// checks them): the roof's lightning and the counting floor's blackout.

/** Lightning over the roof: a strike jumps the flash to `peak`, then it decays at `decay` a second of world
 *  time; for its first `window` seconds, while it is still bright (over `hot`), it flickers back up by
 *  `kick` about `flicker` times a second. Everything is per second of world time, so a 144 Hz screen and
 *  bullet time get the same flash as 60 Hz (a chance per frame used to pile the flickers up faster than
 *  the decay took them off), and it never goes past `cap`. */
export const LIGHTNING = { peak: 2.4, cap: 2.6, hot: 1.8, decay: 6, flicker: 6, kick: 0.8, window: 0.5, first: 6, gap: [7, 16] } as const;

export type Strike = { next: number; v: number; age: number };

export const newStrike = (): Strike => ({ next: LIGHTNING.first, v: 0, age: Infinity });

/** One step of `d` seconds of world time (the frame's dt, clamped, times the time scale). `rand` is
 *  Math.random in the look, a fixed sequence in the tests. Returns the flash's intensity. */
export function stepLightning(t: Strike, d: number, rand: () => number = Math.random): number {
  const L = LIGHTNING;
  t.next -= d;
  t.age += d;
  if (t.next <= 0) { t.v = L.peak; t.age = 0; t.next = L.gap[0] + rand() * (L.gap[1] - L.gap[0]); }
  const kick = t.age < L.window && t.v > L.hot && rand() < L.flicker * d ? L.kick : 0;
  t.v = Math.min(L.cap, Math.max(0, t.v - d * L.decay + kick));
  return t.v;
}

/** The counting floor's blackout: the lamps marked dim go to `lamps` of their light, the look's fill to
 *  `fill`, the camera key to `key`; it eases at `rate` a second, both ways. */
export const BLACKOUT = { lamps: 0.1, fill: 0.22, key: 0.55, rate: 7 } as const;

/** A light's intensity at blackout `k` (0 lit, 1 dark). Its own intensity is read once, the first time
 *  the blackout sees it, and kept in `bases`: not on the light's userData, which the scene library
 *  replaces whenever the look re-renders (a settings change while it is dark would read the dimmed
 *  intensity back as the base, and the room would stay dim once the lights came back). */
export function blackoutIntensity(l: { intensity: number }, dim: boolean, k: number, bases: WeakMap<object, number>): number {
  let b = bases.get(l);
  if (b === undefined) { b = l.intensity; bases.set(l, b); }
  const to = dim ? BLACKOUT.lamps : BLACKOUT.fill;
  return b * (1 + (to - 1) * k);
}
