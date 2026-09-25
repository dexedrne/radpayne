// Over-the-right-shoulder camera (spec section 6): pivot from the sim (shoulder height eases with the
// stance), eye on the line pivot - aim * arm so the crosshair ray is exactly the sim's aim ray, pulled
// in by walls, a tighter FOV in bullet time, a small kick on hits. A wall at his right shoulder slides
// the pivot in toward his head (the view then turns onto the sim's aim point, so the crosshair still
// lands where the shot goes) instead of pushing the lens into the facade.
// The final-kill cam follows the replayed bullet from behind, then swings around the target while it
// drops. Both shots are planned once when it starts: the chase takes the side of the bullet with a
// clear view of her, the swing an angle with a clear line to her, no wall at the lens and no hot light
// (headlights, lamps, neon) right in front of it.
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { usePrefab } from "react-three-game";
import { Matrix4, PerspectiveCamera, Vector3 } from "three";
import { World } from "../sim/world.ts";
import type { Session } from "./session.ts";
import { shoulderRight } from "../sim/player.ts";
import { SHOULDER, aimDir } from "../sim/aim.ts";
import { FRAME } from "./frame.ts";
import type { V3 } from "../sim/types.ts";
import type { KillCam } from "../sim/game.ts";
import type { LevelData } from "../world/level.ts";

export const CAMERA_NODE = "rp-camera";
/** Dev builds: ?cam=<id of a "camera" marker> holds the camera on that shot (data.at = look-at point). */
const DEV_CAM = import.meta.env.MODE !== "production" ? new URLSearchParams(location.search).get("cam") : null;
export const FOV = 68;
/** The current camera arm (the player fades out when a wall pulls the camera into his head). */
export const camView = { arm: SHOULDER.arm as number, right: SHOULDER.right as number };
const FOV_BT = 60;
/** Kill-cam swing: radius (m), eye height and look-at height over her feet, turn rate (rad / real s). */
const KC = { radius: 3.0, eyeY: 1.45, atY: 0.8, turn: 0.9, fov: 55, chaseFov: 50 } as const;

type KcPlan = { kc: KillCam; side: number; lift: number; a0: number; dir: number; ex: number; ey: number; ez: number; kx: number; kz: number };

/** Plans the two kill-cam shots (see the header) against the camera's collision world. */
function planKillcam(k: KillCam, e: { x: number; y: number; z: number; killDX: number; killDZ: number }, w: World, level: LevelData): KcPlan {
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
  let side = 0.25, lift = 0.18, best = -1;
  for (const [sd, up] of [[0.25, 0.18], [-0.25, 0.18], [0.5, 0.35], [-0.5, 0.35], [0.2, 0.6], [-0.2, 0.6]]) {
    let sc = 0;
    for (const f of [0.55, 1]) {
      const bx = k.from.x + (k.to.x - k.from.x) * f, by = k.from.y + (k.to.y - k.from.y) * f, bz = k.from.z + (k.to.z - k.from.z) * f;
      const ex = bx - dx * 0.9 + sx * sd, ey = by - dy * 0.9 + up, ez = bz - dz * 0.9 + sz * sd;
      if (!clear(bx, by, bz, ex, ey, ez, 0)) continue; // the lens would sit inside a wall
      sc += (clear(ex, ey, ez, ...chest) ? 2 : 0) + (clear(ex, ey, ez, ...head) ? 1 : 0);
    }
    if (sc > best) { best = sc; side = sd; lift = up; }
  }
  // swing: angle 0 = on the shooter's side, looking at her; she falls away along the shot
  const kx = e.x + e.killDX * 0.5, kz = e.z + e.killDZ * 0.5;
  const fy = e.y + KC.atY;
  let a0 = 0, dir = 1, score = -Infinity;
  const eyeAt = (a: number) => [kx + (-hx * Math.cos(a) + sx * Math.sin(a)) * KC.radius, e.y + KC.eyeY, kz + (-hz * Math.cos(a) + sz * Math.sin(a)) * KC.radius] as const;
  for (let i = 0; i < 16; i++) {
    const a = ((i % 2 ? -1 : 1) * Math.ceil(i / 2) * Math.PI) / 8;
    for (const d of [1, -1]) {
      let sc = -Math.abs(a) * 0.8;
      for (const t of [0, 0.5]) {
        const [ex, ey, ez] = eyeAt(a + d * t);
        const vx = ex - kx, vy = ey - fy, vz = ez - kz, len = Math.hypot(vx, vy, vz);
        if (w.raycast(kx, fy, kz, vx / len, vy / len, vz / len, len + 0.45, false) === null) sc += 6; // no wall at / behind the lens
        if (clear(ex, ey, ez, e.x, e.y + 1.6, e.z)) sc += 3;
        if (clear(ex, ey, ez, e.x, e.y + 0.4, e.z)) sc += 2;
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
  return { kc: k, side, lift, a0, dir, ex, ey, ez, kx, kz };
}

export function CameraView({ s }: { s: Session }) {
  const prefab = usePrefab();
  const tmp = useMemo(() => ({
    m: new Matrix4(), eye: new Vector3(), at: new Vector3(), up: new Vector3(0, 1, 0), d: { x: 0, y: 0, z: -1 } as V3,
    arm: SHOULDER.arm as number, fov: FOV, kick: 0, orbit: 0, piv: new Vector3(), right: SHOULDER.right as number, aimT: 20,
    plan: null as KcPlan | null,
  }), []);
  // what the camera collides with: every visible box, decor included (a tall decor box must not sit
  // between the camera and the shoulder), not the invisible play-area walls
  const camWorld = useMemo(() => new World(s.level.camBoxes.map((b, i) => ({ ...b, id: i }))), [s]);
  useEffect(() => s.on(e => {
    if (e.type === "hurt" && e.target === -1) tmp.kick = 1;
  }), [s, tmp]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const g = s.game;
    const p = g.player;
    const k = g.killcam;
    let fovWant = g.timeScale < 0.99 ? FOV_BT : FOV;
    const dev = DEV_CAM ? g.level.markers.find(m => m.kind === "camera" && m.id === DEV_CAM) : undefined;
    if (dev) {
      const at = (dev.data.at as number[] | undefined) ?? [dev.x, dev.y, dev.z - 1];
      tmp.eye.set(dev.x, dev.y, dev.z);
      tmp.at.set(at[0], at[1], at[2]);
      fovWant = FOV;
      camView.arm = SHOULDER.arm;
    } else if (k) {
      const e = g.enemies[k.enemy];
      if (!tmp.plan || tmp.plan.kc !== k) tmp.plan = planKillcam(k, e ?? { x: k.to.x, y: 0, z: k.to.z, killDX: 0, killDZ: 1 }, camWorld, s.level);
      const pl = tmp.plan;
      // bullet position along the replayed shot
      const f = Math.min(1, k.t / k.flight);
      const bx = k.from.x + (k.to.x - k.from.x) * f, by = k.from.y + (k.to.y - k.from.y) * f, bz = k.from.z + (k.to.z - k.from.z) * f;
      let dx = k.to.x - k.from.x, dy = k.to.y - k.from.y, dz = k.to.z - k.from.z;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      dx /= l; dy /= l; dz /= l;
      const hl = Math.hypot(dx, dz) || 1;
      const hx = dx / hl, hz = dz / hl, sx = hz, sz = -hx; // horizontal shot direction and its side
      if (f < 1) {
        tmp.eye.set(bx - dx * 0.9 + sx * pl.side, by - dy * 0.9 + pl.lift, bz - dz * 0.9 + sz * pl.side);
        tmp.at.set(bx + dx * 2, by + dy * 2, bz + dz * 2);
        tmp.orbit = 0;
        fovWant = KC.chaseFov;
      } else {
        tmp.orbit += dt * KC.turn;
        const a = pl.a0 + pl.dir * tmp.orbit;
        const ey = (e?.y ?? 0);
        tmp.eye.set(pl.kx + (-hx * Math.cos(a) + sx * Math.sin(a)) * KC.radius, ey + KC.eyeY, pl.kz + (-hz * Math.cos(a) + sz * Math.sin(a)) * KC.radius);
        tmp.at.set(pl.kx, ey + KC.atY, pl.kz);
        fovWant = KC.fov;
      }
      camView.arm = SHOULDER.arm;
      camView.right = SHOULDER.right;
    } else {
      tmp.plan = null;
      const r = s.renderP;
      const d = aimDir(p.yaw, p.pitch, tmp.d);
      const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
      // the shoulder offset gives way to a wall at his right (never a lens inside the facade)
      const by = r.y + p.pivotUp;
      const side = camWorld.raycast(r.x, by, r.z, c, 0, -sn, SHOULDER.right + 0.3, false);
      const rightWant = side ? Math.max(0, side.t - 0.3) : SHOULDER.right;
      tmp.right = rightWant < tmp.right ? rightWant : tmp.right + (rightWant - tmp.right) * Math.min(1, 5 * dt);
      tmp.piv.set(r.x + c * tmp.right, by, r.z - sn * tmp.right);
      camView.right = tmp.right;
      // wall collision along the arm (the sim's own boxes), then ease back out
      const hit = camWorld.raycast(tmp.piv.x, tmp.piv.y, tmp.piv.z, -d.x, -d.y, -d.z, SHOULDER.arm + 0.3, false);
      const want = hit ? Math.max(SHOULDER.minArm, hit.t - 0.3) : SHOULDER.arm;
      tmp.arm = want < tmp.arm ? want : tmp.arm + (want - tmp.arm) * Math.min(1, 6 * dt);
      camView.arm = tmp.arm;
      tmp.eye.set(tmp.piv.x - d.x * tmp.arm, tmp.piv.y - d.y * tmp.arm, tmp.piv.z - d.z * tmp.arm);
      // look at the point on the sim's aim ray at the aim point's distance: the same view as along the
      // ray when the shoulder is free; with the pivot slid in, the crosshair still sits on the aim point
      const simRight = shoulderRight(g.world, p); // the sim's pivot, pulled in by a wall like this one
      const sx0 = r.x + c * simRight, sz0 = r.z - sn * simRight;
      const ap = g.aimPoint;
      const aimWant = Math.min(80, Math.max(3, Math.hypot(ap.x - sx0, ap.y - by, ap.z - sz0)));
      tmp.aimT += (aimWant - tmp.aimT) * Math.min(1, 10 * dt);
      tmp.at.set(sx0 + d.x * tmp.aimT, by + d.y * tmp.aimT, sz0 + d.z * tmp.aimT);
      // hit kick
      tmp.kick = Math.max(0, tmp.kick - dt * 6);
      if (tmp.kick > 0) {
        const j = tmp.kick * 0.06;
        tmp.eye.x += (Math.random() - 0.5) * j; tmp.eye.y += (Math.random() - 0.5) * j;
      }
    }
    tmp.m.lookAt(tmp.eye, tmp.at, tmp.up);
    const node = prefab.getObject(CAMERA_NODE);
    const cam = state.camera;
    let under = false;
    for (let o = cam.parent; o; o = o.parent) if (o === node) { under = true; break; }
    if (node && under) {
      node.position.copy(tmp.eye);
      node.quaternion.setFromRotationMatrix(tmp.m);
    } else {
      cam.position.copy(tmp.eye);
      cam.quaternion.setFromRotationMatrix(tmp.m);
    }
    tmp.fov += (fovWant - tmp.fov) * Math.min(1, 8 * dt);
    if (cam instanceof PerspectiveCamera && Math.abs(cam.fov - tmp.fov) > 0.01) {
      cam.fov = tmp.fov;
      cam.updateProjectionMatrix();
    }
  }, FRAME.camera);
  return null;
}
