// The rave crowd (round-2 plan section 2): non-hostile dancers from the level's "crowd" markers. They
// are never part of the fight: not in the trace, never hit, never block the player or the gang, and not
// in Game.hash() (they have their own seeded random, so combat replays do not depend on them).
//   dance (or drink / sit) -> the first shot anywhere: startle (0-0.6 s later, farther = later) ->
//   flee along the waypoint graph to the nearest "crowdExit" that does not lead past the player ->
//   fade out behind the door. No way out: she runs to the nearest wall and cowers there.
// Runs on world time (bullet time slows the stampede with everything else).
import type { Graph } from "../ai/graph.ts";
import type { Marker } from "../world/level.ts";
import { Rand } from "./math.ts";
import { circleRectOverlap, type Box, type World } from "./world.ts";
import { CROWD } from "./tuning.ts";

export type DancerState = "dance" | "startle" | "flee" | "cower" | "gone";

export type Dancer = {
  i: number;
  /** The crowd marker she came from. */
  from: string;
  role: string;
  /** Pockit model number (seeded unless the marker names one). */
  milady: number;
  x: number;
  y: number;
  z: number;
  facing: number;
  state: DancerState;
  /** World seconds in the current state. */
  stateT: number;
  /** Startle delay left after the first shot. */
  delay: number;
  /** Idle clip before the scatter (a dance, Drink_Idle, Sit_Idle, DJ_Idle ...). */
  clip: string;
  /** 0..1 start phase of her idle clip (the dancers are not in lockstep). */
  phase: number;
  /** The exit she runs for ("" = none: she cowers). */
  exit: string;
  path: Array<{ x: number; z: number }>;
  pathI: number;
  /** Speed this step (m/s): the view picks the run clip rate from it. */
  speed: number;
  /** 1 = visible, 0 = gone (the fade behind the door). */
  fade: number;
  /** Seated (a booth): she stands up at (standX, standZ) before she runs (NaN = where she is). */
  seated: boolean;
  standX: number;
  standZ: number;
};

export type CrowdOptions = { seed: number; pockitCount: number };

const DIRS = Array.from({ length: 12 }, (_, k) => [Math.sin((k / 12) * Math.PI * 2), Math.cos((k / 12) * Math.PI * 2)] as const);

export class Crowd {
  readonly people: Dancer[] = [];
  readonly exits: Marker[];
  /** World time of the scatter (-1 = still dancing). */
  scatterAt = -1;
  private readonly rng: Rand;
  private readonly world: World;
  private readonly graph: Graph;
  private readonly near: Box[] = [];

  constructor(markers: readonly Marker[], world: World, graph: Graph, o: CrowdOptions) {
    this.world = world;
    this.graph = graph;
    this.rng = new Rand((o.seed ^ 0xc40d) >>> 0);
    this.exits = markers.filter(m => m.kind === "crowdExit");
    // an armed girl mixed into the dancers keeps her own spot
    const armed = markers.filter(m => m.kind === "enemy");
    for (const m of markers) {
      if (m.kind !== "crowd") continue;
      const count = Math.max(0, Math.floor(Number(m.data.count ?? 1)));
      const clips = Array.isArray(m.data.clips) && m.data.clips.length ? (m.data.clips as string[]) : ["Dance_1"];
      const c = Math.cos(m.yaw), s = Math.sin(m.yaw);
      for (let k = 0; k < count; k++) {
        // a spot in the marker's area, apart from the others and out of the furniture (the one-person
        // markers are exact spots: a bar stool, a booth seat)
        let x = m.x, z = m.z;
        for (let tries = 0; tries < 40 && count > 1; tries++) {
          const lx = (this.rng.next() * 2 - 1) * m.hx, lz = (this.rng.next() * 2 - 1) * m.hz;
          x = m.x + lx * c + lz * s;
          z = m.z - lx * s + lz * c;
          if (this.free(x, z, m.y) && this.people.every(p => (p.x - x) ** 2 + (p.z - z) ** 2 >= CROWD.spacing ** 2) && armed.every(a => (a.x - x) ** 2 + (a.z - z) ** 2 >= 1.1 ** 2)) break;
        }
        const seated = m.data.seated === true;
        const stand = Array.isArray(m.data.stand) ? (m.data.stand as number[]) : null;
        const gy = seated ? m.y : world.groundBelow(x, z, 0.2, m.y + 1);
        const milady = typeof m.data.milady === "number" ? m.data.milady : 1 + Math.floor(this.rng.next() * o.pockitCount);
        this.people.push({
          i: this.people.length, from: m.id, role: typeof m.data.role === "string" ? m.data.role : "", milady,
          x, y: Number.isFinite(gy) ? gy : m.y, z, facing: m.yaw + (count > 1 ? (this.rng.next() - 0.5) * 1.2 : 0),
          state: "dance", stateT: 0, delay: 0, clip: clips[Math.floor(this.rng.next() * clips.length)], phase: this.rng.next(),
          exit: typeof m.data.flee === "string" ? m.data.flee : "", path: [], pathI: 0, speed: 0, fade: 1,
          seated, standX: stand ? stand[0] : NaN, standZ: stand ? stand[1] : NaN,
        });
      }
    }
  }

  /** Nothing solid between knee and head height within 0.3 m of (x, z). */
  private free(x: number, z: number, y: number): boolean {
    for (const b of this.world.near(x - 0.3, z - 0.3, x + 0.3, z + 0.3, this.near)) {
      if (b.top < y + 0.3 || b.bottom > y + 1.6) continue;
      if (circleRectOverlap(b, x, z, 0.3)) return false;
    }
    return true;
  }

  get scattered(): boolean {
    return this.scatterAt >= 0;
  }

  /** How many are still on the floor (not gone). */
  get present(): number {
    let n = 0;
    for (const p of this.people) if (p.state !== "gone") n++;
    return n;
  }

  /** The first shot (world time `t`, fired from ox, oz): everyone startles, the nearest first. */
  scatter(t: number, ox: number, oz: number, px: number, pz: number): void {
    if (this.scatterAt >= 0) return;
    this.scatterAt = t;
    for (const p of this.people) {
      const d = Math.sqrt((p.x - ox) ** 2 + (p.z - oz) ** 2);
      p.delay = Math.min(CROWD.startle, (d / 24) * CROWD.startle * 0.8 + this.rng.next() * CROWD.startle * 0.25);
      this.route(p, px, pz);
    }
  }

  /** Her way out: the named exit, else the cheapest exit whose path does not run past the player. */
  private route(p: Dancer, px: number, pz: number): void {
    const cands = p.exit ? this.exits.filter(e => e.id === p.exit) : this.exits;
    let best: Array<{ x: number; z: number }> | null = null, bestCost = Infinity, bestId = "";
    // out of a booth: first to where she stands up
    const up = Number.isFinite(p.standX);
    const sx = up ? p.standX : p.x, sz = up ? p.standZ : p.z;
    for (const e of cands) {
      const found = this.graph.path(sx, p.y, sz, e.x, e.y, e.z);
      if (!found) continue;
      const path = up ? [{ x: sx, z: sz }, ...found] : found;
      let len = 0, lx = p.x, lz = p.z, past = 0;
      for (const q of path) {
        len += Math.sqrt((q.x - lx) ** 2 + (q.z - lz) ** 2);
        past = Math.max(past, 1 - Math.min(1, segDist(px, pz, lx, lz, q.x, q.z) / 3));
        lx = q.x; lz = q.z;
      }
      const cost = len + past * 30;
      if (cost < bestCost) { bestCost = cost; best = path; bestId = e.id; }
    }
    if (best) {
      p.path = best;
      p.exit = bestId;
    } else {
      // nowhere to go: the nearest wall within 5 m, else right here
      p.exit = "";
      let bt = 5, bx = sx, bz = sz;
      for (const [dx, dz] of DIRS) {
        const h = this.world.raycast(sx, p.y + 0.5, sz, dx, 0, dz, bt, false);
        if (h && h.t < bt) { bt = h.t; bx = sx + dx * Math.max(0, h.t - 0.45); bz = sz + dz * Math.max(0, h.t - 0.45); }
      }
      p.path = up ? [{ x: sx, z: sz }, { x: bx, z: bz }] : [{ x: bx, z: bz }];
    }
    p.pathI = 0;
  }

  /** One step on world time. */
  step(dt: number): void {
    const t = this.scatterAt;
    for (const p of this.people) {
      p.stateT += dt;
      p.speed = 0;
      switch (p.state) {
        case "dance":
          if (t >= 0) {
            p.delay -= dt;
            if (p.delay <= 0) { p.state = "startle"; p.stateT = 0; }
          }
          break;
        case "startle":
          if (p.stateT >= CROWD.startleTime) { p.state = p.exit ? "flee" : "cower"; p.stateT = 0; }
          if (p.state === "cower" && p.path.length) { p.state = "flee"; } // walk to the wall first
          break;
        case "flee": {
          if (p.pathI >= p.path.length) {
            if (p.exit) { p.state = "gone"; p.stateT = 0; }
            else { p.state = "cower"; p.stateT = 0; }
            break;
          }
          const q = p.path[p.pathI];
          const dx = q.x - p.x, dz = q.z - p.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          const last = p.pathI === p.path.length - 1;
          if (d < (last && p.exit ? CROWD.exitRadius : 0.35)) { p.pathI++; break; }
          const step = Math.min(d, CROWD.flee * dt);
          p.x += (dx / d) * step;
          p.z += (dz / d) * step;
          p.speed = step / Math.max(dt, 1e-9);
          const want = Math.atan2(dx, dz);
          let a = want - p.facing;
          while (a > Math.PI) a -= 2 * Math.PI;
          while (a < -Math.PI) a += 2 * Math.PI;
          p.facing += a * Math.min(1, 10 * dt);
          const gy = this.world.groundBelow(p.x, p.z, 0.2, p.y + 0.4);
          if (Number.isFinite(gy)) p.y = gy;
          break;
        }
        case "gone":
          p.fade = Math.max(0, 1 - p.stateT / CROWD.fade);
          break;
        case "cower":
          break;
      }
    }
  }
}

/** Distance from (px, pz) to the segment a-b. */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax, vz = bz - az;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)) : 0;
  return Math.sqrt((ax + vx * t - px) ** 2 + (az + vz * t - pz) ** 2);
}
