// Weapons (spec section 4). Dual weapons alternate hands, each hand has its own magazine; an empty
// pair reloads by itself. Timers run on the owner's clock (the player's is 0.5x in bullet time).
// The player keeps one state per owned weapon (ammo survives a switch); a switch costs SWAP_TIME
// before the new gun fires and cancels a reload in progress. Pickups: a weapon the first time (a full
// magazine + its reserve), then ammo (see PICKUPS).

export type WeaponId = "pistols" | "ak" | "shotgun" | "smgs";
/** The gun a Radbro always carries (slot 1, infinite reserve): the dual pistols, or #250's AK. */
export type BaseWeapon = "pistols" | "ak";

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
  /** Cone half-angle in radians (the pellets / rounds scatter as a gaussian with sigma = half of it). */
  spread: number;
  reload: number;
  /** Rounds in reserve at pickup (Infinity = never runs dry). */
  reserve: number;
  /** Holding the trigger keeps firing. */
  auto: boolean;
  /** Most rounds the reserve holds. */
  reserveMax: number;
};

const DEG = Math.PI / 180;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistols: { id: "pistols", name: "Dual pistols", mag: 12, hands: 2, damage: 34, pellets: 1, interval: 0.12, spread: 0.35 * DEG, reload: 1.3, reserve: Infinity, auto: true, reserveMax: Infinity },
  // semi-auto: the pump is the animation (Shotgun_Fire racks it inside the 0.8 s). The plan's 6 deg
  // and 3 deg are the full cones: one blast kills a goon at 6 m, a handful of pellets land at 12 m
  shotgun: { id: "shotgun", name: "Shotgun", mag: 6, hands: 1, damage: 14, pellets: 8, interval: 0.8, spread: 3 * DEG, reload: 2, reserve: 24, auto: false, reserveMax: 48 },
  // #250's rifle, instead of the pistols: shouldered two-handed, a touch more damage per second than the
  // pistols at range but a wider cone on full auto and a slower mag change; never runs dry (a base gun)
  ak: { id: "ak", name: "AK", mag: 30, hands: 1, damage: 30, pellets: 1, interval: 0.1, spread: 0.9 * DEG, reload: 2.2, reserve: Infinity, auto: true, reserveMax: Infinity },
  smgs: { id: "smgs", name: "Dual SMGs", mag: 30, hands: 2, damage: 14, pellets: 1, interval: 0.06, spread: 1.5 * DEG, reload: 1.8, reserve: 180, auto: true, reserveMax: 360 },
};

/** Seconds (the player's clock) a weapon switch takes before the new gun can fire (Weapon_Swap: the guns change hands at 0.23 s). */
export const SWAP_TIME = 0.35;

/** What a pickup item gives: the weapon it hands out (the first time) and the ammo it adds after that. */
export const PICKUPS: Record<string, { weapon?: WeaponId; ammo: WeaponId; amount: number }> = {
  shotgun: { weapon: "shotgun", ammo: "shotgun", amount: 6 },
  smgs: { weapon: "smgs", ammo: "smgs", amount: 60 },
  shotgun_ammo: { ammo: "shotgun", amount: 6 },
  smgs_ammo: { ammo: "smgs", amount: 30 },
};

/** Sort order of owned guns (the base gun first). Only one base gun is ever owned, so it is slot 1. */
export const SLOT_ORDER: WeaponId[] = ["pistols", "ak", "shotgun", "smgs"];
/** Number key / tab of a weapon: 1 = the base gun, 2 = shotgun, 3 = SMGs. */
export const slotOf = (id: WeaponId): number => (id === "pistols" || id === "ak" ? 1 : id === "shotgun" ? 2 : 3);
/** Carried with both hands on one gun (the long-gun clip set, one muzzle). */
export const isLongGun = (id: string): boolean => id === "shotgun" || id === "ak";

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

/** Rounds left in the magazines and the reserve (Infinity for the pistols). */
export const ammoLeft = (w: WeaponState): number => w.mags[0] + w.mags[1] + w.reserve;

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
