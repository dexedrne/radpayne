// The rave crowd's Pockit templates (one per model number, shared by every girl who wears it and by
// every session): parsed, lit like a civilian (25 % less colour, a small lift of her own texture),
// scaled like the gang, and given only the clips her girls use, retargeted from the Radbro rig and
// baked onto the model's RAW bones (so a plain SkeletonUtils clone plays them without a VRM runtime).
// Built in slices (`breathe` between clips and every few baked frames) so a build never stalls a frame.
import { AnimationClip, AnimationMixer, Color, Group, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack, type Material, type Mesh, type Object3D } from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { float, luminance, materialColor, mix, vec3, vec4 } from "three/tsl";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { parseVrm } from "./loadVrm.ts";
import { fetchPockit, stripMorphs } from "./pockit.ts";
import { RADBRO_RIG, retargetClip, rigSignature } from "./retarget.ts";
import { MILADY_HEAD_BONE } from "../combat/hitboxes.ts";

/** Every clip the crowd can play. */
export const CROWD_CLIPS = ["Dance_1", "Dance_2", "Dance_3", "Dance_4", "Dance_5", "Dance_6", "Drink_Idle", "Sit_Idle", "Startle", "Flee_Run", "Flee_Run_2", "Cower_Idle", "DJ_Idle"];
/** What every girl may need once the shooting starts (and the fallback pose). */
export const CROWD_ALWAYS = ["Startle", "Flee_Run", "Flee_Run_2", "Cower_Idle", "Drink_Idle"];
/** Hips height of the source rig (the flee loops' planted-foot speeds are measured on it). */
export const SRC_HIPS = 0.736;
/** Crowd look (plan section 8): the lift and the colour they keep. */
const LIFT = 0.12;
const DESAT = 0.25;

/** `arms`: the raw left / right upper-arm bone names, plus the hips (the view's T-pose check: whichever
 *  of these names resolve on the clone, all of them near their bind rotation means she never got posed). */
export type CrowdModel = { n: number; body: Group; clips: AnimationClip[]; legScale: number; hand: string; arms: string[] };

// The crowd's colour and lift: ONE node graph shared by every crowd material (a graph per material
// cost every model its own shaders); the map, colour and alpha come from each material itself.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let crowdNodes: { color: any; emissive: any } | null = null;
function crowdGraph() {
  if (!crowdNodes) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = materialColor;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rgb: any = mix(c.rgb, vec3(luminance(c.rgb)), float(DESAT));
    crowdNodes = { color: vec4(rgb, c.a), emissive: rgb.mul(LIFT) };
  }
  return crowdNodes;
}

/** MToon -> a lit material: the texture 25 % desaturated, a small lift of its own colour. */
function crowdMaterials(vrm: VRM): void {
  vrm.scene.traverse(o => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const conv = (m: Material): Material => {
      const src = m as unknown as { map?: unknown; color?: Color; transparent: boolean; opacity: number; side: number; alphaTest: number; depthWrite: boolean };
      const mat = new MeshStandardNodeMaterial({ roughness: 0.78, metalness: 0 });
      mat.userData.rpOwn = true;
      mat.userData.rpCrowd = true;
      Object.assign(mat, { map: src.map ?? null, transparent: src.transparent, opacity: src.opacity, side: src.side, alphaTest: src.alphaTest, depthWrite: src.depthWrite });
      if (src.color?.isColor) mat.color.copy(src.color);
      const g = crowdGraph();
      mat.colorNode = g.color;
      mat.emissiveNode = g.emissive;
      m.dispose();
      return mat;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material);
  });
}

/** Raw-rig signature: models with the same raw rest pose bake the same raw clip. */
function rawSignature(vrm: VRM): string {
  const parts: string[] = [];
  for (const b of Object.keys(vrm.humanoid.humanBones).sort() as VRMHumanBoneName[]) {
    const n = vrm.humanoid.getRawBoneNode(b);
    if (!n) continue;
    parts.push(`${b}:${n.name}:${n.quaternion.toArray().map(v => Math.round(v * 1e4)).join(",")}:${n.position.toArray().map(v => Math.round(v * 1e4)).join(",")}`);
  }
  return parts.join("|");
}
const baked = new Map<string, AnimationClip>();

/** Bake a clip that drives the VRM's normalized bones into one that drives its raw bones. */
async function bakeRaw(vrm: VRM, clip: AnimationClip, key: string, breathe: () => Promise<void>, fps = 30): Promise<AnimationClip> {
  const hit = baked.get(key);
  if (hit) return hit;
  const mixer = new AnimationMixer(vrm.scene);
  const a = mixer.clipAction(clip);
  a.play();
  const bones = (Object.keys(vrm.humanoid.humanBones) as VRMHumanBoneName[])
    .map(b => vrm.humanoid.getRawBoneNode(b))
    .filter((b): b is Object3D => !!b);
  const hips = vrm.humanoid.getRawBoneNode("hips");
  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(frames);
  const rot = bones.map(() => new Float32Array(frames * 4));
  const pos = new Float32Array(frames * 3);
  for (let f = 0; f < frames; f++) {
    const t = Math.min(clip.duration, f / fps);
    times[f] = t;
    mixer.setTime(t);
    vrm.humanoid.update();
    bones.forEach((b, k) => b.quaternion.toArray(rot[k], f * 4));
    hips?.position.toArray(pos, f * 3);
    if (f % 12 === 11) await breathe();
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(vrm.scene);
  const tracks: Array<QuaternionKeyframeTrack | VectorKeyframeTrack> = bones.map((b, k) => new QuaternionKeyframeTrack(`${b.name}.quaternion`, times, rot[k]));
  if (hips) tracks.push(new VectorKeyframeTrack(`${hips.name}.position`, times, pos));
  const out = new AnimationClip(clip.name, clip.duration, tracks);
  baked.set(key, out);
  return out;
}

/** Parse, light, scale and give the clips `want` to one Pockit model (the template the girls clone). */
export async function buildCrowdModel(n: number, source: Object3D, want: readonly string[], breathe: () => Promise<void>): Promise<CrowdModel | null> {
  const got = await fetchPockit(n);
  if (!got) return null;
  await breathe();
  const { vrm } = await parseVrm(got.buf.slice(0), got.url);
  // the loader parks the VRM on its own scene's userData: a clone would try to copy that (a cycle)
  delete vrm.scene.userData.vrm;
  // no faces in the crowd: no morph targets, so every crowd girl shares the same shaders
  stripMorphs(vrm);
  crowdMaterials(vrm);
  vrm.scene.updateMatrixWorld(true);
  const head = vrm.humanoid.getNormalizedBoneNode("head");
  const headY = head ? head.getWorldPosition(new Vector3()).y : 1.6;
  const scale = headY > 0.3 ? MILADY_HEAD_BONE / headY : 1;
  const hipsY = vrm.humanoid.getNormalizedBoneNode("hips")?.getWorldPosition(new Vector3()).y ?? SRC_HIPS;
  const body = new Group();
  body.name = `milady-${n}`;
  body.userData.rpActor = true;
  body.scale.setScalar(scale);
  body.add(vrm.scene);
  const sig = rigSignature(vrm);
  const raw = rawSignature(vrm);
  const list = ((source as unknown as { animations?: AnimationClip[] }).animations ?? []).filter(c => want.includes(c.name));
  const clips: AnimationClip[] = [];
  for (const c of list) {
    await breathe();
    try {
      // everything here is baked on the spot already (dances, seats): never pin the hips
      const inPlace = /^Flee_Run/.test(c.name);
      const r = retargetClip(c, source, vrm, RADBRO_RIG, { inPlace, alignRestPose: true }, sig);
      clips.push(await bakeRaw(vrm, r, `${c.name}/${inPlace}/${sig}/${raw}`, breathe));
    } catch (e) {
      console.info(`[crowd] retarget ${c.name} failed on #${n}: ${String(e)}`);
    }
  }
  // no clip survived the bake on this rig: treat her like a model that never came (the view already
  // dresses the spare girls who lack a body with the most-worn one that did), never a body with
  // nothing to ever play
  if (!clips.length) { console.info(`[crowd] #${n}: no clip baked, treating her like a download that failed`); return null; }
  // back to the rest pose before anything is cloned
  vrm.humanoid.resetNormalizedPose();
  vrm.humanoid.update();
  // the T-pose check's anchor bones: both upper arms, plus the hips so a rig whose arm names this
  // view cannot resolve still has something to catch her frozen at bind (never silently waved through)
  const arms = (["leftUpperArm", "rightUpperArm", "hips"] as const).map(b => vrm.humanoid.getRawBoneNode(b)?.name ?? "");
  return { n, body, clips, legScale: Math.min(1.6, Math.max(0.5, (hipsY * scale) / SRC_HIPS)), hand: vrm.humanoid.getRawBoneNode("rightHand")?.name ?? "", arms };
}
