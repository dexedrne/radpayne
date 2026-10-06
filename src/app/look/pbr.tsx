// The pinned engine has no roughness-map prefab slot. Add surface maps without changing
// prefab batching or collision, using the same world projection as the tiling albedo.
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { NoColorSpace, RepeatWrapping, TextureLoader, type Mesh, type Object3D, type Texture } from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { normalViewGeometry, positionView, texture, vec2 } from "three/tsl";
import type { LevelData } from "../../world/level.ts";
import { MOBILE } from "../../ui/mobile.ts";
import { assetUrl } from "../assets.ts";
import { useGfx } from "./gfx.ts";
import { isActor, worldUV } from "./tokens.ts";
import { pbrProfile } from "./pbrProfiles.ts";
import { warmIdle } from "./compile.ts";

type Entry = { texture: Texture; ready: Promise<void> };
const maps = new Map<string, Entry>();
const configured = new Map<string, Texture>();
const touched = new Set<MeshStandardNodeMaterial>();
const loader = new TextureLoader();
/** LOW/mobile keeps half-size roughness and drops normals: docs/pbr-walls.md. */
const liteMaps = () => MOBILE || useGfx.getState().lite;

function getMap(set: string, kind: "normal" | "roughness", low: boolean): Entry {
  const url = assetUrl(`/textures/${set}_${kind}_${low ? 512 : 1024}.webp`);
  const cached = maps.get(url);
  if (cached) return cached;
  let done!: () => void, fail!: (e: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => { done = resolve; fail = reject; });
  const tex = loader.load(url, () => done(), undefined, fail);
  tex.colorSpace = NoColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.name = `pbr:${set}:${kind}`;
  const entry = { texture: tex, ready };
  maps.set(url, entry);
  return entry;
}

function aligned(set: string, kind: "normal" | "roughness", low: boolean, albedo: Texture): Texture {
  const base = getMap(set, kind, low).texture;
  const key = `${base.uuid}|${albedo.repeat.toArray()}|${albedo.offset.toArray()}|${albedo.rotation}|${albedo.center.toArray()}|${albedo.flipY}|${albedo.anisotropy}`;
  const cached = configured.get(key);
  if (cached) return cached;
  const t = base.clone();
  t.repeat.copy(albedo.repeat);
  t.offset.copy(albedo.offset);
  t.center.copy(albedo.center);
  t.rotation = albedo.rotation;
  t.flipY = albedo.flipY;
  t.anisotropy = albedo.anisotropy;
  t.needsUpdate = true;
  configured.set(key, t);
  return t;
}

function setOf(map: Texture): string | null {
  const image = map.image as { src?: string } | undefined;
  return (image?.src ?? map.name).match(/\/textures\/(.+?)\.webp(?:\?|$)/)?.[1] ?? null;
}

/** Three's automatic tangent frame uses geometry UVs. Differentiate the world projection
 * instead, so grooves agree with the albedo on both wall signs, rotated boxes and ceilings.
 * Offsets/centers translate UVs and vanish under differentiation; repeats/rotation stay. */
function projectedNormal(m: MeshStandardNodeMaterial) {
  const map = m.normalMap!, n = normalViewGeometry;
  const q = worldUV(), c = Math.cos(map.rotation), s = Math.sin(map.rotation);
  const at = vec2(q.x.mul(c).add(q.y.mul(s)).mul(map.repeat.x), q.x.mul(-s).add(q.y.mul(c)).mul(map.repeat.y));
  const q0 = positionView.dFdx(), q1 = positionView.dFdy(), st0 = at.dFdx(), st1 = at.dFdy();
  const perp1 = q1.cross(n), perp0 = n.cross(q0);
  const tangent = perp1.mul(st0.x).add(perp0.mul(st1.x));
  const bitangent = perp1.mul(st0.y).add(perp0.mul(st1.y));
  const scale = tangent.dot(tangent).max(bitangent.dot(bitangent)).max(1e-8).inverseSqrt();
  // setupNormal clears the material's default UV context; sample the projection explicitly.
  const sampled = texture(map, q);
  sampled.updateMatrix = true;
  const sample = sampled.xyz.mul(2).sub(1);
  const xy = sample.xy.mul(vec2(m.normalScale.x, m.normalScale.y));
  return tangent.mul(xy.x).add(bitangent.mul(xy.y)).mul(scale).add(n.mul(sample.z)).normalize();
}

export async function preloadPbr(prefab: unknown): Promise<void> {
  const low = liteMaps();
  const materials = (prefab as { materials?: Record<string, { texture?: string; repeat?: boolean; materialType?: string }> }).materials ?? {};
  const jobs = new Set<Promise<void>>();
  for (const m of Object.values(materials)) {
    const set = m.texture?.match(/\/textures\/(.+?)\.webp(?:\?|$)/)?.[1];
    if (!m.repeat || m.materialType === "basic" || !set || !pbrProfile(set)) continue;
    jobs.add(getMap(set, "roughness", low).ready);
    if (!low) jobs.add(getMap(set, "normal", false).ready);
  }
  await Promise.all(jobs);
}

function clearMaps(): void {
  for (const m of touched) {
    m.normalMap = null;
    m.normalNode = null;
    m.roughnessMap = null;
    delete m.userData.rpPbr;
    m.roughness = m.userData.rpPbrRoughness ?? m.roughness;
    m.needsUpdate = true;
  }
  touched.clear();
  const retired = [...configured.values(), ...[...maps.values()].map(e => e.texture)];
  configured.clear();
  maps.clear();
  // A rapid preset change can leave an earlier warm-up using the old maps.
  void warmIdle().then(() => { for (const t of retired) t.dispose(); });
}

function apply(m: MeshStandardNodeMaterial, low: boolean): void {
  const map = m.map;
  if (!map || map.wrapS !== RepeatWrapping || m.userData.rpOwn || m.transparent) return;
  const set = setOf(map), profile = set && pbrProfile(set);
  if (!set || !profile) return;
  const sig = `${map.uuid}|${low}`;
  if (m.userData.rpPbr === sig) return;
  m.userData.rpPbr = sig;
  touched.add(m);
  m.roughnessMap = aligned(set, "roughness", low, map);
  // Preserve deliberately matte variants (e.g. the car ceiling).
  const authored = (m.userData.rpPbrRoughness ??= m.roughness) as number;
  m.roughness = Math.max(1, authored / profile.roughness);
  m.normalMap = low ? null : aligned(set, "normal", false, map);
  m.normalScale.setScalar(profile.scale);
  m.normalNode = m.normalMap ? projectedNormal(m) : null;
  m.needsUpdate = true;
}

function walk(o: Object3D, low: boolean): void {
  if (isActor(o)) return;
  const mm = (o as Mesh).material;
  if (mm) for (const m of Array.isArray(mm) ? mm : [mm]) {
    if (m.constructor === MeshStandardNodeMaterial) apply(m as MeshStandardNodeMaterial, low);
  }
  for (const c of o.children) walk(c, low);
}

export function PbrMaterials({ level }: { level: LevelData }) {
  const scene = useThree(s => s.scene);
  const low = useGfx(s => s.lite) || MOBILE;
  const last = useRef(low), frame = useRef(0);
  useEffect(() => () => clearMaps(), [level, scene]);
  useFrame(() => {
    if (last.current !== low) { clearMaps(); last.current = low; frame.current = 0; }
    if (frame.current++ % 10 === 0) walk(scene, low);
  }, -0.5);
  return null;
}
