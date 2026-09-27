// Dev arsenal tour (development builds only): ?tour with ?bot. The bot fights the room as usual, cycling
// through the new guns it owns (a few seconds each), and once the room is clear, before it walks to the
// exit, a script takes the player through the room's secrets and eggs (teleports, walks, E, a shot at a
// breakable). Moments worth a screenshot are queued in window.__tour.queue (name + when); tools/tour.ts
// takes them. The first shot with each gun, a melee, a grenade going off, the scope, a weapon picked up,
// a secret found, a door opening, an egg, are all queued from the events.
import type { Game } from "../../sim/game.ts";
import type { Bot } from "../../sim/bot.ts";
import type { InputFrame, GameEvent } from "../../sim/types.ts";
import { SHOULDER } from "../../sim/aim.ts";
import { WEAPONS, type WeaponId } from "../../combat/weapons.ts";
import type { Session } from "../session.ts";

const DEV = import.meta.env.MODE !== "production";
const params = new URLSearchParams(location.search);
export const TOUR = DEV && params.has("tour");

type Step =
  | { take: string }
  | { zoom: number; at: [number, number, number] }
  | { melee: true }
  | { tp: [number, number, number]; at?: [number, number, number]; hold?: number }
  | { walk: [number, number]; at?: [number, number, number] }
  | { look: [number, number, number]; hold?: number }
  | { use: true }
  | { fire: number; every?: number; until?: string }
  | { shot: string; hold?: number };

const SCRIPTS: Record<string, Step[]> = {
  room1: [
    // the sniper's rifle she dropped off the fire escape: take it, scope the club door, fire; a melee swing
    { take: "drop-goon-fire-escape-s" }, { zoom: 1.4, at: [15.2, 1.6, -14.5] }, { melee: true },
    { tp: [-20, 0.15, 10.2], at: [-19.4, 0.8, 16.8], hold: 1.2 }, { shot: "alley-mouth", hold: 0.3 },
    { walk: [-20, 15.4] }, { look: [-19.4, 0.8, 16.8], hold: 0.8 }, { use: true }, { look: [-19.4, 0.8, 16.8], hold: 1.2 },
    { walk: [-20.5, 17.3] },
    { tp: [-18, 0.15, -10.3], at: [-18.4, 0.3, -11.6], hold: 1.0 }, { shot: "kiosk", hold: 0.3 },
    { tp: [2.3, 0.15, -11.45], at: [-3, 2.5, -11.45], hold: 0.6 }, { walk: [0.2, -11.45] }, { shot: "stairs", hold: 0.2 }, { walk: [-2.8, -11.45] },
    { walk: [-3.4, -11.6] }, { look: [-8, 3.5, -11.3], hold: 0.8 }, { shot: "nest-view", hold: 0.3 },
  ],
  room2: [
    { tp: [-18.3, 0, -2.8], at: [-19.45, 1.2, -3.9], hold: 1.0 }, { use: true }, { look: [-19.45, 1.2, -3.9], hold: 0.8 },
    { tp: [-17.6, 0, -4.1], at: [-17.6, 1.1, -5.1], hold: 0.6 }, { use: true }, { look: [-17.6, 1.1, -5.1], hold: 0.9 },
    { walk: [-17.6, -6.8] }, { walk: [-19.1, -7.5] }, { look: [-16.1, 0.5, -7.4], hold: 1.0 }, { shot: "coat-room", hold: 0.3 }, { walk: [-16.3, -6.9] },
    { tp: [7.5, 0.34, 13.2], at: [7.5, 1.4, 14.2], hold: 0.6 }, { use: true }, { look: [7.5, 1.4, 14.2], hold: 0.9 },
    { walk: [7.5, 15.3] }, { walk: [7.0, 15.9] }, { look: [7.5, 1.2, 17.2], hold: 0.5 },
    { tp: [0, 0, 5.5], at: [0, 6, 0], hold: 0.8 }, { fire: 12, every: 0.35, until: "break" }, { look: [0, 1, -1], hold: 1.6 }, { shot: "ball-fallen", hold: 0.2 }, { walk: [0, 0] },
  ],
  room3: [
    { tp: [15.9, 0, -19.6], at: [17.1, 1.0, -19.6], hold: 0.6 }, { fire: 16, every: 0.45, until: "break" }, { look: [17.1, 1.0, -19.6], hold: 0.8 },
    { walk: [18.4, -19.7] }, { look: [20.55, 1.5, -19.6], hold: 1.0 }, { shot: "photo-wall", hold: 0.3 }, { walk: [19.2, -21.0] }, { walk: [18.2, -18.3] },
    { tp: [-4.75, 0, -6.0], at: [-5.2, 1.0, -6.0], hold: 0.6 }, { use: true }, { look: [-5.2, 1.0, -6.0], hold: 0.9 }, { walk: [-6.6, -6.0] }, { look: [-8.6, 1.2, -6.0], hold: 0.8 }, { shot: "closet", hold: 0.2 }, { walk: [-8.0, -5.6] },
    { tp: [0.1, 0, 4.0], at: [-0.8, 1.0, 4.0], hold: 0.6 }, { use: true }, { look: [-0.8, 1.2, 4.0], hold: 1.0 }, { walk: [-0.7, 4.0] }, { look: [-1, 1.1, 4.0], hold: 0.8 }, { shot: "safe", hold: 0.2 },
  ],
};

/** The new guns the bot is kept on in turn during the fight (while it owns them and they have rounds). */
const CYCLE: WeaponId[] = ["handcannon", "sawedoff", "rifle", "sniper", "shotgun", "smgs"];

export const tourState = { queue: [] as Array<{ name: string; at: number }>, log: [] as string[], step: -1, script: "", done: false };

export class TourDriver {
  private readonly bot: Bot;
  private readonly room: string;
  private cycT = 0;
  private cyc = 0;
  private stepT = 0;
  private i = -1;
  private fired = 0;
  private broke = false;
  private readonly seen = new Set<string>();
  constructor(bot: Bot, s: Session) {
    this.bot = bot;
    this.room = s.roomId;
    tourState.script = this.room;
    (window as unknown as { __tour?: typeof tourState }).__tour = tourState;
    s.on(e => this.onEvent(e, s.game));
  }

  private want(name: string, delay = 0): void {
    if (this.seen.has(name)) return;
    this.seen.add(name);
    tourState.queue.push({ name, at: performance.now() + delay * 1000 });
    tourState.log.push(`${name} @${(performance.now() / 1000).toFixed(1)}`);
  }

  private onEvent(e: GameEvent, g: Game): void {
    const p = g.player;
    if (e.type === "shot" && e.shooter === -1 && e.pellet === 0) this.want(`fire-${e.weapon}`, 0.05);
    if (e.type === "melee" && e.phase === "start") this.want(`melee-${e.kind}`, 0.1);
    if (e.type === "throw") this.want("throw", 0.12);
    if (e.type === "explode") this.want("grenade-blast", 0.05);
    if (e.type === "zoom" && e.on) this.want("scope", 0.35);
    if (e.type === "pickup" && e.item !== "copium") this.want(`pickup-${e.item}${e.pin ? "-" + e.pin : ""}`, 0.3);
    if (e.type === "drop") this.want(`drop-${e.item}`, 0.35);
    if (e.type === "secret") this.want(`secret-${e.id}`, 0.4);
    if (e.type === "open") this.want(`open-${e.node}`, 0.7);
    if (e.type === "break") { this.broke = true; this.want(`break-${e.node}`, 0.1); }
    if (e.type === "interact") this.want(`egg-${e.egg}`, 0.6);
    if (e.type === "kill" && e.final) this.want("final-kill", 0);
    void p;
  }

  next(g: Game): InputFrame {
    const p = g.player;
    // the fight: the bot, kept on each new gun in turn (a room with no secrets script, rooms 4-5, plays
    // out to its exit the same way once it is clear)
    const script = SCRIPTS[this.room] ?? [];
    if (g.phase !== "clear" || Math.max(this.i, 0) >= script.length) {
      this.cycT -= 1 / 120;
      if (this.cycT <= 0) {
        this.cycT = 6;
        for (let k = 0; k < CYCLE.length; k++) {
          const w = CYCLE[(this.cyc + k) % CYCLE.length];
          const a = p.arsenal[w];
          if (a && a.mags[0] + a.mags[1] + (a.reserve === Infinity ? 1 : a.reserve) > 0) { this.bot.only = w; this.cyc = (this.cyc + k + 1) % CYCLE.length; break; }
        }
      }
      const f = this.bot.next(g);
      // the scope with the sniper on a far target
      if (p.weapon.id === "sniper" && g.aimEnemy >= 0 && Math.hypot(g.aimPoint.x - p.x, g.aimPoint.z - p.z) > 10) { f.zoom = true; f.moveX = 0; }
      if (this.i >= script.length) tourState.done = true;
      return f;
    }
    // the secrets tour once the room is clear
    const f = this.bot.next(g);
    f.fire = f.bt = f.dodge = f.jump = f.reload = f.copium = false;
    f.melee = f.throw = f.interact = f.zoom = false;
    f.slot = 0; f.moveX = 0; f.moveY = 0;
    if (this.i < 0) { this.i = 0; this.stepT = 0; }
    const st = script[this.i];
    if (!st) { tourState.done = true; return f; }
    tourState.step = this.i;
    this.stepT += 1 / 120;
    let done = false;
    const aimAt = (x: number, y: number, z: number) => {
      const c = Math.cos(f.yaw), sn = Math.sin(f.yaw);
      const qx = p.x + c * SHOULDER.right, qz = p.z - sn * SHOULDER.right, qy = p.y + p.pivotUp;
      const ex = x - qx, ey = y - qy, ez = z - qz, el = Math.hypot(ex, ey, ez) || 1;
      f.yaw = Math.atan2(-ex, -ez);
      f.pitch = Math.asin(Math.max(-1, Math.min(1, ey / el)));
    };
    f.yaw = p.yaw; f.pitch = p.pitch;
    if ("tp" in st) {
      if (this.stepT <= 1 / 120 + 1e-9) { p.x = st.tp[0]; p.y = st.tp[1]; p.z = st.tp[2]; p.vx = p.vz = p.vy = 0; }
      if (st.at) aimAt(...st.at);
      done = this.stepT >= (st.hold ?? 0.5);
    } else if ("walk" in st) {
      const dx = st.walk[0] - p.x, dz = st.walk[1] - p.z, d = Math.hypot(dx, dz);
      if (st.at) aimAt(...st.at); else if (d > 0.3) { f.yaw = Math.atan2(-dx, -dz); f.pitch = 0; }
      const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw);
      if (d > 0.1) { const k = Math.min(0.6, 0.15 + d); f.moveY = (dx * -sy + dz * -cy) / d * k; f.moveX = (dx * cy - dz * sy) / d * k; }
      done = d <= 0.12 || this.stepT > 8;
    } else if ("take" in st) {
      const k = g.pickups.find(x => x.id === st.take);
      if (!k || k.taken) done = true;
      else {
        const dx = k.x - p.x, dz = k.z - p.z, d = Math.hypot(dx, dz);
        if (this.stepT <= 1 / 120 + 1e-9 && d > 6) { p.x = k.x - (dx / d) * 5; p.z = k.z - (dz / d) * 5; }
        f.yaw = Math.atan2(-dx, -dz); f.pitch = -0.3;
        f.moveY = 0.8;
        done = this.stepT > 6;
      }
    } else if ("zoom" in st) {
      // key 5 (again) until the sniper is up
      if (p.weapon.id !== "sniper" && p.owned.includes("sniper") && Math.round(this.stepT * 120) % 12 === 1) f.slot = 5;
      aimAt(...st.at);
      f.zoom = this.stepT > 0.9;
      f.fire = this.stepT > st.zoom + 0.4 - 0.3 && this.stepT < st.zoom + 0.4 - 0.28;
      done = this.stepT > st.zoom + 0.8;
    } else if ("melee" in st) {
      f.melee = this.stepT <= 1 / 120 + 1e-9;
      done = this.stepT > 0.8;
    } else if ("look" in st) {
      aimAt(...st.look);
      done = this.stepT >= (st.hold ?? 0.5);
    } else if ("use" in st) {
      f.interact = this.stepT <= 1 / 120 + 1e-9;
      done = this.stepT > 0.1;
    } else if ("fire" in st) {
      const every = st.every ?? 0.4;
      // the sure guns for a breakable: the sniper / hand cannon / rifle / shotgun if owned
      if (this.stepT <= 1 / 120 + 1e-9) {
        this.fired = 0; this.broke = false;
        const pick = (["handcannon", "sniper", "rifle", "shotgun", "ak"] as WeaponId[]).find(w => p.owned.includes(w) && WEAPONS[w]);
        if (pick && p.weapon.id !== pick) this.bot.only = pick;
      }
      const k = Math.floor(this.stepT / every);
      f.fire = this.stepT % every < 2 / 120 && k >= 1 && this.fired < st.fire;
      if (f.fire) this.fired++;
      done = (st.until === "break" && this.broke && this.stepT > 0.3) || (this.fired >= st.fire && this.stepT > every * (st.fire + 1));
      // hold the aim where the previous step left it
    } else if ("shot" in st) {
      if (this.stepT <= 1 / 120 + 1e-9) this.want(`${this.room}-${st.shot}`, 0);
      done = this.stepT >= (st.hold ?? 0.3);
    }
    if (done) { this.i++; this.stepT = 0; }
    // keep him alive and stocked for the tour
    p.health = Math.max(p.health, 60);
    return f;
  }
}
