// Hit feel: what a landed shot feels like, all on the view side. The sim's events (blood / hurt / kill
// / stagger, and his shots for the weapon) are grouped per rendered frame into one Hit per struck enemy
// (a shotgun blast's pellets are one hit, not eight), then fanned out to the hitmarker, the hit sounds,
// the pad, the camera punch, the enemy's reaction and the impact burst. Nothing here writes sim state.
// This file is plain logic (no three, no DOM): the grouping, the marker stacking, the weights per gun,
// the variant picks and the setting's strengths are tested in Node (test/hitfeel.test.ts).
import { PLAYER_ID, type GameEvent } from "../sim/types.ts";

/** Pause > Display > Hit feedback. */
export type HitFeelMode = "full" | "subtle" | "off";
export const HIT_FEEL_MODES: readonly HitFeelMode[] = ["full", "subtle", "off"];

/** A body hit, a head hit that did not kill, a kill (headshot or not: `headshot`). */
export type HitKind = "body" | "head" | "kill";

export type Hit = {
  kind: HitKind;
  headshot: boolean;
  target: number;
  /** The gun (his last shot's, the kill's own when it says), "melee", "grenade", "" unknown. */
  weapon: string;
  /** Where it landed (the first round in) and the way the round was going (unit, xz mostly). */
  x: number; y: number; z: number;
  dx: number; dy: number; dz: number;
  /** Has a position (a hit with no blood event, a frag's, has only the target's body to go by). */
  placed: boolean;
  /** Hurt events folded into this hit (a blast's pellets), and the damage they did. */
  n: number;
  amount: number;
  /** The room's last kill; the last one standing of what is awake now (the wave is down). */
  final: boolean;
  waveEnd: boolean;
  /** A heavy's stagger came with it. */
  stagger: boolean;
};

/** How hard each gun hits, for the reactions, the bursts, the pad and the punch (the pistols are 1). */
const WEIGHT: Record<string, number> = {
  pistols: 1, smgs: 0.75, ak: 1.1, rifle: 1.1, shotgun: 1.8, sawedoff: 2, handcannon: 1.7, sniper: 2.1, melee: 1.3, grenade: 1.9, heart: 1.6, chandelier: 2,
};
export function weaponWeight(w: string): number {
  return WEIGHT[w] ?? 1;
}
/** The big guns: a stagger and a knock-back on the struck body, a "pow" star at the hit. */
export const HEAVY_GUNS: ReadonlySet<string> = new Set(["shotgun", "sawedoff", "handcannon", "sniper"]);
export const isHeavyHit = (h: Pick<Hit, "weapon">): boolean => HEAVY_GUNS.has(h.weapon) || h.weapon === "grenade";

/** Strength of each channel per setting (1 = the full effect). Off keeps the enemies' flinch at about
 *  its old size (it is their animation, not an overlay) and drops everything else. */
export const FEEL: Record<HitFeelMode, { marker: number; sound: number; react: number; flash: number; burst: number; cam: number; rumble: number }> = {
  full: { marker: 1, sound: 1, react: 1, flash: 1, burst: 1, cam: 1, rumble: 1 },
  subtle: { marker: 0.8, sound: 0.6, react: 0.6, flash: 0.5, burst: 0.55, cam: 0.4, rumble: 0.6 },
  off: { marker: 0, sound: 0, react: 0.35, flash: 0, burst: 0, cam: 0, rumble: 0 },
};

export function parseHitFeel(v: string | null | undefined): HitFeelMode {
  return HIT_FEEL_MODES.includes(v as HitFeelMode) ? (v as HitFeelMode) : "full";
}

const rank = (k: HitKind) => (k === "kill" ? 2 : k === "head" ? 1 : 0);

/**
 * Folds one frame's events into hits. feed() every event (in order), flush() once per frame after the
 * sim ran. Only his damage counts: blood on the player is his, a kill without his shot line (her adds
 * caught in her own blast) makes no marker.
 */
export class HitGrouper {
  private pending = new Map<number, Hit>();
  private order: number[] = [];
  /** His last shot's gun (a bullet-time round lands long after the shot event). */
  lastWeapon = "pistols";
  /** A frag went off this frame; he fired this frame. */
  private blast = false;
  private shotNow = false;

  private get(target: number): Hit {
    let h = this.pending.get(target);
    if (!h) {
      h = { kind: "body", headshot: false, target, weapon: this.blast ? "grenade" : this.lastWeapon, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1, placed: false, n: 0, amount: 0, final: false, waveEnd: false, stagger: false };
      this.pending.set(target, h);
      this.order.push(target);
    }
    return h;
  }

  feed(e: GameEvent): void {
    switch (e.type) {
      case "shot":
        if (e.shooter === PLAYER_ID && e.pellet === 0) { this.lastWeapon = e.weapon; this.shotNow = true; }
        break;
      case "melee":
        // the swing's hits went out just before this (no gun on them): they were the blade / the strike
        if (e.phase === "hit" && !this.shotNow) for (const h of this.pending.values()) if (h.weapon === this.lastWeapon) h.weapon = "melee";
        break;
      case "explode":
        this.blast = true;
        break;
      case "blood": {
        if (e.target < 0) break;
        const h = this.get(e.target);
        if (e.ink) h.weapon = "melee";
        if (!h.placed || (e.part === 0 && !h.headshot)) {
          h.x = e.x; h.y = e.y; h.z = e.z;
          const l = Math.hypot(e.dx, e.dy, e.dz) || 1;
          h.dx = e.dx / l; h.dy = e.dy / l; h.dz = e.dz / l;
          h.placed = true;
        }
        break;
      }
      case "hurt": {
        if (e.target === PLAYER_ID || e.target < 0) break;
        const h = this.get(e.target);
        h.n++;
        h.amount += e.amount;
        if (e.part === 0) { h.headshot = true; if (rank(h.kind) < 1) h.kind = "head"; }
        break;
      }
      case "stagger":
        this.get(e.enemy).stagger = true;
        break;
      case "kill": {
        if (!e.shot) { this.pending.delete(e.target); this.order = this.order.filter(t => t !== e.target); break; }
        const h = this.get(e.target);
        h.kind = "kill";
        h.headshot = e.headshot;
        h.final = e.final;
        if (e.weapon) h.weapon = e.weapon;
        if (h.n === 0) h.n = 1;
        if (!h.placed) {
          h.x = e.shot.x; h.y = e.shot.y; h.z = e.shot.z;
          const dx = e.shot.x - e.shot.ox, dy = e.shot.y - e.shot.oy, dz = e.shot.z - e.shot.oz, l = Math.hypot(dx, dy, dz) || 1;
          h.dx = dx / l; h.dy = dy / l; h.dz = dz / l;
          h.placed = true;
        }
        break;
      }
    }
  }

  /** This frame's hits, strongest last (a kill's marker wins over a body hit on another girl). `awake`
   *  = girls still up and in the fight after these events (0: the kill ended the wave). */
  flush(awake = 1): Hit[] {
    const out: Hit[] = [];
    for (const t of this.order) {
      const h = this.pending.get(t);
      if (!h || h.n === 0) continue;
      if (h.kind === "kill" && awake === 0) h.waveEnd = true;
      out.push(h);
    }
    this.pending.clear();
    this.order = [];
    this.blast = false;
    this.shotNow = false;
    // the last one out drives the marker: sort by kind (stable), so a kill lands on top
    return out.sort((a, b) => rank(a.kind) - rank(b.kind));
  }

  reset(): void {
    this.pending.clear();
    this.order = [];
    this.blast = false;
    this.shotNow = false;
    this.lastWeapon = "pistols";
  }
}

// ---- the hitmarker ------------------------------------------------------------------------------

/** Rapid hits build the marker up (size, weight), then it settles: `level` 0..1 decays with a half-life
 *  of `half` ms; each hit adds by its kind and gun. */
export const STACK = { half: 170, add: { body: 0.28, head: 0.42, kill: 0.6 } as Record<HitKind, number>, max: 1 };

export type Stack = { level: number; at: number; count: number };
export const newStack = (): Stack => ({ level: 0, at: -1e9, count: 0 });

/** The stack after a hit at `now` (ms). count = hits in the current run (a gap of 3 half-lives ends it). */
export function stackHit(s: Stack, now: number, kind: HitKind, weight = 1): Stack {
  const dt = Math.max(0, now - s.at);
  const decayed = s.level * Math.pow(0.5, dt / STACK.half);
  const add = STACK.add[kind] * Math.min(1.6, Math.max(0.6, weight));
  return { level: Math.min(STACK.max, decayed + add), at: now, count: dt > STACK.half * 3 ? 1 : s.count + 1 };
}

/** The stack's level at `now` without a new hit. */
export function stackLevel(s: Stack, now: number): number {
  return s.level * Math.pow(0.5, Math.max(0, now - s.at) / STACK.half);
}

export type MarkSpec = {
  /** Scale on the 1080p art (1 = a body hit's X, ~40 px across). */
  scale: number;
  /** Blade weight multiplier. */
  weight: number;
  /** Degrees. */
  rot: number;
  /** How long it shows (ms, real time). */
  ms: number;
  color: string;
  core: string;
  ring: boolean;
  accent: boolean;
};

export const MARK_COLOURS = { body: "#ffffff", head: "#ffcf3a", kill: "#ff2840", killCore: "#ffffff" } as const;

/** What the marker looks like for this hit: kind, the stack level after it, a 0..1 random for the tilt. */
export function markSpec(kind: HitKind, headshot: boolean, level: number, rnd: number, heavy = false): MarkSpec {
  const tilt = (rnd - 0.5) * 2 * (kind === "kill" ? 6 : 9);
  const lv = Math.max(0, Math.min(1, level));
  if (kind === "kill") return { scale: 1.45 + 0.25 * lv + (heavy ? 0.1 : 0), weight: 1.35 + 0.25 * lv, rot: tilt, ms: 520, color: MARK_COLOURS.kill, core: headshot ? MARK_COLOURS.head : MARK_COLOURS.killCore, ring: true, accent: headshot };
  if (kind === "head") return { scale: 1.15 + 0.3 * lv, weight: 1.15 + 0.3 * lv, rot: tilt, ms: 380, color: MARK_COLOURS.head, core: MARK_COLOURS.head, ring: false, accent: true };
  return { scale: 1 + 0.38 * lv + (heavy ? 0.12 : 0), weight: 1 + 0.4 * lv, rot: tilt, ms: 260 + 60 * lv, color: MARK_COLOURS.body, core: MARK_COLOURS.body, ring: false, accent: false };
}

// ---- sounds: variant pools ------------------------------------------------------------------------

/** A variant index in [0, n) that is never the last one (n > 1). */
export function pickVariant(n: number, last: number, rnd: number): number {
  if (n <= 1) return 0;
  const i = Math.floor(rnd * (n - 1)) % (n - 1);
  return last >= 0 && last < n && i >= last ? i + 1 : i;
}

/** A playback-rate jitter of up to +-`cents`. */
export const centsRate = (cents: number): number => Math.pow(2, cents / 1200);

/** Hit sounds in bullet time: pitched down a little (0.82 at the slowest), never as far as the world. */
export const hitRate = (timeScale: number): number => 0.82 + 0.18 * Math.max(0, Math.min(1, timeScale));

/** Rapid body hits climb a little in pitch (up to +3 semitones at a full stack): the build-up is heard. */
export const stackRate = (level: number): number => Math.pow(2, (3 * Math.max(0, Math.min(1, level))) / 12);

// ---- camera + pad -------------------------------------------------------------------------------

/** The view-only punch for a hit (0 = none): the lens rolls a hair and squeezes in, never turning off
 *  the aim point. Kills and headshots punch; the last kill of a wave hardest. */
export function punchOf(h: Pick<Hit, "kind" | "headshot" | "waveEnd" | "final" | "weapon">): number {
  if (h.kind === "kill") return h.waveEnd || h.final ? 1 : h.headshot ? 0.62 : 0.5 * Math.min(1.3, 0.8 + 0.2 * weaponWeight(h.weapon));
  if (h.kind === "head") return 0.32;
  return 0;
}

export type PadPulse = { strong: number; weak: number; ms: number };
/** The pad for a hit: a light tick on a body hit, a sharp one on a headshot, a firm thump on a kill. */
export function rumbleOfHit(h: Pick<Hit, "kind" | "headshot" | "waveEnd" | "weapon">, k = 1): PadPulse | null {
  if (k <= 0) return null;
  const w = Math.min(1.4, weaponWeight(h.weapon));
  const r: PadPulse = h.kind === "kill"
    ? { strong: 0.5 + (h.waveEnd ? 0.25 : 0), weak: 0.35, ms: h.waveEnd ? 200 : 120 }
    : h.kind === "head" ? { strong: 0.08, weak: 0.55, ms: 55 } : { strong: 0.03, weak: 0.18 * w, ms: 32 };
  return { strong: Math.min(1, r.strong * k), weak: Math.min(1, r.weak * k), ms: r.ms };
}

// ---- enemy reaction: a damped spring ------------------------------------------------------------

/** One reaction channel: a critically-underdamped spring pulled back to 0; kicks add velocity. */
export type Spring = { x: number; v: number };
export const SPRING = { k: 260, c: 17 };
export function springStep(s: Spring, dt: number, k = SPRING.k, c = SPRING.c): void {
  // sub-stepped semi-implicit Euler (stable at 30 fps frames)
  const n = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (-k * s.x - c * s.v) * h;
    s.x += s.v * h;
  }
  if (Math.abs(s.x) < 1e-5 && Math.abs(s.v) < 1e-4) { s.x = 0; s.v = 0; }
}

/** A kick that peaks near `amount` (the spring's first swing). */
export function springKick(s: Spring, amount: number): void {
  s.v += amount * 26;
}

/** The body reaction for a hit (angles in radians, before the setting's strength): lean away from the
 *  round, twist by the side it came in on, a head snap on a headshot, a knock-back (m) on the big guns. */
export function reactionOf(h: Pick<Hit, "kind" | "headshot" | "weapon" | "n" | "stagger">): { lean: number; twist: number; head: number; knock: number } {
  const w = weaponWeight(h.weapon);
  const heavy = isHeavyHit(h);
  const lean = Math.min(0.75, (0.2 + 0.12 * Math.min(4, h.n - 1) * (heavy ? 0.4 : 1)) * w * (h.kind === "kill" ? 1.2 : 1));
  return {
    lean,
    twist: 0.55 * lean,
    head: h.headshot ? 0.75 + (h.kind === "kill" ? 0.2 : 0) : 0.12 * w,
    knock: heavy || h.stagger ? 0.12 * w : 0,
  };
}

/** The camera's punch now (set by the hit feel dispatcher, read by CameraView): `k` its strength,
 *  `t` real seconds since it started, `roll` the side it rolls to. */
export const camPunch = { k: 0, t: 1, roll: 1 };
export const PUNCH = { attack: 0.025, decay: 0.075, roll: 0.012, zoom: 0.05, len: 0.4 };

export function startPunch(k: number): void {
  if (k <= 0) return;
  // a punch already going keeps the stronger of the two (rapid kills do not stack into a shake)
  const cur = camPunch.k * punchEnv(camPunch.t);
  if (k < cur) return;
  camPunch.k = k;
  camPunch.t = 0;
  camPunch.roll = Math.random() < 0.5 ? -1 : 1;
}

/** 0..1: a fast rise, then an exponential settle. */
export function punchEnv(t: number): number {
  if (t < 0 || t >= PUNCH.len) return 0;
  if (t < PUNCH.attack) return t / PUNCH.attack;
  return Math.exp(-(t - PUNCH.attack) / PUNCH.decay);
}

// ---- impact bursts ------------------------------------------------------------------------------

/** How much of the burst each graphics preset draws (particles x count, the ring / star on or off).
 *  "custom" follows its Low-ish or High-ish half by `lite`. */
export function burstBudget(preset: string, lite: boolean): { count: number; ring: boolean; star: boolean } {
  if (preset === "low" || (preset === "custom" && lite)) return { count: 0.5, ring: false, star: true };
  if (preset === "medium") return { count: 0.75, ring: true, star: true };
  if (preset === "cinematic") return { count: 1.3, ring: true, star: true };
  return { count: 1, ring: true, star: true };
}

/** The burst for a hit: ink flecks, paper / gold streaks, sparks (counts before the budget), the star
 *  ("pow": the big guns, a headshot kill), the ring (a kill), and its size (1 = a pistol's body hit). */
export function burstOf(h: Pick<Hit, "kind" | "headshot" | "weapon" | "n">): { ink: number; streaks: number; sparks: number; star: boolean; ring: boolean; size: number } {
  const w = weaponWeight(h.weapon);
  const heavy = isHeavyHit(h);
  const kill = h.kind === "kill";
  const size = Math.min(1.9, 0.75 + 0.3 * w + (kill ? 0.2 : 0));
  return {
    ink: Math.round((kill ? 9 : 5) * Math.min(1.6, w)),
    streaks: Math.round((h.headshot ? 7 : 5) * Math.min(1.5, w) + (kill ? 3 : 0)),
    sparks: Math.round((h.headshot ? 6 : 3) + (heavy ? 3 : 0)),
    star: heavy || (kill && h.headshot),
    ring: kill,
    size,
  };
}
