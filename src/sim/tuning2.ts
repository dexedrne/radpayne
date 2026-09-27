// Chapter 2's numbers (rooms 6-10: sim/stage.ts and sim/ch2/*, the Countess in ai/countess.ts), in one
// place like tuning.ts. Times are world seconds unless "real"; distances metres. Per-difficulty tables
// fall back to "normal" for a difficulty they do not name.
import type { Difficulty } from "./tuning.ts";

type PerDiff = Partial<Record<Difficulty | string, number>> & { normal: number };
export const perDiff = (t: PerDiff, d: Difficulty | string): number => t[d] ?? t.normal;

/** Room 6, the roof: the helicopter's searchlight, its rope drops. */
export const ROOF = {
  /** The light's circle on the roof; it patrols its path before the alert, then follows him (slower
   *  than his run: he can leave it). */
  radius: 3.2,
  patrol: 3.0,
  track: { easy: 2.6, normal: 3.3, hard: 3.9 } as PerDiff,
  /** Their aim while he stands in it (x their accuracy). */
  accuracy: { easy: 1.2, normal: 1.35, hard: 1.5 } as PerDiff,
  /** The lamp takes this much of his damage before it goes out (the helicopter leaves). */
  lampHp: 260,
  lampRadius: 0.7,
  /** The helicopter flies between its hover points at this speed. */
  fly: 7,
  /** The rope drop: from this high over the landing point, this fast; she waits this long once down. */
  ropeY: 8,
  ropeSpeed: 3.2,
  ropeWait: 0.35,
} as const;

/** Room 7, the sky garden: the glass floor over the pond. */
export const GARDEN = {
  /** From the crack (the tell) to the collapse. */
  tell: 2.6,
  /** A girl who goes down with it: the fall's damage and her daze. */
  fallDamage: 35,
  daze: 1.2,
  /** He takes this (x difficulty damage) when it goes from under him. */
  selfDamage: 12,
} as const;

/** Room 8, the airship: the cargo door blows. */
export const AIR = {
  /** The klaxon (the tell), then the wind for `dur`. */
  tell: 2.2,
  dur: 7,
  /** His drag toward the door (m/s; he runs at 5, so he can hold his ground), a girl's. */
  pull: 2.6,
  pullGang: 4.4,
  /** Closer than this to the opening, a girl is gone. */
  gone: 1.3,
} as const;

/** Room 9, the counting floor: the shutters, the blackout. */
export const COUNT = {
  /** The shutters' warning (their lights), then they are down. */
  tell: 1.6,
  /** The blackout's length, and their aim in it (they cannot see well either). */
  dark: 14,
  darkAccuracy: 0.7,
} as const;

/** Room 10, the vault: the Countess (Pockit #COUNTESS.pockit, a size up, a rifle with a white laser). */
export const COUNTESS = {
  hp: { easy: 1800, normal: 2400, hard: 3000 } as PerDiff,
  scale: 1.3,
  pockit: 1847,
  phase2: 0.66,
  phase3: 0.33,
  lastStand: 0.1,
  head: 2 / 3,
  flinch: 0.08,
  /** She says her piece (no damage), and each phase change gives her this long (no damage). */
  introHold: 2.4,
  shift: 1.2,
  /** Phase 1, on the counting desk: the rifle's laser tell, the gap between her shots. */
  tell: { easy: 1.25, normal: 1.0, hard: 0.8 } as PerDiff,
  every: [1.6, 2.4] as const,
  /** Phase 3: a quicker tell, and she runs. */
  tell3: { easy: 0.85, normal: 0.65, hard: 0.5 } as PerDiff,
  damage: 24,
  /** Her walk on the desk, her cover distance on the floor (phase 2), her charge distance (phase 3). */
  walk: 1.8,
  range: 14,
  engage: 9,
  /** Her last stand: world speed and its real length; her run for the vault door. */
  lastStandSlow: 0.25,
  lastStandReal: 2,
  lastStandRun: 5.2,
  /** The lift doors: the lamp before one opens, the first batch, then a pair every `every` while few stand. */
  doors: { lamp: 2, first: 4, pair: 2, every: 6, maxLive: 5 },
} as const;

/** Room 10's security lasers: a beam turns about the vault's column, high (dive under) or low (jump). */
export const BEAM = {
  /** The tell: the beam shows dim and still at its start for this long. */
  tell: { easy: 1.4, normal: 1.05, hard: 0.85 } as PerDiff,
  /** One sweep turns it this far in this long. */
  arc: Math.PI,
  dur: { easy: 3.8, normal: 3.2, hard: 2.8 } as PerDiff,
  /** Between sweeps (phase 2 / phase 3). */
  every: [7.5, 9.5] as const,
  every3: [5.0, 6.5] as const,
  /** Heights (above the vault floor): the high beam at the chest, the low one at the shins. */
  high: 1.25,
  low: 0.3,
  /** He is over the low beam with his feet this high, under the high one diving or prone. */
  clear: 0.4,
  damage: 16,
  /** The column's radius (no beam inside it). */
  column: 1.4,
} as const;
