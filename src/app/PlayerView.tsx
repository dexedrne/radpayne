// The player's Radbro: RadRun's game character driven from the sim with the shooter clip set.
//   -5 actors: root placement + facing, the clip for the state. The body faces the aim; the legs pick
//      aimed forward / back / strafe clips by the move direction (a small leg yaw for diagonals, the
//      spine twists back). Shift: Shootdodge -> Prone_Idle -> Prone_GetUp (or Land_Roll into a run).
//   -4 animator: mixer on the player's clock (0.5x in bullet time; the dive chain runs in real time).
//   -3 bones: spine twist + pitch toward the aim, both arms onto the crosshair point, recoil kicks,
//      the reload layer (upper body) and the additive hit flinch; the pistols sit in the hands with the
//      clip set's grip offsets and swing (clamped) onto the crosshair point.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAssetRuntime } from "react-three-game";
import { AnimationUtils, Group, LoopOnce, Quaternion, Vector3, type AnimationAction, type AnimationClip, type Bone, type Material, type Mesh, type Object3D } from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Session } from "./session.ts";
import { AnimPlayer } from "../anim/animPlayer.ts";
import { CLIPS, UPPER_BODY, aimLimb, deathFor, findBone, pick, rotateBoneWorld } from "../anim/rig.ts";
import { RADBRO_GRIPS } from "../anim/grips.ts";
import { RADBRO_GAIT, RUN_FROM, clipSpeed, legsFor } from "../anim/gait.ts";
import { clipsPath, gunClipsPath, lightUp, modelPath } from "./characters.ts";
import { aimGun, attachGun, makePistol, muzzleWorld } from "./guns.ts";
import { useUi, type RadbroId } from "../ui/store.ts";
import { FRAME } from "./frame.ts";
import { TIME } from "../sim/tuning.ts";
import { WEAPONS } from "../combat/weapons.ts";
import { SHOULDER, wrapAngle } from "../sim/aim.ts";
import { camView } from "./CameraView.tsx";

const UP = new Vector3(0, 1, 0);
/** Player pistol size over true scale. */
const GUN_SCALE = 1.3;
/** Arms spread apart (radians off the aim line; right, left): the akimbo stance puts the right gun out
 *  past his big head and hair, where the shoulder camera sees it; the guns swing back onto the
 *  crosshair (aimGun). The left one is behind him from that camera whatever it does. */
const ARM_SPREAD = [0.5, 0.25] as const;
/** Under this fade he is hidden outright: a dither this close to the lens breaks up into solid blobs. */
const HIDE_BELOW = 0.45;

type Rig = {
  id: RadbroId;
  root: Group;
  model: Object3D;
  player: AnimPlayer;
  materials: Material[];
  bones: Record<"hips" | "spine02" | "spine01" | "spine" | "neck" | "head" | "lArm" | "lFore" | "lHand" | "rArm" | "rFore" | "rHand", Bone | undefined>;
  guns: [Group, Group];
  hit: AnimationAction | null;
  reload: AnimationAction | null;
};

/** Rendered muzzles (hand 0 = right, 1 = left) for flashes and tracers. */
export const playerMuzzles: [Vector3, Vector3] = [new Vector3(), new Vector3()];
/** Rendered head / chest points (the kill cam and hit FX look at these). */
export const playerHead = new Vector3();

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

function makeRig(id: RadbroId, src: Object3D, pack: Object3D | null, gunPack: Object3D | null): Rig {
  const model = cloneSkeleton(src);
  const materials = lightUp(model);
  // screen-door fade when a wall pulls the camera into his back (no transparency sorting, no recompiles)
  for (const m of materials) m.alphaHash = true;
  const root = new Group();
  root.name = `radbro-${id}`;
  root.add(model);
  const pinY = new Set(["Regular_Jump", "Free_Fall", "Leap_of_Faith"]);
  const player = new AnimPlayer(model, [clipsOf(gunPack), clipsOf(src), clipsOf(pack)], {
    fade: 0.18,
    // deaths keep their travel (the body flies where the clip puts it); the game moves the capsule otherwise
    policy: name => ({ xz: name.startsWith("Death_") ? "keep" : "pin", y: pinY.has(name) ? "pin" : "keep" }),
  });
  const b = (n: string) => findBone(model, n);
  const bones = {
    hips: b("Hips"), spine02: b("Spine02"), spine01: b("Spine01"), spine: b("Spine"), neck: b("neck"), head: b("Head"),
    lArm: b("LeftArm"), lFore: b("LeftForeArm"), lHand: b("LeftHand"), rArm: b("RightArm"), rFore: b("RightForeArm"), rHand: b("RightHand"),
  };
  // steel-slide pistols a size up: his chibi hands swallow a true-to-scale gun, and from over the
  // shoulder the guns are what says "Max Payne"
  const guns: [Group, Group] = [makePistol(true), makePistol(true)];
  const grips = RADBRO_GRIPS[id];
  if (bones.rHand) attachGun(guns[0], bones.rHand, grips.right, 1, GUN_SCALE);
  if (bones.lHand) attachGun(guns[1], bones.lHand, grips.left, 1, GUN_SCALE);
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
  return { id, root, model, player, materials, guns, bones, hit, reload };
}

export function PlayerView({ s }: { s: Session }) {
  const assets = useAssetRuntime();
  const radbro = useUi(st => st.radbro);
  const version = useUi(st => st.assetsVersion);
  const rig = useMemo(() => {
    void version;
    const src = assets.getModel(modelPath(radbro));
    if (!src) return null;
    return makeRig(radbro, src, assets.getModel(clipsPath(radbro)), assets.getModel(gunClipsPath(radbro)));
  }, [assets, radbro, version]);
  const st = useRef({ legYaw: 0, bodyYaw: 0, twist: 0, back: false, fade: 1, recoil: [0, 0], run: -1, clip: "", mode: "", jumpHold: false, reloadW: 0, armW: 1, diveY: 0, faded: false });
  const tmp = useMemo(() => ({ aim: new Vector3(), side: new Vector3(), a: new Vector3(), q: new Quaternion() }), []);

  useEffect(() => {
    if (!rig) return;
    const off = s.on(e => {
      const r = st.current;
      if (e.type === "shot" && e.shooter === -1) r.recoil[e.hand] = 1;
      if (e.type === "hurt" && e.target === -1 && e.hp > 0 && rig.hit) rig.hit.reset().setEffectiveWeight(0.9).play();
      if (e.type === "reload" && rig.reload) {
        const d = rig.reload.getClip().duration;
        rig.reload.reset().setEffectiveTimeScale(d / WEAPONS[s.game.player.weapon.id].reload).setEffectiveWeight(0).play();
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
      pl.force(pick(pl, CLIPS.idle), 0);
      rig.hit?.stop();
      rig.reload?.stop();
    }
    // mode entries: the dive chain, the roll, the get-up, death
    if (p.mode !== r.mode) {
      const prev = r.mode;
      r.mode = p.mode;
      if (p.mode === "dive") {
        r.diveY = pos.y;
        r.bodyYaw = Math.atan2(p.dirX, p.dirZ);
        const dive = pick(pl, CLIPS.dive);
        // the clip's airborne span (0.15-0.95 s) over the sim's 0.9 s; it ends on Prone_Idle's first frame
        if (dive) pl.play(dive, { once: true, then: pick(pl, CLIPS.prone), startAt: 0.1, timeScale: 0.95, fade: 0.08 });
        r.clip = dive;
      } else if (p.mode === "prone") {
        if (!pl.busy) pl.force(pick(pl, CLIPS.prone), 0.15);
        else pl.base = pick(pl, CLIPS.prone);
        r.clip = "prone";
      } else if (p.mode === "roll") {
        r.bodyYaw = Math.atan2(p.dirX, p.dirZ);
        pl.play(pick(pl, CLIPS.roll), { hold: true, timeScale: 3.2, fade: 0.1, startAt: 0.1 });
        r.clip = "roll";
      } else if (p.mode === "getup") {
        pl.play(pick(pl, CLIPS.getUp), { hold: true, timeScale: 2.8, fade: 0.12 });
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
          const j = pick(pl, CLIPS.jump);
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
        want = pick(pl, speed > RUN_FROM ? CLIPS.run : CLIPS.walk);
        rate = (legs.back ? -1 : 1) * speed / clipSpeed(gait, want);
      } else want = pick(pl, CLIPS.idle);
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
    // the reload layer's weight rides on the weapon's reload
    const r = st.current;
    const reloading = s.game.player.weapon.reloadT > 0 && m === "normal";
    r.reloadW += ((reloading ? 1 : 0) - r.reloadW) * Math.min(1, 12 * Math.min(rawDelta, 0.1));
    rig.reload?.setEffectiveWeight(2.4 * r.reloadW);
    rig.player.update(Math.min(rawDelta, 0.1) * ts);
  }, FRAME.animator);

  // -3: bones (twist, pitch, aim arms, recoil, guns)
  useFrame((_, rawDelta) => {
    if (!rig) return;
    const g = s.game, p = g.player, r = st.current, B = rig.bones;
    const dt = Math.min(rawDelta, 0.1);
    rig.root.updateMatrixWorld(true);
    const alive = p.mode !== "dead";
    const normal = p.mode === "normal";
    tmp.side.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    if (alive && normal) {
      // spine twist back toward the aim, and a little pitch with it
      if (Math.abs(r.twist) > 1e-3) {
        rotateBoneWorld(B.spine02, UP, r.twist * 0.3);
        rotateBoneWorld(B.spine01, UP, r.twist * 0.3);
        rotateBoneWorld(B.spine, UP, r.twist * 0.4);
      }
      rotateBoneWorld(B.spine01, tmp.side, p.pitch * 0.22 * (1 - r.reloadW));
      rotateBoneWorld(B.spine, tmp.side, p.pitch * 0.18 * (1 - r.reloadW));
    }
    // arms onto the aim point (the clips already hold them out; this makes it exact)
    const armWant = !alive || p.mode === "roll" || p.mode === "getup" ? 0 : 1;
    r.armW += (armWant - r.armW) * Math.min(1, (armWant ? 8 : 16) * dt);
    const t = g.aimPoint;
    tmp.aim.set(t.x, t.y, t.z);
    // each arm aims a little outside the crosshair point (akimbo), scaled with the distance
    const reach = B.rArm ? B.rArm.getWorldPosition(tmp.a).distanceTo(tmp.aim) : 10;
    const rOff = tmp.a.copy(tmp.side).multiplyScalar(0.07 + Math.tan(ARM_SPREAD[0]) * reach).add(tmp.aim).clone();
    const lOff = tmp.a.copy(tmp.side).multiplyScalar(-(0.07 + Math.tan(ARM_SPREAD[1]) * reach)).add(tmp.aim);
    aimLimb(B.rArm, B.rHand, rOff, r.armW * (1 - 0.6 * r.reloadW));
    aimLimb(B.lArm, B.lHand, lOff, r.armW * (1 - 0.95 * r.reloadW));
    // recoil: a quick kick up at the elbow
    for (const h of [0, 1] as const) {
      r.recoil[h] = Math.max(0, r.recoil[h] - dt * 14 * Math.max(g.timeScale, 0.3));
      if (r.recoil[h] > 0 && alive) rotateBoneWorld(h === 0 ? B.rFore : B.lFore, tmp.side, 0.3 * r.recoil[h]);
    }
    // pistols: grip in the hand, barrel swung onto the crosshair point
    rig.guns.forEach((gun, h) => {
      aimGun(gun, alive ? tmp.aim : null, r.armW * (1 - (h === 1 ? 0.9 : 0.5) * r.reloadW), 0.75);
      muzzleWorld(gun, playerMuzzles[h]);
    });
    B.head?.getWorldPosition(playerHead);
    // a short camera arm (wall or cover right behind him) fades him out so he never fills the frame
    // (and a pivot slid in by a wall at his right puts him in front of the crosshair: half see-through)
    const fadeWant = g.killcam ? 1 : Math.max(0, Math.min(1, (camView.arm - 0.75) / 0.75, 0.5 + (0.5 * camView.right) / SHOULDER.right));
    r.fade += (fadeWant - r.fade) * Math.min(1, 14 * dt);
    const fade = r.fade > 0.98 ? 1 : r.fade;
    // every material under him (the street look can swap / add some after the rig is built)
    if (fade < 1 || r.faded) {
      fadeTree(rig.model, fade);
      r.faded = fade < 1;
    }
    rig.model.visible = fade > HIDE_BELOW;
    for (const gun of rig.guns) gun.visible = fade > 0.6;
  }, FRAME.bones);

  if (!rig) return null;
  return <primitive object={rig.root} />;
}
