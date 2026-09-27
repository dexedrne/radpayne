// The arsenal's effects (arsenal spec 3.2): live grenades (a dark olive frag with the gold rim, a thin red
// ring on the floor under it for readability), the blast (a gold-white flash, a flat shock ring on the
// ground, sparks, a smoke puff, a scorch mark; no gore) with a camera kick by distance, the melee slash
// (#4764's katana: a curved ribbon, white core with his cyan edge, gone in 0.2 s; the strike: a small
// white arc), and the debris of a breakable (wood splinters, or glitter off glass). World time for the
// world, so bullet time slows a blast like everything else.
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, BackSide, BoxGeometry, CircleGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry, Vector3,
} from "three";
import type { Session } from "./session.ts";
import type { GameEvent } from "../sim/types.ts";
import { FRAME } from "./frame.ts";
import { makeGrenade } from "./guns.ts";
import { playerChest } from "./PlayerView.tsx";
import { GRENADE } from "../sim/tuning.ts";

/** The camera shake a blast leaves (CameraView reads it): 0..1, decays over real time. */
export const blastShake = { k: 0 };

const own = <T extends { userData: Record<string, unknown> }>(m: T): T => { m.userData.rpOwn = true; return m; };
const add = (color: string, opacity: number) => own(new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));

type Blast = { t: number; x: number; y: number; z: number; flash: Mesh; ring: Mesh; smoke: Mesh[]; sparks: { m: Mesh; v: Vector3 }[]; scorch: Mesh };
type Slash = { t: number; g: Group; life: number };
type Bit = { m: Mesh; v: Vector3; t: number };

export function ArsenalFx({ s }: { s: Session }) {
  const fx = useMemo(() => {
    const group = new Group();
    const hull = own(new MeshBasicMaterial({ color: "#ffc46b", side: BackSide, transparent: true, opacity: 0.28, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    const frags: Group[] = [];
    const rings: Mesh[] = [];
    const ringGeo = new RingGeometry(0.26, 0.31, 28);
    const ringMat = add("#ff3148", 0.55);
    for (let i = 0; i < 6; i++) {
      const f = makeGrenade();
      f.scale.setScalar(1.25);
      const meshes: Mesh[] = [];
      f.traverse(o => { if ((o as Mesh).isMesh) meshes.push(o as Mesh); });
      for (const o of meshes) { const h = new Mesh(o.geometry, hull); h.scale.setScalar(1.18); o.add(h); }
      f.visible = false;
      const r = new Mesh(ringGeo, ringMat);
      r.rotation.x = -Math.PI / 2;
      r.visible = false;
      frags.push(f); rings.push(r);
      group.add(f, r);
    }
    return {
      group, frags, rings,
      sphere: new SphereGeometry(1, 16, 10),
      shock: new RingGeometry(0.85, 1, 40),
      disc: new CircleGeometry(1, 24),
      box: new BoxGeometry(1, 1, 1),
      blasts: [] as Blast[], slashes: [] as Slash[], bits: [] as Bit[], run: -1,
      scorchMat: own(new MeshBasicMaterial({ color: "#0b0906", transparent: true, opacity: 0.7, depthWrite: false })),
    };
  }, []);

  useEffect(() => s.on((e: GameEvent, ss) => {
    const g = ss.game;
    if (e.type === "explode") {
      const gy = g.world.groundBelow(e.x, e.z, 0.1, e.y + 0.3);
      const y0 = Number.isFinite(gy) ? gy : e.y;
      const flash = new Mesh(fx.sphere, add("#fff1c8", 0.9));
      flash.position.set(e.x, e.y + 0.3, e.z);
      const ring = new Mesh(fx.shock, add("#ffd28a", 0.6));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(e.x, y0 + 0.03, e.z);
      const smoke: Mesh[] = [];
      for (let i = 0; i < 5; i++) {
        const m = new Mesh(fx.sphere, own(new MeshBasicMaterial({ color: "#2f2c2a", transparent: true, opacity: 0.5, depthWrite: false })));
        m.position.set(e.x + Math.sin(i * 2.4) * 0.5, y0 + 0.4 + i * 0.25, e.z + Math.cos(i * 2.4) * 0.5);
        m.userData.k = 0.6 + (i % 3) * 0.25;
        smoke.push(m);
      }
      const sparks: Blast["sparks"] = [];
      for (let i = 0; i < 18; i++) {
        const m = new Mesh(fx.box, add("#ffb347", 0.95));
        m.scale.set(0.03, 0.03, 0.22);
        m.position.set(e.x, e.y + 0.3, e.z);
        const a = i * 2.39996, up = 0.3 + ((i * 37) % 10) / 12;
        const v = new Vector3(Math.cos(a), up, Math.sin(a)).normalize().multiplyScalar(7 + (i % 5));
        sparks.push({ m, v });
      }
      const scorch = new Mesh(fx.disc, fx.scorchMat.clone());
      scorch.rotation.x = -Math.PI / 2;
      scorch.position.set(e.x, y0 + 0.02, e.z);
      scorch.scale.setScalar(1.6);
      for (const m of [flash, ring, scorch, ...smoke, ...sparks.map(sp => sp.m)]) { m.frustumCulled = false; fx.group.add(m); }
      fx.blasts.push({ t: 0, x: e.x, y: e.y, z: e.z, flash, ring, smoke, sparks, scorch });
      const p = g.player;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      blastShake.k = Math.max(blastShake.k, Math.max(0, 1 - d / (GRENADE.radius * 4)));
    } else if (e.type === "melee" && e.phase === "start") {
      // the slash: a crescent in front of his chest, tilted from high right to low left
      const katana = e.kind === "katana";
      const sg = new Group();
      const r0 = katana ? 1.05 : 0.7;
      const core = new Mesh(new RingGeometry(r0 - 0.03, r0, 32, 1, -0.35, 2.3), add("#ffffff", 0.95));
      sg.add(core);
      if (katana) {
        const edge = new Mesh(new RingGeometry(r0 - 0.1, r0 + 0.04, 32, 1, -0.35, 2.3), add("#3ff0ff", 0.55));
        edge.position.z = -0.01;
        sg.add(edge);
      }
      const p = g.player;
      sg.position.copy(playerChest.lengthSq() > 0 ? playerChest : new Vector3(p.x, p.y + 1.1, p.z));
      sg.rotation.set(0, p.facing + Math.PI, 0);
      sg.rotateZ(katana ? -0.55 : -0.3);
      sg.rotateX(-1.1);
      sg.traverse(o => { o.frustumCulled = false; });
      fx.group.add(sg);
      fx.slashes.push({ t: 0, g: sg, life: katana ? 0.2 : 0.16 });
    } else if (e.type === "break") {
      const glass = e.surface === "glass" || e.surface === "mirror";
      for (let i = 0; i < (glass ? 40 : 22); i++) {
        const m = new Mesh(fx.box, glass ? add(i % 3 ? "#d8e4ff" : "#ffffff", 0.9) : own(new MeshBasicMaterial({ color: i % 2 ? "#8a6a45" : "#c9b08a" })));
        const sz = glass ? 0.03 + (i % 4) * 0.01 : 0.04 + (i % 5) * 0.02;
        m.scale.set(sz, glass ? sz * 0.3 : sz * 0.4, glass ? sz : sz * 3);
        m.position.set(e.x + ((i * 13) % 7 - 3) * 0.08, e.y + ((i * 7) % 5 - 2) * 0.08, e.z + ((i * 5) % 7 - 3) * 0.08);
        const a = i * 2.39996;
        const v = new Vector3(Math.cos(a) * 2.5, 1 + (i % 4), Math.sin(a) * 2.5);
        m.frustumCulled = false;
        fx.group.add(m);
        fx.bits.push({ m, v, t: 0 });
      }
    }
  }), [s, fx]);

  useFrame((_, rawDelta) => {
    const g = s.game;
    const dt = Math.min(rawDelta, 0.1);
    const wdt = s.paused ? 0 : dt * g.timeScale;
    if (fx.run !== s.run) {
      fx.run = s.run;
      for (const b of fx.blasts) for (const m of [b.flash, b.ring, b.scorch, ...b.smoke, ...b.sparks.map(sp => sp.m)]) fx.group.remove(m);
      for (const sl of fx.slashes) fx.group.remove(sl.g);
      for (const b of fx.bits) fx.group.remove(b.m);
      fx.blasts.length = 0; fx.slashes.length = 0; fx.bits.length = 0;
    }
    blastShake.k = Math.max(0, blastShake.k - dt * 2.2);
    // live grenades: the frag spins in flight; the red ring on the floor under it
    const live = g.grenadesLive;
    fx.frags.forEach((f, i) => {
      const gr = live[i];
      const r = fx.rings[i];
      f.visible = r.visible = !!gr;
      if (!gr) return;
      f.position.set(gr.x, gr.y + 0.02, gr.z);
      if (!gr.resting) f.rotation.set(g.time * 9 + i, g.time * 5, 0);
      const gy = g.world.groundBelow(gr.x, gr.z, 0.1, gr.y + 0.05);
      r.position.set(gr.x, (Number.isFinite(gy) ? gy : 0) + 0.02, gr.z);
      (r.material as MeshBasicMaterial).opacity = 0.35 + 0.3 * Math.abs(Math.sin(g.realTime * 8));
    });
    // blasts on world time
    for (let i = 0; i < fx.blasts.length; i++) {
      const b = fx.blasts[i];
      b.t += wdt;
      const t = b.t;
      const fm = b.flash.material as MeshBasicMaterial;
      b.flash.scale.setScalar(0.4 + 2.6 * Math.min(1, t / 0.12));
      fm.opacity = Math.max(0, 0.9 * (1 - t / 0.25));
      b.flash.visible = fm.opacity > 0.01;
      const rm = b.ring.material as MeshBasicMaterial;
      b.ring.scale.setScalar(0.4 + GRENADE.radius * Math.min(1, t / 0.35));
      rm.opacity = Math.max(0, 0.6 * (1 - t / 0.45));
      b.ring.visible = rm.opacity > 0.01;
      for (const m of b.smoke) {
        const k = m.userData.k as number;
        m.scale.setScalar(0.4 + k * Math.min(1.6, t * 1.4));
        m.position.y += wdt * 0.5;
        (m.material as MeshBasicMaterial).opacity = Math.max(0, 0.5 * (1 - t / 2.2));
      }
      for (const sp of b.sparks) {
        sp.v.y -= 14 * wdt;
        sp.m.position.addScaledVector(sp.v, wdt);
        sp.m.lookAt(sp.m.position.x + sp.v.x, sp.m.position.y + sp.v.y, sp.m.position.z + sp.v.z);
        (sp.m.material as MeshBasicMaterial).opacity = Math.max(0, 0.95 * (1 - t / 0.7));
        sp.m.visible = t < 0.7;
      }
      (b.scorch.material as MeshBasicMaterial).opacity = 0.7 * Math.max(0, Math.min(1, (25 - t) / 5));
      if (t > 25) {
        for (const m of [b.flash, b.ring, b.scorch, ...b.smoke, ...b.sparks.map(sp => sp.m)]) fx.group.remove(m);
        fx.blasts.splice(i--, 1);
      }
    }
    // slashes fade on his clock (real time, halved in bullet time like his hands)
    for (let i = 0; i < fx.slashes.length; i++) {
      const sl = fx.slashes[i];
      sl.t += s.paused ? 0 : dt * Math.max(g.timeScale, 0.5);
      const k = 1 - sl.t / sl.life;
      sl.g.children.forEach((c, j) => { ((c as Mesh).material as MeshBasicMaterial).opacity = Math.max(0, k) * (j === 0 ? 0.95 : 0.55); });
      if (k <= 0) { fx.group.remove(sl.g); fx.slashes.splice(i--, 1); }
    }
    // debris
    for (let i = 0; i < fx.bits.length; i++) {
      const b = fx.bits[i];
      b.t += wdt;
      b.v.y -= 12 * wdt;
      b.m.position.addScaledVector(b.v, wdt);
      const gy = g.world.groundBelow(b.m.position.x, b.m.position.z, 0.02, b.m.position.y + 0.1);
      if (Number.isFinite(gy) && b.m.position.y < gy + 0.01) { b.m.position.y = gy + 0.01; b.v.set(b.v.x * 0.3, 0, b.v.z * 0.3); }
      else b.m.rotation.x += wdt * 8;
      if (b.t > 12) { fx.group.remove(b.m); fx.bits.splice(i--, 1); }
    }
  }, FRAME.fx);

  return <primitive object={fx.group} />;
}
