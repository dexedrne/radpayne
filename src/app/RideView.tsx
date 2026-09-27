// Room 4's moving parts (views only; the sim's ride is sim/ride.ts). Nothing here when the room has no
// ride. The car stands still: the ride is the shaft scrolling past the car's openings.
//  - Each opening (the ride's door colliders): the car's scissor gate (a see-through lattice, folds to
//    the sides at a stop), the landing's steel doors (they slide apart as the ride opens them; pried
//    ones stutter), and between stops the shaft right behind the gate: dark concrete, I-beams and the
//    other floors' doors (each with a small amber lamp) scrolling down past it (up when the car falls).
//  - The roof hatch: its panel, the tell (a red outline flickering, dust sifting down for 2 s), the
//    kick (the panel drops into the car).
//  - The cables: sparks at the gate, the caged bulb stutters and dies (look/tower.tsx towerFx.flicker),
//    the red emergency light comes on; camera jolts on the roof thud and the brakes.
//  - The floor dial's needle over the east doors sweeps with the ride.
//  - The sounds: the gate, the start and the stop, the bell, the doors (pried), the roof thud and the
//    hatch, the snap, the fall and the brakes; the car's hum and the shaft's wind as loops.
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, BoxGeometry, Color, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, PointLight, Quaternion, RepeatWrapping,
  SRGBColorSpace, TextureLoader, Vector3, type Texture,
} from "three";
import type { Session } from "./session.ts";
import type { GameEvent } from "../sim/types.ts";
import { isStop, type RideStop } from "../sim/ride.ts";
import { RIDE } from "../sim/tuning.ts";
import { FRAME } from "./frame.ts";
import { assetUrl } from "./assets.ts";
import { camJolt } from "./CameraView.tsx";
import { towerFx } from "./look/tower.tsx";
import { setLoop, sfx, sfxKey } from "../audio/sfx.ts";

const HIDE = new Matrix4().makeScale(0, 0, 0);
/** The shaft's layout: I-beams every BEAM m, the other floors' doors every FLOOR m. */
const BEAM = 4, FLOOR = 8.4;

type Side = {
  side: string;
  /** The opening's centre on the car's outer face, its outward normal and its along-the-wall axis. */
  c: Vector3; n: Vector3; a: Vector3; w: number; h: number;
  gate: Mesh[]; leaves: Mesh[]; shaft: Group; beams: Mesh[]; floors: Group[]; stop: RideStop | null;
};

function texture(loader: TextureLoader, url: string, repeat = false): Texture {
  const t = loader.load(assetUrl(url));
  t.colorSpace = SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = RepeatWrapping; }
  return t;
}

export function RideView({ s }: { s: Session }) {
  const level = s.level;
  const v = useMemo(() => {
    const ride = s.game.ride;
    if (!ride) return null;
    const group = new Group();
    const loader = new TextureLoader();
    const own = <T extends { userData: Record<string, unknown> }>(m: T) => { m.userData.rpOwn = true; return m; };
    const gateTex = texture(loader, "/textures/elevator/car_gate.webp", true);
    gateTex.repeat.set(1.6, 3); // 1 m lattice cells on each 1.6 x 3 m half
    const gateMat = own(new MeshStandardMaterial({ map: gateTex, alphaTest: 0.5, side: DoubleSide, roughness: 0.4, metalness: 0.6 }));
    const doorTex = texture(loader, "/textures/elevator/landing_doors.webp");
    const doorMat = own(new MeshStandardMaterial({ map: doorTex, roughness: 0.4, metalness: 0.5 }));
    const shaftTex = texture(loader, "/textures/elevator/shaft_concrete.webp", true);
    // the shaft is lit by nothing but the car: a faint lift of its own texture, so the scroll reads
    const shaftMat = own(new MeshStandardMaterial({ map: shaftTex, roughness: 0.95, color: new Color("#9a9a9a"), emissive: new Color("#ffffff"), emissiveMap: shaftTex, emissiveIntensity: 0.22 }));
    const beamTex = texture(loader, "/textures/elevator/shaft_beam.webp", true);
    const beamMat = own(new MeshStandardMaterial({ map: beamTex, roughness: 0.5, metalness: 0.4, emissive: new Color("#ffffff"), emissiveMap: beamTex, emissiveIntensity: 0.35 }));
    const floorDoorMat = own(new MeshStandardMaterial({ map: doorTex, roughness: 0.5, metalness: 0.4, color: new Color("#6a6a6a"), emissive: new Color("#ffffff"), emissiveMap: doorTex, emissiveIntensity: 0.18 }));
    const amber = own(new MeshBasicMaterial({ color: new Color(2.2, 1.3, 0.35), toneMapped: false }));
    // the openings: from the ride's door colliders
    const sides: Side[] = [];
    for (const st of ride.steps) {
      if (!isStop(st)) continue;
      for (const id of st.doors) {
        const b = level.boxes.find(k => k.node === id);
        if (!b || sides.some(x => x.side === st.side)) continue;
        const alongX = b.hx > b.hz;
        const w = (alongX ? b.hx : b.hz) * 2, h = b.hy * 2;
        const n = alongX ? new Vector3(0, 0, Math.sign(b.cz) || 1) : new Vector3(Math.sign(b.cx) || 1, 0, 0);
        const a = alongX ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
        const c = new Vector3(b.cx, 0, b.cz);
        const yaw = Math.atan2(n.x, n.z);
        const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
        // the gate: two lattice halves just inside the car
        const gate: Mesh[] = [];
        for (const k of [-1, 1]) {
          const m = new Mesh(new PlaneGeometry(w / 2, h), gateMat);
          m.quaternion.copy(q);
          group.add(m);
          gate.push(m);
        }
        // the landing doors: two leaves, each its half of the texture
        const leaves: Mesh[] = [];
        for (const k of [-1, 1]) {
          const g = new PlaneGeometry(w / 2, h);
          const uv = g.getAttribute("uv");
          const u0 = k < 0 ? 0.08 : 0.5, u1 = k < 0 ? 0.5 : 0.92;
          for (let i = 0; i < uv.count; i++) { uv.setX(i, u0 + uv.getX(i) * (u1 - u0)); uv.setY(i, 0.04 + uv.getY(i) * 0.9); }
          const m = new Mesh(g, doorMat);
          m.quaternion.copy(q).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI)); // faces into the car
          group.add(m);
          leaves.push(m);
        }
        // the shaft behind the gate: concrete, beams, the other floors' doors (occluded by the car's
        // lintel above and the floor below: only the opening shows it)
        const shaft = new Group();
        shaft.position.copy(c).addScaledVector(n, 0.2);
        shaft.quaternion.copy(q).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI));
        const wall = new Mesh(new PlaneGeometry(w + 1.2, h + 1.6), shaftMat);
        wall.position.y = h / 2;
        wall.position.z = -0.12;
        shaft.add(wall);
        const beams: Mesh[] = [];
        for (let i = 0; i < 3; i++) {
          const bm = new Mesh(new BoxGeometry(w + 1.2, 0.26, 0.12), beamMat);
          shaft.add(bm);
          beams.push(bm);
        }
        const floors: Group[] = [];
        for (let i = 0; i < 2; i++) {
          const fg = new Group();
          const fd = new Mesh(new PlaneGeometry(w * 0.8, h * 0.85), floorDoorMat);
          fd.position.y = h * 0.425;
          fd.position.z = -0.05;
          const lamp = new Mesh(new BoxGeometry(0.16, 0.08, 0.04), amber);
          lamp.position.set(w * 0.46, h * 0.92, -0.03);
          fg.add(fd, lamp);
          shaft.add(fg);
          floors.push(fg);
        }
        group.add(shaft);
        sides.push({ side: st.side, c, n, a, w, h, gate, leaves, shaft, beams, floors, stop: st });
      }
    }
    // the hatch: its panel, the red outline (the tell), the dust
    const [hx, hz] = ride.hatch;
    const hatchMat = own(new MeshStandardMaterial({ map: texture(loader, "/textures/elevator/car_ceiling_hatch.webp"), roughness: 0.5, metalness: 0.5 }));
    const hatch = new Mesh(new BoxGeometry(1.2, 0.04, 1.2), hatchMat);
    const hatchHome = new Vector3(hx, 3.4 + 0.02, hz);
    group.add(hatch);
    const redMat = own(new MeshBasicMaterial({ color: new Color(3.0, 0.25, 0.3), toneMapped: false }));
    const outline = new Group();
    for (const [sx, sz, px, pz] of [[1.26, 0.04, 0, -0.62], [1.26, 0.04, 0, 0.62], [0.04, 1.26, -0.62, 0], [0.04, 1.26, 0.62, 0]]) {
      const m = new Mesh(new BoxGeometry(sx, 0.02, sz), redMat);
      m.position.set(hx + px, 3.4 - 0.015, hz + pz);
      outline.add(m);
    }
    outline.visible = false;
    group.add(outline);
    const dustMat = own(new MeshBasicMaterial({ color: new Color(0.55, 0.52, 0.48), transparent: true, opacity: 0.55, depthWrite: false }));
    const dust = new InstancedMesh(new BoxGeometry(0.025, 0.025, 0.025), dustMat, 80);
    dust.frustumCulled = false;
    for (let i = 0; i < 80; i++) dust.setMatrixAt(i, HIDE);
    group.add(dust);
    const dustBits = Array.from({ length: 80 }, () => ({ p: new Vector3(), vy: 0, life: 0 }));
    // sparks at the cables' snap (small additive quads)
    const sparkMat = own(new MeshBasicMaterial({ color: new Color(3.2, 2.2, 0.9), toneMapped: false, blending: AdditiveBlending, depthWrite: false, transparent: true }));
    const sparks = new InstancedMesh(new BoxGeometry(0.02, 0.02, 0.12), sparkMat, 40);
    sparks.frustumCulled = false;
    for (let i = 0; i < 40; i++) sparks.setMatrixAt(i, HIDE);
    group.add(sparks);
    const sparkBits = Array.from({ length: 40 }, () => ({ p: new Vector3(), v: new Vector3(), life: 0 }));
    // the caged bulb's light (it dies with the cables) and the emergency light (red, steady: never a strobe)
    const bulbLight = new PointLight("#ffd29a", 7, 6, 2);
    bulbLight.position.set(1.3, 2.9, 0);
    group.add(bulbLight);
    const emergency = new PointLight("#ff2a1a", 0, 9, 2);
    emergency.position.set(-2.6, 3.0, -2.6);
    const emergencyBox = new Mesh(new BoxGeometry(0.3, 0.14, 0.14), own(new MeshBasicMaterial({ color: new Color(0.25, 0.02, 0.02), toneMapped: false })));
    emergencyBox.position.set(-2.75, 3.2, -2.9);
    group.add(emergency, emergencyBox);
    // the dial's needle (over the east doors, facing into the car)
    const needle = new Mesh(new BoxGeometry(0.012, 0.2, 0.012), own(new MeshBasicMaterial({ color: new Color(2.2, 0.5, 0.3), toneMapped: false })));
    const dialPivot = new Group();
    dialPivot.position.set(2.975, 3.06, 0);
    needle.position.y = 0.1;
    dialPivot.add(needle);
    group.add(dialPivot);
    for (const o of group.children) o.traverse(k => { k.userData.rpWarm = true; });
    return {
      group, sides, hatch, hatchHome, bulbLight, outline, dust, dustBits, sparks, sparkBits, emergency, emergencyBox, dialPivot,
      state: { run: -1, scroll: 0, tell: 0, hatchT: -1, hatchV: new Vector3(), dustNext: 0, bulb: 1, bulbT: 0, dead: false, flick: 0, needle: 0 },
      mats: [gateMat, doorMat, shaftMat, beamMat, floorDoorMat, amber, hatchMat, redMat, dustMat, sparkMat],
    };
  }, [s, level]);

  useEffect(() => () => {
    if (!v) return;
    v.group.traverse(o => { const m = o as Mesh; if (m.isMesh) m.geometry.dispose(); });
    for (const m of v.mats) { (m as MeshStandardMaterial).map?.dispose(); m.dispose(); }
  }, [v]);

  useEffect(() => {
    if (!v) return;
    return s.on((e: GameEvent, ss) => {
      if (e.type !== "ride") return;
      const g = ss.game, p = g.player;
      const at = (x: number, z: number) => { const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1; return { d, pan: (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / d }; };
      const st = v.state;
      const side = v.sides.find(k => k.side === e.side);
      const w = side ? at(side.c.x, side.c.z) : { d: 2, pan: 0 };
      switch (e.what) {
        case "start": sfx.at("keycard_beep", 1.5, 0.3, 0.6); sfxKey("elevator_gate", 1, 0, 0.7, 0.3); sfxKey("elevator_start", 0, 0, 0.7, 0.9); break;
        case "depart": sfxKey("elevator_gate", w.d, w.pan, 0.6); sfxKey("elevator_start", 0, 0, 0.7, 0.5); break;
        case "arrive": sfxKey("elevator_stop", 0, 0, 0.8); sfx.at("elevator_ding", w.d, w.pan, 0.6, 0.6); break;
        case "open":
          if (e.pry) sfxKey("doors_pry", w.d, w.pan, 0.9);
          else { sfxKey("elevator_gate", w.d, w.pan, 0.6); sfx.at("elevator_doors", w.d, w.pan, 0.7, 0.15); }
          break;
        case "close": sfxKey("elevator_gate", w.d, w.pan, 0.6); sfx.at("elevator_doors", w.d, w.pan, 0.7); break;
        case "roof":
          sfxKey("roof_thud", 1.5, 0, 1.0);
          Object.assign(camJolt, { t: 0.25, dur: 0.25, amp: 0.05, drop: 0.04 });
          st.tell = RIDE.hatchTell;
          break;
        case "hatch":
          sfxKey("hatch_kick", 1, 0, 1.0);
          st.tell = 0;
          st.hatchT = 0;
          st.hatchV.set(0.6, 0, 0.4);
          st.flick = 0.6; // the bulb stutters
          break;
        case "land": { const hh = g.enemies.find(k => k.group === "roof"); const a = hh ? at(hh.x, hh.z) : { d: 2, pan: 0 }; sfx.heavyStep(a.d, a.pan); sfx.heavyStep(a.d, a.pan); break; }
        case "cables": {
          sfxKey("cable_snap", 2, 0, 1.0);
          sfxKey("sparks", 2, 0.4, 0.9, 0.05);
          st.dead = true;
          st.flick = 0.4;
          // a burst of sparks at the gates' tops
          for (let i = 0; i < v.sparkBits.length; i++) {
            const b = v.sparkBits[i];
            const sd = v.sides[i % v.sides.length];
            b.p.copy(sd.c).addScaledVector(sd.a, (Math.random() - 0.5) * sd.w).setY(sd.h - 0.1).addScaledVector(sd.n, -0.2);
            b.v.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3).addScaledVector(sd.n, -1.5);
            b.life = 0.3 + Math.random() * 0.35;
          }
          break;
        }
        case "drop": sfxKey("car_drop", 0, 0, 1.0); break;
        case "brake":
          sfxKey("emergency_brake", 0, 0, 1.0);
          Object.assign(camJolt, { t: 0.4, dur: 0.4, amp: 0.04, drop: 0.25 });
          break;
      }
    });
  }, [s, v]);

  useFrame((_, raw) => {
    if (!v) return;
    const g = s.game;
    const ride = g.ride;
    if (!ride) return;
    const dt = Math.min(raw, 0.1);
    const wdt = s.paused ? 0 : dt * g.timeScale;
    const st = v.state;
    if (st.run !== s.run) {
      // a new attempt (or a checkpoint's): the car as the ride stands
      st.run = s.run;
      st.tell = 0; st.flick = 0; st.hatchT = -1;
      st.dead = ride.i >= 4 && ride.steps.some((x, i) => i < ride.i && !isStop(x) && x.cables !== undefined);
      v.hatch.position.copy(v.hatchHome);
      v.hatch.rotation.set(0, 0, 0);
      const heavyIn = g.enemies.some(k => k.group === "roof" && k.state !== "inactive");
      if (heavyIn) { v.hatch.position.set(v.hatchHome.x + 0.5, 0.04, v.hatchHome.z + 0.4); v.hatch.rotation.set(0, 0.5, 0); }
      for (let i = 0; i < v.dustBits.length; i++) { v.dustBits[i].life = 0; v.dust.setMatrixAt(i, HIDE); }
      for (let i = 0; i < v.sparkBits.length; i++) { v.sparkBits[i].life = 0; v.sparks.setMatrixAt(i, HIDE); }
    }
    // the shaft's scroll (world time: bullet time slows the ride too)
    st.scroll += ride.scroll() * wdt;
    const stop = ride.stop;
    for (const sd of v.sides) {
      const here = !!stop && stop.side === sd.side && ride.phase !== "arrive";
      const atStop = !!stop && stop.side === sd.side;
      const open = here ? ride.open : 0;
      // pried doors stutter open
      const k = stop?.pry && here && ride.phase === "opening" ? open * (0.85 + 0.15 * Math.sin(ride.t * 17)) : open;
      const ease = k * k * (3 - 2 * k);
      // the gate folds away first (the first 60 % of the travel), the landing doors slide behind it
      const gk = Math.min(1, ease / 0.6);
      sd.gate.forEach((m, i) => {
        const sgn = i === 0 ? -1 : 1;
        // each half folds to 18 % of its width against its jamb
        m.scale.x = 1 - 0.82 * gk;
        m.position.copy(sd.c).addScaledVector(sd.n, -0.24).addScaledVector(sd.a, sgn * (sd.w / 4 + (sd.w * 0.455 - sd.w / 4) * gk)).setY(sd.h / 2);
      });
      sd.leaves.forEach((m, i) => {
        const sgn = i === 0 ? -1 : 1;
        m.visible = atStop;
        m.position.copy(sd.c).addScaledVector(sd.n, 0.06).addScaledVector(sd.a, sgn * (sd.w / 4 + ease * sd.w * 0.48)).setY(sd.h / 2);
      });
      // between stops (and on the sides that are not stopping) the shaft scrolls past
      sd.shaft.visible = !atStop;
      if (sd.shaft.visible) {
        const off = st.scroll;
        const tex = (sd.shaft.children[0] as Mesh).material as MeshStandardMaterial;
        if (tex.map) { tex.map.repeat.set((sd.w + 1.2) / 4, (sd.h + 1.6) / 4); tex.map.offset.y = -off / 4; }
        sd.beams.forEach((b, i) => { const y = ((((i * BEAM - off) % (BEAM * 3)) + BEAM * 3) % (BEAM * 3)) - 1; b.position.set(0, y, -0.02); });
        sd.floors.forEach((f, i) => { const y = ((((i * FLOOR - off - 2.2) % (FLOOR * 2)) + FLOOR * 2) % (FLOOR * 2)) - 5; f.position.set(0, y, 0); f.visible = y > -3.5 && y < 3.4; });
      }
    }
    // the hatch's tell: the red outline flickers and dust sifts for RIDE.hatchTell
    if (st.tell > 0) {
      st.tell = Math.max(0, st.tell - wdt);
      v.outline.visible = Math.sin(performance.now() / 55) > -0.2;
      st.dustNext -= dt;
      if (st.dustNext <= 0) {
        st.dustNext = 0.03;
        const b = v.dustBits.find(x => x.life <= 0);
        if (b) { b.p.set(v.hatchHome.x + (Math.random() - 0.5) * 1.2, 3.38, v.hatchHome.z + (Math.random() < 0.5 ? -0.6 : 0.6) + (Math.random() - 0.5) * 0.1); b.vy = -0.3 - Math.random() * 0.4; b.life = 2.5; }
      }
      v.hatch.position.y = v.hatchHome.y + Math.sin(performance.now() / 40) * 0.006; // it rattles
    } else v.outline.visible = false;
    // the hatch panel falls into the car when kicked
    if (st.hatchT >= 0 && v.hatch.position.y > 0.03) {
      st.hatchT += wdt;
      st.hatchV.y -= 9.8 * wdt;
      v.hatch.position.addScaledVector(st.hatchV, wdt);
      v.hatch.rotation.x += 3 * wdt;
      v.hatch.rotation.z += 1.5 * wdt;
      if (v.hatch.position.y <= 0.03) { v.hatch.position.y = 0.03; v.hatch.rotation.set(0, 0.5, 0.05); }
    }
    const m = new Matrix4(), q = new Quaternion(), one = new Vector3(1, 1, 1);
    v.dustBits.forEach((b, i) => {
      if (b.life <= 0) return;
      b.life -= wdt;
      b.p.y += b.vy * wdt;
      if (b.life <= 0 || b.p.y < 0.02) { b.life = 0; v.dust.setMatrixAt(i, HIDE); return; }
      m.compose(b.p, q, one);
      v.dust.setMatrixAt(i, m);
    });
    v.dust.instanceMatrix.needsUpdate = true;
    const dir = new Vector3(), fwd = new Vector3(0, 0, 1);
    v.sparkBits.forEach((b, i) => {
      if (b.life <= 0) return;
      b.life -= wdt;
      b.v.y -= 9.8 * wdt;
      b.p.addScaledVector(b.v, wdt);
      if (b.life <= 0 || b.p.y < 0) { b.life = 0; v.sparks.setMatrixAt(i, HIDE); return; }
      q.setFromUnitVectors(fwd, dir.copy(b.v).normalize());
      m.compose(b.p, q, one);
      v.sparks.setMatrixAt(i, m);
    });
    v.sparks.instanceMatrix.needsUpdate = true;
    // the bulb: steady, a stutter when the heavy lands, dead after the cables (the red light takes over)
    if (st.flick > 0) st.flick = Math.max(0, st.flick - dt);
    const bulb = st.dead ? (st.flick > 0 ? (Math.random() < 0.5 ? 0.6 : 0.05) : 0.05) : st.flick > 0 ? (Math.random() < 0.4 ? 0.25 : 1) : 1;
    towerFx.flicker.value = bulb;
    v.bulbLight.intensity = 7 * bulb;
    v.emergency.intensity += ((st.dead ? 7 : 0) - v.emergency.intensity) * Math.min(1, dt * 6);
    (v.emergencyBox.material as MeshBasicMaterial).color.setRGB(st.dead ? 3 : 0.25, st.dead ? 0.2 : 0.02, st.dead ? 0.2 : 0.02);
    // the dial's needle: the ride's progress (it creeps on a leg, dips back while the car falls)
    const legs = Math.max(1, ride.steps.length - 1);
    const cur = ride.stop ? ride.i : ride.i + Math.min(1, ride.t / Math.max(1, (ride.cur as { t?: number }).t ?? 1));
    const want = -1.1 + 2.2 * Math.max(0, Math.min(1, cur / legs));
    if (ride.scroll() < -1) st.needle -= dt * 0.6;
    else st.needle += (want - st.needle) * Math.min(1, dt * 2);
    v.dialPivot.rotation.x = st.needle;
    // the loops: the car's hum on the move, the shaft's wind (louder in the fall)
    const inRoom = !s.paused;
    const speed = Math.abs(ride.scroll());
    setLoop("elevator_hum_loop", inRoom && g.phase !== "done" ? (speed > 0.1 && !st.dead ? 0.35 : 0.12) : 0, 0.5);
    setLoop("shaft_wind_loop", inRoom ? Math.min(0.7, speed * 0.08 + (speed > 5 ? 0.35 : 0)) : 0, 0.3);
  }, FRAME.fx);

  return v ? <primitive object={v.group} /> : null;
}
