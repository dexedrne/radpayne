// Room 3's look (round-2 plan section 8): the back of the house behind the club. Readability first: no
// rain, no planar reflector, almost no haze (fog density <= 0.004), bloom <= 0.35 on the hottest
// emitters only, mid-dark walls under cool fluorescent troffers so every body stands off them, red exit
// lights and warm desk lamps as the only colour. Hostiles (the Miladys and the rival heavies) keep the
// club's pink-red rim and the post outline in the same colour, so the code carries from room 2.
//
// Level materials follow the shared name tokens (tokens.ts): "glow <g>" (+ "flicker": the one failing
// tube in the corridor and the one by the office door), repeat textures in world space. A tube's dip
// clicks and buzzes (fluorescent_flicker) when he is near one of the fx "flicker" markers.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RepeatWrapping, type Material, type Mesh, type Object3D, type Texture } from "three";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, RenderPipeline, type WebGPURenderer } from "three/webgpu";
import { color, densityFogFactor, float, fog, length, materialColor, neutralToneMapping, pass, smoothstep, uniform, uv, vec2, vec4 } from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import type { LevelData } from "../../world/level.ts";
import type { Session } from "../session.ts";
import { FRAME, renderGate } from "../frame.ts";
import { sfx } from "../../audio/sfx.ts";
import { MarkerLights } from "./lights.tsx";
import { CombatRead, enemyMaskPass, enemyOutline, syncMaskCamera, tagForMask, neonDim } from "./read.tsx";
import { CameraKey, WORLD_UV, hostileEmissive, isActor, readTokens, type Tokens } from "./tokens.ts";
import { useGfx, type Bloom } from "./gfx.ts";
import { cutGrade } from "./cutGrade.ts";
import { registerLook } from "./compile.ts";
import { renderFrame } from "./matrices.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** Readability numbers. */
export const BACKROOMS = {
  exposure: 1.25,
  /** Bloom per graphics setting: subtle (the default) and a stronger glow for Bloom: Original. */
  bloom: { subtle: { strength: 0.28, radius: 0.2, threshold: 0.88 }, original: { strength: 0.58, radius: 0.4, threshold: 0.72 } },
  fog: { color: "#15161a", density: 0.003 },
  background: "#050506",
  hemi: { sky: "#7c8290", ground: "#2a2622", intensity: 0.95 },
  key: 0.95,
  /** Hostiles: their own texture lifted by this (the heavies get a flat lift in HeavyView). */
  hostileLift: 0.32,
  vignette: 0.14,
};
const RIM_EDGE: readonly [number, number, number] = [1.0, 0.22, 0.36];

/** The failing tubes' clock (one room at a time). */
export const backFx = { flicker: uniform(1) };

function gain(t: Tokens): N {
  let g: N = float(t.k);
  if (t.flicker) g = g.mul(backFx.flicker);
  return g;
}

function isLevelMaterial(m: Material): m is MeshStandardNodeMaterial | MeshBasicNodeMaterial {
  return m.constructor === MeshStandardNodeMaterial || m.constructor === MeshBasicNodeMaterial;
}

function applyRules(m: Material): void {
  if (!isLevelMaterial(m) || m.userData.rpOwn) return;
  const map = (m as { map?: Texture | null }).map ?? null;
  const repeat = !!map && map.wrapS === RepeatWrapping;
  const t = readTokens(m.name ?? "");
  if (!repeat && !t.kind && m.userData.rpLook === undefined) return;
  const sig = `back|${m.name}|${map ? map.uuid : ""}`;
  if (m.userData.rpLook === sig) return;
  m.userData.rpLook = sig;
  m.contextNode = repeat ? WORLD_UV : null;
  m.colorNode = null;
  const std = m.constructor === MeshStandardNodeMaterial ? (m as MeshStandardNodeMaterial) : null;
  if (std) { std.emissiveNode = null; std.roughnessNode = null; }
  if (t.kind === "glow") m.colorNode = materialColor.mul(gain(t)).mul(neonDim("glow"));
  m.needsUpdate = true;
}

function applyHostile(m: Material): void {
  if ((m.constructor as unknown) !== MeshStandardNodeMaterial || !m.userData.rpOwn || m.userData.rpHeavy) return;
  hostileEmissive(m as MeshStandardNodeMaterial, BACKROOMS.hostileLift);
}

function walk(o: Object3D, hostile: boolean, actor: boolean): void {
  const h = hostile || o.name.startsWith("goon-");
  const a = actor || isActor(o);
  const mm = (o as Mesh).material;
  if (mm) for (const m of Array.isArray(mm) ? mm : [mm]) {
    if (h) applyHostile(m);
    else if (!a) applyRules(m);
  }
  for (const c of o.children) walk(c, h, a);
}

function Materials() {
  const scene = useThree(s => s.scene);
  const n = useRef(0);
  useFrame(() => {
    if (n.current++ % 10) return;
    walk(scene, false, false);
  });
  return null;
}

function Post({ msaa, level }: { msaa: boolean; level: Bloom }) {
  const gl = useThree(s => s.gl) as unknown as WebGPURenderer;
  const scene = useThree(s => s.scene);
  const camera = useThree(s => s.camera);
  const passes = useMemo(() => {
    const pipeline = new RenderPipeline(gl);
    const samples = msaa ? 4 : 0;
    const scenePass: N = pass(scene, camera, { samples });
    scenePass.renderTarget.samples = samples;
    const maskPass: N = enemyMaskPass(scene, camera, gl);
    return { pipeline, scenePass, maskPass };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, msaa]);
  const bloomOn = level !== "off";
  const bloomNode = useMemo(() => {
    const { pipeline, scenePass, maskPass } = passes;
    const col: N = scenePass.getTextureNode("output");
    let c: N = col.rgb;
    let b: N = null;
    if (bloomOn) {
      const B = BACKROOMS.bloom.subtle;
      b = bloom(col, B.strength, B.radius, B.threshold);
      b.setResolutionScale(0.5);
      c = c.add(b.rgb);
    }
    // fights at 3-16 m under flat light: a light far fill, the club's pink-red edge
    c = enemyOutline(c, maskPass, RIM_EDGE, 0.12, 0.35);
    c = neutralToneMapping(c, float(BACKROOMS.exposure));
    c = cutGrade(c); // RetardioPayne's split tone (cutGrade.ts); RadPayne: as it is
    const v = smoothstep(0.5, 1.05, length(uv().sub(0.5).mul(vec2(1.0, 0.8))));
    c = c.mul(float(1).sub(v.mul(BACKROOMS.vignette)));
    pipeline.outputNode = vec4(c, 1);
    pipeline.needsUpdate = true;
    return b;
  }, [passes, bloomOn]);
  // (a bloom built for the last setting is let go when it is replaced: each one holds its own render targets)
  useEffect(() => () => { (bloomNode as { dispose?: () => void } | null)?.dispose?.(); }, [bloomNode]);
  useEffect(() => {
    if (!bloomNode) return;
    const B = level === "original" ? BACKROOMS.bloom.original : BACKROOMS.bloom.subtle;
    bloomNode.strength.value = B.strength;
    bloomNode.radius.value = B.radius;
    bloomNode.threshold.value = B.threshold;
  }, [bloomNode, level]);
  useEffect(() => () => passes.pipeline.dispose(), [passes]);
  useEffect(() => registerLook(gl, scene, camera, passes, undefined, () => tagForMask(scene)), [gl, scene, camera, passes]);
  useFrame(st => {
    passes.scenePass.camera = st.camera;
    syncMaskCamera(passes.maskPass, st.camera);
    if (renderGate.skip) return; // a card hides the canvas: the last frame stays
    renderFrame(scene, () => passes.pipeline.render()); // (the scene's matrices walked once: matrices.ts)
  }, 1);
  return null;
}

export function BackroomsLook({ level, s }: { level: LevelData; s?: Session; lowQuality?: boolean }) {
  const scene = useThree(st => st.scene);
  const gfx = useGfx();
  useEffect(() => {
    const prevBg = scene.backgroundNode, prevFog = scene.fogNode;
    scene.backgroundNode = color(BACKROOMS.background);
    scene.fogNode = fog(color(BACKROOMS.fog.color), (densityFogFactor as N)(float(BACKROOMS.fog.density))) as N;
    return () => { scene.backgroundNode = prevBg; scene.fogNode = prevFog; };
  }, [scene]);
  const tubes = useMemo(() => level.markers.filter(m => m.kind === "fx" && m.data.fx === "flicker"), [level]);
  const st = useRef({ t: 0, flick: 1 });
  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.1);
    const g = s?.game;
    const ts = !s || s.paused ? 1 : s.hold ? s.crawl : g!.timeScale;
    const c = st.current;
    c.t -= dt * ts;
    if (c.t <= 0) {
      const dip = c.flick === 1 && Math.random() < 0.45;
      c.flick = dip ? 0.08 + Math.random() * 0.3 : 1;
      c.t = dip ? 0.05 + Math.random() * 0.14 : 0.5 + Math.random() * 3;
      // the click and buzz of the tube, when he is under one of them
      if (dip && g && s && !s.paused) {
        const p = g.player;
        for (const m of tubes) {
          const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
          if (d < 9) { sfx.at("fluorescent_flicker", d, (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / (d || 1), 0.35); break; }
        }
      }
    }
    backFx.flicker.value = c.flick;
  }, FRAME.fx);
  const H = BACKROOMS.hemi;
  return (
    <>
      <hemisphereLight args={[H.sky, H.ground, H.intensity]} />
      <CameraKey color="#e8eaf2" intensity={BACKROOMS.key} />
      <MarkerLights level={level} />
      <Materials />
      {s && <CombatRead s={s} />}
      <Post msaa={gfx.msaa} level={gfx.bloom} />
    </>
  );
}
