// Pockit Milady models (prnth's Pockit repo, pinned to one commit): fetched on demand with a fallback
// CDN, parsed per goon, lit, scaled so the Head bone sits where the sim's hit skeleton expects it, and
// given the Radbro clips retargeted onto their rig. Never blocks the game: a goon shows a stand-in
// until its model is ready and keeps it when the fetch fails.
import { AnimationClip, AnimationUtils, Group, Vector3, type Material, type Mesh, type Object3D } from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import type { VRM } from "@pixiv/three-vrm";
import { parseVrm } from "./loadVrm.ts";
import { RADBRO_RIG, retargetClip } from "./retarget.ts";
import { MILADY_HEAD_BONE } from "../combat/hitboxes.ts";

/** prnthh/Pockit main at the time of writing (same pin as RadRun); bump deliberately. */
export const POCKIT_SHA = "8009d19eb16815e2f5e39f0fb7adaac69cf691c8";
const TIMEOUT_MS = 12_000;

export const pockitUrls = (n: number) => [
  `https://raw.githubusercontent.com/prnthh/Pockit/${POCKIT_SHA}/web/${n}.vrm`,
  `https://cdn.jsdelivr.net/gh/prnthh/Pockit@${POCKIT_SHA}/web/${n}.vrm`,
];

const bytes = new Map<number, Promise<{ buf: ArrayBuffer; url: string } | null>>();

/** Start (once per number) the download of a model. */
export function fetchPockit(n: number): Promise<{ buf: ArrayBuffer; url: string } | null> {
  let p = bytes.get(n);
  if (p) return p;
  p = (async () => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      for (const url of pockitUrls(n)) {
        try {
          const r = await fetch(url, { mode: "cors", signal: ctl.signal });
          if (r.ok) return { buf: await r.arrayBuffer(), url };
          console.info(`[milady] ${r.status} for #${n}`);
        } catch (e) {
          if (ctl.signal.aborted) break;
          console.info(`[milady] fetch failed for #${n}: ${String(e)}`);
        }
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  })();
  bytes.set(n, p);
  return p;
}

/** The clips a goon uses, by name: the shooter set (milady.gun.glb, Radbro rig) first, RadRun's as fallbacks. */
export const GOON_CLIPS = [
  "Aim_Idle", "Aim_Walk_Fwd", "Aim_Walk_Back", "Aim_Strafe_L", "Aim_Strafe_R", "Aim_Run", "Cover_Crouch_Idle", "Hit_Small",
  "Death_Back", "Death_Back_2", "Death_Fwd", "Death_Fwd_2", "Idle", "Casual_Walk", "Run_02", "Falling_Down", "Big_Land",
];
/** Clips that keep their root travel on the Miladys (bodies fly / fall where the clip puts them). */
const TRAVEL = /^(Death_|Falling_Down)/;

export type LoadedGoon = {
  vrm: VRM;
  /** Wrapper (scaled) holding vrm.scene. */
  body: Group;
  clips: AnimationClip[];
  scale: number;
  blink: boolean;
  pain: string | null;
  materials: Material[];
  /** Big_Land's deepest crouch time (the cover pose), if the clip exists. */
  crouchAt: number;
  /** Additive flinch (Hit_Small without root motion), if the clip exists. */
  hit: AnimationClip | null;
  /** Mouth expression for talking, if bound. */
  talk: string | null;
  /** Right forearm length in the model's own units (scales the pistol grip). */
  forearm: number;
  vrm0: boolean;
};

function lit(vrm: VRM): Material[] {
  const out: Material[] = [];
  vrm.scene.traverse(o => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const convert = (m: Material) => {
      const src = m as unknown as { map?: unknown; color?: unknown; transparent: boolean; opacity: number; side: number; alphaTest: number; depthWrite: boolean };
      const mat = new MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0 });
      Object.assign(mat, { map: src.map ?? null, transparent: src.transparent, opacity: src.opacity, side: src.side, alphaTest: src.alphaTest, depthWrite: src.depthWrite });
      if (src.color && typeof (src.color as { clone?: () => unknown }).clone === "function") (mat as unknown as { color: { copy: (c: unknown) => void } }).color.copy(src.color);
      // a small emissive lift of the same texture: the gang reads under the neon instead of going black
      if (src.map) {
        Object.assign(mat, { emissiveMap: src.map, emissiveIntensity: 0.24 });
        mat.emissive.set("#ffffff");
      }
      m.dispose();
      out.push(mat);
      return mat;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  });
  return out;
}

/** Parse + light + scale + retarget one goon's model. `sources` = Radbro GLB roots carrying clips. */
export async function buildGoon(n: number, sources: Object3D[]): Promise<LoadedGoon | null> {
  const got = await fetchPockit(n);
  if (!got) return null;
  const { vrm } = await parseVrm(got.buf.slice(0), got.url);
  const materials = lit(vrm);
  vrm.scene.updateMatrixWorld(true);
  const lower = vrm.humanoid?.getNormalizedBoneNode("rightLowerArm");
  const hand = vrm.humanoid?.getNormalizedBoneNode("rightHand");
  const forearm = lower && hand ? lower.getWorldPosition(new Vector3()).distanceTo(hand.getWorldPosition(new Vector3())) : 0.217;
  const head = vrm.humanoid?.getNormalizedBoneNode("head");
  const headY = head ? head.getWorldPosition(new Vector3()).y : 1.6;
  const scale = headY > 0.3 ? MILADY_HEAD_BONE / headY : 1;
  const body = new Group();
  body.name = `milady-${n}`;
  body.scale.setScalar(scale);
  body.add(vrm.scene);
  const clips: AnimationClip[] = [];
  const seen = new Set<string>();
  for (const src of sources) {
    const list = ((src as unknown as { animations?: AnimationClip[] }).animations ?? []) as AnimationClip[];
    for (const c of list) {
      if (!GOON_CLIPS.includes(c.name) || seen.has(c.name)) continue;
      seen.add(c.name);
      try {
        clips.push(retargetClip(c, src, vrm, RADBRO_RIG, { inPlace: !TRAVEL.test(c.name), alignRestPose: true }));
      } catch (e) {
        console.info(`[milady] retarget ${c.name} failed on #${n}: ${String(e)}`);
      }
    }
  }
  const em = vrm.expressionManager;
  const bound = (name: string) => (em?.getExpression(name)?.binds.length ?? 0) > 0;
  const pain = ["sorrow", "sad", "angry", "surprised"].find(bound) ?? null;
  const talk = ["aa", "a", "oh", "ou"].find(bound) ?? null;
  let hit: AnimationClip | null = null;
  const hc = clips.find(c => c.name === "Hit_Small");
  if (hc) {
    hit = hc.clone();
    hit.name = "Hit_Small_add";
    hit.tracks = hit.tracks.filter(t => !t.name.endsWith(".position"));
    AnimationUtils.makeClipAdditive(hit);
  }
  // deepest crouch in Big_Land: the lowest key of the hips position track
  let crouchAt = -1;
  const land = clips.find(c => c.name === "Big_Land");
  const hipsTrack = land?.tracks.find(t => t.name.endsWith(".position"));
  if (hipsTrack) {
    let lo = Infinity;
    for (let i = 0; i < hipsTrack.times.length; i++) {
      const y = hipsTrack.values[i * 3 + 1];
      if (y < lo) { lo = y; crouchAt = hipsTrack.times[i]; }
    }
  }
  return { vrm, body, clips, scale, blink: bound("blink"), pain, materials, crouchAt, hit, talk, forearm, vrm0: vrm.meta?.metaVersion === "0" };
}
