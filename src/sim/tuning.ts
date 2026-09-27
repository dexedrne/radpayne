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
export const ENEMY: Record<"goon" | "rusher" | "heavy" | "madame", EnemyTuning> = {
  // idleSight: how far an idle goon (chatting in the rain, before the alert trigger) notices the player
  goon: { hp: 60, radius: 0.35, walk: 2.2, run: 4.2, fireInterval: 0.42, burst: 3, damage: 9, sight: 34, idleSight: 18, fov: 0.35, pellets: 1, spread: 0, muzzleUp: 1.35 },
  // SMG in the right hand: charges to 5-9 m, then strafes and fires bursts of 6
  rusher: { hp: 50, radius: 0.35, walk: 2.6, run: 4.6, fireInterval: 0.1, burst: 6, damage: 4, sight: 30, idleSight: 16, fov: 0.35, pellets: 1, spread: 0, muzzleUp: 1.35 },
  // pump shotgun: 8 pellets x 3.5, full damage within 6 m, 30 % at 16 m
  heavy: { hp: 140, radius: 0.45, walk: 1.5, run: 2.2, fireInterval: 1.1, burst: 1, damage: 3.5, sight: 26, idleSight: 14, fov: 0.35, pellets: 8, spread: (3 * Math.PI) / 180, muzzleUp: 1.4 * HEAVY_SCALE },
  // round 3: Madame Pockit, the penthouse boss (MADAME below): dual SMGs, bursts of 10; hp is per
  // difficulty (MADAME.hp); run is her brisk walk between cover in phases 1-2 (phase 3 runs like a rusher)
  madame: { hp: 1600, radius: 0.42, walk: 2.4, run: 3.4, fireInterval: 0.08, burst: 10, damage: 4, sight: 40, idleSight: 30, fov: 0.2, pellets: 1, spread: 0, muzzleUp: 1.35 * 1.25 },
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

/** Room 4, the elevator (round-3 plan section 2): a static car, the shaft scrolls past in the view; each
 *  stop opens its landing. World seconds unless "real". */
export const RIDE = {
  /** The door beat when a landing opens on the gang: world speed for `doorSlowReal` real s, no meter. */
  doorSlow: 0.3,
  doorSlowReal: 1.0,
  /** At a stop: the bell before the doors move, then they open / close in this long (a pried door
   *  opens over its stop's `pry` instead). */
  arrive: 1.0,
  open: 1.2,
  close: 1.2,
  /** Share of their travel at which opening doors leave the world (and the door beat starts). */
  gap: 0.45,
  /** The roof heavy: the thud, the hatch's tell (it flickers, dust sifts), then he drops through and
   *  lands in a crouch (no firing). */
  hatchTell: 2.0,
  land: 0.8,
  hatchY: 2.6,
  gravity: 22,
  /** He is outside a finished stop this long (real s): the HUD tells him to get back in the car. */
  backHint: 6,
  /** The cables: the snap, then the fall (the view's scroll runs backwards, fast), then the brakes. */
  dropAfter: 0.4,
  drop: 2.2,
  /** How far inside the car (m from its walls) he must stand for the doors to close. */
  inside: 0.45,
} as const;

/** Room 5, Madame Pockit (round-3 plan section 3). World seconds unless "real"; damage before the
 *  difficulty's damage factor. */
export const MADAME = {
  hp: { easy: 2000, normal: 2600, hard: 3200 } as Record<"easy" | "normal" | "hard", number>,
  /** Pockit #3099 at this scale (model + hit skeleton). */
  scale: 1.25,
  pockit: 3099,
  /** Phase 2 / 3 / the last stand at these shares of her health. */
  phase2: 0.66,
  phase3: 0.33,
  lastStand: 0.1,
  /** Hits on the coat (anything but the head) until it comes off. */
  coat: 0.8,
  /** A hit jolts her this long (world s; the gang's is AI.flinch): she never stops for long. */
  flinch: 0.08,
  /** Her head takes this share of a headshot's usual multiplier (she keeps it down: x2 instead of x3). */
  head: 2 / 3,
  /** Phase 3 opens with the coat thrown off: she cannot be hurt for this long. */
  coatThrow: 1.2,
  /** Her first alert: she says her piece before she draws (and cannot be hurt while she does). */
  introHold: 2.4,
  /** Between her bursts of 10. */
  burstPause: [1.1, 1.7] as const,
  /** She works the room from cover to cover at about this far from him (phases 1-2 / 3: closer, and
   *  she moves this much faster); cornered at the terrace door she charges to `engage`. */
  range: 13,
  range3: 12,
  /** She never crosses more than this much open floor to her next cover. */
  hop: 14,
  run3: 1.25,
  engage: 7,
  /** The SMG sweep: two pink laser lines cross the floor (the tell), then a burst along the same arc. */
  sweep: { every: [7, 10] as const, first: 4, tell: 0.6, tell3: 0.45, dur: 1.4, arc: (70 * Math.PI) / 180, interval: 0.07, damage: 4, spread: (1.2 * Math.PI) / 180, range: [4, 32] as const },
  /** Heart grenades (phase 2 on): wind-up with the grenade held high (shoot it there: it goes off on her),
   *  a lob, a pink ring where it lands; shot in the air it pops harmlessly. */
  // (the flight takes longer the farther she lobs it: `flight` s plus `flightPerM` a metre up to
  // `flightMax`; it goes off `fuse` s after it lands; under a ceiling lower than `headroom` (a door's
  // vestibule) it lands short, where the lob clears it)
  grenade: { every2: 5.5, every3: 4.0, first: 2.5, wind: 0.7, flight: 0.7, flightPerM: 0.03, flightMax: 1.5, fuse: 0.6, gravity: 16, radius: 3.5, center: 45, edge: 18, hand: 60, stagger: 1.5, hitRadius: 0.4, spread3: 2.2, range: [5, 32] as const, headroom: 4.5 },
  /** The chandelier over the round rug: two hits on its chain drop it; on her: damage + knockdown. Once. */
  chandelier: { hits: 2, damage: 180, knock: 2.0, fall: 0.45, chainRadius: 0.32 },
  /** The add doors: the red lamp over it lights this long before it opens; the first batch, then pairs
   *  every `every` s while fewer than `maxLive` of that door's adds stand. */
  doors: { lamp: 2.0, first: 3, pair: 2, every: 5, maxLive: 3 },
  /** The last stand: she runs for the bag (then the terrace door); the world slows by itself. */
  lastStandSlow: 0.25,
  lastStandReal: 2.0,
  lastStandRun: 5.0,
  /** Adds run for their door when she goes down, this fast, gone within this long. */
  flee: 4.4,
  fleeMax: 6,
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

// ---- the arsenal (arsenal spec sections 3 and 4) ---------------------------------------------------

/** Frag grenades: thrown from the left hand on a 35 deg loft that lands on the aim point (horizontal
 *  distance clamped to 3-20 m), world time (bullet time slows them), bounces, a 1.6 s fuse. The blast
 *  hurts everyone with a clear line from 0.25 m above it: damage x (1 - d / radius) ^ falloff. */
export const GRENADE = {
  carry: 3,
  cooldown: 0.8,
  loft: (35 * Math.PI) / 180,
  minRange: 3,
  maxRange: 20,
  minSpeed: 6,
  maxSpeed: 16,
  gravity: 16,
  restitution: 0.3,
  tangential: 0.6,
  restSpeed: 0.4,
  fuse: 1.6,
  radius: 5,
  damage: 150,
  falloff: 1.2,
  /** His share of his own blast. */
  self: 0.5,
  /** Hostiles within this of a landed grenade run from it (after `react`, for `flee` world seconds). */
  fleeRadius: 5,
  react: 0.25,
  flee: 1.0,
} as const;

/** Melee (F): #4764's katana or everyone else's strike. It resolves `windup` into the swing (his clock),
 *  hitting at most `max` hostiles whose torso is within reach and inside the arc around the aim. */
export const MELEE = {
  windup: 0.1,
  max: 3,
  katana: { damage: 120, time: 0.45, reach: 2.0, arc: (55 * Math.PI) / 180, flinch: 0.35, knock: 0 },
  strike: { damage: 45, time: 0.5, reach: 1.5, arc: (40 * Math.PI) / 180, flinch: 0.6, knock: 2.5 },
  /** The shove lasts this long (world seconds). */
  knockTime: 0.3,
} as const;

/** #4764's guard (hold the melee button; a tap still cuts). His clock unless "world" / "real". Rounds from
 *  the front arc (120 deg around the aim) meet the blade: no damage, a spark and a clang. The meter drains
 *  while it is held and per round, and refills once it is down; empty, the guard breaks. A shotgun blast
 *  is one heavy charge and a shove back; grenades, her heart grenades and anything from behind are not
 *  blocked. Inside `parry` of raising it (after `reParry` with it down) a round costs nothing: the perfect
 *  parry. In bullet time a deflected round goes back as his own (the one under the crosshair, else the
 *  shooter); outside it the round glances off, harmless. */
export const GUARD = {
  max: 100,
  /** Meter per second while held; refill per second once it has been down `refillDelay` s. */
  hold: 7,
  refill: 32,
  refillDelay: 0.6,
  /** Meter per round, per shotgun blast (all its pellets), and the blast's shove back (m/s, s). */
  deflect: 9,
  blast: 40,
  shove: 3.4,
  shoveTime: 0.28,
  /** Half the front arc: 60 deg. */
  arcCos: Math.cos((60 * Math.PI) / 180),
  /** The perfect parry's window after the raise, and how long the guard must have been down before. */
  parry: 0.2,
  reParry: 0.35,
  /** A tap (real seconds from the press to the release): the cut instead of the guard. */
  tap: 0.18,
  /** Broken: no guard for this long, and none until the meter is back to `minRaise`. */
  broken: 1.0,
  minRaise: 25,
  /** His speed while guarding. */
  move: 0.5,
  /** A goon in front of him holds her fire this long (world s) after the guard goes up. */
  hesitate: 0.6,
  /** A heavy steps in this close while he guards (the shotgun is the answer); a rusher circles this much
   *  faster to get out of the arc. */
  heavyIn: 2.6,
  flank: 1.7,
  /** A returned round's damage (x the part it hits): a goon's torso, a heavy's head. */
  returnDamage: 70,
  /** The blade's reach: a disc `r` across, `at` in front of him at `y` over his feet, facing the aim (a
   *  round that crosses it is caught, near misses too); a round that reaches his body from the front
   *  anyway meets the blade `blade` back up its line. */
  disc: { at: 0.45, y: 1.2, r: 0.6 },
  blade: 0.4,
} as const;

/** The sniper's scope: he moves this much slower while scoped. */
export const ZOOM = { move: 0.45 } as const;

/** The gang's other guns (marker data {weapon}): the sniper goon's cold laser tell then one round
 *  (no far falloff up to `range`), the hand-cannon heavy's single slug after the heavy's red tell. */
export const ENEMY_ARMS = {
  sniper: { tell: 0.8, damage: 22, hit: 0.75, range: 50, interval: 2.6, sight: 50 },
  handcannon: { damage: 34, interval: 1.2, shells: 7, reload: 1.6 },
} as const;

/** Secrets: the E reach (m) and the facing cone (cos of 60 deg) for secret doors and the eggs. */
export const USE = { reach: 1.3, cos: 0.5 } as const;
