// The secrets' moving props (arsenal spec 4.1; views only, the sim takes the colliders out): a secret door
// swings on its hinge away from him or slides along its `slide`, over 0.5 s of world time; its collider
// node and the decor node it names (`mesh`) move together. The room 2 fire door is left standing 10 deg
// ajar once the crowd has run out through it (the tell). A broken breakable's node is hidden (ArsenalFx
// throws the splinters or glitter). Each new run puts everything back; a checkpoint resume opens what it
// kept open.
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { usePrefab } from "react-three-game";
import type { Object3D } from "three";
import type { Session } from "./session.ts";
import type { SecretDoor } from "../world/level.ts";
import { FRAME } from "./frame.ts";

const OPEN = { swing: (100 * Math.PI) / 180, ajar: (10 * Math.PI) / 180, time: 0.5 };

type Part = { o: Object3D; x: number; y: number; z: number; yaw: number };
type Door = { d: SecretDoor; parts: Part[]; pivot: [number, number]; sign: number; t: number; target: number; start: number; opening: boolean };

export function SecretsView({ s }: { s: Session }) {
  const prefab = usePrefab();
  const st = useMemo(() => ({ run: -1, doors: [] as Door[], broken: new Set<string>(), hidden: [] as Object3D[] }), []);

  const setup = () => {
    // put the previous run's props back
    for (const dr of st.doors) for (const p of dr.parts) { p.o.position.set(p.x, p.y, p.z); p.o.rotation.y = p.yaw; }
    for (const o of st.hidden) o.visible = true;
    st.hidden.length = 0;
    st.doors = [];
    const g = s.game;
    for (const d of s.level.doors) {
      const box = s.level.boxes.find(b => b.node === d.node);
      if (!box) continue;
      const parts: Part[] = [];
      for (const id of [d.node, d.mesh]) {
        const o = id ? prefab.getObject(id) : null;
        if (o) parts.push({ o, x: o.position.x, y: o.position.y, z: o.position.z, yaw: o.rotation.y });
      }
      // the hinge: the box's left or right end along its long horizontal side
      const long = box.hx >= box.hz ? "x" : "z";
      const e = (d.hinge === "right" ? 1 : -1) * (long === "x" ? box.hx : box.hz);
      const px = box.cx + (long === "x" ? e * box.cos : e * box.sin), pz = box.cz + (long === "x" ? -e * box.sin : e * box.cos);
      // swing away from the room he stands in (the side of the spawn / the level's middle)
      const nx = long === "x" ? box.sin : box.cos, nz = long === "x" ? box.cos : -box.sin;
      const spawn = s.level.markers.find(m => m.kind === "spawn");
      const side = Math.sign(((spawn?.x ?? 0) - box.cx) * nx + ((spawn?.z ?? 0) - box.cz) * nz) || 1;
      // which way a +angle turn moves the free end, against the door's normal
      const fx = box.cx - px, fz = box.cz - pz;
      const dispN = (fz * nx - fx * nz); // d/dtheta of R(theta) f at 0, dotted with n
      const sign = dispN * side > 0 ? -1 : 1;
      const dr: Door = { d, parts, pivot: [px, pz], sign, t: 0, target: 0, start: 0, opening: false };
      st.doors.push(dr);
      if (g.opened.includes(d.node)) { dr.target = 1; dr.t = 1; }
    }
    st.broken = new Set(g.broken);
    for (const n of g.broken) { const o = prefab.getObject(n); if (o) { o.visible = false; st.hidden.push(o); } }
  };

  const pose = (dr: Door, k: number) => {
    const d = dr.d;
    for (const p of dr.parts) {
      if (d.open === "slide") {
        p.o.position.set(p.x + d.slide[0] * k, p.y, p.z + d.slide[1] * k);
      } else {
        const th = dr.sign * k;
        const c = Math.cos(th), sn = Math.sin(th);
        const rx = p.x - dr.pivot[0], rz = p.z - dr.pivot[1];
        p.o.position.set(dr.pivot[0] + rx * c + rz * sn, p.y, dr.pivot[1] - rx * sn + rz * c);
        p.o.rotation.y = p.yaw + th;
      }
    }
  };

  useEffect(() => s.on((e, ss) => {
    if (e.type === "open") {
      const dr = st.doors.find(x => x.d.node === e.node);
      if (dr) { dr.opening = true; dr.start = dr.t; dr.target = 1; dr.t = 0; }
    } else if (e.type === "break") {
      const o = prefab.getObject(e.node);
      if (o) { o.visible = false; st.hidden.push(o); }
      void ss;
    }
  }), [s, st, prefab]);

  useFrame((_, raw) => {
    const g = s.game;
    if (st.run !== s.run) { st.run = s.run; setup(); for (const dr of st.doors) pose(dr, dr.t >= 1 ? (dr.d.open === "slide" ? 1 : OPEN.swing) : 0); return; }
    const wdt = Math.min(raw, 0.1) * s.viewScale;
    for (const dr of st.doors) {
      if (dr.opening) {
        dr.t = Math.min(1, dr.t + wdt / OPEN.time);
        const k = dr.t * dr.t * (3 - 2 * dr.t);
        const from = dr.start;
        pose(dr, dr.d.open === "slide" ? k : from + (OPEN.swing - from) * k);
        if (dr.t >= 1) dr.opening = false;
      } else if (dr.target === 0 && dr.d.id === "fire-exit" && g.firstShotAt >= 0 && g.time - g.firstShotAt > 2.5 && dr.start === 0) {
        // the crowd ran out through it: it stands ajar
        dr.start = OPEN.ajar;
        pose(dr, OPEN.ajar);
      }
    }
  }, FRAME.fx);
  return null;
}
