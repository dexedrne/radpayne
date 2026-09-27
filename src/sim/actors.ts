// Player and enemy state (plain data; the systems live in sim/player.ts, ai/goon.ts and sim/game.ts).
import { makeHitActor, type HitActor } from "../combat/trace.ts";
import { makeWeapon, type BaseWeapon, type WeaponId, type WeaponState } from "../combat/weapons.ts";
import { GUARD, HEAVY_SCALE, MADAME, PLAYER } from "./tuning.ts";

/** vault: over low cover (sim/cover.ts; scripted, real time like the dive). */
export type PlayerMode = "normal" | "dive" | "prone" | "getup" | "roll" | "vault" | "dead";

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
  /** Frag grenades in the pouch (at most GRENADE.carry); seconds (his clock) before the next throw. */
  grenades: number;
  throwT: number;
  /** The melee in progress: seconds left of it (his clock; 0 = none), whether its hit has resolved. */
  meleeT: number;
  meleeDone: boolean;
  /** Scoped (the sniper, right mouse held); `zoomBlock`: a swap / reload / dive dropped the scope and
   *  it stays down until the button is let go. */
  zoom: boolean;
  zoomBlock: boolean;
  /** 9 mm picked up before he owns the SMGs (the gang's pistols); it goes into their reserve on pickup. */
  banked: number;
  /** The last weapon used in each key's category (a key press goes back to it). */
  lastInSlot: Partial<Record<number, WeaponId>>;
  /** #4764's guard (sim/game.ts stepGuard): up; seconds up / down (his clock); the meter (0..GUARD.max);
   *  seconds of a break left; a perfect parry allowed on this raise (it was down long enough). */
  guard: boolean;
  guardT: number;
  guardIdle: number;
  guardMeter: number;
  guardBroken: number;
  /** Broken, and the meter not yet back to GUARD.minRaise. */
  guardLock: boolean;
  parryOk: boolean;
  /** The melee button: held last step; real seconds since its press (-1: not held). */
  guardHeld: boolean;
  guardPress: number;
  /** A shotgun blast's shove on his guard: seconds left and the push (m/s, xz). */
  shoveT: number;
  shoveX: number;
  shoveZ: number;
  /** Cover (sim/cover.ts): the segment he is in (-1 none), where along it he hides (u), how far he is
   *  popped out (0 hidden .. 1 up / out, his clock), the open edge he is at (-1 its start, +1 its end, 0
   *  none), real seconds he has pushed away from it. */
  cover: number;
  coverU: number;
  coverPop: number;
  coverEnd: number;
  coverAway: number;
  /** A dash to the marked cover: its segment (-1 none), the spot's u, seconds running. */
  dashSeg: number;
  dashU: number;
  dashT: number;
  /** The vault over low cover: from (x, y, z) to (x, y, z), the obstacle's top. */
  vault: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; top: number };
  /** The shoulder the pivot (and the camera) sits over: +1 right .. -1 left (eased; an open edge on his
   *  left in cover takes it left). */
  shoulder: number;
};

export function makePlayer(x: number, y: number, z: number, facing: number, base: BaseWeapon = "pistols"): Player {
  const yaw = facing - Math.PI;
  const gun = makeWeapon(base, true);
  return {
    x, y, z, vx: 0, vy: 0, vz: 0, grounded: true, mode: "normal", modeT: 0, dirX: 0, dirZ: 1, rollOnLand: false, dodgeCooldown: 0,
    yaw, pitch: 0, facing, health: PLAYER.maxHealth, copium: PLAYER.startCopium, healLeft: 0,
    weapon: gun, owned: [base], arsenal: { [base]: gun }, pivotUp: 1.55, speed: 0,
    hit: makeHitActor("radbro", 0), moveWX: 0, moveWZ: 0,
    grenades: 0, throwT: 0, meleeT: 0, meleeDone: true, zoom: false, zoomBlock: false, banked: 0, lastInSlot: {},
    guard: false, guardT: 0, guardIdle: 99, guardMeter: GUARD.max, guardBroken: 0, guardLock: false, parryOk: false, guardHeld: false, guardPress: -1, shoveT: 0, shoveX: 0, shoveZ: 0,
    cover: -1, coverU: 0, coverPop: 0, coverEnd: 0, coverAway: 0, dashSeg: -1, dashU: 0, dashT: 0,
    vault: { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, top: 0 }, shoulder: 1,
  };
}

// rush: a rusher's charge straight at the player; advance: a heavy's slow walk toward him
// flee: an add running for her door once Madame Pockit is down (round 3)
export type EnemyState = "inactive" | "idle" | "alert" | "move" | "cover" | "peek" | "engage" | "rush" | "advance" | "dead" | "flee";

/** goon: pistol, cover and peek (room 1). rusher: SMG, charges and strafes, cover once when hurt.
 *  heavy: a rival Radbro with a pump shotgun, slow advance, a laser-sight tell, staggers, no cover. */
/** madame: the penthouse boss (round 3, sim/boss.ts + ai/madame.ts): a Milady with dual SMGs. */
export type EnemyKind = "goon" | "rusher" | "heavy" | "madame";
/** The gang's guns; a marker's `weapon` overrides the kind's (a goon with the sniper rifle on a perch,
 *  a heavy with the hand cannon). */
export type EnemyWeapon = "pistol" | "smg" | "shotgun" | "sniper" | "handcannon";
export const KIND_WEAPON: Record<EnemyKind, EnemyWeapon> = { goon: "pistol", rusher: "smg", heavy: "shotgun", madame: "smg" };

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
  /** A melee strike's shove: world seconds left and the push (m/s, xz). */
  knockT: number;
  knockX: number;
  knockZ: number;
  /** Running from a grenade: world seconds of reaction left, then of running; the way out (unit xz). */
  fleeWait: number;
  fleeT: number;
  fleeX: number;
  fleeZ: number;
  /** Health at the start (the boss bar reads hp / maxHp). */
  maxHp: number;
  /** Gone from the fight without dying (round 3: an add who ran once the boss was down, or never came
   *  in): not counted alive. */
  fled: boolean;
};

export function makeEnemy(idx: number, id: string, x: number, y: number, z: number, facing: number, hp: number, milady: number, group: string, kind: EnemyKind = "goon"): Enemy {
  const hit = makeHitActor(kind === "heavy" ? "radbro" : "milady", 1);
  if (kind === "heavy") hit.pose.scale = HEAVY_SCALE;
  if (kind === "madame") hit.pose.scale = MADAME.scale;
  return {
    idx, id, kind, weapon: KIND_WEAPON[kind], milady, model: "", group, x, y, z, vx: 0, vz: 0, facing, hp, state: group ? "inactive" : "idle", stateT: 0, react: 0, timer: 0,
    cover: -1, lastCover: -1, path: [], pathI: 0, peeks: 0, peeksMax: 2, burstLeft: 0, fireT: 0, flinch: 0, sees: false, lastSeenX: x, lastSeenZ: z,
    lean: 0, leanTarget: 0, crouch: false, deadT: 0, deathHold: false, killDX: 0, killDZ: 1, headshot: false, strafe: 1, hit, patrol: [], shots: 0,
    lastShotT: -1e9, perch: false, tell: 0, stagger: 0, shells: 6, reloadT: 0, coverUsed: false, engageAt: 7, repath: 0, drop: "", deaf: false, hold: false,
    knockT: 0, knockX: 0, knockZ: 0, fleeWait: 0, fleeT: 0, fleeX: 0, fleeZ: 0,
    maxHp: hp, fled: false,
  };
}
