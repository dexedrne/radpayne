// The player's Radbro: RadRun's game character driven from the sim with the shooter clip set.
//   -5 actors: root placement + facing, the clip for the state. The body faces the aim; the legs pick
//      aimed forward / back / strafe clips by the move direction (a small leg yaw for diagonals, the
//      spine twists back). Shift: Shootdodge -> Prone_Idle -> Prone_GetUp (or Land_Roll into a run).
//   -4 animator: mixer on the player's clock (0.5x in bullet time; the dive chain runs in real time).
//   -3 bones: spine twist + pitch toward the aim, both arms onto the crosshair point, recoil kicks,
//      the reload layer (upper body) and the additive hit flinch; the guns sit in the hands at the clip
//      set's grips and are never turned inside the fist (the one-handed guns aim with the wrist).
// Round 2: the dual SMGs ride the pistol clips and grips, the arms spread wide so both clear his hair
// from the shoulder camera; the shotgun plays the long-gun set (Shotgun_*, radbro<id>.r2.glb) for the
// body, the fire / reload as upper-body layers that rack the pump. Weapon_Swap plays on a switch; the guns
// change hands at its "swap" point (0.23 s).
// The long-gun hold (arsenal spec 1.2-1.4, anim/hold.ts): the shotgun and #250's AK are shouldered as the
// clips hold them, turned about the butt onto the crosshair, lowered to a low ready when he is not
// shooting, and both hands are solved onto the gun with two-bone arm IK every frame (the right on the
// grip, the left on the pump / handguard, riding the clip's rack and feed; the AK's mag change is a
// scripted left-hand path). The shoulder camera moves out and down while a long gun is out (CameraView).
// #4764's katana: worn on his left hip (the model's rigid `Katana` node on the hips: scabbard and hilt);
// drawn for the cut and for the guard, when the hip's hilt goes and the drawn blade is in his hand. The
// guard (the melee button held) holds it across his body in both hands: the game places the blade (grip
// in front of his chest, the tip up to his left, the edge out) and both arms are solved onto its hilt
// with the two-bone IK, the right hand at the guard, the left below it; the guns wait.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAssetRuntime } from "react-three-game";
import { AdditiveBlending, AnimationMixer, AnimationUtils, BackSide, Box3, BufferGeometry, Euler, Group, LoopOnce, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3, type AnimationAction, type Camera, type PerspectiveCamera, type AnimationClip, type Bone, type Material, type Object3D } from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Session } from "./session.ts";
import { AnimPlayer } from "../anim/animPlayer.ts";
import { CLIPS, SHOTGUN_CLIPS, UPPER_BODY, aimLimb, deathFor, findBone, pick, rotateBoneWorld } from "../anim/rig.ts";
import { RADBRO_GRIPS, SHOTGUN_SCALE } from "../anim/grips.ts";
import { LONG_GUN_GEOM, LongGunHold, READY } from "../anim/hold.ts";
import { setWorldQuaternion, solveTwoBone } from "../anim/ik.ts";
import { RADBRO_GAIT, RUN_FROM, clipSpeed, legsFor } from "../anim/gait.ts";
import { clipsPath, gunClipsPath, lightUp, modelPath, r2ClipsPath } from "./characters.ts";
import { SHOTGUN_PUMP, SHOTGUN_RACK, aimHand, attachGun, makeAk, makeGrenade, makeHandCannon, makeKatana, makePistol, makeSawedOff, makeShotgun, makeSmg, makeSniper, muzzleWorld } from "./guns.ts";
import { useUi, type HeroId } from "../ui/store.ts";
import { FRAME } from "./frame.ts";
import { MELEE, TIME } from "../sim/tuning.ts";
import { WEAPONS, isLongGun, isOneHand } from "../combat/weapons.ts";
import { SHOULDER, wrapAngle } from "../sim/aim.ts";
import { tucked } from "../sim/cover.ts";
import { camView } from "./CameraView.tsx";
import { holdDev } from "./dev/holdcheck.ts";

const UP = new Vector3(0, 1, 0);
/** Player pistol size over true scale. */
const GUN_SCALE = 1.3;
/** The SMGs a little smaller (their body is longer than the pistol's slide). */
const SMG_SCALE = 1.2;
/** Weapon_Swap: the guns change hands at this point of the clip (real seconds at the player's clock). */
const SWAP_AT = 0.23;
/** His shotgun a little chunkier across than the heavies' (it is what the shoulder camera sees most). */
const SHOTGUN_THICK_PLAYER = 1.55;
/** His long guns run this much further ahead of the pump / handguard (gun space, before the length
 *  scale): the front reaches past his shoulder into the clear zone below-left of the crosshair. */
const PLAYER_FRONT = { shotgun: 0.13, ak: 0.12, sniper: 0.1 } as const;
/** The one-handed guns' size over true scale, and their recoil at the elbow (rad). Well over the pistols'
 *  size: from over the shoulder the hand cannon must not read as one more pistol, nor the sawed-off as a speck. */
const ONE_HAND = { handcannon: { scale: 1.65, kick: 0.45 }, sawedoff: { scale: 1.5, kick: 0.4 } } as const;
/** The melee's arm arc (his frame: right, up, forward from the chest, metres) from its start to its end,
 *  the share of the swing spent cutting, the spine's turn over it (rad). */
const SWING = {
  katana: { from: [0.55, 0.55, 0.35], to: [-0.55, -0.35, 0.55], cut: 0.4, twist: [-0.6, 0.4] },
  strike: { from: [0.45, 0.25, 0.25], to: [-0.25, -0.05, 0.6], cut: 0.35, twist: [-0.45, 0.35] },
} as const;
/** The throw's left-hand arc (his frame, from the chest): back and up, then out forward; seconds. */
const THROW = { from: [-0.35, 0.5, -0.25], to: [-0.1, 0.55, 0.75], time: 0.4 } as const;
/** The frag held up (the grenade button held, the aim preview on): the left hand up and back beside his
 *  head, where the lob starts (THROW.from), with the frag in it; in / out (s). A release goes straight
 *  into the lob from there. */
const RAISE = { in: 0.12, out: 0.1 } as const;
/** The left hand's place for the throw this frame (his frame off the chest). */
const THROW_AT = [0, 0, 0];
/** #4764's guard (his frame off the chest bone: right, up, forward): the drawn katana's grip, the way the
 *  blade points (across him from his left hip up past his right shoulder, a little out: from the camera
 *  over that shoulder it shows beside his head), how far below the right hand the left grips the
 *  hilt (m), the elbows' poles, the chest's turn (rad, to his right), in / out (s). */
const GUARD_POSE = {
  grip: [-0.02, -0.1, 0.3] as [number, number, number],
  blade: [0.75, 0.62, 0.25] as [number, number, number],
  left: 0.11,
  poleR: [0.55, -0.8, -0.15] as [number, number, number],
  poleL: [-0.55, -0.8, 0.1] as [number, number, number],
  twist: 0,
  in: 0.05,
  out: 0.1,
};
/** The katana's grip turned for the left hand: the right's (the blade rising from the fist) mirrored. */
const KATANA_TIP = new Euler(-1.15, 0.35, 0);
const KATANA_TIP_LEFT = new Euler(-1.15, -0.35, 0);
const DEG = Math.PI / 180;
/** The long-gun hold's numbers (arsenal spec 1.2-1.4). */
const HOLD: { aimMax: number; aimMaxLying: number; pitch: readonly [number, number]; aimedFor: number; toAimed: number; toReady: number; cant: number; ikIn: number; ikOut: number; aimTwist: number } = {
  /** Aim correction about the butt (the spine carries the rest), and in a dive / prone. */
  aimMax: 22 * DEG,
  aimMaxLying: 25 * DEG,
  /** Spine pitch shares with a long gun (Spine01, Spine) instead of the pistols' 0.22 / 0.18: the chest
   *  carries three quarters of the aim's pitch, the hold's turn about the butt the rest. */
  pitch: [0.4, 0.35] as const,
  /** Shouldered for this long after a shot (the player's clock). */
  aimedFor: 1.2,
  /** Up to aimed / down to ready (seconds). */
  toAimed: 0.08,
  toReady: 0.35,
  /** Outward cant about the barrel (top toward his right): the receiver's top and right side show. */
  cant: 7 * DEG,
  /** IK in / out (seconds): in at a swap or a get-up, out at death. */
  ikIn: 0.12,
  ikOut: 0.15,
  /** The chest a little to his right while he aims (the hold turns the barrel back onto the crosshair
   *  about the butt): the gun then crosses the view instead of pointing straight away from the lens. */
  aimTwist: 0.28,
};
/** The AK's mag change as a path for the left palm over the reload (0..1 of it): [u, where], where = a
 *  point in gun space (gun units) or "belt" (his left hip): handguard -> the mag -> pulled out -> let go
 *  -> the belt -> a fresh mag under the well -> seated -> the handguard. The mag rides the palm over
 *  [0.12, 0.3) and [0.55, 0.85) and is gone in between. */
const AK_RELOAD: readonly (readonly [number, readonly [number, number, number] | "belt"])[] = [
  [0, [0.012, 0.005, 0.37]],
  [0.12, [0.02, -0.09, 0.17]],
  [0.25, [0.03, -0.22, 0.16]],
  [0.3, [0.05, -0.26, 0.1]],
  [0.5, "belt"],
  [0.55, "belt"],
  [0.75, [0.03, -0.22, 0.16]],
  [0.85, [0.02, -0.09, 0.17]],
  [1, [0.012, 0.005, 0.37]],
];
/** The mag's place on the AK and where the palm holds it (gun units). */
const AK_MAG_AT = new Vector3(0, -0.005, 0.15);
const AK_MAG_GRAB = new Vector3(0.02, -0.09, 0.17);
/** The rim round the frag in his hand (additive, unlit: ArsenalFx's live frags have the same). */
const HELD_HULL = new MeshBasicMaterial({ color: "#ffc46b", side: BackSide, transparent: true, opacity: 0.4, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
HELD_HULL.userData.rpOwn = true;
/** A gun drawn flat for the hold check's pixel count. */
const MASK = new MeshBasicMaterial({ color: "#ff00ff", toneMapped: false });
/** Lying with a long gun (dive / prone): the roll onto his left side (rad, about his forward axis; on the
 *  hips, or the spine when `spine`), the gun's extra cant (rad), the roll's weight through the get-up,
 *  in / out (s). His right shoulder comes up, and the gun under his cheek clears the big head and hair. */
const LIE = { roll: 0.6, spine: 0, cant: 0.3, getup: 0, in: 0.15, out: 0.3 };
/** The get-up with a long gun: the ready weight, the aim correction's clamp (rad), and where the clip
 *  starts (s): past the push-up, where his face is in the street and the gun under him, onto a knee. */
const GETUP = { ready: 1, aim: 22 * DEG, start: 0.8 };
/** Arms spread apart (radians off the aim line; right, left): the akimbo stance puts the right gun out
 *  past his big head and hair, where the shoulder camera sees it; the wrists bend the guns back onto
 *  the crosshair (aimHand). The dual SMGs go wide on both sides so the left one clears his hair too (the
 *  pistols keep the left one close: it is behind him from that camera). */
const ARM_SPREAD: Record<string, readonly [number, number]> = { pistols: [0.5, 0.25], smgs: [0.5, 0.95] };
/** Under this fade he is hidden outright: a dither this close to the lens breaks up into solid blobs. */
const HIDE_BELOW = 0.45;
/** How far he fades while his head covers the crosshair (stays above the guns' 0.6 cut-off). */
const CROSSHAIR_FADE = 0.36;
/** Head + hair ball for the crosshair test: radius and height of its centre over the Head bone (m). */
const HEAD_R = 0.36;
const HEAD_UP = 0.25;

const smooth = (k: number) => k * k * (3 - 2 * k);
const vHead = new Vector3();
const vRight = new Vector3(), vFwd = new Vector3(), vPath = new Vector3(), vA = new Vector3(), vB = new Vector3();
const box = new Box3();
/** 0..1: how much his head (a HEAD_R ball over the `head` bone) covers the crosshair zone in the middle of the view. */
function crosshairOverlap(cam: Camera, head: Vector3): number {
  const pc = cam as PerspectiveCamera;
  if (!pc.isPerspectiveCamera || head.lengthSq() === 0) return 0;
  vHead.copy(head);
  vHead.y += HEAD_UP; // the Head bone sits at his neck; the big chibi head is above it
  vHead.applyMatrix4(pc.matrixWorldInverse);
  const depth = -vHead.z;
  if (depth < 0.3) return 0;
  const t = depth * Math.tan((pc.fov * Math.PI) / 360); // half the view height at that depth
  const d = Math.hypot(vHead.x, vHead.y) / t - HEAD_R / t; // gap from the crosshair to his head's edge (1 = half the screen height)
  return 1 - Math.min(1, Math.max(0, (d - 0.02) / 0.12));
}

type Rig = {
  id: HeroId;
  root: Group;
  model: Object3D;
  player: AnimPlayer;
  materials: Material[];
  bones: Record<"hips" | "spine02" | "spine01" | "spine" | "neck" | "head" | "lClav" | "lArm" | "lFore" | "lHand" | "rClav" | "rArm" | "rFore" | "rHand", Bone | undefined>;
  guns: [Group, Group];
  smgs: [Group, Group];
  shotgun: Group;
  ak: Group;
  /** The arsenal: the one-handed guns, the long ones (the rifle is an AK), the katana, a frag. */
  handcannon: Group;
  sawedoff: Group;
  sniper: Group;
  rifle: Group;
  katana: Group;
  /** The model's hip katana, split: the hilt (it goes when the blade is drawn) and the scabbard. */
  hipHilt: Object3D | null;
  /** The left hand's grip on the katana (hand-bone space: position, rotation). */
  katanaLeft: { p: Vector3; q: Quaternion };
  grenade: Group;
  hit: AnimationAction | null;
  reload: AnimationAction | null;
  /** Upper-body layers of the round-2 pack (null without it). */
  sgFire: AnimationAction | null;
  sgReload: AnimationAction | null;
  swap: AnimationAction | null;
  /** The long-gun hold (null without the round-2 pack), and the base clips with their kind. */
  hold: LongGunHold | null;
  base: { clip: AnimationClip; long: boolean; run: boolean }[];
  /** Every bone's local pose as the mixer left it this frame (restored before the next mixer update:
   *  the mixer only writes a property whose value CHANGED, so a static track, like Shotgun_Aim_Idle's
   *  arms, would otherwise keep last frame's procedural layers and they would pile up). */
  pose: { bone: Bone; q: Quaternion; p: Vector3 }[];
};

/** Upper-body copy of a clip as a one-shot layer on the mixer. */
function upperLayer(mixer: AnimationMixer, clips: AnimationClip[], name: string, as: string): AnimationAction | null {
  const src = clips.find(c => c.name === name);
  if (!src) return null;
  const c = src.clone();
  c.name = as;
  c.tracks = c.tracks.filter(t => UPPER_BODY.test(t.name));
  const a = mixer.clipAction(c);
  a.setLoop(LoopOnce, 1);
  a.clampWhenFinished = true;
  return a;
}

/** Where the shotgun's pump sits along -z over a Shotgun_Fire / Shotgun_Reload (the left hand racks it). */
function rackAt(t: number, back: number): number {
  const u = (t - back) / 0.1;
  if (u <= 0 || u >= 2) return 0;
  return u < 1 ? u : 2 - u;
}

/** Rendered muzzles (hand 0 = right, 1 = left) for flashes and tracers. */
export const playerMuzzles: [Vector3, Vector3] = [new Vector3(), new Vector3()];
/** Rendered head / chest points (the kill cam and hit FX look at these). */
export const playerHead = new Vector3();
export const playerChest = new Vector3();
/** The long-gun hold for the camera: `aimed` 0..1 = how far the gun is up in the shoulder (0 with the
 *  one-handed guns and at the low ready). */
export const holdView = { aimed: 0 };

/** Screen-door fade on every material under `o`, except the pistols (their materials are shared with
 *  the gang's; the guns hide as a whole instead). */
function fadeTree(o: Object3D, fade: number): void {
  if (o.userData.rpGun) return;
  const mm = (o as Mesh).material;
  if (mm) {
    for (const m of Array.isArray(mm) ? mm : [mm]) {
      if (!m.alphaHash) { m.alphaHash = true; m.needsUpdate = true; }
      m.opacity = fade;
    }
  }
  for (const c of o.children) fadeTree(c, fade);
}

const clipsOf = (o: Object3D | null) => ((o as unknown as { animations?: AnimationClip[] } | null)?.animations ?? []) as AnimationClip[];

function makeRig(id: HeroId, src: Object3D, pack: Object3D | null, gunPack: Object3D | null, r2Pack: Object3D | null): Rig {
  const model = cloneSkeleton(src);
  const materials = lightUp(model);
  // screen-door fade when a wall pulls the camera into his back (no transparency sorting, no recompiles)
  for (const m of materials) m.alphaHash = true;
  const root = new Group();
  root.name = `radbro-${id}`;
  root.add(model);
  const pinY = new Set(["Regular_Jump", "Free_Fall", "Leap_of_Faith"]);
  const player = new AnimPlayer(model, [clipsOf(gunPack), clipsOf(r2Pack), clipsOf(src), clipsOf(pack)], {
    fade: 0.18,
    // deaths keep their travel (the body flies where the clip puts it); the game moves the capsule otherwise
    policy: name => ({ xz: name.startsWith("Death_") ? "keep" : "pin", y: pinY.has(name) ? "pin" : "keep" }),
  });
  const b = (n: string) => findBone(model, n);
  const bones = {
    hips: b("Hips"), spine02: b("Spine02"), spine01: b("Spine01"), spine: b("Spine"), neck: b("neck"), head: b("Head"),
    lClav: b("LeftShoulder"), lArm: b("LeftArm"), lFore: b("LeftForeArm"), lHand: b("LeftHand"),
    rClav: b("RightShoulder"), rArm: b("RightArm"), rFore: b("RightForeArm"), rHand: b("RightHand"),
  };
  // steel-slide pistols a size up: his chibi hands swallow a true-to-scale gun, and from over the
  // shoulder the guns are what says "Max Payne"
  const guns: [Group, Group] = [makePistol(true), makePistol(true)];
  const smgs: [Group, Group] = [makeSmg(), makeSmg()];
  const shotgun = makeShotgun(PLAYER_FRONT.shotgun);
  const ak = makeAk(PLAYER_FRONT.ak);
  const grips = RADBRO_GRIPS[id];
  if (bones.rHand) attachGun(guns[0], bones.rHand, grips.right, 1, GUN_SCALE);
  if (bones.lHand) attachGun(guns[1], bones.lHand, grips.left, 1, GUN_SCALE);
  if (bones.rHand) attachGun(smgs[0], bones.rHand, grips.right, 1, SMG_SCALE);
  if (bones.lHand) attachGun(smgs[1], bones.lHand, grips.left, 1, SMG_SCALE);
  if (bones.rHand) attachGun(shotgun, bones.rHand, grips.right, 1, [SHOTGUN_THICK_PLAYER, SHOTGUN_THICK_PLAYER, SHOTGUN_SCALE[id]]);
  if (bones.rHand) attachGun(ak, bones.rHand, grips.right, 1, [SHOTGUN_THICK_PLAYER, SHOTGUN_THICK_PLAYER, SHOTGUN_SCALE[id]]);
  const handcannon = makeHandCannon(), sawedoff = makeSawedOff(), sniper = makeSniper(PLAYER_FRONT.sniper), rifle = makeAk(PLAYER_FRONT.ak);
  const katana = makeKatana(), grenade = makeGrenade();
  if (bones.rHand) {
    attachGun(handcannon, bones.rHand, grips.right, 1, ONE_HAND.handcannon.scale);
    attachGun(sawedoff, bones.rHand, grips.right, 1, ONE_HAND.sawedoff.scale);
    attachGun(sniper, bones.rHand, grips.right, 1, [SHOTGUN_THICK_PLAYER, SHOTGUN_THICK_PLAYER, SHOTGUN_SCALE[id]]);
    attachGun(rifle, bones.rHand, grips.right, 1, [SHOTGUN_THICK_PLAYER, SHOTGUN_THICK_PLAYER, SHOTGUN_SCALE[id]]);
    attachGun(katana, bones.rHand, grips.right, 1, 1);
    // a sword rises from the fist (the pistol frame's barrel points out of it): the blade tipped up and
    // out, so it draws a line across the view as the arm cuts instead of pointing into the lens
    katana.quaternion.multiply(new Quaternion().setFromEuler(KATANA_TIP));
    katana.userData.grip = katana.quaternion.clone();
  }
  if (bones.lHand) attachGun(grenade, bones.lHand, grips.left, 1, 1.3);
  // the frag in his hand reads from the shoulder camera: a warm rim round it, as a live one has
  const fragParts: Mesh[] = [];
  grenade.traverse(o => { if ((o as Mesh).isMesh) fragParts.push(o as Mesh); });
  for (const o of fragParts) { const h = new Mesh(o.geometry, HELD_HULL); h.scale.setScalar(1.22); h.frustumCulled = false; o.add(h); }
  const katanaLeft = { p: new Vector3(...grips.left.p), q: new Quaternion(...grips.left.q).normalize().multiply(new Quaternion().setFromEuler(KATANA_TIP_LEFT)) };
  const hipHilt = splitHipKatana(model);
  // the drawn blade takes the hip katana's own hilt and guard (the same wrap and tsuba he wears)
  if (hipHilt) {
    const h = new Mesh((hipHilt as Mesh).geometry, (hipHilt as Mesh).material);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.022, 0.085);
    h.frustumCulled = false;
    katana.add(h);
    for (const o of katana.userData.hilt as Object3D[]) o.visible = false;
  }
  const drawn = [...smgs, shotgun, ak, handcannon, sawedoff, sniper, rifle, katana, grenade];
  for (const g of drawn) g.visible = false;
  // the guns he has not drawn yet are compiled with the room anyway (look/compile.ts: hidden models)
  for (const g of [...guns, ...drawn]) g.userData.rpWarm = true;
  // additive hit flinch (no root translation) and the upper-body reload layer
  const gunClips = clipsOf(gunPack);
  let hit: AnimationAction | null = null;
  const hc = gunClips.find(c => c.name === "Hit_Small");
  if (hc) {
    const c = hc.clone();
    c.name = "Hit_Small_add";
    c.tracks = c.tracks.filter(t => !t.name.endsWith(".position"));
    AnimationUtils.makeClipAdditive(c);
    hit = player.mixer.clipAction(c);
    hit.setLoop(LoopOnce, 1);
  }
  let reload: AnimationAction | null = null;
  const rc = gunClips.find(c => c.name === "Reload");
  if (rc) {
    const c = rc.clone();
    c.name = "Reload_upper";
    c.tracks = c.tracks.filter(t => UPPER_BODY.test(t.name));
    reload = player.mixer.clipAction(c);
    reload.setLoop(LoopOnce, 1);
    reload.clampWhenFinished = true;
  }
  const r2 = clipsOf(r2Pack);
  const sgFire = upperLayer(player.mixer, r2, "Shotgun_Fire", "Shotgun_Fire_upper");
  const sgReload = upperLayer(player.mixer, r2, "Shotgun_Reload", "Shotgun_Reload_upper");
  const swap = upperLayer(player.mixer, r2, "Weapon_Swap", "Weapon_Swap_upper");
  // the long-gun hold's reference: Shotgun_Aim_Idle's first frame (the gun on the chest, the left hand on
  // the pump), read off a throwaway mixer before the player's own mixer ever runs
  let hold: LongGunHold | null = null;
  const ref = player.clips.get("Shotgun_Aim_Idle");
  // (the rig's spine runs Hips -> Spine02 -> Spine01 -> Spine: "Spine" is the chest, the clavicles' parent)
  if (ref && bones.spine && bones.lArm && bones.lFore && bones.lHand && bones.rArm && bones.rFore && bones.rHand) {
    hold = new LongGunHold({ chest: bones.spine, lArm: bones.lArm, lFore: bones.lFore, lHand: bones.lHand, rArm: bones.rArm, rFore: bones.rFore, rHand: bones.rHand, lClav: bones.lClav, rClav: bones.rClav });
    const mx = new AnimationMixer(model);
    mx.clipAction(ref).play();
    mx.update(0);
    model.updateMatrixWorld(true);
    hold.sample(shotgun, SHOTGUN_SCALE[id]);
    mx.stopAllAction();
    mx.uncacheRoot(model);
  }
  // the long-gun clips hold the gun in both hands (Shotgun_Prone_GetUp lets go of it after 0.35 s: it
  // takes the chest-relative hold like the jump and the roll)
  const base = [...player.clips.values()].map(clip => ({ clip, long: /^(Shotgun_|Heavy_Stagger)/.test(clip.name) && clip.name !== "Shotgun_Prone_GetUp", run: clip.name === "Shotgun_Run" }));
  const pose: Rig["pose"] = [];
  model.traverse(o => { if ((o as Bone).isBone) pose.push({ bone: o as Bone, q: o.quaternion.clone(), p: o.position.clone() }); });
  return { id, root, model, player, materials, guns, smgs, shotgun, ak, handcannon, sawedoff, sniper, rifle, katana, hipHilt, katanaLeft, grenade, bones, hit, reload, sgFire, sgReload, swap, hold, base, pose };
}

/** The split of each source katana geometry (the asset cache shares one across the rigs it builds). */
const hiltSplit = new WeakMap<BufferGeometry, { scabbard: BufferGeometry; hilt: BufferGeometry }>();

/** The model's rigid hip katana (#4764: the node `Katana` on the hips; its mesh runs from the scabbard's
 *  end at -y to the pommel at +y, the guard at the belt near y = 0): the hilt and guard become their
 *  own mesh (hidden while the blade is drawn), the rest stays the scabbard. Null without one. */
function splitHipKatana(model: Object3D): Object3D | null {
  const node = model.getObjectByName("Katana") as Mesh | undefined;
  if (!node || !node.isMesh) return null;
  const src = node.geometry as BufferGeometry;
  let split = hiltSplit.get(src);
  if (!split) {
    const pos = src.getAttribute("position");
    const idx = src.index ? Array.from(src.index.array) : Array.from({ length: pos.count }, (_, i) => i);
    const hilt: number[] = [], rest: number[] = [];
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const y = (pos.getY(idx[i]) + pos.getY(idx[i + 1]) + pos.getY(idx[i + 2])) / 3;
      (y > -0.012 ? hilt : rest).push(idx[i], idx[i + 1], idx[i + 2]);
    }
    const scabbard = src.clone(), h = src.clone();
    scabbard.setIndex(rest);
    h.setIndex(hilt);
    split = { scabbard, hilt: h };
    hiltSplit.set(src, split);
  }
  node.geometry = split.scabbard;
  const hm = new Mesh(split.hilt, node.material);
  hm.name = "KatanaHilt";
  hm.frustumCulled = false;
  node.add(hm);
  return hm;
}

/** The one gun of a single-gun weapon (the long guns, the one-handed ones). */
function oneGun(rig: Rig, w: string): Group | null {
  return w === "shotgun" ? rig.shotgun : w === "ak" ? rig.ak : w === "rifle" ? rig.rifle : w === "sniper" ? rig.sniper : w === "handcannon" ? rig.handcannon : w === "sawedoff" ? rig.sawedoff : null;
}
/** The guns in his hands for a weapon (a single gun's muzzle serves both "hands"). */
function handGuns(rig: Rig, w: string): Group[] {
  const one = oneGun(rig, w);
  return one ? [one, one] : w === "smgs" ? rig.smgs : rig.guns;
}
const allGuns = (rig: Rig): Group[] => [...rig.guns, ...rig.smgs, rig.shotgun, rig.ak, rig.handcannon, rig.sawedoff, rig.sniper, rig.rifle];

/** Dev hold check: the shown gun's screen box and muzzle point (px), and the flat mask for the pixel count. */
function holdCheckView(rig: Rig, gun: Group, cam: Camera, size: { width: number; height: number }): void {
  const all = allGuns(rig);
  for (const g of all) {
    g.traverse(o => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      if (holdDev.mask && m.material !== MASK) { m.userData.rpMat = m.material; m.material = MASK; }
      else if (!holdDev.mask && m.material === MASK && m.userData.rpMat) m.material = m.userData.rpMat as Material;
    });
  }
  if (!gun.visible) { holdDev.box = [0, 0, 0, 0]; holdDev.muzzleOnScreen = false; return; }
  gun.updateMatrixWorld(true);
  box.makeEmpty();
  gun.traverse(o => { if ((o as Mesh).isMesh) box.expandByObject(o); });
  const px = (v: Vector3) => { v.project(cam); return [(v.x * 0.5 + 0.5) * size.width, (0.5 - v.y * 0.5) * size.height]; };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    const [x, y] = px(vA.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  holdDev.box = [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
  const [mx, my] = px(muzzleWorld(gun, vB));
  holdDev.muzzle = [Math.round(mx), Math.round(my)];
  holdDev.muzzleOnScreen = mx >= 0 && my >= 0 && mx < size.width && my < size.height;
}

const gq = new Quaternion(), gq2 = new Quaternion(), gm = new Matrix4(), gv = new Vector3(), gv2 = new Vector3(), gX = new Vector3(), gY = new Vector3(), gZ = new Vector3(), gPole = new Vector3(), gS = new Vector3();

/** #4764's guard: the katana across his body (GUARD_POSE, his frame off the chest), the right arm solved
 *  so the drawn katana's grip lands there with the blade along the pose, then the left arm onto the hilt
 *  below it, blended by `w`. */
function guardPose(rig: Rig, w: number, facing: number, offChest: (o: readonly number[], out: Vector3) => Vector3): void {
  const B = rig.bones;
  if (w <= 1e-3 || !B.rArm || !B.rFore || !B.rHand || !B.lArm || !B.lFore || !B.lHand) return;
  const fwX = Math.sin(facing), fwZ = Math.cos(facing), rtX = -Math.cos(facing), rtZ = Math.sin(facing);
  const inFrame = (o: readonly number[], out: Vector3) => out.set(rtX * o[0] + fwX * o[2], o[1], rtZ * o[0] + fwZ * o[2]);
  // the katana's world frame: +Z along the blade, the edge (-Y) out to the front
  const grip = offChest(GUARD_POSE.grip, gv);
  inFrame(GUARD_POSE.blade, gZ).normalize();
  gY.set(-fwX, 0, -fwZ).addScaledVector(gZ, -(-fwX * gZ.x - fwZ * gZ.z)).normalize();
  gX.crossVectors(gY, gZ);
  gm.makeBasis(gX, gY, gZ);
  gq.setFromRotationMatrix(gm);
  // the right hand: where it must be for the katana (its child at its grip) to sit there
  const k = rig.katana;
  const s = B.rHand.getWorldScale(gS).x;
  const kq = k.userData.grip as Quaternion, kp = k.userData.gripPos as Vector3;
  const hq = gq2.copy(gq).multiply(gq2.clone().copy(kq).invert());
  const hp = gv2.copy(kp).multiplyScalar(s).applyQuaternion(hq);
  hp.subVectors(grip, hp);
  solveTwoBone(B.rArm, B.rFore, B.rHand, hp, inFrame(GUARD_POSE.poleR, gPole), w);
  setWorldQuaternion(B.rHand, hq, w);
  k.quaternion.copy(kq);
  k.position.copy(kp);
  k.updateMatrixWorld(true);
  // the left hand on the hilt below it: a second grip GUARD_POSE.left down the hilt, turned as the left
  // hand holds the katana (the right's grip mirrored)
  k.getWorldQuaternion(gq);
  const lq = gq.multiply(gq2.copy(rig.katanaLeft.q).invert());
  const at = k.localToWorld(gv.set(0, 0, -GUARD_POSE.left));
  const lp = gv2.copy(rig.katanaLeft.p).multiplyScalar(s).applyQuaternion(lq);
  lp.subVectors(at, lp);
  solveTwoBone(B.lArm, B.lFore, B.lHand, lp, inFrame(GUARD_POSE.poleL, gPole), w);
  setWorldQuaternion(B.lHand, lq, w);
}

export function PlayerView({ s }: { s: Session }) {
  const assets = useAssetRuntime();
  const radbro = useUi(st => st.radbro);
  const version = useUi(st => st.assetsVersion);
  const rig = useMemo(() => {
    void version;
    const src = assets.getModel(modelPath(radbro));
    if (!src) return null;
    return makeRig(radbro, src, assets.getModel(clipsPath(radbro)), assets.getModel(gunClipsPath(radbro)), assets.getModel(r2ClipsPath(radbro)));
  }, [assets, radbro, version]);
  const st = useRef({ legYaw: 0, bodyYaw: 0, twist: 0, back: false, fade: 1, recoil: [0, 0], run: -1, clip: "", mode: "", jumpHold: false, reloadW: 0, armW: 1, diveY: 0, faded: false,
    /** The weapon shown in his hands (it changes at the swap point), the swap in progress. */
    shown: "pistols", swapTo: "", swapT: -1, swapW: 0, fireW: 0,
    /** The long-gun hold: IK weight, low-ready weight, seconds since his last shot (the player's clock), recoil. */
    ikW: 0, readyW: 1, sinceShot: 99, lgRecoil: 0, posed: false,
    /** Lying with a long gun (dive / prone, eased): the roll onto his left side. */
    lieW: 0,
    /** Seconds since the last throw (the left hand's lob), the melee swing's twist this frame. */
    throwT: 99,
    /** The frag held up (eased), and whether the last lob started from there. */
    nadeW: 0, fromUp: false,
    /** #4764's guard pose weight (eased). */
    guardW: 0 });
  const tmp = useMemo(() => ({ aim: new Vector3(), side: new Vector3(), a: new Vector3(), q: new Quaternion() }), []);

  useEffect(() => {
    if (!rig) return;
    const off = s.on(e => {
      const r = st.current;
      const w = s.game.player.weapon.id;
      if (e.type === "shot" && e.shooter === -1 && e.pellet === 0) {
        r.sinceShot = 0;
        if (w === "shotgun" && rig.sgFire && s.game.player.mode === "normal") {
          const d = rig.sgFire.getClip().duration;
          rig.sgFire.reset().setEffectiveTimeScale(d / Math.max(0.3, WEAPONS.shotgun.interval)).setEffectiveWeight(1).play();
          r.fireW = 1;
        } else if (isLongGun(w)) r.lgRecoil = 1;
        else r.recoil[e.hand] = 1;
      }
      if (e.type === "hurt" && e.target === -1 && e.hp > 0 && rig.hit) rig.hit.reset().setEffectiveWeight(0.9).play();
      if (e.type === "throw" && e.by === undefined) { r.fromUp = !!e.raised && r.nadeW > 0.3; r.nadeW = 0; r.throwT = 0; }
      if (e.type === "reload") {
        // the shotgun's authored feed (the sniper's rounds go in the same way); the AK's (and the rifle's)
        // mag change is a left-hand path on the hold (no layer)
        const lay = w === "shotgun" || w === "sniper" ? rig.sgReload : w === "ak" || w === "rifle" ? null : rig.reload;
        if (lay) {
          const d = lay.getClip().duration;
          lay.reset().setEffectiveTimeScale(d / WEAPONS[w].reload).setEffectiveWeight(0).play();
        }
      }
      if (e.type === "swap") {
        r.swapTo = e.weapon;
        r.swapT = 0;
        rig.reload?.stop();
        rig.sgReload?.stop();
        rig.sgFire?.stop();
        if (rig.swap) rig.swap.reset().setEffectiveWeight(1).play();
      }
    });
    return () => {
      off();
      rig.player.dispose();
      for (const m of rig.materials) m.dispose();
    };
  }, [rig, s]);

  // -5: root, facing, clip
  useFrame((_, rawDelta) => {
    if (!rig) return;
    const g = s.game;
    const p = g.player;
    const r = st.current;
    const pl = rig.player;
    const dt = Math.min(rawDelta, 0.1);
    const pos = s.renderP;
    if (r.run !== s.run) {
      r.run = s.run; r.clip = ""; r.mode = ""; r.legYaw = p.facing; r.bodyYaw = p.facing; r.jumpHold = false; r.reloadW = 0; r.back = false;
      r.shown = p.weapon.id; r.swapTo = ""; r.swapT = -1; r.swapW = 0; r.fireW = 0; r.ikW = 1; r.readyW = 1; r.sinceShot = 99; r.lgRecoil = 0; r.throwT = 99; r.nadeW = 0; r.fromUp = false; r.guardW = 0;
      pl.force(pick(pl, (isLongGun(p.weapon.id) ? SHOTGUN_CLIPS : CLIPS).idle), 0);
      rig.hit?.stop();
      rig.reload?.stop();
      rig.sgFire?.stop();
      rig.sgReload?.stop();
      rig.swap?.stop();
    }
    // the swap: the guns change hands at SWAP_AT, the clip set with them
    if (r.swapT >= 0) {
      r.swapT += dt * s.playerScale;
      if (r.swapT >= SWAP_AT && r.shown !== r.swapTo) { r.shown = r.swapTo; r.clip = ""; }
      if (r.swapT >= 0.47) r.swapT = -1;
    } else if (r.shown !== p.weapon.id) { r.shown = p.weapon.id; r.clip = ""; }
    const C = isLongGun(r.shown) ? SHOTGUN_CLIPS : CLIPS;
    // mode entries: the dive chain, the roll, the get-up, death
    if (p.mode !== r.mode) {
      const prev = r.mode;
      r.mode = p.mode;
      if (p.mode === "dive") {
        r.diveY = pos.y;
        r.bodyYaw = Math.atan2(p.dirX, p.dirZ);
        const dive = pick(pl, C.dive);
        // the clip's airborne span (0.15-0.95 s) over the sim's 0.9 s; it ends on Prone_Idle's first frame
        if (dive) pl.play(dive, { once: true, then: pick(pl, C.prone), startAt: 0.1, timeScale: 0.95, fade: 0.08 });
        r.clip = dive;
      } else if (p.mode === "prone") {
        if (!pl.busy) pl.force(pick(pl, C.prone), 0.15);
        else pl.base = pick(pl, C.prone);
        r.clip = "prone";
      } else if (p.mode === "roll") {
        r.bodyYaw = Math.atan2(p.dirX, p.dirZ);
        pl.play(pick(pl, C.roll), { hold: true, timeScale: 3.2, fade: 0.1, startAt: 0.1 });
        r.clip = "roll";
      } else if (p.mode === "getup") {
        if (holdDev.on && holdDev.tweak["gu.start"] !== undefined) GETUP.start = holdDev.tweak["gu.start"];
        pl.play(pick(pl, C.getUp), { hold: true, timeScale: 2.8, fade: 0.12, startAt: isLongGun(r.shown) ? GETUP.start : 0 });
        r.clip = "getup";
      } else if (p.mode === "vault") {
        // over low cover: the jump's tucked middle, held, along the vault
        r.bodyYaw = Math.atan2(p.vault.x1 - p.vault.x0, p.vault.z1 - p.vault.z0);
        const j = pick(pl, C.jump);
        if (j) pl.play(j, { hold: true, startAt: 0.4, freezeAt: 0.7, fade: 0.08 });
        r.clip = "vault";
      } else if (p.mode === "dead") {
        // how much street is behind him decides how far he flies
        const yaw = prev === "normal" ? r.legYaw : r.bodyYaw;
        r.bodyYaw = yaw;
        const hit = g.world.raycast(p.x, p.y + 0.9, p.z, -Math.sin(yaw), 0, -Math.cos(yaw), 6, false);
        pl.play(pick(pl, deathFor(hit ? hit.t : 6, Math.random())), { hold: true, fade: 0.1 });
        rig.reload?.stop();
        r.clip = "dead";
      } else {
        r.clip = "";
        r.legYaw = r.bodyYaw;
      }
    }

    let rate = 1, legYawWant = p.facing, want = "";
    if (p.mode === "normal") {
      const speed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
      // in cover: tucked down behind low cover (Cover_Crouch_Idle) facing it; up / out, the aimed idle
      const cs = p.cover >= 0 ? g.cover[p.cover] : null;
      if (cs && tucked(cs, p)) {
        want = pick(pl, C.crouch) || pick(pl, C.idle);
        if (r.jumpHold) r.jumpHold = false;
      } else if (!p.grounded) {
        if (!r.jumpHold) {
          r.jumpHold = true;
          const j = pick(pl, C.jump);
          if (j) pl.play(j, { hold: true, startAt: 0.48, freezeAt: 0.8, fade: 0.1 });
        }
      } else if (speed > 0.4) {
        // legs along the move (or, against the aim, the cycle backwards with the legs toward the aim);
        // the clip rate is body speed over the clip's own ground speed, so the planted foot stays put
        const moveYaw = Math.atan2(p.vx, p.vz);
        const legs = legsFor(moveYaw, wrapAngle(moveYaw - p.facing), r.back);
        r.back = legs.back;
        legYawWant = legs.legYaw;
        const gait = RADBRO_GAIT[rig.id];
        want = pick(pl, speed > RUN_FROM ? C.run : C.walk);
        rate = (legs.back ? -1 : 1) * speed / clipSpeed(gait, want);
      } else want = pick(pl, C.idle);
      if (p.grounded && r.jumpHold) { r.jumpHold = false; r.clip = ""; }
      if (want && !r.jumpHold) {
        if (want !== r.clip) { pl.force(want, 0.18, rate); r.clip = want; }
        else pl.setTimeScale(rate);
      }
      r.legYaw += wrapAngle(legYawWant - r.legYaw) * Math.min(1, 12 * dt);
      // the spine turns the chest back onto the aim (a full quarter turn while running sideways)
      r.twist = Math.max(-1.75, Math.min(1.75, wrapAngle(p.facing - r.legYaw)));
      r.bodyYaw = r.legYaw;
    } else r.twist += (0 - r.twist) * Math.min(1, 12 * dt);

    const yaw = p.mode === "normal" ? r.legYaw : r.bodyYaw;
    rig.root.position.set(pos.x, p.mode === "dive" ? Math.min(pos.y, r.diveY) : pos.y, pos.z);
    rig.root.quaternion.setFromAxisAngle(UP, yaw);
  }, FRAME.actors);

  // -4: mixer on the player's clock (the dive chain is authored in real time)
  useFrame((_, rawDelta) => {
    if (!rig) return;
    const m = s.game.player.mode;
    const realTime = m === "dive" || m === "prone" || m === "getup" || m === "roll";
    const ts = s.paused ? 0 : s.hold ? s.crawl : realTime ? 1 : Math.max(s.game.timeScale, TIME.playerInBulletTime);
    // the reload layer's weight rides on the weapon's reload (eased in over ~0.15 s)
    const r = st.current;
    const dt = Math.min(rawDelta, 0.1);
    const reloading = s.game.player.weapon.reloadT > 0 && m === "normal";
    r.reloadW += ((reloading ? 1 : 0) - r.reloadW) * Math.min(1, 12 * dt);
    const long = isLongGun(r.shown);
    rig.reload?.setEffectiveWeight(long ? 0 : 2.4 * r.reloadW);
    rig.sgReload?.setEffectiveWeight(r.shown === "shotgun" || r.shown === "sniper" ? 1.6 * r.reloadW : 0);
    // the shotgun's fire layer (kick + pump) only while standing; the swap layer rises fast, then lets go
    const fireOn = !!rig.sgFire && rig.sgFire.isRunning() && m === "normal" && r.shown === "shotgun";
    r.fireW += ((fireOn ? 1 : 0) - r.fireW) * Math.min(1, 20 * dt);
    rig.sgFire?.setEffectiveWeight(r.fireW * (1 - r.reloadW));
    const swapOn = r.swapT >= 0 && r.swapT < 0.32 && m === "normal";
    r.swapW += ((swapOn ? 1 : 0) - r.swapW) * Math.min(1, (swapOn ? 14 : 8) * dt);
    rig.swap?.setEffectiveWeight(1.4 * r.swapW);
    // back to the clip pose before the mixer runs (see Rig.pose)
    if (r.posed) for (const b of rig.pose) { b.bone.quaternion.copy(b.q); b.bone.position.copy(b.p); }
    rig.player.update(dt * ts);
  }, FRAME.animator);

  // -3: bones (twist, pitch, aim arms or the long-gun hold, recoil, guns)
  useFrame((state, rawDelta) => {
    if (!rig) return;
    const g = s.game, p = g.player, r = st.current, B = rig.bones;
    const dt = Math.min(rawDelta, 0.1);
    const pdt = dt * s.playerScale;
    // the clip pose, before any layer below touches it (restored before the next mixer update)
    for (const b of rig.pose) { b.q.copy(b.bone.quaternion); b.p.copy(b.bone.position); }
    r.posed = true;
    rig.root.updateMatrixWorld(true);
    const alive = p.mode !== "dead";
    const normal = p.mode === "normal";
    const long = isLongGun(r.shown);
    tmp.side.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    r.sinceShot += pdt;
    // a long gun: the base pose's share of long-gun clips (the jump, the roll and the pistol fallbacks
    // hold the gun on the chest instead) and of the run (it already carries the gun low); shouldered
    // while he shoots (and in bullet time, a dive, prone), else the low ready
    let longShare = 1, runShare = 0, ready = 0;
    const lying = p.mode === "dive" || p.mode === "prone";
    const reloadK = r.reloadW;
    if (long) {
      let wAll = 0, wLong = 0, wRun = 0;
      for (const c of rig.base) {
        const a = rig.player.mixer.existingAction(c.clip);
        if (!a || !a.enabled || !a.isScheduled()) continue;
        const w = a.getEffectiveWeight();
        wAll += w;
        if (c.long) wLong += w;
        if (c.run) wRun += w;
      }
      longShare = wAll > 1e-4 ? wLong / wAll : 1;
      runShare = wAll > 1e-4 ? wRun / wAll : 0;
      const aimed = p.weapon.wasDown || r.sinceShot < HOLD.aimedFor || g.timeScale < 0.99 || lying;
      r.readyW += ((aimed ? 0 : 1) - r.readyW) * Math.min(1, dt / (aimed ? HOLD.toAimed : HOLD.toReady));
      if (holdDev.on) {
        for (const k of ["down", "out", "drop", "twist", "aim"] as const) if (holdDev.tweak["ready." + k] !== undefined) READY[k] = holdDev.tweak["ready." + k];
        if (holdDev.tweak.cant !== undefined) HOLD.cant = holdDev.tweak.cant;
        if (holdDev.tweak.aimTwist !== undefined) HOLD.aimTwist = holdDev.tweak.aimTwist;
        if (holdDev.tweak.long !== undefined) longShare = holdDev.tweak.long;
      }
      // the roll and the get-up carry it at the ready too (he is not aiming through a tumble)
      const tumble = p.mode === "roll" || p.mode === "getup";
      if (holdDev.on) for (const k of ["ready", "aim"] as const) if (holdDev.tweak["gu." + k] !== undefined) GETUP[k] = holdDev.tweak["gu." + k];
      ready = normal ? r.readyW * (1 - runShare) * (1 - reloadK) : p.mode === "getup" ? GETUP.ready : tumble ? 1 : 0;
      if (holdDev.on && holdDev.tweak.ready !== undefined) ready = holdDev.tweak.ready;
    }
    holdView.aimed = long && alive ? 1 - r.readyW : 0;
    // lying with a long gun: the body rolls onto his left side, his right shoulder up (the gun under his
    // right cheek comes out from under the big head and hair, where the camera behind him sees it)
    if (holdDev.on) for (const k of ["roll", "spine", "cant", "getup"] as const) if (holdDev.tweak["lie." + k] !== undefined) LIE[k] = holdDev.tweak["lie." + k];
    const lieWant = long && alive ? (lying ? 1 : p.mode === "getup" ? LIE.getup : 0) : 0;
    r.lieW += (lieWant - r.lieW) * Math.min(1, dt / (lieWant > r.lieW ? LIE.in : LIE.out));
    if (r.lieW > 1e-3 && LIE.roll > 0) {
      const f = tmp.a.set(0, 0, 1).applyQuaternion(rig.root.quaternion);
      rotateBoneWorld(LIE.spine ? B.spine02 : B.hips, f, -LIE.roll * r.lieW);
    }
    // the melee swing (the sim's clock): 0..1 through it, the cut's share, a bump weight; the chest turns
    // through the cut (right to left); the throw's lob with the left hand
    const M = g.katana ? MELEE.katana : MELEE.strike;
    const sw = g.katana ? SWING.katana : SWING.strike;
    const mu = p.meleeT > 0 && alive ? 1 - p.meleeT / M.time : -1;
    const cutK = mu < 0 ? 0 : smooth(Math.min(1, mu / sw.cut));
    const meleeW = mu < 0 ? 0 : Math.sin(Math.PI * Math.min(1, mu));
    const meleeTwist = (sw.twist[0] + (sw.twist[1] - sw.twist[0]) * cutK) * meleeW;
    const guardWant = g.katana && p.guard && alive && normal ? 1 : 0;
    r.guardW += (guardWant - r.guardW) * Math.min(1, dt / (guardWant ? GUARD_POSE.in : GUARD_POSE.out));
    if (r.guardW < 1e-3) r.guardW = 0;
    r.throwT += dt * s.playerScale;
    const tu = r.throwT / THROW.time;
    // the lob with the left hand (from the frag held up it starts at full weight), else the frag held up
    const upWant = p.nadeUp && alive && normal ? 1 : 0;
    r.nadeW += (upWant - r.nadeW) * Math.min(1, dt / (upWant ? RAISE.in : RAISE.out));
    if (r.nadeW < 1e-3) r.nadeW = 0;
    const lobbing = tu < 1 && alive;
    const throwW = lobbing ? (r.fromUp && tu < 0.5 ? 1 : Math.sin(Math.PI * tu)) : r.nadeW;
    const lobK = lobbing ? smooth(Math.min(1, tu / 0.6)) : 0;
    const throwAt = THROW_AT;
    for (let k = 0; k < 3; k++) throwAt[k] = THROW.from[k] + (THROW.to[k] - THROW.from[k]) * lobK;
    const fwdX = Math.sin(p.facing), fwdZ = Math.cos(p.facing), rtX = -Math.cos(p.facing), rtZ = Math.sin(p.facing);
    /** A point in his frame off the chest bone (right, up, forward). */
    const offChest = (o: readonly number[], out: Vector3) => {
      if (B.spine) B.spine.getWorldPosition(out); else out.set(s.renderP.x, s.renderP.y + 1.1, s.renderP.z);
      return out.set(out.x + rtX * o[0] + fwdX * o[2], out.y + o[1], out.z + rtZ * o[0] + fwdZ * o[2]);
    };
    if (alive && normal) {
      // spine twist back toward the aim, and a little pitch with it (more with a long gun: the chest
      // carries the shouldered gun onto the aim, the hold only corrects the rest); the low ready turns
      // the chest a little to his right (the gun goes out from his body, where the camera sees it)
      const twist = (r.twist - (long ? READY.twist * ready + HOLD.aimTwist * (1 - ready) * (1 - reloadK) : 0)) * (1 - r.guardW) + meleeTwist - GUARD_POSE.twist * r.guardW;
      if (Math.abs(twist) > 1e-3) {
        rotateBoneWorld(B.spine02, UP, twist * 0.3);
        rotateBoneWorld(B.spine01, UP, twist * 0.3);
        rotateBoneWorld(B.spine, UP, twist * 0.4);
      }
      const [k1, k2] = long ? HOLD.pitch : [0.22, 0.18];
      rotateBoneWorld(B.spine01, tmp.side, p.pitch * k1 * (1 - r.reloadW));
      rotateBoneWorld(B.spine, tmp.side, p.pitch * k2 * (1 - r.reloadW));
    }
    // arms onto the aim point (the clips already hold them out; this makes it exact)
    // (tucked down in cover the guns come in to the chest until he blind fires)
    const coverSeg = p.cover >= 0 ? g.cover[p.cover] : null;
    const armWant = !alive || p.mode === "roll" || p.mode === "getup" ? 0 : coverSeg && tucked(coverSeg, p) && r.sinceShot > 0.5 ? 0.3 : 1;
    r.armW += (armWant - r.armW) * Math.min(1, (armWant ? 8 : 16) * dt);
    const t = g.aimPoint;
    tmp.aim.set(t.x, t.y, t.z);
    const armK = r.armW * (1 - r.swapW);
    const held = handGuns(rig, r.shown);
    rig.guns.forEach(gun => { gun.visible = r.shown === "pistols"; });
    rig.smgs.forEach(gun => { gun.visible = r.shown === "smgs"; });
    rig.shotgun.visible = r.shown === "shotgun";
    rig.ak.visible = r.shown === "ak";
    rig.rifle.visible = r.shown === "rifle";
    rig.sniper.visible = r.shown === "sniper";
    rig.handcannon.visible = r.shown === "handcannon";
    rig.sawedoff.visible = r.shown === "sawedoff";
    const oneHand = isOneHand(r.shown);
    if (long && rig.hold?.sampled) {
      const lg = oneGun(rig, r.shown) ?? rig.shotgun;
      const akLike = r.shown === "ak" || r.shown === "rifle";
      const geom = LONG_GUN_GEOM[akLike ? "ak" : r.shown === "sniper" ? "sniper" : "shotgun"];
      // both hands stay on the gun through everything but death (in at a swap, out as he falls)
      const ikWant = alive ? 1 : 0;
      r.ikW += (ikWant - r.ikW) * Math.min(1, dt / (ikWant ? HOLD.ikIn : HOLD.ikOut));
      let ik = r.ikW * (1 - r.swapW);
      if (holdDev.on && holdDev.tweak.ik !== undefined) ik = holdDev.tweak.ik;
      // recoil: the shotgun's fire layer kicks it when standing; the AK (and a shot from a dive) here
      r.lgRecoil = Math.max(0, r.lgRecoil - dt / 0.12 * Math.max(g.timeScale, 0.3));
      const recoil = akLike ? 0.6 * r.lgRecoil : r.shown === "sniper" ? 1.3 * r.lgRecoil : r.lgRecoil;
      // the AK's mag change: a scripted left-palm path over the reload, the gun tipped toward it
      let leftPath: { local: Vector3; world: Vector3; mix: number; w: number } | null = null;
      let tiltDown = 0, tiltRoll = 0, magRide = false;
      const mag = lg.userData.mag as Object3D | undefined;
      if (mag) { mag.visible = true; mag.position.copy(AK_MAG_AT); }
      if (akLike && p.weapon.reloadT > 0 && alive) {
        const u = Math.min(1, Math.max(0, 1 - p.weapon.reloadT / WEAPONS.ak.reload));
        const bump = Math.sin(Math.PI * Math.min(1, u / 0.9));
        tiltDown = 0.3 * bump;
        tiltRoll = 0.35 * bump;
        let i = 0;
        while (i < AK_RELOAD.length - 2 && u > AK_RELOAD[i + 1][0]) i++;
        const [u0, a0] = AK_RELOAD[i], [u1, a1] = AK_RELOAD[i + 1];
        const k = Math.min(1, Math.max(0, (u - u0) / Math.max(1e-6, u1 - u0)));
        const ks = k * k * (3 - 2 * k);
        // his left hip, off the Hips bone
        if (B.hips) B.hips.getWorldPosition(vB);
        vB.addScaledVector(vRight.set(-Math.cos(p.facing), 0, Math.sin(p.facing)), -0.17).addScaledVector(vFwd.set(Math.sin(p.facing), 0, Math.cos(p.facing)), 0.05);
        const local = vPath;
        let mix = 0;
        if (a0 !== "belt" && a1 !== "belt") local.set(a0[0], a0[1], a0[2]).lerp(vA.set(a1[0], a1[1], a1[2]), ks);
        else if (a0 !== "belt") { local.set(a0[0], a0[1], a0[2]); mix = ks; }
        else if (a1 !== "belt") { local.set(a1[0], a1[1], a1[2]); mix = 1 - ks; }
        else mix = 1;
        leftPath = { local, world: vB, mix, w: u < 0.03 ? u / 0.03 : u > 0.97 ? (1 - u) / 0.03 : 1 };
        if (mag) {
          if (u >= 0.3 && u < 0.55) mag.visible = false;
          magRide = (u >= 0.12 && u < 0.3) || (u >= 0.55 && u < 0.85);
        }
      } else if (throwW > 0) {
        // the grenade: the left hand leaves the gun (held up, then the lob) and comes back (the right keeps it)
        offChest(throwAt, vB);
        leftPath = { local: vPath.set(0, 0, 0.37), world: vB, mix: 1, w: throwW };
      }
      if (r.shown === "sniper") {
        // the bolt: back and home after each round (0.35-0.85 s on his clock)
        const bolt = rig.sniper.userData.bolt as Object3D;
        const bu = (r.sinceShot - 0.35) / 0.5;
        const back = bu > 0 && bu < 1 ? Math.sin(Math.PI * bu) : 0;
        bolt.position.z = 0.02 - 0.07 * back;
        bolt.rotation.z = 0.9 * Math.min(1, back * 2);
      }
      const out = rig.hold.solve({
        gun: lg,
        geom,
        longShare,
        weight: ik,
        aim: alive ? tmp.aim : null,
        aimW: alive ? (1 - 0.9 * (r.shown === "shotgun" ? reloadK : 0)) * (1 - (1 - READY.aim) * ready) : 0,
        aimMax: lying ? HOLD.aimMaxLying : p.mode === "getup" ? GETUP.aim : HOLD.aimMax,
        ready,
        tiltDown,
        tiltRoll,
        cant: HOLD.cant * (1 - reloadK) + LIE.cant * r.lieW,
        recoil,
        leftPath,
        // along the mag change the left wrist keeps most of the clip's own set (the palm turns with the
        // mag, not with the handguard), all of it at his belt
        leftRot: leftPath ? 1 - (0.6 + 0.3 * leftPath.mix) * leftPath.w : 1,
        dt,
      });
      if (r.shown === "shotgun") {
        // rack the pump: back and forward at the clip's pumpBack (fire 0.30 s, reload 1.60 s); the clip's
        // left hand racks with it
        const pump = rig.shotgun.userData.pump as Object3D;
        const f = rig.sgFire && r.fireW > 0.05 ? rackAt(rig.sgFire.time, 0.3) : 0;
        const rl = rig.sgReload && r.reloadW > 0.05 ? rackAt(rig.sgReload.time, 1.6) : 0;
        pump.position.z = SHOTGUN_PUMP.z - SHOTGUN_RACK * Math.max(f, rl);
        rig.shotgun.updateMatrixWorld(true);
      }
      if (mag && magRide) {
        // the mag in the palm: where the palm is on the gun now, minus where it grabs the mag
        const palm = rig.hold.palmOnGun(lg, vA);
        mag.position.copy(AK_MAG_AT).add(palm).sub(AK_MAG_GRAB);
      }
      if (holdDev.on) {
        // the reload's authored part: the left hand leaves the gun on purpose (the shotgun's feed up to 1.45 s, the AK's path)
        const exempt = ((r.shown === "shotgun" || r.shown === "sniper") && r.reloadW > 0.02 && !!rig.sgReload && rig.sgReload.time < 1.5) || (!!leftPath && leftPath.w > 0.02) || r.swapW > 0.02 || !alive;
        Object.assign(holdDev.last, { grip: out.gripErr, left: out.leftErr, bend: Math.max(out.bendL, out.bendR), flip: out.flipL || out.flipR, reach: Math.max(out.reachL, out.reachR), slide: out.slide, shift: out.shift, exempt, ik, ready, long: longShare });
        holdDev.record({ ...holdDev.last });
      }
    } else if (long) {
      // no round-2 pack: the clip's arms, the gun at its grip
      for (const gun of held) aimHand(undefined, gun, null, 0);
    } else {
      // each arm aims a little outside the crosshair point (akimbo), scaled with the distance
      const reach = B.rArm ? B.rArm.getWorldPosition(tmp.a).distanceTo(tmp.aim) : 10;
      const spread = ARM_SPREAD[r.shown] ?? ARM_SPREAD.pistols;
      const rOff = tmp.a.copy(tmp.side).multiplyScalar(0.07 + Math.tan(spread[0]) * reach).add(tmp.aim).clone();
      const lOff = tmp.a.copy(tmp.side).multiplyScalar(-(0.07 + Math.tan(spread[1]) * reach)).add(tmp.aim);
      aimLimb(B.rArm, B.rHand, rOff, armK * (1 - 0.6 * r.reloadW));
      // the one-handed guns (hand cannon, sawed-off): the left arm drops to a guard below and ahead of
      // the left shoulder; the pistols' left arm aims its own gun; a throw lobs with the left hand
      if (oneHand && B.lArm) {
        B.lArm.getWorldPosition(vA);
        vA.set(vA.x + fwdX * 0.15, vA.y - 0.25, vA.z + fwdZ * 0.15);
        aimLimb(B.lArm, B.lHand, vA, armK * (1 - 0.95 * r.reloadW));
      } else aimLimb(B.lArm, B.lHand, lOff, armK * (1 - 0.95 * r.reloadW) * (1 - throwW));
      if (throwW > 0) aimLimb(B.lArm, B.lHand, offChest(throwAt, vB), throwW);
      // recoil: a quick kick up at the elbow (the SMGs kick a little less, but faster; the hand cannon hard)
      const kick = r.shown === "smgs" ? 0.16 : oneHand ? ONE_HAND[r.shown as keyof typeof ONE_HAND].kick : 0.3;
      for (const h of [0, 1] as const) {
        r.recoil[h] = Math.max(0, r.recoil[h] - dt * (oneHand ? 9 : 14) * Math.max(g.timeScale, 0.3));
        if (r.recoil[h] > 0 && alive) rotateBoneWorld(h === 0 ? B.rFore : B.lFore, tmp.side, kick * r.recoil[h]);
      }
      // the wrists bend the guns onto the crosshair point; the guns stay in the palms at their grips
      if (oneHand) aimHand(B.rHand, held[0], alive ? tmp.aim : null, armK * (1 - 0.5 * r.reloadW), 0.75);
      else held.forEach((gun, h) => aimHand(h === 0 ? B.rHand : B.lHand, gun, alive ? tmp.aim : null, armK * (1 - (h === 1 ? 0.9 : 0.5) * r.reloadW), 0.75));
      // the left gun dips out of the way of a throw
      if (throwW > 0.05 && !oneHand) held[1].visible = false;
      if (r.shown === "handcannon") (rig.handcannon.userData.slide as Object3D).position.z = 0.12 - 0.05 * r.recoil[0];
      if (r.shown === "sawedoff") {
        // the barrels hinge down through the reload (break, 2 out, 2 in, shut)
        const u = p.weapon.reloadT > 0 ? 1 - p.weapon.reloadT / WEAPONS.sawedoff.reload : 0;
        (rig.sawedoff.userData.barrels as Object3D).rotation.x = u > 0 ? 0.65 * Math.sin(Math.PI * Math.min(1, u / 0.95)) : 0;
      }
      if (holdDev.on) {
        const clipQ = (bone: Bone | undefined) => rig.pose.find(x => x.bone === bone)?.q;
        const qr = clipQ(B.rHand), ql = clipQ(B.lHand);
        const bend = rig.hold && B.rHand && B.lHand && qr && ql ? Math.max(rig.hold.swing(B.rHand, qr, false), rig.hold.swing(B.lHand, ql, true)) : 0;
        Object.assign(holdDev.last, { grip: 0, left: 0, bend, flip: false, reach: 0, slide: 0, shift: 0, exempt: true, ik: 0, ready: 0, long: 0 });
        holdDev.record({ ...holdDev.last });
      }
    }
    // the melee: the right arm cuts along an arc (#4764 draws his katana, the guns wait); a long gun's
    // strike is the chest's turn with both hands on it
    rig.katana.visible = g.katana && (meleeW > 0.02 || r.guardW > 0.02);
    if (rig.katana.visible) for (const gun of allGuns(rig)) gun.visible = false;
    if (rig.hipHilt) rig.hipHilt.visible = !rig.katana.visible;
    if (meleeW > 0 && (!long || g.katana)) {
      const a = sw.from, b = sw.to;
      aimLimb(B.rArm, B.rHand, offChest([a[0] + (b[0] - a[0]) * cutK, a[1] + (b[1] - a[1]) * cutK, a[2] + (b[2] - a[2]) * cutK], vB), meleeW);
      if (rig.katana.visible) aimHand(undefined, rig.katana, null, 0);
    }
    if (r.guardW > 0) guardPose(rig, r.guardW * (1 - meleeW), p.facing, offChest);
    rig.grenade.visible = lobbing ? throwW > 0 && tu < 0.3 : r.nadeW > 0.05;
    held.forEach((gun, h) => muzzleWorld(gun, playerMuzzles[h]));
    B.head?.getWorldPosition(playerHead);
    B.spine?.getWorldPosition(playerChest);
    // a short camera arm (wall or cover right behind him) fades him out so he never fills the frame
    // (and a pivot slid in by a wall at his right puts him in front of the crosshair: half see-through)
    let fadeWant = g.killcam ? 1 : Math.max(0, Math.min(1, (camView.arm - 0.75) / 0.75, 0.5 + (0.5 * camView.right) / camView.baseRight));
    // his head and hair must never sit on the crosshair: where they overlap the middle of the screen
    // (turning, strafing, a pivot slid in by a wall) he thins out while he aims
    if (!g.killcam && alive) fadeWant = Math.min(fadeWant, 1 - CROSSHAIR_FADE * crosshairOverlap(state.camera, playerHead));
    if (holdDev.on && holdDev.view !== "game") fadeWant = 1;
    r.fade += (fadeWant - r.fade) * Math.min(1, 14 * dt);
    const fade = r.fade > 0.98 ? 1 : r.fade;
    // every material under him (the street look can swap / add some after the rig is built)
    if (fade < 1 || r.faded) {
      fadeTree(rig.model, fade);
      r.faded = fade < 1;
    }
    rig.model.visible = fade > HIDE_BELOW && !p.zoom;
    if (fade <= 0.6 || p.zoom) for (const gun of [...allGuns(rig), rig.katana, rig.grenade]) gun.visible = false;
    if (holdDev.on) {
      holdCheckView(rig, held[0], state.camera, state.size);
      (holdDev as unknown as { rig: Rig }).rig = rig;
    }
  }, FRAME.bones);

  if (!rig) return null;
  return <primitive object={rig.root} />;
}
