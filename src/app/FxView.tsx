// Gunfire and hit effects, all pooled InstancedMeshes fed by the sim's events:
//  tracer streaks (hitscan), visible bullets with trails (bullet time + the kill cam's replayed shot),
//  muzzle flashes with a light, stylised blood puffs (not gory), bullet holes and blood decals on the
//  wall behind, impact sparks, copium pickups, the exit marker once the room is clear.
// Particles age on world time, so bullet time slows them with everything else.
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, NormalBlending, BoxGeometry, Color, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry, PointLight, Quaternion, Vector3, type BufferGeometry, type Material,
} from "three";
import type { Session } from "./session.ts";
import type { GameEvent } from "../sim/types.ts";
import { playerMuzzles } from "./PlayerView.tsx";
import { enemyMuzzles } from "./EnemiesView.tsx";
import { FRAME } from "./frame.ts";
import { useUi } from "../ui/store.ts";
import { lookOwns } from "./look/fx.ts";

const Z = new Vector3(0, 0, 1);
const HIDE = new Matrix4().makeScale(0, 0, 0);

type Item = { life: number; max: number; p: Vector3; v: Vector3; a: Vector3; b: Vector3; s: number; alive: boolean };

class Pool {
  readonly mesh: InstancedMesh;
  readonly items: Item[];
  private next = 0;
  constructor(geo: BufferGeometry, mat: Material, n: number) {
    this.mesh = new InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.items = Array.from({ length: n }, () => ({ life: 0, max: 1, p: new Vector3(), v: new Vector3(), a: new Vector3(), b: new Vector3(), s: 1, alive: false }));
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, HIDE);
  }
  spawn(max: number): Item {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    it.life = 0;
    it.max = max;
    it.alive = true;
    it.s = 1;
    return it;
  }
  clear(): void {
    for (let i = 0; i < this.items.length; i++) { this.items[i].alive = false; this.mesh.setMatrixAt(i, HIDE); }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const m4 = new Matrix4();
const q = new Quaternion();
const vs = new Vector3();
const vd = new Vector3();

/** Box stretched from a to b with width w. */
function segment(mesh: InstancedMesh, i: number, a: Vector3, b: Vector3, w: number): void {
  vd.subVectors(b, a);
  const len = vd.length();
  if (len < 1e-4) { mesh.setMatrixAt(i, HIDE); return; }
  q.setFromUnitVectors(Z, vd.divideScalar(len));
  vs.addVectors(a, b).multiplyScalar(0.5);
  m4.compose(vs, q, new Vector3(w, w, len));
  mesh.setMatrixAt(i, m4);
}

export function FxView({ s }: { s: Session }) {
  const fx = useMemo(() => {
    const unit = new BoxGeometry(1, 1, 1);
    // hdr > 1: gunfire is the brightest thing on screen and the only thing besides neon that blooms
    const glow = (color: string, additive = false, opacity = 1, hdr = 1) =>
      new MeshBasicMaterial({ color: new Color(color).multiplyScalar(hdr), toneMapped: false, transparent: additive || opacity < 1, opacity, blending: additive ? AdditiveBlending : NormalBlending, depthWrite: !additive });
    const group = new Group();
    const tracers = new Pool(unit, glow("#ffe7a8", true, 0.9, 3), 48);
    const bullets = new Pool(unit, glow("#fff2c0", false, 1, 3), 64);
    const trails = new Pool(unit, glow("#ffb070", true, 0.45, 2.5), 64);
    const flashes = new Pool(new OctahedronGeometry(1, 0), glow("#ffd27a", true, 1, 3), 16);
    const blood = new Pool(new IcosahedronGeometry(1, 0), new MeshStandardMaterial({ color: "#7a0a12", roughness: 0.4 }), 240);
    const sparks = new Pool(unit, glow("#ffcf6a"), 120);
    const holes = new Pool(unit, new MeshStandardMaterial({ color: "#050505", roughness: 1 }), 120);
    const splats = new Pool(new CylinderGeometry(0.5, 0.5, 1, 10), new MeshStandardMaterial({ color: "#5c0710", roughness: 0.5 }), 60);
    for (const p of [tracers, bullets, trails, flashes, blood, sparks, holes, splats]) group.add(p.mesh);
    // one flash light for the player's guns, one for the gang's (a fixed light count: no shader rebuilds)
    const lights = [new PointLight("#ffc46b", 0, 7, 2), new PointLight("#ffc46b", 0, 7, 2)];
    lights.forEach(l => group.add(l));
    const lightT = [0, 0];
    // pickups: an orange canister with a white cap
    const canGeo = new CylinderGeometry(0.09, 0.09, 0.26, 12);
    const capGeo = new CylinderGeometry(0.1, 0.1, 0.06, 12);
    const canMat = new MeshStandardMaterial({ color: "#ff8a1f", roughness: 0.4, emissive: new Color("#ff6a00"), emissiveIntensity: 0.6 });
    const capMat = new MeshStandardMaterial({ color: "#f4f4f4", roughness: 0.5 });
    const pickups = new Map<string, Group>();
    // exit marker
    const exit = new Mesh(new ConeGeometry(0.28, 0.5, 4), glow("#3ff0ff"));
    exit.rotation.x = Math.PI;
    exit.visible = false;
    group.add(exit);
    return { group, tracers, bullets, trails, flashes, blood, sparks, holes, splats, lights, lightT, pickups, canGeo, capGeo, canMat, capMat, exit, run: -1 };
  }, []);

  // pickups follow the game's list (rebuilt on restart)
  const syncPickups = () => {
    for (const g of fx.pickups.values()) fx.group.remove(g);
    fx.pickups.clear();
    for (const k of s.game.pickups) {
      const g = new Group();
      const can = new Mesh(fx.canGeo, fx.canMat);
      const cap = new Mesh(fx.capGeo, fx.capMat);
      cap.position.y = 0.16;
      g.add(can, cap);
      g.position.set(k.x, k.y + 0.35, k.z);
      fx.group.add(g);
      fx.pickups.set(k.id, g);
    }
  };

  useEffect(() => {
    const tmpA = new Vector3(), tmpB = new Vector3();
    const onEvent = (e: GameEvent) => {
      switch (e.type) {
        case "shot": {
          const muzzle = e.shooter === -1 ? playerMuzzles[e.hand] : enemyMuzzles[e.shooter];
          const from = muzzle && muzzle.lengthSq() > 0 ? muzzle : tmpA.set(e.ox, e.oy, e.oz);
          // flash + light
          const f = fx.flashes.spawn(0.05);
          f.p.copy(from);
          f.s = e.shooter === -1 ? 0.09 : 0.075;
          const li = e.shooter === -1 ? 0 : 1;
          fx.lights[li].position.copy(from);
          fx.lightT[li] = 0.06;
          if (!e.projectile && (e.shooter === -1 || !lookOwns.enemyTracers)) {
            const t = fx.tracers.spawn(0.07);
            t.a.copy(from);
            t.b.set(e.ex, e.ey, e.ez);
          }
          break;
        }
        case "blood": {
          const n = 10;
          for (let i = 0; i < n; i++) {
            const b = fx.blood.spawn(0.35 + Math.random() * 0.25);
            b.p.set(e.x, e.y, e.z);
            // most spray out of the exit side, a little back toward the shooter
            const back = i < 3 ? -0.8 : 1;
            b.v.set(e.dx * back * (1.5 + Math.random() * 2) + (Math.random() - 0.5) * 2.2, (Math.random() - 0.2) * 2.2, e.dz * back * (1.5 + Math.random() * 2) + (Math.random() - 0.5) * 2.2);
            b.s = 0.025 + Math.random() * 0.035;
          }
          const puff = fx.blood.spawn(0.22);
          puff.p.set(e.x, e.y, e.z);
          puff.v.set(0, 0.3, 0);
          puff.s = -0.14; // negative = the expanding mist ball
          if (e.target >= 0) useUi.setState({ hitAt: performance.now() });
          break;
        }
        case "impact": {
          for (let i = 0; i < 6; i++) {
            const k = fx.sparks.spawn(0.18 + Math.random() * 0.12);
            k.p.set(e.x, e.y, e.z);
            k.v.set(e.nx * 3 + (Math.random() - 0.5) * 5, e.ny * 3 + Math.random() * 3, e.nz * 3 + (Math.random() - 0.5) * 5);
            k.s = 0.018;
          }
          break;
        }
        case "decal": {
          const pool = e.blood ? fx.splats : fx.holes;
          const d = pool.spawn(Infinity);
          d.p.set(e.x + e.nx * 0.012, e.y + e.ny * 0.012, e.z + e.nz * 0.012);
          d.a.set(e.nx, e.ny, e.nz);
          d.s = e.blood ? 0.22 + Math.random() * 0.25 : 0.06;
          d.b.set(Math.random() * Math.PI, 0, 0);
          break;
        }
        case "kill": {
          useUi.setState(e.headshot ? { killAt: performance.now(), headshotAt: performance.now() } : { killAt: performance.now() });
          break;
        }
      }
      void tmpB;
    };
    return s.on(onEvent);
  }, [s, fx]);

  useFrame((_, rawDelta) => {
    const g = s.game;
    const dt = Math.min(rawDelta, 0.1);
    const wdt = s.paused ? 0 : dt * g.timeScale;
    if (fx.run !== s.run) {
      fx.run = s.run;
      for (const p of [fx.tracers, fx.bullets, fx.trails, fx.flashes, fx.blood, fx.sparks, fx.holes, fx.splats]) p.clear();
      syncPickups();
    }
    // tracers: a 4 m streak racing from the muzzle to the hit
    {
      const P = fx.tracers;
      P.items.forEach((t, i) => {
        if (!t.alive) return;
        t.life += s.paused ? 0 : dt;
        if (t.life >= t.max) { t.alive = false; P.mesh.setMatrixAt(i, HIDE); return; }
        const len = t.a.distanceTo(t.b);
        const k = Math.min(1, (t.life / t.max) * 1.25);
        vd.subVectors(t.b, t.a).normalize();
        const head = Math.min(len, len * k);
        const tail = Math.max(0, head - Math.min(4, len));
        segment(P.mesh, i, vs.copy(t.a).addScaledVector(vd, tail).clone(), vs.copy(t.a).addScaledVector(vd, head).clone(), 0.026);
      });
      P.mesh.instanceMatrix.needsUpdate = true;
    }
    // projectiles (+ the kill cam's cinematic bullet)
    {
      const B = fx.bullets, T = fx.trails;
      let n = 0;
      const put = (x: number, y: number, z: number, dx: number, dy: number, dz: number, trail: number) => {
        if (n >= B.items.length) return;
        const a = vs.set(x - dx * 0.08, y - dy * 0.08, z - dz * 0.08).clone();
        const b = new Vector3(x + dx * 0.04, y + dy * 0.04, z + dz * 0.04);
        segment(B.mesh, n, a, b, 0.022);
        segment(T.mesh, n, new Vector3(x - dx * trail, y - dy * trail, z - dz * trail), a, 0.012);
        n++;
      };
      for (const b of g.projectiles) {
        const travelled = Math.sqrt((b.x - b.sx) ** 2 + (b.y - b.sy) ** 2 + (b.z - b.sz) ** 2);
        put(b.x, b.y, b.z, b.dx, b.dy, b.dz, Math.min(2.5, travelled));
      }
      const k = g.killcam;
      if (k && k.t < k.flight) {
        const f = k.t / k.flight;
        let dx = k.to.x - k.from.x, dy = k.to.y - k.from.y, dz = k.to.z - k.from.z;
        const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        dx /= l; dy /= l; dz /= l;
        put(k.from.x + (k.to.x - k.from.x) * f, k.from.y + (k.to.y - k.from.y) * f, k.from.z + (k.to.z - k.from.z) * f, dx, dy, dz, Math.min(1.5, l * f));
      }
      for (let i = n; i < B.items.length; i++) { B.mesh.setMatrixAt(i, HIDE); T.mesh.setMatrixAt(i, HIDE); }
      B.mesh.instanceMatrix.needsUpdate = true;
      T.mesh.instanceMatrix.needsUpdate = true;
    }
    // flashes + lights (world time: bullet time holds them longer)
    {
      const P = fx.flashes;
      P.items.forEach((f, i) => {
        if (!f.alive) return;
        f.life += wdt;
        if (f.life >= f.max) { f.alive = false; P.mesh.setMatrixAt(i, HIDE); return; }
        const k = 1 - f.life / f.max;
        q.setFromAxisAngle(Z, Math.random() * 6.28);
        m4.compose(f.p, q, vs.set(f.s * k, f.s * k, f.s * k * 1.6));
        P.mesh.setMatrixAt(i, m4);
      });
      P.mesh.instanceMatrix.needsUpdate = true;
      fx.lights.forEach((l, i) => {
        fx.lightT[i] = Math.max(0, fx.lightT[i] - wdt);
        l.intensity = fx.lightT[i] > 0 ? 18 * (fx.lightT[i] / 0.06) : 0;
      });
    }
    // blood droplets / mist and sparks
    for (const [P, grav] of [[fx.blood, 9], [fx.sparks, 12]] as const) {
      P.items.forEach((b, i) => {
        if (!b.alive) return;
        b.life += wdt;
        if (b.life >= b.max) { b.alive = false; P.mesh.setMatrixAt(i, HIDE); return; }
        b.v.y -= grav * wdt;
        b.p.addScaledVector(b.v, wdt);
        const k = b.life / b.max;
        const sc = b.s < 0 ? -b.s * (0.5 + 1.5 * k) * (1 - k * k) : b.s * (1 - k * 0.6);
        m4.compose(b.p, q.identity(), vs.set(sc, sc, sc));
        P.mesh.setMatrixAt(i, m4);
      });
      P.mesh.instanceMatrix.needsUpdate = true;
    }
    // decals (static once placed)
    for (const P of [fx.holes, fx.splats]) {
      P.items.forEach((d, i) => {
        if (!d.alive || d.life < 0) return;
        d.life = -1; // written once
        if (P === fx.splats) {
          q.setFromUnitVectors(vs.set(0, 1, 0), d.a);
          m4.compose(d.p, q, vd.set(d.s, 0.004, d.s * (0.7 + 0.3 * Math.random())));
        } else {
          q.setFromUnitVectors(Z, d.a);
          m4.compose(d.p, q, vd.set(d.s, d.s, 0.004));
        }
        P.mesh.setMatrixAt(i, m4);
      });
      P.mesh.instanceMatrix.needsUpdate = true;
    }
    // pickups bob and spin; hidden when taken
    const t = g.realTime;
    for (const k of g.pickups) {
      const m = fx.pickups.get(k.id);
      if (!m) continue;
      m.visible = !k.taken;
      m.position.y = k.y + 0.35 + Math.sin(t * 2.2 + k.x) * 0.06;
      m.rotation.y = t * 1.6;
      m.rotation.z = 0.35;
    }
    // exit marker
    const ex = g.level.markers.find(m => m.kind === "exit") ?? g.triggers.find(m => m.data.action === "exit");
    fx.exit.visible = !!ex && g.phase === "clear";
    if (ex && fx.exit.visible) { fx.exit.position.set(ex.x, ex.y + 2.3 + Math.sin(t * 3) * 0.15, ex.z); fx.exit.rotation.y = t * 2; }
  }, FRAME.fx);

  return <primitive object={fx.group} />;
}
