// The rave crowd (round-2 plan sections 2 and 10.2): the sim's dancers (sim/crowd.ts) as Pockit girls.
//   A pool of six Pockit models (the crowd's seeded numbers; the bouncer is always #42): the templates
//   come from the room's warm-up (warmup.ts, vrm/crowdModel.ts: lit, scaled like the gang, the rave's
//   clips baked onto the model's RAW bones), so every girl who wears one is a cheap SkeletonUtils clone
//   with her own mixer (updated at 30 Hz) and her own slight tint. A girl is shown only once her clip
//   has posed her (never a frame of bind pose); a model that never comes is replaced by one that did,
//   and until then she is the stand-in girl (standIn.ts), who dances, sits and runs like the sim says.
//   dance / drink / sit -> Startle -> Flee_Run(_2) at the body speed over the clip's ground speed
//   (scaled to her legs: no skating) -> gone at the door; Cower_Idle when there is no way out.
// They must never read as a threat: empty hands (the dancers hold a cyan glow stick, the only cyan
// light on any body), no hostile rim (not "goon-" roots), a small lift (0.12 against the gang's 0.32)
// and 25 % less colour. Quality Low shows at most 12 of them.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAssetRuntime } from "react-three-game";
import { AnimationMixer, CapsuleGeometry, Color, Group, LoopOnce, LoopRepeat, Mesh, MeshBasicMaterial, Quaternion, type AnimationAction, type Material, type Object3D, type SkinnedMesh } from "three";
import type { MeshStandardNodeMaterial } from "three/webgpu";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Session } from "./session.ts";
import type { Dancer } from "../sim/crowd.ts";
import type { CrowdModel } from "../vrm/crowdModel.ts";
import { MILADY_R2 } from "./characters.ts";
import { FRAME } from "./frame.ts";
import { useUi } from "../ui/store.ts";
import { CROWD } from "../sim/tuning.ts";
import { crowdClipsFor, crowdModel, crowdNumbers } from "./warmup.ts";
import { CROWD_LOOK, animateStandIn, makeStandIn, type StandIn } from "./standIn.ts";

const NO_MILADY = new URLSearchParams(location.search).get("milady") === "0";
/** Each dance's rate at the club's 128 BPM (the clip manifest's rate128), clamped so no girl looks
 *  slowed down or sped up (REVIEW polish: the weak tempo estimates). */
const RATE128: Record<string, number> = { Dance_1: 1.067, Dance_2: 0.7, Dance_3: 0.951, Dance_4: 0.898, Dance_5: 1.244, Dance_6: 1.313 };
const DANCE_RATE = [0.85, 1.15] as const;
/** Planted-foot speeds of the flee loops on the source rig (hips 0.736 m), measured from the clips. */
const FLEE_SPEED: Record<string, number> = { Flee_Run: 3.12, Flee_Run_2: 2.71 };
const LOW_MAX = 12;
const MIXER_HZ = 30;

type Girl = {
  i: number;
  root: Group;
  standIn: Group;
  si: StandIn;
  body: Object3D | null;
  mixer: AnimationMixer | null;
  actions: Map<string, AnimationAction>;
  clip: string;
  legScale: number;
  materials: Material[];
  stick: Mesh | null;
  acc: number;
  tint: Color;
  /** Her body has been posed by a clip (until then the stand-in shows). */
  posed: boolean;
  /** Her upper arms' bones and their bind rotations (the T-pose check). */
  arms: Array<[Object3D, Quaternion]>;
  /** The model number she wears (another one when hers never came). */
  wears: number;
  /** Updates in a row in the bind pose. */
  tpose: number;
};

const stickGeo = new CapsuleGeometry(0.018, 0.2, 3, 8);
const stickMat = new MeshBasicMaterial({ color: new Color(0.25, 1.2, 1.3), toneMapped: false });
stickMat.userData.rpOwn = true;

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
    const si = makeStandIn(CROWD_LOOK);
    root.add(si.root);
    const tint = new Color().setHSL(k01(i, 3), 0.25, 0.5).lerp(new Color(1, 1, 1), 0.82);
    return { i, root, standIn: si.root, si, body: null, mixer: null, actions: new Map(), clip: "", legScale: 1.4, materials: [], stick: null, acc: 0, tint, posed: false, arms: [], wears: 0, tpose: 0 };
  }), [people]);

  useEffect(() => {
    for (const g of girls) group.add(g.root);
    let cancelled = false;
    /** Dress every girl who wears model `m` (or, `stand`: every girl still without a body). */
    const dress = (m: CrowdModel, stand = false) => {
      let worn = 0;
      for (const g of girls) {
        if (g.body || (!stand && people[g.i].milady !== m.n)) continue;
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
        // the T-pose check: her upper arms and their bind rotations
        g.arms = [];
        for (const name of m.arms) {
          const b = name ? body.getObjectByName(name) : undefined;
          if (b) g.arms.push([b, b.quaternion.clone()]);
        }
        g.body = body;
        g.mixer = mixer;
        g.legScale = m.legScale;
        g.clip = "";
        g.posed = false;
        g.wears = m.n;
        body.visible = false; // shown once her clip has posed her (the frame loop)
        g.root.add(body);
        worn++;
      }
      console.info(`[crowd] #${m.n} ready (${m.clips.length} clips) for ${worn} girls${stand ? " (standing in for a model that did not come)" : ""}`);
    };
    if (!NO_MILADY && source && people.length) {
      void (async () => {
        const nums = crowdNumbers(s);
        const got = await Promise.all(nums.map(n => (crowdModel(n, crowdClipsFor(s, n)) ?? Promise.resolve(null)).then(m => { if (m && !cancelled) dress(m); return m; })));
        if (cancelled) return;
        // a model that never came: its girls wear the most-worn one that did (a different face, not a pill)
        const spare = got.find(m => !!m);
        if (spare && girls.some(g => !g.body)) dress(spare, true);
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
  }, [girls, group, source, people, s]);

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
      if (g.standIn.visible) {
        // the stand-in girl moves like the sim says (dances, sits, runs with her legs, cowers)
        const mode = p.state === "flee" || p.state === "gone" ? "walk" : p.state === "cower" ? "cower" : p.state === "startle" ? "idle"
          : p.clip.startsWith("Dance_") ? "dance" : p.clip === "Sit_Idle" ? "sit" : "idle";
        animateStandIn(g.si, mode, wdt, p.speed);
      }
      if (!g.mixer || !g.body) continue;
      // the clip for her state
      let want = p.clip, rate = 1, once = false;
      if (p.state === "startle") { want = "Startle"; once = true; }
      else if (p.state === "flee" || (p.state === "gone" && g.clip.startsWith("Flee"))) {
        want = g.i % 3 === 0 ? "Flee_Run" : "Flee_Run_2";
        rate = Math.max(0.55, Math.min(1.6, Math.max(p.speed, CROWD.flee * 0.5) / (FLEE_SPEED[want] * g.legScale)));
      } else if (p.state === "cower") want = "Cower_Idle";
      else if (RATE128[want]) rate = Math.max(DANCE_RATE[0], Math.min(DANCE_RATE[1], RATE128[want]));
      if (!g.actions.has(want)) want = g.actions.has("Drink_Idle") ? "Drink_Idle" : [...g.actions.keys()][0] ?? want;
      const next = g.actions.get(want);
      let changed = false;
      if (next && want !== g.clip) {
        const prev = g.actions.get(g.clip);
        next.reset();
        next.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
        next.clampWhenFinished = once;
        if (!g.clip && !once) next.time = p.phase * next.getClip().duration; // the dancers are not in step
        next.setEffectiveTimeScale(rate).setEffectiveWeight(1).play();
        if (prev && g.posed) { prev.fadeOut(0.18); next.fadeIn(0.18); } else prev?.stop();
        g.clip = want;
        changed = true;
      } else next?.setEffectiveTimeScale(rate);
      // mixers at 30 Hz of world time (bullet time slows them with the rest); at once for a new clip
      // or a girl not yet shown, so no frame ever draws her in the bind pose
      g.acc += wdt;
      if (g.acc >= 1 / MIXER_HZ || changed || !g.posed) {
        g.mixer.update(g.acc);
        g.acc = 0;
        const bind = g.arms.length > 0 && g.arms.every(([b, q]) => Math.abs(b.quaternion.dot(q)) > 0.9997);
        if (!g.posed) {
          if (next && !bind) { g.posed = true; g.body.visible = true; g.standIn.visible = false; g.tpose = 0; }
          else if (++g.tpose === 30) console.info(`[crowd] girl ${g.i} (#${g.wears}): "${want}" leaves her in the bind pose; she stays a stand-in`);
        } else if (bind) {
          // posed before, the bind pose now: her clip again from the top (and the stand-in if it persists)
          if (++g.tpose === 3) { console.info(`[crowd] girl ${g.i} (#${g.wears}): bind pose on "${g.clip}", replaying it`); g.clip = ""; }
          else if (g.tpose >= 12) { g.posed = false; g.body.visible = false; g.standIn.visible = true; }
        } else g.tpose = 0;
      }
    }
  }, FRAME.animator);

  return <primitive object={group} />;
}
