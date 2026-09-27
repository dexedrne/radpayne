// The kill cam, Sniper Elite style (presentation only: the sim never knows). On a special kill the fight
// is held (Session.hold: no steps run, so replays and the sim's clock are untouched; the views crawl at
// CINE.crawl), the lens rides the bullet from the muzzle to her with the world dimmed, then the impact:
// an X-ray freeze (xray.ts draws her skeleton over a dark halftone frame, the hit bone cracked), a short
// hold, and it snaps back. Which kills: the room's last kill always (its ride replaces the old chase;
// the sim's own final-kill cam then plays on as the swing around her), and with "special shots" a
// sniper kill, a headshot past CINE.longRange, one hand-cannon / sniper round through two bodies, a
// grenade that takes two or more, a round #4764's katana sent back in bullet time ("RETURN TO SENDER");
// "always" adds any kill by a shot. At most one every CINE.cooldown
// real seconds (the last kill is never held back), never while Madame Pockit makes an entrance, changes
// phase, throws her coat off or starts her last stand, never while the elevator car is between stops
// or a breach runs slow, and any key skips it. A hand-cannon / sniper round still flying on through a
// body (a projectile in bullet time) holds the decision until it lands or CINE.pierceWait passes, so
// every body it takes is in one cam. Pure (no three.js): the Node tests drive it.
import type { V3 } from "../sim/types.ts";
import type { KillcamMode } from "../ui/store.ts";

export const CINE = {
  /** The views' world speed while the cam holds the fight (the rain, the bodies, the FX crawl). */
  crawl: 0.06,
  /** Real seconds between two kill cams ("always": alwaysCooldown); the last kill of a room ignores it. */
  cooldown: 20,
  alwaysCooldown: 6,
  /** A headshot past this (m) is a special shot. */
  longRange: 25,
  /** The ride: real seconds = lead + metres / speed, within [minFlight, maxFlight]. */
  lead: 0.45,
  speed: 30,
  minFlight: 0.8,
  maxFlight: 1.8,
  /** The bullet starts this far out of the muzzle (the lens starts past his own head). */
  start: 1.25,
  /** No bullet to ride (a grenade, a melee's last kill): the push in on the bodies. */
  push: 0.9,
  /** The X-ray freeze, and the snap back's flash after it. */
  xray: 1.1,
  out: 0.18,
  /** Real seconds after one of Madame Pockit's big moments (a phase, the last stand) with no cam. */
  bossBeat: 3,
  /** Real seconds a piercing round still in flight may hold the decision (its next body is in the cam). */
  pierceWait: 0.8,
} as const;

export type CineKind = "final" | "sniper" | "long" | "pierce" | "grenade" | "return" | "shot";
/** One kill by his hand (the sim's kill event): weapon, where the shot came from and where it hit. */
export type CineKill = { enemy: number; weapon: string; headshot: boolean; part: number; from: V3; to: V3; final: boolean; at: number };
export type CinePhase = "flight" | "xray" | "out";
export type Cine = {
  kind: CineKind;
  kills: CineKill[];
  /** The bullet's line (the muzzle -> the last body it hit); for a blast, its centre -> the first body. */
  from: V3;
  to: V3;
  dist: number;
  /** A bullet to ride (false: a grenade or a melee, the push in on the bodies). */
  ride: boolean;
  /** Real seconds of the ride / push, and since the cam started. */
  flight: number;
  t: number;
  phase: CinePhase;
  final: boolean;
  /** The tag over the letterbox ("SNIPER · 41 M"). */
  tag: string;
};

const dist3 = (a: V3, b: V3) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
const sameOrigin = (a: CineKill, b: CineKill) => Math.abs(a.from.x - b.from.x) + Math.abs(a.from.y - b.from.y) + Math.abs(a.from.z - b.from.z) < 1e-4;
const PIERCING = new Set(["handcannon", "sniper"]);
/** Kills with no bullet to ride: a blast, a blade, the chandelier coming down on her. */
const NO_RIDE = new Set(["melee", "grenade", "chandelier"]);
const byShot = (k: CineKill) => !NO_RIDE.has(k.weapon);
/** Along the round's path: the nearest body first, the last one it reached at the end. */
const alongPath = (ks: CineKill[]) => [...new Set(ks)].sort((a, b) => dist3(a.from, a.to) - dist3(b.from, b.to));

/** Which cam (if any) this step's kills earn. `recent`: the kills of the last second (a round through
 *  two bodies in bullet time lands its second a few steps after the first); `since`: real seconds since
 *  the last cam. */
export function pickCine(kills: CineKill[], recent: CineKill[], mode: KillcamMode, since: number): { kind: CineKind; kills: CineKill[] } | null {
  if (!kills.length || mode === "off") return null;
  const fin = kills.find(k => k.final);
  if (fin) {
    // the last kill, and whoever else its round (or blast) took with it
    const with_ = [...recent, ...kills].filter(k => k !== fin && sameOrigin(k, fin) && k.weapon === fin.weapon);
    return { kind: "final", kills: fin.weapon === "grenade" ? [fin, ...with_.filter(k => k !== fin)] : alongPath([...with_, fin]) };
  }
  if (mode === "final" || since < (mode === "always" ? CINE.alwaysCooldown : CINE.cooldown)) return null;
  const blast = kills.filter(k => k.weapon === "grenade");
  if (blast.length >= 2) return { kind: "grenade", kills: blast };
  const back = kills.find(k => k.weapon === "returned");
  if (back) return { kind: "return", kills: [back] };
  for (const k of kills) {
    if (!PIERCING.has(k.weapon)) continue;
    const through = [...recent, ...kills].filter(o => o !== k && o.weapon === k.weapon && sameOrigin(o, k));
    if (through.length) return { kind: "pierce", kills: alongPath([...through, k]) };
  }
  const sn = kills.find(k => k.weapon === "sniper");
  if (sn) return { kind: "sniper", kills: [sn] };
  const lh = kills.find(k => k.headshot && byShot(k) && dist3(k.from, k.to) > CINE.longRange);
  if (lh) return { kind: "long", kills: [lh] };
  if (mode === "always") { const any = kills.find(byShot); if (any) return { kind: "shot", kills: [any] }; }
  return null;
}

/** The ride's real length for a bullet line of `m` metres. */
export const flightFor = (m: number): number => Math.max(CINE.minFlight, Math.min(CINE.maxFlight, CINE.lead + m / CINE.speed));

function tagOf(kind: CineKind, kills: CineKill[], m: number): string {
  const range = `${Math.round(m)} M`;
  switch (kind) {
    case "final": return kills[kills.length - 1].weapon === "returned" ? "RETURN TO SENDER" : "FINAL KILL";
    case "return": return "RETURN TO SENDER";
    case "sniper": return `${kills[0].headshot ? "HEADSHOT" : "SNIPER"} · ${range}`;
    case "long": return `HEADSHOT · ${range}`;
    case "pierce": return `${kills.length === 2 ? "TWO" : kills.length === 3 ? "THREE" : kills.length} WITH ONE`;
    case "grenade": return `FRAG · ×${kills.length}`;
    default: return kills[0].headshot ? `HEADSHOT · ${range}` : range;
  }
}

/** The ride's shape: fast out of the muzzle, slowing into her (0..1 of the path at u = 0..1 of the ride). */
export const rideEase = (u: number): number => (u >= 1 ? 1 : u <= 0 ? 0 : 1 - Math.pow(1 - u, 1.7));

export class CineCtl {
  cur: Cine | null = null;
  private pending: CineKill[] = [];
  private recent: CineKill[] = [];
  private lastAt = -1e9;
  /** The victims whose bullet has landed in the last kill's cam: the sim's own final-kill cam holds her
   *  up (Enemy.deathHold) for its chase, which no longer plays; her fall starts at the impact. */
  landed = new Set<number>();
  /** The last kill's cam has run (or was skipped): the sim's final-kill cam plays on as the swing. */
  flownFinal = false;

  reset(): void {
    this.cur = null;
    this.pending = [];
    this.waiting = [];
    this.recent = [];
    this.lastAt = -1e9;
    this.landed.clear();
    this.flownFinal = false;
  }

  /** A kill by his hand in this step (the decision waits for the step's other kills). */
  kill(k: CineKill): void {
    this.pending.push(k);
  }

  /** Kills held back while their piercing round flies on (see `decide`). */
  private waiting: CineKill[] = [];

  /** After a step: start a cam when its kills earn one. `blocked`: a boss changing phase, the car
   *  between stops, a breach running slow, the fight not on (the last kill passes). `flying`: the kill's
   *  round is still in the air and may take another body (a piercing projectile): the decision waits for
   *  it (at most CINE.pierceWait), and the bodies it takes on the way share one cam. Returns the new cam
   *  or null. */
  decide(now: number, mode: KillcamMode, blocked: boolean, flying?: (k: CineKill) => boolean): Cine | null {
    const kills = [...this.waiting, ...this.pending];
    this.pending = [];
    this.waiting = [];
    this.recent = this.recent.filter(k => now - k.at < 1);
    if (!kills.length) return null;
    // a round still going through bodies: wait for the rest of its kills (when a cam could come of it)
    const cool = now - this.lastAt < (mode === "always" ? CINE.alwaysCooldown : CINE.cooldown);
    const open = !this.cur && mode !== "off" && (kills.some(k => k.final) || (!blocked && mode !== "final" && !cool));
    if (open && flying && kills.some(k => PIERCING.has(k.weapon) && now - k.at < CINE.pierceWait && flying(k))) {
      this.waiting = kills;
      return null;
    }
    const got = this.cur || (blocked && !kills.some(k => k.final)) ? null : pickCine(kills, this.recent, mode, now - this.lastAt);
    this.recent.push(...kills);
    if (!got) return null;
    const last = got.kills[got.kills.length - 1];
    const grenade = got.kind === "grenade" || last.weapon === "grenade";
    const ride = !grenade && byShot(last);
    const from = grenade ? got.kills[0].from : last.from, to = grenade ? got.kills[0].to : last.to;
    const m = dist3(from, to);
    this.cur = { kind: got.kind, kills: got.kills, from, to, dist: m, ride, flight: ride ? flightFor(m) : CINE.push, t: 0, phase: "flight", final: got.kind === "final", tag: tagOf(got.kind, got.kills, dist3(last.from, last.to)) };
    if (got.kind !== "final") this.lastAt = now;
    return this.cur;
  }

  /** Real time on. Returns what changed: the impact (flight -> xray), the release (the fight goes on),
   *  the end of the snap back's flash. */
  step(dt: number): { impact: boolean; release: boolean; done: boolean } {
    const c = this.cur;
    const out = { impact: false, release: false, done: false };
    if (!c) return out;
    c.t += dt;
    if (c.phase === "flight" && c.t >= c.flight) { c.phase = "xray"; out.impact = true; this.land(c); }
    if (c.phase === "xray" && c.t >= c.flight + CINE.xray) { c.phase = "out"; out.release = true; }
    if (c.phase === "out" && c.t >= c.flight + CINE.xray + CINE.out) { this.cur = null; out.done = true; }
    return out;
  }

  /** Any key: the cam ends now. Returns whether one was holding the fight. */
  skip(): boolean {
    const c = this.cur;
    if (!c) return false;
    const held = c.phase !== "out";
    this.land(c);
    this.cur = null;
    return held;
  }

  private land(c: Cine): void {
    if (!c.final) return;
    this.flownFinal = true;
    for (const k of c.kills) this.landed.add(k.enemy);
  }

  /** The fight is held (the ride and the X-ray; the flash after it is not). */
  get holding(): boolean {
    return !!this.cur && this.cur.phase !== "out";
  }

  /** A victim stands until her bullet lands in the cam (and while her round flies on, the cam undecided). */
  holds(enemy: number): boolean {
    const c = this.cur;
    return (!!c && c.phase === "flight" && c.kills.some(k => k.enemy === enemy)) || this.waiting.some(k => k.enemy === enemy);
  }

  /** 0..1 through the cam (the letterbox's progress line). */
  get progress(): number {
    const c = this.cur;
    return c ? Math.min(1, c.t / (c.flight + CINE.xray)) : 0;
  }

  /** The bullet's distance along its line now (m). */
  bulletAt(c: Cine): number {
    const s0 = Math.min(CINE.start, c.dist * 0.3);
    return s0 + (c.dist - s0) * rideEase(c.t / c.flight);
  }
}

/** The one kill cam (the views read it like camView). */
export const cine = new CineCtl();

/** Whether a body stays up for a kill cam: a cam's ride still on its way to her, or the sim's own
 *  final-kill hold before a cam of the last kill has landed. */
export function heldByCam(e: { idx: number; deathHold: boolean }): boolean {
  return cine.holds(e.idx) || (e.deathHold && !cine.landed.has(e.idx));
}

/** What the kill cam reads of room 5's boss (sim/boss.ts). */
export type BossBeat = { started: boolean; phase: number; introT: number; coatT: number; lastStand: number };
/** Madame Pockit's big moments, when no kill cam may cut in: her entrance (introT), a phase change and
 *  the few seconds after it (door A's lamp, the coat coming off: coatT), the start of her last stand
 *  (the run for the bag, its own slow motion). `memo` keeps her last phase / last-stand step. */
export function bossBusy(b: BossBeat | null | undefined, now: number, memo: { phase: number; stand: number; at: number }): boolean {
  if (!b) return false;
  if (b.phase !== memo.phase || b.lastStand !== memo.stand) {
    if (memo.phase >= 0) memo.at = now;
    memo.phase = b.phase;
    memo.stand = b.lastStand;
  }
  return !b.started || b.introT > 0 || b.coatT > 0 || now - memo.at < CINE.bossBeat;
}

/** The car between stops (room 4's ride: its leg, its arrival, its doors closing): the shaft scrolls
 *  past a lens that rides out of the car, so no special-shot cam then. */
export function rideMoving(r: { phase: string } | null | undefined): boolean {
  return !!r && r.phase !== "open" && r.phase !== "opening";
}

/** The ride's lens at real time `t` of cam `c` (CameraView plays it, killcam.ts checks it along the
 *  whole path): 0.9 m behind the round (never closer than 2.4 m to where it hits), `side` / `lift` off
 *  its line, opening out to her side as it slows in, pushing in a little through the freeze. */
export function rideLens(c: Pick<Cine, "from" | "to" | "dist" | "flight">, t: number, side: number, lift: number, eye: V3, at: V3): void {
  const { from, to } = c;
  let dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const l = Math.hypot(dx, dy, dz) || 1;
  dx /= l; dy /= l; dz /= l;
  const hl = Math.hypot(dx, dz) || 1;
  const sx = dz / hl, sz = -dx / hl;
  const u = Math.min(1, t / c.flight);
  const s0 = Math.min(CINE.start, c.dist * 0.3);
  const sb = s0 + (c.dist - s0) * rideEase(u);
  const xk = t > c.flight ? Math.min(1, (t - c.flight) / CINE.xray) : 0;
  const endK = Math.max(0, Math.min(1, (rideEase(u) - 0.55) / 0.45));
  const along = Math.min(sb - 0.9, c.dist - 2.4) + xk * 0.35;
  const sd = side * (1 + 1.3 * endK), up = lift * (1 + 0.8 * endK);
  eye.x = from.x + dx * along + sx * sd; eye.y = from.y + dy * along + up; eye.z = from.z + dz * along + sz * sd;
  const bx = from.x + dx * sb, by = from.y + dy * sb, bz = from.z + dz * sb;
  at.x = bx + dx * 2 + (to.x - bx - dx * 2) * endK; at.y = by + dy * 2 + (to.y - by - dy * 2) * endK; at.z = bz + dz * 2 + (to.z - bz - dz * 2) * endK;
}
