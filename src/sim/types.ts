// Shared sim types: the per-step input, the events the views drain, small vectors.

/**
 * One fixed step of input. Move is camera-relative (x = right, y = forward, |move| <= 1); yaw / pitch
 * are the aim (camera) angles: yaw 0 looks down -Z, positive pitch looks up. Edges are true on the one
 * step that consumes the press.
 */
export type InputFrame = {
  moveX: number;
  moveY: number;
  yaw: number;
  pitch: number;
  fire: boolean;
  /** Toggle bullet time (Q / right mouse). */
  bt: boolean;
  /** Shootdodge (Shift). */
  dodge: boolean;
  jump: boolean;
  reload: boolean;
  /** Use a copium canister (H). */
  copium: boolean;
  /** Weapon slot 1..3, 0 = no change. */
  slot: number;
  /** Skip the final-kill cam (any key). */
  skip: boolean;
  /** Melee (F), throw a grenade (G), use (E: secret doors, the eggs): press edges. */
  melee?: boolean;
  throw?: boolean;
  interact?: boolean;
  /** The sniper's scope (right mouse / LT held while the sniper is in hand). */
  zoom?: boolean;
  /** The melee button held (F / Circle): #4764 raises his katana's guard while it is down; let go within
   *  a moment of the press and it was a tap: the cut. A press that came and went between two steps
   *  (`melee` without `guard`) cuts at once, as it does for everyone else. */
  guard?: boolean;
};

export function emptyInput(): InputFrame {
  return { moveX: 0, moveY: 0, yaw: 0, pitch: 0, fire: false, bt: false, dodge: false, jump: false, reload: false, copium: false, slot: 0, skip: false, melee: false, throw: false, interact: false, zoom: false, guard: false };
}

export type V3 = { x: number; y: number; z: number };

/** Shooter id of the player (enemies use their index). */
export const PLAYER_ID = -1;

export type GameEvent =
  /** weapon: "pistols" | "shotgun" | "smgs" (the player's) or "pistol" | "smg" | "shotgun" (the gang's);
   *  pellet: 0 for the first projectile of a trigger pull (flash + sound), 1.. for the rest of a shotgun's. */
  | { type: "shot"; shooter: number; hand: number; ox: number; oy: number; oz: number; ex: number; ey: number; ez: number; projectile: boolean; id: number; weapon: string; pellet: number }
  | { type: "impact"; x: number; y: number; z: number; nx: number; ny: number; nz: number; surface: string; shooter: number }
  /** ink: #4764's blade (no blood: an ink-and-spark cut). */
  | { type: "blood"; x: number; y: number; z: number; dx: number; dy: number; dz: number; target: number; part: number; ink?: boolean }
  | { type: "decal"; x: number; y: number; z: number; nx: number; ny: number; nz: number; blood: boolean }
  | { type: "hurt"; target: number; amount: number; part: number; hp: number; shooter?: number; fromX?: number; fromZ?: number }
  /** blast: a point-blank shotgun kill by the player (the body is blown back). */
  /** A kill; by his hand it carries the weapon ("grenade", "melee", a gun id; room 5: "heart", "chandelier") and the shot line: from
   *  the muzzle (a projectile's start, the blast's centre) to where it hit her (the kill cam rides it). */
  | { type: "kill"; target: number; headshot: boolean; final: boolean; blast?: boolean; weapon?: string; shot?: { ox: number; oy: number; oz: number; x: number; y: number; z: number } }
  | { type: "projectileEnd"; id: number }
  | { type: "alert"; enemy: number }
  | { type: "dodge" }
  | { type: "land"; prone: boolean }
  | { type: "getup" }
  | { type: "jump" }
  | { type: "bt"; on: boolean }
  | { type: "reload"; hand: number }
  | { type: "reloaded" }
  | { type: "dryfire" }
  | { type: "pickup"; item: string; amount: number; id: string; pin?: string }
  /** A weapon switch (the new weapon's id); a pickup that dropped at a body; the first shot in the room
   *  (the crowd scatters, the club's lights change); a heavy staggered by a big hit. */
  | { type: "swap"; weapon: string }
  | { type: "drop"; id: string; item: string; x: number; y: number; z: number; fromY?: number }
  | { type: "firstShot"; x: number; z: number }
  | { type: "stagger"; enemy: number }
  /** A door taken out of the world: `kick` = kicked open from inside (the fallback), else the player's
   *  dive went through it; (dx, dz) = the way the door flies. */
  | { type: "breach"; id: string; kick: boolean; dx: number; dz: number }
  | { type: "copium" }
  | { type: "playerDead" }
  | { type: "roomClear" }
  | { type: "killcam"; on: boolean }
  | { type: "trigger"; id: string; action: string; group?: string }
  | { type: "exit" }
  /** Bullet time asked for with too little meter (the HUD flashes the hourglass). */
  | { type: "btRefused" }
  // the arsenal: a grenade leaves his left hand (id), bounces, goes off (x, y, z; kills in it)
  | { type: "throw"; id: number; x: number; y: number; z: number }
  | { type: "bounce"; id: number; x: number; y: number; z: number; speed: number }
  | { type: "explode"; id: number; x: number; y: number; z: number }
  /** A melee: `phase` start (the swing begins) / hit (it resolved: `hits` bodies); kind katana | strike. */
  | { type: "melee"; kind: "katana" | "strike"; phase: "start" | "hit"; hits: number }
  | { type: "zoom"; on: boolean }
  /** #4764's guard: raised, lowered, broken (its meter ran out: down for GUARD.broken). */
  | { type: "guard"; what: "up" | "down" | "break" }
  /** A round met his guard at (x, y, z), coming along (dx, dy, dz): it goes off along (rx, ry, rz): back at
   *  `target` (an enemy index) as his own round in bullet time (`returned`), else off the blade, harmless.
   *  first: the blast's first pellet (a shotgun blast is one clang, one charge, one shove). */
  | { type: "deflect"; x: number; y: number; z: number; dx: number; dy: number; dz: number; rx: number; ry: number; rz: number; perfect: boolean; returned: boolean; blast: boolean; first: boolean; shooter: number; target: number; id: number }
  // secrets: found (n of `of` in the room), a secret door opened, a breakable broke, E at an egg
  | { type: "secret"; id: string; n: number; of: number; name: string }
  | { type: "open"; node: string }
  | { type: "break"; node: string; x: number; y: number; z: number; surface: string }
  | { type: "interact"; id: string; egg: string }
  /** Round 3, room 4: the ride (sim/ride.ts). start / depart: a leg begins; arrive: the car stops at
   *  `stop`; open / close: its doors (pry: forced open from outside); roof: the thud on the car's roof;
   *  hatch: the heavy kicks the hatch in and drops; land: he is down in the car; cables / drop / brake:
   *  the fall; back: the stop is clear and he is still outside the car. */
  | { type: "ride"; what: "start" | "depart" | "arrive" | "open" | "close" | "roof" | "hatch" | "land" | "cables" | "drop" | "brake" | "back"; stop?: string; side?: string; pry?: boolean }
  /** Round 3, room 5: Madame Pockit (sim/boss.ts). */
  | { type: "boss"; what: "intro" | "phase2" | "phase3" | "sweepTell" | "sweep" | "windup" | "reload" | "rug" | "chain" | "chandelier" | "crash" | "lamp" | "door" | "lastStand" | "bag" | "down" | "stagger" | "laugh"; door?: string; hit?: boolean }
  /** Her heart grenades: throw (from her hand), land, blast (hand: shot in her hand, it went off on her),
   *  pop (shot in the air: harmless). */
  | { type: "grenade"; what: "throw" | "land" | "blast" | "pop"; id: number; x: number; y: number; z: number; hand?: boolean };
