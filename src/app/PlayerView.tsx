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
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAssetRuntime } from "react-three-game";
import { AnimationMixer, AnimationUtils, Box3, Group, LoopOnce, MeshBasicMaterial, Quaternion, Vector3, type AnimationAction, type Camera, type PerspectiveCamera, type AnimationClip, type Bone, type Material, type Mesh, type Object3D } from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Session } from "./session.ts";
import { AnimPlayer } from "../anim/animPlayer.ts";
import { CLIPS, SHOTGUN_CLIPS, UPPER_BODY, aimLimb, deathFor, findBone, pick, rotateBoneWorld } from "../anim/rig.ts";
import { RADBRO_GRIPS, SHOTGUN_SCALE } from "../anim/grips.ts";
import { LONG_GUN_GEOM, LongGunHold, READY } from "../anim/hold.ts";
import { RADBRO_GAIT, RUN_FROM, clipSpeed, legsFor } from "../anim/gait.ts";
import { clipsPath, gunClipsPath, lightUp, modelPath, r2ClipsPath } from "./characters.ts";
import { SHOTGUN_PUMP, SHOTGUN_RACK, aimHand, attachGun, makeAk, makePistol, makeShotgun, makeSmg, muzzleWorld } from "./guns.ts";
import { useUi, type RadbroId } from "../ui/store.ts";
import { FRAME } from "./frame.ts";
import { TIME } from "../sim/tuning.ts";
import { WEAPONS, isLongGun } from "../combat/weapons.ts";
import { SHOULDER, wrapAngle } from "../sim/aim.ts";
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
const PLAYER_FRONT = { shotgun: 0.13, ak: 0.12 } as const;
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
/** A gun drawn flat for the hold check's pixel count. */
const MASK = new MeshBasicMaterial({ color: "#ff00ff", toneMapped: false });
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
  id: RadbroId;
  root: Group;
  model: Object3D;
  player: AnimPlayer;
  materials: Material[];
  bones: Record<"hips" | "spine02" | "spine01" | "spine" | "neck" | "head" | "lClav" | "lArm" | "lFore" | "lHand" | "rClav" | "rArm" | "rFore" | "rHand", Bone | undefined>;
  guns: [Group, Group];
  smgs: [Group, Group];
  shotgun: Group;
  ak: Group;
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

function makeRig(id: RadbroId, src: Object3D, pack: Object3D | null, gunPack: Object3D | null, r2Pack: Object3D | null): Rig {
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
  for (const g of [...smgs, shotgun, ak]) g.visible = false;
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
  return { id, root, model, player, materials, guns, smgs, shotgun, ak, bones, hit, reload, sgFire, sgReload, swap, hold, base, pose };
}

/** The guns in his hands for a weapon (a long gun's muzzle serves both "hands"). */
function handGuns(rig: Rig, w: string): Group[] {
  return w === "shotgun" ? [rig.shotgun, rig.shotgun] : w === "ak" ? [rig.ak, rig.ak] : w === "smgs" ? rig.smgs : rig.guns;
}

/** Dev hold check: the shown gun's screen box and muzzle point (px), and the flat mask for the pixel count. */
function holdCheckView(rig: Rig, gun: Group, cam: Camera, size: { width: number; height: number }): void {
  const all = [...rig.guns, ...rig.smgs, rig.shotgun, rig.ak];
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
    ikW: 0, readyW: 1, sinceShot: 99, lgRecoil: 0, posed: false });
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
      if (e.type === "reload") {
        // the shotgun's authored feed; the AK's mag change is a left-hand path on the hold (no layer)
        const lay = w === "shotgun" ? rig.sgReload : w === "ak" ? null : rig.reload;
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
      r.shown = p.weapon.id; r.swapTo = ""; r.swapT = -1; r.swapW = 0; r.fireW = 0; r.ikW = 1; r.readyW = 1; r.sinceShot = 99; r.lgRecoil = 0;
      pl.force(pick(pl, (isLongGun(p.weapon.id) ? SHOTGUN_CLIPS : CLIPS).idle), 0);
      rig.hit?.stop();
      rig.reload?.stop();
      rig.sgFire?.stop();
      rig.sgReload?.stop();
      rig.swap?.stop();
    }
    // the swap: the guns change hands at SWAP_AT, the clip set with them
    if (r.swapT >= 0) {
      r.swapT += dt * Math.max(g.timeScale, TIME.playerInBulletTime) * (s.paused ? 0 : 1);
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
        pl.play(pick(pl, C.getUp), { hold: true, timeScale: 2.8, fade: 0.12 });
        r.clip = "getup";
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
      if (!p.grounded) {
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
    const ts = s.paused ? 0 : realTime ? 1 : Math.max(s.game.timeScale, TIME.playerInBulletTime);
    // the reload layer's weight rides on the weapon's reload (eased in over ~0.15 s)
    const r = st.current;
    const dt = Math.min(rawDelta, 0.1);
    const reloading = s.game.player.weapon.reloadT > 0 && m === "normal";
    r.reloadW += ((reloading ? 1 : 0) - r.reloadW) * Math.min(1, 12 * dt);
    const long = isLongGun(r.shown);
    rig.reload?.setEffectiveWeight(long ? 0 : 2.4 * r.reloadW);
    rig.sgReload?.setEffectiveWeight(r.shown === "shotgun" ? 1.6 * r.reloadW : 0);
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
    const pdt = s.paused ? 0 : dt * Math.max(g.timeScale, TIME.playerInBulletTime);
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
      ready = normal ? r.readyW * (1 - runShare) * (1 - reloadK) : tumble ? 1 : 0;
      if (holdDev.on && holdDev.tweak.ready !== undefined) ready = holdDev.tweak.ready;
    }
    if (alive && normal) {
      // spine twist back toward the aim, and a little pitch with it (more with a long gun: the chest
      // carries the shouldered gun onto the aim, the hold only corrects the rest); the low ready turns
      // the chest a little to his right (the gun goes out from his body, where the camera sees it)
      const twist = r.twist - (long ? READY.twist * ready + HOLD.aimTwist * (1 - ready) * (1 - reloadK) : 0);
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
    const armWant = !alive || p.mode === "roll" || p.mode === "getup" ? 0 : 1;
    r.armW += (armWant - r.armW) * Math.min(1, (armWant ? 8 : 16) * dt);
    const t = g.aimPoint;
    tmp.aim.set(t.x, t.y, t.z);
    const armK = r.armW * (1 - r.swapW);
    const held = handGuns(rig, r.shown);
    rig.guns.forEach(gun => { gun.visible = r.shown === "pistols"; });
    rig.smgs.forEach(gun => { gun.visible = r.shown === "smgs"; });
    rig.shotgun.visible = r.shown === "shotgun";
    rig.ak.visible = r.shown === "ak";
    if (long && rig.hold?.sampled) {
      const lg = r.shown === "ak" ? rig.ak : rig.shotgun;
      const geom = LONG_GUN_GEOM[r.shown === "ak" ? "ak" : "shotgun"];
      // both hands stay on the gun through everything but death (in at a swap, out as he falls)
      const ikWant = alive ? 1 : 0;
      r.ikW += (ikWant - r.ikW) * Math.min(1, dt / (ikWant ? HOLD.ikIn : HOLD.ikOut));
      let ik = r.ikW * (1 - r.swapW);
      if (holdDev.on && holdDev.tweak.ik !== undefined) ik = holdDev.tweak.ik;
      // recoil: the shotgun's fire layer kicks it when standing; the AK (and a shot from a dive) here
      r.lgRecoil = Math.max(0, r.lgRecoil - dt / 0.12 * Math.max(g.timeScale, 0.3));
      const recoil = r.shown === "ak" ? 0.6 * r.lgRecoil : r.lgRecoil;
      // the AK's mag change: a scripted left-palm path over the reload, the gun tipped toward it
      let leftPath: { local: Vector3; world: Vector3; mix: number; w: number } | null = null;
      let tiltDown = 0, tiltRoll = 0, magRide = false;
      const mag = lg.userData.mag as Object3D | undefined;
      if (mag) { mag.visible = true; mag.position.copy(AK_MAG_AT); }
      if (r.shown === "ak" && p.weapon.reloadT > 0 && alive) {
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
      }
      const out = rig.hold.solve({
        gun: lg,
        geom,
        longShare,
        weight: ik,
        aim: alive ? tmp.aim : null,
        aimW: alive ? (1 - 0.9 * (r.shown === "shotgun" ? reloadK : 0)) * (1 - (1 - READY.aim) * ready) : 0,
        aimMax: lying ? HOLD.aimMaxLying : HOLD.aimMax,
        ready,
        tiltDown,
        tiltRoll,
        cant: HOLD.cant * (1 - reloadK),
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
        const exempt = (r.shown === "shotgun" && r.reloadW > 0.02 && !!rig.sgReload && rig.sgReload.time < 1.5) || (!!leftPath && leftPath.w > 0.02) || r.swapW > 0.02 || !alive;
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
      aimLimb(B.lArm, B.lHand, lOff, armK * (1 - 0.95 * r.reloadW));
      // recoil: a quick kick up at the elbow (the SMGs kick a little less, but faster)
      const kick = r.shown === "smgs" ? 0.16 : 0.3;
      for (const h of [0, 1] as const) {
        r.recoil[h] = Math.max(0, r.recoil[h] - dt * 14 * Math.max(g.timeScale, 0.3));
        if (r.recoil[h] > 0 && alive) rotateBoneWorld(h === 0 ? B.rFore : B.lFore, tmp.side, kick * r.recoil[h]);
      }
      // the wrists bend the guns onto the crosshair point; the guns stay in the palms at their grips
      held.forEach((gun, h) => aimHand(h === 0 ? B.rHand : B.lHand, gun, alive ? tmp.aim : null, armK * (1 - (h === 1 ? 0.9 : 0.5) * r.reloadW), 0.75));
      if (holdDev.on) {
        const clipQ = (bone: Bone | undefined) => rig.pose.find(x => x.bone === bone)?.q;
        const qr = clipQ(B.rHand), ql = clipQ(B.lHand);
        const bend = rig.hold && B.rHand && B.lHand && qr && ql ? Math.max(rig.hold.swing(B.rHand, qr, false), rig.hold.swing(B.lHand, ql, true)) : 0;
        Object.assign(holdDev.last, { grip: 0, left: 0, bend, flip: false, reach: 0, slide: 0, shift: 0, exempt: true, ik: 0, ready: 0, long: 0 });
        holdDev.record({ ...holdDev.last });
      }
    }
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
    rig.model.visible = fade > HIDE_BELOW;
    if (fade <= 0.6) for (const gun of [...rig.guns, ...rig.smgs, rig.shotgun, rig.ak]) gun.visible = false;
    if (holdDev.on) {
      holdCheckView(rig, held[0], state.camera, state.size);
      (holdDev as unknown as { rig: Rig }).rig = rig;
    }
  }, FRAME.bones);

  if (!rig) return null;
  return <primitive object={rig.root} />;
}
