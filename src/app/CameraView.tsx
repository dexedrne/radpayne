// Over-the-right-shoulder camera (spec section 6): pivot from the sim (shoulder height eases with the
// stance), eye on the line pivot - aim * arm so the crosshair ray is exactly the sim's aim ray, pulled
// in by walls, a tighter FOV in bullet time, a small kick on hits. A wall at his right shoulder slides
// the pivot in toward his head (the view then turns onto the sim's aim point, so the crosshair still
// lands where the shot goes) instead of pushing the lens into the facade.
// The final-kill cam follows the replayed bullet from behind, then swings around the target while it
// drops, as planned by killcam.ts (clear lines, no wall, hot light, post or steam at the lens).
// The kill cam (cine.ts) rides its bullet from the muzzle on the same plan: the lens starts just past
// the muzzle, slows into her with the view opening out to her side, and holds there, pushing in a
// little, through the X-ray; with no bullet to ride (a grenade, a melee) or no clean line along it, it
// holds the swing's opening angle and pushes in. After the last kill's ride the sim's own final-kill
// cam plays on as the swing only.
// A long gun out (arsenal spec 1.4) moves the lens out and down (LONG_CAM, eased over 0.3 s): a
// shouldered gun points away from a camera behind him, so the view goes wider of his shoulder and below
// his big head, where the gun's length shows. Shouldered (a shot in the last 1.2 s, bullet time) the lens
// comes in closer, further out and lower still (LONG_CAM_AIMED): the barrel runs from under his cheek to
// the crosshair, and only a lens below the head line and wide of it sees that stretch past the hair. In a
// dive or prone (LONG_CAM_LYING) it climbs and swings wide of him, so the gun ahead of his head shows. The
// view always turns onto the sim's aim point, so the crosshair stays exactly where shots go (the sim's
// SHOULDER is unchanged). A one-handed gun gets part of the long-gun lens (ONE_HAND_CAM).
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
import { KC, planKillcam, type KcPlan } from "./killcam.ts";
import { CINE, cine, rideEase, type Cine } from "./cine.ts";
import type { KillCam } from "../sim/game.ts";
import { isLongGun, isOneHand } from "../combat/weapons.ts";
import { holdDev } from "./dev/holdcheck.ts";
import { holdView, playerChest } from "./PlayerView.tsx";
import { blastShake } from "./ArsenalFx.tsx";

export const CAMERA_NODE = "rp-camera";
/** Dev builds: ?cam=<id of a "camera" marker> holds the camera on that shot (data.at = look-at point). */
const DEV_CAM = import.meta.env.MODE !== "production" ? new URLSearchParams(location.search).get("cam") : null;
export const FOV = 68;
/** The long-gun camera: the pivot further out to his right, a shorter arm, the eye below the pivot. */
export const LONG_CAM = { right: 1.0, arm: 2.1, down: 0.25, ease: 0.3 };
/** The share of LONG_CAM a one-handed gun (the hand cannon, the sawed-off) gets: the arm out to his right
 *  is in view and a size up, not a speck by his shoulder. */
export const ONE_HAND_CAM = 0.55;
/** Added to LONG_CAM while the long gun is shouldered (PlayerView's `holdView.aimed`), in / out (s). */
export const LONG_CAM_AIMED = { right: 0.15, arm: -0.3, down: 0.1, in: 0.15, out: 0.45 };
/** Added to LONG_CAM in a dive / prone (the eye `up` over the lying pivot; `getup` = its weight through
 *  the get-up, where he is upright again and a close lens would lose him off the left edge), in / out (s). */
export const LONG_CAM_LYING = { right: 0.2, arm: -0.55, up: 0.3, getup: 0, in: 0.2, out: 0.35 };
/** The current camera arm and shoulder offset, and the offset it would have with no wall (the player fades
 *  out when a wall pulls the camera into his head or slides the pivot in); the lens this frame (probes). */
export const camView = { arm: SHOULDER.arm as number, right: SHOULDER.right as number, baseRight: SHOULDER.right as number, eye: { x: 0, y: 0, z: 0 } };
const FOV_BT = 60;
/** The sniper's scope: the lens at the sim's pivot, looking down the aim ray (the crosshair is exact). */
export const FOV_SCOPE = 17;
export function CameraView({ s }: { s: Session }) {
  const prefab = usePrefab();
  const tmp = useMemo(() => ({
    m: new Matrix4(), eye: new Vector3(), at: new Vector3(), up: new Vector3(0, 1, 0), d: { x: 0, y: 0, z: -1 } as V3,
    arm: SHOULDER.arm as number, fov: FOV, kick: 0, orbit: 0, piv: new Vector3(), right: SHOULDER.right as number, aimT: 20, long: 0,
    /** Shouldered / lying weights (eased), and how far a wall at his right pulls the pivot in. */
    aimed: 0, lying: 0, pull: 0,
    /** How much of the long gun's drop the lens takes (it gives way when the lowered line is blocked). */
    dropK: 1,
    plan: null as KcPlan | null,
    /** The kill cam's plan and the cam it is for. */
    cplan: null as KcPlan | null,
    cfor: null as Cine | null,
  }), []);
  // what the camera collides with: every visible box, decor included (a tall decor box must not sit
  // between the camera and the shoulder), not the invisible play-area walls
  const camWorld = useMemo(() => new World(s.level.camBoxes.map((b, i) => ({ ...b, id: i }))), [s]);
  const viewWorld = useMemo(() => new World(s.level.viewBoxes.map((b, i) => ({ ...b, id: i }))), [s]);
  // doors the sim took out (the breach) are gone for the lens too; a new run puts them back
  const doorSync = useMemo(() => ({ n: -1, run: -1 }), [s]);
  useEffect(() => s.on(e => {
    if (e.type === "hurt" && e.target === -1) tmp.kick = 1;
  }), [s, tmp]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const g = s.game;
    if (doorSync.run !== s.run || doorSync.n !== g.world.off.size) {
      for (const id of [...camWorld.off]) if (!g.world.off.has(id)) camWorld.setEnabled(id, true);
      for (const id of g.world.off) camWorld.setEnabled(id, false);
      doorSync.run = s.run;
      doorSync.n = g.world.off.size;
    }
    const p = g.player;
    const k = g.killcam;
    let fovWant = g.timeScale < 0.99 ? FOV_BT : FOV;
    const dev = DEV_CAM ? g.level.markers.find(m => m.kind === "camera" && m.id === DEV_CAM) : undefined;
    if (holdDev.on) {
      for (const k of ["right", "arm", "down"] as const) if (holdDev.tweak["cam." + k] !== undefined) LONG_CAM[k] = holdDev.tweak["cam." + k];
      for (const k of ["right", "arm", "down"] as const) if (holdDev.tweak["aimcam." + k] !== undefined) LONG_CAM_AIMED[k] = holdDev.tweak["aimcam." + k];
      for (const k of ["right", "arm", "up", "getup"] as const) if (holdDev.tweak["liecam." + k] !== undefined) LONG_CAM_LYING[k] = holdDev.tweak["liecam." + k];
    }
    // the long-gun offsets ease in / out with the gun in hand, shouldered, lying
    const ease = (v: number, want: number, tin: number, tout: number) => v + (want - v) * Math.min(1, dt / (want > v ? tin : tout));
    tmp.long = ease(tmp.long, isLongGun(p.weapon.id) ? 1 : isOneHand(p.weapon.id) ? ONE_HAND_CAM : 0, LONG_CAM.ease, LONG_CAM.ease);
    tmp.aimed = ease(tmp.aimed, holdView.aimed, LONG_CAM_AIMED.in, LONG_CAM_AIMED.out);
    tmp.lying = ease(tmp.lying, p.mode === "dive" || p.mode === "prone" ? 1 : p.mode === "getup" ? LONG_CAM_LYING.getup : 0, LONG_CAM_LYING.in, LONG_CAM_LYING.out);
    const ll = tmp.long * tmp.lying, la = tmp.long * tmp.aimed * (1 - tmp.lying);
    const baseRight = SHOULDER.right + (LONG_CAM.right - SHOULDER.right) * tmp.long + LONG_CAM_AIMED.right * la + LONG_CAM_LYING.right * ll;
    const baseArm = SHOULDER.arm + (LONG_CAM.arm - SHOULDER.arm) * tmp.long + LONG_CAM_AIMED.arm * la + LONG_CAM_LYING.arm * ll;
    const eyeDown = LONG_CAM.down * tmp.long + LONG_CAM_AIMED.down * la - LONG_CAM_LYING.up * ll;
    camView.baseRight = baseRight;
    // no wall in these views: the pivot sits at its base offset (the player's fade reads the two)
    camView.right = baseRight;
    if (holdDev.on && holdDev.view !== "game") {
      // dev hold check: a close-up on the hands (his left side, right side, front three-quarter, behind)
      const f = p.facing, fx = Math.sin(f), fz = Math.cos(f), rx = -fz, rz = fx;
      const c = playerChest;
      const v = holdDev.view;
      const [a, b, up] = v === "side" ? [0.25, -1.45, 0.1] : v === "right" ? [0.25, 1.45, 0.1] : v === "front" ? [1.25, 0.75, 0.15] : [-1.3, 0.35, 0.35];
      tmp.eye.set(c.x + fx * a + rx * b, c.y + up, c.z + fz * a + rz * b);
      tmp.at.set(c.x + fx * 0.25, c.y - 0.05, c.z + fz * 0.25);
      fovWant = 42;
      camView.arm = SHOULDER.arm;
    } else if (dev) {
      const at = (dev.data.at as number[] | undefined) ?? [dev.x, dev.y, dev.z - 1];
      tmp.eye.set(dev.x, dev.y, dev.z);
      tmp.at.set(at[0], at[1], at[2]);
      fovWant = FOV;
      camView.arm = SHOULDER.arm;
    } else if (cine.cur && cine.cur.phase !== "out") {
      const c = cine.cur;
      const last = c.kills[c.kills.length - 1];
      const e = g.enemies[last.enemy];
      const blast = c.kind === "grenade";
      // a blast: from him to its centre, the swing around the centre
      const from = blast ? { x: p.x, y: p.y + 1.4, z: p.z } : c.from, to = blast ? c.from : c.to;
      if (tmp.cfor !== c) {
        tmp.cfor = c;
        const kc: KillCam = { t: 0, dur: 1, flight: 1, from, to, enemy: last.enemy, headshot: last.headshot, chase: c.ride };
        const at = blast || !e ? { x: to.x, y: e?.y ?? to.y - 1, z: to.z, killDX: 0, killDZ: 0 } : e;
        tmp.cplan = planKillcam(kc, at, camWorld, s.level, viewWorld);
      }
      const pl = tmp.cplan!;
      let dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      const hl = Math.hypot(dx, dz) || 1;
      const hx = dx / hl, hz = dz / hl, sx = hz, sz = -hx;
      const xk = c.phase === "xray" ? Math.min(1, (c.t - c.flight) / CINE.xray) : 0;
      if (c.ride && pl.chase) {
        // ride: 0.9 m behind the round, never closer than 2.4 m to where it hits; the view opens out
        // to her side as it slows in, then pushes in a little through the freeze
        const sb = cine.bulletAt(c);
        const endK = Math.max(0, Math.min(1, (rideEase(Math.min(1, c.t / c.flight)) - 0.55) / 0.45));
        const along = Math.min(sb - 0.9, c.dist - 2.4) + xk * 0.35;
        const sd = pl.side * (1 + 1.3 * endK), up = pl.lift * (1 + 0.8 * endK);
        tmp.eye.set(from.x + dx * along + sx * sd, from.y + dy * along + up, from.z + dz * along + sz * sd);
        const bx = from.x + dx * sb, by = from.y + dy * sb, bz = from.z + dz * sb;
        tmp.at.set(bx + dx * 2 + (to.x - bx - dx * 2) * endK, by + dy * 2 + (to.y - by - dy * 2) * endK, bz + dz * 2 + (to.z - bz - dz * 2) * endK);
        fovWant = KC.chaseFov - 4 * endK - 3 * xk;
      } else {
        // push: the swing's opening angle (a clear line to her / the blast), easing in and round
        const R = (blast ? 4.4 : KC.radius) * (1 - 0.2 * Math.min(1, c.t / (c.flight + CINE.xray)));
        const a = pl.a0 + pl.dir * 0.22 * c.t;
        const ey = blast ? (e?.y ?? to.y) + 2.1 : (e?.y ?? 0) + KC.eyeY;
        tmp.eye.set(pl.kx + (-hx * Math.cos(a) + sx * Math.sin(a)) * R, ey, pl.kz + (-hz * Math.cos(a) + sz * Math.sin(a)) * R);
        tmp.at.set(pl.kx, (blast ? to.y : e?.y ?? 0) + KC.atY, pl.kz);
        fovWant = KC.fov - 4 * xk;
      }
      camView.arm = SHOULDER.arm;
    } else if (k) {
      const e = g.enemies[k.enemy];
      if (!tmp.plan || tmp.plan.kc !== k) { tmp.plan = planKillcam(k, e ?? { x: k.to.x, y: 0, z: k.to.z, killDX: 0, killDZ: 1 }, camWorld, s.level, viewWorld); tmp.orbit = 0; }
      const pl = tmp.plan;
      // bullet position along the replayed shot (after the kill cam's ride: the swing only)
      const f = cine.flownFinal ? 1 : Math.min(1, k.t / k.flight);
      const bx = k.from.x + (k.to.x - k.from.x) * f, by = k.from.y + (k.to.y - k.from.y) * f, bz = k.from.z + (k.to.z - k.from.z) * f;
      let dx = k.to.x - k.from.x, dy = k.to.y - k.from.y, dz = k.to.z - k.from.z;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      dx /= l; dy /= l; dz /= l;
      const hl = Math.hypot(dx, dz) || 1;
      const hx = dx / hl, hz = dz / hl, sx = hz, sz = -hx; // horizontal shot direction and its side
      if (f < 1 && pl.chase && k.chase !== false) {
        tmp.eye.set(bx - dx * 0.9 + sx * pl.side, by - dy * 0.9 + pl.lift, bz - dz * 0.9 + sz * pl.side);
        tmp.at.set(bx + dx * 2, by + dy * 2, bz + dz * 2);
        tmp.orbit = 0;
        fovWant = KC.chaseFov;
      } else {
        if (f >= 1) tmp.orbit += dt * KC.turn; // no chase: hold the opening angle while the bullet flies in
        const a = pl.a0 + pl.dir * tmp.orbit;
        const ey = (e?.y ?? 0);
        tmp.eye.set(pl.kx + (-hx * Math.cos(a) + sx * Math.sin(a)) * KC.radius, ey + KC.eyeY, pl.kz + (-hz * Math.cos(a) + sz * Math.sin(a)) * KC.radius);
        tmp.at.set(pl.kx, ey + KC.atY, pl.kz);
        fovWant = KC.fov;
      }
      camView.arm = SHOULDER.arm;
    } else if (p.zoom) {
      // scoped: the eye on the sim's pivot, along the aim ray; the body is hidden (PlayerView)
      tmp.plan = null;
      const r = s.renderP;
      const d = aimDir(p.yaw, p.pitch, tmp.d);
      const right = shoulderRight(g.world, p), c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
      tmp.eye.set(r.x + c * right, r.y + p.pivotUp, r.z - sn * right);
      tmp.at.set(tmp.eye.x + d.x * 10, tmp.eye.y + d.y * 10, tmp.eye.z + d.z * 10);
      fovWant = FOV_SCOPE;
      camView.arm = SHOULDER.arm;
    } else {
      tmp.plan = null;
      const r = s.renderP;
      const d = aimDir(p.yaw, p.pitch, tmp.d);
      const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
      // the shoulder offset gives way to a wall at his right (never a lens inside the facade)
      const by = r.y + p.pivotUp;
      // (the wall's pull is kept apart from the base offset: the pull comes in at once and eases back
      // out, while the base follows the long-gun / shouldered / lying eases exactly, so a swap or a shot
      // never reads as a wall and never fades him)
      const side = camWorld.raycast(r.x, by, r.z, c, 0, -sn, baseRight + 0.3, false);
      const pullWant = side ? baseRight - Math.max(0, side.t - 0.3) : 0;
      tmp.pull = pullWant > tmp.pull ? pullWant : tmp.pull + (pullWant - tmp.pull) * Math.min(1, 5 * dt);
      tmp.right = Math.max(0, baseRight - tmp.pull);
      tmp.piv.set(r.x + c * tmp.right, by, r.z - sn * tmp.right);
      camView.right = tmp.right;
      // the eye drops below the pivot with a long gun (the head then sits above the gun line), or climbs
      // over it lying down; never below a floor under the lens. The wall check runs along the line from
      // the pivot to the FINAL (lowered / raised) eye: a lens that only clears a car roof before it drops
      // must not end up in the cab. When the lowered line is blocked sooner than the level one, the drop
      // gives way (eased) rather than the arm, so he stays in view over the roof instead of the lens
      // jamming into his head; a wall still pulls the eye in along the line that was checked.
      const ey0 = tmp.piv.y - d.y * baseArm;
      const dropFull = eyeDown > 0 ? Math.min(eyeDown, Math.max(0, ey0 - (r.y + 0.3))) : eyeDown;
      /** The arm a line with this drop allows (the drop scales with the arm, so the eye stays on it). */
      const armFor = (drop: number) => {
        const ox = -d.x * baseArm, oy = -d.y * baseArm - drop, oz = -d.z * baseArm;
        const ol = Math.hypot(ox, oy, oz) || 1;
        const hit = camWorld.raycast(tmp.piv.x, tmp.piv.y, tmp.piv.z, ox / ol, oy / ol, oz / ol, ol + 0.3, false);
        return hit ? Math.max(SHOULDER.minArm, (hit.t - 0.3) * (baseArm / ol)) : baseArm;
      };
      const dropWant = dropFull > 0 && armFor(dropFull) < armFor(0) - 0.05 ? 0 : 1;
      tmp.dropK += (dropWant - tmp.dropK) * Math.min(1, dt / 0.15);
      const drop = dropFull * tmp.dropK;
      const want = armFor(drop);
      tmp.arm = want < tmp.arm ? want : tmp.arm + (want - tmp.arm) * Math.min(1, 6 * dt);
      camView.arm = tmp.arm;
      const f = tmp.arm / baseArm;
      tmp.eye.set(tmp.piv.x - d.x * baseArm * f, tmp.piv.y + (-d.y * baseArm - drop) * f, tmp.piv.z - d.z * baseArm * f);
      // look at the point on the sim's aim ray at the aim point's distance: the same view as along the
      // ray when the shoulder is free; with the pivot slid in, the crosshair still sits on the aim point
      const simRight = shoulderRight(g.world, p); // the sim's pivot, pulled in by a wall like this one
      const sx0 = r.x + c * simRight, sz0 = r.z - sn * simRight;
      const ap = g.aimPoint;
      const aimWant = Math.min(80, Math.max(3, Math.hypot(ap.x - sx0, ap.y - by, ap.z - sz0)));
      tmp.aimT += (aimWant - tmp.aimT) * Math.min(1, 10 * dt);
      tmp.at.set(sx0 + d.x * tmp.aimT, by + d.y * tmp.aimT, sz0 + d.z * tmp.aimT);
      // hit kick, and a blast's shake by its distance
      tmp.kick = Math.max(0, tmp.kick - dt * 6);
      if (tmp.kick > 0 || blastShake.k > 0) {
        const j = tmp.kick * 0.06 + blastShake.k * 0.12;
        tmp.eye.x += (Math.random() - 0.5) * j; tmp.eye.y += (Math.random() - 0.5) * j;
      }
    }
    tmp.m.lookAt(tmp.eye, tmp.at, tmp.up);
    camView.eye.x = tmp.eye.x; camView.eye.y = tmp.eye.y; camView.eye.z = tmp.eye.z;
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
    // the scope snaps in (a tiny ease), the rest glides; look sensitivity follows the view's width
    tmp.fov += (fovWant - tmp.fov) * Math.min(1, (p.zoom || fovWant === FOV_SCOPE ? 30 : 8) * dt);
    s.input.fovK = p.zoom ? Math.tan((tmp.fov * Math.PI) / 360) / Math.tan((FOV * Math.PI) / 360) : 1;
    if (cam instanceof PerspectiveCamera && Math.abs(cam.fov - tmp.fov) > 0.01) {
      cam.fov = tmp.fov;
      cam.updateProjectionMatrix();
    }
  }, FRAME.camera);
  return null;
}
