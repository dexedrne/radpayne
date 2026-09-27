// Room 5's boss room (views only; the fight is sim/boss.ts + ai/madame.ts). Nothing here when the room
// has no boss. Readability first: every tell reads at a glance and she is the most distinct thing here.
//  - Madame Pockit's dress: the big oxblood coat (a skirt from the waist to below the knees, the body,
//    a white fur collar) on her own bones, her second SMG in the left hand, her own soft key light. At
//    33 % she throws the coat off: it drops to the floor where she stood and stays there.
//  - The sweep's tell: two thin pink laser lines from her guns across the floor along the arc.
//  - Her heart grenades: pink, blinking; held high in the wind-up; the pink ring on the floor where it
//    will land grows while it flies; the blast is a short pink-white flash and a puff of smoke; shot in
//    the air, a small pink puff.
//  - The chandelier over the rug (it falls when its chain goes), the add doors (their red lamp lights
//    before they open, then they swing in), the rain-streaked glass, the big screen with her call on it
//    (dark once she steps into the fight).
//  - Their sounds, and the penthouse's room tone.
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, BoxGeometry, CircleGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, InstancedMesh, LatheGeometry, Matrix4, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, PointLight, Quaternion, RingGeometry, SRGBColorSpace, Shape, SphereGeometry, TextureLoader, TorusGeometry, Vector2, Vector3,
  type Material, type Object3D,
} from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import type { Session } from "./session.ts";
import type { GameEvent } from "../sim/types.ts";
import { MADAME } from "../sim/tuning.ts";
import { FRAME } from "./frame.ts";
import { assetUrl } from "./assets.ts";
import { goonModels } from "./EnemiesView.tsx";
import { attachGun, makeSmg } from "./guns.ts";
import { MILADY_GRIP } from "../anim/grips.ts";
import { setLoop, sfx, sfxKey } from "../audio/sfx.ts";
import type { LoadedGoon } from "../vrm/pockit.ts";

const HIDE = new Matrix4().makeScale(0, 0, 0);
const UP = new Vector3(0, 1, 0);
/** The comic's coat colour (cutscene 3 draws it a dark oxblood-brown), the fur. */
const COAT = "#5a1f1c", FUR = "#f3eee6";
const PINK = new Color(2.6, 0.45, 1.3);

/** A small heart (the grenade), 0.18 m across, extruded 0.07 m, centred. */
function heartGeometry(): ExtrudeGeometry {
  const s = new Shape();
  const k = 0.009;
  s.moveTo(0, -9 * k);
  s.bezierCurveTo(-2 * k, -6 * k, -10 * k, -2 * k, -10 * k, 3 * k);
  s.bezierCurveTo(-10 * k, 8 * k, -4 * k, 10 * k, 0, 5 * k);
  s.bezierCurveTo(4 * k, 10 * k, 10 * k, 8 * k, 10 * k, 3 * k);
  s.bezierCurveTo(10 * k, -2 * k, 2 * k, -6 * k, 0, -9 * k);
  const g = new ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 8 });
  g.center();
  return g;
}

type Puff = { flash: Mesh; smoke: Mesh; light: PointLight; t: number; big: boolean };
type Dress = { model: LoadedGoon; skirt: Mesh; body: Mesh; collar: Mesh; gun: Group };

export function BossView({ s }: { s: Session }) {
  const v = useMemo(() => {
    const b = s.game.boss;
    if (!b) return null;
    const group = new Group();
    const loader = new TextureLoader();
    const tex = (url: string) => { const t = loader.load(assetUrl(url)); t.colorSpace = SRGBColorSpace; return t; };
    const mats: Material[] = [];
    const m = <T extends Material>(x: T): T => { x.userData.rpOwn = true; mats.push(x); return x; };
    // her coat (node materials: the look gives it the hostile lift and the pink-red rim)
    const coatMat = m(new MeshStandardNodeMaterial({ color: new Color(COAT), roughness: 0.7, side: DoubleSide }));
    const furMat = m(new MeshStandardNodeMaterial({ color: new Color(FUR), roughness: 1 }));
    const skirtGeo = new LatheGeometry([new Vector2(0.17, 0.06), new Vector2(0.2, -0.1), new Vector2(0.28, -0.35), new Vector2(0.35, -0.6), new Vector2(0.38, -0.68)], 18);
    // the coat's body and the collar are shaped to her once her model is in (dress(): hips to neck)
    const bodyGeo = new LatheGeometry([new Vector2(0.16, 0.02), new Vector2(0.2, 0.4)], 16);
    const collarGeo = new TorusGeometry(0.13, 0.075, 8, 20);
    // the coat on the floor (after phase 3): the skirt, flattened where it fell
    const dropped = new Mesh(skirtGeo, coatMat);
    dropped.visible = false;
    group.add(dropped);
    // her key light
    const key = new PointLight("#ffe4cc", 0, 6, 2);
    group.add(key);
    // the sweep's laser lines
    const laserMat = m(new MeshBasicMaterial({ color: PINK, toneMapped: false, blending: AdditiveBlending, transparent: true, depthWrite: false }));
    const lasers = [0, 1].map(() => { const l = new Mesh(new BoxGeometry(0.045, 0.045, 1), laserMat); l.visible = false; group.add(l); return l; });
    // where each line meets the floor: a small glowing spot
    const dots = [0, 1].map(() => { const d = new Mesh(new CircleGeometry(0.16, 16), laserMat); d.rotation.x = -Math.PI / 2; d.visible = false; group.add(d); return d; });
    // grenades (the pool) and the one in her hand, their rings
    const heart = heartGeometry();
    const heartMat = m(new MeshStandardMaterial({ color: new Color("#ff4fa3"), emissive: new Color("#ff2f8a"), emissiveIntensity: 0.7, roughness: 0.35 }));
    const blinkMat = m(new MeshBasicMaterial({ color: new Color(3, 0.4, 0.6), toneMapped: false }));
    const mkGrenade = () => {
      const gg = new Group();
      const h = new Mesh(heart, heartMat);
      const blink = new Mesh(new SphereGeometry(0.022, 8, 6), blinkMat);
      blink.position.set(0, 0.07, 0.04);
      gg.add(h, blink);
      gg.visible = false;
      group.add(gg);
      return { g: gg, blink };
    };
    const grenades = Array.from({ length: 5 }, mkGrenade);
    const inHand = mkGrenade();
    const ringMat = m(new MeshBasicMaterial({ color: PINK, toneMapped: false, blending: AdditiveBlending, transparent: true, depthWrite: false, side: DoubleSide }));
    const fillMat = m(new MeshBasicMaterial({ color: new Color(0.9, 0.15, 0.45), toneMapped: false, transparent: true, opacity: 0.12, depthWrite: false, side: DoubleSide }));
    const rings = Array.from({ length: 5 }, () => {
      const r = new Mesh(new RingGeometry(0.92, 1.0, 48), ringMat);
      const f = new Mesh(new CircleGeometry(1, 40), fillMat);
      r.rotation.x = f.rotation.x = -Math.PI / 2;
      r.visible = f.visible = false;
      group.add(r, f);
      return { r, f };
    });
    // blasts and pops
    const flashMat = m(new MeshBasicMaterial({ color: new Color(1.5, 0.8, 1.15), toneMapped: false, blending: AdditiveBlending, transparent: true, depthWrite: false }));
    const puffs: Puff[] = Array.from({ length: 4 }, () => {
      const flash = new Mesh(new SphereGeometry(1, 16, 10), flashMat.clone());
      // the smoke: three soft blobs, not one ball
      const smoke = new Mesh(new SphereGeometry(1, 12, 8), m(new MeshBasicMaterial({ color: new Color("#6e6269"), transparent: true, opacity: 0, depthWrite: false })));
      for (const [x, y, z, k] of [[0.55, 0.15, 0.1, 0.7], [-0.45, 0.3, -0.2, 0.6], [0.1, 0.55, 0.35, 0.55]]) {
        const b = new Mesh(smoke.geometry, smoke.material);
        b.position.set(x, y, z);
        b.scale.setScalar(k);
        smoke.add(b);
      }
      const light = new PointLight("#ffb0d8", 0, 9, 2);
      flash.visible = smoke.visible = false;
      mats.push(flash.material as Material);
      group.add(flash, smoke, light);
      return { flash, smoke, light, t: -1, big: true };
    });
    // the chandelier: a brass ring, crystal drops, a warm core, its light
    const [cx, cy, cz] = b.chainAt;
    const chand = new Group();
    const brass = m(new MeshStandardMaterial({ color: new Color("#b08a4a"), roughness: 0.3, metalness: 0.85 }));
    const crystal = m(new MeshBasicMaterial({ color: new Color(1.6, 1.4, 1.1), toneMapped: false }));
    const ringA = new Mesh(new TorusGeometry(0.85, 0.035, 8, 40), brass);
    ringA.rotation.x = Math.PI / 2;
    const ringB = new Mesh(new TorusGeometry(0.5, 0.03, 8, 30), brass);
    ringB.rotation.x = Math.PI / 2;
    ringB.position.y = -0.35;
    const core = new Mesh(new SphereGeometry(0.2, 14, 10), crystal);
    core.position.y = -0.3;
    const stem = new Mesh(new CylinderGeometry(0.03, 0.03, 0.7, 6), brass);
    stem.position.y = 0.3;
    chand.add(ringA, ringB, core, stem);
    const drops = new InstancedMesh(new ConeGeometry(0.05, 0.22, 6), crystal, 36);
    const dm = new Matrix4(), dq = new Quaternion();
    for (let i = 0; i < 36; i++) {
      const ring = i < 24 ? 0.85 : 0.5, n = i < 24 ? 24 : 12, k = i < 24 ? i : i - 24;
      const a = (k / n) * Math.PI * 2;
      dq.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI);
      dm.compose(new Vector3(Math.cos(a) * ring, (i < 24 ? -0.14 : -0.48) - (k % 2) * 0.06, Math.sin(a) * ring), dq, new Vector3(1, 1, 1));
      drops.setMatrixAt(i, dm);
    }
    chand.add(drops);
    const chandHome = new Vector3(cx, cy - 0.7, cz);
    chand.position.copy(chandHome);
    const chandLight = new PointLight("#ffd6a0", 30, 14, 2);
    chandLight.position.set(cx, 4.2, cz);
    group.add(chand, chandLight);
    // crystal shards when it lands
    const shardMat = m(new MeshBasicMaterial({ color: new Color(1.3, 1.2, 1.0), toneMapped: false }));
    const shards = new InstancedMesh(new BoxGeometry(0.05, 0.02, 0.08), shardMat, 40);
    shards.frustumCulled = false;
    for (let i = 0; i < 40; i++) shards.setMatrixAt(i, HIDE);
    group.add(shards);
    const shardBits = Array.from({ length: 40 }, () => ({ p: new Vector3(), v: new Vector3(), rest: true, alive: false, r: 0 }));
    // the add doors: two leaves each (hinged at the jambs, they swing in), the red lamp over each
    const doorMat = m(new MeshStandardMaterial({ map: tex("/textures/penthouse/door_double.webp"), roughness: 0.4 }));
    const lampMat = () => m(new MeshBasicMaterial({ color: new Color(0.25, 0.02, 0.03), toneMapped: false }));
    const doors = b.doors.map(d => {
      const box = s.level.boxes.find(k => k.node === d.door)!;
      const w = box.hx * 2, h = box.hy * 2;
      const inward = -Math.sign(box.cz) || 1; // toward the hall's centre (z)
      const leaves = [-1, 1].map(side => {
        const hinge = new Group();
        hinge.position.set(box.cx + side * box.hx, 0, box.cz);
        const g = new PlaneGeometry(w / 2, h);
        const uv = g.getAttribute("uv");
        const u0 = side < 0 ? 0 : 0.5, u1 = side < 0 ? 0.5 : 1;
        for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
        const leaf = new Mesh(g, doorMat);
        leaf.position.set(-side * w / 4, h / 2, 0);
        leaf.rotation.y = inward > 0 ? 0 : Math.PI; // faces the hall
        hinge.add(leaf);
        group.add(hinge);
        return { hinge, side };
      });
      const lm = lampMat();
      const lamp = new Mesh(new BoxGeometry(0.5, 0.14, 0.08), lm);
      lamp.position.set(box.cx, h + 0.35, box.cz + inward * 0.12);
      const lampLight = new PointLight("#ff2a1a", 0, 7, 2);
      lampLight.position.set(box.cx, h + 0.2, box.cz + inward * 0.8);
      group.add(lamp, lampLight);
      return { door: d.door, leaves, inward, lamp, lm, lampLight, openT: -1, lit: false, offAt: -1 };
    });
    // the glass (rain-streaked) either side of the dais
    const glassMat = m(new MeshStandardMaterial({ map: tex("/textures/penthouse/glass_rain.webp"), color: new Color("#c8d8ea"), transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0.2, depthWrite: false, side: DoubleSide }));
    for (const bx of s.level.boxes.filter(k => k.node.startsWith("glass-e"))) {
      const pane = new Mesh(new PlaneGeometry(bx.hz * 2, bx.hy * 2), glassMat);
      pane.position.set(bx.cx - 0.06, bx.cy, bx.cz);
      pane.rotation.y = -Math.PI / 2;
      pane.renderOrder = 3;
      group.add(pane);
    }
    // the big screen (her call): lit until she steps into the fight
    const screenMat = m(new MeshBasicMaterial({ map: tex("/textures/penthouse/screen_idle.webp"), toneMapped: false }));
    const screen = new Mesh(new PlaneGeometry(6.8, 3.3), screenMat);
    screen.position.set(15.94, 3.25, 0);
    screen.rotation.y = -Math.PI / 2;
    group.add(screen);
    group.traverse(o => { o.userData.rpWarm = true; });
    return {
      group, coatMat, furMat, skirtGeo, bodyGeo, collarGeo, dropped, key, lasers, dots, grenades, inHand, rings, puffs, chand, chandHome, chandLight, shards, shardBits,
      doors, screen, screenMat, mats,
      st: { run: -1, dress: null as Dress | null, coatOff: false, dropT: -1, dropFrom: new Vector3(), dropYaw: 0, fallV: 0, crashed: false, screen: 1, beep: 0, chainGlint: 0 },
    };
  }, [s]);

  useEffect(() => () => {
    if (!v) return;
    v.group.traverse(o => { const mm = o as Mesh; if (mm.isMesh) mm.geometry.dispose(); });
    for (const mt of v.mats) { (mt as MeshStandardMaterial).map?.dispose(); mt.dispose(); }
    v.st.dress?.gun.removeFromParent();
  }, [v]);

  /** Put the coat, the collar and the second SMG on her bones (once her model is mounted). */
  function dress(model: LoadedGoon): Dress | null {
    if (!v) return null;
    const hum = model.vrm.humanoid;
    const hips = hum.getNormalizedBoneNode("hips");
    const chest = hum.getNormalizedBoneNode("upperChest") ?? hum.getNormalizedBoneNode("chest") ?? hum.getNormalizedBoneNode("spine") ?? hips;
    const left = hum.getNormalizedBoneNode("leftHand");
    if (!hips) return null;
    const k = 1 / model.scale;
    // hips to neck in the coat's own units (the bind pose stands straight)
    const neck = hum.getNormalizedBoneNode("neck") ?? chest ?? hips;
    model.body.updateWorldMatrix(true, true);
    const a = new Vector3(), c = new Vector3(), ws = new Vector3();
    hips.getWorldPosition(c);
    neck.getWorldPosition(a);
    hips.getWorldScale(ws);
    const H = Math.max(0.3, Math.min(0.7, (a.y - c.y) / Math.max(1e-6, k * ws.y)));
    const skirt = new Mesh(v.skirtGeo, v.coatMat);
    skirt.scale.setScalar(k);
    hips.add(skirt);
    v.bodyGeo.dispose();
    const bodyGeo = new LatheGeometry([new Vector2(0.165, 0.02), new Vector2(0.17, 0.3 * H), new Vector2(0.195, 0.62 * H), new Vector2(0.205, 0.8 * H), new Vector2(0.12, 0.93 * H)], 16);
    v.bodyGeo = bodyGeo;
    const body = new Mesh(bodyGeo, v.coatMat);
    body.scale.setScalar(k);
    hips.add(body);
    const collar = new Mesh(v.collarGeo, v.furMat);
    collar.scale.setScalar(k);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.9 * H * k;
    hips.add(collar);
    const gun = makeSmg();
    if (left) {
      const g = MILADY_GRIP.left;
      const grip = model.vrm0 ? { p: [-g.p[0], g.p[1], -g.p[2]] as [number, number, number], q: new Quaternion(0, 1, 0, 0).multiply(new Quaternion(...g.q)).toArray() as [number, number, number, number] } : g;
      attachGun(gun, left, grip, model.forearm / MILADY_GRIP.forearm, k);
    }
    for (const o of [skirt, body, collar] as Object3D[]) o.traverse(c => { c.frustumCulled = false; });
    return { model, skirt, body, collar, gun };
  }

  useEffect(() => {
    if (!v) return;
    return s.on((e: GameEvent, ss) => {
      const g = ss.game, p = g.player;
      const at = (x: number, z: number) => { const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1; return { d, pan: (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / d }; };
      const b = g.boss;
      if (!b) return;
      const her = g.enemies[b.idx];
      const hw = her ? at(her.x, her.z) : { d: 10, pan: 0 };
      if (e.type === "grenade") {
        const w = at(e.x, e.z);
        if (e.what === "throw") sfxKey("grenade_bounce", w.d, w.pan, 0.25);
        else if (e.what === "land") sfxKey("grenade_bounce", w.d, w.pan, 0.8);
        else if (e.what === "pop") { sfxKey("grenade_pop", w.d, w.pan, 0.9); puff(e.x, e.y, e.z, false); }
        else if (e.what === "blast") { sfxKey(Math.random() < 0.5 ? "grenade_explode" : "grenade_explode_2", w.d, w.pan, 1.0); puff(e.x, e.y + 0.3, e.z, true); }
        return;
      }
      if (e.type === "impact" && e.surface === "glass") { const w = at(e.x, e.z); sfxKey(Math.random() < 0.5 ? "glass_crack" : "glass_crack_2", w.d, w.pan, 0.6); return; }
      if (e.type !== "boss") return;
      switch (e.what) {
        case "intro": v.st.screen = 0.999; break;
        case "sweepTell": sfxKey("boss_sweep_tell", hw.d, hw.pan, 0.9); break;
        case "windup": sfxKey("grenade_pin", hw.d, hw.pan, 0.9); v.st.beep = 0; break;
        case "phase3": sfxKey("coat_drop", hw.d, hw.pan, 0.9); v.st.coatOff = true; v.st.dropT = 0; if (her) { v.st.dropFrom.set(her.x, her.y + 1.0, her.z); v.st.dropYaw = her.facing; } break;
        case "lamp": { const d = v.doors.find(k => k.door === e.door); if (d) d.lit = true; break; }
        case "door": {
          const d = v.doors.find(k => k.door === e.door);
          if (d) { d.openT = 0; d.offAt = 1.5; const w = at(d.lamp.position.x, d.lamp.position.z); sfxKey("add_doors_open", w.d, w.pan, 0.9); }
          break;
        }
        case "chain": sfx.impact("metal", at(b.chainAt[0], b.chainAt[2]).d, 0); v.st.chainGlint = 1; break;
        case "chandelier": { const w = at(b.chainAt[0], b.chainAt[2]); sfxKey("chandelier_snap", w.d, w.pan, 1.0); v.st.fallV = 0; break; }
        case "crash": { const w = at(b.rug[0], b.rug[1]); sfxKey("chandelier_crash", w.d, w.pan, 1.0); v.st.crashed = true; shatter(); break; }
      }
    });
    function puff(x: number, y: number, z: number, big: boolean): void {
      const pf = v!.puffs.find(k => k.t < 0) ?? v!.puffs[0];
      pf.t = 0;
      pf.big = big;
      pf.flash.position.set(x, y, z);
      pf.smoke.position.set(x, y, z);
      pf.light.position.set(x, y + 0.5, z);
    }
    function shatter(): void {
      const [rx, rz] = [v!.chand.position.x, v!.chand.position.z];
      for (const bit of v!.shardBits) {
        bit.alive = true; bit.rest = false;
        bit.p.set(rx + (Math.random() - 0.5) * 1.2, 0.4, rz + (Math.random() - 0.5) * 1.2);
        bit.v.set((Math.random() - 0.5) * 6, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 6);
        bit.r = Math.random() * 6;
      }
    }
  }, [s, v]);

  useFrame((_, raw) => {
    if (!v) return;
    const g = s.game;
    const b = g.boss;
    if (!b) return;
    const dt = Math.min(raw, 0.1);
    const wdt = s.paused ? 0 : dt * g.timeScale;
    const st = v.st;
    const her = g.enemies[b.idx];
    const pr = s.renderE[b.idx] ?? her;
    if (st.run !== s.run) {
      // a new attempt: the coat back on, the chandelier up, the doors shut, the screen on
      st.run = s.run;
      st.coatOff = false; st.dropT = -1; st.crashed = false; st.screen = 1; st.chainGlint = 0;
      v.dropped.visible = false;
      v.chand.position.copy(v.chandHome);
      v.chand.rotation.set(0, 0, 0);
      v.chandLight.intensity = 30;
      v.chandLight.position.set(v.chandHome.x, 4.2, v.chandHome.z);
      for (const bit of v.shardBits) bit.alive = false;
      for (const d of v.doors) { d.lit = false; d.openT = -1; d.offAt = -1; for (const l of d.leaves) l.hinge.rotation.y = 0; }
    }
    // dress her once her model is in (and again if it changed)
    const model = goonModels[b.idx] ?? null;
    if (model && st.dress?.model !== model) { st.dress?.gun.removeFromParent(); st.dress = dress(model); }
    if (st.dress) {
      const on = !st.coatOff;
      st.dress.skirt.visible = st.dress.body.visible = st.dress.collar.visible = on;
      st.dress.gun.visible = her.state !== "inactive";
    }
    // the coat she threw: it falls from her shoulders and lies where she stood
    if (st.coatOff && st.dropT >= 0) {
      st.dropT = Math.min(1, st.dropT + wdt / 0.6);
      const u = st.dropT;
      const fy = g.world.groundBelow(st.dropFrom.x, st.dropFrom.z, 0.1, st.dropFrom.y);
      const floor = Number.isFinite(fy) ? fy : 0;
      v.dropped.visible = true;
      v.dropped.position.set(st.dropFrom.x - Math.sin(st.dropYaw) * 0.5 * u, floor + 0.05 + (st.dropFrom.y - floor) * (1 - u) * (1 - u), st.dropFrom.z - Math.cos(st.dropYaw) * 0.5 * u);
      v.dropped.scale.set(1.25 * (1 + 0.5 * u), 1.25 * (1 - 0.88 * u), 1.25 * (1 + 0.3 * u));
      v.dropped.rotation.set(0, st.dropYaw + u * 0.6, 0);
    }
    // her key light: soft, warm, over her head (the brightest body in her room)
    const alive = her.state !== "dead" && her.state !== "inactive";
    v.key.position.set(pr.x, pr.y + 3.0, pr.z);
    v.key.intensity += ((alive ? 9 : 2) - v.key.intensity) * Math.min(1, dt * 3);
    // the sweep: the laser lines along the arc (the tell bright, the burst dimmer)
    const sw = b.sweep;
    // (the lines run past where he stands to the floor behind him: from over his shoulder they cross the
    // screen as they sweep, never a dot pointing at the lens)
    const reach = Math.max(14, Math.hypot(g.player.x - her.x, g.player.z - her.z) + 5);
    for (let i = 0; i < 2; i++) {
      const l = v.lasers[i], dot = v.dots[i];
      l.visible = dot.visible = !!sw && alive;
      if (!sw || !alive) continue;
      const u = sw.tell > 0 ? 1 - sw.tell / sw.tellDur : Math.min(1, sw.t / MADAME.sweep.dur);
      const a = sw.a0 + (sw.a1 - sw.a0) * u;
      const c = Math.cos(a), sn = Math.sin(a);
      const side = i === 0 ? -0.24 : 0.24;
      const from = new Vector3(pr.x + sn * 0.55 - c * side, pr.y + 1.62, pr.z + c * 0.55 + sn * side);
      const fy = g.world.groundBelow(pr.x + sn * reach, pr.z + c * reach, 0.05, pr.y + 1);
      const to = new Vector3(pr.x + sn * reach - c * side * 3, (Number.isFinite(fy) ? fy : 0) + 0.03, pr.z + c * reach + sn * side * 3);
      dot.position.copy(to);
      const len = from.distanceTo(to);
      l.position.copy(from).add(to).multiplyScalar(0.5);
      l.lookAt(to);
      l.scale.set(sw.tell > 0 ? 1.4 : 0.9, sw.tell > 0 ? 1.4 : 0.9, len);
    }
    (v.lasers[0].material as MeshBasicMaterial).opacity = sw && sw.tell > 0 ? 0.95 : 0.55;
    // the grenade in her hand (the wind-up: it blinks, beeping)
    const hand = b.wind && alive ? b.handPoint(her) : null;
    v.inHand.g.visible = !!hand;
    if (hand) {
      v.inHand.g.position.set(hand.x + (pr.x - her.x), hand.y, hand.z + (pr.z - her.z));
      v.inHand.g.rotation.y += dt * 3;
      const blink = Math.sin(performance.now() / 45) > 0;
      v.inHand.blink.visible = blink;
      st.beep -= dt;
      if (st.beep <= 0) { st.beep = 0.18; const dx = hand.x - g.player.x, dz = hand.z - g.player.z; sfxKey("grenade_beep", Math.hypot(dx, dz), 0, 0.5); }
    }
    // grenades in flight / on the floor, and their rings (they grow while it flies)
    for (let i = 0; i < v.grenades.length; i++) {
      const gr = b.grenades[i];
      const view = v.grenades[i], ring = v.rings[i];
      view.g.visible = !!gr;
      ring.r.visible = ring.f.visible = !!gr;
      if (!gr) continue;
      view.g.position.set(gr.x, gr.y + (gr.landed ? 0.1 : 0), gr.z);
      if (!gr.landed) { view.g.rotation.x += wdt * 9; view.g.rotation.y += wdt * 5; } else view.g.rotation.set(-Math.PI / 2 + 0.3, gr.id, 0);
      const fuse = Math.max(0, 1 - gr.age / MADAME.grenade.fuse);
      view.blink.visible = Math.sin(performance.now() / (40 + 80 * fuse)) > 0;
      const R = MADAME.grenade.radius * Math.min(1, 0.35 + 0.65 * (gr.age / MADAME.grenade.flight));
      ring.r.position.set(gr.tx, gr.ty + 0.03, gr.tz);
      ring.f.position.set(gr.tx, gr.ty + 0.025, gr.tz);
      ring.r.scale.setScalar(R);
      ring.f.scale.setScalar(R);
      (ring.f.material as MeshBasicMaterial).opacity = 0.1 + 0.12 * (1 - fuse);
    }
    // blasts: a short flash (never a white-out) and a puff of smoke
    for (const pf of v.puffs) {
      if (pf.t < 0) { pf.flash.visible = pf.smoke.visible = false; pf.light.intensity = 0; continue; }
      pf.t += Math.max(wdt, dt * 0.25);
      const big = pf.big ? 1 : 0.35;
      const f = Math.min(1, pf.t / 0.3);
      pf.flash.visible = f < 1;
      pf.flash.scale.setScalar((0.3 + 1.5 * f) * big);
      (pf.flash.material as MeshBasicMaterial).opacity = (1 - f) * (1 - f) * 0.55;
      pf.light.intensity = (1 - f) * 25 * big;
      const sm = Math.min(1, pf.t / 1.4);
      pf.smoke.visible = sm < 1;
      pf.smoke.scale.setScalar((0.35 + 1.1 * sm) * big);
      pf.smoke.position.y += wdt * 0.45;
      (pf.smoke.material as MeshBasicMaterial).opacity = 0.22 * (1 - sm) * (sm < 0.12 ? sm / 0.12 : 1);
      if (sm >= 1) pf.t = -1;
    }
    // the chandelier: it falls when its chain goes (world time), lands on the rug, goes dim
    if (b.chandelier !== "up") {
      if (b.chandelier === "falling") {
        st.fallV += 16 * wdt;
        v.chand.position.y = Math.max(0.5, v.chand.position.y - st.fallV * wdt);
      } else {
        v.chand.position.y = 0.5;
        v.chand.rotation.set(0.35, 0.4, 0.2);
      }
      v.chandLight.position.y = v.chand.position.y + 0.4;
      v.chandLight.intensity += ((b.chandelier === "down" ? 6 : 30) - v.chandLight.intensity) * Math.min(1, dt * 3);
    } else if (st.chainGlint > 0) {
      st.chainGlint = Math.max(0, st.chainGlint - dt * 3);
      v.chand.rotation.z = Math.sin(performance.now() / 70) * 0.04 * st.chainGlint;
    }
    const sm = new Matrix4(), sq = new Quaternion(), one = new Vector3(1, 1, 1);
    v.shardBits.forEach((bit, i) => {
      if (!bit.alive) { v.shards.setMatrixAt(i, HIDE); return; }
      if (!bit.rest) {
        bit.v.y -= 9.8 * wdt;
        bit.p.addScaledVector(bit.v, wdt);
        bit.r += wdt * 8;
        if (bit.p.y <= 0.02) { bit.p.y = 0.02; bit.rest = true; }
      }
      sq.setFromAxisAngle(UP, bit.r);
      sm.compose(bit.p, sq, one);
      v.shards.setMatrixAt(i, sm);
    });
    v.shards.instanceMatrix.needsUpdate = true;
    // the add doors: the lamp's tell, then they swing in
    for (const d of v.doors) {
      const pulse = d.lit && d.offAt !== 0 ? 0.75 + 0.25 * Math.sin(performance.now() / 160) : 0;
      d.lm.color.setRGB(d.lit ? 3.2 * pulse : 0.25, d.lit ? 0.18 * pulse : 0.02, d.lit ? 0.2 * pulse : 0.03);
      d.lampLight.intensity = d.lit ? 8 * pulse : 0;
      if (d.openT >= 0) {
        d.openT = Math.min(1, d.openT + dt / 0.5);
        const e = d.openT * d.openT * (3 - 2 * d.openT);
        for (const l of d.leaves) l.hinge.rotation.y = l.side * d.inward * e * 1.35; // into the hall
        if (d.offAt > 0) { d.offAt = Math.max(0, d.offAt - dt); if (d.offAt === 0) d.lit = false; }
      }
    }
    // the screen: her call, until she steps into the fight
    if (st.screen < 1 || b.started) st.screen = Math.max(0.04, st.screen - dt * 1.5);
    v.screenMat.color.setScalar(0.6 * st.screen);
    // the room's tone (the rain on the glass, the building's hum)
    setLoop("penthouse_room_tone_loop", s.paused ? 0 : 0.45, 0.8);
  }, FRAME.fx);

  return v ? <primitive object={v.group} /> : null;
}
