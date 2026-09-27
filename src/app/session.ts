// The running room outside React: level, Game, input latch, stepper, render interpolation and the
// event bus the views and audio subscribe to. PlayPage owns one; restarts swap the Game in place (the
// canvas and every view stay mounted and read session.game each frame).
import { Game, type GameOptions } from "../sim/game.ts";
import { TIME } from "../sim/tuning.ts";
import { FixedStepper } from "../sim/stepper.ts";
import { InputLatch } from "../input/input.ts";
import { assistScratch, assistTarget } from "../input/assist.ts";
import type { GameEvent, InputFrame } from "../sim/types.ts";
import type { LevelData } from "../world/level.ts";

/** Something that plays in place of the input: the test bot, or the dev hold check's script. */
export type Driver = { next(g: Game): InputFrame };

export type Listener = (e: GameEvent, s: Session) => void;

type Snap = { x: number; y: number; z: number };

/** Run ids are unique across sessions: the canvas and its views stay mounted when the next room's
 *  session replaces this one, and they must see a new run. */
let runIds = 0;

export class Session {
  readonly level: LevelData;
  /** The raw prefab (the scene mounts it; the sim read the same object). */
  readonly prefab: unknown;
  readonly roomId: string;
  opts: GameOptions;
  game: Game;
  readonly input = new InputLatch();
  readonly stepper = new FixedStepper();
  paused = true;
  /** A new id on every restart and for every new room's session (views reset their per-run state). */
  run = ++runIds;
  bot: Driver | null = null;
  record: InputFrame[] | null = null;
  private readonly listeners = new Set<Listener>();
  // interpolation
  private pPrev: Snap = { x: 0, y: 0, z: 0 };
  private pCur: Snap = { x: 0, y: 0, z: 0 };
  readonly renderP: Snap = { x: 0, y: 0, z: 0 };
  private ePrev: Snap[] = [];
  private eCur: Snap[] = [];
  renderE: Snap[] = [];
  /** Steps run in the last frame (0 while paused). */
  stepsLast = 0;
  /** A kill cam holds the fight (cine.ts): no steps run (the sim never sees it) and the views crawl
   *  at the cam's own speed (viewScale). Any key ends it. */
  hold = false;
  /** Called after each step's events went out (the kill cam decides there whether to hold). */
  afterStep: (() => void) | null = null;
  /** An enemy the kill cam has in hand (its ride, or its round still flying on): no bark of hers or his
   *  (a victim does not grunt at the start of the ride). Set by SimDriver. */
  quiet: ((enemy: number) => boolean) | null = null;
  /** The next step skips the sim's final-kill cam (Kill cam: Off). It goes through the input frame, so
   *  a recorded log replays it. */
  skipNext = false;
  /** The views' world speed this frame: 0 paused, the kill cam's crawl while it holds, else the sim's. */
  crawl = 0.06;
  get viewScale(): number {
    return this.paused ? 0 : this.hold ? this.crawl : this.game.timeScale;
  }
  /** The player's own clock for the views (bullet time slows him only to half). */
  get playerScale(): number {
    return this.paused ? 0 : this.hold ? this.crawl : Math.max(this.game.timeScale, TIME.playerInBulletTime);
  }
  /** Gamepad Start pressed (the page pauses, or starts the fight from its prompt). */
  onPadStart: (() => void) | null = null;
  /** Gamepad A pressed (the page starts the fight from its prompt). Called after the poll and
   *  before this frame's steps, so a flush here drops the press before it becomes a jump. */
  onPadA: (() => void) | null = null;

  constructor(level: LevelData, prefab: unknown, roomId: string, opts: GameOptions) {
    this.level = level;
    this.prefab = prefab;
    this.roomId = roomId;
    this.opts = opts;
    this.game = new Game(level, opts);
    this.input.yaw = this.game.player.yaw;
    // the pad's aim assist reads the running room (never while paused, held by a kill cam or botted)
    const scratch = assistScratch();
    this.input.assistQuery = (yaw, pitch) => (this.paused || this.hold || this.bot ? null : assistTarget(this.game, yaw, pitch, scratch));
    this.snapAll();
  }

  on(f: Listener): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  /** New attempt (optionally with new options: difficulty, seed). */
  restart(opts?: GameOptions): void {
    if (opts) this.opts = { ...this.opts, ...opts };
    this.game = new Game(this.level, this.opts);
    this.input.yaw = this.game.player.yaw;
    this.input.pitch = 0;
    this.input.flush();
    this.stepper.reset();
    this.hold = false;
    this.skipNext = false;
    this.run = ++runIds;
    this.snapAll();
  }

  private snapAll(): void {
    const g = this.game;
    const p = g.player;
    this.pPrev = { x: p.x, y: p.y, z: p.z };
    this.pCur = { x: p.x, y: p.y, z: p.z };
    Object.assign(this.renderP, this.pCur);
    this.ePrev = g.enemies.map(e => ({ x: e.x, y: e.y, z: e.z }));
    this.eCur = g.enemies.map(e => ({ x: e.x, y: e.y, z: e.z }));
    this.renderE = g.enemies.map(e => ({ x: e.x, y: e.y, z: e.z }));
  }

  /** One rendered frame: poll input, run the fixed steps, dispatch events, interpolate. */
  frame(delta: number): void {
    // the sniper in hand: right mouse / LT hold the scope
    this.input.zoomMode = this.game.player.weapon.id === "sniper";
    // the pad's Square uses what is in reach (a secret door, an egg), else it reloads
    const ph = this.game.phase;
    this.input.useHere = (ph === "play" || ph === "clear") && this.game.useTarget() !== null;
    this.input.poll(Math.min(delta, 0.1));
    if (this.input.padStart) this.onPadStart?.();
    if (this.input.padA) this.onPadA?.();
    const g = this.game;
    this.stepsLast = 0;
    if (!this.paused && !this.hold) {
      const n = this.stepper.frame(delta);
      for (let i = 0; i < n; i++) {
        const p = g.player;
        this.pPrev.x = p.x; this.pPrev.y = p.y; this.pPrev.z = p.z;
        for (let k = 0; k < g.enemies.length; k++) { const e = g.enemies[k], s = this.ePrev[k]; s.x = e.x; s.y = e.y; s.z = e.z; }
        const f = this.bot ? this.bot.next(g) : this.input.consume();
        if (this.bot) { this.input.yaw = f.yaw; this.input.pitch = f.pitch; }
        if (this.skipNext && g.phase === "killcam") { f.skip = true; this.skipNext = false; }
        if (this.record) this.record.push({ ...f });
        g.step(f);
        this.pCur.x = p.x; this.pCur.y = p.y; this.pCur.z = p.z;
        for (let k = 0; k < g.enemies.length; k++) { const e = g.enemies[k], s = this.eCur[k]; s.x = e.x; s.y = e.y; s.z = e.z; }
        for (const ev of g.drain()) for (const l of this.listeners) l(ev, this);
        this.stepsLast++;
        this.afterStep?.();
        if (this.hold) break; // a kill cam took over: the rest of this frame's time is the cam's
      }
    }
    const a = this.stepper.alpha;
    const lerp = (o: Snap, p: Snap, c: Snap) => { o.x = p.x + (c.x - p.x) * a; o.y = p.y + (c.y - p.y) * a; o.z = p.z + (c.z - p.z) * a; };
    lerp(this.renderP, this.pPrev, this.pCur);
    for (let k = 0; k < this.renderE.length; k++) lerp(this.renderE[k], this.ePrev[k], this.eCur[k]);
  }
}
