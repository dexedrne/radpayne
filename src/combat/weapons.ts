// Weapons (spec section 4). Dual weapons alternate hands, each hand has its own magazine; an empty
// pair reloads by itself. Timers run on the owner's clock (the player's is 0.5x in bullet time).

export type WeaponId = "pistols" | "shotgun" | "smgs";

export type WeaponDef = {
  id: WeaponId;
  name: string;
  /** Rounds per hand. */
  mag: number;
  hands: 1 | 2;
  damage: number;
  pellets: number;
  /** Seconds between shots (alternating hands for dual weapons). */
  interval: number;
  /** Cone half-angle in radians. */
  spread: number;
  reload: number;
  /** Rounds in reserve at pickup (Infinity = never runs dry). */
  reserve: number;
  /** Holding the trigger keeps firing. */
  auto: boolean;
  /** Stub weapons are defined but not handed out yet. */
  stub?: boolean;
};

const DEG = Math.PI / 180;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistols: { id: "pistols", name: "Dual pistols", mag: 12, hands: 2, damage: 34, pellets: 1, interval: 0.12, spread: 0.35 * DEG, reload: 1.3, reserve: Infinity, auto: true },
  shotgun: { id: "shotgun", name: "Shotgun", mag: 6, hands: 1, damage: 14, pellets: 8, interval: 0.8, spread: 6 * DEG, reload: 2, reserve: 24, auto: false, stub: true },
  smgs: { id: "smgs", name: "Dual SMGs", mag: 30, hands: 2, damage: 14, pellets: 1, interval: 0.06, spread: 3 * DEG, reload: 1.8, reserve: 180, auto: true, stub: true },
};

export const SLOT_ORDER: WeaponId[] = ["pistols", "shotgun", "smgs"];

export type WeaponState = {
  id: WeaponId;
  /** Rounds in each hand (index 1 unused for single weapons). */
  mags: [number, number];
  /** Hand that fires next. */
  hand: 0 | 1;
  /** Seconds until the next shot may fire. */
  cooldown: number;
  /** Seconds of reload left (0 = not reloading). */
  reloadT: number;
  reserve: number;
  /** Trigger was down last step (semi-auto edge detection). */
  wasDown: boolean;
  shots: number;
};

export function makeWeapon(id: WeaponId): WeaponState {
  const d = WEAPONS[id];
  return { id, mags: [d.mag, d.hands === 2 ? d.mag : 0], hand: 0, cooldown: 0, reloadT: 0, reserve: d.reserve, wasDown: false, shots: 0 };
}

export const ammoIn = (w: WeaponState): number => w.mags[0] + (WEAPONS[w.id].hands === 2 ? w.mags[1] : 0);
export const magSize = (w: WeaponState): number => WEAPONS[w.id].mag * WEAPONS[w.id].hands;

export function startReload(w: WeaponState): boolean {
  const d = WEAPONS[w.id];
  if (w.reloadT > 0 || ammoIn(w) >= magSize(w) || w.reserve <= 0) return false;
  w.reloadT = d.reload;
  return true;
}

/** Advance timers; finishes a reload (fills both hands from the reserve). Returns true when a reload completed. */
export function stepWeapon(w: WeaponState, dt: number): boolean {
  // may dip below 0 by less than one step: the remainder carries into the next shot's cooldown
  if (w.cooldown > 0) w.cooldown -= dt;
  if (w.reloadT > 0) {
    w.reloadT -= dt;
    if (w.reloadT <= 0) {
      w.reloadT = 0;
      const d = WEAPONS[w.id];
      for (let h = 0; h < d.hands; h++) {
        const need = d.mag - w.mags[h];
        const take = Math.min(need, w.reserve);
        w.mags[h] += take;
        if (w.reserve !== Infinity) w.reserve -= take;
      }
      w.hand = 0;
      return true;
    }
  }
  return false;
}

/**
 * One step of trigger logic. Returns the hand that fired (0 / 1) or -1. The cooldown carries its
 * remainder, so a held trigger fires exactly every `interval` on average at any step size.
 */
export function triggerWeapon(w: WeaponState, down: boolean): number {
  const d = WEAPONS[w.id];
  const edge = down && !w.wasDown;
  w.wasDown = down;
  if (!down || (!d.auto && !edge)) return -1;
  if (w.reloadT > 0 || w.cooldown > 0) return -1;
  // pick the hand: the scheduled one, else the other one with rounds
  let hand: 0 | 1 = w.hand;
  if (w.mags[hand] <= 0 && d.hands === 2) hand = hand === 0 ? 1 : 0;
  if (w.mags[hand] <= 0) {
    startReload(w);
    return -1;
  }
  w.mags[hand]--;
  w.shots++;
  w.cooldown += d.interval; // cooldown is in (-dt, 0] here
  w.hand = d.hands === 2 ? (hand === 0 ? 1 : 0) : 0;
  if (ammoIn(w) === 0) startReload(w);
  return hand;
}
