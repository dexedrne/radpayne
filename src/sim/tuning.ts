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

/** A heavy is a rival Radbro this much bigger than the player's (model + hit skeleton). */
export const HEAVY_SCALE = 1.12;

/** Enemy kinds (spec section 5, round-2 plan section 4). */
export type EnemyTuning = {
  hp: number; radius: number; walk: number; run: number; fireInterval: number; burst: number; damage: number; sight: number; idleSight: number; fov: number;
  /** Pellets per shot and the cone (radians) for the heavy's shotgun; 1 / 0 for the others. */
  pellets: number; spread: number;
  /** Muzzle height when standing (m above the feet). */
  muzzleUp: number;
};
export const ENEMY: Record<"goon" | "rusher" | "heavy", EnemyTuning> = {
  // idleSight: how far an idle goon (chatting in the rain, before the alert trigger) notices the player
  goon: { hp: 60, radius: 0.35, walk: 2.2, run: 4.2, fireInterval: 0.42, burst: 3, damage: 9, sight: 34, idleSight: 18, fov: 0.35, pellets: 1, spread: 0, muzzleUp: 1.35 },
  // SMG in the right hand: charges to 5-9 m, then strafes and fires bursts of 6
  rusher: { hp: 50, radius: 0.35, walk: 2.6, run: 4.6, fireInterval: 0.1, burst: 6, damage: 4, sight: 30, idleSight: 16, fov: 0.35, pellets: 1, spread: 0, muzzleUp: 1.35 },
  // pump shotgun: 8 pellets x 3.5, full damage within 6 m, 30 % at 16 m
  heavy: { hp: 140, radius: 0.45, walk: 1.5, run: 2.2, fireInterval: 1.1, burst: 1, damage: 3.5, sight: 26, idleSight: 14, fov: 0.35, pellets: 8, spread: (3 * Math.PI) / 180, muzzleUp: 1.4 * HEAVY_SCALE },
};

/** Rusher behaviour (world seconds / metres). */
export const RUSHER = {
  /** She stops charging somewhere in this band (seeded per rusher). */
  engage: [5, 9] as const,
  /** Strafe direction flips every this many seconds. */
  strafeEvery: 1.2,
  /** Pause between bursts (world seconds). */
  burstPause: [0.9, 1.5] as const,
  /** Below this HP she takes cover once. */
  coverBelow: 25,
  /** Repath the charge this often. */
  repath: 0.5,
} as const;

/** Heavy behaviour (world seconds / metres). */
export const HEAVY = {
  /** Fires whenever he is this close with a line of sight. */
  range: 12,
  /** The laser-sight tell before each shot. */
  tell: 0.35,
  /** A single hit of at least this much damage staggers him for `stagger` s (it cancels a shot). */
  staggerAt: 40,
  stagger: 0.6,
  /** Stops walking in when this close. */
  holdAt: 4.5,
  /** Shells before a reload, and the reload time. */
  shells: 6,
  reload: 1.6,
  /** Pellet damage falloff: full within near, x far.k at far and beyond. */
  near: 6,
  far: 16,
  farK: 0.3,
  repath: 0.6,
} as const;

/** Room 3's breach door (round-2 plan section 3): a shootdodge through the locked office door. */
export const BREACH = {
  /** World speed for `real` seconds of real time after the door gives (no meter cost). */
  slowScale: 0.2,
  slowReal: 1.0,
  /** The office wakes this much later than a normal alert: the reward for going in fast. */
  react: 0.5,
  /** Real seconds in front of the door without a dive before the heavy inside kicks it open. */
  kickAfter: 25,
} as const;

/** A checkpoint restores at least this much health (the fight after it starts fair). */
export const CHECKPOINT_MIN_HEALTH = 60;

/** The rave crowd (not part of the fight: never hit, never in the trace, never blocks the player). */
export const CROWD = {
  /** Flee speed (m/s): the flee clips' planted-foot speed on a Pockit, so the feet do not skate. */
  flee: 3.0,
  /** Startle delay after the first shot: up to this many seconds, later the farther she is. */
  startle: 0.6,
  /** Startle clip length before she runs (world s). */
  startleTime: 0.5,
  /** Within this distance of her exit she fades out behind the door (s). */
  exitRadius: 0.8,
  fade: 0.3,
  /** Minimum spacing when the dancers are placed. */
  spacing: 0.85,
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
