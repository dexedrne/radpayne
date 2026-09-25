// Gunfire and hit effects, all pooled InstancedMeshes fed by the sim's events:
//  tracer streaks (hitscan; the street look draws its own), visible bullets with trails (bullet time +
//  the kill cam's replayed shot), muzzle flashes with a light, a stylised red blood spray + mist (not
//  gory), bullet holes and blood decals on the wall behind, impact sparks, copium pickups, the exit
//  marker once the room is clear.
// One colour code for gunfire: the player's is gold / white (flashes, bullets, the sparks where his shots
// land), the gang's is red (their muzzle flashes and bullets; their misses only kick up dull grey grit).
// Nothing is drawn as a big flat quad next to the lens: flashes shrink with their distance to the camera,
// bullets fade out inside ~3 m of it.
// Particles age on world time, so bullet time slows them with everything else.
// Round 2: a shotgun blast is one flash for its 8 pellets, and its pellets fly as thinner, shorter
// streaks than a pistol round (8 of them must not cover the screen); the heavies bleed a slightly
// bigger puff; weapon and ammo pickups (placed or dropped at a body) show as the gun / a box of rounds.
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, NormalBlending, BoxGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, PointLight, Quaternion, SRGBColorSpace, Vector3, type BufferGeometry, type Material,
} from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { attribute, float, max, pow, saturate, smoothstep, uv, vec4, abs } from "three/tsl";
import type { Session } from "./session.ts";
import type { GameEvent } from "../sim/types.ts";
import { playerMuzzles } from "./PlayerView.tsx";
import { enemyMuzzles } from "./EnemiesView.tsx";
import { makeShotgun, makeSmg } from "./guns.ts";
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
  /** Index of the item the last spawn() returned. */
  last = 0;
  constructor(geo: BufferGeometry, mat: Material, n: number) {
    this.mesh = new InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.items = Array.from({ length: n }, () => ({ life: 0, max: 1, p: new Vector3(), v: new Vector3(), a: new Vector3(), b: new Vector3(), s: 1, alive: false }));
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, HIDE);
  }
  spawn(max: number): Item {
    const it = this.items[this.next];
    this.last = this.next;
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

/** Gunfire colours (linear, HDR): the player's gold / white, the gang's red. */
export const GUNFIRE = {
  player: [1.0, 0.82, 0.5] as const,
  enemy: [1.0, 0.16, 0.1] as const,
  grit: [0.42, 0.42, 0.46] as const,
};

/** Muzzle-flash star, drawn in the shader (no texture, no card edge): a hot core with four long and
 *  four short spikes, white-hot in the middle, tinted by the instance colour (who fired). */
function flashMaterial(): MeshBasicNodeMaterial {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = uv().sub(0.5).mul(2);
  const r2 = q.x.mul(q.x).add(q.y.mul(q.y));
  const r = r2.sqrt();
  const inv = float(1).div(max(r2, 1e-5));
  const c2 = abs(q.x.mul(q.x).sub(q.y.mul(q.y)).mul(inv)); // |cos 2a|: the four long spikes
  const s2 = abs(q.x.mul(q.y).mul(2).mul(inv)); // |sin 2a|: the four short ones
  const core = pow(saturate(float(1).sub(r.div(0.42))), 2.0);
  const long = pow(c2, 36).mul(smoothstep(1.0, 0.1, r));
  const short = pow(s2, 30).mul(smoothstep(0.6, 0.05, r)).mul(0.7);
  const k = saturate(core.mul(1.6).add(long).add(short));
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
  // white-hot core, the tint toward the rim (the instance colour multiplies the whole thing)
  m.colorNode = vec4(k.mul(2.4).add(core.mul(1.2)), k.mul(2.4).add(core.mul(1.2)), k.mul(2.4).add(core.mul(1.2)), 1);
  m.fog = false;
  m.toneMapped = false;
  m.userData.rpOwn = true;
  return m;
}

/** Soft round glow (the bullet heads in bullet time). */
function glowTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,235,1)");
  g.addColorStop(0.2, "rgba(255,225,150,0.85)");
  g.addColorStop(0.55, "rgba(255,150,60,0.25)");
  g.addColorStop(1, "rgba(255,120,40,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Soft round blot for the blood spray (white: the instance colour tints it). */
function blotTexture(soft: boolean): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (soft) {
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.35, "rgba(255,255,255,0.55)");
    g.addColorStop(0.7, "rgba(255,255,255,0.18)");
    g.addColorStop(1, "rgba(255,255,255,0)");
  } else {
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.55, "rgba(255,255,255,0.95)");
    g.addColorStop(0.8, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
  }
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Camera-facing blood sprites: per-instance colour and a per-instance fade (the "fade" attribute). */
function spritePool(soft: boolean, n: number): { pool: Pool; fade: InstancedBufferAttribute } {
  const geo = new PlaneGeometry(1, 1);
  const fade = new InstancedBufferAttribute(new Float32Array(n), 1);
  geo.setAttribute("fade", fade);
  const mat = new MeshBasicNodeMaterial({ map: blotTexture(soft), transparent: true, depthWrite: false });
  mat.opacityNode = attribute("fade", "float");
  const pool = new Pool(geo, mat, n);
  const white = new Color(1, 1, 1);
  for (let i = 0; i < n; i++) pool.mesh.setColorAt(i, white); // instanceColor exists before the first compile
  return { pool, fade };
}

const m4 = new Matrix4();
const q = new Quaternion();
const qInv = new Quaternion();
const vc = new Vector3();
const camP = new Vector3();
const col = new Color();
const qCam = new Quaternion();
const qSpin = new Quaternion();
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
    // bullet-time bullets: additive (never an opaque card), white x the shooter's colour per instance
    const bullets = new Pool(unit, glow("#ffffff", true, 1, 3), 64);
    const trails = new Pool(unit, glow("#ffffff", true, 0.6, 2.2), 64);
    const flashes = new Pool(new PlaneGeometry(1, 1), flashMaterial(), 16);
    const heads = new Pool(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: glowTexture(), color: "#ffffff", toneMapped: false, transparent: true, blending: AdditiveBlending, depthWrite: false }), 64);
    const white = new Color(1, 1, 1);
    for (const P of [bullets, trails, heads, flashes]) for (let i = 0; i < P.items.length; i++) P.mesh.setColorAt(i, white); // instanceColor before the first compile
    // blood: a red spray of small droplets (fading, stretched along their flight) + a soft mist that
    // blooms out and thins away. Normal blending, no glow: it reads as blood in the neon.
    const drops = spritePool(false, 240);
    const mists = spritePool(true, 48);
    const blood = drops.pool, mist = mists.pool;
    blood.mesh.renderOrder = 2;
    mist.mesh.renderOrder = 1;
    const sparks = new Pool(unit, glow("#ffffff"), 120);
    for (let i = 0; i < sparks.items.length; i++) sparks.mesh.setColorAt(i, white);
    const holes = new Pool(unit, new MeshStandardMaterial({ color: "#050505", roughness: 1 }), 120);
    const splats = new Pool(new CylinderGeometry(0.5, 0.5, 1, 10), new MeshStandardMaterial({ color: "#5c0710", roughness: 0.5 }), 60);
    for (const p of [tracers, bullets, trails, heads, flashes, blood, mist, sparks, holes, splats]) group.add(p.mesh);
    // one flash light for the player's guns (gold), one for the gang's (red); a fixed light count: no shader rebuilds
    const lights = [new PointLight("#ffc46b", 0, 7, 2), new PointLight("#ff3a24", 0, 7, 2)];
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
    const boxGeo = new BoxGeometry(0.22, 0.12, 0.14);
    const ammoMat = { shotgun: new MeshStandardMaterial({ color: "#8c1d1d", roughness: 0.5, emissive: new Color("#3a0808") }), smgs: new MeshStandardMaterial({ color: "#2b2f36", roughness: 0.5, emissive: new Color("#1c140a") }) };
    const brass = new MeshStandardMaterial({ color: "#c9a045", roughness: 0.3, metalness: 0.7, emissive: new Color("#3a2a0c") });
    const out = { group, tracers, bullets, trails, heads, flashes, blood, mist, dropFade: drops.fade, mistFade: mists.fade, sparks, holes, splats, lights, lightT, pickups, canGeo, capGeo, canMat, capMat, boxGeo, ammoMat, brass, exit, run: -1, pickupN: 0 };
    if (import.meta.env.MODE !== "production") (window as unknown as { __fx?: unknown }).__fx = out; // dev / test: inspect the pools
    return out;
  }, []);

  // pickups follow the game's list (rebuilt on restart; drops at a body are added as they land)
  const pickupMesh = (item: string): Group => {
    const g = new Group();
    if (item === "shotgun") {
      const gun = makeShotgun();
      gun.scale.set(1.2, 1.2, 0.8);
      gun.rotation.set(0, 0, Math.PI / 2);
      g.add(gun);
    } else if (item === "smgs") {
      const a = makeSmg(), b = makeSmg();
      a.scale.setScalar(1.3); b.scale.setScalar(1.3);
      a.position.x = -0.07; b.position.x = 0.07; b.rotation.y = 0.5;
      g.add(a, b);
    } else if (item === "shotgun_ammo" || item === "smgs_ammo") {
      const box = new Mesh(fx.boxGeo, item === "shotgun_ammo" ? fx.ammoMat.shotgun : fx.ammoMat.smgs);
      const top = new Mesh(fx.capGeo, fx.brass);
      top.scale.set(0.6, 0.5, 0.6);
      top.position.y = 0.08;
      g.add(box, top);
    } else {
      const can = new Mesh(fx.canGeo, fx.canMat);
      const cap = new Mesh(fx.capGeo, fx.capMat);
      cap.position.y = 0.16;
      g.add(can, cap);
    }
    g.userData.item = item;
    return g;
  };
  const syncPickups = () => {
    for (const g of fx.pickups.values()) fx.group.remove(g);
    fx.pickups.clear();
    for (const k of s.game.pickups) {
      const g = pickupMesh(k.item);
      g.position.set(k.x, k.y + 0.35, k.z);
      fx.group.add(g);
      fx.pickups.set(k.id, g);
    }
    fx.pickupN = s.game.pickups.length;
  };

  useEffect(() => {
    const tmpA = new Vector3(), tmpB = new Vector3();
    const onEvent = (e: GameEvent) => {
      switch (e.type) {
        case "shot": {
          if (e.pellet > 0) break; // one flash per blast
          const muzzle = e.shooter === -1 ? playerMuzzles[e.hand] : enemyMuzzles[e.shooter];
          const from = muzzle && muzzle.lengthSq() > 0 ? muzzle : tmpA.set(e.ox, e.oy, e.oz);
          // flash (gold for him, red for them) + light
          const me = e.shooter === -1;
          const f = fx.flashes.spawn(0.05);
          f.p.copy(from);
          f.v.set(0, 0, 0);
          f.s = (me ? 0.34 : 0.3) * (e.weapon === "shotgun" ? 1.35 : e.weapon === "smgs" || e.weapon === "smg" ? 0.8 : 1);
          const c = me ? GUNFIRE.player : GUNFIRE.enemy;
          fx.flashes.mesh.setColorAt(fx.flashes.last, col.setRGB(c[0], c[1], c[2]));
          if (fx.flashes.mesh.instanceColor) fx.flashes.mesh.instanceColor.needsUpdate = true;
          const li = me ? 0 : 1;
          fx.lights[li].position.copy(from);
          fx.lightT[li] = 0.06;
          if (!e.projectile && !lookOwns.tracers) {
            const t = fx.tracers.spawn(0.07);
            t.a.copy(from);
            t.b.set(e.ex, e.ey, e.ez);
          }
          break;
        }
        case "blood": {
          const heavy = e.target >= 0 && s.game.enemies[e.target]?.kind === "heavy";
          const n = heavy ? 20 : 16;
          for (let i = 0; i < n; i++) {
            fx.blood.spawn(0.3 + Math.random() * 0.3);
            const idx = fx.blood.last;
            const b = fx.blood.items[idx];
            b.p.set(e.x, e.y, e.z);
            // most spray out of the exit side, a little back toward the shooter
            const back = i < 4 ? -0.7 : 1;
            const sp = 1.8 + Math.random() * 2.6;
            b.v.set(e.dx * back * sp + (Math.random() - 0.5) * 2.4, (Math.random() - 0.15) * 2.4, e.dz * back * sp + (Math.random() - 0.5) * 2.4);
            b.s = 0.045 + Math.random() * 0.055;
            fx.blood.mesh.setColorAt(idx, col.setRGB(0.62 + Math.random() * 0.25, 0.01 + Math.random() * 0.03, 0.02 + Math.random() * 0.03, SRGBColorSpace));
          }
          for (let i = 0; i < 2; i++) {
            fx.mist.spawn(0.28 + Math.random() * 0.14);
            const idx = fx.mist.last;
            const m = fx.mist.items[idx];
            m.p.set(e.x + e.dx * 0.08 * i, e.y, e.z + e.dz * 0.08 * i);
            m.v.set(e.dx * (0.4 + i * 0.5), 0.15, e.dz * (0.4 + i * 0.5));
            m.s = (0.24 + Math.random() * 0.12) * (heavy ? 1.3 : 1);
            m.a.x = Math.random() * Math.PI * 2; // spin
            fx.mist.mesh.setColorAt(idx, col.setRGB(0.78 + Math.random() * 0.14, 0.03, 0.05, SRGBColorSpace));
          }
          if (fx.blood.mesh.instanceColor) fx.blood.mesh.instanceColor.needsUpdate = true;
          if (fx.mist.mesh.instanceColor) fx.mist.mesh.instanceColor.needsUpdate = true;
          if (e.target >= 0) useUi.setState({ hitAt: performance.now() });
          break;
        }
        case "impact": {
          // his shots land in gold sparks; the gang's misses only kick up a little dull grit
          const me = e.shooter === -1;
          const c = me ? GUNFIRE.player : GUNFIRE.grit;
          for (let i = 0; i < (me ? 6 : 3); i++) {
            const k = fx.sparks.spawn(0.18 + Math.random() * 0.12);
            k.p.set(e.x, e.y, e.z);
            k.v.set(e.nx * 3 + (Math.random() - 0.5) * 5, e.ny * 3 + Math.random() * 3, e.nz * 3 + (Math.random() - 0.5) * 5);
            k.s = me ? 0.018 : 0.014;
            fx.sparks.mesh.setColorAt(fx.sparks.last, col.setRGB(c[0] * (me ? 1.3 : 1), c[1] * (me ? 1.3 : 1), c[2] * (me ? 1.3 : 1)));
          }
          if (fx.sparks.mesh.instanceColor) fx.sparks.mesh.instanceColor.needsUpdate = true;
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

  useFrame((state, rawDelta) => {
    const g = s.game;
    const dt = Math.min(rawDelta, 0.1);
    const wdt = s.paused ? 0 : dt * g.timeScale;
    const camQ = state.camera.getWorldQuaternion(qCam);
    if (fx.run !== s.run) {
      fx.run = s.run;
      for (const p of [fx.tracers, fx.bullets, fx.trails, fx.heads, fx.flashes, fx.blood, fx.mist, fx.sparks, fx.holes, fx.splats]) p.clear();
      syncPickups();
    }
    if (fx.pickupN !== g.pickups.length) syncPickups(); // a drop landed
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
    const camPos = state.camera.getWorldPosition(camP);
    {
      const B = fx.bullets, T = fx.trails, H = fx.heads;
      let n = 0;
      /** close = the kill cam's bullet, a metre in front of the chase lens: a slim slug and a hairline
       *  trail at a third of the brightness (full size it filled the frame as a flat white bar). */
      const put = (x: number, y: number, z: number, dx: number, dy: number, dz: number, trail: number, c: readonly number[], glow = 0.24, near = 1, close = false) => {
        if (n >= B.items.length || near <= 0.02) return;
        m4.compose(vd.set(x, y, z), camQ, vs.set(glow * near, glow * near, 1));
        H.mesh.setMatrixAt(n, m4);
        // a fat slug with a long hot trail: readable in bullet time from across the street
        const a = vs.set(x - dx * (close ? 0.04 : 0.1), y - dy * (close ? 0.04 : 0.1), z - dz * (close ? 0.04 : 0.1)).clone();
        const b = new Vector3(x + dx * (close ? 0.03 : 0.05), y + dy * (close ? 0.03 : 0.05), z + dz * (close ? 0.03 : 0.05));
        segment(B.mesh, n, a, b, (close ? 0.012 : 0.04) * near);
        segment(T.mesh, n, new Vector3(x - dx * trail, y - dy * trail, z - dz * trail), a, (close ? 0.003 : 0.026) * near);
        const k = close ? 0.35 : 1;
        col.setRGB(c[0] * k, c[1] * k, c[2] * k);
        B.mesh.setColorAt(n, col);
        T.mesh.setColorAt(n, col);
        H.mesh.setColorAt(n, col);
        n++;
      };
      for (const b of g.projectiles) {
        const travelled = Math.sqrt((b.x - b.sx) ** 2 + (b.y - b.sy) ** 2 + (b.z - b.sz) ** 2);
        // fades out inside ~3 m of the lens (his own bullets leave the muzzle right in front of it)
        const near = Math.min(1, Math.max(0, (vd.set(b.x, b.y, b.z).distanceTo(camPos) - 1.2) / 1.8));
        // shotgun pellets: small heads and short, thin streaks (8 of them in the air at once)
        const pellet = b.weapon === "shotgun";
        put(b.x, b.y, b.z, b.dx, b.dy, b.dz, Math.min(pellet ? 1.6 : 5, travelled), b.shooter === -1 ? GUNFIRE.player : GUNFIRE.enemy, pellet ? 0.1 : 0.24, near * (pellet ? 0.45 : 1));
      }
      const k = g.killcam;
      if (k && k.t < k.flight) {
        const f = k.t / k.flight;
        let dx = k.to.x - k.from.x, dy = k.to.y - k.from.y, dz = k.to.z - k.from.z;
        const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        dx /= l; dy /= l; dz /= l;
        put(k.from.x + (k.to.x - k.from.x) * f, k.from.y + (k.to.y - k.from.y) * f, k.from.z + (k.to.z - k.from.z) * f, dx, dy, dz, Math.min(0.3, l * f), GUNFIRE.player, 0.05, 1, true); // the chase cam rides 0.9 m back: the trail stops well short of the lens
      }
      for (let i = n; i < B.items.length; i++) { B.mesh.setMatrixAt(i, HIDE); T.mesh.setMatrixAt(i, HIDE); H.mesh.setMatrixAt(i, HIDE); }
      for (const P of [B, T, H]) {
        P.mesh.instanceMatrix.needsUpdate = true;
        if (n && P.mesh.instanceColor) P.mesh.instanceColor.needsUpdate = true;
      }
    }
    // flashes + lights (world time: bullet time holds them longer)
    {
      const P = fx.flashes;
      P.items.forEach((f, i) => {
        if (!f.alive) return;
        f.life += wdt;
        if (f.life >= f.max) { f.alive = false; P.mesh.setMatrixAt(i, HIDE); return; }
        // a camera-facing star, spun a little each frame, shrinking over its life; right at the lens
        // (his own guns, ~1 m out) it is capped so it never covers the view
        const k = (1 - 0.6 * (f.life / f.max)) * Math.min(1, (0.1 * f.p.distanceTo(camPos)) / f.s);
        if (f.v.x === 0) f.v.x = 0.001 + Math.random() * 6.28;
        q.copy(camQ).multiply(qSpin.setFromAxisAngle(Z, f.v.x));
        m4.compose(f.p, q, vs.set(f.s * k, f.s * k, 1));
        P.mesh.setMatrixAt(i, m4);
      });
      P.mesh.instanceMatrix.needsUpdate = true;
      fx.lights.forEach((l, i) => {
        fx.lightT[i] = Math.max(0, fx.lightT[i] - wdt);
        l.intensity = fx.lightT[i] > 0 ? 18 * (fx.lightT[i] / 0.06) : 0;
      });
    }
    // blood spray: camera-facing droplets stretched along their flight, fading out as they fall; far
    // away they grow a little so a hit across the street still reads
    qInv.copy(camQ).invert();
    const farK = (p: Vector3) => Math.max(1, p.distanceTo(camPos) / 7);
    {
      const P = fx.blood, F = fx.dropFade.array as Float32Array;
      P.items.forEach((b, i) => {
        if (!b.alive) return;
        b.life += wdt;
        if (b.life >= b.max) { b.alive = false; F[i] = 0; P.mesh.setMatrixAt(i, HIDE); return; }
        b.v.y -= 9 * wdt;
        b.v.multiplyScalar(Math.max(0, 1 - 1.5 * wdt)); // air drag
        b.p.addScaledVector(b.v, wdt);
        const k = b.life / b.max;
        vc.copy(b.v).applyQuaternion(qInv);
        const along = Math.hypot(vc.x, vc.y);
        q.copy(camQ).multiply(qSpin.setFromAxisAngle(Z, Math.atan2(vc.y, vc.x)));
        const sc = b.s * (1 - 0.35 * k) * farK(b.p);
        m4.compose(b.p, q, vs.set(sc * (1 + Math.min(2.2, along * 0.35)), sc, 1));
        P.mesh.setMatrixAt(i, m4);
        F[i] = 0.95 * (1 - k * k);
      });
      P.mesh.instanceMatrix.needsUpdate = true;
      fx.dropFade.needsUpdate = true;
    }
    // blood mist: a soft red cloud that swells and thins away
    {
      const P = fx.mist, F = fx.mistFade.array as Float32Array;
      P.items.forEach((m, i) => {
        if (!m.alive) return;
        m.life += wdt;
        if (m.life >= m.max) { m.alive = false; F[i] = 0; P.mesh.setMatrixAt(i, HIDE); return; }
        m.v.multiplyScalar(Math.max(0, 1 - 3 * wdt));
        m.p.addScaledVector(m.v, wdt);
        const k = m.life / m.max;
        const sc = m.s * (1 + 1.4 * Math.sqrt(k)) * farK(m.p);
        q.copy(camQ).multiply(qSpin.setFromAxisAngle(Z, m.a.x + k * 0.6));
        m4.compose(m.p, q, vs.set(sc, sc, 1));
        P.mesh.setMatrixAt(i, m4);
        F[i] = 0.7 * (1 - k) * (1 - k);
      });
      P.mesh.instanceMatrix.needsUpdate = true;
      fx.mistFade.needsUpdate = true;
    }
    // sparks
    {
      const P = fx.sparks;
      P.items.forEach((b, i) => {
        if (!b.alive) return;
        b.life += wdt;
        if (b.life >= b.max) { b.alive = false; P.mesh.setMatrixAt(i, HIDE); return; }
        b.v.y -= 12 * wdt;
        b.p.addScaledVector(b.v, wdt);
        const sc = b.s * (1 - (b.life / b.max) * 0.6);
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
