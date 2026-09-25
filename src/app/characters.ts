// Radbro assets (RadRun's four game characters + clip packs) and a bridge to r3g's asset runtime so
// the page can preload outside the canvas tree.
import { useAssetRuntime, type AssetRuntime } from "react-three-game";
import { Material, MeshBasicMaterial, MeshStandardMaterial, type Mesh, type Object3D } from "three";
import type { RadbroId } from "../ui/store.ts";

export const modelPath = (id: RadbroId) => `/models/radbro${id}.glb`;
export const clipsPath = (id: RadbroId) => `/models/radbro${id}.clips.glb`;
/** Optional pistol clip pack (same rig, copied onto every Radbro by bone name). */
export const gunClipsPath = (id: RadbroId) => `/models/radbro${id}.gun.glb`;

/** The Miladys' clips are retargeted from this Radbro's rig. */
export const RETARGET_SOURCE: RadbroId = "652";

export function manifestFor(id: RadbroId): string[] {
  const out = [modelPath(id), clipsPath(id)];
  if (id !== RETARGET_SOURCE) out.push(modelPath(RETARGET_SOURCE), clipsPath(RETARGET_SOURCE));
  return out;
}

/** Filled by <AssetsBridge/> inside PrefabRoot. */
export const assetsRef: { current: AssetRuntime | null } = { current: null };

export function AssetsBridge() {
  assetsRef.current = useAssetRuntime();
  return null;
}

/** Preload paths; resolves to null when everything loaded, else the first failed path. */
export async function loadManifest(paths: string[], onProgress: (f: number) => void): Promise<string | null> {
  const assets = assetsRef.current;
  if (!assets) return "asset runtime not ready";
  let done = 0;
  onProgress(0);
  const results = await Promise.all(
    paths.map(p =>
      assets.loadModel(p).then(() => {
        const ok = assets.getModel(p) !== null;
        if (ok) onProgress(++done / paths.length);
        return ok ? null : p;
      }, () => p),
    ),
  );
  return results.find(r => r !== null) ?? null;
}

/** Optional file: resolves true when it loaded (a 404 is fine). */
export async function loadOptional(path: string): Promise<boolean> {
  const assets = assetsRef.current;
  if (!assets) return false;
  try {
    const head = await fetch(path, { method: "HEAD" });
    if (!head.ok || !(head.headers.get("content-type") ?? "").includes("model") && !(head.headers.get("content-type") ?? "").includes("octet")) return false;
    await assets.loadModel(path);
    return assets.getModel(path) !== null;
  } catch {
    return false;
  }
}

/**
 * RadRun's GLBs are unlit (its daytime flat look). At night under neon the characters must take the
 * scene's light, so unlit materials become standard ones with the same map / colour. Returns the new
 * per-instance materials (for fades and disposal).
 */
export function lightUp(root: Object3D, roughness = 0.7): Material[] {
  const out: Material[] = [];
  root.traverse(o => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    o.frustumCulled = false;
    const conv = (src: Material): Material => {
      if (src instanceof MeshBasicMaterial || (src as { isMeshBasicMaterial?: boolean }).isMeshBasicMaterial) {
        const b = src as MeshBasicMaterial;
        const s = new MeshStandardMaterial({ map: b.map, color: b.color, roughness, metalness: 0, transparent: b.transparent, opacity: b.opacity, alphaTest: b.alphaTest, side: b.side });
        out.push(s);
        return s;
      }
      const c = src.clone();
      out.push(c);
      return c;
    };
    m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material);
  });
  return out;
}
