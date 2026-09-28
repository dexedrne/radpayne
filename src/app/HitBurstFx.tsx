// Comic-noir impact bursts where HIS rounds land on a body (not on walls: those keep FxView's gold
// sparks): ink flecks thrown out along the round's way, paper-white streaks (gold on a headshot) that
// flare out and thin, a few hot sparks, a halftone "pow" star on the big guns (and a headshot kill),
// and a thin ring on a kill. Sized by the gun (hitfeel.ts burstOf), counts by the graphics preset
// (burstBudget), strength by Hit feedback. Three instanced camera-facing sprite pools (no per-hit
// allocation, one draw each). They age on world time with a floor (bullet time draws them out, a kill
// cam's crawl does not freeze them); a burst on a body the kill cam holds waits until her round lands.
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, CanvasTexture, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, NormalBlending, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3, type Blending } from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { attribute } from "three/tsl";
import type { Session } from "./session.ts";
import { FRAME } from "./frame.ts";
import { cine } from "./cine.ts";
import { burstBudget, burstOf, type Hit } from "./hitfeel.ts";
import { useGfx } from "./look/gfx.ts";

const HIDE = new Matrix4().makeScale(0, 0, 0);
const Z = new Vector3(0, 0, 1);

type P = { alive: boolean; life: number; max: number; p: Vector3; v: Vector3; s: number; grow: number; spin: number; rot: number; stretch: boolean; drag: number; g: number; wait: number; a0: number };

class Sprites {
  readonly mesh: InstancedMesh;
  readonly fade: InstancedBufferAttribute;
  readonly items: P[];
  private next = 0;
  last = 0;
  constructor(map: CanvasTexture, n: number, blending: Blending) {
    const geo = new PlaneGeometry(1, 1);
    this.fade = new InstancedBufferAttribute(new Float32Array(n), 1);
    geo.setAttribute("fade", this.fade);
    const mat = new MeshBasicNodeMaterial({ map, transparent: true, depthWrite: false, blending });
    mat.opacityNode = attribute("fade", "float");
    mat.toneMapped = false;
    mat.fog = false;
    mat.userData.rpOwn = true;
    this.mesh = new InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    const white = new Color(1, 1, 1);
    this.items = Array.from({ length: n }, (_, i) => {
      this.mesh.setMatrixAt(i, HIDE);
      this.mesh.setColorAt(i, white);
      return { alive: false, life: 0, max: 1, p: new Vector3(), v: new Vector3(), s: 1, grow: 0, spin: 0, rot: 0, stretch: false, drag: 0, g: 0, wait: -1, a0: 1 };
    });
  }
  spawn(max: number): P {
    const it = this.items[this.next];
    this.last = this.next;
    this.next = (this.next + 1) % this.items.length;
    Object.assign(it, { alive: true, life: 0, max, s: 1, grow: 0, spin: 0, rot: Math.random() * Math.PI * 2, stretch: false, drag: 0, g: 0, wait: -1, a0: 1 });
    it.v.set(0, 0, 0);
    return it;
  }
  clear(): void {
    const F = this.fade.array as Float32Array;
    for (let i = 0; i < this.items.length; i++) { this.items[i].alive = false; F[i] = 0; this.mesh.setMatrixAt(i, HIDE); }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.fade.needsUpdate = true;
  }
}

function canvas(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A tapered streak (a comet: hot head at +x, thin tail): white, tinted per instance. */
const streakTex = () => canvas(64, 16, x => {
  const g = x.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.55, "rgba(255,255,255,0.75)");
  g.addColorStop(0.9, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(0, 8);
  x.quadraticCurveTo(40, 2, 58, 3);
  x.quadraticCurveTo(64, 8, 58, 13);
  x.quadraticCurveTo(40, 14, 0, 8);
  x.fill();
});

/** An ink blot with a couple of satellite drops (black ink flecks: normal blending). */
const inkTex = () => canvas(32, 32, x => {
  x.fillStyle = "#fff";
  x.beginPath(); x.ellipse(16, 16, 10, 7, 0.3, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(27, 9, 3, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(6, 26, 2, 0, Math.PI * 2); x.fill();
});

/** The "pow" star: a jagged comic burst, cream with red halftone dots, an ink keyline. */
const starTex = () => canvas(128, 128, x => {
  const pts: Array<[number, number]> = [];
  const N = 12;
  for (let i = 0; i < N * 2; i++) {
    const a = (i / (N * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 30 + (i % 4 === 1 ? 4 : 0) : 58 - (i % 6 === 0 ? 0 : 7);
    pts.push([64 + Math.cos(a) * r, 64 + Math.sin(a) * r]);
  }
  const path = () => { x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath(); };
  path();
  x.fillStyle = "#fff3d2";
  x.fill();
  x.save();
  path();
  x.clip();
  x.fillStyle = "#ff3148";
  for (let py = 4; py < 128; py += 7) for (let px = 4 + ((py / 7) % 2) * 3.5; px < 128; px += 7) {
    const d = Math.hypot(px - 64, py - 64);
    const r = Math.max(0, (d - 14) / 44) * 2.8;
    if (r > 0.3) { x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill(); }
  }
  x.restore();
  path();
  x.lineWidth = 5;
  x.lineJoin = "miter";
  x.strokeStyle = "#0b0a0d";
  x.stroke();
});

/** A thin ring (the kill's shockwave): white, tinted. */
const ringTex = () => canvas(128, 128, x => {
  x.strokeStyle = "#fff";
  x.lineWidth = 7;
  x.beginPath(); x.arc(64, 64, 54, 0, Math.PI * 2); x.stroke();
});

const m4 = new Matrix4();
const q = new Quaternion();
const qs = new Quaternion();
const qInv = new Quaternion();
const qCam = new Quaternion();
const vs = new Vector3();
const vc = new Vector3();
const camP = new Vector3();
const col = new Color();

/** Bursts to spawn (the dispatcher pushes, the frame spawns them with the camera at hand). */
export const burstQueue: Array<{ h: Hit; k: number }> = [];

export function HitBurstFx({ s }: { s: Session }) {
  const fx = useMemo(() => {
    const add = new Sprites(streakTex(), 160, AdditiveBlending);
    const ink = new Sprites(inkTex(), 120, NormalBlending);
    const star = new Sprites(starTex(), 12, NormalBlending);
    const ring = new Sprites(ringTex(), 12, AdditiveBlending);
    ink.mesh.renderOrder = 6;
    return { add, ink, star, ring, all: [ink, add, star, ring], run: -1 };
  }, []);

  useEffect(() => () => { for (const p of fx.all) { p.mesh.geometry.dispose(); (p.mesh.material as MeshBasicNodeMaterial).map?.dispose(); (p.mesh.material as MeshBasicNodeMaterial).dispose(); } }, [fx]);

  useFrame((state, raw) => {
    const dt = Math.min(raw, 0.1);
    if (fx.run !== s.run) { fx.run = s.run; for (const p of fx.all) p.clear(); burstQueue.length = 0; }
    const cam = state.camera;
    const camPos = cam.getWorldPosition(camP);
    const camQ = cam.getWorldQuaternion(qCam);
    // spawn
    if (burstQueue.length) {
      const gfx = useGfx.getState();
      const B = burstBudget(gfx.preset, gfx.lite);
      for (const { h, k } of burstQueue.splice(0)) {
        const b = burstOf(h);
        const n = (c: number) => Math.max(1, Math.round(c * B.count * Math.min(1, 0.4 + 0.6 * k)));
        // pulled toward the lens a little: never half inside her body
        const base = vs.set(h.x, h.y, h.z).sub(camPos);
        const dist = base.length();
        base.multiplyScalar(Math.max(0, 1 - 0.14 / Math.max(0.2, dist))).add(camPos);
        const far = Math.max(1, dist / 8) * b.size;
        const wait = cine.holds(h.target) ? h.target : -1;
        const gold = h.headshot;
        const dx = h.dx, dy = h.dy, dz = h.dz;
        for (let i = 0; i < n(b.ink); i++) {
          const it = fx.ink.spawn(0.28 + Math.random() * 0.22);
          it.p.copy(base);
          const sp = 2 + Math.random() * 3.2;
          it.v.set(dx * sp + (Math.random() - 0.5) * 3, dy * sp + (Math.random() - 0.2) * 2.6, dz * sp + (Math.random() - 0.5) * 3);
          it.s = (0.05 + Math.random() * 0.06) * far;
          it.stretch = true; it.drag = 2; it.g = 9; it.wait = wait; it.a0 = 0.95;
          fx.ink.mesh.setColorAt(fx.ink.last, col.setRGB(0.015, 0.012, 0.02));
        }
        for (let i = 0; i < n(b.streaks); i++) {
          const it = fx.add.spawn(0.1 + Math.random() * 0.08);
          it.p.copy(base);
          // flaring out in a cone around the round's way and back toward him (a splash, not a jet)
          const back = i % 3 === 0 ? -0.6 : 1;
          const sp = 4 + Math.random() * 5;
          it.v.set(dx * back * sp + (Math.random() - 0.5) * 6, dy * sp + (Math.random() - 0.35) * 5, dz * back * sp + (Math.random() - 0.5) * 6);
          it.s = (0.07 + Math.random() * 0.05) * far;
          it.stretch = true; it.drag = 7; it.g = 2; it.wait = wait; it.a0 = 1;
          if (gold) col.setRGB(2.2, 1.6, 0.45); else col.setRGB(2.0, 1.9, 1.75);
          fx.add.mesh.setColorAt(fx.add.last, col);
        }
        for (let i = 0; i < n(b.sparks); i++) {
          const it = fx.add.spawn(0.14 + Math.random() * 0.14);
          it.p.copy(base);
          const sp = 3 + Math.random() * 4;
          it.v.set((Math.random() - 0.5) * sp * 1.6 - dx * 1.5, Math.random() * sp * 0.9, (Math.random() - 0.5) * sp * 1.6 - dz * 1.5);
          it.s = 0.03 * far;
          it.stretch = true; it.drag = 1.2; it.g = 12; it.wait = wait; it.a0 = 1;
          fx.add.mesh.setColorAt(fx.add.last, col.setRGB(2.6, 2.0, 1.0));
        }
        if (b.star && B.star) {
          const it = fx.star.spawn(0.2);
          it.p.copy(base);
          it.s = 0.32 * far * (h.kind === "kill" ? 1.15 : 1) * Math.min(1, 0.5 + 0.5 * k);
          it.spin = (Math.random() - 0.5) * 3;
          it.wait = wait; it.a0 = 1;
          fx.star.mesh.setColorAt(fx.star.last, gold ? col.setRGB(1, 0.92, 0.6) : col.setRGB(1, 1, 1));
        }
        if (b.ring && B.ring) {
          const it = fx.ring.spawn(0.22);
          it.p.copy(base);
          it.s = 0.18 * far;
          it.grow = 5;
          it.wait = wait; it.a0 = 0.9;
          fx.ring.mesh.setColorAt(fx.ring.last, gold ? col.setRGB(2.2, 1.7, 0.5) : col.setRGB(2.2, 0.35, 0.3));
        }
      }
      for (const p of fx.all) if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
    // age + draw
    const wdt = s.paused ? 0 : dt * Math.max(0.3, s.viewScale);
    qInv.copy(camQ).invert();
    for (const P of fx.all) {
      const F = P.fade.array as Float32Array;
      let any = false;
      P.items.forEach((it, i) => {
        if (!it.alive) return;
        any = true;
        if (it.wait >= 0) {
          if (cine.holds(it.wait)) { P.mesh.setMatrixAt(i, HIDE); F[i] = 0; return; }
          it.wait = -1;
        }
        it.life += wdt;
        if (it.life >= it.max) { it.alive = false; F[i] = 0; P.mesh.setMatrixAt(i, HIDE); return; }
        const t = it.life / it.max;
        if (it.drag) it.v.multiplyScalar(Math.max(0, 1 - it.drag * wdt));
        it.v.y -= it.g * wdt;
        it.p.addScaledVector(it.v, wdt);
        let sx = it.s, sy = it.s;
        if (it.stretch) {
          // along its flight on screen, longer the faster it goes
          vc.copy(it.v).applyQuaternion(qInv);
          const along = Math.hypot(vc.x, vc.y);
          q.copy(camQ).multiply(qs.setFromAxisAngle(Z, Math.atan2(vc.y, vc.x)));
          sx = it.s * (1 + Math.min(4, along * 0.45)) * (1 - 0.4 * t);
          sy = it.s * (1 - 0.55 * t);
        } else {
          // the star pops (overshoot then settle), the ring expands
          const pop = it.grow ? 1 + it.grow * t : t < 0.25 ? 0.4 + 3.2 * t : 1.2 - 0.2 * Math.min(1, (t - 0.25) / 0.3);
          it.rot += it.spin * wdt;
          q.copy(camQ).multiply(qs.setFromAxisAngle(Z, it.rot));
          sx = sy = it.s * pop;
        }
        m4.compose(it.p, q, vs.set(sx, sy, 1));
        P.mesh.setMatrixAt(i, m4);
        F[i] = it.a0 * (it.grow ? (1 - t) * (1 - t) : t > 0.6 ? (1 - t) / 0.4 : 1);
      });
      if (any) { P.mesh.instanceMatrix.needsUpdate = true; P.fade.needsUpdate = true; }
    }
  }, FRAME.fx);

  return (
    <>
      {fx.all.map((p, i) => <primitive key={i} object={p.mesh} />)}
    </>
  );
}
