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
};

export function emptyInput(): InputFrame {
  return { moveX: 0, moveY: 0, yaw: 0, pitch: 0, fire: false, bt: false, dodge: false, jump: false, reload: false, copium: false, slot: 0, skip: false };
}

export type V3 = { x: number; y: number; z: number };

/** Shooter id of the player (enemies use their index). */
export const PLAYER_ID = -1;

export type GameEvent =
  | { type: "shot"; shooter: number; hand: number; ox: number; oy: number; oz: number; ex: number; ey: number; ez: number; projectile: boolean; id: number }
  | { type: "impact"; x: number; y: number; z: number; nx: number; ny: number; nz: number; surface: string; shooter: number }
  | { type: "blood"; x: number; y: number; z: number; dx: number; dy: number; dz: number; target: number; part: number }
  | { type: "decal"; x: number; y: number; z: number; nx: number; ny: number; nz: number; blood: boolean }
  | { type: "hurt"; target: number; amount: number; part: number; hp: number }
  | { type: "kill"; target: number; headshot: boolean; final: boolean }
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
  | { type: "pickup"; item: string; amount: number; id: string }
  | { type: "copium" }
  | { type: "playerDead" }
  | { type: "roomClear" }
  | { type: "killcam"; on: boolean }
  | { type: "trigger"; id: string; action: string; group?: string }
  | { type: "exit" };
