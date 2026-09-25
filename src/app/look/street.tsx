// Room 1's look (spec section 3): a rainy Manhattan night outside the Milady rave. Everything is TSL
// on the engine's WebGPURenderer, so it runs the same on WebGPU and on the WebGL2 fallback (?webgl2);
// nothing here needs WebGL2 to be forced.
//
//  - Level materials get rules from their name tokens (tools/room1.ts lists them): repeat textures
//    are sampled in world space; "wet" ground = a planar reflector through a puddle mask (a soft wet
//    sheen in the puddles, a blurred glossy smear elsewhere) with rain ripples in the puddles; "lit" facades
//    = their lit windows glow; "glow" = unlit colour x gain (neon, lamps), "pulse" follows the club's
//    kick, "flicker" is a dying tube, "blink" a barricade flasher.
//  - Render pipeline: scene pass -> bloom -> cool shadows / warm neon grade -> neutral tone map ->
//    vignette. Sky gradient + exponential fog thinned with height (towers poke out of the haze).
//  - Rain streaks around the camera, drips off awnings and fire escapes, steam from the manholes. All
//    of it runs on a world clock that follows the sim's timeScale: bullet time slows the rain too.
//  - Quality Low: reflector at an eighth resolution, bloom at quarter res and weaker, less than half
//    the rain, no MSAA.
//  - Readability first (READ below): the fight must read through the mood. Characters get a camera
//    key light and a small self-lift so they never sink into the dark; the rain clears out near the
//    camera and thins in the middle of the screen; bloom only takes the HDR neon / lamps; puddle
//    reflections are soft-clipped and kept dimmer than the characters; the big shop windows are
//    toned down; vignette and blue grade are light. Effects "clean" (fx.ts) goes further: no rain
//    near the camera, no bloom, a plain wet sheen instead of reflections.
//  - The fight is 23-46 m out, so read.tsx adds a combat layer on top: a warm outline and a far fill
//    on every visible live goon (post), red enemy fire that lights up the shooter, gold player tracers
//    from the muzzle, and impact / hit glows that keep a minimum size downrange. The steam plumes fade
//    where they sit on a line of sight to a goon, and the puddles only reflect from ~4-12 m out (the
//    lamps no longer mirror as hot blobs at the player's feet).
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DirectionalLight, DoubleSide, Mesh, MeshStandardMaterial, RepeatWrapping, Sphere, TextureLoader, Vector3,
  type Material, type Object3D, type Texture,
} from "three";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, RenderPipeline, type WebGPURenderer } from "three/webgpu";
import {
  Fn, abs, attribute, cameraPosition, clamp, color, cross, densityFogFactor, dot, float, floor, fog, fract, hash, length, luminance,
  materialColor, materialRoughness, max, mix, mx_noise_float, neutralToneMapping, normalView, normalWorld, normalize, pass,
  positionLocal, positionViewDirection, positionWorld, pow, reflector, replaceDefaultUV, saturate, screenUV, select, sign, sin, smoothstep,
  texture, uniform, uniformArray, uv, varying, vec2, vec3, vec4,
} from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import type { LevelData, Marker } from "../../world/level.ts";
import type { Session } from "../session.ts";
import { FRAME } from "../frame.ts";
import { clubPulse } from "../../audio/sfx.ts";
import { MarkerLights } from "./lights.tsx";
import { useFx } from "./fx.ts";
import { CombatRead, enemyMaskPass, enemyOutline } from "./read.tsx";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any; // TSL node graphs: the three typings are too narrow for chained swizzles / mixes

/** Sky + fog (sRGB). The fog is close to the horizon so the far blocks melt into the rain haze. */
const SKY = { horizon: "#2f2638", mid: "#151829", zenith: "#05060b" };
const FOG_COLOR = "#211e2e";
const FOG_DENSITY = 0.0046; // light: the whole street stays clear, only the far blocks and skyline haze
const RAIN_HIGH = 2600, RAIN_LOW = 1000;

/** Readability tuning: the one place to trade mood for a clear view of the fight. */
const READ = {
  exposure: 1.4,
  hemi: { sky: "#5b6fae", ground: "#2a2130", intensity: 1.25 },
  moon: 0.5,
  /** Directional key from just above the camera along the view: lights whatever faces the camera
   *  (the player's back, goons, cover) at any distance, while the facades along the street stay dark. */
  key: { color: "#dfe4ff", intensity: 1.1 },
  /** Characters' albedo added back as emissive: a floor so a goon in a dark doorway still reads. */
  actorLift: 0.15,
  /** Big low-gain emitters are dimmed so they stop pulling the eye: the shop windows (gain ~1) a lot,
   *  the skyline's windows (1.5) a little; neon and lamps (2.2+) keep their full gain. */
  softGlow: [[1.2, 0.45], [2, 0.75]],
  bloom: { strength: 0.2, radius: 0.3, threshold: 1.05 },
  /** Reflection gain in the puddles and on the damp street, after a soft clip (no hot lamp blobs).
   *  near: metres from the camera over which reflections and gloss come in (the overhead lamps mirror
   *  right at the player's feet, the bottom of the frame: kept at nearGain there, rougher puddles). */
  refl: { puddle: 0.3, damp: 0.09, clip: 0.7, near: [4, 12], nearGain: 0.25, nearRough: 0.68 },
  /** Rain: fully clear within near.x m of the camera, full from near.y; thinner in the screen centre. */
  rainNear: { full: [4, 7], clean: [10, 15] },
  rainCentre: 0.3,
  vignette: 0.2,
  steam: 0.12,
  /** Steam fades out where a plume sits between the camera and a live goon (or on the aim line). */
  steamClear: 0.9,
} as const;

/** Shared clocks / hooks (one street scene at a time). time = world seconds (x timeScale). */
export const streetFx = {
  time: uniform(0),
  streak: uniform(0.4),
  pulse: uniform(0),
  flicker: uniform(1),
  blink: uniform(1),
  /** Rain fades in between these distances from the camera (m). */
  rainNear0: uniform(READ.rainNear.full[0] as number),
  rainNear1: uniform(READ.rainNear.full[1] as number),
};

// ------------------------------------------------------------------ level material rules
const worldUV = (): N => {
  const n = normalWorld, p = positionWorld;
  const wallX = vec2(p.z.mul(sign(n.x)).negate(), p.y); // faces along +-x: "right" is -+z
  const wallZ = vec2(p.x.mul(sign(n.z)), p.y);
  const top = vec2(p.x, p.z);
  return select(abs(n.y).greaterThan(0.5), top, select(abs(n.x).greaterThan(abs(n.z)), wallX, wallZ));
};
const WORLD_UV = replaceDefaultUV(() => worldUV());

type Tokens = { kind: "" | "wet" | "lit" | "glow"; k: number; pulse: boolean; flicker: boolean; blink: boolean };
function tokens(name: string): Tokens {
  const t = name.trim().toLowerCase().split(/\s+/);
  const kind = (["wet", "lit", "glow"].includes(t[0]) ? t[0] : "") as Tokens["kind"];
  return { kind, k: Number(t[1]) || 1, pulse: t.includes("pulse"), flicker: t.includes("flicker"), blink: t.includes("blink") };
}
function gain(t: Tokens): N {
  const soft = READ.softGlow.find(([below]) => t.k < below);
  let g: N = float(soft ? t.k * soft[1] : t.k);
  if (t.pulse) g = g.mul(mix(0.72, 1.45, streetFx.pulse));
  if (t.flicker) g = g.mul(streetFx.flicker);
  if (t.blink) g = g.mul(streetFx.blink);
  return g;
}

/** Rain ripples: two layers of cells, each with one expanding ring. xy = ring normal push, z = ring. */
const ripples = Fn(([p, t]: N[]) => {
  const acc: N = vec3(0).toVar();
  for (const [scale, off, speed] of [[1.7, 0.0, 1.0], [2.3, 0.37, 1.27]]) {
    const q = p.mul(scale).add(off);
    const id: N = floor(q);
    const f = fract(q).sub(0.5);
    const seed = id.x.add(1024).mul(4096).add(id.y.add(1024));
    const h1 = hash(seed), h2 = hash(seed.add(7.0));
    const c = f.sub(vec2(h1, h2).sub(0.5).mul(0.5));
    const ph = fract(t.mul(speed).add(h1.mul(9.1)));
    const r = length(c);
    const fade = float(1).sub(ph);
    const ring = smoothstep(0.05, 0.0, abs(r.sub(ph.mul(0.42)))).mul(fade).mul(fade);
    acc.addAssign(vec3(c.div(max(r, 0.001)).mul(ring), ring));
  }
  return acc;
});

export type Ground = { id: number; refl: N | null; color: N; roughness: N; emissive: N; mats: Set<Material> };
let groundIds = 0;

/** The wet street: one planar reflector (y = 0) shared by every "wet" material, masked by puddles.
 *  clean: no reflector, a plain cool sheen at grazing angles instead. */
function makeGround(puddles: Texture, clean = false): Ground {
  const wp = positionWorld.xz;
  const raw = texture(puddles, wp.div(18)).r;
  const onStreet = smoothstep(0.1, 0.03, positionWorld.y); // the street (y 0) vs the sidewalks (0.15)
  const up = smoothstep(0.7, 0.95, normalWorld.y);
  const puddle = smoothstep(0.5, 0.57, raw).mul(mix(0.4, 1.0, onStreet)).mul(up);
  const damp = smoothstep(0.28, 0.5, raw);
  const rip: N = ripples(wp, streetFx.time);
  const ndv = saturate(dot(normalView, positionViewDirection));
  const fres = mix(0.28, 1.0, pow(float(1).sub(ndv), 3));
  const col = materialColor.rgb.mul(mix(mix(0.62, 0.45, damp), 0.1, puddle));
  // near the camera (the bottom of the frame) the street is only damp: no lamp hot spots at the feet
  const nearK = smoothstep(READ.refl.near[0], READ.refl.near[1], length(positionWorld.xz.sub(cameraPosition.xz)));
  const roughness = mix(max(materialRoughness, READ.refl.nearRough), materialRoughness.mul(mix(1.0, 0.45, puddle)), nearK); // glossy, but no pin-sharp lamp / flash hotspots
  const ripple = vec3(0.45, 0.5, 0.6).mul(rip.z.mul(puddle).mul(0.018));
  if (clean) {
    // the night sky's cool sheen on the wet street, strongest in the puddles and at grazing angles
    const sheen = vec3(0.02, 0.023, 0.034).mul(mix(0.35, 1.0, puddle)).mul(fres).mul(up);
    return { id: ++groundIds, refl: null, color: vec4(col, 1), roughness, emissive: sheen.add(ripple), mats: new Set() };
  }
  const refl: N = reflector({ resolutionScale: 0.25, generateMipmaps: true, bounces: false });
  // Every "wet" material samples the reflection, so all of them (not only the one that triggered the
  // update) must stay out of the mirrored render, or the pass reads the texture it is writing.
  const mats = new Set<Material>();
  const base = refl.reflector;
  const update = base.updateBefore.bind(base);
  base.updateBefore = (frame: N) => {
    const hidden: Material[] = [];
    for (const m of mats) if (m.visible) { m.visible = false; hidden.push(m); }
    try { return update(frame); } finally { for (const m of hidden) m.visible = true; }
  };
  refl.target.rotateX(-Math.PI / 2);
  refl.target.position.y = 0.003; // just above the street so curb / paint undersides never reflect
  refl.uvNode = refl.uvNode.add(rip.xy.mul(0.022).mul(puddle.add(0.15)));
  refl.levelNode = mix(float(5.2), float(2.2), puddle); // soft even in the puddles: wet, not a mirror
  // soft clip: lamps and neon reflect as coloured smears, never as hot blobs brighter than a goon
  const r: N = refl.rgb;
  const clipped = r.div(luminance(r).div(READ.refl.clip).add(1));
  const emissive = clipped.mul(mix(READ.refl.damp, READ.refl.puddle, puddle)).mul(fres).mul(up).mul(mix(READ.refl.nearGain, 1, nearK)).add(ripple);
  return { id: ++groundIds, refl, color: vec4(col, 1), roughness, emissive, mats };
}

function isLevelMaterial(m: Material): m is MeshStandardNodeMaterial | MeshBasicNodeMaterial {
  return m.constructor === MeshStandardNodeMaterial || m.constructor === MeshBasicNodeMaterial;
}

function applyRules(m: Material, ground: Ground | null): void {
  if (!isLevelMaterial(m) || m.userData.rpOwn) return;
  const map = (m as { map?: Texture | null }).map ?? null;
  const repeat = !!map && map.wrapS === RepeatWrapping;
  const t = tokens(m.name ?? "");
  if (!repeat && !t.kind && m.userData.rpLook === undefined) return; // not ours (views' own node materials)
  const sig = `${m.name}|${map ? map.uuid : ""}|${ground ? ground.id : 0}`;
  if (m.userData.rpLook === sig) return;
  m.userData.rpLook = sig;
  m.contextNode = repeat ? WORLD_UV : null;
  const std = m.constructor === MeshStandardNodeMaterial ? (m as MeshStandardNodeMaterial) : null;
  ground?.mats.delete(m);
  m.colorNode = null;
  if (std) { std.emissiveNode = null; std.roughnessNode = null; }
  if (t.kind === "glow") m.colorNode = materialColor.mul(gain(t));
  else if (t.kind === "lit" && std) {
    const d: N = materialColor.rgb;
    std.emissiveNode = d.mul(smoothstep(0.2, 0.42, luminance(d))).mul(gain(t));
  } else if (t.kind === "wet" && std && ground) {
    std.colorNode = ground.color;
    std.roughnessNode = ground.roughness;
    std.emissiveNode = ground.emissive.mul(t.k);
    ground.mats.add(m);
  }
  m.needsUpdate = true;
}

/** Characters: the albedo comes back as a little emissive, so a goon never sinks into the dark. */
function liftActor(m: Material, lift: number): void {
  const std = m as MeshStandardMaterial;
  if (!std.isMeshStandardMaterial || m.userData.rpLift === lift) return;
  if (m.userData.rpLift === undefined && std.emissive.getHex() !== 0) return; // has its own glow
  m.userData.rpLift = lift;
  std.emissive.copy(std.color).multiplyScalar(lift); // emissive x emissiveMap = lift x albedo
  std.emissiveMap = lift > 0 ? std.map : null;
  m.needsUpdate = true;
}

/** Characters (skinned rigs, the Milady models) are not level geometry: their textures keep their
 *  own UVs (the repeat rule would re-map them to world space) and they get the actor lift instead. */
const isActor = (o: Object3D) =>
  (o as { isSkinnedMesh?: boolean }).isSkinnedMesh === true || /^(milady|goon|radbro)-/.test(o.name) || o.userData.rpActor === true;

function walk(o: Object3D, ground: Ground | null, lift: number, actor: boolean): void {
  const a = actor || isActor(o);
  const mm = (o as Mesh).material;
  if (mm) {
    for (const m of Array.isArray(mm) ? mm : [mm]) {
      if (a) { if (lift >= 0) liftActor(m, lift); } else applyRules(m, ground);
    }
  }
  for (const c of o.children) walk(c, ground, lift, a);
}

/** Applies the name-token rules to every level material (re-checked every 10 frames, so editor edits
 *  and late texture loads are picked up, and at once when the ground changes). Without a ground (the
 *  editor) "wet" stays plain. actorLift < 0 leaves the characters alone. */
export function LevelMaterials({ ground = null, actorLift = -1 }: { ground?: Ground | null; actorLift?: number }) {
  const scene = useThree(s => s.scene);
  const n = useRef(0);
  const last = useRef<Ground | null>(null);
  useFrame(() => {
    const now = last.current !== ground;
    last.current = ground;
    if (n.current++ % 10 && !now) return;
    walk(scene, ground, actorLift, false);
  });
  return null;
}

// ------------------------------------------------------------------ particles
type Attrs = Record<string, [number, number[]]>; // name -> [itemSize, data]
function quads(count: number, per: (i: number) => Record<string, number[]>, sizes: Record<string, number>): BufferGeometry {
  const g = new BufferGeometry();
  const data: Attrs = {};
  for (const [k, sz] of Object.entries(sizes)) data[k] = [sz, []];
  const corner: number[] = [], idx: number[] = [];
  const C = [-1, 0, 1, 0, 1, 1, -1, 1];
  for (let i = 0; i < count; i++) {
    const v = per(i);
    for (let k = 0; k < 4; k++) {
      for (const [name, [, arr]] of Object.entries(data)) arr.push(...v[name]);
      corner.push(C[k * 2], C[k * 2 + 1]);
    }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  g.setAttribute("position", new BufferAttribute(new Float32Array(count * 12), 3));
  g.setAttribute("corner", new BufferAttribute(new Float32Array(corner), 2));
  for (const [name, [sz, arr]] of Object.entries(data)) g.setAttribute(name, new BufferAttribute(new Float32Array(arr), sz));
  g.setIndex(idx);
  g.boundingSphere = new Sphere(new Vector3(), 1e6);
  return g;
}
function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
function particleMesh(g: BufferGeometry, m: Material, order: number): Mesh {
  m.userData.rpOwn = true; // the level-material rules leave it alone
  const mesh = new Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  return mesh;
}

/** Rain streaks in a box that follows the camera (wrapped per streak), falling with the world clock. */
function makeRain(): Mesh {
  const r = rng(1234567);
  const g = quads(RAIN_HIGH, () => ({ seed: [r(), r(), r()] }), { seed: 3 });
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
  m.fog = false;
  const seed: N = attribute("seed", "vec3"), corner: N = attribute("corner", "vec2");
  const BOX: N = vec3(28, 16, 28);
  const wind: N = vec3(1.1, -9.5, 0.55);
  const moved = seed.mul(BOX).add(wind.mul(streetFx.time));
  const rel: N = fract(moved.sub(cameraPosition).div(BOX).add(0.5)).sub(0.5).mul(BOX).add(vec3(0, 3.5, 0));
  const base: N = cameraPosition.add(rel);
  const dir: N = normalize(wind);
  const toCam: N = base.sub(cameraPosition);
  const dist: N = length(toCam);
  const side = normalize(cross(dir, toCam));
  const width = dist.mul(0.0009).add(0.0035);
  m.positionNode = base.sub(dir.mul(streetFx.streak.mul(corner.y))).add(side.mul(corner.x.mul(width)));
  const edge = max(abs(rel.x).div(28), abs(rel.z).div(28));
  // nothing right in front of the lens: streaks fade in from rainNear0 to rainNear1 metres
  const a: N = varying(smoothstep(streetFx.rainNear0, streetFx.rainNear1, dist).mul(float(1).sub(smoothstep(0.34, 0.5, edge))));
  // thinner where the fight is (the middle of the screen), full at the edges
  const centre = mix(float(READ.rainCentre), float(1), smoothstep(0.1, 0.42, length(screenUV.sub(0.5).mul(vec2(1.5, 1)))));
  m.colorNode = vec4(0.62, 0.68, 0.82, 1);
  m.opacityNode = a.mul(centre).mul(float(1).sub(abs(corner.x))).mul(0.13).mul(float(1).sub(corner.y.mul(0.7))); // faint head, fading tail
  return particleMesh(g, m, 5);
}

/** Drips falling off the "drip" fx markers (a line of scale.x metres), each on its own cycle. */
function makeDrips(ms: Marker[]): Mesh | null {
  if (!ms.length) return null;
  const r = rng(424242);
  const drops: Array<{ o: number[]; d: number[] }> = [];
  for (const m of ms) {
    const n = Math.max(2, Math.round(m.hx * 2 * 2.2));
    const to = typeof m.data.to === "number" ? m.data.to : 0.15;
    const h = Math.max(0.3, m.y - to);
    const tf = Math.sqrt((2 * h) / 9.8);
    for (let j = 0; j < n; j++) {
      const a = (r() * 2 - 1) * m.hx;
      drops.push({ o: [m.x + a * Math.cos(m.yaw), m.y, m.z - a * Math.sin(m.yaw)], d: [r() * 10, tf + 0.35 + r() * 1.6, h, tf] });
    }
  }
  const g = quads(drops.length, i => ({ origin: drops[i].o, drip: drops[i].d }), { origin: 3, drip: 4 });
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
  m.fog = false;
  const o: N = attribute("origin", "vec3"), d: N = attribute("drip", "vec4"), corner: N = attribute("corner", "vec2");
  const t: N = fract(streetFx.time.add(d.x).div(d.y)).mul(d.y);
  const falling = t.lessThan(d.w).select(float(1), float(0));
  const y: N = o.y.sub(t.mul(t).mul(4.9));
  const len: N = clamp(t.mul(9.8).mul(0.03).mul(streetFx.streak.div(0.55)), 0.03, 0.45);
  const base: N = vec3(o.x, y, o.z);
  const toCam: N = base.sub(cameraPosition);
  const side = normalize(cross(vec3(0, 1, 0), toCam));
  m.positionNode = base.add(vec3(0, len.mul(corner.y), 0)).add(side.mul(corner.x.mul(length(toCam).mul(0.0014).add(0.006))));
  m.colorNode = vec4(0.72, 0.78, 0.9, 1);
  m.opacityNode = (varying(falling) as N).mul(float(1).sub(abs(corner.x))).mul(0.6);
  return particleMesh(g, m, 5);
}

/** Steam puffs rising from the "steam" fx markers (data.size scales them). */
function makeSteam(ms: Marker[]): Mesh | null {
  if (!ms.length) return null;
  const r = rng(777);
  const K = 14;
  const puffs: Array<{ o: number[]; p: number[] }> = [];
  for (const m of ms) {
    const size = typeof m.data.size === "number" ? m.data.size : 1;
    for (let i = 0; i < K; i++) puffs.push({ o: [m.x, m.y, m.z], p: [i / K + r() * 0.04, size, r() * 10, ms.indexOf(m)] });
  }
  const fade: N = uniformArray(ms.map(() => 1), "float");
  const g = quads(puffs.length, i => ({ origin: puffs[i].o, puff: puffs[i].p }), { origin: 3, puff: 4 });
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
  const o: N = attribute("origin", "vec3"), p: N = attribute("puff", "vec4"), corner: N = attribute("corner", "vec2");
  const life: N = fract(streetFx.time.mul(0.2).add(p.x));
  const size = p.y;
  const center: N = o.add(vec3(sin(life.mul(3).add(p.z)).mul(0.3).add(life.mul(0.9)), life.mul(3.4).mul(size), life.mul(0.45)));
  const radius = life.mul(1.7).add(0.35).mul(size);
  const toCam: N = center.sub(cameraPosition);
  const right = normalize(vec3(toCam.z, 0, toCam.x.negate()));
  const cy = corner.y.mul(2).sub(1); // quads are built 0..1 in y; centre them
  m.positionNode = center.add(right.mul(corner.x.mul(radius))).add(vec3(0, cy.mul(radius), 0));
  const q: N = vec2(corner.x, cy);
  const lifeV: N = varying(life), seedV: N = varying(p.z), fadeV: N = varying(fade.element(p.w.toInt()));
  const soft = smoothstep(1.0, 0.15, length(q));
  const n = mx_noise_float(vec3(q.mul(1.4).add(seedV), streetFx.time.mul(0.3))).mul(0.5).add(0.5);
  m.colorNode = vec4(0.58, 0.6, 0.68, 1);
  m.opacityNode = soft.mul(n).mul(sin(lifeV.mul(Math.PI))).mul(READ.steam).mul(fadeV);
  const mesh = particleMesh(g, m, 4);
  mesh.userData.steam = { markers: ms, fade, want: ms.map(() => 1) };
  return mesh;
}

/** Closest distance between segments p0-p1 and q0-q1. */
const SA = new Vector3(), SB = new Vector3(), SR = new Vector3(), SC = new Vector3(), SD = new Vector3();
function segDist(p0: Vector3, p1: Vector3, q0: Vector3, q1: Vector3): number {
  SA.subVectors(p1, p0); SB.subVectors(q1, q0); SR.subVectors(p0, q0);
  const a = SA.dot(SA), e = SB.dot(SB), f = SB.dot(SR), c = SA.dot(SR), b = SA.dot(SB);
  const den = a * e - b * b;
  let s = den > 1e-8 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
  let t = (b * s + f) / e;
  if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
  SC.copy(p0).addScaledVector(SA, s); SD.copy(q0).addScaledVector(SB, t);
  return SC.distanceTo(SD);
}

/** Per frame: a plume that sits on a line of sight (camera -> live goon's head, or the aim line) fades. */
const P0 = new Vector3(), P1 = new Vector3(), Q0 = new Vector3(), Q1 = new Vector3(), FWD = new Vector3();
function clearSteam(mesh: Mesh, s: Session, camera: Object3D, dt: number): void {
  const st = mesh.userData.steam as { markers: Marker[]; fade: N; want: number[] };
  camera.getWorldPosition(Q0);
  camera.getWorldDirection(FWD);
  st.markers.forEach((m, i) => {
    const size = typeof m.data.size === "number" ? m.data.size : 1;
    P0.set(m.x, m.y + 0.3 * size, m.z);
    P1.set(m.x + 0.9, m.y + 3.4 * size, m.z + 0.45);
    const r = 1.1 * size;
    let block = 1 - smooth(r * 0.7, r + 2.2, segDist(P0, P1, Q0, Q1.copy(Q0).addScaledVector(FWD, 45)));
    for (const e of s.game.enemies) {
      if (e.state === "dead" || e.state === "inactive") continue;
      for (const h of [1.1, 1.6]) { // over cover: the head, standing: the chest
        Q1.set(e.x, e.y + h, e.z);
        block = Math.max(block, 1 - smooth(r * 0.7, r + 2.2, segDist(P0, P1, Q0, Q1)));
      }
    }
    const want = 1 - READ.steamClear * block;
    const arr = st.fade.array as number[];
    arr[i] += (want - arr[i]) * Math.min(1, dt * 5);
  });
}
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ render pipeline
function StreetPost({ low, clean }: { low: boolean; clean: boolean }) {
  const gl = useThree(s => s.gl) as unknown as WebGPURenderer;
  const scene = useThree(s => s.scene);
  const camera = useThree(s => s.camera);
  const p = useMemo(() => {
    const pipeline = new RenderPipeline(gl);
    const scenePass: N = pass(scene, camera, { samples: low ? 0 : 4 });
    const maskPass: N = enemyMaskPass(scene, camera, gl);
    const col: N = scenePass.getTextureNode("output");
    let hdr: N = col.rgb;
    if (!clean) {
      // high threshold: only the HDR neon / lamps / tracers bloom, never a lit character or a wall
      const B = READ.bloom;
      const b: N = bloom(col, low ? B.strength * 0.7 : B.strength, B.radius, B.threshold);
      b.setResolutionScale(low ? 0.25 : 0.5);
      hdr = hdr.add(b.rgb);
    }
    // a light cool tint on the shadows and mids; the bright neon / lamps keep their own colour
    const l = luminance(hdr);
    let c: N = mix(hdr.mul(vec3(0.92, 0.97, 1.1)), hdr, smoothstep(0.05, 0.55, l));
    c = c.add(vec3(0.004, 0.005, 0.008));
    c = enemyOutline(c, maskPass); // the goons read at range (read.tsx)
    c = neutralToneMapping(c, float(READ.exposure));
    const v = smoothstep(0.45, 1.05, length(uv().sub(0.5).mul(vec2(1.0, 0.8))));
    c = c.mul(float(1).sub(v.mul(READ.vignette)));
    pipeline.outputNode = vec4(c, 1);
    return { pipeline, scenePass, maskPass };
    // the pass camera is re-read every frame; rebuild only for the renderer / quality / effects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, low, clean]);
  useEffect(() => () => p.pipeline.dispose(), [p]);
  useFrame(st => {
    p.scenePass.camera = st.camera;
    p.maskPass.camera = st.camera;
    p.pipeline.render();
  }, 1); // a positive priority: this frame callback renders instead of R3F
  return null;
}

// ------------------------------------------------------------------ camera key light
const KEY_FWD = new Vector3(), KEY_POS = new Vector3(), KEY_UP = new Vector3(0, 1, 0);

/** A directional key that rides with the camera: from just above and behind the lens, down the view.
 *  Whatever faces the camera (the player's back, the goons, their cover) is lit at any distance;
 *  the facades running along the street catch it at a grazing angle and stay dark. */
function CameraKey() {
  const key = useMemo(() => new DirectionalLight(READ.key.color, READ.key.intensity), []);
  useFrame(({ camera }) => {
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(KEY_POS);
    camera.getWorldDirection(KEY_FWD);
    key.position.copy(KEY_POS).addScaledVector(KEY_UP, 3).addScaledVector(KEY_FWD, -4);
    key.target.position.copy(KEY_POS).addScaledVector(KEY_FWD, 12);
    key.target.updateMatrixWorld();
  }, FRAME.fx);
  return (
    <>
      <primitive object={key} />
      <primitive object={key.target} />
    </>
  );
}

// ------------------------------------------------------------------ the look
export function StreetLook({ level, s, lowQuality }: { level: LevelData; s?: Session; lowQuality?: boolean }) {
  const scene = useThree(st => st.scene);
  const clean = useFx(st => st.effects) === "clean";
  const puddles = useMemo(() => {
    const t = new TextureLoader().load("/textures/puddles.webp");
    t.wrapS = t.wrapT = RepeatWrapping;
    return t;
  }, []);
  const ground = useMemo(() => makeGround(puddles, clean), [puddles, clean]);
  useEffect(() => {
    const refl = ground.refl;
    if (!refl) return;
    scene.add(refl.target);
    return () => {
      scene.remove(refl.target);
      // the level materials switch to the new ground within a frame; free the old mirror after that
      setTimeout(() => refl.dispose?.(), 1000);
    };
  }, [scene, ground]);
  useEffect(() => { if (ground.refl) ground.refl.reflector.resolutionScale = lowQuality ? 0.125 : 0.25; }, [ground, lowQuality]);
  useEffect(() => {
    const near = clean ? READ.rainNear.clean : READ.rainNear.full;
    streetFx.rainNear0.value = near[0];
    streetFx.rainNear1.value = near[1];
  }, [clean]);

  // sky gradient + height-thinned fog
  useEffect(() => {
    const y = normalize(positionLocal).y;
    const low = mix(color(FOG_COLOR), color(SKY.horizon), smoothstep(-0.05, 0.02, y));
    const sky = mix(mix(low, color(SKY.mid), smoothstep(0.02, 0.22, y)), color(SKY.zenith), smoothstep(0.18, 0.75, y));
    const prevBg = scene.backgroundNode, prevFog = scene.fogNode;
    scene.backgroundNode = sky;
    scene.fogNode = fog(color(FOG_COLOR), (densityFogFactor as N)(float(FOG_DENSITY)).mul(mix(float(1.0), float(0.42), smoothstep(10, 140, positionWorld.y)))) as N;
    return () => { scene.backgroundNode = prevBg; scene.fogNode = prevFog; };
  }, [scene]);

  const rain = useMemo(() => makeRain(), []);
  useEffect(() => { rain.geometry.setDrawRange(0, (lowQuality ? RAIN_LOW : RAIN_HIGH) * (clean ? 3 : 6)); }, [rain, lowQuality, clean]);
  const drips = useMemo(() => makeDrips(level.markers.filter(m => m.kind === "fx" && m.data.fx === "drip")), [level]);
  const steam = useMemo(() => makeSteam(level.markers.filter(m => m.kind === "fx" && m.data.fx === "steam")), [level]);
  useEffect(() => () => { for (const x of [rain, drips, steam]) if (x) { x.geometry.dispose(); (x.material as Material).dispose(); } }, [rain, drips, steam]);

  // clocks: the world clock follows the sim's time scale (title / pause: real time)
  const st = useRef({ beat: 0, flickT: 0, flick: 1 });
  useFrame((three, raw) => {
    const dt = Math.min(raw, 0.1);
    const ts = !s || s.paused ? 1 : s.game.timeScale;
    const fx = streetFx;
    fx.time.value += dt * ts;
    const want = Math.max(0.05, 0.4 * ts);
    fx.streak.value += (want - fx.streak.value) * Math.min(1, dt * 10);
    let p = clubPulse();
    if (p < 0) { // no audio yet: the club's 124 bpm on its own
      st.current.beat += dt * (124 / 60) * (0.55 + 0.45 * ts);
      p = Math.exp(-(st.current.beat % 1) * 4);
    }
    fx.pulse.value = p;
    const c = st.current;
    c.flickT -= dt * ts;
    if (c.flickT <= 0) {
      c.flick = c.flick === 1 && Math.random() < 0.4 ? 0.08 + Math.random() * 0.3 : 1;
      c.flickT = c.flick < 1 ? 0.04 + Math.random() * 0.12 : 0.15 + Math.random() * 2.2;
    }
    fx.flicker.value = c.flick;
    fx.blink.value = Math.sin(fx.time.value * Math.PI * 1.25) > 0 ? 1 : 0.06;
    if (steam && s) clearSteam(steam, s, three.camera, dt);
  }, FRAME.fx);

  return (
    <>
      <hemisphereLight args={[READ.hemi.sky, READ.hemi.ground, READ.hemi.intensity]} />
      <directionalLight position={[30, 50, 25]} intensity={READ.moon} color="#86a0ff" />
      <CameraKey />
      <MarkerLights level={level} />
      <LevelMaterials ground={ground} actorLift={READ.actorLift} />
      <primitive object={rain} />
      {drips && <primitive object={drips} />}
      {steam && <primitive object={steam} />}
      {s && <CombatRead s={s} />}
      <StreetPost low={!!lowQuality} clean={clean} />
    </>
  );
}
