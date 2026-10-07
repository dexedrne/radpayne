// The easter eggs (arsenal spec 5), views only (the sim reports E near an interactive one):
//  - George, RadRun's cat, loafing on a crate in room 1's alley (render scale 1.16): E and he is happy
//    (Happy, a happy meow from the driver); a round landing within 4 m and he sulks (Sulk, a sulky meow).
//    He is never in the trace.
//  - the Solscape poster wheat-pasted over a club poster by the queue, a RadRun one-sheet over another:
//    rain-darkened, torn, graded down so they never outshine the neon.
//  - the RadRun arcade cabinet in room 2's vestibule: its screen pans the key art in attract mode under
//    the club's bloom cap; E and it plays a jingle and the screen flashes. The react-three-game sticker
//    on its side, and on a flight case in the coat room.
//  - the dev photo wall behind room 3's false wall: the Radbros' polaroids on cork, red string,
//    a red circle round the one being played; the labels are only the numbers.
import { assetUrl } from "./assets.ts";
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useAssetRuntime } from "react-three-game";
import {
  AnimationMixer, BoxGeometry, PointLight, CanvasTexture, Group, LoopOnce, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, TextureLoader,
  type AnimationAction, type AnimationClip, type Object3D, type Texture,
} from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Session } from "./session.ts";
import type { Marker } from "../world/level.ts";
import { FRAME } from "./frame.ts";
import { lightUp, loadOptional } from "./characters.ts";
import { RADBROS, useUi } from "../ui/store.ts";
import { sfxArsenal } from "../audio/sfx.ts";

const GEORGE = assetUrl("/models/george.glb");
const own = <T extends { userData: Record<string, unknown> }>(m: T): T => { m.userData.rpOwn = true; return m; };
const tex = (url: string): Texture => { const t = new TextureLoader().load(url); t.colorSpace = SRGBColorSpace; return t; };

/** The react-three-game / prnth sticker, drawn once: a die-cut white shape, a small cube mark, the names. */
let stickerTex: CanvasTexture | null = null;
function sticker(): CanvasTexture {
  if (stickerTex) return stickerTex;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4f1ea";
  g.beginPath();
  g.roundRect(8, 8, 240, 240, 38);
  g.fill();
  // the cube mark
  const cx = 128, cy = 92, r = 44;
  const pt = (a: number, k = r) => [cx + Math.cos(a) * k, cy + Math.sin(a) * k] as const;
  const face = (pts: (readonly [number, number])[], col: string) => { g.fillStyle = col; g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.closePath(); g.fill(); };
  const top = pt(-Math.PI / 2), ur = pt(-Math.PI / 6), lr = pt(Math.PI / 6), bot = pt(Math.PI / 2), ll = pt((5 * Math.PI) / 6), ul = pt((-5 * Math.PI) / 6);
  face([top, ur, [cx, cy], ul], "#3ff0ff");
  face([ul, [cx, cy], bot, ll], "#1b1b22");
  face([[cx, cy], ur, lr, bot], "#ff3d7f");
  g.fillStyle = "#1b1b22";
  g.font = "700 25px 'Courier Prime', monospace";
  g.textAlign = "center";
  g.fillText("react-three-game", 128, 176);
  g.font = "400 22px 'Courier Prime', monospace";
  g.fillText("prnth", 128, 208);
  stickerTex = new CanvasTexture(c);
  stickerTex.colorSpace = SRGBColorSpace;
  return stickerTex;
}
function stickerMesh(size = 0.16, glow = 0.25): Mesh {
  const m = new Mesh(new PlaneGeometry(size, size), own(new MeshStandardMaterial({ map: sticker(), roughness: 0.6, emissive: "#ffffff", emissiveMap: sticker(), emissiveIntensity: glow, transparent: true })));
  m.rotation.z = 0.12;
  return m;
}

/** A polaroid of one Radbro (frame, photo, his number; a red marker circle on the one being played). */
function polaroid(id: string, mark: boolean): Mesh {
  const c = document.createElement("canvas");
  c.width = 220; c.height = 260;
  const g = c.getContext("2d")!;
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const draw = (img?: HTMLImageElement) => {
    g.fillStyle = "#efeadf";
    g.fillRect(0, 0, 220, 260);
    g.fillStyle = "#1a1a1f";
    g.fillRect(14, 14, 192, 192);
    if (img) g.drawImage(img, 14, 14, 192, 192);
    g.fillStyle = "#23222a";
    g.font = "700 26px 'Courier Prime', monospace";
    g.textAlign = "center";
    g.fillText(`#${id}`, 110, 244);
    if (mark) { g.strokeStyle = "#d4161f"; g.lineWidth = 7; g.beginPath(); g.ellipse(110, 112, 104, 98, -0.1, 0, Math.PI * 2); g.stroke(); }
    t.needsUpdate = true;
  };
  draw();
  const img = new Image();
  img.onload = () => draw(img);
  img.src = assetUrl(`/ui/radbro${id}.webp`);
  const m = new Mesh(new PlaneGeometry(0.27, 0.32), own(new MeshStandardMaterial({ map: t, roughness: 0.8, emissive: "#ffffff", emissiveMap: t, emissiveIntensity: 0.18 })));
  return m;
}

function cork(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 160;
  const g = c.getContext("2d")!;
  g.fillStyle = "#8a6440";
  g.fillRect(0, 0, 256, 160);
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${40 + (i * 37) % 60},${25 + (i * 13) % 30},10,0.35)`; g.fillRect((i * 97) % 256, (i * 61) % 160, 2, 2); }
  g.strokeStyle = "#3a2716"; g.lineWidth = 10; g.strokeRect(0, 0, 256, 160);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

type Built = { root: Group; screen?: MeshBasicMaterial; flash?: number };

function build(m: Marker, playing: string): Built | null {
  const root = new Group();
  root.position.set(m.x, m.y, m.z);
  root.rotation.y = m.yaw;
  const egg = String(m.data.egg ?? "");
  if (egg === "poster-solscape" || egg === "poster-radrun") {
    const t = tex(assetUrl(`/textures/eggs/${egg}.webp`));
    const p = new Mesh(new PlaneGeometry(0.95, 1.34), own(new MeshStandardMaterial({ map: t, roughness: 0.95, alphaTest: 0.5, emissive: "#ffffff", emissiveMap: t, emissiveIntensity: 0.22, color: "#b8b2ac" })));
    p.rotation.z = egg === "poster-solscape" ? -0.02 : 0.015;
    root.add(p);
    return { root };
  }
  if (egg === "sticker") {
    // on the coat room's flight case: a size up and lit from within a little (the room is dim)
    root.add(stickerMesh(0.24, 0.55));
    return { root };
  }
  if (egg === "cabinet") {
    // an upright cabinet facing its yaw (+Z local): body, marquee, the attract screen, the panel, sticker
    const dark = own(new MeshStandardMaterial({ color: "#15141c", roughness: 0.6, emissive: "#07060a" }));
    const body = new Mesh(new BoxGeometry(0.76, 1.78, 0.78), dark);
    body.position.y = 0.89;
    const marquee = new Mesh(new BoxGeometry(0.7, 0.2, 0.06), own(new MeshBasicMaterial({ color: "#c2186a", toneMapped: false })));
    marquee.position.set(0, 1.62, 0.37);
    const screenMat = own(new MeshBasicMaterial({ map: tex(assetUrl("/textures/eggs/cabinet-screen.webp")), toneMapped: false, color: "#8a8a8a" }));
    screenMat.map!.repeat.set(0.62, 1);
    const screen = new Mesh(new PlaneGeometry(0.56, 0.42), screenMat);
    screen.position.set(0, 1.2, 0.395);
    screen.rotation.x = -0.18;
    const panel = new Mesh(new BoxGeometry(0.74, 0.08, 0.34), dark);
    panel.position.set(0, 0.92, 0.5);
    panel.rotation.x = 0.35;
    const stick = new Mesh(new BoxGeometry(0.03, 0.12, 0.03), own(new MeshBasicMaterial({ color: "#d9d9e0" })));
    stick.position.set(-0.15, 1.0, 0.52);
    const s2 = stickerMesh(0.2);
    s2.position.set(0.385, 1.25, 0.05);
    s2.rotation.y = Math.PI / 2;
    root.add(body, marquee, screen, panel, stick, s2);
    return { root, screen: screenMat, flash: 0 };
  }
  if (egg === "photowall") {
    const board = new Mesh(new PlaneGeometry(1.7, 1.06), own(new MeshStandardMaterial({ map: cork(), roughness: 0.9, emissive: "#3a2a1a", emissiveIntensity: 0.4 })));
    root.add(board);
    const spots: Array<[number, number]> = RADBROS.map((_, i) => [(i % 4 - 1.5) * 0.4, 0.24 - Math.floor(i / 4) * 0.48]);
    RADBROS.forEach((b, i) => {
      const p = polaroid(b.id, b.id === playing);
      p.position.set(spots[i][0], spots[i][1], 0.012 + i * 0.001);
      p.rotation.z = ((i * 7) % 5 - 2) * 0.04;
      root.add(p);
    });
    // red string between the photos (flat on the cork)
    const red = own(new MeshBasicMaterial({ color: "#b3121b" }));
    const links: Array<[number, number]> = [[0, 1], [1, 2], [0, 4], [4, 5], [3, 4], [1, 5], [2, 6], [5, 7]];
    for (const [a, b] of links) {
      const [ax, ay] = spots[a], [bx, by] = spots[b];
      const len = Math.hypot(bx - ax, by - ay);
      const str = new Mesh(new BoxGeometry(len, 0.006, 0.003), red);
      str.position.set((ax + bx) / 2, (ay + by) / 2 + 0.1, 0.02);
      str.rotation.z = Math.atan2(by - ay, bx - ax);
      root.add(str);
    }
    return { root };
  }
  return null;
}

type George = { root: Object3D; mixer: AnimationMixer; loaf: AnimationAction | null; happy: AnimationAction | null; sulk: AnimationAction | null; busy: number };

export function EggsView({ s }: { s: Session }) {
  const assets = useAssetRuntime();
  const playing = useUi(st => st.radbro);
  const eggs = useMemo(() => s.level.markers.filter(m => m.kind === "egg"), [s.level]);
  const group = useMemo(() => new Group(), []);
  const built = useMemo(() => {
    const out = new Map<string, Built>();
    for (const m of eggs) { const b = build(m, playing); if (b) { out.set(m.id, b); group.add(b.root); } }
    return out;
  }, [eggs, group, playing]);
  useEffect(() => () => { for (const b of built.values()) group.remove(b.root); }, [built, group]);
  // the secrets' own lamps in the club and the back rooms (the street look mounts its light markers
  // itself): a warm point light each, so a found room is not a black box
  useEffect(() => {
    if (s.level.room.look === "street") return;
    const lights: PointLight[] = [];
    for (const m of s.level.markers) {
      if (m.kind !== "light" || !m.id.startsWith("ars-")) continue;
      const l = new PointLight(String(m.data.color ?? "#ffc98a"), Number(m.data.intensity ?? 1.5) * 2.2, Number(m.data.distance ?? 5), 1.6);
      l.position.set(m.x, m.y, m.z);
      lights.push(l);
      group.add(l);
    }
    return () => { for (const l of lights) group.remove(l); };
  }, [s.level, group]);
  const cat = useMemo(() => ({ g: null as George | null, want: eggs.find(m => m.data.egg === "george") ?? null }), [eggs]);

  // George: RadRun's own model and clips (Draco; the asset runtime decodes it), lit for the night
  useEffect(() => {
    const m = cat.want;
    if (!m) return;
    let gone = false;
    void loadOptional(GEORGE).then(ok => {
      if (!ok || gone) return;
      const src = assets.getModel(GEORGE);
      if (!src) return;
      const root = cloneSkeleton(src);
      lightUp(root, 0.75, 0.28);
      root.scale.setScalar(1.16);
      root.position.set(m.x, m.y, m.z);
      root.rotation.y = m.yaw;
      root.name = "george";
      const clips = ((src as unknown as { animations?: AnimationClip[] }).animations ?? []);
      const mixer = new AnimationMixer(root);
      const act = (n: string, once: boolean) => { const c = clips.find(x => x.name === n); if (!c) return null; const a = mixer.clipAction(c); if (once) { a.setLoop(LoopOnce, 1); a.clampWhenFinished = true; } return a; };
      const g: George = { root, mixer, loaf: act("Loaf", false) ?? act("Sit_Idle", false), happy: act("Happy", true), sulk: act("Sulk", true), busy: 0 };
      g.loaf?.play();
      group.add(root);
      cat.g = g;
    });
    return () => { gone = true; if (cat.g) { group.remove(cat.g.root); cat.g.mixer.stopAllAction(); cat.g = null; } };
  }, [cat, assets, group]);

  useEffect(() => s.on((e, ss) => {
    if (e.type === "interact") {
      if (e.egg === "george" && cat.g) play(cat.g, "happy");
      const b = built.get(e.id);
      if (b && b.screen) b.flash = 1;
    }
    // a round (or a blast) landing near George: he sulks
    const g = cat.g, m = cat.want;
    if (g && m && (e.type === "impact" || e.type === "explode") && Math.hypot(e.x - m.x, e.z - m.z) < (e.type === "explode" ? 7 : 4) && g.busy <= 0) {
      play(g, "sulk");
      const p = ss.game.player;
      const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz) || 1;
      sfxArsenal.meow("sulky", d, (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / d);
    }
  }), [s, cat, built]);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.1);
    const g = s.game;
    const wdt = dt * s.viewScale;
    if (cat.g) {
      const c = cat.g;
      c.mixer.update(wdt);
      if (c.busy > 0) { c.busy -= wdt; if (c.busy <= 0) { c.happy?.fadeOut(0.3); c.sulk?.fadeOut(0.3); c.loaf?.reset().fadeIn(0.3).play(); } }
    }
    for (const b of built.values()) {
      if (!b.screen) continue;
      // attract mode: a slow pan across the key art; a flash on E
      const map = b.screen.map!;
      map.offset.x = 0.19 + 0.19 * Math.sin(g.realTime * 0.25);
      b.flash = Math.max(0, (b.flash ?? 0) - dt * 2.5);
      const k = 0.55 + 0.45 * (b.flash ?? 0);
      b.screen.color.setRGB(k, k, k);
    }
  }, FRAME.fx);

  return <primitive object={group} />;
}

function play(g: George, which: "happy" | "sulk"): void {
  const a = which === "happy" ? g.happy : g.sulk;
  if (!a) return;
  g.loaf?.fadeOut(0.2);
  (which === "happy" ? g.sulk : g.happy)?.fadeOut(0.2);
  a.reset().fadeIn(0.2).play();
  g.busy = Math.max(1.2, a.getClip().duration + 0.4);
}
