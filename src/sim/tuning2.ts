// Chapter 2's numbers (rooms 6-10: sim/stage.ts and sim/ch2/*, the Countess in ai/countess.ts), in one
// place like tuning.ts. Times are world seconds unless "real"; distances metres. Per-difficulty tables
// fall back for a difficulty they do not name: Hardcore and RetardioPayne's harder cut to Hard, then
// everything to Normal.
import type { Difficulty, DifficultyTuning } from "./tuning.ts";
import { CUT } from "./cut.ts";

type PerDiff = Partial<Record<Difficulty | string, number>> & { normal: number };
export const perDiff = (t: PerDiff, d: Difficulty | string): number => t[d] ?? (d === "hardcore" || d === "retardio" ? t.hard : undefined) ?? t.normal;

/** Chapter 2 against DIFFICULTY (tuning.ts), per difficulty: its rooms are long (20-30 of the gang each,
 *  where chapter 1's streets had 8-11) and every one has a set piece on top, so Normal eases off here:
 *  their aim and damage are chapter 1's Normal, but their frags, suppressing fire and rushers come a
 *  little less often, every copium can is in the room and a checkpoint restores more (with the rooms'
 *  lighter Normal rosters and the snipers' longer tell). On the balance bots it costs about 1.1x
 *  chapter 1's health on Normal with no deaths (it was 1.5x before the ease, and 0.65x with their aim
 *  and damage at 1.0 and frags rarer still). Chill, Hard and Hardcore keep their own. */
export const CH2_DIFF: Partial<Record<Difficulty, Partial<DifficultyTuning>>> = {
  normal: { keep: 1, checkpoint: 70, grenade: 16, camp: 7, rush: 10, suppress: 0.45 },
  // RetardioPayne's harder cut eases off here too (cut.ts)
  retardio: CUT.ch2,
};

/** A room's difficulty table: chapter 2's rooms (room.chapter 2) take CH2_DIFF over DIFFICULTY. */
export function diffFor(base: DifficultyTuning, d: Difficulty, chapter: unknown): DifficultyTuning {
  const o = chapter === 2 ? CH2_DIFF[d] : undefined;
  return o ? { ...base, ...o } : base;
}

/** Chapter 2's snipers (a goon with the sniper rifle, not the Countess): her laser's tell (s) before the
 *  round and the round's damage (x difficulty damage), per difficulty; chapter 1's is ENEMY_ARMS.sniper.
 *  On Normal the tell is long enough to see it and step out of it. */
export const SNIPER2 = {
  tell: { easy: 1.3, normal: 1.25, hard: 0.8, retardio: CUT.sniper2.tell } as PerDiff,
  damage: { easy: 14, normal: 16, hard: 22, retardio: CUT.sniper2.damage } as PerDiff,
};

/** Kills an `afterKills` trigger waits for on this difficulty: a number, or per difficulty ({normal: 8,
 *  hard: 10}: a room that leaves some of the gang out on Normal counts its waves in on its own). */
export function killsFor(after: unknown, d: Difficulty): number | undefined {
  if (typeof after === "number") return after;
  if (after && typeof after === "object" && typeof (after as PerDiff).normal === "number") return perDiff(after as PerDiff, d);
  return undefined;
}

/** Room 6, the roof: the helicopter's searchlight, its rope drops. */
export const ROOF = {
  /** The light's circle on the roof; it patrols its path before the alert, then follows him (slower
   *  than his run: he can leave it). */
  radius: 3.2,
  patrol: 3.0,
  track: { easy: 2.6, normal: 3.3, hard: 3.9, retardio: CUT.roof.track } as PerDiff,
  /** Their aim while he stands in it (x their accuracy). */
  accuracy: { easy: 1.1, normal: 1.15, hard: 1.5, retardio: CUT.roof.accuracy } as PerDiff,
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
  hp: { easy: 1800, normal: 2300, hard: 2800, retardio: CUT.countess.hp } as PerDiff,
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
  tell: { easy: 1.25, normal: 1.0, hard: 0.8, retardio: CUT.countess.tell } as PerDiff,
  every: [1.6, 2.4] as const,
  /** Phase 3: a quicker tell, and she runs. */
  tell3: { easy: 0.9, normal: 0.8, hard: 0.5, retardio: CUT.countess.tell3 } as PerDiff,
  /** One round of hers: its damage (x difficulty) and its chance (x the usual falloffs: distance, his speed, a dive). */
  damage: { easy: 18, normal: 12, hard: 18, retardio: CUT.countess.damage } as PerDiff,
  hit: 0.62,
  /** During her tell she takes this much more, and this much damage in one tell breaks her aim (a stagger). */
  tellOpen: 1.5,
  breakAt: 70,
  stagger: 0.8,
  /** Her walk on the desk, her cover distance on the floor (phase 2), her charge distance (phase 3). */
  walk: 1.8,
  range: 14,
  engage: 9,
  /** Her last stand: world speed and its real length; her run for the vault door. */
  lastStandSlow: 0.25,
  lastStandReal: 2,
  lastStandRun: 5.2,
  /** The lift doors: the lamp before one opens, the first batch, then a pair every `every` while fewer
   *  than `maxLive` of that door's girls stand; per difficulty the batch, the pace (x every: Madame
   *  Pockit's) and the most standing at once (Normal: her two a door). */
  doors: { lamp: 2, first: 3, pair: 2, every: 7, maxLive: 4 },
  doorFirst: { easy: 2, normal: 2, hard: 3, retardio: CUT.countess.doorFirst } as PerDiff,
  doorPace: { easy: 1.5, normal: 1.3, hard: 1, hardcore: 0.9, retardio: CUT.countess.doorPace } as PerDiff,
  doorLive: { easy: 2, normal: 2, hard: 4, retardio: CUT.countess.doorLive } as PerDiff,
} as const;

/** Room 10's security lasers: a beam turns about the vault's column, high (dive under) or low (jump). */
export const BEAM = {
  /** The tell: the beam shows dim and still at its start for this long. */
  tell: { easy: 1.5, normal: 1.35, hard: 0.85, retardio: CUT.beam.tell } as PerDiff,
  /** One sweep turns it this far in this long. */
  arc: Math.PI,
  dur: { easy: 3.8, normal: 3.6, hard: 2.8, retardio: CUT.beam.dur } as PerDiff,
  /** Between sweeps (phase 2 / phase 3), x `pace` per difficulty. */
  every: [7.5, 9.5] as const,
  every3: [5.0, 6.5] as const,
  pace: { easy: 1.4, normal: 1.25, hard: 1, retardio: CUT.beam.pace } as PerDiff,
  /** Heights (above the vault floor): the high beam at the chest, the low one at the shins. */
  high: 1.25,
  low: 0.3,
  /** He is over the low beam with his feet this high, under the high one diving or prone. */
  clear: 0.4,
  damage: { easy: 10, normal: 10, hard: 16, retardio: CUT.beam.damage } as PerDiff,
  /** The column's radius (no beam inside it). */
  column: 1.4,
} as const;
