// Rooms 4 and 5's looks (round-3 plan sections 2.5 and 3.6), on the back rooms' recipe: no rain, no
// planar reflector, almost no haze, a subtle bloom on the hottest emitters only, mid-dark surfaces so
// every body stands off them, and every hostile keeps the pink-red rim and the outline.
//  - "elevator": the car's brushed steel under one warm caged bulb and a cool fill; the landings under
//    their own light (sodium over the laundry, cool gallery spots, bare work lamps). towerFx.flicker is
//    the car's bulb (the "flicker" token): it stutters when the heavy lands and dies with the cables
//    (RideView drives it), when the red emergency light takes over.
//  - "penthouse": black marble and ebony, warm lamps and the chandelier, the bar's amber onyx, the
//    skyline beyond the glass the one big bright surface (dimmed so bodies in front of it still read),
//    her own soft key light (BossView).
// Level materials follow the shared name tokens (tokens.ts): "glow <g>" (+ "flicker"); repeat textures
// are sampled in world space.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RepeatWrapping, type Material, type Mesh, type Object3D, type Texture } from "three";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, RenderPipeline, type WebGPURenderer } from "three/webgpu";
import { color, densityFogFactor, float, fog, length, materialColor, neutralToneMapping, pass, smoothstep, uniform, uv, vec2, vec4 } from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import type { LevelData } from "../../world/level.ts";
import type { Session } from "../session.ts";
import { renderGate } from "../frame.ts";
import { MarkerLights } from "./lights.tsx";
import { CombatRead, enemyMaskPass, enemyOutline, syncMaskCamera, tagForMask, neonDim } from "./read.tsx";
import { CameraKey, WORLD_UV, hostileEmissive, isActor, readTokens, type Tokens } from "./tokens.ts";
import { useGfx, type Bloom } from "./gfx.ts";
import { cutGrade } from "./cutGrade.ts";
import { registerLook } from "./compile.ts";
import { renderFrame } from "./matrices.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export type LookNumbers = {
  exposure: number;
  bloom: { subtle: { strength: number; radius: number; threshold: number }; original: { strength: number; radius: number; threshold: number } };
  fog: { color: string; density: number };
  background: string;
  hemi: { sky: string; ground: string; intensity: number };
  key: number;
  hostileLift: number;
  vignette: number;
};

/** Readability numbers per look. */
export const TOWER: Record<"elevator" | "penthouse", LookNumbers> = {
  elevator: {
    exposure: 1.22,
    bloom: { subtle: { strength: 0.26, radius: 0.2, threshold: 0.88 }, original: { strength: 0.5, radius: 0.35, threshold: 0.75 } },
    fog: { color: "#121316", density: 0.004 },
    background: "#040405",
    hemi: { sky: "#7a808e", ground: "#282420", intensity: 0.9 },
    key: 0.95,
    hostileLift: 0.32,
    vignette: 0.16,
  },
  penthouse: {
    exposure: 1.28,
    bloom: { subtle: { strength: 0.3, radius: 0.25, threshold: 0.86 }, original: { strength: 0.55, radius: 0.4, threshold: 0.74 } },
    fog: { color: "#0d0b10", density: 0.0025 },
    background: "#050407",
    hemi: { sky: "#726c86", ground: "#261e1e", intensity: 1.05 },
    key: 0.95,
    hostileLift: 0.32,
    vignette: 0.16,
  },
};
const RIM_EDGE: readonly [number, number, number] = [1.0, 0.22, 0.36];

/** The car's bulb (the "flicker" token): 1 on, stutters, 0.05 dead (RideView). */
export const towerFx = { flicker: uniform(1) };

function gain(t: Tokens): N {
  let g: N = float(t.k);
  if (t.flicker) g = g.mul(towerFx.flicker);
  return g;
}

function isLevelMaterial(m: Material): m is MeshStandardNodeMaterial | MeshBasicNodeMaterial {
  return m.constructor === MeshStandardNodeMaterial || m.constructor === MeshBasicNodeMaterial;
}

/** `lit`: a light of the room's own that every lit level surface takes as emissive (room 6's searchlight
 *  pool: one node graph shared by all of them). */
function applyRules(m: Material, lit: N): void {
  if (!isLevelMaterial(m) || m.userData.rpOwn) return;
  const map = (m as { map?: Texture | null }).map ?? null;
  const repeat = !!map && map.wrapS === RepeatWrapping;
  const t = readTokens(m.name ?? "");
  const std = m.constructor === MeshStandardNodeMaterial ? (m as MeshStandardNodeMaterial) : null;
  const litHere = !!lit && !!std && t.kind !== "glow";
  if (!repeat && !t.kind && !litHere && m.userData.rpLook === undefined) return;
  const sig = `tower|${m.name}|${map ? map.uuid : ""}${litHere ? "|lit" : ""}`;
  if (m.userData.rpLook === sig) return;
  m.userData.rpLook = sig;
  m.contextNode = repeat ? WORLD_UV : null;
  m.colorNode = null;
  if (std) { std.emissiveNode = litHere ? lit : null; std.roughnessNode = null; }
  if (t.kind === "glow") m.colorNode = materialColor.mul(gain(t)).mul(neonDim("glow"));
  m.needsUpdate = true;
}

function walk(o: Object3D, hostile: boolean, actor: boolean, lift: number, lit: N): void {
  const h = hostile || o.name.startsWith("goon-");
  const a = actor || isActor(o);
  const mm = (o as Mesh).material;
  if (mm) for (const m of Array.isArray(mm) ? mm : [mm]) {
    if (h) { if ((m.constructor as unknown) === MeshStandardNodeMaterial && m.userData.rpOwn && !m.userData.rpHeavy) hostileEmissive(m as MeshStandardNodeMaterial, lift); }
    else if (!a) applyRules(m, lit);
  }
  for (const c of o.children) walk(c, h, a, lift, lit);
}

function Materials({ lift, lit }: { lift: number; lit: N }) {
  const scene = useThree(s => s.scene);
  const n = useRef(0);
  useFrame(() => {
    if (n.current++ % 10) return;
    walk(scene, false, false, lift, lit);
  });
  return null;
}

function Post({ msaa, level, L }: { msaa: boolean; level: Bloom; L: LookNumbers }) {
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
      const B = L.bloom.subtle;
      b = bloom(col, B.strength, B.radius, B.threshold);
      b.setResolutionScale(0.5);
      c = c.add(b.rgb);
    }
    c = enemyOutline(c, maskPass, RIM_EDGE, 0.12, 0.35);
    c = neutralToneMapping(c, float(L.exposure));
    c = cutGrade(c); // RetardioPayne's split tone (cutGrade.ts); RadPayne: as it is
    const v = smoothstep(0.5, 1.05, length(uv().sub(0.5).mul(vec2(1.0, 0.8))));
    c = c.mul(float(1).sub(v.mul(L.vignette)));
    pipeline.outputNode = vec4(c, 1);
    pipeline.needsUpdate = true;
    return b;
  }, [passes, bloomOn, L]);
  // (a bloom built for the last setting is let go when it is replaced: each one holds its own render targets)
  useEffect(() => () => { (bloomNode as { dispose?: () => void } | null)?.dispose?.(); }, [bloomNode]);
  useEffect(() => {
    if (!bloomNode) return;
    const B = level === "original" ? L.bloom.original : L.bloom.subtle;
    bloomNode.strength.value = B.strength;
    bloomNode.radius.value = B.radius;
    bloomNode.threshold.value = B.threshold;
  }, [bloomNode, level, L]);
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

/** The tower look with a room's own numbers (chapter 2's looks, look/sky.tsx, pass theirs; `lit`: a
 *  light every level surface takes as emissive, the roof's searchlight pool; `keyK`: the camera key's
 *  intensity when a room drives it, the counting floor's blackout). Its hemisphere fill is tagged
 *  userData.rpFill. */
export function TowerLook({ level, s, which, numbers, lit = null, keyK, children }: { level: LevelData; s?: Session; which: "elevator" | "penthouse"; numbers?: LookNumbers; lit?: N; keyK?: { value: number }; children?: React.ReactNode }) {
  const scene = useThree(st => st.scene);
  const gfx = useGfx();
  const L = numbers ?? TOWER[which];
  useEffect(() => {
    const prevBg = scene.backgroundNode, prevFog = scene.fogNode;
    scene.backgroundNode = color(L.background);
    scene.fogNode = fog(color(L.fog.color), (densityFogFactor as N)(float(L.fog.density))) as N;
    towerFx.flicker.value = 1;
    return () => { scene.backgroundNode = prevBg; scene.fogNode = prevFog; };
  }, [scene, L]);
  return (
    <>
      <hemisphereLight args={[L.hemi.sky, L.hemi.ground, L.hemi.intensity]} userData={{ rpFill: true }} />
      <CameraKey color="#e8eaf2" intensity={keyK ?? L.key} />
      <MarkerLights level={level} />
      <Materials lift={L.hostileLift} lit={lit} />
      {s && <CombatRead s={s} />}
      <Post msaa={gfx.msaa} level={gfx.bloom} L={L} />
      {children}
    </>
  );
}

export function ElevatorLook(p: { level: LevelData; s?: Session; lowQuality?: boolean }) {
  return <TowerLook level={p.level} s={p.s} which="elevator" />;
}
export function PenthouseLook(p: { level: LevelData; s?: Session; lowQuality?: boolean }) {
  return <TowerLook level={p.level} s={p.s} which="penthouse" />;
}
