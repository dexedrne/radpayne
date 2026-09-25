// Room 3's moving props (views only: the sim keeps the colliders, see Game.breach):
//  - the breach door: the two leaves of the locked office door (door_office texture) stand in the
//    doorway until the sim's "breach" event, then come off their hinges and blow apart to both sides
//    (along the dive, or out into the hall when the heavy kicks it), with a burst of brown splinters. No blood. They fly on world
//    time, so the breach's slow motion floats them. The leaves block the enemy outline like a wall.
//  - the glass wall between the security office and the manager's office ("glass-pane*" colliders, which
//    bullets pass): a faint pane that shatters on the first shot through it (glass_wall_shatter), the
//    shards settle on the floor; the collider stays (the frame).
//  - the service elevator (fx "elevator" marker): its doors slide open at the room's exit, after the
//    keycard beep and the bell, with the car's warm light behind them.
// Each new run puts everything back (a checkpoint resume leaves a breached door lying in the office).
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BoxGeometry, Color, DoubleSide, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, PointLight, Quaternion, SRGBColorSpace, TextureLoader, Vector3, Vector4,
  type Material,
} from "three";
import type { Session } from "./session.ts";
import type { GameEvent } from "../sim/types.ts";
import type { Box } from "../sim/world.ts";
import { FRAME } from "./frame.ts";
import { MASK_LAYER } from "./look/read.tsx";
import { sfx } from "../audio/sfx.ts";

const HIDE = new Matrix4().makeScale(0, 0, 0);
const G = 9.8;

type Body = { p: Vector3; v: Vector3; q: Quaternion; w: Vector3; flying: boolean; rest: boolean };
type Leaf = { mesh: Mesh; homeP: Vector3; homeQ: Quaternion; body: Body; side: number };
type Door = { node: string; box: Box; leaves: Leaf[]; gone: boolean; restDir: Vector3 };
type Pane = { node: string; box: Box; mesh: Mesh; broken: boolean };
type Bit = { p: Vector3; v: Vector3; axis: Vector3; ang: number; spin: number; s: Vector3; rest: boolean; alive: boolean };

class Debris {
  readonly mesh: InstancedMesh;
  readonly bits: Bit[];
  private next = 0;
  constructor(geo: BoxGeometry, mat: Material, n: number) {
    this.mesh = new InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.bits = Array.from({ length: n }, () => ({ p: new Vector3(), v: new Vector3(), axis: new Vector3(0, 1, 0), ang: 0, spin: 0, s: new Vector3(1, 1, 1), rest: false, alive: false }));
    this.clear();
  }
  spawn(): Bit {
    const b = this.bits[this.next];
    this.next = (this.next + 1) % this.bits.length;
    b.alive = true;
    b.rest = false;
    return b;
  }
  clear(): void {
    for (let i = 0; i < this.bits.length; i++) { this.bits[i].alive = false; this.mesh.setMatrixAt(i, HIDE); }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  step(dt: number, floor: (x: number, z: number) => number): void {
    const m = new Matrix4(), q = new Quaternion();
    this.bits.forEach((b, i) => {
      if (!b.alive) return;
      if (!b.rest) {
        b.v.y -= G * dt;
        b.p.addScaledVector(b.v, dt);
        b.ang += b.spin * dt;
        const fy = floor(b.p.x, b.p.z) + 0.01;
        if (b.p.y <= fy) {
          b.p.y = fy;
          if (Math.abs(b.v.y) < 0.8) { b.rest = true; b.axis.set(0, 1, 0); b.ang = i * 1.7; } // lies flat (thin side down), turned
          else { b.v.y *= -0.25; b.v.x *= 0.5; b.v.z *= 0.5; b.spin *= 0.5; }
        }
      }
      q.setFromAxisAngle(b.axis, b.ang);
      m.compose(b.p, q, b.s);
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Box-local slab test: the parameter along a -> b where the segment enters the box, or -1. */
function segmentHits(b: Box, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const loc = (x: number, z: number) => { const dx = x - b.cx, dz = z - b.cz; return [dx * b.cos - dz * b.sin, dx * b.sin + dz * b.cos]; };
  const [lax, laz] = loc(ax, az), [lbx, lbz] = loc(bx, bz);
  const o = [lax, ay - b.cy, laz], d = [lbx - lax, by - ay, lbz - laz], h = [b.hx, b.hy, b.hz];
  let t0 = 0, t1 = 1;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (Math.abs(o[k]) > h[k]) return -1; continue; }
    let u0 = (-h[k] - o[k]) / d[k], u1 = (h[k] - o[k]) / d[k];
    if (u0 > u1) { const t = u0; u0 = u1; u1 = t; }
    t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
    if (t0 > t1) return -1;
  }
  return t0;
}

export function PropsView({ s }: { s: Session }) {
  const level = s.level;
  const props = useMemo(() => {
    const group = new Group();
    const loader = new TextureLoader();
    const occluder = new Vector4(0, 0, 0, 0);
    // the breach doors
    const doors: Door[] = [];
    let doorMat: MeshStandardMaterial | null = null;
    for (const t of level.markers) {
      if (t.kind !== "trigger" || t.data.action !== "breach" || typeof t.data.door !== "string") continue;
      const box = level.boxes.find(b => b.node === t.data.door);
      if (!box) continue;
      if (!doorMat) {
        const tex = loader.load("/textures/backrooms/door_office.webp");
        tex.colorSpace = SRGBColorSpace;
        doorMat = new MeshStandardMaterial({ map: tex, roughness: 0.5 });
        doorMat.userData.rpOwn = true;
      }
      const leaves: Leaf[] = [];
      for (const side of [-1, 1]) {
        const g = new BoxGeometry(box.hx - 0.01, box.hy * 2 - 0.04, 0.05);
        if (side > 0) { // the right leaf: the texture mirrored (the handle by the middle on both)
          const uv = g.getAttribute("uv");
          for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
        }
        const mesh = new Mesh(g, doorMat);
        mesh.layers.enable(MASK_LAYER);
        mesh.userData.rpMask = occluder;
        const lx = side * box.hx / 2;
        const homeP = new Vector3(box.cx + lx * box.cos, box.cy - 0.02, box.cz - lx * box.sin);
        const homeQ = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), box.yaw);
        mesh.position.copy(homeP);
        mesh.quaternion.copy(homeQ);
        group.add(mesh);
        leaves.push({ mesh, homeP, homeQ, side, body: { p: homeP.clone(), v: new Vector3(), q: homeQ.clone(), w: new Vector3(), flying: false, rest: false } });
      }
      // the way it falls when resumed from a checkpoint: from the trigger through the door
      const restDir = new Vector3(box.cx - t.x, 0, box.cz - t.z).normalize();
      doors.push({ node: box.node, box, leaves, gone: false, restDir });
    }
    // the glass panes
    const panes: Pane[] = [];
    const glassMat = new MeshStandardMaterial({ color: new Color("#b8cfe0"), transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.3, depthWrite: false, side: DoubleSide });
    glassMat.userData.rpOwn = true;
    for (const b of level.boxes) {
      if (!b.node.startsWith("glass-pane")) continue;
      const mesh = new Mesh(new BoxGeometry(b.hx * 2, b.hy * 2, b.hz * 2), glassMat);
      mesh.position.set(b.cx, b.cy, b.cz);
      mesh.rotation.y = b.yaw;
      mesh.renderOrder = 3;
      group.add(mesh);
      panes.push({ node: b.node, box: b, mesh, broken: false });
    }
    // debris: splinters and shards
    const splinterMat = new MeshStandardMaterial({ color: "#6b4a2e", roughness: 0.8 });
    const shardMat = new MeshStandardMaterial({ color: "#cfe3f0", roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.55, side: DoubleSide, emissive: new Color("#1a2a33") });
    splinterMat.userData.rpOwn = true;
    shardMat.userData.rpOwn = true;
    const splinters = new Debris(new BoxGeometry(0.03, 0.02, 0.16), splinterMat, 56);
    const shards = new Debris(new BoxGeometry(0.12, 0.004, 0.09), shardMat, 110);
    group.add(splinters.mesh, shards.mesh);
    // the elevator
    const em = level.markers.find(m => m.kind === "fx" && m.data.fx === "elevator");
    let elevator: { leaves: Mesh[]; home: Vector3[]; along: Vector3; w: number; light: PointLight; openAt: number } | null = null;
    if (em) {
      const w = typeof em.data.w === "number" ? em.data.w : 2, h = typeof em.data.h === "number" ? em.data.h : 2.2;
      const tex = loader.load("/textures/backrooms/elevator_doors.webp");
      tex.colorSpace = SRGBColorSpace;
      const mat = new MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.6 });
      mat.userData.rpOwn = true;
      const fwd = new Vector3(Math.sin(em.yaw), 0, Math.cos(em.yaw)), along = new Vector3(Math.cos(em.yaw), 0, -Math.sin(em.yaw));
      const leaves: Mesh[] = [], home: Vector3[] = [];
      for (const side of [-1, 1]) {
        const g = new PlaneGeometry(w / 2, h);
        // each leaf shows its half of the doors (inside the texture's frame)
        const uv = g.getAttribute("uv");
        const u0 = side < 0 ? 0.07 : 0.5, u1 = side < 0 ? 0.5 : 0.93;
        for (let i = 0; i < uv.count; i++) { uv.setX(i, u0 + uv.getX(i) * (u1 - u0)); uv.setY(i, 0.03 + uv.getY(i) * 0.94); }
        const mesh = new Mesh(g, mat);
        const p = new Vector3(em.x, em.y + h / 2, em.z).addScaledVector(fwd, 0.035).addScaledVector(along, side * w / 4);
        mesh.position.copy(p);
        mesh.rotation.y = em.yaw;
        mesh.layers.enable(MASK_LAYER);
        mesh.userData.rpMask = occluder;
        group.add(mesh);
        leaves.push(mesh);
        home.push(p);
      }
      const light = new PointLight("#ffc98a", 0, 5, 2);
      light.position.set(em.x, em.y + 2.2, em.z).addScaledVector(fwd, -0.9);
      group.add(light);
      elevator = { leaves, home, along, w, light, openAt: -1 };
    }
    return { group, doors, panes, splinters, shards, elevator, run: -1, doorMat, glassMat, splinterMat, shardMat };
  }, [level]);

  useEffect(() => () => {
    props.group.traverse(o => { const m = o as Mesh; if (m.isMesh) m.geometry.dispose(); });
    for (const m of [props.doorMat, props.glassMat, props.splinterMat, props.shardMat]) { m?.map?.dispose(); m?.dispose(); }
  }, [props]);

  useEffect(() => s.on((e: GameEvent, ss) => {
    const g = ss.game, p = g.player;
    const where = (x: number, z: number) => {
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1;
      return { d, pan: (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / d };
    };
    if (e.type === "breach") {
      const door = props.doors.find(d => d.node === e.id);
      if (!door) return;
      door.gone = true;
      const dir = new Vector3(e.dx, 0, e.dz);
      const b = door.box;
      const across = new Vector3(b.cos, 0, -b.sin);
      for (const l of door.leaves) {
        const body = l.body;
        body.flying = true;
        body.rest = false;
        body.p.copy(l.mesh.position);
        body.q.copy(l.mesh.quaternion);
        // the two leaves blow apart to their own sides (never straight down the lens's line: the camera
        // follows him through the frame a moment later) and a little way in
        body.v.copy(dir).multiplyScalar((e.kick ? 2.2 : 2.8) + Math.random() * 0.8).addScaledVector(across, l.side * (6 + Math.random() * 2));
        body.v.y = 0.9 + Math.random() * 0.6;
        // swinging off the hinge, a slight tumble
        body.w.set(0, -l.side * (5 + Math.random() * 3), 0).addScaledVector(across, 0.8 + Math.random() * 0.8);
      }
      // splinters from the lock and the hinges
      for (let i = 0; i < 44; i++) {
        const bit = props.splinters.spawn();
        const u = (Math.random() - 0.5) * 2 * b.hx;
        bit.p.set(b.cx + u * b.cos, 0.3 + Math.random() * 1.9, b.cz - u * b.sin);
        bit.v.copy(dir).multiplyScalar(1.5 + Math.random() * 5).add(new Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3));
        bit.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        bit.spin = (Math.random() - 0.5) * 30;
        bit.ang = Math.random() * 6;
        const k = 0.6 + Math.random() * 0.9;
        bit.s.set(k, k, k);
      }
      const w = where(b.cx, b.cz);
      sfx.breach(w.d, w.pan);
    } else if (e.type === "shot") {
      // the glass wall: the first shot through a pane breaks it (bullets pass the pane's collider)
      for (const pane of props.panes) {
        if (pane.broken) continue;
        const t = segmentHits(pane.box, e.ox, e.oy, e.oz, e.ex, e.ey, e.ez);
        if (t < 0) continue;
        const len = Math.hypot(e.ex - e.ox, e.ey - e.oy, e.ez - e.oz) || 1;
        const dx = (e.ex - e.ox) / len, dy = (e.ey - e.oy) / len, dz = (e.ez - e.oz) / len;
        if (e.projectile) {
          // a bullet-time round flies to the max range: only if no wall stops it first
          const hit = g.world.raycast(e.ox, e.oy, e.oz, dx, dy, dz, len, true);
          if (hit && hit.t < t * len) continue;
        }
        pane.broken = true;
        pane.mesh.visible = false;
        const b = pane.box;
        const hx = e.ox + dx * t * len, hy = e.oy + dy * t * len, hz = e.oz + dz * t * len;
        for (let i = 0; i < 100; i++) {
          const bit = props.shards.spawn();
          const u = (Math.random() - 0.5) * 2 * b.hz; // along the pane (its long side is local z)
          const lx = (Math.random() - 0.5) * 2 * b.hx;
          bit.p.set(b.cx + lx * b.cos + u * b.sin, b.cy + (Math.random() - 0.5) * 2 * b.hy, b.cz - lx * b.sin + u * b.cos);
          const near = Math.max(0, 1 - bit.p.distanceTo(new Vector3(hx, hy, hz)) / 2.5);
          bit.v.set(dx, 0, dz).multiplyScalar(0.4 + near * 3 + Math.random() * 0.8).add(new Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.6, (Math.random() - 0.5) * 0.8));
          bit.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
          bit.spin = (Math.random() - 0.5) * 16;
          bit.ang = Math.random() * 6;
          const k = 0.5 + Math.random() * 1.1;
          bit.s.set(k, 1, k * (0.7 + Math.random() * 0.6));
        }
        const w = where(b.cx, b.cz);
        sfx.at("glass_wall_shatter", w.d, w.pan, 0.8);
      }
    } else if (e.type === "exit" && props.elevator) {
      props.elevator.openAt = performance.now() / 1000 + 0.7;
      const m = level.markers.find(k => k.kind === "fx" && k.data.fx === "elevator")!;
      const w = where(m.x, m.z);
      sfx.at("keycard_beep", w.d, w.pan, 0.7);
      sfx.at("elevator_ding", w.d, w.pan, 0.6, 0.45);
      sfx.at("elevator_doors", w.d, w.pan, 0.6, 0.7);
    }
  }), [s, props, level]);

  useFrame((_, raw) => {
    const g = s.game;
    const dt = Math.min(raw, 0.1);
    const wdt = s.paused ? 0 : dt * g.timeScale;
    const floorY = (x: number, z: number) => { const y = g.world.groundBelow(x, z, 0.05, 0.6); return Number.isFinite(y) ? y : 0; };
    if (props.run !== s.run) {
      props.run = s.run;
      props.splinters.clear();
      props.shards.clear();
      for (const pane of props.panes) { pane.broken = false; pane.mesh.visible = true; }
      for (const d of props.doors) {
        d.gone = g.breached.includes(d.node);
        d.leaves.forEach((l, i) => {
          l.body.flying = false;
          l.body.rest = d.gone;
          if (d.gone) {
            // a checkpoint resume: the leaves lie in the office where they fell
            const p = new Vector3(d.box.cx, 0, d.box.cz).addScaledVector(d.restDir, 2.2 + i * 0.9).add(new Vector3(l.side * 0.5, 0.03 + i * 0.05, 0));
            l.mesh.position.copy(p);
            l.mesh.quaternion.setFromEuler(new Euler(-Math.PI / 2, d.box.yaw + i * 0.4, 0, "YXZ"));
          } else {
            l.mesh.position.copy(l.homeP);
            l.mesh.quaternion.copy(l.homeQ);
          }
        });
      }
      if (props.elevator) {
        props.elevator.openAt = -1;
        props.elevator.leaves.forEach((m, i) => m.position.copy(props.elevator!.home[i]));
        props.elevator.light.intensity = 0;
      }
    }
    // the flying leaves (world time: the breach's slow motion floats them)
    const dq = new Quaternion();
    for (const d of props.doors) for (const l of d.leaves) {
      const b = l.body;
      if (!b.flying || b.rest) continue;
      b.v.y -= G * wdt;
      b.p.addScaledVector(b.v, wdt);
      const wl = b.w.length();
      if (wl > 1e-4) { dq.setFromAxisAngle(b.w.clone().divideScalar(wl), wl * wdt); b.q.premultiply(dq); }
      const fy = floorY(b.p.x, b.p.z);
      if (b.p.y <= fy + 0.35 && b.v.y < 0) {
        // down: it lies flat, face up, where it landed, and slides a little
        b.rest = true;
        const yaw = new Euler().setFromQuaternion(b.q, "YXZ").y;
        b.q.setFromEuler(new Euler(-Math.PI / 2, yaw, 0, "YXZ"));
        b.p.y = fy + 0.03;
        b.p.addScaledVector(new Vector3(b.v.x, 0, b.v.z), 0.08);
      }
      l.mesh.position.copy(b.p);
      l.mesh.quaternion.copy(b.q);
    }
    props.splinters.step(wdt, floorY);
    props.shards.step(wdt, floorY);
    // the elevator doors (real time: the room is over)
    const el = props.elevator;
    if (el && el.openAt > 0) {
      const u = Math.min(1, Math.max(0, (performance.now() / 1000 - el.openAt) / 1.6));
      const k = u * u * (3 - 2 * u);
      el.leaves.forEach((m, i) => m.position.copy(el.home[i]).addScaledVector(el.along, (i === 0 ? -1 : 1) * k * el.w * 0.47));
      el.light.intensity = 6 * k;
    }
  }, FRAME.fx);

  return <primitive object={props.group} />;
}
