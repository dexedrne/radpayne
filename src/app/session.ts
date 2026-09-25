// The running room outside React: level, Game, input latch, stepper, render interpolation and the
// event bus the views and audio subscribe to. PlayPage owns one; restarts swap the Game in place (the
// canvas and every view stay mounted and read session.game each frame).
import { Game, type GameOptions } from "../sim/game.ts";
import { FixedStepper } from "../sim/stepper.ts";
import { InputLatch } from "../input/input.ts";
import type { GameEvent, InputFrame } from "../sim/types.ts";
import type { LevelData } from "../world/level.ts";
import { Bot } from "../sim/bot.ts";

export type Listener = (e: GameEvent, s: Session) => void;

type Snap = { x: number; y: number; z: number };

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
  /** Bumped on restart (views reset their per-run state). */
  run = 0;
  bot: Bot | null = null;
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

  constructor(level: LevelData, prefab: unknown, roomId: string, opts: GameOptions) {
    this.level = level;
    this.prefab = prefab;
    this.roomId = roomId;
    this.opts = opts;
    this.game = new Game(level, opts);
    this.input.yaw = this.game.player.yaw;
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
    this.run++;
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
    this.input.poll(Math.min(delta, 0.1));
    const g = this.game;
    this.stepsLast = 0;
    if (!this.paused) {
      const n = this.stepper.frame(delta);
      for (let i = 0; i < n; i++) {
        const p = g.player;
        this.pPrev.x = p.x; this.pPrev.y = p.y; this.pPrev.z = p.z;
        for (let k = 0; k < g.enemies.length; k++) { const e = g.enemies[k], s = this.ePrev[k]; s.x = e.x; s.y = e.y; s.z = e.z; }
        const f = this.bot ? this.bot.next(g) : this.input.consume();
        if (this.bot) { this.input.yaw = f.yaw; this.input.pitch = f.pitch; }
        if (this.record) this.record.push({ ...f });
        g.step(f);
        this.pCur.x = p.x; this.pCur.y = p.y; this.pCur.z = p.z;
        for (let k = 0; k < g.enemies.length; k++) { const e = g.enemies[k], s = this.eCur[k]; s.x = e.x; s.y = e.y; s.z = e.z; }
        for (const ev of g.drain()) for (const l of this.listeners) l(ev, this);
        this.stepsLast++;
      }
    }
    const a = this.stepper.alpha;
    const lerp = (o: Snap, p: Snap, c: Snap) => { o.x = p.x + (c.x - p.x) * a; o.y = p.y + (c.y - p.y) * a; o.z = p.z + (c.z - p.z) * a; };
    lerp(this.renderP, this.pPrev, this.pCur);
    for (let k = 0; k < this.renderE.length; k++) lerp(this.renderE[k], this.ePrev[k], this.eCur[k]);
  }
}
