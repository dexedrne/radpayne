// The rave crowd (round-2 plan sections 2 and 10.2): the sim's dancers (sim/crowd.ts) as Pockit girls.
//   A pool of six Pockit models (the crowd's seeded numbers; the bouncer is always #42), each parsed
//   once, lit, scaled like the gang, and given the rave's clips (milady.r2.glb, retargeted like the
//   gang's); the clips are then baked onto the model's RAW bones, so every girl who wears that model
//   is a cheap SkeletonUtils clone with her own mixer (updated at 30 Hz) and her own slight tint.
//   dance / drink / sit -> Startle -> Flee_Run(_2) at the body speed over the clip's ground speed
//   (scaled to her legs: no skating) -> gone at the door; Cower_Idle when there is no way out.
// They must never read as a threat: empty hands (the dancers hold a cyan glow stick, the only cyan
// light on any body), no hostile rim (not "goon-" roots), a small lift (0.12 against the gang's 0.32)
// and 25 % less colour. Quality Low shows at most 12 of them.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAssetRuntime } from "react-three-game";
import {
  AnimationClip, AnimationMixer, CapsuleGeometry, Color, Group, LoopOnce, LoopRepeat, Mesh, MeshBasicMaterial, MeshStandardMaterial, QuaternionKeyframeTrack, SphereGeometry, Vector3,
  VectorKeyframeTrack, type AnimationAction, type Material, type Object3D, type SkinnedMesh, type Texture,
} from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { float, luminance, materialColor, mix, texture, vec3, vec4 } from "three/tsl";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { Session } from "./session.ts";
import type { Dancer } from "../sim/crowd.ts";
import { parseVrm } from "../vrm/loadVrm.ts";
import { fetchPockit } from "../vrm/pockit.ts";
import { RADBRO_RIG, retargetClip } from "../vrm/retarget.ts";
import { MILADY_HEAD_BONE } from "../combat/hitboxes.ts";
import { MILADY_R2 } from "./characters.ts";
import { FRAME } from "./frame.ts";
import { useUi } from "../ui/store.ts";
import { CROWD } from "../sim/tuning.ts";

const NO_MILADY = new URLSearchParams(location.search).get("milady") === "0";
/** The clips a crowd model needs. */
const CROWD_CLIPS = ["Dance_1", "Dance_2", "Dance_3", "Dance_4", "Dance_5", "Dance_6", "Drink_Idle", "Sit_Idle", "Startle", "Flee_Run", "Flee_Run_2", "Cower_Idle", "DJ_Idle"];
/** Each dance's rate at the club's 128 BPM (the clip manifest's rate128), clamped so no girl looks
 *  slowed down or sped up (REVIEW polish: the weak tempo estimates). */
const RATE128: Record<string, number> = { Dance_1: 1.067, Dance_2: 0.7, Dance_3: 0.951, Dance_4: 0.898, Dance_5: 1.244, Dance_6: 1.313 };
const DANCE_RATE = [0.85, 1.15] as const;
/** Planted-foot speeds of the flee loops on the source rig (hips 0.736 m), measured from the clips. */
const FLEE_SPEED: Record<string, number> = { Flee_Run: 3.12, Flee_Run_2: 2.71 };
const SRC_HIPS = 0.736;
/** Crowd look (plan section 8): the lift and the colour they keep. */
const LIFT = 0.12;
const DESAT = 0.25;
const LOW_MAX = 12;
const MIXER_HZ = 30;

type Model = { n: number; body: Group; clips: AnimationClip[]; legScale: number; hand: string };
type Girl = {
  i: number;
  root: Group;
  standIn: Group;
  body: Object3D | null;
  mixer: AnimationMixer | null;
  actions: Map<string, AnimationAction>;
  clip: string;
  legScale: number;
  materials: Material[];
  stick: Mesh | null;
  acc: number;
  tint: Color;
};

const standBody = new CapsuleGeometry(0.19, 0.5, 4, 10);
const standHead = new SphereGeometry(0.17, 12, 10);
const standMat = new MeshStandardMaterial({ color: "#6f6878", roughness: 0.8 });
const stickGeo = new CapsuleGeometry(0.018, 0.2, 3, 8);
const stickMat = new MeshBasicMaterial({ color: new Color(0.25, 1.2, 1.3), toneMapped: false });
stickMat.userData.rpOwn = true;

function standIn(): Group {
  const g = new Group();
  const b = new Mesh(standBody, standMat);
  b.position.y = 1.0;
  const h = new Mesh(standHead, standMat);
  h.position.y = 1.62;
  g.add(b, h);
  return g;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c: any = materialColor;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rgb: any = mix(c.rgb, vec3(luminance(c.rgb)), float(DESAT));
      mat.colorNode = vec4(rgb, src.map ? texture(src.map as Texture).a : float(1));
      mat.emissiveNode = rgb.mul(LIFT);
      m.dispose();
      return mat;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material);
  });
}

/** Bake a clip that drives the VRM's normalized bones into one that drives its raw bones (so a plain
 *  SkeletonUtils clone of the model can play it without a VRM runtime). */
function bakeRaw(vrm: VRM, clip: AnimationClip, fps = 30): AnimationClip {
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
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(vrm.scene);
  const tracks: Array<QuaternionKeyframeTrack | VectorKeyframeTrack> = bones.map((b, k) => new QuaternionKeyframeTrack(`${b.name}.quaternion`, times, rot[k]));
  if (hips) tracks.push(new VectorKeyframeTrack(`${hips.name}.position`, times, pos));
  return new AnimationClip(clip.name, clip.duration, tracks);
}

/** Parse, light, scale and give the rave clips to one Pockit model (the template the girls clone). */
async function buildModel(n: number, source: Object3D): Promise<Model | null> {
  const got = await fetchPockit(n);
  if (!got) return null;
  const { vrm } = await parseVrm(got.buf.slice(0), got.url);
  // the loader parks the VRM on its own scene's userData: a clone would try to copy that (a cycle)
  delete vrm.scene.userData.vrm;
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
  const list = ((source as unknown as { animations?: AnimationClip[] }).animations ?? []).filter(c => CROWD_CLIPS.includes(c.name));
  const clips: AnimationClip[] = [];
  for (const c of list) {
    try {
      // everything here is baked on the spot already (dances, seats): never pin the hips
      clips.push(bakeRaw(vrm, retargetClip(c, source, vrm, RADBRO_RIG, { inPlace: /^Flee_Run/.test(c.name), alignRestPose: true })));
    } catch (e) {
      console.info(`[crowd] retarget ${c.name} failed on #${n}: ${String(e)}`);
    }
  }
  // back to the rest pose before anything is cloned
  vrm.humanoid.resetNormalizedPose();
  vrm.humanoid.update();
  return { n, body, clips, legScale: Math.min(1.6, Math.max(0.5, (hipsY * scale) / SRC_HIPS)), hand: vrm.humanoid.getRawBoneNode("rightHand")?.name ?? "" };
}

/** Deterministic 0..1 per girl (tints, start phases that the sim does not already give). */
const k01 = (i: number, salt: number) => { const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x); };

export function CrowdView({ s }: { s: Session }) {
  const assets = useAssetRuntime();
  const version = useUi(st => st.assetsVersion);
  const low = useUi(st => st.quality) === "low";
  // the crowd is the same on every attempt of a room (same level, same seed): build it once per session
  const people = useMemo(() => s.game.crowd.people, [s]);
  const source = version > 0 ? assets.getModel(MILADY_R2) : null;
  const group = useMemo(() => new Group(), []);
  const girls = useMemo<Girl[]>(() => people.map((_p, i) => {
    const root = new Group();
    root.name = `crowd-${i}`;
    root.userData.rpActor = true;
    const si = standIn();
    root.add(si);
    const tint = new Color().setHSL(k01(i, 3), 0.25, 0.5).lerp(new Color(1, 1, 1), 0.82);
    return { i, root, standIn: si, body: null, mixer: null, actions: new Map(), clip: "", legScale: 1.4, materials: [], stick: null, acc: 0, tint };
  }), [people]);

  useEffect(() => {
    for (const g of girls) group.add(g.root);
    let cancelled = false;
    if (!NO_MILADY && source && people.length) {
      const numbers = [...new Set(people.map(p => p.milady))];
      void (async () => {
        for (const n of numbers) {
          if (cancelled) return;
          let m: Model | null = null;
          try { m = await buildModel(n, source); } catch (e) { console.info(`[crowd] #${n} failed: ${String(e)}`); }
          if (cancelled) return;
          if (!m) continue;
          let worn = 0;
          for (const g of girls) {
            if (people[g.i].milady !== n || g.body) continue;
            const body = cloneSkeleton(m.body);
            body.userData.rpActor = true;
            // her own materials: a slight tint on the whole outfit
            body.traverse(o => {
              const mesh = o as SkinnedMesh;
              if (!mesh.isMesh) return;
              const conv = (mm: Material) => { const c = mm.clone() as MeshStandardNodeMaterial; c.color.multiply(g.tint); g.materials.push(c); return c; };
              mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material);
              mesh.frustumCulled = false;
            });
            const mixer = new AnimationMixer(body);
            for (const c of m.clips) g.actions.set(c.name, mixer.clipAction(c));
            // the dancers' glow stick in the right hand (not the bar, the booths or the bouncer)
            if (/^Dance_/.test(people[g.i].clip) && m.hand) {
              const hand = body.getObjectByName(m.hand);
              if (hand) {
                const stick = new Mesh(stickGeo, stickMat);
                stick.position.set(0, -0.06 / m.body.scale.x, 0.02 / m.body.scale.x);
                stick.rotation.x = 1.2;
                stick.scale.setScalar(1 / m.body.scale.x);
                hand.add(stick);
                g.stick = stick;
              }
            }
            g.body = body;
            g.mixer = mixer;
            g.legScale = m.legScale;
            g.clip = "";
            g.root.add(body);
            g.standIn.visible = false;
            worn++;
          }
          console.info(`[crowd] #${n} ready (${m.clips.length} clips) for ${worn} girls`);
          await new Promise(r => setTimeout(r, 30));
        }
      })();
    }
    return () => {
      cancelled = true;
      for (const g of girls) {
        group.remove(g.root);
        g.mixer?.stopAllAction();
        for (const m of g.materials) m.dispose();
        g.materials.length = 0;
        if (g.body) { g.root.remove(g.body); g.body = null; g.mixer = null; g.actions.clear(); }
        g.standIn.visible = true;
      }
    };
  }, [girls, group, source, people]);

  const run = useRef(-1);
  useFrame((_, raw) => {
    const crowd = s.game.crowd;
    const dt = Math.min(raw, 0.1);
    const wdt = s.paused ? 0 : dt * s.game.timeScale;
    if (run.current !== s.run) { run.current = s.run; for (const g of girls) g.clip = ""; }
    let shown = 0;
    for (const g of girls) {
      const p: Dancer | undefined = crowd.people[g.i];
      if (!p) { g.root.visible = false; continue; }
      // quality low: every other girl, 12 at most (the bouncer always)
      const keep = !low || p.role === "bouncer" || (g.i % 2 === 0 && shown < LOW_MAX - 1);
      g.root.visible = keep && p.fade > 0.5;
      if (!g.root.visible) continue;
      shown++;
      g.root.position.set(p.x, p.y, p.z);
      g.root.rotation.y = p.facing;
      if (!g.mixer) continue;
      // the clip for her state
      let want = p.clip, rate = 1, once = false;
      if (p.state === "startle") { want = "Startle"; once = true; }
      else if (p.state === "flee" || (p.state === "gone" && g.clip.startsWith("Flee"))) {
        want = g.i % 3 === 0 ? "Flee_Run" : "Flee_Run_2";
        rate = Math.max(0.55, Math.min(1.6, Math.max(p.speed, CROWD.flee * 0.5) / (FLEE_SPEED[want] * g.legScale)));
      } else if (p.state === "cower") want = "Cower_Idle";
      else if (RATE128[want]) rate = Math.max(DANCE_RATE[0], Math.min(DANCE_RATE[1], RATE128[want]));
      if (!g.actions.has(want)) want = g.actions.has("Drink_Idle") ? "Drink_Idle" : want;
      const next = g.actions.get(want);
      if (next && want !== g.clip) {
        const prev = g.actions.get(g.clip);
        next.reset();
        next.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
        next.clampWhenFinished = once;
        if (!g.clip && !once) next.time = p.phase * next.getClip().duration; // the dancers are not in step
        next.setEffectiveTimeScale(rate).setEffectiveWeight(1).play();
        if (prev) { prev.fadeOut(0.18); next.fadeIn(0.18); }
        g.clip = want;
      } else next?.setEffectiveTimeScale(rate);
      // mixers at 30 Hz of world time (bullet time slows them with the rest)
      g.acc += wdt;
      if (g.acc >= 1 / MIXER_HZ || (wdt > 0 && !g.clip)) {
        g.mixer.update(g.acc);
        g.acc = 0;
      }
    }
  }, FRAME.animator);

  return <primitive object={group} />;
}
