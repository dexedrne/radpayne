// Pickups (arsenal spec 2.2), walked over Max Payne style: guns lie flat on the ground on their side, each
// turned by a hash of its id, with a thin gold rim (an inverted hull, the player's colour code) that
// breathes at 1.2 Hz and a faint additive halo on the ground under it; ammo boxes and grenades the same.
// Copium keeps its upright orange canister (bobbing, turning). The Radbro Webring pins stand upright and
// turn slowly, the Radbro's portrait on a disc with a rim in his roster colour. A gun dropped from a perch
// falls and tumbles for 0.3 s (world time). Rim and halo stay under the bloom threshold.
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, BackSide, BoxGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  SRGBColorSpace, TextureLoader, type Object3D,
} from "three";
import type { Session } from "./session.ts";
import { FRAME } from "./frame.ts";
import { makeAk, makeGrenade, makeHandCannon, makePistol, makeSawedOff, makeShotgun, makeSmg, makeSniper } from "./guns.ts";
import { RADBROS } from "../ui/store.ts";

/** Breathing rim (additive gold) and the ground halo; both stay dim (the club's bloom cap). */
const RIM = { color: "#ffc46b", lo: 0.12, hi: 0.3, hz: 1.2, hull: 1.14 };
const hullMat = new MeshBasicMaterial({ color: RIM.color, side: BackSide, transparent: true, opacity: RIM.hi, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
hullMat.userData.rpOwn = true;
let haloTex: CanvasTexture | null = null;
function halo(): CanvasTexture {
  if (haloTex) return haloTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,196,107,0.9)");
  r.addColorStop(0.45, "rgba(255,196,107,0.35)");
  r.addColorStop(1, "rgba(255,196,107,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  haloTex = new CanvasTexture(c);
  haloTex.colorSpace = SRGBColorSpace;
  return haloTex;
}
const haloMat = () => {
  const m = new MeshBasicMaterial({ map: halo(), transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  m.userData.rpOwn = true;
  return m;
};
const haloGeo = new CircleGeometry(0.55, 24);

const canGeo = new CylinderGeometry(0.09, 0.09, 0.26, 12);
const capGeo = new CylinderGeometry(0.1, 0.1, 0.06, 12);
const canMat = new MeshStandardMaterial({ color: "#ff8a1f", roughness: 0.4, emissive: new Color("#ff6a00"), emissiveIntensity: 0.6 });
const capMat = new MeshStandardMaterial({ color: "#f4f4f4", roughness: 0.5 });
const boxGeo = new BoxGeometry(0.22, 0.12, 0.14);
const brass = new MeshStandardMaterial({ color: "#c9a045", roughness: 0.3, metalness: 0.7, emissive: new Color("#3a2a0c") });
const AMMO: Record<string, string> = { shotgun: "#8c1d1d", sawedoff: "#6b2412", smgs: "#2b2f36", handcannon: "#3d4452", rifle: "#4a3a22", sniper: "#3b4a37" };
const ammoMats = new Map<string, MeshStandardMaterial>();
const ammoMat = (k: string) => {
  let m = ammoMats.get(k);
  if (!m) { m = new MeshStandardMaterial({ color: AMMO[k] ?? "#2b2f36", roughness: 0.5, emissive: new Color("#140e0a") }); ammoMats.set(k, m); }
  return m;
};
const pinGeo = new CylinderGeometry(0.075, 0.075, 0.012, 24);
const pinRimGeo = new CylinderGeometry(0.086, 0.086, 0.01, 24);
const pinFace = new Map<string, MeshBasicMaterial>();

/** Deterministic 0..1 from a string (each pickup's turn on the ground). */
function h01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/** A gold inverted hull on every mesh under `o` (the glowing edge). */
function rim(o: Object3D): void {
  const meshes: Mesh[] = [];
  o.traverse(m => { if ((m as Mesh).isMesh && !m.userData.rpHull) meshes.push(m as Mesh); });
  for (const m of meshes) {
    const h = new Mesh(m.geometry, hullMat);
    h.userData.rpHull = true;
    h.scale.setScalar(RIM.hull);
    h.renderOrder = 2;
    m.add(h);
  }
}

type Kind = "gun" | "can" | "pin";
function build(item: string, amount: number, pin?: string): { g: Group; kind: Kind } {
  const g = new Group();
  const inner = new Group();
  g.add(inner);
  let kind: Kind = "gun";
  const base = item.replace(/_ammo$/, "");
  if (item === "copium") {
    const can = new Mesh(canGeo, canMat);
    const cap = new Mesh(capGeo, capMat);
    cap.position.y = 0.16;
    inner.add(can, cap);
    kind = "can";
  } else if (item === "pin") {
    kind = "pin";
    const bro = RADBROS.find(b => b.id === pin) ?? RADBROS[0];
    let face = pinFace.get(bro.id);
    if (!face) {
      face = new MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
      face.userData.rpOwn = true;
      new TextureLoader().load(`/ui/radbro${bro.id}.webp`, t => { t.colorSpace = SRGBColorSpace; face!.map = t; face!.needsUpdate = true; });
      pinFace.set(bro.id, face);
    }
    const rimMat = new MeshBasicMaterial({ color: bro.color, toneMapped: false });
    rimMat.userData.rpOwn = true;
    const disc = new Mesh(pinGeo, [rimMat, face, face]);
    disc.rotation.x = Math.PI / 2;
    const ring = new Mesh(pinRimGeo, rimMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.z = -0.002;
    inner.add(disc, ring);
    inner.scale.setScalar(1.6);
  } else if (item.endsWith("_ammo") || item === "pistol") {
    // a box of rounds (the gang's pistol: its 9 mm)
    if (item === "pistol") {
      const gun = makePistol();
      gun.scale.setScalar(1.3);
      gun.rotation.z = Math.PI / 2;
      inner.add(gun);
    } else {
      const box = new Mesh(boxGeo, ammoMat(base));
      const top = new Mesh(capGeo, brass);
      top.scale.set(0.6, 0.5, 0.6);
      top.position.y = 0.08;
      inner.add(box, top);
    }
  } else if (item === "grenade") {
    for (let i = 0; i < Math.max(1, Math.min(3, amount)); i++) {
      const f = makeGrenade();
      f.rotation.z = Math.PI / 2;
      f.position.set(-0.07 + i * 0.1, 0, (i % 2) * 0.06);
      f.scale.setScalar(1.3);
      inner.add(f);
    }
  } else {
    // a gun on its side
    const guns: Group[] = [];
    if (item === "shotgun") guns.push(makeShotgun());
    else if (item === "smgs" || item === "smg") { guns.push(makeSmg(), makeSmg()); }
    else if (item === "handcannon") guns.push(makeHandCannon());
    else if (item === "sawedoff") guns.push(makeSawedOff());
    else if (item === "rifle") guns.push(makeAk());
    else if (item === "sniper") guns.push(makeSniper());
    else guns.push(makePistol());
    guns.forEach((gun, i) => {
      gun.rotation.z = Math.PI / 2;
      const long = item === "shotgun" || item === "rifle" || item === "sniper";
      gun.scale.set(long ? 1.35 : 1.4, long ? 1.35 : 1.4, long ? 1 : 1.4);
      gun.position.set(i * 0.16 - (guns.length - 1) * 0.08, 0, long ? -0.2 : 0);
      if (i === 1) gun.rotation.y = 0.5;
      inner.add(gun);
    });
  }
  if (kind !== "pin") rim(inner);
  if (kind === "gun") {
    const h = new Mesh(haloGeo, haloMat());
    h.rotation.x = -Math.PI / 2;
    h.position.y = 0.012;
    g.add(h);
  }
  inner.traverse(o => { o.frustumCulled = false; });
  return { g, kind };
}

type View = { g: Group; inner: Object3D; kind: Kind; fromY: number; t0: number; yaw: number };

export function PickupsView({ s }: { s: Session }) {
  const group = useMemo(() => new Group(), []);
  const views = useMemo(() => new Map<string, View>(), []);
  const st = useMemo(() => ({ run: -1, n: -1, falls: new Map<string, { fromY: number; t0: number }>() }), []);

  useEffect(() => s.on((e, ss) => {
    if (e.type === "drop" && e.fromY !== undefined && e.fromY - e.y > 0.6) st.falls.set(e.id, { fromY: e.fromY, t0: ss.game.time });
  }), [s, st]);

  const sync = () => {
    for (const v of views.values()) group.remove(v.g);
    views.clear();
    for (const k of s.game.pickups) {
      const { g, kind } = build(k.item, k.amount, k.pin);
      const yaw = h01(k.id) * Math.PI * 2;
      const fall = st.falls.get(k.id);
      g.position.set(k.x, k.y, k.z);
      group.add(g);
      views.set(k.id, { g, inner: g.children[0], kind, fromY: fall?.fromY ?? k.y, t0: fall?.t0 ?? -1e9, yaw });
    }
    st.n = s.game.pickups.length;
  };

  useFrame(() => {
    const g = s.game;
    if (st.run !== s.run) { st.run = s.run; st.falls.clear(); sync(); }
    if (st.n !== g.pickups.length) sync();
    const t = g.realTime;
    hullMat.opacity = RIM.lo + (RIM.hi - RIM.lo) * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * RIM.hz));
    for (const k of g.pickups) {
      const v = views.get(k.id);
      if (!v) continue;
      v.g.visible = !k.taken;
      if (k.taken) continue;
      if (v.kind === "can") {
        v.g.position.y = k.y + 0.35 + Math.sin(t * 2.2 + k.x) * 0.06;
        v.inner.rotation.set(0, t * 1.6, 0.35);
      } else if (v.kind === "pin") {
        v.g.position.y = k.y + 0.55 + Math.sin(t * 1.7 + k.z) * 0.03;
        v.inner.rotation.set(0, t * 0.9, 0);
      } else {
        // flat on the ground (a drop off a perch falls and tumbles first, on world time)
        const u = Math.min(1, (g.time - v.t0) / 0.3);
        const y = u < 1 ? v.fromY + (k.y - v.fromY) * u * u : k.y;
        v.g.position.y = y + 0.05;
        v.inner.rotation.set(u < 1 ? (1 - u) * 5 : 0, v.yaw, 0);
      }
    }
  }, FRAME.fx);

  useEffect(() => () => { for (const v of views.values()) group.remove(v.g); }, [group, views]);
  return <primitive object={group} />;
}

