// The simulation (spec section 7 "simulation boundary"): owns every piece of gameplay state and is
// deterministic for a given level, seed, difficulty and input log. One call to step() = one fixed
// 120 Hz step of real time; the world inside advances by DT x timeScale (bullet time = 0.3, the
// final-kill cam = 0.1), the player's movement and weapon clock by max(timeScale, 0.5), the aim is
// always real time. The React views only read this object (and drain `events`).
import { Graph } from "../ai/graph.ts";
import { alertGoon, onGoonDeath, setState } from "../ai/goon.ts";
import { stepEnemy } from "../ai/enemies.ts";
import { TACTICS, makeTactics, stepTactics, type Tactics } from "../ai/tactics.ts";
import { HB_HEAD, HB_MULT, HB_TORSO, aimPoint, makeCapsules } from "../combat/hitboxes.ts";
import { HIT_ACTOR, HIT_NONE, HIT_WORLD, makeTraceHit, trace, type HitActor, type TraceHit } from "../combat/trace.ts";
import { PICKUPS, PIERCE_K, SLOT_ORDER, SWAP_TIME, WEAPONS, ammoIn, makeWeapon, slotOf, startReload, stepWeapon, triggerWeapon, type BaseWeapon, type WeaponId } from "../combat/weapons.ts";
import type { LevelData, Marker } from "../world/level.ts";
import { makeEnemy, makePlayer, type Enemy, type EnemyKind, type EnemyWeapon, type Player } from "./actors.ts";
import { aimDir } from "./aim.ts";
import { Crowd } from "./crowd.ts";
import { Fnv1a, Rand, hash01 } from "./math.ts";
import { PM_COVER_IN, PM_COVER_OUT, PM_DIVE, PM_DUCK, PM_GETUP, PM_JUMP, PM_LAND, PM_POP, PM_PRONE, PM_VAULT, muzzleOf, pivotOf, stepPlayer } from "./player.ts";
import { COVER_MOVE, aiCovers, attachCover, coverOf, findTarget, leaveCover, tucked, type CoverSeg, type CoverTarget } from "./cover.ts";
import { AI, BREACH, CHECKPOINT_MIN_HEALTH, DIFFICULTY, DODGE, DT, ENEMY, ENEMY_ARMS, GRENADE, GUARD, HEAVY, HEAVY_SCALE, KILLCAM, MADAME, MAX_RANGE, MELEE, METER, PLAYER, PROJECTILE_SPEED, RUSHER, TIME, USE, type Difficulty } from "./tuning.ts";
import { PLAYER_ID, type GameEvent, type InputFrame, type V3 } from "./types.ts";
import { World, circleRectOverlap, type Box } from "./world.ts";
import { FRAG_STEP, fragLaunch, fragLegacy, fragSubstep, fuseOut, fuseTick, predictFrag, type FragLaunch, type FragPath } from "./frag.ts";
import { Ride } from "./ride.ts";
import { Boss } from "./boss.ts";
import { makeStage, type Stage } from "./stage.ts";
import { COUNTESS, SNIPER2, diffFor, killsFor, perDiff } from "./tuning2.ts";

/** A marker's minDiff leaves her out below that difficulty; RetardioPayne's harder cut has every one. */
const DIFF_RANK: Difficulty[] = ["easy", "normal", "hard", "hardcore", "retardio"];

export const POCKIT_COUNT = 3333;

export type Phase = "play" | "killcam" | "clear" | "done" | "dead";

export type Projectile = {
  id: number;
  team: 0 | 1;
  shooter: number;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  /** Distance left before it expires. */
  left: number;
  damage: number;
  alive: boolean;
  /** Where it was fired from (the final-kill cam replays from here). */
  sx: number;
  sy: number;
  sz: number;
  /** The shot event's weapon (the view draws pellets thinner). */
  weapon: string;
  /** Bodies it may still go through (the hand cannon, the sniper), and the actors it already went through. */
  pierce: number;
  skip: number[];
};

/** A live frag: world-time flight, bounces, the fuse. `landed` once it first touched something. */
/** by: -1 his, else the goon who threw it (ai/tactics.ts). */
export type Grenade = { id: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; fuse: number; landed: boolean; resting: boolean; bounces: number; by?: number;
  /** World time owed to its flight (sim/frag.ts steps it in FRAG_STEP sub-steps). */
  acc?: number };

export type KillCam = {
  /** Real seconds since it started. */
  t: number;
  dur: number;
  /** Bullet flight share of `dur` (0..1 of the real time). */
  flight: number;
  from: V3;
  to: V3;
  enemy: number;
  headshot: boolean;
  /** A bullet to chase (false: a melee or blast kill, the orbit only). */
  chase: boolean;
};

/** loadout: extra weapons owned from the start (tests, dev ?loadout=); the base gun is always owned.
 *  base: that base gun (slot 1, never runs dry): the dual pistols, or the AK for #250.
 *  resume: start from a checkpoint saved in an earlier attempt (Game.saved); carry: the guns from the last room. */
/** pockit: model numbers per enemy marker id (the page picks them: vrm/pockit.ts pickPockits); a goon
 *  without one gets a seeded random number. */
export type GameOptions = { seed?: number; difficulty?: Difficulty; ai?: boolean; loadout?: WeaponId[]; base?: BaseWeapon; resume?: Resume; katana?: boolean; grenades?: number; carry?: Carry; pockit?: Readonly<Record<string, number>> };

/** What he walks into the next room with (Game.carryOut at the last room's exit): the guns he picked up
 *  and their rounds, the one in hand, the frags, the banked 9 mm and his copium. A retry of that room starts
 *  with it again (the session keeps it in its options). */
export type Carry = { owned: WeaponId[]; weapon: WeaponId; ammo: Array<[WeaponId, number, number, number]>; grenades: number; banked: number; copium?: number };

/** The Pockit goons of a level (goons and rushers without a fixed model), in marker order; `later` =
 *  brought in by a spawn trigger (inactive at the start). */
export function goonSlots(level: LevelData): Array<{ id: string; later: boolean }> {
  const spawned = laterGroups(level);
  return level.markers
    .filter(m => m.kind === "enemy" && ((m.data.kind as string | undefined) ?? "goon") !== "heavy" && ["goon", "rusher"].includes((m.data.kind as string | undefined) ?? "goon") && typeof m.data.milady !== "number")
    .map(m => ({ id: m.id, later: typeof m.data.group === "string" && spawned.has(m.data.group) }));
}

/** Groups that wait unseen (inactive) until something brings them in: the ones a spawn trigger names,
 *  and (round 3) the room's `later` list, which the ride and the boss bring in themselves. */
export function laterGroups(level: LevelData): Set<string> {
  const out = new Set(level.markers.filter(m => m.kind === "trigger" && m.data.action === "spawn" && typeof m.data.group === "string").map(m => m.data.group as string));
  const later = level.room.later;
  if (Array.isArray(later)) for (const g of later) if (typeof g === "string") out.add(g);
  return out;
}

/** What a checkpoint keeps (room 3's, after the security office): where he stands, who is down, which
 *  doors are open, what was picked up and fired, his guns and ammo, health, copium and the stats so far.
 *  A retry after it rebuilds the room from the level and applies this (deterministic, like any start). */
export type Resume = {
  x: number; y: number; z: number; facing: number;
  dead: string[]; breached: string[]; taken: string[]; fired: string[];
  drops: Array<{ id: string; item: string; x: number; y: number; z: number }>;
  owned: WeaponId[]; weapon: WeaponId; ammo: Array<[WeaponId, number, number, number]>;
  health: number; copium: number; meter: number; stats: Stats;
  /** The arsenal and the secrets (optional: a checkpoint saved before them has none). */
  grenades?: number; banked?: number; found?: string[]; opened?: string[]; broken?: string[];
  /** Room 4: the ride's step (the stop the car is at). */
  ride?: number;
  /** Chapter 2: the room's set piece (Stage.save). */
  stage?: number[];
};

export type Stats = { kills: number; headshots: number; shots: number; hits: number; damageTaken: number; copiumUsed: number; time: number; btTime: number; dodges: number; secrets?: number; secretsTotal?: number };

/** wait: real seconds the player has stood in it (the breach door's fallback); prompted: its hint was given. */
type Trigger = Marker & { fired: boolean; wait: number; prompted: boolean };
/** pin: a Radbro Webring pin's Radbro id; secret: it lies inside a secret (the bot leaves it); behind: a
 *  secret door or breakable's node id it waits behind (not taken until that is out of the world). */
export type Pickup = { id: string; item: string; amount: number; x: number; y: number; z: number; taken: boolean; pin?: string; secret?: boolean; behind?: string };

export class Game {
  readonly level: LevelData;
  readonly world: World;
  readonly graph: Graph;
  readonly seed: number;
  readonly difficulty: Difficulty;
  readonly diff: (typeof DIFFICULTY)[Difficulty];
  /** The gang's sniper rifle in this room (chapter 2's has its own tell and damage per difficulty). */
  readonly sniperArms: { tell: number; damage: number; hit: number; range: number; interval: number; sight: number };
  readonly rng: Rand;
  readonly player: Player;
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly pickups: Pickup[] = [];
  readonly triggers: Trigger[] = [];
  readonly actors: HitActor[];
  readonly aiOn: boolean;
  /** The rave crowd (not in the fight, not in hash()). */
  readonly crowd: Crowd;
  /** World time of the first shot anyone fired in the room (-1 = none yet): the crowd scatters, the club's lights change. */
  firstShotAt = -1;
  /** One alert woke the whole room (room.alertAll). */
  private alarmed = false;
  /** Events since the views last drained them. */
  events: GameEvent[] = [];
  stepN = 0;
  /** World seconds. */
  time = 0;
  /** World time the next woken goon may come to (the wake stagger, see alertGoon). */
  wakeNext = 0;
  /** Real seconds. */
  realTime = 0;
  /** Doors taken out of the world (prefab node ids): the breach. */
  readonly breached: string[] = [];
  /** Real seconds of the breach's slow motion left. */
  breachSlow = 0;
  /** The last checkpoint this attempt reached (a retry resumes from it), and whether this attempt is one. */
  saved: Resume | null = null;
  readonly resumed: boolean;
  /** Meter the last shootdodge cost (a dive through the breach door gives it back). */
  private dodgeSpent = 0;
  timeScale = 1;
  /** The world speed of a free slow motion (the breach, the elevator's door beat, the boss's last stand). */
  slowScale: number = BREACH.slowScale;
  /** Round 3: room 4's ride and room 5's boss (null elsewhere). */
  readonly ride: Ride | null = null;
  readonly boss: Boss | null = null;
  /** Chapter 2: the room's set piece (sim/stage.ts; null elsewhere). */
  readonly stage: Stage | null = null;
  /** The music set over the room's own (room 4 after the cables snap); null = the room's. */
  music: string | null = null;
  bulletTime = false;
  meter: number = METER.start;
  phase: Phase = "play";
  phaseT = 0;
  killcam: KillCam | null = null;
  stats: Stats = { kills: 0, headshots: 0, shots: 0, hits: 0, damageTaken: 0, copiumUsed: 0, time: 0, btTime: 0, dodges: 0 };
  checkpoint: { x: number; y: number; z: number; facing: number };
  /** What the crosshair is on this step: enemy index or -1, and the aim point. */
  aimEnemy = -1;
  aimPoint: V3 = { x: 0, y: 0, z: 0 };
  /** Last hurt (real time) for the HUD flash. */
  hurtAt = -10;
  private nextProjectile = 1;
  private readonly th: TraceHit = makeTraceHit();
  private readonly th2: TraceHit = makeTraceHit();
  private readonly v: V3 = { x: 0, y: 0, z: 0 };
  private readonly v2: V3 = { x: 0, y: 0, z: 0 };
  private readonly v3: V3 = { x: 0, y: 0, z: 0 };
  private readonly scratchCaps = makeCapsules();
  private lastPlayerKill: { from: V3; to: V3; enemy: number; headshot: boolean; chase: boolean } | null = null;
  /** #4764: the katana (else the strike) and its guard. */
  readonly katana: boolean;
  /** World time until which a goon in front of his raised guard holds her fire (GUARD.hesitate). */
  guardHoldUntil = -1;
  /** World time of the last shotgun blast each shooter put on his guard (one charge per blast). */
  private readonly guardBlastAt = new Map<number, number>();
  private readonly vr: V3 = { x: 0, y: 0, z: 0 };
  /** Live grenades. */
  readonly grenadesLive: Grenade[] = [];
  private nextGrenade = 1;
  private readonly fragL: FragLaunch = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  /** Secret markers, the ones found (ids), secret doors opened and breakables broken (node ids). */
  readonly secrets: Marker[];
  readonly found: string[] = [];
  readonly opened: string[] = [];
  readonly broken: string[] = [];
  /** Hit points left per breakable node. */
  private readonly breakHp = new Map<string, number>();
  /** The room's cover, derived from its colliders (sim/cover.ts), and what a cover press would take now
   *  (the HUD marks it). */
  readonly cover: CoverSeg[];
  coverTarget: CoverTarget | null = null;
  /** The gang against his cover (ai/tactics.ts). */
  readonly tactics: Tactics = makeTactics();

  constructor(level: LevelData, opts: GameOptions = {}) {
    this.level = level;
    this.seed = (opts.seed ?? 1) >>> 0;
    this.difficulty = opts.difficulty ?? "normal";
    // (chapter 2's rooms take their own Normal: tuning2.ts CH2_DIFF)
    this.diff = diffFor(DIFFICULTY[this.difficulty], this.difficulty, level.room.chapter);
    this.sniperArms = level.room.chapter === 2
      ? { ...ENEMY_ARMS.sniper, tell: perDiff(SNIPER2.tell, this.difficulty), damage: perDiff(SNIPER2.damage, this.difficulty) }
      : ENEMY_ARMS.sniper;
    this.aiOn = opts.ai ?? true;
    this.katana = opts.katana ?? false;
    this.secrets = level.markers.filter(m => m.kind === "secret");
    this.rng = new Rand(this.seed ^ 0x5eed);
    this.world = new World(level.boxes);
    this.cover = coverOf(this.world);
    this.graph = new Graph(level.markers, this.world, typeof level.room.maxRise === "number" ? level.room.maxRise : Infinity);
    // the gang takes the same cover he does: the derived points join the hand-placed ones (none within a
    // metre of one), those with a way to them
    for (const c of aiCovers(this.cover)) {
      if (this.graph.covers.some(k => Math.hypot(k.x - c.x, k.z - c.z) < 1)) continue;
      if (this.graph.nearest(c.x, c.y, c.z) < 0) continue;
      this.graph.covers.push(c);
    }
    const spawn = level.markers.find(m => m.kind === "spawn");
    const sx = spawn?.x ?? 0, sz = spawn?.z ?? 0;
    const sy = this.world.groundBelow(sx, sz, PLAYER.radius, (spawn?.y ?? 0) + 1);
    this.player = makePlayer(sx, Number.isFinite(sy) ? sy : 0, sz, spawn?.yaw ?? 0, opts.base ?? "pistols");
    this.checkpoint = { x: sx, y: this.player.y, z: sz, facing: spawn?.yaw ?? 0 };
    let n = 0;
    const drops = (level.room.drops ?? {}) as Record<string, string>;
    // a group waits unseen (inactive) only when a spawn trigger brings it in; a group named by an alert
    // or a breach trigger only (the back rooms' storage and security office) is there from the start
    const spawned = laterGroups(level);
    for (const m of level.markers) {
      if (m.kind === "enemy") {
        const kindName = (m.data.kind as string | undefined) ?? "goon";
        if (kindName !== "goon" && kindName !== "rusher" && kindName !== "heavy" && kindName !== "madame" && kindName !== "countess") continue;
        // (chapter 2: Data {minDiff: "hard"}: she is there only on that difficulty and up)
        if (typeof m.data.minDiff === "string" && DIFF_RANK.indexOf(this.difficulty) < DIFF_RANK.indexOf(m.data.minDiff as Difficulty)) continue;
        const kind = kindName as EnemyKind;
        const pick = kind === "heavy" ? 0 : kind === "madame" ? MADAME.pockit : kind === "countess" ? COUNTESS.pockit : typeof m.data.milady === "number" ? (m.data.milady as number) : opts.pockit?.[m.id] ?? 1 + Math.floor(hash01(this.seed, n, 0x6d, 0) * POCKIT_COUNT);
        const gy = this.world.groundBelow(m.x, m.z, 0.3, m.y + 1);
        const hp = kind === "madame" ? MADAME.hp[this.difficulty] : kind === "countess" ? perDiff(COUNTESS.hp, this.difficulty) : Math.round(ENEMY[kind].hp * this.diff.hp);
        const e = makeEnemy(n, m.id, m.x, Number.isFinite(gy) ? gy : m.y, m.z, m.yaw, hp, pick, typeof m.data.group === "string" ? m.data.group : "", kind);
        if (e.group && !spawned.has(e.group)) e.state = "idle";
        e.perch = m.data.perch === true;
        e.deaf = m.data.deaf === true;
        e.hold = m.data.hold === true;
        // a marker's gun overrides the kind's (the sniper goon on the perch, the hand-cannon heavy)
        if ((m.data.weapon === "sniper" && kind === "goon") || (m.data.weapon === "handcannon" && kind === "heavy")) e.weapon = m.data.weapon as EnemyWeapon;
        if (e.weapon === "handcannon") e.shells = ENEMY_ARMS.handcannon.shells;
        if (kind === "heavy") e.model = m.data.model === "rival723" || (m.data.model === undefined && n % 2 === 1) ? "rival723" : "rival652";
        if (kind === "rusher") e.engageAt = RUSHER.engage[0] + (RUSHER.engage[1] - RUSHER.engage[0]) * hash01(this.seed, n, 0x72, 1);
        // the drop at the body: the marker's, else the room's per kind, else the gun in her hands
        e.drop = m.data.drop === false ? "" : typeof m.data.drop === "string" ? m.data.drop : drops[kind] ?? e.weapon;
        const patrol = m.data.patrol;
        if (Array.isArray(patrol)) e.patrol = patrol.map(id => this.graph.nodes.findIndex(w => w.id === id)).filter(i => i >= 0);
        this.enemies.push(e);
        n++;
      } else if (m.kind === "pickup") {
        const item = (m.data.item as string) ?? "copium";
        // the harder settings leave some of the room's cans out (the same ones every time: by id)
        if (item === "copium" && this.diff.keep < 1 && hashStr(m.id) >= this.diff.keep) continue;
        const base = typeof m.data.amount === "number" ? (m.data.amount as number) : item === "copium" ? 1 : PICKUPS[item]?.amount ?? 1;
        // copium scales with the difficulty; weapons and ammo do not
        const pk: Pickup = { id: m.id, item, amount: item === "copium" ? Math.max(1, Math.floor(base * this.diff.copium)) : base, x: m.x, y: m.y, z: m.z, taken: false };
        if (typeof m.data.pin === "string") pk.pin = m.data.pin;
        if (typeof m.data.behind === "string") pk.behind = m.data.behind;
        this.pickups.push(pk);
      } else if (m.kind === "trigger") this.triggers.push({ ...m, fired: false, wait: 0, prompted: false });
    }
    this.actors = [this.player.hit, ...this.enemies.map(e => e.hit)];
    for (const k of this.pickups) k.secret = this.secrets.some(sm => insideTrigger(sm, k.x, k.y + 0.3, k.z));
    for (const b of level.breakables) this.breakHp.set(b.node, b.hp);
    this.player.grenades = Math.min(GRENADE.carry, opts.grenades ?? 0);
    this.player.copium = this.diff.startCopium;
    this.stats.secrets = 0;
    this.stats.secretsTotal = this.secrets.length;
    for (const e of this.enemies) this.syncEnemyPose(e);
    // round 3: the elevator's ride (room.ride) and the penthouse boss (an enemy of kind "madame")
    if (level.room.ride && typeof level.room.ride === "object") this.ride = new Ride(this, level.room.ride as never);
    if (this.enemies.some(e => e.kind === "madame")) this.boss = new Boss(this);
    // chapter 2: the room's set piece (room.stage)
    this.stage = makeStage(this);
    this.crowd = new Crowd(level.markers, this.world, this.graph, { seed: this.seed, pockitCount: POCKIT_COUNT });
    for (const w of opts.loadout ?? []) this.giveWeapon(w);
    // a loadout starts with its last weapon in hand
    const last = opts.loadout?.[opts.loadout.length - 1];
    if (last && this.player.arsenal[last]) this.player.weapon = this.player.arsenal[last]!;
    if (opts.carry) this.applyCarry(opts.carry);
    this.resumed = !!opts.resume;
    if (opts.resume) this.applyResume(opts.resume);
    // First aim state so the camera and crosshair are valid before the first step.
    this.player.yaw = this.player.facing - Math.PI;
    this.updateAim();
  }

  /** The checkpoint as it stands now (the trigger's `at` checkpoint marker, else the trigger itself). */
  private snapshot(at: { x: number; y: number; z: number; yaw: number }): Resume {
    const p = this.player;
    return {
      x: at.x, y: at.y, z: at.z, facing: at.yaw,
      dead: this.enemies.filter(e => e.state === "dead").map(e => e.id),
      breached: [...this.breached],
      taken: this.pickups.filter(k => k.taken).map(k => k.id),
      fired: this.triggers.filter(t => t.fired).map(t => t.id),
      drops: this.pickups.filter(k => k.id.startsWith("drop-")).map(k => ({ id: k.id, item: k.item, x: k.x, y: k.y, z: k.z })),
      owned: [...p.owned], weapon: p.weapon.id,
      ammo: p.owned.map(w => { const a = p.arsenal[w]!; return [w, a.mags[0], a.mags[1], a.reserve] as [WeaponId, number, number, number]; }),
      health: p.health, copium: p.copium, meter: this.meter, stats: { ...this.stats },
      grenades: p.grenades, banked: p.banked, found: [...this.found], opened: [...this.opened], broken: [...this.broken],
      ...(this.ride ? { ride: this.ride.i } : {}),
      ...(this.stage?.save ? { stage: this.stage.save() } : {}),
    };
  }

  /** What he carries out of this room into the next (see Carry). */
  carryOut(): Carry {
    const p = this.player;
    return {
      owned: [...p.owned], weapon: p.weapon.id,
      ammo: p.owned.map(w => { const a = p.arsenal[w]!; return [w, a.mags[0], a.mags[1], a.reserve] as [WeaponId, number, number, number]; }),
      grenades: p.grenades, banked: p.banked, copium: p.copium,
    };
  }

  /** Start the room with what he carried out of the last one (no events). */
  private applyCarry(c: Carry): void {
    const p = this.player;
    for (const w of c.owned) if (w in WEAPONS) this.giveWeapon(w);
    for (const [w, m0, m1, res] of c.ammo) {
      const a = p.arsenal[w];
      // a base gun keeps its endless reserve
      if (a) { a.mags[0] = m0; a.mags[1] = m1; if (Number.isFinite(a.reserve)) a.reserve = res; }
    }
    if (p.arsenal[c.weapon]) p.weapon = p.arsenal[c.weapon]!;
    p.grenades = Math.min(GRENADE.carry, Math.max(p.grenades, c.grenades));
    p.banked = c.banked;
    // his copium comes with him (never fewer than the difficulty starts a room with)
    if (typeof c.copium === "number") p.copium = Math.min(PLAYER.maxCopium, Math.max(p.copium, c.copium));
  }

  /** Save a checkpoint at a checkpoint marker (by id; the room's ride saves one at each stop). */
  checkpointAt(id: string): void {
    const at = this.level.markers.find(m => m.kind === "checkpoint" && m.id === id);
    if (!at) return;
    this.checkpoint = { x: at.x, y: at.y, z: at.z, facing: at.yaw };
    this.saved = this.snapshot(at);
  }

  /** A free slow motion: world speed `scale` for `real` real seconds, no meter (the breach's mechanism). */
  slowFor(real: number, scale: number): void {
    this.breachSlow = real;
    this.slowScale = scale;
    this.timeScale = Math.min(this.timeScale, scale);
  }

  /** Rebuild the room as the checkpoint left it (no events: the views read the state). */
  private applyResume(r: Resume): void {
    const p = this.player;
    const gy = this.world.groundBelow(r.x, r.z, PLAYER.radius, r.y + 1);
    p.x = r.x; p.y = Number.isFinite(gy) ? gy : r.y; p.z = r.z; p.facing = r.facing;
    this.checkpoint = { x: p.x, y: p.y, z: p.z, facing: r.facing };
    for (const id of r.breached) if (this.world.setEnabled(id, false)) this.breached.push(id);
    for (const d of r.drops) this.pickups.push({ ...d, amount: PICKUPS[d.item]?.amount ?? 1, taken: false });
    for (const id of r.opened ?? []) if (this.world.setEnabled(id, false)) this.opened.push(id);
    for (const id of r.broken ?? []) if (this.world.setEnabled(id, false)) { this.broken.push(id); this.breakHp.set(id, 0); }
    for (const id of r.found ?? []) if (!this.found.includes(id)) this.found.push(id);
    p.grenades = r.grenades ?? p.grenades;
    p.banked = r.banked ?? 0;
    for (const k of this.pickups) if (r.taken.includes(k.id)) k.taken = true;
    for (const e of this.enemies) {
      if (!r.dead.includes(e.id)) continue;
      setState(e, "dead");
      e.hit.hittable = false;
      e.deadT = 30;
      this.syncEnemyPose(e);
    }
    for (const t of this.triggers) {
      if (!r.fired.includes(t.id)) continue;
      t.fired = true;
      t.prompted = true;
      // the groups those triggers woke are awake again (the living ones)
      if (t.data.action === "spawn") for (const e of this.enemies) if (e.state === "inactive" && e.group === t.data.group) { setState(e, "idle"); e.hit.hittable = true; }
      if (t.data.action === "breach") for (const e of this.enemies) if (e.group === t.data.group) e.deaf = false;
    }
    for (const w of r.owned) this.giveWeapon(w);
    for (const [w, m0, m1, res] of r.ammo) { const a = p.arsenal[w]; if (a) { a.mags[0] = m0; a.mags[1] = m1; a.reserve = res; } }
    if (p.arsenal[r.weapon]) p.weapon = p.arsenal[r.weapon]!;
    p.health = Math.max(r.health, Math.min(CHECKPOINT_MIN_HEALTH, this.diff.checkpoint));
    p.copium = r.copium;
    this.meter = Math.max(r.meter, METER.start * 0.5);
    this.stats = { ...r.stats, secrets: this.found.length, secretsTotal: this.secrets.length };
    if (this.ride && typeof r.ride === "number") this.ride.resumeAt(r.ride);
    if (this.stage?.load && r.stage) this.stage.load(this, r.stage);
    this.saved = r;
  }

  emit(e: GameEvent): void {
    this.events.push(e);
  }

  /** Hand the queued events to a view (and clear them). */
  drain(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  get alive(): number {
    let n = 0;
    for (const e of this.enemies) if (e.state !== "dead" && !e.fled) n++;
    return n;
  }

  // ---- the step -------------------------------------------------------------------------------

  step(inp: InputFrame): void {
    const p = this.player;
    this.stepN++;
    this.realTime += DT;
    this.phaseT += DT;

    // time scale target
    if (this.phase === "killcam") this.stepKillcam(inp);
    if (inp.bt && this.phase === "play" && p.mode !== "dead") {
      if (this.bulletTime) this.setBulletTime(false);
      else if (this.meter >= METER.minToStart) this.setBulletTime(true);
      else this.emit({ type: "btRefused" }); // the HUD flashes the hourglass
    }
    if (this.bulletTime) {
      this.meter -= DT * this.diff.btDrain;
      this.stats.btTime += DT;
      if (this.meter <= 0) { this.meter = 0; this.setBulletTime(false); }
    }
    const diving = p.mode === "dive";
    if (this.breachSlow > 0) this.breachSlow = Math.max(0, this.breachSlow - DT);
    const target = this.phase === "killcam" ? TIME.killCam : this.breachSlow > 0 ? this.slowScale : this.bulletTime || diving ? TIME.bulletTime : 1;
    this.timeScale += (target - this.timeScale) * Math.min(1, TIME.ease * DT);
    if (Math.abs(this.timeScale - target) < 1e-4) this.timeScale = target;
    const ts = this.timeScale;
    const wdt = DT * ts;
    const pdt = DT * Math.max(ts, TIME.playerInBulletTime);
    this.time += wdt;
    if (this.phase === "play" || this.phase === "clear") this.stats.time += DT;

    // player
    const inControl = this.phase === "play" || this.phase === "clear";
    const pin = inControl ? inp : FROZEN_INPUT(inp, p);
    if (inControl && p.mode !== "dead") {
      if (inp.slot > 0) { if (p.nadeUp) this.lowerFrag(true); this.switchWeapon(inp.slot); }
      // (not with his frag held up: the left hand is busy; an empty gun reloads once it has gone)
      if (inp.reload && p.meleeT <= 0 && !p.guard && !p.nadeUp && startReload(p.weapon)) this.emit({ type: "reload", hand: 0 });
      if (inp.copium) this.useCopium();
      if (inp.cover && p.mode === "normal") this.pressCover();
      if (inp.dodge && p.mode === "normal" && p.dodgeCooldown <= 0) {
        const before = this.meter;
        if (this.meter > 0) this.meter = Math.max(0, this.meter - METER.dodgeCost);
        this.dodgeSpent = before - this.meter;
        this.stats.dodges++;
      }
    }
    // the scope: held with the sniper up, standing, not reloading; a swap, a reload, a dive or a fall
    // drops it until the button is let go
    if (!pin.zoom) p.zoomBlock = false;
    if (p.zoom && (p.weapon.reloadT > 0 || p.mode !== "normal" || p.weapon.id !== "sniper")) p.zoomBlock = true;
    const zoom = inControl && !!pin.zoom && !p.zoomBlock && p.weapon.id === "sniper" && p.mode === "normal" && p.weapon.reloadT <= 0 && p.meleeT <= 0 && !p.guard && !p.nadeUp;
    if (zoom !== p.zoom) { p.zoom = zoom; this.emit({ type: "zoom", on: zoom }); }
    const pm = stepPlayer(this.world, p, pin, DT, pdt, this.cover);
    if (pm & (PM_COVER_IN | PM_COVER_OUT | PM_POP | PM_DUCK | PM_VAULT)) {
      const high = p.cover >= 0 && !!this.cover[p.cover]?.high;
      if (pm & PM_COVER_OUT) this.emit({ type: "cover", what: "out", high: false });
      if (pm & PM_VAULT) this.emit({ type: "cover", what: "vault", high: false });
      if (pm & PM_COVER_IN) this.emit({ type: "cover", what: "in", high });
      if (pm & PM_POP) this.emit({ type: "cover", what: "pop", high });
      if (pm & PM_DUCK) this.emit({ type: "cover", what: "duck", high });
    }
    if (pm & PM_DIVE) this.emit({ type: "dodge" });
    if (pm & PM_JUMP) this.emit({ type: "jump" });
    if (pm & PM_LAND) this.emit({ type: "land", prone: (pm & PM_PRONE) !== 0 });
    if (pm & PM_GETUP) this.emit({ type: "getup" });
    if (p.y < -30) this.hurtPlayer(1000, -1);
    // a dive into a breach door (inside its trigger) takes the door out before he hits it
    if (inControl && p.mode === "dive") this.tryBreach();

    // copium over time (player clock)
    if (p.healLeft > 0 && p.mode !== "dead") {
      const add = Math.min(p.healLeft, (this.diff.heal / PLAYER.copiumTime) * pdt);
      p.healLeft -= add;
      p.health = Math.min(PLAYER.maxHealth, p.health + add);
    }

    // aim + weapon; E, the melee and the throw go where he aims this step
    this.updateAim();
    // the cover a press would take next (the HUD marks it)
    this.coverTarget = inControl && p.mode === "normal" && p.dashSeg < 0 && p.grounded ? findTarget(this.world, this.cover, p) : null;
    if (inControl && p.mode !== "dead") {
      if (inp.interact) this.interact();
      // #4764's melee button is the guard while held (stepGuard: a tap cuts on the release); a press that
      // came and went between two steps cuts now, like everyone else's strike
      if (inp.melee && !(this.katana && inp.guard)) this.startMelee();
      this.stepFrag(inp);
    } else if (p.nadeUp) this.lowerFrag(false);
    if (this.katana) this.stepGuard(inp, inControl, pdt);
    const w = p.weapon;
    if (stepWeapon(w, pdt)) this.emit({ type: "reloaded" });
    // the melee (his clock): the hit resolves at the wind-up
    if (p.throwT > 0) p.throwT = Math.max(0, p.throwT - pdt);
    if (p.meleeT > 0) {
      const M = this.katana ? MELEE.katana : MELEE.strike;
      p.meleeT = Math.max(0, p.meleeT - pdt);
      if (!p.meleeDone && M.time - p.meleeT >= MELEE.windup) { p.meleeDone = true; if (p.mode !== "dead") this.resolveMelee(); }
    }
    const canFire = inControl && p.mode !== "dead" && p.mode !== "getup" && p.meleeT <= 0 && !p.guard;
    // (his frag held up: a pair fires from the right hand alone)
    const hand = triggerWeapon(w, canFire && inp.fire, p.nadeUp);
    if (hand >= 0) this.firePlayer(hand);
    else if (canFire && inp.fire && !w.wasDown && w.reloadT > 0) this.emit({ type: "dryfire" });

    // enemies (the gang's tactics against his cover first)
    if (this.aiOn && this.phase === "play") stepTactics(this, wdt);
    if (this.aiOn) for (const e of this.enemies) if (e.state !== "dead" && e.state !== "inactive") stepEnemy(this, e, wdt);
    for (const e of this.enemies) this.moveEnemy(e, wdt);
    // one alert wakes the whole room (the club: the DJ calls it)
    if (this.level.room.alertAll && !this.alarmed && this.enemies.some(e => e.state !== "idle" && e.state !== "inactive")) {
      this.alarmed = true;
      for (const e of this.enemies) alertGoon(this, e, 0.3);
    }
    this.crowd.step(wdt);

    // grenades (world time) and the girls running from them
    this.stepGrenades(wdt);

    // projectiles
    this.stepProjectiles(wdt);
    // round 3: the ride (stops, doors, the roof heavy, the cables) and the boss's room (phases, grenades,
    // the add doors, the chandelier)
    this.ride?.step(this, wdt);
    this.boss?.step(this, wdt);
    this.stage?.step(this, wdt);

    // pickups + triggers
    if (inControl && p.mode !== "dead") {
      for (const k of this.pickups) {
        if (k.taken || (k.behind && !this.world.off.has(k.behind))) continue;
        const dx = k.x - p.x, dz = k.z - p.z, dy = k.y - p.y;
        if (dx * dx + dz * dz > PLAYER.pickupRadius ** 2 || dy > 2 || dy < -1) continue;
        if (k.item === "copium") {
          if (p.copium >= PLAYER.maxCopium) continue;
          const got = Math.min(k.amount, PLAYER.maxCopium - p.copium);
          p.copium += got;
          k.taken = true;
          this.emit({ type: "pickup", item: k.item, amount: got, id: k.id });
        } else if (k.item === "pin") {
          k.taken = true;
          this.emit({ type: "pickup", item: "pin", amount: 1, id: k.id, ...(k.pin ? { pin: k.pin } : {}) });
        } else if (PICKUPS[k.item]) {
          const got = this.takeWeaponPickup(k.item, k.amount);
          if (got < 0) continue; // full: leave it lying there
          k.taken = true;
          // the event names what it gave: the weapon ("shotgun"), ammo for it ("shotgun_ammo"), grenades
          const d = PICKUPS[k.item];
          this.emit({ type: "pickup", item: d.grenades ? "grenade" : this.lastPickupWeapon && d.weapon ? d.weapon : `${d.ammo}_ammo`, amount: got, id: k.id });
        }
      }
      // secrets: found the first time he steps into one
      for (const sm of this.secrets) if (sm.data.via !== "break" && !this.found.includes(sm.id) && insideTrigger(sm, p.x, p.y + 0.9, p.z)) this.findSecret(sm.id);
      for (const t of this.triggers) {
        if (t.fired && t.data.once !== false) continue;
        // conditional triggers fire on their condition only; the breach door has its own rules
        if (t.data.afterKills !== undefined || typeof t.data.whenClear === "string") continue;
        if (!insideTrigger(t, p.x, p.y + 0.9, p.z)) continue;
        if (t.data.action === "breach") { this.standAtDoor(t); continue; }
        this.fireTrigger(t);
      }
    }

    // conditional triggers, wherever the player is: {afterKills: N} once N hostiles are down (N may be
    // per difficulty: tuning2.ts killsFor), {whenClear: group} once every hostile of that group is down
    for (const t of this.triggers) {
      if (t.fired || this.phase !== "play") continue;
      const after = killsFor(t.data.afterKills, this.difficulty), clear = t.data.whenClear;
      if (after !== undefined) {
        let down = 0;
        for (const e of this.enemies) if (e.state === "dead") down++;
        if (down >= after) this.fireTrigger(t);
      } else if (typeof clear === "string") {
        let n = 0, down = 0;
        for (const e of this.enemies) if (e.group === clear) { n++; if (e.state === "dead") down++; }
        if (n > 0 && down === n) this.fireTrigger(t);
      }
    }

    // phases
    if (this.phase === "play" && p.mode === "dead" && p.modeT > 1.6) this.setPhase("dead");
    if (this.phase === "clear" && !this.triggers.some(t => t.data.action === "exit") && this.phaseT > 2.5) this.setPhase("done");
  }

  private setPhase(ph: Phase): void {
    this.phase = ph;
    this.phaseT = 0;
  }

  setBulletTime(on: boolean): void {
    if (on === this.bulletTime) return;
    this.bulletTime = on;
    this.emit({ type: "bt", on });
  }

  /** Slot 1..3 (1 = the base gun), or 8 / 9 = previous / next owned weapon (wheel, bumper). */
  private switchWeapon(slot: number): void {
    const p = this.player;
    const owned = SLOT_ORDER.filter(w => p.owned.includes(w));
    let id: WeaponId | undefined;
    if (slot >= 8) {
      const i = owned.indexOf(p.weapon.id);
      id = owned[(i + (slot === 9 ? 1 : owned.length - 1)) % owned.length];
    } else {
      // a key is a category: the one used last in it, a second press the next one in it
      const cat = owned.filter(w => slotOf(w) === slot);
      if (!cat.length) return;
      const last = p.lastInSlot[slot];
      id = slotOf(p.weapon.id) === slot ? cat[(cat.indexOf(p.weapon.id) + 1) % cat.length] : last && cat.includes(last) ? last : cat[0];
    }
    if (!id || p.weapon.id === id) return;
    p.lastInSlot[slotOf(id)] = id;
    if (p.zoom) p.zoomBlock = true;
    const w = p.arsenal[id] ?? (p.arsenal[id] = makeWeapon(id));
    // the clock resets: a reload in progress is dropped, the new gun comes up after SWAP_TIME
    p.weapon.reloadT = 0;
    p.weapon.wasDown = true;
    w.reloadT = 0;
    w.cooldown = Math.max(w.cooldown, SWAP_TIME);
    w.wasDown = true; // a held trigger does not fire the new gun until it is pressed again
    p.weapon = w;
    this.emit({ type: "swap", weapon: id });
  }

  /** Own a weapon (a full magazine + its reserve, or `first` rounds in reserve); false when already
   *  owned. The SMGs take the banked 9 mm. */
  giveWeapon(id: WeaponId, first?: number): boolean {
    const p = this.player;
    if (p.owned.includes(id)) return false;
    p.owned.push(id);
    p.owned.sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b));
    const w = (p.arsenal[id] = makeWeapon(id));
    if (first !== undefined) w.reserve = first;
    if (id === "smgs" && p.banked > 0) { w.reserve = Math.min(WEAPONS.smgs.reserveMax, w.reserve + p.banked); p.banked = 0; }
    return true;
  }

  /** Whether walking over this item would take it (the bot leaves the rest). */
  canTake(item: string): boolean {
    const p = this.player;
    if (item === "copium") return p.copium < PLAYER.maxCopium;
    if (item === "pin") return true;
    const d = PICKUPS[item];
    if (!d) return false;
    if (d.grenades) return p.grenades < GRENADE.carry;
    if (d.ammo === "rifle" && p.owned.includes("ak")) return false;
    if (d.weapon && !p.owned.includes(d.weapon)) return true;
    const w = p.arsenal[d.ammo];
    if (!w) return !!d.bank && p.banked < WEAPONS[d.ammo].reserveMax;
    return w.reserve < WEAPONS[d.ammo].reserveMax;
  }

  /** A weapon / ammo pickup: the weapon the first time, then ammo into its reserve. Returns the rounds
   *  added (the weapon's reserve the first time), or -1 when there is no room for it. */
  private lastPickupWeapon = false;
  private takeWeaponPickup(item: string, amount: number): number {
    const d = PICKUPS[item];
    const p = this.player;
    this.lastPickupWeapon = false;
    if (d.grenades) {
      const room = GRENADE.carry - p.grenades;
      if (room <= 0) return -1;
      const got = Math.min(room, amount);
      p.grenades += got;
      return got;
    }
    // #250 carries his own AK: a rifle stays where it lies
    if (d.ammo === "rifle" && p.owned.includes("ak")) return -1;
    if (d.weapon && this.giveWeapon(d.weapon, d.first)) { this.lastPickupWeapon = true; return p.arsenal[d.weapon]!.reserve; }
    const w = p.arsenal[d.ammo];
    if (!w) {
      // the gang's 9 mm is banked for the SMGs; other ammo waits for its gun
      if (!d.bank) return -1;
      const room = WEAPONS[d.ammo].reserveMax - p.banked;
      if (room <= 0) return -1;
      const got = Math.min(room, amount);
      p.banked += got;
      return got;
    }
    const room = WEAPONS[d.ammo].reserveMax - w.reserve;
    if (room <= 0) return -1;
    const got = Math.min(room, d.weapon ? d.amount : amount);
    w.reserve += got;
    return got;
  }

  private useCopium(): void {
    const p = this.player;
    if (p.copium <= 0 || p.health >= PLAYER.maxHealth || p.healLeft > 0) return;
    p.copium--;
    p.healLeft = this.diff.heal;
    this.stats.copiumUsed++;
    this.emit({ type: "copium" });
  }

  /** C / LB: out of cover, take the marked cover (at once when it is right here, else a run to it); in
   *  cover, the dash to the marked spot, or out of it when nothing is marked; running to one, stop. */
  private pressCover(): void {
    const p = this.player;
    if (p.dashSeg >= 0) { leaveCover(p); this.emit({ type: "cover", what: "out", high: false }); return; }
    const t = this.coverTarget;
    if (!t) {
      if (p.cover >= 0) { leaveCover(p); this.emit({ type: "cover", what: "out", high: false }); }
      return;
    }
    const s = this.cover[t.seg];
    if (p.cover >= 0) leaveCover(p);
    if (!t.dash) {
      attachCover(s, p, t.u);
      p.vx = p.vz = 0;
      this.emit({ type: "cover", what: "in", high: s.high });
      return;
    }
    p.dashSeg = t.seg;
    p.dashU = t.u;
    p.dashT = 0;
    this.emit({ type: "cover", what: "dash", high: s.high });
  }

  /** How high the gang looks for him (LOS): the shoulder pivot, or his tucked head behind low cover. */
  private losUp(): number {
    const p = this.player;
    if (p.cover >= 0) {
      const s = this.cover[p.cover];
      if (s && tucked(s, p)) return 0.8;
    }
    return p.pivotUp;
  }

  private fireTrigger(t: Trigger): void {
    t.fired = true;
    const action = String(t.data.action ?? "alert");
    const group = typeof t.data.group === "string" ? t.data.group : undefined;
    this.emit({ type: "trigger", id: t.id, action, group });
    if (action === "alert") {
      for (const e of this.enemies) if (!group || e.group === group) alertGoon(this, e, 0.2 * this.rng.next());
    } else if (action === "spawn") {
      for (const e of this.enemies) if (e.state === "inactive" && (!group || e.group === group)) {
        setState(e, "idle");
        e.hit.hittable = true;
        alertGoon(this, e, 0.3 + 0.4 * this.rng.next());
      }
    } else if (action === "checkpoint") {
      const at = typeof t.data.at === "string" ? this.level.markers.find(m => m.kind === "checkpoint" && m.id === t.data.at) ?? t : t;
      this.checkpoint = { x: at.x, y: at.y, z: at.z, facing: at.yaw };
      this.saved = this.snapshot(at);
    } else if (action === "exit") {
      if (this.phase === "clear") { this.setPhase("done"); this.emit({ type: "exit" }); }
      else t.fired = false; // not yet: try again once the room is clear
    }
  }

  // ---- melee, grenades, secrets (arsenal spec 3.2, 4) -------------------------------------------

  /** F: the katana's draw-cut (#4764) or the strike; the guns wait for it (his clock). */
  private startMelee(): void {
    const p = this.player;
    if (p.meleeT > 0 || p.mode !== "normal") return;
    if (p.guard) this.lowerGuard();
    const M = this.katana ? MELEE.katana : MELEE.strike;
    p.meleeT = M.time;
    p.meleeDone = false;
    p.weapon.reloadT = 0;
    this.emit({ type: "melee", kind: this.katana ? "katana" : "strike", phase: "start", hits: 0 });
  }

  /** The melee lands: at most MELEE.max hostiles whose torso is in reach and inside the arc around the
   *  aim, nearest first, with a clear line; no headshots; a strike flinches and shoves; breakables too. */
  private resolveMelee(): void {
    const p = this.player;
    const M = this.katana ? MELEE.katana : MELEE.strike;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), cosArc = Math.cos(M.arc);
    const px = p.x, py = p.y + 1.1, pz = p.z;
    const cands: Array<{ e: Enemy; d: number; x: number; y: number; z: number }> = [];
    for (const e of this.enemies) {
      if (e.state === "dead" || e.state === "inactive" || !e.hit.hittable) continue;
      if (!aimPoint(e.hit.body, e.hit.pose, HB_TORSO, this.v, this.scratchCaps)) continue;
      const dx = this.v.x - px, dz = this.v.z - pz, d = Math.hypot(dx, dz);
      if (d > M.reach || Math.abs(this.v.y - py) > 1.2) continue;
      if (d > 0.3 && (dx * fx + dz * fz) / d < cosArc) continue;
      if (!this.world.clear(px, py, pz, this.v.x, this.v.y, this.v.z, true)) continue;
      cands.push({ e, d, x: this.v.x, y: this.v.y, z: this.v.z });
    }
    cands.sort((a, b) => a.d - b.d || a.e.idx - b.e.idx);
    let hits = 0;
    for (const c of cands.slice(0, MELEE.max)) {
      const e = c.e;
      const dx = c.x - px, dz = c.z - pz, dl = Math.hypot(dx, dz) || 1;
      hits++;
      const dmg = this.bossShare(e, M.damage);
      e.hp -= dmg;
      e.flinch = Math.max(e.flinch, M.flinch);
      if (e.weapon === "sniper" && e.kind !== "countess") e.tell = 0;
      if (M.knock > 0 && e.kind !== "heavy" && e.kind !== "madame" && e.kind !== "countess" && !e.perch) { e.knockT = MELEE.knockTime; e.knockX = (dx / dl) * M.knock; e.knockZ = (dz / dl) * M.knock; }
      this.emit({ type: "blood", x: c.x, y: c.y, z: c.z, dx: dx / dl, dy: 0, dz: dz / dl, target: e.idx, part: HB_TORSO, ...(this.katana ? { ink: true } : {}) });
      this.emit({ type: "hurt", target: e.idx, amount: dmg, part: HB_TORSO, hp: Math.max(0, e.hp) });
      if (e.state === "idle") alertGoon(this, e, 0);
      if (e.kind === "heavy" && e.hp > 0 && M.damage >= HEAVY.staggerAt && e.stagger <= 0) {
        e.stagger = HEAVY.stagger;
        e.tell = 0;
        this.emit({ type: "stagger", enemy: e.idx });
      }
      if (e.hp <= 0) this.killEnemy(e, false, dx, dz, { ox: px, oy: py, oz: pz, x: c.x, y: c.y, z: c.z }, false, false, "melee");
    }
    // a breakable within reach in front of him takes the blow too
    for (const b of this.level.breakables) {
      if ((this.breakHp.get(b.node) ?? 0) <= 0) continue;
      const box = this.level.boxes.find(x => x.node === b.node);
      if (!box || boxDist(box, px, pz) > M.reach * 0.8 || py < box.bottom - 0.5 || py > box.top + 0.8) continue;
      const dx = box.cx - px, dz = box.cz - pz, d = Math.hypot(dx, dz) || 1;
      if ((dx * fx + dz * fz) / d < 0.2) continue;
      this.damageBreakable(b.node, M.damage);
    }
    this.emit({ type: "melee", kind: this.katana ? "katana" : "strike", phase: "hit", hits });
  }

  // ---- #4764's guard ---------------------------------------------------------------------------

  /** The melee button held: the guard goes up at the press (or as soon as it can while the button stays
   *  down: after a cut, a landing, a break); let go within GUARD.tap of the press and it was a tap: the
   *  cut. The meter drains while it is up and refills once it has been down a moment. */
  private stepGuard(inp: InputFrame, inControl: boolean, pdt: number): void {
    const p = this.player;
    const held = inControl && p.mode !== "dead" && !!inp.guard;
    if (held && !p.guardHeld) p.guardPress = 0;
    else if (held) p.guardPress += DT;
    if (!held && p.guardHeld) {
      const tap = p.guardPress >= 0 && p.guardPress < GUARD.tap;
      if (p.guard) this.lowerGuard();
      p.guardPress = -1;
      if (tap && inControl && p.mode !== "dead") this.startMelee();
    }
    p.guardHeld = held;
    if (p.guardBroken > 0) p.guardBroken = Math.max(0, p.guardBroken - pdt);
    if (p.guard && (p.mode !== "normal" || !held)) this.lowerGuard();
    if (held && !p.guard && p.mode === "normal" && p.meleeT <= 0 && p.guardBroken <= 0 && p.guardMeter >= (p.guardLock ? GUARD.minRaise : 1)) this.raiseGuard();
    // the gang in front of him doubts it once it is a guard (past a tap): a beat before the next round
    if (p.guard && p.guardPress >= GUARD.tap && (p.guardPress - DT < GUARD.tap || p.guardT === 0)) this.guardHoldUntil = this.time + GUARD.hesitate;
    if (p.guard) {
      p.guardT += pdt;
      p.guardMeter -= GUARD.hold * pdt;
      if (p.guardMeter <= 0) this.breakGuard();
    } else {
      p.guardIdle += pdt;
      if (p.guardIdle >= GUARD.refillDelay) p.guardMeter = Math.min(GUARD.max, p.guardMeter + GUARD.refill * pdt);
      if (p.guardLock && p.guardMeter >= GUARD.minRaise) p.guardLock = false;
    }
  }

  private raiseGuard(): void {
    const p = this.player;
    p.guard = true;
    p.guardT = 0;
    p.parryOk = p.guardIdle >= GUARD.reParry;
    p.weapon.reloadT = 0;
    if (p.zoom) { p.zoom = false; p.zoomBlock = true; this.emit({ type: "zoom", on: false }); }
    this.emit({ type: "guard", what: "up" });
  }

  private lowerGuard(): void {
    const p = this.player;
    if (!p.guard) return;
    p.guard = false;
    p.guardIdle = 0;
    this.emit({ type: "guard", what: "down" });
  }

  /** The meter ran out: the blade is knocked aside, no guard for GUARD.broken and until the meter is
   *  back to GUARD.minRaise. */
  private breakGuard(): void {
    const p = this.player;
    p.guardMeter = 0;
    p.guard = false;
    p.guardIdle = 0;
    p.guardBroken = GUARD.broken;
    p.guardLock = true;
    this.emit({ type: "guard", what: "break" });
  }

  /** Whether a point is inside his guard's front arc (the gang reads it: who holds fire, who flanks). */
  inGuardArc(x: number, z: number): boolean {
    const p = this.player;
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    return d < 1e-3 || (dx * -Math.sin(p.yaw) + dz * -Math.cos(p.yaw)) / d >= GUARD.arcCos;
  }

  /** A goon facing his raised guard holds her fire for a beat after it goes up. */
  guardHolds(e: Enemy): boolean {
    return this.player.guard && this.time < this.guardHoldUntil && this.inGuardArc(e.x, e.z);
  }

  /** A round (hitscan or a projectile) reaches him along (dx, dy, dz): with the guard up and the round
   *  from the front arc it meets the blade (no damage). The meter pays (a perfect parry does not; a
   *  shotgun blast pays once and shoves him back); in bullet time the round goes back as his own, at the
   *  one under the crosshair, else at the shooter; outside it the round glances off, harmless. */
  private deflect(x: number, y: number, z: number, dx: number, dy: number, dz: number, shooter: number, weapon: string): void {
    const p = this.player;
    const hl = Math.hypot(dx, dz) || 1;
    const blast = weapon === "shotgun";
    let first = true;
    if (blast) {
      const at = this.guardBlastAt.get(shooter);
      first = at === undefined || this.time - at > 0.12;
      if (first) this.guardBlastAt.set(shooter, this.time);
    }
    const perfect = p.parryOk && p.guardT <= GUARD.parry;
    if (first) {
      if (!perfect) p.guardMeter -= blast ? GUARD.blast : GUARD.deflect;
      if (blast) {
        p.shoveT = GUARD.shoveTime;
        p.shoveX = (dx / hl) * GUARD.shove;
        p.shoveZ = (dz / hl) * GUARD.shove;
        p.vx = p.shoveX;
        p.vz = p.shoveZ;
      }
    }
    // bullet time: back at the one under the crosshair, else at the shooter (one round per blast)
    let target = -1;
    const r = this.vr;
    if (this.bulletTime && first) {
      const a = this.aimEnemy >= 0 ? this.enemies[this.aimEnemy] : undefined;
      const e = shooter >= 0 ? this.enemies[shooter] : undefined;
      if (a && a.state !== "dead" && a.hit.hittable) { target = a.idx; r.x = this.aimPoint.x; r.y = this.aimPoint.y; r.z = this.aimPoint.z; }
      else if (e && e.state !== "dead" && e.hit.hittable && aimPoint(e.hit.body, e.hit.pose, HB_TORSO, r, this.scratchCaps)) target = e.idx;
    }
    let rx: number, ry: number, rz: number;
    const id = this.nextProjectile++;
    if (target >= 0) {
      rx = r.x - x; ry = r.y - y; rz = r.z - z;
      const l = Math.hypot(rx, ry, rz) || 1;
      rx /= l; ry /= l; rz /= l;
      this.projectiles.push({ id, team: 0, shooter: PLAYER_ID, x, y, z, dx: rx, dy: ry, dz: rz, left: MAX_RANGE, damage: GUARD.returnDamage, alive: true, sx: x, sy: y, sz: z, weapon: "returned", pierce: 0, skip: [] });
    } else {
      // off the blade: back the way it came, thrown wide and up (seeded per step and round: no rng draw)
      const u = hash01(this.seed, this.stepN, id, 0x64), v = hash01(this.seed, this.stepN, id, 0x65);
      const side = (u - 0.5) * 2.4;
      rx = -dx + (-dz / hl) * side; ry = 0.35 + v * 0.9; rz = -dz + (dx / hl) * side;
      const l = Math.hypot(rx, ry, rz) || 1;
      rx /= l; ry /= l; rz /= l;
    }
    this.emit({ type: "deflect", x, y, z, dx, dy, dz, rx, ry, rz, perfect, returned: target >= 0, blast, first, shooter, target, id });
    if (p.guardMeter <= 0) this.breakGuard();
  }

  /** His guard is up and a round travelling along (dx, dz) comes from its front arc. */
  private guardFront(dx: number, dz: number): boolean {
    const p = this.player;
    if (!this.katana || !p.guard || p.mode !== "normal") return false;
    const hl = Math.hypot(dx, dz);
    return hl > 1e-6 && (dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) / hl >= GUARD.arcCos;
  }

  /** Where a round o + t d (t <= maxT) crosses his raised blade: a disc GUARD.disc.r across, GUARD.disc.at
   *  in front of his chest, facing the aim (rounds from the front arc only); -1 when it does not. Near
   *  misses that cross it are caught too. */
  private guardCut(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
    if (!this.guardFront(dx, dz)) return -1;
    const p = this.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const den = dx * fx + dz * fz;
    if (den > -1e-6) return -1;
    const cx = p.x + fx * GUARD.disc.at, cy = p.y + GUARD.disc.y, cz = p.z + fz * GUARD.disc.at;
    const t = ((cx - ox) * fx + (cz - oz) * fz) / den;
    if (t < 0 || t > maxT) return -1;
    const x = ox + dx * t - cx, y = oy + dy * t - cy, z = oz + dz * t - cz;
    return x * x + y * y + z * z <= GUARD.disc.r * GUARD.disc.r ? t : -1;
  }

  /** G / Triangle held: the frag comes up in his left hand and the aim preview shows where it goes; let go
   *  and it goes (a press that came and went between two steps throws at once). A weapon switch, a
   *  melee or the guard put it back (down until the button is let go); a dive, a roll or a vault take it
   *  down until he is back on his feet with the button still held. Up, he can still shoot one-handed, but
   *  no reload: raising it drops one under way, and a gun that runs dry waits until the frag has gone. */
  private stepFrag(inp: InputFrame): void {
    const p = this.player;
    const held = !!inp.nade;
    if (!held) p.nadeBlock = false;
    // the game lost the keys (the window's focus, the pause): back in the pouch, not thrown, and down
    // until the button is let go (a pad's Triangle still held on the resume does not raise it again)
    if (inp.stow && p.nadeUp) { this.lowerFrag(true); return; }
    if (p.nadeUp) {
      if (p.meleeT > 0 || p.guard) this.lowerFrag(true);
      else if (p.mode !== "normal" || p.grenades <= 0) this.lowerFrag(false);
      else if (!held) {
        p.nadeUp = false;
        this.throwGrenade(true);
        // the gun ran dry while the frag was up: its reload now the left hand is free
        if (ammoIn(p.weapon) === 0 && startReload(p.weapon)) this.emit({ type: "reload", hand: 0 });
        return;
      }
    }
    if (held && !p.nadeUp && !p.nadeBlock && p.grenades > 0 && p.throwT <= 0 && p.mode === "normal" && p.meleeT <= 0 && !p.guard) {
      p.nadeUp = true;
      // the left hand takes the frag: a reload in progress is dropped (as the melee and the guard drop it)
      p.weapon.reloadT = 0;
      this.emit({ type: "nade", up: true });
    } else if (inp.throw && !held && !p.nadeUp) this.throwGrenade();
  }

  /** The raised frag goes back in the pouch (block: it stays down until the button is let go). */
  private lowerFrag(block: boolean): void {
    const p = this.player;
    if (block) p.nadeBlock = true;
    if (!p.nadeUp) return;
    p.nadeUp = false;
    this.emit({ type: "nade", up: false });
  }

  /** Where a throw now would go (his frag held up: the view draws it): the sim's own flight, bounces and
   *  the blast point (sim/frag.ts). */
  fragPreview(out?: FragPath): FragPath {
    const p = this.player;
    return predictFrag(this.world, fragLaunch(p.x, p.y, p.z, p.yaw, this.aimPoint, this.fragL), out);
  }

  /** A frag from his left hand on a 35 deg loft onto the aim point (3-20 m out; sim/frag.ts fragLaunch);
   *  raised: let go from the frag held up. */
  private throwGrenade(raised = false): void {
    const p = this.player;
    if (p.grenades <= 0 || p.throwT > 0 || p.mode !== "normal" || p.meleeT > 0 || p.guard) return;
    p.grenades--;
    p.throwT = GRENADE.cooldown;
    const l = fragLaunch(p.x, p.y, p.z, p.yaw, this.aimPoint, this.fragL);
    const ox = l.x, oy = l.y, oz = l.z;
    const gr: Grenade = { id: this.nextGrenade++, x: ox, y: oy, z: oz, vx: l.vx, vy: l.vy, vz: l.vz, fuse: GRENADE.fuse, landed: false, resting: false, bounces: 0, by: -1, acc: 0 };
    this.grenadesLive.push(gr);
    this.emit({ type: "throw", id: gr.id, x: ox, y: oy, z: oz, ...(raised ? { raised: true } : {}) });
    // they hear the pin
    for (const e of this.enemies) if (e.state === "idle" && !e.deaf && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < 12 * 12) alertGoon(this, e, 0.3);
  }

  /** A goon's frag (ai/tactics.ts): from her hand at (ox, oy, oz) with that velocity. */
  enemyGrenade(e: Enemy, ox: number, oy: number, oz: number, vx: number, vy: number, vz: number): void {
    const gr: Grenade = { id: this.nextGrenade++, x: ox, y: oy, z: oz, vx, vy, vz, fuse: GRENADE.fuse, landed: false, resting: false, bounces: 0, by: e.idx };
    this.grenadesLive.push(gr);
    this.emit({ type: "throw", id: gr.id, x: ox, y: oy, z: oz, by: e.idx });
  }

  /** World-time flight with bounces off the boxes and the floor, the fuse, the girls running from it. */
  private stepGrenades(wdt: number): void {
    for (let i = 0; i < this.grenadesLive.length; i++) {
      const gr = this.grenadesLive[i];
      let boom = false;
      if ((gr.by ?? -1) < 0) {
        // his: fixed sub-steps of world time (sim/frag.ts: the aim preview's own flight), the fuse
        // counting the same sub-steps
        let acc = (gr.acc ?? 0) + wdt;
        while (acc >= FRAG_STEP - 1e-12) {
          acc -= FRAG_STEP;
          const vn = fragSubstep(this.world, gr);
          if (vn > 1) this.emit({ type: "bounce", id: gr.id, x: gr.x, y: gr.y, z: gr.z, speed: vn });
          gr.fuse = fuseTick(gr.fuse);
          if (fuseOut(gr.fuse)) { boom = true; break; }
        }
        gr.acc = acc;
      } else {
        // the gang's: the per-step sub-steps, the fuse on world time
        fragLegacy(this.world, gr, wdt, vn => { if (vn > 1) this.emit({ type: "bounce", id: gr.id, x: gr.x, y: gr.y, z: gr.z, speed: vn }); });
        gr.fuse -= wdt;
        boom = gr.fuse <= 0;
      }
      if (boom) {
        this.grenadesLive.splice(i--, 1);
        this.explode(gr);
        continue;
      }
      if (!gr.landed) continue;
      // goons and rushers with a clear line to it run out of the radius after a beat (the idle hear it)
      for (const e of this.enemies) {
        if (e.kind === "heavy" || e.kind === "madame" || e.kind === "countess" || e.perch || e.fled || e.state === "dead" || e.state === "inactive" || e.fleeWait > 0 || e.fleeT > 0) continue;
        const dx = e.x - gr.x, dz = e.z - gr.z, d = Math.hypot(dx, dz);
        if (d > GRENADE.fleeRadius || !this.world.clear(gr.x, gr.y + 0.2, gr.z, e.x, e.y + 1, e.z, true)) continue;
        if (e.state === "idle") alertGoon(this, e, 0);
        e.fleeWait = GRENADE.react;
        const a = d > 1e-3 ? 1 / d : 0;
        e.fleeX = d > 1e-3 ? dx * a : Math.sin(e.facing + Math.PI);
        e.fleeZ = d > 1e-3 ? dz * a : Math.cos(e.facing + Math.PI);
      }
    }
  }

  /** The blast: everyone with a clear line from just above it takes damage x (1 - d / r) ^ falloff (he
   *  takes GRENADE.self of it); a kill blows the body away from the centre. */
  private explode(gr: Grenade): void {
    const bx = gr.x, by = gr.y + 0.25, bz = gr.z, R = GRENADE.radius;
    this.emit({ type: "explode", id: gr.id, x: gr.x, y: gr.y, z: gr.z });
    if (this.firstShotAt < 0) { this.firstShotAt = this.time; this.crowd.scatter(this.time, bx, bz, this.player.x, this.player.z); this.emit({ type: "firstShot", x: bx, z: bz }); }
    const dmgAt = (d: number) => GRENADE.damage * Math.pow(Math.max(0, 1 - d / R), GRENADE.falloff);
    for (const e of this.enemies) {
      if (e.state === "dead" || e.state === "inactive" || e.fled) continue;
      if (!aimPoint(e.hit.body, e.hit.pose, HB_TORSO, this.v, this.scratchCaps)) continue;
      const dx = this.v.x - bx, dy = this.v.y - by, dz = this.v.z - bz, d = Math.hypot(dx, dy, dz);
      if (d >= R || !this.world.clear(bx, by, bz, this.v.x, this.v.y, this.v.z, true)) continue;
      const dmg = this.bossShare(e, dmgAt(d));
      e.hp -= dmg;
      e.flinch = Math.max(e.flinch, AI.flinch);
      if (e.weapon === "sniper" && e.kind !== "countess") e.tell = 0;
      this.emit({ type: "hurt", target: e.idx, amount: dmg, part: HB_TORSO, hp: Math.max(0, e.hp) });
      if (e.state === "idle") alertGoon(this, e, 0);
      if (e.kind === "heavy" && e.hp > 0 && dmg >= HEAVY.staggerAt && e.stagger <= 0) { e.stagger = HEAVY.stagger; e.tell = 0; this.emit({ type: "stagger", enemy: e.idx }); }
      const hl = Math.hypot(dx, dz) || 1;
      // (a goon's own frag: no kill of his)
      if (e.hp <= 0) this.killEnemy(e, false, dx / hl, dz / hl, (gr.by ?? -1) < 0 ? { ox: bx, oy: by, oz: bz, x: this.v.x, y: this.v.y, z: this.v.z } : null, true, false, "grenade");
    }
    const p = this.player;
    if (p.mode !== "dead") {
      const tx = p.x, ty = p.y + (p.mode === "dive" || p.mode === "prone" ? 0.4 : p.hit.pose.stance === "cover" ? 0.6 : 1.1), tz = p.z;
      const d = Math.hypot(tx - bx, ty - by, tz - bz);
      if (d < R && this.world.clear(bx, by, bz, tx, ty, tz, true)) this.hurtPlayer(dmgAt(d) * ((gr.by ?? -1) < 0 ? GRENADE.self : TACTICS.player * this.diff.damage), gr.by ?? -1);
    }
    for (const b of this.level.breakables) {
      const box = this.level.boxes.find(x => x.node === b.node);
      if (!box || (this.breakHp.get(b.node) ?? 0) <= 0) continue;
      const d = Math.hypot(boxDist(box, bx, bz), Math.max(0, box.bottom - by, by - box.top));
      if (d < R) this.damageBreakable(b.node, dmgAt(d));
    }
    // everyone hears it
    for (const e of this.enemies) if (e.state === "idle" && !e.deaf && (e.x - bx) ** 2 + (e.z - bz) ** 2 < AI.hearing * AI.hearing) alertGoon(this, e, 0.2);
  }

  /** A breakable takes damage; at 0 it goes (its drop lands below it, its secret counts). */
  private damageBreakable(node: string, dmg: number): void {
    const hp = this.breakHp.get(node);
    if (hp === undefined || hp <= 0) return;
    const left = hp - dmg;
    this.breakHp.set(node, left);
    if (left > 0) return;
    const b = this.level.breakables.find(x => x.node === node)!;
    const box = this.level.boxes.find(x => x.node === node);
    this.world.setEnabled(node, false);
    this.broken.push(node);
    const x = box?.cx ?? 0, y = box?.cy ?? 0, z = box?.cz ?? 0;
    this.emit({ type: "break", node, x, y, z, surface: box?.surface ?? "wood" });
    if (b.drop && (PICKUPS[b.drop] || b.drop === "copium")) {
      const gy = this.world.groundBelow(x, z, 0.1, (box?.bottom ?? y) + 0.01);
      const k: Pickup = { id: `brk-${node}`, item: b.drop, amount: b.amount || (PICKUPS[b.drop]?.amount ?? 1), x, y: Number.isFinite(gy) ? gy : 0, z, taken: false };
      this.pickups.push(k);
      this.emit({ type: "drop", id: k.id, item: k.item, x: k.x, y: k.y, z: k.z, fromY: y });
    }
    if (b.secret) this.findSecret(b.secret);
  }

  private findSecret(id: string): void {
    if (this.found.includes(id)) return;
    const m = this.secrets.find(x => x.id === id);
    if (!m) return;
    this.found.push(id);
    this.stats.secrets = this.found.length;
    this.emit({ type: "secret", id, n: this.found.length, of: this.secrets.length, name: typeof m.data.name === "string" ? m.data.name : id });
  }

  /** What E would use right now (read only, the HUD's prompt reads it too): the nearest secret door in
   *  reach in front of him, else the nearest egg in reach in front of him, else null. */
  useTarget(): { door: string } | { egg: Marker } | null {
    const p = this.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const inFront = (x: number, z: number, d: number) => d < 0.4 || ((x - p.x) * fx + (z - p.z) * fz) / d >= USE.cos;
    let door: { node: string; d: number } | null = null;
    for (const dr of this.level.doors) {
      if (this.opened.includes(dr.node) || this.world.off.has(dr.node)) continue;
      const box = this.level.boxes.find(b => b.node === dr.node);
      if (!box || p.y + 1 < box.bottom || p.y > box.top) continue;
      const d = boxDist(box, p.x, p.z);
      // facing the nearest point of it (a long bookshelf: the end he stands at)
      const c = boxNearest(box, p.x, p.z);
      if (d > USE.reach || !inFront(c.x, c.z, Math.hypot(c.x - p.x, c.z - p.z))) continue;
      if (!door || d < door.d) door = { node: dr.node, d };
    }
    if (door) return { door: door.node };
    let egg: Marker | null = null, ed = Infinity;
    for (const m of this.level.markers) {
      if (m.kind !== "egg" || m.data.interact !== true) continue;
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      if (d > USE.reach + 0.4 || Math.abs(m.y - (p.y + 0.9)) > 1.6 || !inFront(m.x, m.z, d) || d >= ed) continue;
      egg = m; ed = d;
    }
    return egg ? { egg } : null;
  }

  /** E: the nearest secret door in reach in front of him opens; else an egg in reach reports it. */
  private interact(): void {
    const t = this.useTarget();
    if (!t) return;
    if ("door" in t) {
      this.world.setEnabled(t.door, false);
      this.opened.push(t.door);
      this.emit({ type: "open", node: t.door });
      return;
    }
    this.emit({ type: "interact", id: t.egg.id, egg: String(t.egg.data.egg ?? t.egg.id) });
  }

  // ---- the breach door ------------------------------------------------------------------------

  /** The door box a breach trigger names (null once it is gone). */
  doorOf(t: Marker): Box | null {
    const id = t.data.door;
    if (typeof id !== "string" || this.world.off.has(id)) return null;
    return this.level.boxes.find(b => b.node === id) ?? null;
  }

  /** The player stands in a breach trigger: the hint once, and after BREACH.kickAfter real seconds
   *  the heavy inside kicks the door open (nobody stays stuck in the hall). */
  private standAtDoor(t: Trigger): void {
    if (!t.prompted) {
      t.prompted = true;
      this.emit({ type: "trigger", id: t.id, action: "breach", group: typeof t.data.group === "string" ? t.data.group : undefined });
    }
    if (this.phase !== "play") return;
    t.wait += DT;
    if (t.wait >= BREACH.kickAfter) this.breach(t, true);
  }

  /** A dive (inside a breach trigger) about to hit its door: the door goes. */
  private tryBreach(): void {
    const p = this.player;
    for (const t of this.triggers) {
      if (t.fired || t.data.action !== "breach" || !insideTrigger(t, p.x, p.y + 0.9, p.z)) continue;
      const b = this.doorOf(t);
      if (!b) continue;
      const toX = b.cx - p.x, toZ = b.cz - p.z;
      if (toX * p.dirX + toZ * p.dirZ <= 0) continue; // diving away from it
      if (!circleRectOverlap(b, p.x + p.dirX * 0.25, p.z + p.dirZ * 0.25, PLAYER.radius + 0.05)) continue;
      this.breach(t, false);
      // the door was in the way this step: the dive keeps its speed through the frame
      p.vx = p.dirX * DODGE.speed;
      p.vz = p.dirZ * DODGE.speed;
    }
  }

  /** Take the door out: slow motion without a meter cost for the dive, the group behind it wakes (late:
   *  the reward for going in fast). `kick`: the fallback, the heavy inside kicked it (no slow motion,
   *  a normal wake, and he stands in the doorway). */
  private breach(t: Trigger, kick: boolean): void {
    const b = this.doorOf(t);
    t.fired = true;
    if (!b) return;
    this.world.setEnabled(b.node, false);
    this.breached.push(b.node);
    const group = typeof t.data.group === "string" ? t.data.group : "";
    // which way the door flies: along the dive, or out toward the hall when kicked
    let dx = t.x - b.cx, dz = t.z - b.cz;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    if (!kick) {
      dx = this.player.dirX; dz = this.player.dirZ;
      this.slowFor(BREACH.slowReal, BREACH.slowScale);
      this.meter = Math.min(METER.max, this.meter + this.dodgeSpent);
      this.dodgeSpent = 0;
    } else {
      // the kicker: the group's first heavy, now just inside the doorway, facing the hall
      const k = this.enemies.find(e => e.group === group && e.kind === "heavy" && e.state !== "dead");
      if (k) {
        k.x = b.cx - dx * 1.0; k.z = b.cz - dz * 1.0;
        k.facing = Math.atan2(dx, dz);
        this.syncEnemyPose(k);
      }
    }
    this.emit({ type: "breach", id: b.node, kick, dx, dz });
    for (const e of this.enemies) {
      if (!group || e.group !== group) continue;
      e.deaf = false;
      alertGoon(this, e, kick ? 0.2 * this.rng.next() : BREACH.react);
    }
  }

  // ---- aim + shots ----------------------------------------------------------------------------

  /** The crosshair ray from the shoulder pivot: what it is on and where it lands. */
  private updateAim(): void {
    const p = this.player;
    const piv = pivotOf(p, this.v, this.world);
    const d = aimDir(p.yaw, p.pitch, this.v2);
    const h = trace(this.world, this.actors, 0, piv.x, piv.y, piv.z, d.x, d.y, d.z, MAX_RANGE, this.th2);
    this.aimEnemy = h.kind === HIT_ACTOR ? h.actor - 1 : -1;
    this.aimPoint.x = h.x; this.aimPoint.y = h.y; this.aimPoint.z = h.z;
    // round 3: the boss room's small targets (the grenade in her hand, a grenade, the chain) are on the crosshair too
    const cut = this.boss ? this.boss.intercept(piv.x, piv.y, piv.z, d.x, d.y, d.z, h.t) : null;
    if (cut) { this.aimEnemy = -1; this.aimPoint.x = piv.x + d.x * cut.t; this.aimPoint.y = piv.y + d.y * cut.t; this.aimPoint.z = piv.z + d.z * cut.t; }
    // chapter 2: the room's small target (the helicopter's lamp)
    const sc = !cut && this.stage?.intercept ? this.stage.intercept(piv.x, piv.y, piv.z, d.x, d.y, d.z, h.t) : null;
    if (sc) { this.aimEnemy = -1; this.aimPoint.x = piv.x + d.x * sc.t; this.aimPoint.y = piv.y + d.y * sc.t; this.aimPoint.z = piv.z + d.z * sc.t; }
  }

  private firePlayer(hand: number): void {
    const p = this.player;
    const def = WEAPONS[p.weapon.id];
    const m = muzzleOf(p, hand, this.v3);
    // from behind cover without popping out: blind fire, the gun held up over it or round its edge
    const cs = p.cover >= 0 ? this.cover[p.cover] : null;
    const blind = !!cs && p.coverPop < 0.7 && this.blindMuzzle(cs, hand, m);
    // muzzle -> aim point, then the weapon spread
    let dx = this.aimPoint.x - m.x, dy = this.aimPoint.y - m.y, dz = this.aimPoint.z - m.z;
    let l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l < 0.5) { const a = aimDir(p.yaw, p.pitch, this.v2); dx = a.x; dy = a.y; dz = a.z; l = 1; }
    dx /= l; dy /= l; dz /= l;
    this.stats.shots += def.pellets; // accuracy counts every pellet (hits do)
    // hearing: idle goons in range wake up
    // (and the awake ones know where he is from it: his shots give him away, blind fire too)
    for (const e of this.enemies) {
      if (e.deaf || e.state === "dead" || e.state === "inactive") continue;
      const ex = e.x - p.x, ez = e.z - p.z;
      if (ex * ex + ez * ez >= AI.hearing * AI.hearing) continue;
      if (e.state === "idle") alertGoon(this, e, 0.15);
      else { e.seenAt = this.time; e.lastSeenX = p.x; e.lastSeenZ = p.z; }
    }
    const cone = (p.zoom ? def.zoomSpread : def.spread) + (blind ? COVER_MOVE.blind : 0);
    for (let k = 0; k < def.pellets; k++) {
      const s = this.spread(dx, dy, dz, cone);
      this.shoot(0, PLAYER_ID, hand, m.x, m.y, m.z, s.x, s.y, s.z, def.damage, def.id, k, def.pierce);
    }
  }

  /** Blind fire's muzzle: over the top of low cover, or out round the open edge of high cover (the
   *  hands only); false (the normal muzzle) mid-wall or when he aims away from it. */
  private blindMuzzle(s: CoverSeg, hand: number, m: V3): boolean {
    const p = this.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    if (fx * -s.nx + fz * -s.nz < 0.1) return false;
    const side = hand === 0 ? 0.12 : -0.12;
    if (!s.high) {
      m.x = p.x - s.nx * 0.2 + s.tx * side; m.z = p.z - s.nz * 0.2 + s.tz * side; m.y = s.y + s.top + 0.12;
      return true;
    }
    if (p.coverEnd === 0) return false;
    const c = p.coverEnd < 0 ? s.cornerA - 0.22 : s.cornerB + 0.22;
    m.x = s.ax + s.tx * c - s.nx * 0.12; m.z = s.az + s.tz * c - s.nz * 0.12; m.y = p.y + 1.25 + side * 0.3;
    return true;
  }

  /** Enemy fires at the player (accuracy falls off with distance and the player's speed). */
  enemyFire(e: Enemy, moving: boolean, at: V3 | null = null): void {
    const p = this.player;
    const T = ENEMY[e.kind];
    const c = Math.cos(e.facing), s = Math.sin(e.facing);
    const up = e.crouch && e.state !== "peek" ? 0.95 : T.muzzleUp;
    const reach = e.kind === "heavy" ? 0.75 * HEAVY_SCALE : 0.45, side = e.kind === "heavy" ? 0.12 : 0.18;
    // (leaning out of high cover: the gun goes out with her)
    const ln = e.lean * 0.34;
    const mx = e.x + s * reach - c * side + c * ln, my = e.y + up, mz = e.z + c * reach + s * side - s * ln;
    const tgt = this.v;
    // suppressing fire (ai/tactics.ts) goes at a point over his cover, else at his body
    if (at) { tgt.x = at.x; tgt.y = at.y; tgt.z = at.z; }
    else if (!aimPoint("radbro", p.hit.pose, HB_TORSO, tgt, this.scratchCaps)) return;
    let dx = tgt.x - mx, dy = tgt.y - my, dz = tgt.z - mz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const sniper = e.weapon === "sniper", cannon = e.weapon === "handcannon";
    // the sniper keeps her aim out to her range
    const D = this.diff;
    const distF = sniper ? (dist <= this.sniperArms.range ? 1 : D.farFloor) : dist <= AI.near ? 1 : dist >= D.far ? D.farFloor : 1 - ((1 - D.farFloor) * (dist - AI.near)) / (D.far - AI.near);
    const fast = p.mode === "dive" || p.mode === "roll";
    const speedF = fast ? AI.dodgeMul : 1 - D.speedK * Math.min(1, p.speed / PLAYER.runSpeed);
    const chance = (e.kind === "countess" ? COUNTESS.hit : sniper ? this.sniperArms.hit : AI.baseHit) * distF * speedF * this.diff.accuracy * (moving ? 0.55 : 1) * (this.stage?.accuracy?.(this, e) ?? 1);
    const hitRoll = this.rng.next() < chance;
    // aim offset in the plane across the line of fire
    let ox = 0, oy = 0, oz = 0;
    const rx = -dz / dist, rz = dx / dist; // horizontal right
    if (hitRoll) {
      ox = this.rng.gauss() * 0.05; oy = this.rng.gauss() * 0.05;
      oz = ox * rz; ox = ox * rx;
    } else {
      const side = (this.rng.next() < 0.5 ? -1 : 1) * (0.55 + 0.8 * this.rng.next());
      oy = (this.rng.next() - 0.35) * 0.9;
      ox = rx * side; oz = rz * side;
    }
    dx += ox; dy += oy; dz += oz;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    e.shots++;
    if (T.pellets > 1 && !cannon) {
      // the heavy's pump gun: 8 pellets in a 6 deg cone, full damage within 6 m, 30 % from 16 m out
      const fall = dist <= HEAVY.near ? 1 : dist >= HEAVY.far ? HEAVY.farK : 1 - ((1 - HEAVY.farK) * (dist - HEAVY.near)) / (HEAVY.far - HEAVY.near);
      const bx = dx / l, by = dy / l, bz = dz / l;
      for (let k = 0; k < T.pellets; k++) {
        const q = this.spread(bx, by, bz, T.spread);
        this.shoot(1, e.idx, 0, mx, my, mz, q.x, q.y, q.z, T.damage * fall * this.diff.damage, e.weapon, k);
      }
      return;
    }
    const dmg = e.kind === "countess" ? perDiff(COUNTESS.damage, this.difficulty) : sniper ? this.sniperArms.damage : cannon ? ENEMY_ARMS.handcannon.damage : T.damage;
    // (the bosses, Madame Pockit and the Countess, have their own factor: they stay fair on every setting)
    this.shoot(1, e.idx, 0, mx, my, mz, dx / l, dy / l, dz / l, dmg * (e.kind === "madame" || e.kind === "countess" ? this.diff.boss : this.diff.damage), e.weapon, 0);
  }

  /** Can the enemy's gun see the player (no wall between muzzle height and the body)? */
  canShoot(e: Enemy): boolean {
    const p = this.player;
    const ln = e.lean * 0.34, lx = Math.cos(e.facing) * ln, lz = -Math.sin(e.facing) * ln;
    return this.world.clear(e.x + lx, e.y + ENEMY[e.kind].muzzleUp, e.z + lz, p.x, p.y + this.losUp() * 0.75, p.z, true);
  }

  /** Suppressing fire's line: from her gun to the point over his cover, not blocked short of the cover
   *  itself (a wall between them is no suppression). */
  suppressLine(e: Enemy, at: V3): boolean {
    const ln = e.lean * 0.34, ox = e.x + Math.cos(e.facing) * ln, oy = e.y + ENEMY[e.kind].muzzleUp, oz = e.z - Math.sin(e.facing) * ln;
    const dx = at.x - ox, dy = at.y - oy, dz = at.z - oz, d = Math.hypot(dx, dy, dz);
    if (d < 1e-3) return false;
    const h = this.world.raycast(ox, oy, oz, dx / d, dy / d, dz / d, d, true);
    return !h || h.t > d - 1.4;
  }

  /** Line of sight + view cone (unless already alerted) + range. */
  canSee(e: Enemy): boolean {
    const p = this.player;
    const dx = p.x - e.x, dz = p.z - e.z;
    const d2 = dx * dx + dz * dz;
    const G = ENEMY[e.kind];
    const sight = e.weapon === "sniper" ? this.sniperArms.sight : G.sight;
    if (d2 > sight * sight) return false;
    if (e.state === "idle") {
      // not yet alerted: only a close player is noticed (the room's alert trigger wakes the rest)
      if (d2 > G.idleSight * G.idleSight) return false;
      const d = Math.sqrt(d2) || 1;
      const fx = Math.sin(e.facing), fz = Math.cos(e.facing);
      if ((fx * dx + fz * dz) / d < G.fov) return false;
    }
    const eyeY = e.y + (e.crouch ? 1.1 : e.kind === "heavy" ? 1.45 * HEAVY_SCALE : 1.65);
    const ln = e.lean * 0.34;
    return this.world.clear(e.x + Math.cos(e.facing) * ln, eyeY, e.z - Math.sin(e.facing) * ln, p.x, p.y + Math.max(0.5, this.losUp() - 0.2), p.z, true);
  }

  /** Tell alertable friends nearby. */
  shout(e: Enemy): void {
    for (const o of this.enemies) {
      if (o === e || o.state !== "idle" || o.deaf) continue;
      const dx = o.x - e.x, dz = o.z - e.z;
      if (dx * dx + dz * dz < 16 * 16) alertGoon(this, o, 0.25);
    }
  }

  private spread(dx: number, dy: number, dz: number, cone: number): V3 {
    const o = this.v2;
    if (cone <= 0) { o.x = dx; o.y = dy; o.z = dz; return o; }
    // two perpendicular axes
    let ux = -dz, uy = 0, uz = dx;
    let ul = Math.sqrt(ux * ux + uz * uz);
    if (ul < 1e-6) { ux = 1; uz = 0; ul = 1; }
    ux /= ul; uz /= ul;
    const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
    const a = this.rng.gauss() * cone * 0.5, b = this.rng.gauss() * cone * 0.5;
    o.x = dx + ux * a + vx * b; o.y = dy + uy * a + vy * b; o.z = dz + uz * a + vz * b;
    const l = Math.sqrt(o.x * o.x + o.y * o.y + o.z * o.z);
    o.x /= l; o.y /= l; o.z /= l;
    return o;
  }

  /** Normal speed: hitscan now. Bullet time: a visible projectile at PROJECTILE_SPEED (world m/s). */
  shoot(team: 0 | 1, shooter: number, hand: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, damage: number, weapon = "pistols", pellet = 0, pierce = 0): void {
    if (this.firstShotAt < 0) {
      // the first shot in the room: the crowd scatters; in the club it also wakes every armed girl
      this.firstShotAt = this.time;
      this.crowd.scatter(this.time, ox, oz, this.player.x, this.player.z);
      this.emit({ type: "firstShot", x: ox, z: oz });
      if (this.level.room.alertOnShot) for (const e of this.enemies) alertGoon(this, e, 0.2);
    }
    const projectile = this.timeScale < 0.999;
    const id = this.nextProjectile++;
    if (projectile) {
      this.projectiles.push({ id, team, shooter, x: ox, y: oy, z: oz, dx, dy, dz, left: MAX_RANGE, damage, alive: true, sx: ox, sy: oy, sz: oz, weapon, pierce, skip: [] });
      this.emit({ type: "shot", shooter, hand, ox, oy, oz, ex: ox + dx * MAX_RANGE, ey: oy + dy * MAX_RANGE, ez: oz + dz * MAX_RANGE, projectile: true, id, weapon, pellet });
      return;
    }
    const h = trace(this.world, this.actors, team, ox, oy, oz, dx, dy, dz, MAX_RANGE, this.th);
    // #4764's raised blade in its way (in front of him, before whatever it would hit)
    const gt = team === 1 ? this.guardCut(ox, oy, oz, dx, dy, dz, h.t) : -1;
    if (gt >= 0) {
      const x = ox + dx * gt, y = oy + dy * gt, z = oz + dz * gt;
      this.emit({ type: "shot", shooter, hand, ox, oy, oz, ex: x, ey: y, ez: z, projectile: false, id, weapon, pellet });
      this.deflect(x, y, z, dx, dy, dz, shooter, weapon);
      return;
    }
    // round 3: his shot may meet one of the boss room's small targets first
    const cut = team === 0 && this.boss ? this.boss.intercept(ox, oy, oz, dx, dy, dz, h.t) : null;
    if (cut) {
      this.emit({ type: "shot", shooter, hand, ox, oy, oz, ex: ox + dx * cut.t, ey: oy + dy * cut.t, ez: oz + dz * cut.t, projectile: false, id, weapon, pellet });
      this.boss!.hitTarget(this, cut, ox, oy, oz);
      return;
    }
    const sc = team === 0 && this.stage?.intercept ? this.stage.intercept(ox, oy, oz, dx, dy, dz, h.t) : null;
    if (sc) {
      this.emit({ type: "shot", shooter, hand, ox, oy, oz, ex: ox + dx * sc.t, ey: oy + dy * sc.t, ez: oz + dz * sc.t, projectile: false, id, weapon, pellet });
      this.stage!.hitTarget?.(this, sc, ox, oy, oz, damage);
      return;
    }
    if (pierce <= 0) {
      this.emit({ type: "shot", shooter, hand, ox, oy, oz, ex: h.x, ey: h.y, ez: h.z, projectile: false, id, weapon, pellet });
      this.resolveHit(h, ox, oy, oz, dx, dy, dz, damage, team, shooter, weapon);
      return;
    }
    // through up to `pierce` bodies: trace on past each one (out of the trace for the rest of the line),
    // then resolve the hits in order at PIERCE_K of the damage each time
    const hits: TraceHit[] = [];
    const off: HitActor[] = [];
    let x = ox, y = oy, z = oz, left = MAX_RANGE;
    for (let n = 0; ; n++) {
      const h = trace(this.world, this.actors, team, x, y, z, dx, dy, dz, left, makeTraceHit());
      hits.push(h);
      if (h.kind !== HIT_ACTOR || n >= pierce) break;
      const a = this.actors[h.actor];
      a.hittable = false;
      off.push(a);
      left -= h.t;
      x = h.x; y = h.y; z = h.z;
      if (left <= 1e-6) break;
    }
    for (const a of off) a.hittable = true;
    const last = hits[hits.length - 1];
    this.emit({ type: "shot", shooter, hand, ox, oy, oz, ex: last.x, ey: last.y, ez: last.z, projectile: false, id, weapon, pellet });
    let dmg = damage;
    for (const h of hits) {
      this.resolveHit(h, ox, oy, oz, dx, dy, dz, dmg, team, shooter, weapon);
      dmg *= PIERCE_K;
    }
  }

  private stepProjectiles(wdt: number): void {
    const step = PROJECTILE_SPEED * wdt;
    for (let i = 0; i < this.projectiles.length; i++) {
      const b = this.projectiles[i];
      const len = Math.min(step, b.left);
      // bodies it already went through are out of its trace
      const was = b.skip.map(k => this.actors[k].hittable);
      for (const k of b.skip) this.actors[k].hittable = false;
      const h = trace(this.world, this.actors, b.team, b.x, b.y, b.z, b.dx, b.dy, b.dz, len, this.th);
      b.skip.forEach((k, j) => { this.actors[k].hittable = was[j]; });
      // round 3: his bullet may meet one of the boss room's small targets first
      const cut = b.team === 0 && this.boss ? this.boss.intercept(b.x, b.y, b.z, b.dx, b.dy, b.dz, h.t) : null;
      const sc = b.team === 0 && !cut && this.stage?.intercept ? this.stage.intercept(b.x, b.y, b.z, b.dx, b.dy, b.dz, h.t) : null;
      // the gang's round across #4764's raised blade (in front of him, before whatever it would hit)
      const gt = b.team === 1 ? this.guardCut(b.x, b.y, b.z, b.dx, b.dy, b.dz, h.t) : -1;
      if (gt >= 0) {
        b.x += b.dx * gt; b.y += b.dy * gt; b.z += b.dz * gt;
        b.alive = false;
        this.deflect(b.x, b.y, b.z, b.dx, b.dy, b.dz, b.shooter, b.weapon);
      } else if (cut) {
        b.x += b.dx * cut.t; b.y += b.dy * cut.t; b.z += b.dz * cut.t;
        b.alive = false;
        this.boss!.hitTarget(this, cut, b.sx, b.sy, b.sz);
      } else if (sc) {
        b.x += b.dx * sc.t; b.y += b.dy * sc.t; b.z += b.dz * sc.t;
        b.alive = false;
        this.stage!.hitTarget?.(this, sc, b.sx, b.sy, b.sz, b.damage);
      } else if (h.kind === HIT_ACTOR && b.pierce > 0) {
        // on through the body: the rest of its flight goes on from there next step
        b.pierce--;
        b.skip.push(h.actor);
        b.x = h.x; b.y = h.y; b.z = h.z;
        b.left -= h.t;
        this.resolveHit(h, b.sx, b.sy, b.sz, b.dx, b.dy, b.dz, b.damage, b.team, b.shooter, b.weapon);
        b.damage *= PIERCE_K;
        if (b.left <= 1e-6) b.alive = false;
      } else if (h.kind !== HIT_NONE) {
        b.x = h.x; b.y = h.y; b.z = h.z;
        b.alive = false;
        this.resolveHit(h, b.sx, b.sy, b.sz, b.dx, b.dy, b.dz, b.damage, b.team, b.shooter, b.weapon);
      } else {
        b.x += b.dx * len; b.y += b.dy * len; b.z += b.dz * len;
        b.left -= len;
        if (b.left <= 1e-6) b.alive = false;
      }
      if (!b.alive) {
        this.emit({ type: "projectileEnd", id: b.id });
        this.projectiles.splice(i--, 1);
      }
    }
  }

  /** Damage, blood, decals, kills. `o` is where the shot came from (the kill cam replays it). */
  private resolveHit(h: TraceHit, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, damage: number, team: number, shooter: number, weapon = "pistols"): void {
    if (h.kind === HIT_WORLD) {
      this.emit({ type: "impact", x: h.x, y: h.y, z: h.z, nx: h.nx, ny: h.ny, nz: h.nz, surface: h.surface, shooter });
      this.emit({ type: "decal", x: h.x, y: h.y, z: h.z, nx: h.nx, ny: h.ny, nz: h.nz, blood: false });
      if (team === 0 && h.node) this.damageBreakable(h.node, damage);
      return;
    }
    if (h.kind !== HIT_ACTOR) return;
    const target = h.actor - 1; // -1 = player
    // #4764's guard: a round from the front meets the blade instead
    if (target === PLAYER_ID && this.guardFront(dx, dz)) { this.deflect(h.x - dx * GUARD.blade, h.y - dy * GUARD.blade, h.z - dz * GUARD.blade, dx, dy, dz, shooter, weapon); return; }
    this.emit({ type: "blood", x: h.x, y: h.y, z: h.z, dx, dy, dz, target, part: h.part });
    // blood on the wall behind (within 3 m)
    const wh = this.world.raycast(h.x + dx * 0.3, h.y + dy * 0.3, h.z + dz * 0.3, dx, dy, dz, 3, true);
    if (wh) this.emit({ type: "decal", x: h.x + dx * (0.3 + wh.t), y: h.y + dy * (0.3 + wh.t), z: h.z + dz * (0.3 + wh.t), nx: wh.nx, ny: wh.ny, nz: wh.nz, blood: true });
    if (target === PLAYER_ID) {
      this.hurtPlayer(damage, shooter);
      return;
    }
    const e = this.enemies[target];
    if (!e || e.state === "dead") return;
    if (team === 0) this.stats.hits++;
    const amount = damage * HB_MULT[h.part] * (e.kind === "madame" && this.boss ? this.boss.damageMul(h.part) : 1) * (this.stage?.damageMul?.(e, h.part) ?? 1);
    const shot = team === 0 ? { ox, oy, oz, x: h.x, y: h.y, z: h.z } : null;
    const blast = team === 0 && (weapon === "shotgun" || weapon === "sawedoff") && (e.x - ox) ** 2 + (e.z - oz) ** 2 < 4 * 4;
    this.damageEnemy(e, amount, h.part, dx, dz, shot, blast, weapon);
  }

  /** Madame Pockit's share of a blow that is not a bullet (a melee, a frag): her coat's and the coat
   *  throw's factor, and never her kill before the last stand. Anyone else takes it all. */
  private bossShare(e: Enemy, amount: number): number {
    if (e.kind === "countess" && this.stage?.damageMul) return this.stage.clampDamage?.(e, amount * this.stage.damageMul(e, HB_TORSO)) ?? amount;
    if (e.kind !== "madame" || !this.boss) return amount;
    return this.boss.clampDamage(e, amount * this.boss.damageMul(HB_TORSO));
  }

  /** Damage to an enemy (a hit, or round 3's blasts and the chandelier): the flinch, the heavy's
   *  stagger, the kill. `shot` = the player's (the kill counts and the kill cam replays it); `weapon`
   *  what did it (a gun id, or round 3's "heart": her grenade shot in her hand, "chandelier"). */
  damageEnemy(e: Enemy, amount: number, part: number, dx: number, dz: number, shot: { ox: number; oy: number; oz: number; x: number; y: number; z: number } | null, blast = false, weapon = ""): void {
    if (e.state === "dead" || amount <= 0) return;
    const target = e.idx;
    if (e.kind === "madame" && this.boss) amount = this.boss.clampDamage(e, amount);
    if (this.stage?.clampDamage) amount = this.stage.clampDamage(e, amount);
    e.hp -= amount;
    e.flinch = e.kind === "madame" ? MADAME.flinch : e.kind === "countess" ? COUNTESS.flinch : AI.flinch;
    if (e.weapon === "sniper" && e.kind !== "countess") e.tell = 0; // a hit spoils her aim
    this.emit({ type: "hurt", target, amount, part, hp: Math.max(0, e.hp) });
    if (e.state === "idle") alertGoon(this, e, 0);
    if (e.kind === "heavy" && e.hp > 0) {
      // a stagger needs 40+ in one hit: a shotgun blast's pellets land within a few steps of each other
      if (this.time - (this.heavyHitT[e.idx] ?? -1e9) > 0.08) { this.heavyHitT[e.idx] = this.time; this.heavyHit[e.idx] = 0; }
      this.heavyHit[e.idx] += amount;
      if (this.heavyHit[e.idx] >= HEAVY.staggerAt && e.stagger <= 0) {
        e.stagger = HEAVY.stagger;
        e.tell = 0;
        this.heavyHit[e.idx] = -1e9; // once per blast
        this.emit({ type: "stagger", enemy: e.idx });
      }
    }
    if (e.hp <= 0) this.killEnemy(e, part === HB_HEAD, dx, dz, shot, blast, true, weapon);
  }

  /** Heavy stagger accounting: damage summed over one blast (per enemy) and when it started. */
  private readonly heavyHit: number[] = [];
  private readonly heavyHitT: number[] = [];

  private killEnemy(e: Enemy, headshot: boolean, dx: number, dz: number, shot: { ox: number; oy: number; oz: number; x: number; y: number; z: number } | null, blast = false, chase = true, weapon = ""): void {
    setState(e, "dead");
    e.hit.hittable = false;
    e.hit.pose.stance = "dead";
    e.headshot = headshot;
    const l = Math.sqrt(dx * dx + dz * dz) || 1;
    e.killDX = dx / l;
    e.killDZ = dz / l;
    onGoonDeath(this, e);
    e.tell = 0;
    e.stagger = 0;
    // round 3: the boss down: her adds run (they are not counted any more), so the clear is her kill
    if (e.kind === "madame") this.boss?.down(this);
    this.stage?.onKill?.(this, e);
    if (e.drop && PICKUPS[e.drop]) {
      // the gun (or ammo) lands at the body; off a perch it falls 1.3 m out toward him, to the ground below
      let x = e.x, z = e.z, y = e.y;
      if (e.perch) {
        // off the perch to the ground below: the shortest way off it (1.3-4 m), the way toward him first
        const a0 = Math.atan2(this.player.x - e.x, this.player.z - e.z);
        let best: { x: number; y: number; z: number; d: number } | null = null;
        for (let i = 0; i < 8 && !(best && best.d <= 1.3); i++) {
          const a = a0 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 4);
          for (let d = 1.3; d <= 4.01 && (!best || d < best.d); d += 0.45) {
            const tx = e.x + Math.sin(a) * d, tz = e.z + Math.cos(a) * d;
            const gy = this.world.groundBelow(tx, tz, 0.1, e.y + 0.5);
            if (Number.isFinite(gy) && gy < e.y - 1) { best = { x: tx, y: gy, z: tz, d }; break; }
          }
        }
        if (best) { x = best.x; y = best.y; z = best.z; }
      }
      const k: Pickup = { id: `drop-${e.id}`, item: e.drop, amount: PICKUPS[e.drop].amount, x, y, z, taken: false };
      this.pickups.push(k);
      this.emit({ type: "drop", id: k.id, item: k.item, x: k.x, y: k.y, z: k.z, fromY: e.y + 1 });
    }
    const final = this.alive === 0;
    if (shot) {
      this.stats.kills++;
      if (headshot) this.stats.headshots++;
      this.meter = Math.min(METER.max, this.meter + (headshot ? METER.headshotRefill : METER.killRefill) * this.diff.killRefill);
      this.lastPlayerKill = { from: { x: shot.ox, y: shot.oy, z: shot.oz }, to: { x: shot.x, y: shot.y, z: shot.z }, enemy: e.idx, headshot, chase };
    }
    this.emit({ type: "kill", target: e.idx, headshot, final, ...(blast ? { blast } : {}), ...(shot ? { weapon, shot: { ...shot } } : {}) });
    if (final && this.phase === "play") {
      this.emit({ type: "roomClear" });
      if (shot && this.lastPlayerKill) this.startKillcam(this.lastPlayerKill);
      else this.setPhase("clear");
    }
  }

  private startKillcam(k: { from: V3; to: V3; enemy: number; headshot: boolean; chase: boolean }): void {
    this.setBulletTime(false);
    const e = this.enemies[k.enemy];
    e.deathHold = true;
    const dist = Math.sqrt((k.to.x - k.from.x) ** 2 + (k.to.y - k.from.y) ** 2 + (k.to.z - k.from.z) ** 2);
    // the bullet crosses in real time at world speed x 0.1, capped to fit the cam
    const flightReal = Math.min(KILLCAM.real - KILLCAM.hold, Math.max(0.35, dist / (PROJECTILE_SPEED * TIME.killCam)));
    this.killcam = { t: 0, dur: flightReal + KILLCAM.hold, flight: flightReal, from: { ...k.from }, to: { ...k.to }, enemy: k.enemy, headshot: k.headshot, chase: k.chase };
    this.setPhase("killcam");
    this.emit({ type: "killcam", on: true });
  }

  private stepKillcam(inp: InputFrame): void {
    const k = this.killcam;
    if (!k) { this.setPhase("clear"); return; }
    k.t += DT;
    const e = this.enemies[k.enemy];
    if (e && e.deathHold && k.t >= k.flight) e.deathHold = false;
    if (k.t >= k.dur || inp.skip) {
      if (e) e.deathHold = false;
      this.killcam = null;
      this.setPhase("clear");
      this.emit({ type: "killcam", on: false });
    }
  }

  hurtPlayer(amount: number, shooter: number): void {
    const p = this.player;
    if (p.mode === "dead") return;
    p.health -= amount;
    this.stats.damageTaken += Math.min(amount, Math.max(0, p.health + amount));
    this.hurtAt = this.realTime;
    // the shooter's position rides along (the HUD's damage-direction slash); falls have none
    const from = shooter >= 0 ? this.enemies[shooter] : undefined;
    this.emit({ type: "hurt", target: PLAYER_ID, amount, part: HB_TORSO, hp: Math.max(0, p.health), ...(from ? { shooter, fromX: from.x, fromZ: from.z } : {}) });
    if (p.health <= 0) {
      p.health = 0;
      p.mode = "dead";
      p.modeT = 0;
      p.hit.hittable = false;
      this.setBulletTime(false);
      this.emit({ type: "playerDead" });
    }
  }

  // ---- enemies --------------------------------------------------------------------------------

  private moveEnemy(e: Enemy, dt: number): void {
    if (e.state === "dead") {
      if (!e.deathHold) e.deadT += dt;
      return;
    }
    if (e.state === "inactive") { e.hit.hittable = false; return; }
    // a grenade at her feet: run out of it (after a beat); a strike's shove on top of whatever she does
    if (e.fleeWait > 0) { e.fleeWait -= dt; if (e.fleeWait <= 0) e.fleeT = GRENADE.flee; }
    else if (e.fleeT > 0) { e.fleeT -= dt; const run = ENEMY[e.kind].run; e.vx = e.fleeX * run; e.vz = e.fleeZ * run; }
    if (e.knockT > 0) { e.knockT -= dt; e.vx += e.knockX; e.vz += e.knockZ; }
    const r = ENEMY[e.kind].radius;
    if (e.vx || e.vz) {
      let nx = e.x + e.vx * dt, nz = e.z + e.vz * dt;
      // separation from other goons
      for (const o of this.enemies) {
        if (o === e || o.state === "dead" || o.state === "inactive") continue;
        const dx = nx - o.x, dz = nz - o.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.36 && d2 > 1e-8) { const d = Math.sqrt(d2); nx += (dx / d) * (0.6 - d) * 0.5; nz += (dz / d) * (0.6 - d) * 0.5; }
      }
      const o = this.v3 as unknown as { x: number; z: number };
      this.world.pushOut(nx, nz, r, e.y, e.y + 1.8, e.y + PLAYER.stepUp, o);
      e.x = o.x;
      e.z = o.z;
      const gy = this.world.groundBelow(e.x, e.z, r, e.y + PLAYER.stepUp);
      if (Number.isFinite(gy)) e.y = gy;
    }
    this.syncEnemyPose(e);
  }

  syncEnemyPose(e: Enemy): void {
    const pose = e.hit.pose;
    pose.x = e.x; pose.y = e.y; pose.z = e.z; pose.yaw = e.facing;
    pose.stance = e.state === "dead" ? "dead" : e.crouch ? "crouch" : "stand";
    pose.lean = e.lean;
    e.hit.hittable = e.state !== "dead" && e.state !== "inactive" && !e.fled;
  }

  // ---- determinism ----------------------------------------------------------------------------

  /** FNV-1a over the whole gameplay state (replay tests compare these). */
  hash(): string {
    const h = new Fnv1a();
    const p = this.player;
    h.f64(p.x).f64(p.y).f64(p.z).f64(p.vx).f64(p.vy).f64(p.vz).f64(p.health).i32(p.copium).str(p.mode).f64(p.modeT);
    h.str(p.weapon.id).i32(p.weapon.mags[0]).i32(p.weapon.mags[1]).f64(p.weapon.cooldown).f64(p.weapon.reloadT).f64(p.weapon.reserve);
    h.f64(this.meter).f64(this.timeScale).f64(this.time).i32(this.rng.s).str(this.phase);
    for (const e of this.enemies) h.f64(e.x).f64(e.z).f64(e.facing).f64(e.hp).str(e.state).f64(e.timer).i32(e.cover).f64(e.tell).f64(e.stagger).str(e.role);
    h.f64(this.tactics.x).f64(this.tactics.z).f64(this.tactics.t).f64(this.tactics.nadeAt).f64(this.tactics.fx).f64(this.tactics.fz);
    h.i32(this.projectiles.length).i32(this.breached.length).f64(this.breachSlow);
    for (const b of this.projectiles) h.f64(b.x).f64(b.y).f64(b.z);
    h.i32(p.guard ? 1 : 0).i32(p.guardLock ? 1 : 0).f64(p.guardT).f64(p.guardMeter).f64(p.guardBroken).f64(p.shoveT).f64(this.guardHoldUntil);
    h.i32(p.cover).f64(p.coverU).f64(p.coverPop).i32(p.coverEnd).i32(p.dashSeg).f64(p.shoulder).f64(p.pivotUp);
    h.i32(p.grenades).i32(p.nadeUp ? 1 : 0).i32(p.banked).f64(p.meleeT).i32(p.zoom ? 1 : 0).i32(this.found.length).i32(this.opened.length).i32(this.broken.length).i32(this.grenadesLive.length);
    for (const gr of this.grenadesLive) h.f64(gr.x).f64(gr.y).f64(gr.z).f64(gr.fuse);
    this.ride?.hashInto(h);
    this.boss?.hashInto(h);
    this.stage?.hashInto(h);
    return h.hex();
  }
}

/** The point of a yawed box's footprint nearest to (x, z). */
export function boxNearest(b: Box, x: number, z: number): { x: number; z: number } {
  const dx = x - b.cx, dz = z - b.cz;
  const lx = Math.max(-b.hx, Math.min(b.hx, dx * b.cos - dz * b.sin)), lz = Math.max(-b.hz, Math.min(b.hz, dx * b.sin + dz * b.cos));
  return { x: b.cx + lx * b.cos + lz * b.sin, z: b.cz - lx * b.sin + lz * b.cos };
}

/** Horizontal distance from (x, z) to a yawed box's footprint (0 inside it). */
export function boxDist(b: Box, x: number, z: number): number {
  const dx = x - b.cx, dz = z - b.cz;
  const lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos;
  const ex = Math.max(0, Math.abs(lx) - b.hx), ez = Math.max(0, Math.abs(lz) - b.hz);
  return Math.hypot(ex, ez);
}

/** A string's hash in 0..1 (FNV-1a): stable per id, whatever the seed. */
export function hashStr(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export function insideTrigger(t: Marker, x: number, y: number, z: number): boolean {
  const dx = x - t.x, dz = z - t.z;
  const c = Math.cos(t.yaw), s = Math.sin(t.yaw);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= t.hx && Math.abs(lz) <= t.hz && Math.abs(y - t.y) <= Math.max(t.hy, 1.5);
}

const frozen: InputFrame = { moveX: 0, moveY: 0, yaw: 0, pitch: 0, fire: false, bt: false, dodge: false, jump: false, reload: false, copium: false, slot: 0, skip: false, melee: false, throw: false, interact: false, zoom: false, guard: false, cover: false, aim: false, nade: false };
/** Outside control (kill cam, results) the player keeps the aim but does nothing else. */
function FROZEN_INPUT(_inp: InputFrame, p: Player): InputFrame {
  frozen.yaw = p.yaw;
  frozen.pitch = p.pitch;
  return frozen;
}
