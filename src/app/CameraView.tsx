// Over-the-right-shoulder camera (spec section 6): pivot from the sim (shoulder height eases with the
// stance), eye on the line pivot - aim * arm so the crosshair ray is exactly the sim's aim ray, pulled
// in by walls, a tighter FOV in bullet time, a small kick on hits. The final-kill cam follows the
// replayed bullet from behind, then swings around the target while it drops.
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { usePrefab } from "react-three-game";
import { Matrix4, PerspectiveCamera, Vector3 } from "three";
import type { Session } from "./session.ts";
import { SHOULDER, aimDir } from "../sim/aim.ts";
import { FRAME } from "./frame.ts";
import type { V3 } from "../sim/types.ts";

export const CAMERA_NODE = "rp-camera";
export const FOV = 68;
const FOV_BT = 60;

export function CameraView({ s }: { s: Session }) {
  const prefab = usePrefab();
  const tmp = useMemo(() => ({
    m: new Matrix4(), eye: new Vector3(), at: new Vector3(), up: new Vector3(0, 1, 0), d: { x: 0, y: 0, z: -1 } as V3,
    arm: SHOULDER.arm as number, fov: FOV, kick: 0, orbit: 0, piv: new Vector3(),
  }), []);
  useEffect(() => s.on(e => {
    if (e.type === "hurt" && e.target === -1) tmp.kick = 1;
  }), [s, tmp]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const g = s.game;
    const p = g.player;
    const k = g.killcam;
    let fovWant = g.timeScale < 0.99 ? FOV_BT : FOV;
    if (k) {
      // bullet position along the replayed shot
      const f = Math.min(1, k.t / k.flight);
      const bx = k.from.x + (k.to.x - k.from.x) * f, by = k.from.y + (k.to.y - k.from.y) * f, bz = k.from.z + (k.to.z - k.from.z) * f;
      let dx = k.to.x - k.from.x, dy = k.to.y - k.from.y, dz = k.to.z - k.from.z;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      dx /= l; dy /= l; dz /= l;
      const sx = dz, sz = -dx; // side
      if (f < 1) {
        tmp.eye.set(bx - dx * 0.9 + sx * 0.25, by - dy * 0.9 + 0.18, bz - dz * 0.9 + sz * 0.25);
        tmp.at.set(bx + dx * 2, by + dy * 2, bz + dz * 2);
        tmp.orbit = 0;
      } else {
        tmp.orbit += dt * 0.9;
        const a = tmp.orbit;
        const ox = (-dx * Math.cos(a) + sx * Math.sin(a)) * 2.2, oz = (-dz * Math.cos(a) + sz * Math.sin(a)) * 2.2;
        tmp.eye.set(k.to.x + ox, k.to.y + 0.5, k.to.z + oz);
        tmp.at.set(k.to.x, k.to.y - 0.3, k.to.z);
      }
      fovWant = 50;
    } else {
      const r = s.renderP;
      const d = aimDir(p.yaw, p.pitch, tmp.d);
      const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
      tmp.piv.set(r.x + c * SHOULDER.right, r.y + p.pivotUp, r.z - sn * SHOULDER.right);
      // wall collision along the arm (the sim's own boxes), then ease back out
      const hit = g.world.raycast(tmp.piv.x, tmp.piv.y, tmp.piv.z, -d.x, -d.y, -d.z, SHOULDER.arm + 0.3, false);
      const want = hit ? Math.max(SHOULDER.minArm, hit.t - 0.3) : SHOULDER.arm;
      tmp.arm = want < tmp.arm ? want : tmp.arm + (want - tmp.arm) * Math.min(1, 6 * dt);
      tmp.eye.set(tmp.piv.x - d.x * tmp.arm, tmp.piv.y - d.y * tmp.arm, tmp.piv.z - d.z * tmp.arm);
      tmp.at.set(tmp.piv.x + d.x * 10, tmp.piv.y + d.y * 10, tmp.piv.z + d.z * 10);
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
