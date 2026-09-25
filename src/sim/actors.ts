// Player and enemy state (plain data; the systems live in sim/player.ts, ai/goon.ts and sim/game.ts).
import { makeHitActor, type HitActor } from "../combat/trace.ts";
import { makeWeapon, type WeaponId, type WeaponState } from "../combat/weapons.ts";
import { HEAVY_SCALE, PLAYER } from "./tuning.ts";

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
  /** The weapon in the hands (the same object as arsenal[weapon.id]). */
  weapon: WeaponState;
  owned: WeaponId[];
  /** One state per owned weapon: ammo and magazines survive a switch. */
  arsenal: Partial<Record<WeaponId, WeaponState>>;
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
  const pistols = makeWeapon("pistols");
  return {
    x, y, z, vx: 0, vy: 0, vz: 0, grounded: true, mode: "normal", modeT: 0, dirX: 0, dirZ: 1, rollOnLand: false, dodgeCooldown: 0,
    yaw, pitch: 0, facing, health: PLAYER.maxHealth, copium: PLAYER.startCopium, healLeft: 0,
    weapon: pistols, owned: ["pistols"], arsenal: { pistols }, pivotUp: 1.55, speed: 0,
    hit: makeHitActor("radbro", 0), moveWX: 0, moveWZ: 0,
  };
}

// rush: a rusher's charge straight at the player; advance: a heavy's slow walk toward him
export type EnemyState = "inactive" | "idle" | "alert" | "move" | "cover" | "peek" | "engage" | "rush" | "advance" | "dead";

/** goon: pistol, cover and peek (room 1). rusher: SMG, charges and strafes, cover once when hurt.
 *  heavy: a rival Radbro with a pump shotgun, slow advance, a laser-sight tell, staggers, no cover. */
export type EnemyKind = "goon" | "rusher" | "heavy";
export type EnemyWeapon = "pistol" | "smg" | "shotgun";
export const KIND_WEAPON: Record<EnemyKind, EnemyWeapon> = { goon: "pistol", rusher: "smg", heavy: "shotgun" };

export type Enemy = {
  idx: number;
  id: string;
  kind: EnemyKind;
  weapon: EnemyWeapon;
  /** Pockit model number (seeded per spawn unless the marker names one); heavies: 0. */
  milady: number;
  /** Heavies: the rival Radbro model ("rival652" | "rival723"). */
  model: string;
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
  /** World time of the last shot (the shooter slots, see DIFFICULTY.shooters). */
  lastShotT: number;
  /** Perched (fire escape / balcony, marker data {perch: true}): holds position, never paths to cover. */
  perch: boolean;
  /** Heavy: world seconds left of the laser-sight tell before the shot (0 = not aiming). */
  tell: number;
  /** Heavy: world seconds left of a stagger (a big hit; no moving, no shooting). */
  stagger: number;
  /** Heavy: shells before the next reload; seconds of reload left. */
  shells: number;
  reloadT: number;
  /** Rusher: took her one trip to cover (below half health). */
  coverUsed: boolean;
  /** Rusher: the distance she stops her charge at (5-9 m, seeded). */
  engageAt: number;
  /** Seconds until the next repath while charging / advancing. */
  repath: number;
  /** Item dropped at the body on death ("" = none). */
  drop: string;
  /** Behind a closed door (marker data {deaf: true}): gunshots and a friend's shout do not wake her; she
   *  still sees, feels a hit and answers a trigger (the back rooms' storage and security office). */
  deaf: boolean;
  /** Heavy with marker data {hold: true}: holds his spot (the manager behind his desk) and fires from it. */
  hold: boolean;
};

export function makeEnemy(idx: number, id: string, x: number, y: number, z: number, facing: number, hp: number, milady: number, group: string, kind: EnemyKind = "goon"): Enemy {
  const hit = makeHitActor(kind === "heavy" ? "radbro" : "milady", 1);
  if (kind === "heavy") hit.pose.scale = HEAVY_SCALE;
  return {
    idx, id, kind, weapon: KIND_WEAPON[kind], milady, model: "", group, x, y, z, vx: 0, vz: 0, facing, hp, state: group ? "inactive" : "idle", stateT: 0, react: 0, timer: 0,
    cover: -1, lastCover: -1, path: [], pathI: 0, peeks: 0, peeksMax: 2, burstLeft: 0, fireT: 0, flinch: 0, sees: false, lastSeenX: x, lastSeenZ: z,
    lean: 0, leanTarget: 0, crouch: false, deadT: 0, deathHold: false, killDX: 0, killDZ: 1, headshot: false, strafe: 1, hit, patrol: [], shots: 0,
    lastShotT: -1e9, perch: false, tell: 0, stagger: 0, shells: 6, reloadT: 0, coverUsed: false, engageAt: 7, repath: 0, drop: "", deaf: false, hold: false,
  };
}
