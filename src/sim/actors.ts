// Player and enemy state (plain data; the systems live in sim/player.ts, ai/goon.ts and sim/game.ts).
import { makeHitActor, type HitActor } from "../combat/trace.ts";
import { makeWeapon, type WeaponId, type WeaponState } from "../combat/weapons.ts";
import { PLAYER } from "./tuning.ts";

export type PlayerMode = "normal" | "dive" | "prone" | "getup" | "roll" | "dead";

export type Player = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  mode: PlayerMode;
  /** Real seconds in the current mode. */
  modeT: number;
  /** Dive / roll direction (unit, xz). */
  dirX: number;
  dirZ: number;
  /** Move key held when the dive landed (roll into a run). */
  rollOnLand: boolean;
  dodgeCooldown: number;
  yaw: number;
  pitch: number;
  /** Model facing (three.js rotation.y). */
  facing: number;
  health: number;
  copium: number;
  /** HP still to add from the current copium (over PLAYER.copiumTime). */
  healLeft: number;
  weapon: WeaponState;
  owned: WeaponId[];
  /** Smoothed shoulder-pivot height above the feet (the camera and the aim ray start there). */
  pivotUp: number;
  /** Planar speed this step (m/s, AI accuracy reads it). */
  speed: number;
  hit: HitActor;
  /** Last step's move input, world space (animation reads it). */
  moveWX: number;
  moveWZ: number;
};

export function makePlayer(x: number, y: number, z: number, facing: number): Player {
  const yaw = facing - Math.PI;
  return {
    x, y, z, vx: 0, vy: 0, vz: 0, grounded: true, mode: "normal", modeT: 0, dirX: 0, dirZ: 1, rollOnLand: false, dodgeCooldown: 0,
    yaw, pitch: 0, facing, health: PLAYER.maxHealth, copium: PLAYER.startCopium, healLeft: 0,
    weapon: makeWeapon("pistols"), owned: ["pistols"], pivotUp: 1.55, speed: 0,
    hit: makeHitActor("radbro", 0), moveWX: 0, moveWZ: 0,
  };
}

export type EnemyState = "inactive" | "idle" | "alert" | "move" | "cover" | "peek" | "engage" | "dead";

export type Enemy = {
  idx: number;
  id: string;
  kind: "goon";
  /** Pockit model number (seeded per spawn unless the marker names one). */
  milady: number;
  group: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
  hp: number;
  state: EnemyState;
  /** World seconds in the current state. */
  stateT: number;
  /** Reaction delay left (alert). */
  react: number;
  /** Timer for the current state's phase (cover wait / peek time). */
  timer: number;
  cover: number;
  lastCover: number;
  path: Array<{ x: number; z: number }>;
  pathI: number;
  peeks: number;
  peeksMax: number;
  burstLeft: number;
  fireT: number;
  flinch: number;
  /** Player seen in the last LOS check. */
  sees: boolean;
  lastSeenX: number;
  lastSeenZ: number;
  /** Lean now / target (-1..1). */
  lean: number;
  leanTarget: number;
  crouch: boolean;
  /** Seconds since death (world). */
  deadT: number;
  /** Final-kill cam: death waits for the replayed bullet. */
  deathHold: boolean;
  /** Direction the killing shot travelled (xz, unit; the body falls that way). */
  killDX: number;
  killDZ: number;
  headshot: boolean;
  strafe: number;
  hit: HitActor;
  patrol: number[];
  shots: number;
  /** Perched (fire escape / balcony, marker data {perch: true}): holds position, never paths to cover. */
  perch: boolean;
};

export function makeEnemy(idx: number, id: string, x: number, y: number, z: number, facing: number, hp: number, milady: number, group: string): Enemy {
  return {
    idx, id, kind: "goon", milady, group, x, y, z, vx: 0, vz: 0, facing, hp, state: group ? "inactive" : "idle", stateT: 0, react: 0, timer: 0,
    cover: -1, lastCover: -1, path: [], pathI: 0, peeks: 0, peeksMax: 2, burstLeft: 0, fireT: 0, flinch: 0, sees: false, lastSeenX: x, lastSeenZ: z,
    lean: 0, leanTarget: 0, crouch: false, deadT: 0, deathHold: false, killDX: 0, killDZ: 1, headshot: false, strafe: 1, hit: makeHitActor("milady", 1), patrol: [], shots: 0,
    perch: false,
  };
}
