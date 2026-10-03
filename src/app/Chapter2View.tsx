// Chapter 2's moving parts (views only; the set pieces are sim/stage.ts and sim/ch2/*). Nothing here in a
// room without a stage. Every tell reads at a glance:
//  - the roof: the helicopter off the edge (its rotor turning), the searchlight (look/searchlight.ts: a
//    soft beam and a real light's pool on the roof, brighter when it has him), the ropes from the
//    helicopter to the girls coming down them;
//  - the garden: the glass walkway's crack lines spreading over the tell, then the glass gone;
//  - the airship: the klaxon's red light, the cargo door torn off into the sky, wind streaks toward it;
//  - the counting floor: the shutters rolled up in their boxes, their warning lamps, then down;
//  - the vault: the lift doors (their lamps before they open), the gate that shuts, the security beam
//    (dim and still for the tell, bright red sweeping), a thin gold crown over the Countess;
//  - chapter 2's eggs: the rubber duck and the golden koi.
// Their sounds reuse the chapter 1 files (sfxKey: a file not loaded is silent).
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { usePrefab } from "react-three-game";
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, LineBasicMaterial, LineSegments, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, PointLight, SphereGeometry, SpotLight, TorusGeometry, Vector3, type Object3D,
} from "three";
import type { Session } from "./session.ts";
import type { GameEvent } from "../sim/types.ts";
import type { Roof } from "../sim/ch2/roof.ts";
import type { Garden } from "../sim/ch2/garden.ts";
import type { Airship } from "../sim/ch2/airship.ts";
import type { Counting } from "../sim/ch2/counting.ts";
import type { Vault } from "../sim/ch2/vault.ts";
import { BEAM, COUNTESS, ROOF } from "../sim/tuning2.ts";
import { SEARCH, beamU, cutoffAt, makeBeam, makeSearchLight, poolFx, searchFx } from "./look/searchlight.ts";
import { FRAME } from "./frame.ts";
import { sfxKey } from "../audio/sfx.ts";

const own = <T extends { userData: Record<string, unknown> }>(m: T): T => { m.userData.rpOwn = true; return m; };
const glowMat = (c: string, opacity = 1) => own(new MeshBasicMaterial({ color: new Color(c), transparent: opacity < 1, opacity, ...(opacity < 1 ? { blending: AdditiveBlending } : {}), depthWrite: opacity >= 1, toneMapped: false, side: DoubleSide }));
const DOWN = new Vector3(0, -1, 0);
const SL = { lamp: new Vector3(), dir: new Vector3(), end: new Vector3(), cam: new Vector3(), rel: new Vector3() };

export function Chapter2View({ s }: { s: Session }) {
  const prefab = usePrefab();
  const v = useMemo(() => {
    const st = s.game.stage;
    const eggs = s.level.markers.filter(m => m.kind === "egg" && (m.data.egg === "duck" || m.data.egg === "koi"));
    if (!st && !eggs.length) return null;
    const group = new Group();
    group.name = "rp-ch2";
    // eggs
    for (const m of eggs) {
      const g = new Group();
      if (m.data.egg === "duck") {
        const mat = own(new MeshStandardMaterial({ color: "#f7d23a", roughness: 0.5 }));
        const body = new Mesh(new SphereGeometry(0.11, 14, 10), mat); body.scale.set(1.2, 0.85, 1); body.position.y = 0.09;
        const head = new Mesh(new SphereGeometry(0.07, 12, 8), mat); head.position.set(0.08, 0.2, 0);
        const beak = new Mesh(new ConeGeometry(0.03, 0.06, 8), own(new MeshStandardMaterial({ color: "#ff8a20" }))); beak.rotation.z = -Math.PI / 2; beak.position.set(0.16, 0.19, 0);
        g.add(body, head, beak);
      } else {
        const koi = new Mesh(new SphereGeometry(0.2, 14, 10), own(new MeshStandardMaterial({ color: "#ffb030", emissive: new Color("#ff8a10"), emissiveIntensity: 0.5, roughness: 0.3 })));
        koi.scale.set(1.6, 0.45, 0.6);
        const tail = new Mesh(new ConeGeometry(0.12, 0.2, 6), koi.material); tail.rotation.z = Math.PI / 2; tail.position.x = -0.38;
        g.add(koi, tail);
        g.userData.swim = true;
      }
      g.position.set(m.x, m.y, m.z);
      g.rotation.y = m.yaw;
      group.add(g);
    }
    const parts: Record<string, Object3D> = {};
    let rope: LineSegments | null = null, wind: LineSegments | null = null, cracks: Group | null = null;
    let search: SpotLight | null = null, redLight: PointLight | null = null;
    if (st?.kind === "roof") {
      const heli = new Group();
      const dark = own(new MeshStandardMaterial({ color: "#15171c", roughness: 0.4, metalness: 0.5 }));
      const body = new Mesh(new SphereGeometry(1.6, 16, 12), dark); body.scale.set(1, 0.8, 1.9);
      const tail = new Mesh(new BoxGeometry(0.35, 0.35, 5), dark); tail.position.set(0, 0.3, 4.2);
      const fin = new Mesh(new BoxGeometry(0.1, 1.2, 0.8), dark); fin.position.set(0, 0.9, 6.5);
      const rotor = new Mesh(new CylinderGeometry(5.5, 5.5, 0.03, 24), glowMat("#3a3f4a", 0.35)); rotor.position.y = 1.5;
      const lamp = new Mesh(new SphereGeometry(0.28, 12, 8), glowMat("#fff6e0")); lamp.position.set(0, -0.9, -1.2);
      const nav = new Mesh(new SphereGeometry(0.1, 8, 6), glowMat("#ff3030")); nav.position.set(0, -0.3, 6.8);
      heli.add(body, tail, fin, rotor, lamp, nav);
      parts.heli = heli; parts.rotor = rotor; parts.lamp = lamp; parts.nav = nav;
      const beam = makeBeam(ROOF.radius);
      parts.beam = beam;
      search = makeSearchLight();
      rope = new LineSegments(new BufferGeometry().setAttribute("position", new BufferAttribute(new Float32Array(8 * 6), 3)), own(new LineBasicMaterial({ color: "#8a8f98" })));
      rope.frustumCulled = false;
      group.add(heli, beam, search, search.target, rope);
    }
    if (st?.kind === "garden") {
      const gd = st as Garden;
      cracks = new Group();
      const [x0, z0, x1, z1] = gd.area;
      const mat = glowMat("#eaffff", 0.8);
      for (let i = 0; i < 28; i++) {
        const cx = x0 + ((i * 7.31) % 1) * (x1 - x0), cz = z0 + ((i * 3.77) % 1) * (z1 - z0);
        const c = new Mesh(new BoxGeometry(0.9 + (i % 5) * 0.4, 0.004, 0.02), mat);
        c.position.set(cx, 0, cz); c.rotation.y = i * 1.3;
        c.userData.at = i / 28;
        cracks.add(c);
      }
      cracks.visible = false;
      group.add(cracks);
    }
    if (st?.kind === "airship") {
      const a = st as Airship;
      redLight = new PointLight("#ff2020", 0, 14, 2);
      redLight.position.set(a.out[0], 3.5, a.out[1] - 2);
      const n = 120, pos = new Float32Array(n * 6);
      wind = new LineSegments(new BufferGeometry().setAttribute("position", new BufferAttribute(pos, 3)), own(new LineBasicMaterial({ color: "#dfe8ff", transparent: true, opacity: 0.35, depthWrite: false })));
      wind.frustumCulled = false; wind.visible = false;
      wind.userData.seed = Array.from({ length: n }, () => [Math.random(), Math.random() * 4, Math.random()]);
      group.add(redLight, wind);
    }
    if (st?.kind === "counting") {
      const c = st as Counting;
      for (const id of c.shutters) {
        const lamp = new Mesh(new SphereGeometry(0.09, 8, 6), glowMat("#ff3020"));
        const o = prefab.getObject(id);
        if (o) lamp.position.set(o.position.x, 3.5, o.position.z);
        lamp.visible = false;
        parts[`lamp-${id}`] = lamp;
        group.add(lamp);
      }
    }
    if (st?.kind === "vault") {
      const vt = st as Vault;
      const brass = own(new MeshStandardMaterial({ color: "#b08a4a", roughness: 0.3, metalness: 0.85 }));
      const gate = new Group();
      for (let i = 0; i < 12; i++) { const b = new Mesh(new BoxGeometry(0.05, 3.4, 0.05), brass); b.position.set(-1.65 + i * 0.3, 1.7, 0); gate.add(b); }
      const g0 = s.level.boxes.find(b => b.node === vt.lock);
      if (g0) gate.position.set(g0.cx, 0, g0.cz);
      gate.visible = false;
      parts.gate = gate;
      for (const w of vt.waves) {
        if (parts[`door-${w.door}`]) continue;
        const b = s.level.boxes.find(x => x.node === w.door);
        if (!b) continue;
        const d = new Mesh(new BoxGeometry(b.hx * 2 + 0.02, b.top - b.bottom, b.hz * 2 + 0.02), brass);
        d.position.set(b.cx, (b.top + b.bottom) / 2, b.cz);
        const lamp = new Mesh(new SphereGeometry(0.14, 10, 8), glowMat("#ff3020"));
        lamp.position.set(b.cx - Math.sign(b.cx) * 0.2, 3.25, b.cz);
        parts[`door-${w.door}`] = d; parts[`lamp-${w.door}`] = lamp;
        group.add(d, lamp);
      }
      const beam = new Mesh(new BoxGeometry(1, 0.05, 0.05), glowMat("#ff2a3a", 0.9));
      beam.geometry.translate(0.5, 0, 0);
      beam.visible = false;
      parts.beam = beam;
      const crown = new Mesh(new TorusGeometry(0.13, 0.025, 6, 16), own(new MeshStandardMaterial({ color: "#ffd060", emissive: new Color("#ffb020"), emissiveIntensity: 0.8, metalness: 0.9, roughness: 0.25 })));
      crown.rotation.x = Math.PI / 2;
      parts.crown = crown;
      group.add(gate, beam, crown);
    }
    return { group, parts, rope, wind, cracks, search, redLight, run: -1, doorT: 0, shutterY: new Map<string, number>(), hidden: [] as Object3D[], beamK: 0, poolI: 0 };
  }, [s, prefab]);

  // the stage's sounds
  useEffect(() => s.on((e: GameEvent) => {
    if (e.type !== "stage") return;
    const p = s.game.player;
    const d = e.x !== undefined && e.z !== undefined ? Math.hypot(e.x - p.x, e.z - p.z) : 0;
    const key: Record<string, string> = {
      crack: "glass_crack", collapse: "glass_wall_shatter", klaxon: "emergency_brake", blow: "door_breach", shutterWarn: "grenade_beep", shutters: "doors_pry",
      dark: "fluorescent_flicker", lights: "fluorescent_flicker", lamp: "grenade_beep", door: "add_doors_open", locked: "elevator_gate", beamHigh: "boss_sweep_tell", beamLow: "boss_sweep_tell",
      lampHit: "impact_metal", lampOut: "sparks", landed: "roof_thud", stagger: "impact_body_heavy",
    };
    if (key[e.what]) sfxKey(key[e.what], d, 0, 0.8);
  }), [s]);

  useFrame(({ clock, camera }, rawDt) => {
    if (!v) return;
    const g = s.game, st = g.stage, P = v.parts;
    const t = clock.elapsedTime;
    if (v.run !== s.run) {
      v.run = s.run;
      for (const o of v.hidden) o.visible = true;
      v.hidden.length = 0;
      v.doorT = 0;
    }
    for (const c of v.group.children) if (c.userData.swim) { c.position.y += Math.sin(t * 2) * 0.0008; c.rotation.y += 0.004; }
    if (!st) return;
    if (st.kind === "roof") {
      const r = st as Roof;
      P.heli.position.set(r.hx, r.hy, r.hz);
      P.heli.rotation.y = Math.atan2(r.hx - r.lx, r.hz - r.lz) + Math.sin(t * 0.7) * 0.05;
      P.heli.rotation.z = Math.sin(t * 0.9) * 0.04;
      P.rotor.rotation.y = t * 30;
      (P.nav as Mesh).visible = Math.sin(t * 6) > 0;
      const on = r.lightOn;
      P.lamp.visible = on;
      searchlight(s, r, P.lamp, P.beam as Mesh, v.search!, v, camera, on, Math.min(rawDt, 0.1));
      // ropes to the girls coming down
      const pos = v.rope!.geometry.attributes.position as BufferAttribute;
      let k = 0;
      for (const [i] of r.roping) {
        if (k >= 8) break;
        const e = s.renderE[i] ?? g.enemies[i];
        pos.setXYZ(k * 2, e.x, r.hy - 0.5, e.z); pos.setXYZ(k * 2 + 1, e.x, e.y + 1.9, e.z); k++;
      }
      for (let j = k * 2; j < 16; j++) pos.setXYZ(j, 0, -1000, 0);
      pos.needsUpdate = true;
    } else if (st.kind === "garden") {
      const gd = st as Garden;
      const f = gd.state === 1 ? 1 - gd.crackT / 2.6 : gd.state === 2 ? 1 : 0;
      v.cracks!.visible = gd.state === 1;
      const top = s.level.boxes.find(b => b.node === gd.glass[0])?.top ?? 0;
      for (const c of v.cracks!.children) { c.visible = (c.userData.at as number) <= f; c.position.y = top + 0.006; }
      if (gd.state === 2 && !v.hidden.length) for (const id of gd.glass) { const o = prefab.getObject(id); if (o) { o.visible = false; v.hidden.push(o); } }
    } else if (st.kind === "airship") {
      const a = st as Airship;
      v.redLight!.intensity = a.state === 1 || a.state === 2 ? 8 * (0.5 + 0.5 * Math.sin(t * 9)) : 0;
      const door = prefab.getObject(a.door);
      if (door && a.state >= 2) {
        if (!v.hidden.includes(door)) { v.hidden.push(door); door.userData.home = door.position.clone(); }
        v.doorT = Math.min(3, v.doorT + 1 / 60);
        const h = door.userData.home as Vector3;
        door.position.set(h.x, h.y + v.doorT * 1.5, h.z + v.doorT * v.doorT * 6);
        door.rotation.x = v.doorT * 1.4;
        door.visible = v.doorT < 2.5;
      }
      v.wind!.visible = a.wind;
      if (a.wind) {
        const pos = v.wind!.geometry.attributes.position as BufferAttribute;
        const seed = v.wind!.userData.seed as number[][];
        const [x0, z0, x1, z1] = a.hold;
        seed.forEach((q, i) => {
          q[2] = (q[2] + 0.02 + q[0] * 0.02) % 1;
          const sx = x0 + q[0] * (x1 - x0), sz = z0 + 0.2 * (z1 - z0);
          const x = sx + (a.out[0] - sx) * q[2], z = sz + (a.out[1] - sz) * q[2];
          const dx = (a.out[0] - sx) * 0.05, dz = (a.out[1] - sz) * 0.05;
          pos.setXYZ(i * 2, x, q[1], z); pos.setXYZ(i * 2 + 1, x + dx, q[1], z + dz);
        });
        pos.needsUpdate = true;
      }
    } else if (st.kind === "counting") {
      const c = st as Counting;
      for (const id of c.shutters) {
        const o = prefab.getObject(id);
        if (!o) continue;
        if (o.userData.homeY === undefined) o.userData.homeY = o.position.y;
        const down = c.state === 2 ? 0 : c.state === 1 ? c.t / 1.6 : 1;
        o.position.y = (o.userData.homeY as number) + down * 1.85;
        o.scale.y = Math.max(0.05, 3.3 * (1 - down * 0.97));
        P[`lamp-${id}`].visible = c.state === 1 && Math.sin(t * 12) > 0;
      }
    } else if (st.kind === "vault") {
      const vt = st as Vault;
      P.gate.visible = vt.locked;
      for (const w of vt.waves) {
        const d = P[`door-${w.door}`], l = P[`lamp-${w.door}`];
        if (d) d.visible = !g.world.off.has(w.door);
        if (l) l.visible = vt.lampOn(w.door) && Math.sin(t * 10) > -0.3;
      }
      const b = vt.beam, beam = P.beam as Mesh;
      beam.visible = b.state !== 0;
      if (b.state !== 0) {
        const h = vt.floorY + (b.high ? BEAM.high : BEAM.low);
        beam.position.set(vt.center[0] + Math.sin(b.a) * vt.column, h, vt.center[1] + Math.cos(b.a) * vt.column);
        beam.rotation.set(0, b.a - Math.PI / 2, 0);
        beam.scale.set(vt.radius - vt.column, b.state === 1 ? 1 : 1.6, b.state === 1 ? 1 : 1.6);
        (beam.material as MeshBasicMaterial).opacity = b.state === 1 ? 0.25 + 0.15 * Math.sin(t * 14) : 0.95;
      }
      const e = g.enemies[vt.idx];
      const r = s.renderE[vt.idx] ?? e;
      P.crown.visible = !!e && e.state !== "dead" && e.state !== "inactive";
      if (e) P.crown.position.set(r.x, r.y + 2.05 * COUNTESS.scale * (e.crouch ? 0.7 : 1), r.z);
    }
  }, FRAME.fx);

  return v ? <primitive object={v.group} /> : null;
}

/** The searchlight this frame (look/searchlight.ts): the beam from the lamp to the roof under the sim's
 *  spot (or the first thing in its way), the pool's light aimed there, both fading in and out. */
function searchlight(s: Session, r: Roof, lampMesh: Object3D, beam: Mesh, light: SpotLight, st: { beamK: number; poolI: number }, camera: Object3D, on: boolean, dt: number): void {
  const g = s.game;
  const f = Math.min(1, dt * SEARCH.fade);
  st.beamK += ((on ? 1 : 0) - st.beamK) * f;
  const { lamp, dir, end, cam, rel } = SL;
  lampMesh.getWorldPosition(lamp);
  // the roof under the spot (the pad, a stairwell's roof: the highest top under the lamp)
  const gy = g.world.groundBelow(r.lx, r.lz, 0.3, lamp.y - 1);
  const floor = Number.isFinite(gy) ? gy : 0;
  dir.set(r.lx - lamp.x, floor - lamp.y, r.lz - lamp.z);
  const full = Math.max(0.5, dir.length());
  dir.divideScalar(full);
  // the first thing in the lamp's way (the fence on the parapet lets it through, like the sim's check)
  const hit = g.world.raycast(lamp.x, lamp.y, lamp.z, dir.x, dir.y, dir.z, full - 0.05, true);
  const len = hit ? Math.max(0.5, hit.t) : full;
  end.copy(lamp).addScaledVector(dir, len);
  const foot = ROOF.radius * (len / full);
  beam.visible = st.beamK > 0.01;
  beam.position.copy(lamp);
  beam.quaternion.setFromUnitVectors(DOWN, dir);
  beam.scale.set(foot, len, foot);
  beamU.k.value = st.beamK;
  beamU.floorY.value = end.y;
  // the lens inside the beam: most of the haze goes (it would lie over the whole picture)
  camera.getWorldPosition(cam);
  const t = rel.subVectors(cam, lamp).dot(dir);
  const off = rel.addScaledVector(dir, -t).length();
  const rr = SEARCH.lampRadius + (foot - SEARCH.lampRadius) * Math.min(1, Math.max(0, t / len));
  const inside = t > 0 && t < len + 1 && off < rr * 1.15 ? 1 : 0;
  beamU.inside.value += (inside - beamU.inside.value) * f;
  searchFx.a.value.copy(lamp);
  searchFx.d.value.copy(dir);
  searchFx.len.value = len;
  searchFx.r0.value = SEARCH.lampRadius;
  searchFx.r1.value = foot;
  searchFx.k.value = st.beamK;
  // the pool on the level's surfaces: the sim's circle, nothing under what the lamp hits first
  poolFx.c.value.set(r.lx, r.lz);
  poolFx.r.value = ROOF.radius;
  poolFx.yMin.value = (hit ? end.y : floor) - 0.35;
  poolFx.lamp.value.copy(lamp);
  poolFx.k.value = st.beamK;
  poolFx.lit.value += ((r.lit ? 1 : 0) - poolFx.lit.value) * f;
  // the SpotLight (the girls, him, the props): aimed at the end, its edge at the sim's radius; blocked
  // short of the roof, cut off just past what it hits and boosted back (no light under a roof)
  light.position.copy(lamp);
  light.target.position.copy(end);
  light.target.updateMatrixWorld();
  light.angle = Math.atan((ROOF.radius * SEARCH.spread) / full);
  light.penumbra = SEARCH.penumbra;
  let want = on ? (r.lit ? SEARCH.poolLit : SEARCH.pool) : 0;
  if (hit) {
    light.distance = len + SEARCH.cutoffPast;
    want *= Math.min(SEARCH.boost, 1 / Math.max(1e-3, cutoffAt(len, light.distance)));
  } else light.distance = 0;
  st.poolI += (want - st.poolI) * f;
  light.intensity = st.poolI < 0.005 ? 0 : st.poolI;
}
