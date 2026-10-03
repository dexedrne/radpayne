// Chapter 2's set pieces (rooms 6-10), one per room, picked by the level's Data {room: {stage: {kind,
// ...}}}: the roof's searchlight and rope drops (ch2/roof.ts), the sky garden's glass floor
// (ch2/garden.ts), the airship's cargo door (ch2/airship.ts), the counting floor's shutters and blackout
// (ch2/counting.ts) and the vault, the Countess's room (ch2/vault.ts). Like room 4's ride and room 5's
// boss they step on world time after the enemies, are part of hash(), and ride in a checkpoint.
// The game asks the stage (every hook optional):
//   - intercept / hitTarget: a small target on his shot's line (the helicopter's lamp);
//   - damageMul / clampDamage: a boss's armour and her guaranteed last stand;
//   - accuracy: the gang's aim (in the searchlight they aim better, in the blackout worse);
//   - onKill: after any kill (the adds run when the boss falls; a girl shot off her rope drops);
//   - save / load: its state in a checkpoint;
//   - waySlots / wayReady / bring: a way in for the arrivals (sim/arrive.ts) that is the stage's own (the
//     roof's ropes from the helicopter).
// A set piece starts from a trigger marker with action "setpiece" and a `cue` (a volume he walks into,
// or `afterKills` / `whenClear`): the stage watches for it to have fired (cueFired).
import type { Enemy } from "./actors.ts";
import type { Game } from "./game.ts";
import type { Fnv1a } from "./math.ts";
import { Roof } from "./ch2/roof.ts";
import { Garden } from "./ch2/garden.ts";
import { Airship } from "./ch2/airship.ts";
import { Counting } from "./ch2/counting.ts";
import { Vault } from "./ch2/vault.ts";

export type StageTarget = { t: number; kind: string; id: number };

/** The boss bar's view of a stage boss (the Countess). */
export type StageBoss = { name: string; idx: number; phase: number; started: boolean; immune: boolean; notches: number[] };

/** The bot's help from the room (a jump or a dive to time, a point worth a shot). */
export type StageHint = { jump?: boolean; dodge?: boolean; aim?: { x: number; y: number; z: number } | null };

export interface Stage {
  readonly kind: string;
  step(g: Game, dt: number): void;
  hashInto(h: Fnv1a): void;
  intercept?(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): StageTarget | null;
  hitTarget?(g: Game, t: StageTarget, ox: number, oy: number, oz: number, damage: number): void;
  damageMul?(e: Enemy, part: number): number;
  clampDamage?(e: Enemy, amount: number): number;
  accuracy?(g: Game, e: Enemy): number;
  onKill?(g: Game, e: Enemy): void;
  save?(): number[];
  load?(g: Game, v: number[]): void;
  /** Chapter 2's arrivals: a way in of the stage's own (by name): its slots (null: not the stage's). */
  waySlots?(name: string): Array<[number, number, number]> | null;
  /** Whether it can bring one in by that way now ("wait": in a moment, it is getting ready; "no": not now). */
  wayReady?(g: Game, name: string): "ready" | "wait" | "no";
  /** Bring her in by it, at the slot. */
  bring?(g: Game, e: Enemy, name: string, slot: [number, number, number]): void;
  /** Presentation: a moment no special kill cam should take (the boss's entrance, a phase change). */
  busy?(g: Game): boolean;
  boss?(g: Game): StageBoss | null;
  botHint?(g: Game): StageHint | null;
}

export type StageSettings = { kind: string; [k: string]: unknown };

export function makeStage(g: Game): Stage | null {
  const s = g.level.room.stage;
  if (!s || typeof s !== "object") return null;
  const cfg = s as StageSettings;
  switch (cfg.kind) {
    case "roof": return new Roof(g, cfg);
    case "garden": return new Garden(g, cfg);
    case "airship": return new Airship(g, cfg);
    case "counting": return new Counting(g, cfg);
    case "vault": return new Vault(g, cfg);
    default: return null;
  }
}

/** Whether the setpiece trigger with this cue has fired. */
export function cueFired(g: Game, cue: string): boolean {
  return g.triggers.some(t => t.data.action === "setpiece" && t.data.cue === cue && t.fired);
}

/** A rectangle [x0, z0, x1, z1] (any corner order) holds (x, z). */
export function inRect(r: readonly number[], x: number, z: number): boolean {
  return x >= Math.min(r[0], r[2]) && x <= Math.max(r[0], r[2]) && z >= Math.min(r[1], r[3]) && z <= Math.max(r[1], r[3]);
}
