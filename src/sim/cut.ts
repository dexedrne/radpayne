// RetardioPayne's one difficulty, "the harder cut" (difficulty id "retardio"): every number in which it
// differs from RadPayne's own tables, in one place. tuning.ts and tuning2.ts read them into their
// per-difficulty tables (DIFFICULTY.retardio, MADAME's, the Countess's), so the sim runs it like any
// other difficulty: deterministic for a level, seed and input log. RadPayne's four difficulties never
// read this file. Against RadPayne's Normal (its default):
// - they aim better (accuracy x1.25: Normal 1.1, Hard 1.3), hold their aim at range and on the run (far,
//   farFloor, speedK) and come to faster (reaction 0.38 s: Normal 0.45, Hard 0.35; wake 0.27 s);
// - they push harder: three shooting at once (Normal 2), more of them keep firing on his cover, two
//   flank, a frag after 5 s in one spot (Normal 6), a rusher sent round after 7.5 s (Normal 9);
// - he takes more (damage x1.3: Normal 1.15, Hard 1.6) and the gang has a little more health (x1.05);
// - bullet time refills slower: a kill gives x1 of the base +1.5 / +2.5 (Normal x1.2, Hard x1.3);
// - fewer cans: 65 % of the room's (by id; Normal 80 %, Hard 55 %), one to start;
// - more of the gang at Madame Pockit's doors: three of hers up at once (Normal two);
// - both bosses have more health than on Normal (Madame Pockit 2600, the Countess 2600; Normal 2300).
// (Eased a step on 2026-10-03 after the owner found it a little too hard: it sits between Normal and Hard.)
// Chapter 2's rooms are long, with a set piece on top, so, like RadPayne's Normal there, the cut eases off
// in them (`ch2`): frags, rushers and pinning fire a little less often, more of the cans, a checkpoint
// restores more, x1.2 damage; the snipers', the Countess's and the vault beams' tells sit between
// RadPayne's Normal and Hard. Since 2026-10-03 (the owner: "chapter 2 is way too hard, no cover, too many
// enemies") it plays Normal's rosters there (none of the girls a level marks for Hard; the Countess's
// lifts on Normal's two and two, at a quicker pace), with at most two shooting at once and Normal's cap
// on the gang standing (`arrive`: tuning2.ts ARRIVE); it stays a bit harder than RadPayne's Normal
// through its aim, reaction, damage, health, bullet time and the arrivals' shorter gap.
// It stays fair: the balance bots (tools/balance.ts --diffs retardio, tools/ch2bot.ts ... retardio)
// clear every room; the runs are in the README (RetardioPayne).
import type { DifficultyTuning } from "./tuning.ts";

export const CUT: {
  diff: DifficultyTuning;
  /** Madame Pockit (room 5): her health, her pace (her grenade and door timers x this), adds per door. */
  madame: { hp: number; pace: number; maxLive: number };
  /** Chapter 2's rooms take these over `diff` (tuning2.ts CH2_DIFF). */
  ch2: Partial<DifficultyTuning>;
  /** The Countess (room 10): her health, her lifts' first batch, the most standing a lift, their pace; her
   *  rifle's tell (phase 1-2, phase 3) and its damage. */
  countess: { hp: number; doorFirst: number; doorLive: number; doorPace: number; tell: number; tell3: number; damage: number };
  /** Chapter 2's arrivals (tuning2.ts ARRIVE): the most of the gang standing at once, the gap between two. */
  arrive: { maxUp: number; gap: number };
  /** Chapter 2's snipers (their laser's tell, the round's damage), the roof's searchlight (how fast it
   *  follows him, their aim while he stands in it), the vault's beams (tell, sweep, pace, damage). */
  sniper2: { tell: number; damage: number };
  roof: { track: number; accuracy: number };
  beam: { tell: number; dur: number; pace: number; damage: number };
} = {
  diff: {
    label: "Harder cut",
    damage: 1.3, reaction: 0.38, accuracy: 1.25,
    wake: 0.27, shooters: 3,
    far: 46, farFloor: 0.28, speedK: 0.3,
    hp: 1.05, boss: 1,
    copium: 1, keep: 0.65, startCopium: 1, heal: 30, checkpoint: 60,
    btDrain: 1.25, killRefill: 1,
    suppress: 0.7, flank: 2, grenade: 9, camp: 5, rush: 7.5,
  },
  madame: { hp: 2600, pace: 1.2, maxLive: 3 },
  ch2: { keep: 0.95, checkpoint: 70, grenade: 14, camp: 6.5, rush: 9, suppress: 0.5, damage: 1.2, shooters: 2 },
  arrive: { maxUp: 6, gap: 1.4 },
  countess: { hp: 2600, doorFirst: 2, doorLive: 2, doorPace: 1.15, tell: 0.95, tell3: 0.7, damage: 13 },
  sniper2: { tell: 1.1, damage: 16 },
  roof: { track: 3.5, accuracy: 1.25 },
  beam: { tell: 1.2, dur: 3.4, pace: 1.15, damage: 12 },
};
