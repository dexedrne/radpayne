// The frag's flight: one deterministic trajectory that the sim steps and the aim preview (his frag held
// up: the arc and the landing ring) replays. His frags fly in fixed sub-steps of world time (FRAG_STEP),
// so bullet time slows one along the very same path, and the arc drawn while he holds it is where it
// goes, bounces and all, at any time scale; the fuse counts the same sub-steps, so it goes off after the
// same number of them. The gang's frags (ai/tactics.ts aims them; nothing previews them) keep the
// per-step sub-steps they always had (fragLegacy): the same physics step, the seeded runs unchanged.
// Pure TS, no three.js (the Node tests run it).
import { DT, GRENADE } from "./tuning.ts";
import type { RayHit, World } from "./world.ts";
import type { V3 } from "./types.ts";

/** World seconds per sub-step: at full speed a sim step is two of them (1/240 s, <= ~8 cm of flight). */
export const FRAG_STEP = DT / 2;

/** What the flight moves (the sim's Grenade is one). */
export type FragBody = { x: number; y: number; z: number; vx: number; vy: number; vz: number; landed: boolean; resting: boolean; bounces: number };

/** A throw: where it leaves the hand and its velocity. */
export type FragLaunch = { x: number; y: number; z: number; vx: number; vy: number; vz: number };

const scratch: RayHit = { t: 0, box: null, nx: 0, ny: 0, nz: 0 };
/** The last bounce's surface normal (fragSubstep sets it). */
export const lastBounce = { nx: 0, ny: 1, nz: 0 };

/** His throw from his left hand (0.3 m ahead of him, 0.25 m to his left, 1.5 m up) on a 35 deg loft onto
 *  the aim point, 3-20 m out; past 20 m it lands on the ground at 20 m, not up the aim line. */
export function fragLaunch(px: number, py: number, pz: number, yaw: number, aim: V3, out: FragLaunch): FragLaunch {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const ox = px + fx * 0.3 - rx * 0.25, oy = py + 1.5, oz = pz + fz * 0.3 - rz * 0.25;
  let hx = aim.x - ox, hz = aim.z - oz;
  let R = Math.hypot(hx, hz);
  if (R < 1e-3) { hx = fx; hz = fz; R = GRENADE.minRange; } else { hx /= R; hz /= R; }
  const dy = R > GRENADE.maxRange ? py - oy : aim.y - oy;
  R = Math.max(GRENADE.minRange, Math.min(GRENADE.maxRange, R));
  const th = GRENADE.loft, c = Math.cos(th), t = Math.tan(th);
  const den = 2 * c * c * (R * t - dy);
  let v = den > 0.05 ? Math.sqrt((GRENADE.gravity * R * R) / den) : GRENADE.maxSpeed;
  v = Math.max(GRENADE.minSpeed, Math.min(GRENADE.maxSpeed, v));
  out.x = ox; out.y = oy; out.z = oz;
  out.vx = hx * v * c; out.vy = v * Math.sin(th); out.vz = hz * v * c;
  return out;
}

/** One sub-step (FRAG_STEP of world time for his): gravity, the move, and a bounce off whatever it meets
 *  (the normal part reversed x restitution, the rest keeps a share); slow on a floor it comes to rest.
 *  Returns the bounce's speed into the surface (m/s), or -1 when it met nothing. */
export function fragSubstep(world: World, gr: FragBody, dt: number = FRAG_STEP): number {
  if (gr.resting) return -1;
  gr.vy -= GRENADE.gravity * dt;
  const len = Math.hypot(gr.vx, gr.vy, gr.vz) * dt;
  if (len < 1e-7) return -1;
  const dx = (gr.vx * dt) / len, dy = (gr.vy * dt) / len, dz = (gr.vz * dt) / len;
  const h = world.raycast(gr.x, gr.y, gr.z, dx, dy, dz, len + 0.06, false, scratch);
  if (!h) { gr.x += dx * len; gr.y += dy * len; gr.z += dz * len; return -1; }
  const back = Math.max(0, h.t - 0.06);
  gr.x += dx * back; gr.y += dy * back; gr.z += dz * back;
  const vn = gr.vx * h.nx + gr.vy * h.ny + gr.vz * h.nz;
  const tx = gr.vx - vn * h.nx, ty = gr.vy - vn * h.ny, tz = gr.vz - vn * h.nz;
  const r = GRENADE.restitution, tk = GRENADE.tangential;
  gr.vx = tx * tk - r * vn * h.nx; gr.vy = ty * tk - r * vn * h.ny; gr.vz = tz * tk - r * vn * h.nz;
  gr.landed = true;
  gr.bounces++;
  lastBounce.nx = h.nx; lastBounce.ny = h.ny; lastBounce.nz = h.nz;
  if (Math.hypot(gr.vx, gr.vy, gr.vz) < GRENADE.restSpeed && h.ny > 0.7) { gr.resting = true; gr.vx = gr.vy = gr.vz = 0; }
  return Math.abs(vn);
}

/** A goon's frag over one sim step of world time: 1-8 sub-steps by its speed (<= 10 cm each), as the
 *  frags always flew. Calls bounce(speed) for each bounce. */
export function fragLegacy(world: World, gr: FragBody, wdt: number, bounce: (speed: number) => void): void {
  if (gr.resting) return;
  const sp = Math.hypot(gr.vx, gr.vy, gr.vz);
  const n = Math.min(8, Math.max(1, Math.ceil((sp * wdt) / 0.1)));
  for (let k = 0; k < n && !gr.resting; k++) {
    const vn = fragSubstep(world, gr, wdt / n);
    if (vn >= 0) bounce(vn);
  }
}

/** The fuse after one more sub-step, and whether that ends it (it goes off once less than half a
 *  sub-step is left: the same count of sub-steps in the sim and in the preview). */
export function fuseTick(fuse: number): number {
  return fuse - FRAG_STEP;
}
export const fuseOut = (fuse: number): boolean => fuse <= FRAG_STEP * 0.5;

/** The predicted flight: sampled points (every `every` sub-steps and at each bounce; the last one is the
 *  blast), the bounces (with their surface normals), where it first touches something, where it goes
 *  off, whether it lies still by then, and the sub-steps to the blast. */
export type FragPath = {
  pts: number[];
  n: number;
  bounces: { x: number; y: number; z: number; nx: number; ny: number; nz: number; speed: number }[];
  nb: number;
  land: V3 | null;
  end: V3;
  resting: boolean;
  steps: number;
};

export function emptyPath(): FragPath {
  return { pts: [], n: 0, bounces: [], nb: 0, land: null, end: { x: 0, y: 0, z: 0 }, resting: false, steps: 0 };
}

const body: FragBody = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, landed: false, resting: false, bounces: 0 };

/** Replay a throw's whole flight on the sim's own sub-steps: where it goes and where it goes off. */
export function predictFrag(world: World, l: FragLaunch, out: FragPath = emptyPath(), every = 3, fuse: number = GRENADE.fuse): FragPath {
  const b = body;
  b.x = l.x; b.y = l.y; b.z = l.z; b.vx = l.vx; b.vy = l.vy; b.vz = l.vz; b.landed = false; b.resting = false; b.bounces = 0;
  out.n = 0; out.nb = 0; out.land = null; out.resting = false; out.steps = 0;
  const push = () => {
    const i = out.n * 3;
    out.pts[i] = b.x; out.pts[i + 1] = b.y; out.pts[i + 2] = b.z;
    out.n++;
  };
  push();
  let f = fuse, k = 0;
  for (;;) {
    const was = b.landed;
    const hit = fragSubstep(world, b);
    k++;
    if (hit >= 0) {
      if (!was) out.land = { x: b.x, y: b.y, z: b.z };
      let bb = out.bounces[out.nb];
      if (!bb) bb = out.bounces[out.nb] = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, speed: 0 };
      bb.x = b.x; bb.y = b.y; bb.z = b.z; bb.nx = lastBounce.nx; bb.ny = lastBounce.ny; bb.nz = lastBounce.nz; bb.speed = hit;
      out.nb++;
    }
    f = fuseTick(f);
    const done = fuseOut(f) || k > 4096;
    if (done || hit >= 0 || (!b.resting && k % every === 0)) push();
    if (done) break;
  }
  out.end.x = b.x; out.end.y = b.y; out.end.z = b.z;
  out.resting = b.resting;
  out.steps = k;
  return out;
}
