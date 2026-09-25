// The simulation (spec section 7 "simulation boundary"): owns every piece of gameplay state and is
// deterministic for a given level, seed, difficulty and input log. One call to step() = one fixed
// 120 Hz step of real time; the world inside advances by DT x timeScale (bullet time = 0.3, the
// final-kill cam = 0.1), the player's movement and weapon clock by max(timeScale, 0.5), the aim is
// always real time. The React views only read this object (and drain `events`).
import { Graph } from "../ai/graph.ts";
import { alertGoon, onGoonDeath, setState } from "../ai/goon.ts";
import { stepEnemy } from "../ai/enemies.ts";
import { HB_HEAD, HB_MULT, HB_TORSO, aimPoint, makeCapsules } from "../combat/hitboxes.ts";
import { HIT_ACTOR, HIT_NONE, HIT_WORLD, makeTraceHit, trace, type HitActor, type TraceHit } from "../combat/trace.ts";
import { PICKUPS, SLOT_ORDER, SWAP_TIME, WEAPONS, makeWeapon, startReload, stepWeapon, triggerWeapon, type WeaponId } from "../combat/weapons.ts";
import type { LevelData, Marker } from "../world/level.ts";
import { makeEnemy, makePlayer, type Enemy, type EnemyKind, type Player } from "./actors.ts";
import { aimDir } from "./aim.ts";
import { Crowd } from "./crowd.ts";
import { Fnv1a, Rand, hash01 } from "./math.ts";
import { PM_DIVE, PM_GETUP, PM_JUMP, PM_LAND, PM_PRONE, muzzleOf, pivotOf, stepPlayer } from "./player.ts";
import { AI, BREACH, CHECKPOINT_MIN_HEALTH, DIFFICULTY, DODGE, DT, ENEMY, HEAVY, HEAVY_SCALE, KILLCAM, MAX_RANGE, METER, PLAYER, PROJECTILE_SPEED, RUSHER, TIME, type Difficulty } from "./tuning.ts";
import { PLAYER_ID, type GameEvent, type InputFrame, type V3 } from "./types.ts";
import { World, circleRectOverlap, type Box } from "./world.ts";

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
};

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
};

/** loadout: extra weapons owned from the start (tests, dev ?loadout=); the pistols are always owned.
 *  resume: start from a checkpoint saved in an earlier attempt (Game.saved). */
export type GameOptions = { seed?: number; difficulty?: Difficulty; ai?: boolean; loadout?: WeaponId[]; resume?: Resume };

/** What a checkpoint keeps (room 3's, after the security office): where he stands, who is down, which
 *  doors are open, what was picked up and fired, his guns and ammo, health, copium and the stats so far.
 *  A retry after it rebuilds the room from the level and applies this (deterministic, like any start). */
export type Resume = {
  x: number; y: number; z: number; facing: number;
  dead: string[]; breached: string[]; taken: string[]; fired: string[];
  drops: Array<{ id: string; item: string; x: number; y: number; z: number }>;
  owned: WeaponId[]; weapon: WeaponId; ammo: Array<[WeaponId, number, number, number]>;
  health: number; copium: number; meter: number; stats: Stats;
};

export type Stats = { kills: number; headshots: number; shots: number; hits: number; damageTaken: number; copiumUsed: number; time: number; btTime: number; dodges: number };

/** wait: real seconds the player has stood in it (the breach door's fallback); prompted: its hint was given. */
type Trigger = Marker & { fired: boolean; wait: number; prompted: boolean };
export type Pickup = { id: string; item: string; amount: number; x: number; y: number; z: number; taken: boolean };

export class Game {
  readonly level: LevelData;
  readonly world: World;
  readonly graph: Graph;
  readonly seed: number;
  readonly difficulty: Difficulty;
  readonly diff: (typeof DIFFICULTY)[Difficulty];
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
  private lastPlayerKill: { from: V3; to: V3; enemy: number; headshot: boolean } | null = null;

  constructor(level: LevelData, opts: GameOptions = {}) {
    this.level = level;
    this.seed = (opts.seed ?? 1) >>> 0;
    this.difficulty = opts.difficulty ?? "normal";
    this.diff = DIFFICULTY[this.difficulty];
    this.aiOn = opts.ai ?? true;
    this.rng = new Rand(this.seed ^ 0x5eed);
    this.world = new World(level.boxes);
    this.graph = new Graph(level.markers, this.world);
    const spawn = level.markers.find(m => m.kind === "spawn");
    const sx = spawn?.x ?? 0, sz = spawn?.z ?? 0;
    const sy = this.world.groundBelow(sx, sz, PLAYER.radius, (spawn?.y ?? 0) + 1);
    this.player = makePlayer(sx, Number.isFinite(sy) ? sy : 0, sz, spawn?.yaw ?? 0);
    this.checkpoint = { x: sx, y: this.player.y, z: sz, facing: spawn?.yaw ?? 0 };
    let n = 0;
    const drops = (level.room.drops ?? {}) as Record<string, string>;
    // a group waits unseen (inactive) only when a spawn trigger brings it in; a group named by an alert
    // or a breach trigger only (the back rooms' storage and security office) is there from the start
    const spawned = new Set(level.markers.filter(m => m.kind === "trigger" && m.data.action === "spawn" && typeof m.data.group === "string").map(m => m.data.group as string));
    for (const m of level.markers) {
      if (m.kind === "enemy") {
        const kindName = (m.data.kind as string | undefined) ?? "goon";
        if (kindName !== "goon" && kindName !== "rusher" && kindName !== "heavy") continue; // later kinds (the boss)
        const kind = kindName as EnemyKind;
        const pick = kind === "heavy" ? 0 : typeof m.data.milady === "number" ? (m.data.milady as number) : 1 + Math.floor(hash01(this.seed, n, 0x6d, 0) * POCKIT_COUNT);
        const gy = this.world.groundBelow(m.x, m.z, 0.3, m.y + 1);
        const e = makeEnemy(n, m.id, m.x, Number.isFinite(gy) ? gy : m.y, m.z, m.yaw, ENEMY[kind].hp, pick, typeof m.data.group === "string" ? m.data.group : "", kind);
        if (e.group && !spawned.has(e.group)) e.state = "idle";
        e.perch = m.data.perch === true;
        e.deaf = m.data.deaf === true;
        e.hold = m.data.hold === true;
        if (kind === "heavy") e.model = m.data.model === "rival723" || (m.data.model === undefined && n % 2 === 1) ? "rival723" : "rival652";
        if (kind === "rusher") e.engageAt = RUSHER.engage[0] + (RUSHER.engage[1] - RUSHER.engage[0]) * hash01(this.seed, n, 0x72, 1);
        // the drop at the body: the marker's, else the room's per kind, else a heavy's shotgun
        e.drop = m.data.drop === false ? "" : typeof m.data.drop === "string" ? m.data.drop : drops[kind] ?? (kind === "heavy" ? "shotgun" : "");
        const patrol = m.data.patrol;
        if (Array.isArray(patrol)) e.patrol = patrol.map(id => this.graph.nodes.findIndex(w => w.id === id)).filter(i => i >= 0);
        this.enemies.push(e);
        n++;
      } else if (m.kind === "pickup") {
        const item = (m.data.item as string) ?? "copium";
        const base = typeof m.data.amount === "number" ? (m.data.amount as number) : item === "copium" ? 1 : PICKUPS[item]?.amount ?? 1;
        // copium scales with the difficulty; weapons and ammo do not
        this.pickups.push({ id: m.id, item, amount: item === "copium" ? Math.max(1, Math.floor(base * this.diff.copium)) : base, x: m.x, y: m.y, z: m.z, taken: false });
      } else if (m.kind === "trigger") this.triggers.push({ ...m, fired: false, wait: 0, prompted: false });
    }
    this.actors = [this.player.hit, ...this.enemies.map(e => e.hit)];
    for (const e of this.enemies) this.syncEnemyPose(e);
    this.crowd = new Crowd(level.markers, this.world, this.graph, { seed: this.seed, pockitCount: POCKIT_COUNT });
    for (const w of opts.loadout ?? []) this.giveWeapon(w);
    // a loadout starts with its last weapon in hand
    const last = opts.loadout?.[opts.loadout.length - 1];
    if (last && this.player.arsenal[last]) this.player.weapon = this.player.arsenal[last]!;
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
    };
  }

  /** Rebuild the room as the checkpoint left it (no events: the views read the state). */
  private applyResume(r: Resume): void {
    const p = this.player;
    const gy = this.world.groundBelow(r.x, r.z, PLAYER.radius, r.y + 1);
    p.x = r.x; p.y = Number.isFinite(gy) ? gy : r.y; p.z = r.z; p.facing = r.facing;
    this.checkpoint = { x: p.x, y: p.y, z: p.z, facing: r.facing };
    for (const id of r.breached) if (this.world.setEnabled(id, false)) this.breached.push(id);
    for (const d of r.drops) this.pickups.push({ ...d, amount: PICKUPS[d.item]?.amount ?? 1, taken: false });
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
    p.health = Math.max(r.health, CHECKPOINT_MIN_HEALTH);
    p.copium = r.copium;
    this.meter = Math.max(r.meter, METER.start * 0.5);
    this.stats = { ...r.stats };
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
    for (const e of this.enemies) if (e.state !== "dead") n++;
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
      this.meter -= DT;
      this.stats.btTime += DT;
      if (this.meter <= 0) { this.meter = 0; this.setBulletTime(false); }
    }
    const diving = p.mode === "dive";
    if (this.breachSlow > 0) this.breachSlow = Math.max(0, this.breachSlow - DT);
    const target = this.phase === "killcam" ? TIME.killCam : this.breachSlow > 0 ? BREACH.slowScale : this.bulletTime || diving ? TIME.bulletTime : 1;
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
      if (inp.slot > 0) this.switchWeapon(inp.slot);
      if (inp.reload && startReload(p.weapon)) this.emit({ type: "reload", hand: 0 });
      if (inp.copium) this.useCopium();
      if (inp.dodge && p.mode === "normal" && p.dodgeCooldown <= 0) {
        const before = this.meter;
        if (this.meter > 0) this.meter = Math.max(0, this.meter - METER.dodgeCost);
        this.dodgeSpent = before - this.meter;
        this.stats.dodges++;
      }
    }
    const pm = stepPlayer(this.world, p, pin, DT, pdt);
    if (pm & PM_DIVE) this.emit({ type: "dodge" });
    if (pm & PM_JUMP) this.emit({ type: "jump" });
    if (pm & PM_LAND) this.emit({ type: "land", prone: (pm & PM_PRONE) !== 0 });
    if (pm & PM_GETUP) this.emit({ type: "getup" });
    if (p.y < -30) this.hurtPlayer(1000, -1);
    // a dive into a breach door (inside its trigger) takes the door out before he hits it
    if (inControl && p.mode === "dive") this.tryBreach();

    // copium over time (player clock)
    if (p.healLeft > 0 && p.mode !== "dead") {
      const add = Math.min(p.healLeft, (PLAYER.copiumHeal / PLAYER.copiumTime) * pdt);
      p.healLeft -= add;
      p.health = Math.min(PLAYER.maxHealth, p.health + add);
    }

    // aim + weapon
    this.updateAim();
    const w = p.weapon;
    if (stepWeapon(w, pdt)) this.emit({ type: "reloaded" });
    const canFire = inControl && p.mode !== "dead" && p.mode !== "getup";
    const hand = triggerWeapon(w, canFire && inp.fire);
    if (hand >= 0) this.firePlayer(hand);
    else if (canFire && inp.fire && !w.wasDown && w.reloadT > 0) this.emit({ type: "dryfire" });

    // enemies
    if (this.aiOn) for (const e of this.enemies) if (e.state !== "dead" && e.state !== "inactive") stepEnemy(this, e, wdt);
    for (const e of this.enemies) this.moveEnemy(e, wdt);
    // one alert wakes the whole room (the club: the DJ calls it)
    if (this.level.room.alertAll && !this.alarmed && this.enemies.some(e => e.state !== "idle" && e.state !== "inactive")) {
      this.alarmed = true;
      for (const e of this.enemies) alertGoon(this, e, 0.3);
    }
    this.crowd.step(wdt);

    // projectiles
    this.stepProjectiles(wdt);

    // pickups + triggers
    if (inControl && p.mode !== "dead") {
      for (const k of this.pickups) {
        if (k.taken) continue;
        const dx = k.x - p.x, dz = k.z - p.z, dy = k.y - p.y;
        if (dx * dx + dz * dz > PLAYER.pickupRadius ** 2 || dy > 2 || dy < -1) continue;
        if (k.item === "copium") {
          if (p.copium >= PLAYER.maxCopium) continue;
          const got = Math.min(k.amount, PLAYER.maxCopium - p.copium);
          p.copium += got;
          k.taken = true;
          this.emit({ type: "pickup", item: k.item, amount: got, id: k.id });
        } else if (PICKUPS[k.item]) {
          const got = this.takeWeaponPickup(k.item, k.amount);
          if (got < 0) continue; // full: leave it lying there
          k.taken = true;
          // the event names what it gave: the weapon ("shotgun") or ammo for it ("shotgun_ammo")
          this.emit({ type: "pickup", item: this.lastPickupWeapon ? k.item.replace(/_ammo$/, "") : `${PICKUPS[k.item].ammo}_ammo`, amount: got, id: k.id });
        }
      }
      for (const t of this.triggers) {
        if (t.fired && t.data.once !== false) continue;
        // conditional triggers fire on their condition only; the breach door has its own rules
        if (typeof t.data.afterKills === "number" || typeof t.data.whenClear === "string") continue;
        if (!insideTrigger(t, p.x, p.y + 0.9, p.z)) continue;
        if (t.data.action === "breach") { this.standAtDoor(t); continue; }
        this.fireTrigger(t);
      }
    }

    // conditional triggers, wherever the player is: {afterKills: N} once N hostiles are down,
    // {whenClear: group} once every hostile of that group is down
    for (const t of this.triggers) {
      if (t.fired || this.phase !== "play") continue;
      const after = t.data.afterKills, clear = t.data.whenClear;
      if (typeof after === "number") {
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

  /** Slot 1..3, or 8 / 9 = previous / next owned weapon (wheel, bumper). */
  private switchWeapon(slot: number): void {
    const p = this.player;
    if (slot >= 8) {
      const owned = SLOT_ORDER.filter(w => p.owned.includes(w));
      const i = owned.indexOf(p.weapon.id);
      slot = SLOT_ORDER.indexOf(owned[(i + (slot === 9 ? 1 : owned.length - 1)) % owned.length]) + 1;
    }
    const id = SLOT_ORDER[slot - 1];
    if (!id || !p.owned.includes(id) || p.weapon.id === id) return;
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

  /** Own a weapon (a full magazine + its reserve); false when already owned. */
  giveWeapon(id: WeaponId): boolean {
    const p = this.player;
    if (p.owned.includes(id)) return false;
    p.owned.push(id);
    p.owned.sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b));
    p.arsenal[id] = makeWeapon(id);
    return true;
  }

  /** A weapon / ammo pickup: the weapon the first time, then ammo into its reserve. Returns the rounds
   *  added (the weapon's reserve the first time), or -1 when there is no room for it. */
  private lastPickupWeapon = false;
  private takeWeaponPickup(item: string, amount: number): number {
    const d = PICKUPS[item];
    const p = this.player;
    this.lastPickupWeapon = false;
    if (d.weapon && this.giveWeapon(d.weapon)) { this.lastPickupWeapon = true; return p.arsenal[d.weapon]!.reserve; }
    const w = p.arsenal[d.ammo];
    if (!w) return -1; // ammo for a gun he does not have yet
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
    p.healLeft = PLAYER.copiumHeal;
    this.stats.copiumUsed++;
    this.emit({ type: "copium" });
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
      this.breachSlow = BREACH.slowReal;
      this.timeScale = BREACH.slowScale;
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
  }

  private firePlayer(hand: number): void {
    const p = this.player;
    const def = WEAPONS[p.weapon.id];
    const m = muzzleOf(p, hand, this.v3);
    // muzzle -> aim point, then the weapon spread
    let dx = this.aimPoint.x - m.x, dy = this.aimPoint.y - m.y, dz = this.aimPoint.z - m.z;
    let l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l < 0.5) { const a = aimDir(p.yaw, p.pitch, this.v2); dx = a.x; dy = a.y; dz = a.z; l = 1; }
    dx /= l; dy /= l; dz /= l;
    this.stats.shots += def.pellets; // accuracy counts every pellet (hits do)
    // hearing: idle goons in range wake up
    for (const e of this.enemies) {
      if (e.state !== "idle" || e.deaf) continue;
      const ex = e.x - p.x, ez = e.z - p.z;
      if (ex * ex + ez * ez < AI.hearing * AI.hearing) alertGoon(this, e, 0.15);
    }
    for (let k = 0; k < def.pellets; k++) {
      const s = this.spread(dx, dy, dz, def.spread);
      this.shoot(0, PLAYER_ID, hand, m.x, m.y, m.z, s.x, s.y, s.z, def.damage, def.id, k);
    }
  }

  /** Enemy fires at the player (accuracy falls off with distance and the player's speed). */
  enemyFire(e: Enemy, moving: boolean): void {
    const p = this.player;
    const T = ENEMY[e.kind];
    const c = Math.cos(e.facing), s = Math.sin(e.facing);
    const up = e.crouch && e.state !== "peek" ? 0.95 : T.muzzleUp;
    const reach = e.kind === "heavy" ? 0.75 * HEAVY_SCALE : 0.45, side = e.kind === "heavy" ? 0.12 : 0.18;
    const mx = e.x + s * reach - c * side, my = e.y + up, mz = e.z + c * reach + s * side;
    const tgt = this.v;
    if (!aimPoint("radbro", p.hit.pose, p.hit.pose.stance === "dive" || p.hit.pose.stance === "prone" ? HB_TORSO : HB_TORSO, tgt, this.scratchCaps)) return;
    let dx = tgt.x - mx, dy = tgt.y - my, dz = tgt.z - mz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const distF = dist <= AI.near ? 1 : dist >= AI.far ? AI.farFloor : 1 - ((1 - AI.farFloor) * (dist - AI.near)) / (AI.far - AI.near);
    const fast = p.mode === "dive" || p.mode === "roll";
    const speedF = fast ? AI.dodgeMul : 1 - AI.speedK * Math.min(1, p.speed / PLAYER.runSpeed);
    const chance = AI.baseHit * distF * speedF * this.diff.accuracy * (moving ? 0.55 : 1);
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
    if (T.pellets > 1) {
      // the heavy's pump gun: 8 pellets in a 6 deg cone, full damage within 6 m, 30 % from 16 m out
      const fall = dist <= HEAVY.near ? 1 : dist >= HEAVY.far ? HEAVY.farK : 1 - ((1 - HEAVY.farK) * (dist - HEAVY.near)) / (HEAVY.far - HEAVY.near);
      const bx = dx / l, by = dy / l, bz = dz / l;
      for (let k = 0; k < T.pellets; k++) {
        const q = this.spread(bx, by, bz, T.spread);
        this.shoot(1, e.idx, 0, mx, my, mz, q.x, q.y, q.z, T.damage * fall * this.diff.damage, e.weapon, k);
      }
      return;
    }
    this.shoot(1, e.idx, 0, mx, my, mz, dx / l, dy / l, dz / l, T.damage * this.diff.damage, e.weapon, 0);
  }

  /** Can the enemy's gun see the player (no wall between muzzle height and the body)? */
  canShoot(e: Enemy): boolean {
    const p = this.player;
    return this.world.clear(e.x, e.y + ENEMY[e.kind].muzzleUp, e.z, p.x, p.y + p.pivotUp * 0.75, p.z, true);
  }

  /** Line of sight + view cone (unless already alerted) + range. */
  canSee(e: Enemy): boolean {
    const p = this.player;
    const dx = p.x - e.x, dz = p.z - e.z;
    const d2 = dx * dx + dz * dz;
    const G = ENEMY[e.kind];
    if (d2 > G.sight * G.sight) return false;
    if (e.state === "idle") {
      // not yet alerted: only a close player is noticed (the room's alert trigger wakes the rest)
      if (d2 > G.idleSight * G.idleSight) return false;
      const d = Math.sqrt(d2) || 1;
      const fx = Math.sin(e.facing), fz = Math.cos(e.facing);
      if ((fx * dx + fz * dz) / d < G.fov) return false;
    }
    const eyeY = e.y + (e.crouch ? 1.1 : e.kind === "heavy" ? 1.45 * HEAVY_SCALE : 1.65);
    return this.world.clear(e.x, eyeY, e.z, p.x, p.y + Math.max(0.5, p.pivotUp - 0.2), p.z, true);
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
  shoot(team: 0 | 1, shooter: number, hand: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, damage: number, weapon = "pistols", pellet = 0): void {
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
      this.projectiles.push({ id, team, shooter, x: ox, y: oy, z: oz, dx, dy, dz, left: MAX_RANGE, damage, alive: true, sx: ox, sy: oy, sz: oz, weapon });
      this.emit({ type: "shot", shooter, hand, ox, oy, oz, ex: ox + dx * MAX_RANGE, ey: oy + dy * MAX_RANGE, ez: oz + dz * MAX_RANGE, projectile: true, id, weapon, pellet });
      return;
    }
    const h = trace(this.world, this.actors, team, ox, oy, oz, dx, dy, dz, MAX_RANGE, this.th);
    this.emit({ type: "shot", shooter, hand, ox, oy, oz, ex: h.x, ey: h.y, ez: h.z, projectile: false, id, weapon, pellet });
    this.resolveHit(h, ox, oy, oz, dx, dy, dz, damage, team, shooter, weapon);
  }

  private stepProjectiles(wdt: number): void {
    const step = PROJECTILE_SPEED * wdt;
    for (let i = 0; i < this.projectiles.length; i++) {
      const b = this.projectiles[i];
      const len = Math.min(step, b.left);
      const h = trace(this.world, this.actors, b.team, b.x, b.y, b.z, b.dx, b.dy, b.dz, len, this.th);
      if (h.kind !== HIT_NONE) {
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
      return;
    }
    if (h.kind !== HIT_ACTOR) return;
    const target = h.actor - 1; // -1 = player
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
    const amount = damage * HB_MULT[h.part];
    e.hp -= amount;
    if (team === 0) this.stats.hits++;
    e.flinch = AI.flinch;
    this.emit({ type: "hurt", target, amount, part: h.part, hp: Math.max(0, e.hp) });
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
    if (e.hp <= 0) {
      const blast = team === 0 && weapon === "shotgun" && (e.x - ox) ** 2 + (e.z - oz) ** 2 < 4 * 4;
      this.killEnemy(e, h.part === HB_HEAD, dx, dz, team === 0 ? { ox, oy, oz, x: h.x, y: h.y, z: h.z } : null, blast);
    }
  }

  /** Heavy stagger accounting: damage summed over one blast (per enemy) and when it started. */
  private readonly heavyHit: number[] = [];
  private readonly heavyHitT: number[] = [];

  private killEnemy(e: Enemy, headshot: boolean, dx: number, dz: number, shot: { ox: number; oy: number; oz: number; x: number; y: number; z: number } | null, blast = false): void {
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
    if (e.drop && PICKUPS[e.drop]) {
      // the gun (or ammo) lands at the body
      const k: Pickup = { id: `drop-${e.id}`, item: e.drop, amount: PICKUPS[e.drop].amount, x: e.x, y: e.y, z: e.z, taken: false };
      this.pickups.push(k);
      this.emit({ type: "drop", id: k.id, item: k.item, x: k.x, y: k.y, z: k.z });
    }
    const final = this.alive === 0;
    if (shot) {
      this.stats.kills++;
      if (headshot) this.stats.headshots++;
      this.meter = Math.min(METER.max, this.meter + (headshot ? METER.headshotRefill : METER.killRefill));
      this.lastPlayerKill = { from: { x: shot.ox, y: shot.oy, z: shot.oz }, to: { x: shot.x, y: shot.y, z: shot.z }, enemy: e.idx, headshot };
    }
    this.emit({ type: "kill", target: e.idx, headshot, final, ...(blast ? { blast } : {}) });
    if (final && this.phase === "play") {
      this.emit({ type: "roomClear" });
      if (shot && this.lastPlayerKill) this.startKillcam(this.lastPlayerKill);
      else this.setPhase("clear");
    }
  }

  private startKillcam(k: { from: V3; to: V3; enemy: number; headshot: boolean }): void {
    this.setBulletTime(false);
    const e = this.enemies[k.enemy];
    e.deathHold = true;
    const dist = Math.sqrt((k.to.x - k.from.x) ** 2 + (k.to.y - k.from.y) ** 2 + (k.to.z - k.from.z) ** 2);
    // the bullet crosses in real time at world speed x 0.1, capped to fit the cam
    const flightReal = Math.min(KILLCAM.real - KILLCAM.hold, Math.max(0.35, dist / (PROJECTILE_SPEED * TIME.killCam)));
    this.killcam = { t: 0, dur: flightReal + KILLCAM.hold, flight: flightReal, from: { ...k.from }, to: { ...k.to }, enemy: k.enemy, headshot: k.headshot };
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
    e.hit.hittable = e.state !== "dead" && e.state !== "inactive";
  }

  // ---- determinism ----------------------------------------------------------------------------

  /** FNV-1a over the whole gameplay state (replay tests compare these). */
  hash(): string {
    const h = new Fnv1a();
    const p = this.player;
    h.f64(p.x).f64(p.y).f64(p.z).f64(p.vx).f64(p.vy).f64(p.vz).f64(p.health).i32(p.copium).str(p.mode).f64(p.modeT);
    h.str(p.weapon.id).i32(p.weapon.mags[0]).i32(p.weapon.mags[1]).f64(p.weapon.cooldown).f64(p.weapon.reloadT).f64(p.weapon.reserve);
    h.f64(this.meter).f64(this.timeScale).f64(this.time).i32(this.rng.s).str(this.phase);
    for (const e of this.enemies) h.f64(e.x).f64(e.z).f64(e.facing).f64(e.hp).str(e.state).f64(e.timer).i32(e.cover).f64(e.tell).f64(e.stagger);
    h.i32(this.projectiles.length).i32(this.breached.length).f64(this.breachSlow);
    for (const b of this.projectiles) h.f64(b.x).f64(b.y).f64(b.z);
    return h.hex();
  }
}

export function insideTrigger(t: Marker, x: number, y: number, z: number): boolean {
  const dx = x - t.x, dz = z - t.z;
  const c = Math.cos(t.yaw), s = Math.sin(t.yaw);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= t.hx && Math.abs(lz) <= t.hz && Math.abs(y - t.y) <= Math.max(t.hy, 1.5);
}

const frozen: InputFrame = { moveX: 0, moveY: 0, yaw: 0, pitch: 0, fire: false, bt: false, dodge: false, jump: false, reload: false, copium: false, slot: 0, skip: false };
/** Outside control (kill cam, results) the player keeps the aim but does nothing else. */
function FROZEN_INPUT(_inp: InputFrame, p: Player): InputFrame {
  frozen.yaw = p.yaw;
  frozen.pitch = p.pitch;
  return frozen;
}
