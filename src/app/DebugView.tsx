// Dev overlays: ?hitboxes draws every actor's sim hit capsules (to line the models up with them),
// ?markers draws the level markers (spawn, enemies, cover facing, waypoints + links, pickups,
// triggers). Nothing is mounted without the flags.
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, ConeGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3 } from "three";
import type { Session } from "./session.ts";
import { HB_COUNT, poseHitboxes, makeCapsules } from "../combat/hitboxes.ts";
import { FRAME } from "./frame.ts";

const params = new URLSearchParams(location.search);
const SHOW_HB = params.has("hitboxes");
const SHOW_MARKERS = params.has("markers");

export function DebugView({ s }: { s: Session }) {
  if (!SHOW_HB && !SHOW_MARKERS) return null;
  return (
    <>
      {SHOW_HB && <Hitboxes s={s} />}
      {SHOW_MARKERS && <Markers s={s} />}
    </>
  );
}

function Hitboxes({ s }: { s: Session }) {
  const d = useMemo(() => {
    const n = 64;
    const mat = new MeshBasicMaterial({ color: "#39ff88", wireframe: true, depthTest: false, transparent: true, opacity: 0.6 });
    const spheres = new InstancedMesh(new SphereGeometry(1, 10, 8), mat, n * 3);
    const links = new InstancedMesh(new BoxGeometry(1, 1, 1), mat, n);
    spheres.frustumCulled = links.frustumCulled = false;
    const g = new Group();
    g.add(spheres, links);
    return { g, spheres, links, caps: makeCapsules(), m: new Matrix4(), q: new Quaternion(), a: new Vector3(), b: new Vector3(), v: new Vector3() };
  }, []);
  useFrame(() => {
    let si = 0, li = 0;
    const hide = new Matrix4().makeScale(0, 0, 0);
    for (const act of s.game.actors) {
      if (!poseHitboxes(act.body, act.pose, d.caps)) continue;
      for (let i = 0; i < HB_COUNT; i++) {
        const c = d.caps[i];
        d.a.set(c.ax, c.ay, c.az);
        d.b.set(c.bx, c.by, c.bz);
        for (const p of c.ax === c.bx && c.ay === c.by && c.az === c.bz ? [d.a] : [d.a, d.b]) {
          d.m.compose(p, d.q.identity(), d.v.set(c.r, c.r, c.r));
          d.spheres.setMatrixAt(si++, d.m);
        }
        if (d.a.distanceTo(d.b) > 1e-4) {
          d.v.subVectors(d.b, d.a);
          const len = d.v.length();
          d.q.setFromUnitVectors(new Vector3(0, 0, 1), d.v.normalize());
          d.m.compose(d.a.clone().add(d.b).multiplyScalar(0.5), d.q, d.v.set(c.r * 1.6, c.r * 1.6, len));
          d.links.setMatrixAt(li++, d.m);
        }
      }
    }
    for (let i = si; i < d.spheres.count; i++) d.spheres.setMatrixAt(i, hide);
    for (let i = li; i < d.links.count; i++) d.links.setMatrixAt(i, hide);
    d.spheres.instanceMatrix.needsUpdate = true;
    d.links.instanceMatrix.needsUpdate = true;
  }, FRAME.fx);
  return <primitive object={d.g} />;
}

const COLORS: Record<string, string> = { spawn: "#ffffff", enemy: "#ff3fa8", cover: "#39ff88", waypoint: "#3fa8ff", pickup: "#ff8a1f", trigger: "#ffe23f", checkpoint: "#ffffff", exit: "#3ff0ff", light: "#ffae52", camera: "#aaaaaa" };

function Markers({ s }: { s: Session }) {
  const g = useMemo(() => {
    const out = new Group();
    const lv = s.level;
    for (const m of lv.markers) {
      const mat = new MeshBasicMaterial({ color: COLORS[m.kind] ?? "#fff", wireframe: m.kind === "trigger", transparent: true, opacity: 0.75, depthTest: m.kind !== "trigger" });
      let mesh: Mesh;
      if (m.kind === "trigger") {
        mesh = new Mesh(new BoxGeometry(m.hx * 2, m.hy * 2, m.hz * 2), mat);
        mesh.position.set(m.x, m.y, m.z);
      } else if (m.kind === "cover" || m.kind === "enemy" || m.kind === "spawn" || m.kind === "exit") {
        mesh = new Mesh(new ConeGeometry(0.18, 0.5, 8), mat);
        mesh.rotation.set(Math.PI / 2, 0, 0);
        const holder = new Group();
        holder.position.set(m.x, m.y + (m.kind === "cover" ? 0.3 : 1), m.z);
        holder.rotation.y = m.yaw;
        holder.add(mesh);
        out.add(holder);
        continue;
      } else {
        mesh = new Mesh(new SphereGeometry(0.15, 8, 6), mat);
        mesh.position.set(m.x, m.y + 0.2, m.z);
      }
      out.add(mesh);
    }
    const lineMat = new MeshBasicMaterial({ color: "#3fa8ff", transparent: true, opacity: 0.5 });
    const nodes = s.game.graph.nodes;
    nodes.forEach((a, i) => a.links.forEach(j => {
      if (j < i) return;
      const b = nodes[j];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const bar = new Mesh(new BoxGeometry(0.04, 0.04, len), lineMat);
      bar.position.set((a.x + b.x) / 2, 0.2, (a.z + b.z) / 2);
      bar.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      out.add(bar);
    }));
    return out;
  }, [s]);
  return <primitive object={g} />;
}
