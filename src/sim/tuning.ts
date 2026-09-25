// Every gameplay number in one place (spec sections 4-6). Times are seconds, distances metres.
// "real" = wall-clock seconds; "world" = simulation seconds (real x timeScale).

/** Fixed simulation step (real time). */
export const HZ = 120;
export const DT = 1 / HZ;
/** Frame delta cap and step cap per rendered frame (the stepper drops any backlog beyond it). */
export const MAX_FRAME_DELTA = 0.1;
export const MAX_STEPS_PER_FRAME = 12;

export const TIME = {
  /** World speed while bullet time is on (also during a shootdodge). */
  bulletTime: 0.3,
  /** Player movement / weapon clock while bullet time is on (aim stays real time). */
  playerInBulletTime: 0.5,
  /** Final-kill cam world speed. */
  killCam: 0.1,
  /** Ease between time scales (per real second, exponential). */
  ease: 10,
} as const;

export const METER = {
  /** Full bullet-time meter in real seconds. */
  max: 10,
  /** Meter at room start. */
  start: 10,
  killRefill: 1.5,
  headshotRefill: 2.5,
  /** Shootdodge cost when the meter has charge. */
  dodgeCost: 1,
  /** Minimum charge to switch bullet time on. */
  minToStart: 0.25,
} as const;

export const PLAYER = {
  radius: 0.35,
  height: 1.8,
  /** Run speed; the run cycle plays at about 1.6x here (see anim/gait.ts). */
  runSpeed: 5.0,
  /** Backpedal / strafe multipliers relative to aim. */
  backSpeed: 0.7,
  accel: 38,
  airAccel: 8,
  gravity: 22,
  jumpSpeed: 7.2,
  stepUp: 0.35,
  maxHealth: 100,
  maxCopium: 8,
  startCopium: 2,
  copiumHeal: 35,
  copiumTime: 1,
  pickupRadius: 1.1,
} as const;

export const DODGE = {
  /** Airborne time (real seconds). */
  airTime: 0.9,
  speed: 6.2,
  /** Launch speed up; gravity chosen so the arc lands after airTime on flat ground. */
  up: 3.2,
  /** Body height of the diving capsule. */
  height: 0.75,
  /** Get-up time from prone (real seconds). */
  getUp: 0.6,
  /** Roll from the landing straight into a run when a move key is held. */
  roll: 0.45,
  rollSpeed: 5,
  /** Lockout after a get-up before the next dodge. */
  cooldown: 0.2,
} as const;
export const DODGE_GRAVITY = (2 * DODGE.up) / DODGE.airTime;

/** Enemy kinds (spec section 5). Only the goon is built this round. */
export const ENEMY = {
  // idleSight: how far an idle goon (chatting in the rain, before the alert trigger) notices the player
  goon: { hp: 60, radius: 0.35, walk: 2.2, run: 4.2, fireInterval: 0.42, burst: 3, damage: 9, sight: 34, idleSight: 18, fov: 0.35 },
} as const;

export type Difficulty = "easy" | "normal" | "hard";
// wake: goons woken together (a trigger, a shout, a shot heard) come to one after another, this many
//   world seconds apart, so a gang never opens up as one volley.
// shooters: at most this many goons shooting at once (a burst only starts when a slot is free).
export const DIFFICULTY: Record<Difficulty, { damage: number; reaction: number; copium: number; accuracy: number; wake: number; shooters: number; label: string }> = {
  easy: { damage: 0.5, reaction: 0.9, copium: 2, accuracy: 0.8, wake: 0.9, shooters: 1, label: "Chill" },
  normal: { damage: 1, reaction: 0.6, copium: 1, accuracy: 1, wake: 0.6, shooters: 2, label: "Normal" },
  hard: { damage: 1.5, reaction: 0.4, copium: 0.5, accuracy: 1.15, wake: 0.35, shooters: 3, label: "Payne" },
};

export const AI = {
  /** Hearing range for the player's gunshots. */
  hearing: 26,
  /** Line-of-sight checks every N steps per enemy. */
  losEvery: 6,
  /** Seconds in cover before peeking (world time; random in range). */
  coverWait: [0.7, 1.6] as const,
  /** Seconds peeking (shooting) before ducking again. */
  peekTime: [1.2, 2.2] as const,
  /** Peeks before looking for another cover point. */
  peeksBeforeMove: [2, 3] as const,
  /** Flinch on a hit (world seconds). */
  flinch: 0.35,
  /** A goon counts as shooting (holds a slot) until this long after its last shot (world seconds). */
  shooterHold: 0.9,
  /** Base hit chance before falloffs. */
  baseHit: 0.5,
  /** Distance falloff: full chance under near, floor at far. */
  near: 6,
  far: 32,
  farFloor: 0.12,
  /** Player speed falloff: chance x (1 - k * speed / runSpeed), dodge counts as fast. */
  speedK: 0.55,
  dodgeMul: 0.3,
  /** A cover point must be at least this far from the player. */
  coverMinDist: 4,
  /** Arrive radius for waypoints / cover. */
  arrive: 0.35,
} as const;

export const KILLCAM = {
  /** Real seconds the final-kill cam lasts. */
  real: 1.2,
  /** Hold after the bullet lands (real seconds, inside `real`). */
  hold: 0.35,
} as const;

/** Projectiles in bullet time (spec section 4): world speed in m/s. */
export const PROJECTILE_SPEED = 60;
/** Hitscan / projectile maximum range. */
export const MAX_RANGE = 120;
