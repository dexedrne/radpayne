// The final-kill cam's plan (CameraView plays it): it follows the replayed bullet from behind, then swings
// around the target while it drops. Both shots are planned once when it starts: the chase takes the side
// of the bullet with a clear view of her, the swing an angle with a clear line to her, no wall at the
// lens and no hot light (headlights, lamps, neon) right in front of it. Nothing may fill the frame: no
// pole, pillar or trim within a metre of the lens (the thin ones too) and no lens in or looking through a
// steam plume; when the bullet's own path runs through steam or past a pillar the chase is skipped and
// the cam holds on the swing's opening angle for the flight. Pure (no three.js): the Node tests run it.
import { circleRectOverlap, type Box, type World } from "../sim/world.ts";
import type { KillCam } from "../sim/game.ts";
import type { LevelData } from "../world/level.ts";

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
  for (let i = 0; i < 16; i++) {
    const a = ((i % 2 ? -1 : 1) * Math.ceil(i / 2) * Math.PI) / 8;
    for (const d of [1, -1]) {
      let sc = -Math.abs(a) * 0.8;
      for (const t of [0, 0.25, 0.5]) {
        const [ex, ey, ez] = eyeAt(a + d * t);
        const vx = ex - kx, vy = ey - fy, vz = ez - kz, len = Math.hypot(vx, vy, vz);
        if (w.raycast(kx, fy, kz, vx / len, vy / len, vz / len, len + 0.45, false) === null) sc += 6; // no wall at / behind the lens
        if (clear(ex, ey, ez, e.x, e.y + 1.6, e.z)) sc += 3;
        if (clear(ex, ey, ez, e.x, e.y + 0.4, e.z)) sc += 2;
        sc -= spoil(ex, ey, ez, kx, fy, kz, view, steam, near);
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
