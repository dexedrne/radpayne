// The final-kill cam's plan (CameraView plays it): it follows the replayed bullet from behind, then swings
// around the target while it drops. Both shots are planned once when it starts: the chase takes the side
// of the bullet with a clear view of her, the swing an angle with a clear line to her, no wall at the
// lens and no hot light (headlights, lamps, neon) right in front of it. Nothing may fill the frame: no
// pole, pillar or trim within a metre of the lens (the thin ones too) and no lens in or looking through a
// steam plume; when the bullet's own path runs through steam or past a pillar the chase is skipped and
// the cam holds on the swing's opening angle for the flight. Pure (no three.js): the Node tests run it.
// The kill cam's ride (cine.ts) is checked here too, along its whole path (planRide), and a cam with two
// or three bodies gets a frame that holds them all for the X-ray (planGroup).
import { circleRectOverlap, type Box, type World } from "../sim/world.ts";
import type { KillCam } from "../sim/game.ts";
import type { LevelData } from "../world/level.ts";
import { CINE, rideLens, type Cine } from "./cine.ts";
import type { V3 } from "../sim/types.ts";

/** Kill-cam swing: radius (m), eye height and look-at height over her feet, turn rate (rad / real s). */
export const KC = { radius: 3.0, eyeY: 1.45, atY: 0.8, turn: 0.9, fov: 55, chaseFov: 50 } as const;

export type KcPlan = { kc: KillCam; side: number; lift: number; a0: number; dir: number; ex: number; ey: number; ez: number; kx: number; kz: number; chase: boolean };

/** Steam columns (fx "steam": they rise ~3.4 m x size from the marker, drifting a little). */
export function steamOf(level: LevelData): Array<{ x: number; y: number; z: number; r: number; h: number }> {
  return level.markers.filter(m => m.kind === "fx" && m.data.fx === "steam").map(m => {
    const size = typeof m.data.size === "number" ? m.data.size : 1;
    return { x: m.x + 0.45, y: m.y, z: m.z + 0.2, r: 1.3 * size, h: 3.6 * size };
  });
}

/** How badly a lens at (ex, ey, ez) looking at (tx, ty, tz) is spoiled: steam at or in front of the lens,
 *  a box (thin poles included) within ~1 m of it. 0 = clean. */
export function spoil(ex: number, ey: number, ez: number, tx: number, ty: number, tz: number, view: World, steam: ReturnType<typeof steamOf>, near: Box[]): number {
  let bad = 0;
  for (const s of steam) {
    // the closest point of the lens -> target line to the column's axis (in plan), at the line's height
    const dx = tx - ex, dz = tz - ez, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((s.x - ex) * dx + (s.z - ez) * dz) / l2));
    const px = ex + dx * t, pz = ez + dz * t, py = ey + (ty - ey) * t;
    const d = Math.hypot(px - s.x, pz - s.z);
    if (py < s.y - 0.3 || py > s.y + s.h) continue;
    if (d < s.r) bad += t < 0.35 ? 8 : 4; // in the plume at the lens: a white frame
    else if (d < s.r + 0.8) bad += 1.5;
  }
  for (const b of view.near(ex - 1, ez - 1, ex + 1, ez + 1, near)) {
    if (ey < b.bottom - 0.2 || ey > b.top + 0.2) continue;
    if (circleRectOverlap(b, ex, ez, 1.0)) bad += circleRectOverlap(b, ex, ez, 0.55) ? 6 : 2.5;
  }
  return bad;
}

/** Plans the two kill-cam shots (see the header) against the camera's collision world (`view`: every
 *  visible box, the thin ones too). */
export function planKillcam(k: KillCam, e: { x: number; y: number; z: number; killDX: number; killDZ: number }, w: World, level: LevelData, view: World): KcPlan {
  const steam = steamOf(level);
  const near: Box[] = [];
  let dx = k.to.x - k.from.x, dy = k.to.y - k.from.y, dz = k.to.z - k.from.z;
  const l = Math.hypot(dx, dy, dz) || 1;
  dx /= l; dy /= l; dz /= l;
  const hl = Math.hypot(dx, dz) || 1;
  const hx = dx / hl, hz = dz / hl; // horizontal shot direction
  const sx = hz, sz = -hx; // its side
  const clear = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, pad = 0.15) => {
    const vx = bx - ax, vy = by - ay, vz = bz - az;
    const d = Math.hypot(vx, vy, vz);
    return d < 1e-3 || w.raycast(ax, ay, az, vx / d, vy / d, vz / d, Math.max(0, d - pad), false) === null;
  };
  const chest = [e.x, e.y + 1.1, e.z] as const, head = [e.x, e.y + 1.6, e.z] as const;
  // chase: which side of the bullet (and how high) sees her body, not the cover she was behind
  let side = 0.25, lift = 0.18, best = -Infinity;
  for (const [sd, up] of [[0.25, 0.18], [-0.25, 0.18], [0.5, 0.35], [-0.5, 0.35], [0.2, 0.6], [-0.2, 0.6]]) {
    let sc = 0;
    for (const f of [0.2, 0.55, 1]) {
      const bx = k.from.x + (k.to.x - k.from.x) * f, by = k.from.y + (k.to.y - k.from.y) * f, bz = k.from.z + (k.to.z - k.from.z) * f;
      const ex = bx - dx * 0.9 + sx * sd, ey = by - dy * 0.9 + up, ez = bz - dz * 0.9 + sz * sd;
      if (!clear(bx, by, bz, ex, ey, ez, 0)) { sc -= 3; continue; } // the lens would sit inside a wall
      sc += (clear(ex, ey, ez, ...chest) ? 2 : 0) + (clear(ex, ey, ez, ...head) ? 1 : 0);
      sc -= spoil(ex, ey, ez, chest[0], chest[1], chest[2], view, steam, near);
    }
    if (sc > best) { best = sc; side = sd; lift = up; }
  }
  // a chase that can only look through steam or past a post is no chase: hold on the swing instead
  const chase = best > 0;
  // swing: angle 0 = on the shooter's side, looking at her; she falls away along the shot
  const kx = e.x + e.killDX * 0.5, kz = e.z + e.killDZ * 0.5;
  const fy = e.y + KC.atY;
  let a0 = 0, dir = 1, score = -Infinity;
  const eyeAt = (a: number) => [kx + (-hx * Math.cos(a) + sx * Math.sin(a)) * KC.radius, e.y + KC.eyeY, kz + (-hz * Math.cos(a) + sz * Math.sin(a)) * KC.radius] as const;
  // (every 11.25 deg round her: a body tucked in behind cover in a tight corner may have one clean arc)
  for (let i = 0; i < 32; i++) {
    const a = ((i % 2 ? -1 : 1) * Math.ceil(i / 2) * Math.PI) / 16;
    for (const d of [1, -1]) {
      let sc = -Math.abs(a) * 0.8;
      for (const t of [0, 0.25, 0.5]) {
        const [ex, ey, ez] = eyeAt(a + d * t);
        const vx = ex - kx, vy = ey - fy, vz = ez - kz, len = Math.hypot(vx, vy, vz);
        if (w.raycast(kx, fy, kz, vx / len, vy / len, vz / len, len + 0.45, false) === null) sc += 6; // no wall at / behind the lens
        if (clear(ex, ey, ez, e.x, e.y + 1.6, e.z)) sc += 3;
        if (clear(ex, ey, ez, e.x, e.y + 0.4, e.z)) sc += 2;
        const sp = spoil(ex, ey, ez, kx, fy, kz, view, steam, near);
        sc -= sp > 0 ? 40 + sp : 0; // (a post at the lens spoils the whole shot: any clean arc beats it)
        // hot lights within 9 m of the lens and inside ~30 deg of the view blow the frame out
        const fx = -vx / len, fyv = -vy / len, fz = -vz / len;
        for (const gp of level.glare) {
          const gx = gp.x - ex, gy = gp.y - ey, gz = gp.z - ez, gd = Math.hypot(gx, gy, gz);
          if (gd > 9 || gd < 1e-3) continue;
          const cos = (gx * fx + gy * fyv + gz * fz) / gd;
          if (cos > 0.86) sc -= 4 * (1 - gd / 9) * Math.min(1, (cos - 0.86) / 0.1);
        }
      }
      if (sc > score) { score = sc; a0 = a; dir = d; }
    }
  }
  const [ex, ey, ez] = eyeAt(a0);
  return { kc: k, side, lift, a0, dir, ex, ey, ez, kx, kz, chase };
}

/** A lens this close (m) to a box is in it or cut by it (the near plane is 0.05 m); a body's radius. */
const CLOSE = 0.18;
const BODY_R = 0.34;

/** A body the lens must keep off: standing (h ~1.9 m, BODY_R), or down (low, `r` over where it fell). */
export type LensBody = { x: number; y: number; z: number; h: number; r?: number };

/** Whether a lens at (x, y, z) sits in or against a box of `w` (or a body of `bodies`). */
function cramped(w: World, x: number, y: number, z: number, near: Box[], bodies: ReadonlyArray<LensBody> = []): boolean {
  for (const b of w.near(x - CLOSE, z - CLOSE, x + CLOSE, z + CLOSE, near)) {
    if (y < b.bottom - CLOSE || y > b.top + CLOSE) continue;
    if (circleRectOverlap(b, x, z, CLOSE)) return true;
  }
  for (const b of bodies) if (y > b.y - 0.1 && y < b.y + b.h + 0.1 && Math.hypot(x - b.x, z - b.z) < (b.r ?? BODY_R) + CLOSE) return true;
  return false;
}

/** Line of sight from a to b through `w` (stopping `pad` short of b). */
function sees(w: World, a: V3, bx: number, by: number, bz: number, pad = 0.15): boolean {
  const vx = bx - a.x, vy = by - a.y, vz = bz - a.z;
  const d = Math.hypot(vx, vy, vz);
  return d < 1e-3 || w.raycast(a.x, a.y, a.z, vx / d, vy / d, vz / d, Math.max(0, d - pad), false) === null;
}

export type RidePlan = { side: number; lift: number; ok: boolean };

/** The kill cam's ride (cine.ts rideLens) checked along its whole path, ride and freeze, every ~0.3 m of
 *  the round's travel: the lens stays on the round's side of every wall (the line from the round to the
 *  lens is clear), its move since the last sample passes through no box, and it never sits in or against
 *  a box (a parked car's cabin, a pillar, the car's gate) or a body (the ones the round went through,
 *  anyone else standing or lying near its line: a face filling the frame). Of the offsets that pass,
 *  the one that sees her best at the impact; none passes: ok false, and the cam holds a side angle on
 *  her instead (the swing's opening angle, planKillcam). `e`: the last body; `bodies`: the others. */
export function planRide(c: Pick<Cine, "from" | "to" | "dist" | "flight">, e: { x: number; y: number; z: number }, bodies: ReadonlyArray<LensBody>, w: World, level: LevelData, view: World): RidePlan {
  const steam = steamOf(level);
  const near: Box[] = [];
  const T = c.flight + CINE.xray;
  const n = Math.max(24, Math.min(160, Math.ceil(c.dist / 0.3)));
  let dx = c.to.x - c.from.x, dy = c.to.y - c.from.y, dz = c.to.z - c.from.z;
  const l = Math.hypot(dx, dy, dz) || 1;
  dx /= l; dy /= l; dz /= l;
  const eye = { x: 0, y: 0, z: 0 }, at = { x: 0, y: 0, z: 0 }, prev = { x: 0, y: 0, z: 0 };
  let best: RidePlan = { side: 0.25, lift: 0.18, ok: false }, score = -Infinity;
  for (const [side, lift] of [[0.25, 0.18], [-0.25, 0.18], [0.5, 0.35], [-0.5, 0.35], [0.2, 0.6], [-0.2, 0.6], [0.8, 0.5], [-0.8, 0.5], [0.35, 1.0], [-0.35, 1.0]]) {
    let ok = true, sc = -Math.hypot(side, lift) * 0.5;
    for (let i = 0; i <= n && ok; i++) {
      const t = (T * i) / n;
      rideLens(c, t, side, lift, eye, at);
      // the round's point level with the lens: the lens must see it (no wall between them)
      const s = Math.max(0, Math.min(c.dist, (eye.x - c.from.x) * dx + (eye.y - c.from.y) * dy + (eye.z - c.from.z) * dz));
      const px = c.from.x + dx * s, py = c.from.y + dy * s, pz = c.from.z + dz * s;
      if (!sees(w, eye, px, py, pz, 0.02) || cramped(w, eye.x, eye.y, eye.z, near, bodies)) ok = false;
      else if (i > 0 && !sees(w, prev, eye.x, eye.y, eye.z, 0)) ok = false;
      prev.x = eye.x; prev.y = eye.y; prev.z = eye.z;
      if (ok && (i === Math.round(n * 0.3) || i === Math.round(n * 0.7) || i === n)) sc -= spoil(eye.x, eye.y, eye.z, at.x, at.y, at.z, view, steam, near);
    }
    if (!ok) continue;
    // at the impact: her body and her head in sight
    rideLens(c, c.flight, side, lift, eye, at);
    sc += (sees(w, eye, e.x, e.y + 1.1, e.z) ? 2 : 0) + (sees(w, eye, e.x, e.y + 1.6, e.z) ? 1 : 0);
    if (sc > score) { score = sc; best = { side, lift, ok: true }; }
  }
  return best;
}

export type GroupShot = { ex: number; ey: number; ez: number; ax: number; ay: number; az: number };

/** A frame that holds every body of a multi-kill cam (a round through two, the last kill and whoever its
 *  round took with it) for the X-ray: off to the side of the round's line, back far enough for the
 *  spread of them in ~70 % of the lens's width, every body's chest in sight, no wall at the lens. The
 *  lens comes in when a wall is behind it (not under 2.4 m); null when no frame sees them all. */
export function planGroup(bodies: ReadonlyArray<LensBody>, from: V3, w: World, level: LevelData, view: World): GroupShot | null {
  if (bodies.length < 2) return null;
  const steam = steamOf(level);
  const near: Box[] = [];
  let mx = 0, mz = 0, my = Infinity;
  for (const b of bodies) { mx += b.x / bodies.length; mz += b.z / bodies.length; my = Math.min(my, b.y); }
  const cy = my + 1.0;
  let span = 0;
  for (const b of bodies) span = Math.max(span, Math.hypot(b.x - mx, b.z - mz));
  const last = bodies[bodies.length - 1];
  let hx = last.x - from.x, hz = last.z - from.z;
  const hl = Math.hypot(hx, hz) || 1;
  hx /= hl; hz /= hl;
  const sx = hz, sz = -hx;
  const D0 = Math.max(3.0, Math.min(8, (span + 0.8) / 0.62));
  const m = { x: mx, y: cy, z: mz };
  let best: GroupShot | null = null, score = -Infinity;
  for (const sgn of [1, -1]) {
    for (const th of [0, 0.45, -0.45, 0.9, -0.9]) {
      // th > 0 turns the lens toward the shooter's side of the line
      const vx = sgn * sx * Math.cos(th) - hx * Math.sin(th);
      const vz = sgn * sz * Math.cos(th) - hz * Math.sin(th);
      const vl = Math.hypot(vx, vz) || 1;
      for (const up of [0.7, 1.4]) {
        const ux = vx / vl, uz = vz / vl, uy = up / D0;
        const ul = Math.hypot(ux, uy, uz);
        // back as far as the walls allow (0.4 m off the first one), not under 2.4 m
        const hit = w.raycast(m.x, m.y, m.z, ux / ul, uy / ul, uz / ul, D0 * ul + 0.4, false);
        const D = hit ? (hit.t - 0.4) / ul : D0;
        if (D < 2.4) continue;
        const eye = { x: m.x + ux * D, y: m.y + uy * D, z: m.z + uz * D };
        if (cramped(w, eye.x, eye.y, eye.z, near, bodies)) continue;
        let sc = -Math.abs(th) * 1.5 - (sgn < 0 ? 0.2 : 0) - Math.abs(up - 0.7);
        let all = true;
        for (const b of bodies) {
          const chest = sees(w, eye, b.x, b.y + 1.1, b.z), head = sees(w, eye, b.x, b.y + b.h * 0.85, b.z);
          if (!chest && !head) all = false;
          sc += (chest ? 2 : 0) + (head ? 1 : 0);
        }
        if (!all) continue;
        // the spread must fit: the widest angle between two bodies seen from the lens
        let wide = 0;
        for (const a of bodies) for (const b of bodies) {
          const a1 = Math.atan2(a.x - eye.x, a.z - eye.z), b1 = Math.atan2(b.x - eye.x, b.z - eye.z);
          wide = Math.max(wide, Math.abs(Math.atan2(Math.sin(a1 - b1), Math.cos(a1 - b1))));
        }
        if (wide > 1.2) continue;
        sc -= Math.max(0, D0 - D) * 0.4;
        sc -= spoil(eye.x, eye.y, eye.z, m.x, m.y, m.z, view, steam, near);
        if (sc > score) { score = sc; best = { ex: eye.x, ey: eye.y, ez: eye.z, ax: m.x, ay: cy - 0.1, az: m.z }; }
      }
    }
  }
  return best;
}
