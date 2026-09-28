// Cover, derived from the level's colliders (no hand placing): every box face with a floor in front of
// it is sampled every COVER.step m; a sample is a place to stand (a capsule fits there, headroom, a floor
// level with the obstacle's foot) whose obstacle height classifies it: low (waist high: he tucks down
// behind it, stands up over it to shoot, vaults it) or high (he hides behind it and shoots round an open
// edge). Samples in a row on one plane become a segment he slides along; a segment's end is an open
// edge when the obstacle really ends there and there is room to step out past it.
// The same pass gives the gang its cover points (the AI's `Cover`: low segments every few metres, high
// ones at their open edges), so rooms 1-5 all have cover without markers. Everything here is a pure
// function of the boxes (deterministic); a segment goes dead while a box it leans on is out of the world
// (a breached door, the elevator's landing doors, a broken crate).
import type { World } from "./world.ts";
import { PLAYER } from "./tuning.ts";
import type { Cover } from "../ai/graph.ts";
import type { Player } from "./actors.ts";

export const COVER = {
  /** Sample spacing along a face (m). */
  step: 0.25,
  /** Where he stands: this far off the face (his radius + a hand). */
  off: PLAYER.radius + 0.1,
  /** Obstacle heights (m over his floor): cover from `low`, high cover from `high`; he hides standing
   *  behind `tall` and up (else tucked down). */
  low: 0.85,
  high: 1.35,
  tall: 1.75,
  /** Vaulting: only low cover up to this high, landing within this far past the face. */
  vaultMax: 1.3,
  vaultReach: 2.2,
  /** A run of samples shorter than this is no cover (a post). */
  minLen: 0.45,
  /** A high edge: he hides with his centre this far inside the corner and pops out to this far past it. */
  hideIn: 0.42,
  popOut: 0.32,
  /** The gang's points: along low cover every this many metres; at a high edge this far inside the corner
   *  (their lean takes the head out). */
  aiEvery: 1.9,
  aiHideIn: 0.25,
} as const;

/** Probe heights (m over the floor) for the obstacle's profile. */
const PROBES = [0.35, 0.75, 1.0, 1.35, 1.75, 2.0];

export type CoverSeg = {
  id: number;
  /** Start of the standing line and its unit tangent; u runs 0..len along it. */
  ax: number;
  az: number;
  tx: number;
  tz: number;
  len: number;
  /** His floor. */
  y: number;
  /** Unit normal out of the obstacle (toward where he stands); he faces -n, the way it protects. */
  nx: number;
  nz: number;
  /** Lowest obstacle height along it (over his floor), and the class. */
  top: number;
  high: boolean;
  /** Tall enough to hide standing. */
  tall: boolean;
  /** Where the obstacle ends past each end (u; NaN = closed: a corner, a wall, no room to step out). */
  cornerA: number;
  cornerB: number;
  /** Collider nodes it leans on (dead while any is out of the world). */
  nodes: string[];
};

type Sample = { u: number; x: number; z: number; y: number; top: number; tall: boolean; node: string };

/** Obstacle profile from a standing point toward -n: the contiguous blocked height from the floor up,
 *  and the node the knee-high probe hit ("" = nothing within reach). */
function profile(world: World, x: number, y: number, z: number, nx: number, nz: number, reach: number): { top: number; tall: boolean; node: string } {
  let top = 0, node = "";
  for (const h of PROBES) {
    const hit = world.raycast(x, y + h, z, -nx, 0, -nz, reach, true);
    if (!hit) break;
    if (!node) node = hit.box?.node ?? "";
    top = Math.max(h, (hit.box?.top ?? y + h) - y);
  }
  return { top, tall: top >= COVER.tall, node };
}

/** Room for his capsule at (x, z) on floor y, `h` tall. */
export function fits(world: World, x: number, y: number, z: number, h: number, r: number = PLAYER.radius): boolean {
  const o = { x: 0, z: 0 };
  if (world.pushOut(x, z, r, y, y + h, y + PLAYER.stepUp, o)) return false;
  return world.ceilingAbove(x, z, r, y + 0.2) - y >= h;
}

/** Every cover segment of a world (its boxes as they are: call it with nothing taken out). */
export function deriveCover(world: World): CoverSeg[] {
  const groups = new Map<string, { nx: number; nz: number; tx: number; tz: number; d: number; y: number; high: boolean; pts: Sample[] }>();
  const reach = COVER.off + 0.2;
  for (const b of world.boxes) {
    if (b.shootThrough || b.top - b.bottom < COVER.low - 0.05) continue;
    // the four faces: local +x, -x, +z, -z
    for (let f = 0; f < 4; f++) {
      const alongX = f >= 2; // +z / -z faces run along local x
      const sgn = f % 2 === 0 ? 1 : -1;
      const lnx = alongX ? 0 : sgn, lnz = alongX ? sgn : 0;
      // local -> world: wx = lx cos + lz sin, wz = -lx sin + lz cos
      const nx = lnx * b.cos + lnz * b.sin, nz = -lnx * b.sin + lnz * b.cos;
      const half = alongX ? b.hx : b.hz;
      const depth = alongX ? b.hz : b.hx;
      if (half * 2 < COVER.minLen) continue;
      const tlx = alongX ? 1 : 0, tlz = alongX ? 0 : 1;
      let tx = tlx * b.cos + tlz * b.sin, tz = -tlx * b.sin + tlz * b.cos;
      // one tangent orientation per normal: (tx, tz) = (-nz, nx)
      if (Math.abs(tx - -nz) + Math.abs(tz - nx) > 1e-6) { tx = -tx; tz = -tz; }
      for (let s = -half + 0.1; s <= half - 0.1 + 1e-6; s += COVER.step) {
        // (s runs along the tangent from the face's centre; the face centre is the box centre + n depth)
        const fx = b.cx + nx * depth + tx * s, fz = b.cz + nz * depth + tz * s;
        const x = fx + nx * COVER.off, z = fz + nz * COVER.off;
        const y = world.groundBelow(x, z, 0.2, b.top - COVER.low + 0.05);
        if (!Number.isFinite(y) || b.bottom > y + 0.3 || b.top - y < COVER.low - 0.05) continue;
        const pr = profile(world, x, y, z, nx, nz, reach);
        if (pr.top < COVER.low - 0.05 || !pr.node) continue;
        if (!fits(world, x, y, z, pr.top >= COVER.tall ? PLAYER.height : 1.15)) continue;
        const high = pr.top >= COVER.high;
        const d = x * nx + z * nz;
        const key = `${Math.round(Math.atan2(nx, nz) * 180 / Math.PI)}|${Math.round(d * 10)}|${Math.round(y * 5)}|${high ? 1 : 0}`;
        let gr = groups.get(key);
        if (!gr) groups.set(key, (gr = { nx, nz, tx: -nz, tz: nx, d, y, high, pts: [] }));
        gr.pts.push({ u: x * gr.tx + z * gr.tz, x, z, y, top: pr.top, tall: pr.tall, node: pr.node });
      }
    }
  }
  const segs: CoverSeg[] = [];
  const keys = [...groups.keys()].sort();
  for (const k of keys) {
    const gr = groups.get(k)!;
    gr.pts.sort((a, b) => a.u - b.u);
    // dedupe (two boxes' faces on one plane can give the same spot) and split at gaps
    let run: Sample[] = [];
    const flush = () => {
      if (run.length) {
        const s = makeSeg(world, gr, run, segs.length);
        if (s) segs.push(s);
      }
      run = [];
    };
    for (const pt of gr.pts) {
      const last = run[run.length - 1];
      if (last && pt.u - last.u < 0.05) { if (pt.top < last.top) run[run.length - 1] = pt; continue; }
      if (last && pt.u - last.u > COVER.step + 0.12) flush();
      run.push(pt);
    }
    flush();
  }
  return segs;
}

function makeSeg(world: World, gr: { nx: number; nz: number; tx: number; tz: number; y: number; high: boolean }, run: Sample[], id: number): CoverSeg | null {
  const a = run[0], b = run[run.length - 1];
  const len = b.u - a.u;
  if (len < COVER.minLen - 1e-6) return null;
  const seg: CoverSeg = {
    id, ax: a.x, az: a.z, tx: gr.tx, tz: gr.tz, len, y: a.y, nx: gr.nx, nz: gr.nz,
    top: Math.min(...run.map(p => p.top)), high: gr.high, tall: run.every(p => p.tall),
    cornerA: NaN, cornerB: NaN, nodes: [...new Set(run.map(p => p.node))].sort(),
  };
  seg.cornerA = corner(world, seg, 0, -1);
  seg.cornerB = corner(world, seg, len, 1);
  return seg;
}

/** Where the obstacle ends past an end (walking `dir` along the tangent from u), if it is an open edge: the
 *  obstacle stops within 0.6 m, he fits standing just past it, and the view out past it is clear. */
function corner(world: World, s: CoverSeg, u: number, dir: number): number {
  const reach = COVER.off + 0.25;
  for (let k = 0.05; k <= 0.6; k += 0.05) {
    const cu = u + dir * k;
    const x = s.ax + s.tx * cu, z = s.az + s.tz * cu;
    if (world.raycast(x, s.y + 1.2, z, -s.nx, 0, -s.nz, reach, true)) continue;
    // the obstacle ends at cu: room to step out past it, and a clear look out along -n
    const px = s.ax + s.tx * (cu + dir * COVER.popOut), pz = s.az + s.tz * (cu + dir * COVER.popOut);
    if (!fits(world, px, s.y, pz, PLAYER.height)) return NaN;
    if (world.raycast(px, s.y + 1.4, pz, -s.nx, 0, -s.nz, 2.5, true)) return NaN;
    return cu;
  }
  return NaN;
}

/** A point on a segment (u clamped to it). */
export function segPoint(s: CoverSeg, u: number, out: { x: number; z: number }): { x: number; z: number } {
  const k = u < 0 ? 0 : u > s.len ? s.len : u;
  out.x = s.ax + s.tx * k;
  out.z = s.az + s.tz * k;
  return out;
}

/** Nearest point of a segment to (x, z): u and the distance. */
export function segNearest(s: CoverSeg, x: number, z: number): { u: number; d: number } {
  const u0 = (x - s.ax) * s.tx + (z - s.az) * s.tz;
  const u = u0 < 0 ? 0 : u0 > s.len ? s.len : u0;
  return { u, d: Math.hypot(s.ax + s.tx * u - x, s.az + s.tz * u - z) };
}

export const openA = (s: CoverSeg): boolean => !Number.isNaN(s.cornerA);
export const openB = (s: CoverSeg): boolean => !Number.isNaN(s.cornerB);

/** The gang's cover points from the segments (the AI's Cover list), in segment order. */
export function aiCovers(segs: CoverSeg[]): Cover[] {
  const out: Cover[] = [];
  const add = (s: CoverSeg, u: number, tag: string, side: number) => {
    const x = s.ax + s.tx * u, z = s.az + s.tz * u;
    out.push({ id: `auto-${s.id}-${tag}`, x, y: s.y, z, fx: -s.nx, fz: -s.nz, high: s.high, side, claimed: -1, seg: s.id });
  };
  for (const s of segs) {
    if (!s.high) {
      const n = Math.max(1, Math.floor(s.len / COVER.aiEvery) + 1);
      for (let i = 0; i < n; i++) add(s, n === 1 ? s.len / 2 : 0.2 + ((s.len - 0.4) * i) / (n - 1), String(i), 1);
      continue;
    }
    // lean side: +1 = the actor's local +x facing -n: (cos f, -sin f) with f = atan2(-nx, -nz)
    const f = Math.atan2(-s.nx, -s.nz), lx = Math.cos(f), lz = -Math.sin(f);
    const sideOf = (dx: number, dz: number) => (dx * lx + dz * lz >= 0 ? 1 : -1);
    if (openA(s)) add(s, Math.max(0, Math.min(s.len, s.cornerA + COVER.aiHideIn)), "a", sideOf(-s.tx, -s.tz));
    if (openB(s) && (!openA(s) || s.len > 0.8)) add(s, Math.max(0, Math.min(s.len, s.cornerB - COVER.aiHideIn)), "b", sideOf(s.tx, s.tz));
  }
  return out;
}

/** Derived cover per world, cached (derivation reads only the boxes). */
const cache = new WeakMap<object, CoverSeg[]>();
export function coverOf(world: World): CoverSeg[] {
  let c = cache.get(world.boxes);
  if (!c) cache.set(world.boxes, (c = deriveCover(world)));
  return c;
}

/** A segment is live while every box it leans on is in the world. */
export function segLive(world: World, s: CoverSeg): boolean {
  if (!world.off.size) return true;
  for (const n of s.nodes) if (world.off.has(n)) return false;
  return true;
}

/** The level check's numbers (tools/check-level.ts): segments, open edges, the gang's points (and how
 *  many have a waypoint in walkable reach), and the share of waypoints with usable cover (low cover, or a
 *  high open edge) within `within` m; `bare` lists the waypoints without. */
export function coverReport(world: World, graph: { nodes: Array<{ id: string; x: number; y: number; z: number }>; nearest(x: number, y: number, z: number): number }, within = 5): { low: number; lowM: number; high: number; edges: number; ai: number; aiReach: number; coverage: number; within: number; bare: string[] } {
  const segs = deriveCover(world);
  const low = segs.filter(s => !s.high), high = segs.filter(s => s.high);
  const pts = aiCovers(segs);
  const usable = (s: CoverSeg, x: number, z: number) => {
    if (!s.high) return segNearest(s, x, z).d;
    let d = Infinity;
    for (const c of [s.cornerA, s.cornerB]) if (!Number.isNaN(c)) d = Math.min(d, Math.hypot(s.ax + s.tx * c - x, s.az + s.tz * c - z));
    return d;
  };
  const bare = graph.nodes.filter(n => !segs.some(s => Math.abs(s.y - n.y) < 1 && usable(s, n.x, n.z) <= within)).map(n => n.id);
  return {
    low: low.length, lowM: low.reduce((a, s) => a + s.len, 0), high: high.length,
    edges: high.reduce((n, s) => n + (openA(s) ? 1 : 0) + (openB(s) ? 1 : 0), 0),
    ai: pts.length, aiReach: pts.filter(c => graph.nearest(c.x, c.y, c.z) >= 0).length,
    coverage: graph.nodes.length ? 1 - bare.length / graph.nodes.length : 1, within, bare,
  };
}

// ---- his cover: taking it, sliding, popping out, the dash, the vault ---------------------------------


export const COVER_MOVE = {
  /** Slide speed along it (hidden / popped up over low cover). */
  slide: 2.4,
  slidePop: 1.3,
  /** Up / out and back (his clock). */
  popTime: 0.14,
  /** Pushing away from it this long (real s) leaves it. */
  awayHold: 0.12,
  /** Taking cover: straight onto a segment within `takeNear` m; a run to one in view up to `takeFar` m.
   *  In cover, the dash to the marked spot: `dashMin`..`dashMax` m, inside `cone` (cos) of the view. */
  takeNear: 1.5,
  takeFar: 6.5,
  dashMin: 2.0,
  dashMax: 14,
  cone: Math.cos((24 * Math.PI) / 180),
  /** The run to cover (his clock), low; given up after this long. */
  dash: 6.6,
  dashGiveUp: 3.0,
  /** A high edge's hide spot is taken when the marked spot is within this of it. */
  edgeSnap: 2.5,
  /** Blind fire: the extra cone (radians) on every round from behind it. */
  blind: 0.09,
  /** The vault (real s, like the dive) and how high over the top his feet go. */
  vaultTime: 0.5,
  vaultClear: 0.25,
} as const;

/** The u range he hides in: an open edge keeps him COVER.hideIn inside its corner. */
export function hideRange(s: CoverSeg): [number, number] {
  let lo = openA(s) ? Math.max(0, s.cornerA + COVER.hideIn) : 0;
  let hi = openB(s) ? Math.min(s.len, s.cornerB - COVER.hideIn) : s.len;
  if (lo > hi) lo = hi = (lo + hi) / 2;
  return [lo, hi];
}

/** Where the view (from x, z along fx, fz) meets the segment's standing line, clamped to it. */
function aimU(s: CoverSeg, x: number, z: number, fx: number, fz: number): number {
  // solve x + fx t = ax + tx u, z + fz t = az + tz u for u
  const den = fx * s.tz - fz * s.tx;
  if (Math.abs(den) < 1e-6) return segNearest(s, x, z).u;
  const u = (fx * (z - s.az) - fz * (x - s.ax)) / den;
  return u < 0 ? 0 : u > s.len ? s.len : u;
}

/** Where on a segment he would take it: the hide range, and a high one's edge when one is near. */
function spotOn(s: CoverSeg, u: number): number {
  const [lo, hi] = hideRange(s);
  let k = u < lo ? lo : u > hi ? hi : u;
  if (s.high) {
    const da = openA(s) ? Math.abs(k - lo) : Infinity, db = openB(s) ? Math.abs(k - hi) : Infinity;
    if (Math.min(da, db) <= COVER_MOVE.edgeSnap) k = da <= db ? lo : hi;
  }
  return k;
}

export type CoverTarget = { seg: number; u: number; x: number; z: number; dash: boolean };

/** The cover a press would take (not in cover: one within reach, else one in view; in cover: the marked
 *  spot in view to dash to). A cover that protects toward the view wins. Null: none. */
export function findTarget(world: World, segs: CoverSeg[], p: Player): CoverTarget | null {
  const inCover = p.cover >= 0;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  let best: CoverTarget | null = null, bs = Infinity;
  const pt = { x: 0, z: 0 };
  for (const s of segs) {
    if (s.id === p.cover || Math.abs(s.y - p.y) > 0.45 || !segLive(world, s)) continue;
    const faces = -(s.nx * fx + s.nz * fz);
    const near = segNearest(s, p.x, p.z);
    // behind it already (on its standing side), within reach: straight on
    const side = (p.x - s.ax) * s.nx + (p.z - s.az) * s.nz;
    if (!inCover && near.d <= COVER_MOVE.takeNear && side > -0.2) {
      const score = near.d - 0.6 * faces;
      if (score < bs) {
        const u = spotOn(s, near.u);
        segPoint(s, u, pt);
        // (never through a wall: a straight step to it)
        if (world.clear(p.x, p.y + 0.45, p.z, pt.x, s.y + 0.45, pt.z, false)) { bs = score; best = { seg: s.id, u, x: pt.x, z: pt.z, dash: Math.hypot(pt.x - p.x, pt.z - p.z) > 0.3 }; }
      }
      continue;
    }
    if (faces < -0.2) continue;
    const u = spotOn(s, aimU(s, p.x, p.z, fx, fz));
    segPoint(s, u, pt);
    const vx = pt.x - p.x, vz = pt.z - p.z, d = Math.hypot(vx, vz);
    if (d < (inCover ? COVER_MOVE.dashMin : COVER_MOVE.takeNear) || d > (inCover ? COVER_MOVE.dashMax : COVER_MOVE.takeFar)) continue;
    const cos = (vx * fx + vz * fz) / d;
    if (cos < COVER_MOVE.cone) continue;
    const score = 1.5 + d * 0.25 + (1 - cos) * 20;
    if (score >= bs) continue;
    // a straight run (knee high: low cover in the way is in the way)
    if (!world.clear(p.x, p.y + 0.45, p.z, pt.x, s.y + 0.45, pt.z, false)) continue;
    bs = score;
    best = { seg: s.id, u, x: pt.x, z: pt.z, dash: true };
  }
  return best;
}

/** Into cover at u (in its hide range). */
export function attachCover(s: CoverSeg, p: Player, u: number): void {
  const [lo, hi] = hideRange(s);
  p.cover = s.id;
  p.coverU = u < lo ? lo : u > hi ? hi : u;
  p.coverPop = 0;
  p.coverAway = 0;
  p.coverEnd = 0;
  p.dashSeg = -1;
  p.dashT = 0;
}

export function leaveCover(p: Player): void {
  p.cover = -1;
  p.coverPop = 0;
  p.coverEnd = 0;
  p.coverAway = 0;
  p.dashSeg = -1;
  p.dashT = 0;
}

/** The open edge he is at (high cover): -1 its start, +1 its end, 0 none; at a narrow post with both in
 *  reach, the one on the side the view turns to. */
export function edgeAt(s: CoverSeg, u: number, yaw: number): number {
  if (!s.high) return 0;
  const [lo, hi] = hideRange(s);
  const a = openA(s) && u <= lo + 0.2, b = openB(s) && u >= hi - 0.2;
  if (a && b) return (-Math.sin(yaw) * s.tx - Math.cos(yaw) * s.tz) >= 0 ? 1 : -1;
  return a ? -1 : b ? 1 : 0;
}

/** Where he stands this step: the hide spot, or out past the corner by the pop (high edge). */
export function coverSpot(s: CoverSeg, p: Player, out: { x: number; z: number }): { x: number; z: number } {
  let u = p.coverU;
  if (p.coverEnd !== 0) {
    const c = p.coverEnd < 0 ? s.cornerA - COVER.popOut : s.cornerB + COVER.popOut;
    u += (c - u) * p.coverPop;
  }
  out.x = s.ax + s.tx * u;
  out.z = s.az + s.tz * u;
  return out;
}

/** Hidden behind low (or not quite tall) cover: tucked down. */
export const tucked = (s: CoverSeg, p: Player): boolean => (!s.high || !s.tall) && p.coverPop < 0.5;

/** The vault's landing past low cover from the standing spot (x, z), or null (too high, no room, a
 *  different floor, no headroom over it). */
export function vaultLanding(world: World, s: CoverSeg, x: number, z: number): { x: number; y: number; z: number } | null {
  if (s.high || s.top > COVER.vaultMax) return null;
  const topY = s.y + s.top;
  for (let k = COVER.off + 0.5; k <= COVER.off + COVER.vaultReach + 1e-6; k += 0.1) {
    const lx = x - s.nx * k, lz = z - s.nz * k;
    const gy = world.groundBelow(lx, lz, 0.2, topY - 0.3);
    if (!Number.isFinite(gy) || Math.abs(gy - s.y) > 0.5) continue;
    if (!fits(world, lx, gy, lz, PLAYER.height)) continue;
    // past the obstacle: looking back at knee height it is there, and nothing else is: the way over it is
    // clear just above its top (never over a wall behind it)
    const back = world.raycast(lx, gy + 0.45, lz, s.nx, 0, s.nz, k, false);
    if (!back) continue;
    if (!world.clear(x, topY + 0.3, z, lx, topY + 0.3, lz, false)) return null;
    const mx = x - s.nx * (k / 2), mz = z - s.nz * (k / 2);
    if (world.ceilingAbove(mx, mz, 0.3, topY + 0.1) - topY < PLAYER.height * 0.8) return null;
    return { x: lx, y: gy, z: lz };
  }
  return null;
}
