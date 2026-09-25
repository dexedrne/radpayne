// The player's Radbro: RadRun's game character with its own AnimPlayer, driven from the sim.
//   -5 actors: root placement (feet on the sim position; lying along the dive for dive / prone, a
//      procedural forward roll), leg facing (runs the way he moves; backpedals with the walk reversed),
//      the clip for the state.
//   -4 animator: mixer on the player's clock (0.5x in bullet time).
//   -3 bones: spine twist back toward the aim, both arms swing onto the crosshair point, recoil kicks,
//      the pistols follow the hands.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAssetRuntime } from "react-three-game";
import { Group, Matrix4, Quaternion, Vector3, type AnimationClip, type Bone, type Material, type Object3D } from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Session } from "./session.ts";
import { AnimPlayer } from "../anim/animPlayer.ts";
import { AIMED, CLIPS, aimLimb, findBone, pick, rotateBoneWorld } from "../anim/rig.ts";
import { clipsPath, gunClipsPath, lightUp, modelPath } from "./characters.ts";
import { makePistol, muzzleWorld } from "./guns.ts";
import { useUi, type RadbroId } from "../ui/store.ts";
import { FRAME } from "./frame.ts";
import { DODGE, TIME } from "../sim/tuning.ts";
import { wrapAngle } from "../sim/aim.ts";

const UP = new Vector3(0, 1, 0);
/** Hips height of the standing Radbro (feet at 0). */
const HIPS = 0.75;

type Rig = {
  id: RadbroId;
  root: Group;
  model: Object3D;
  player: AnimPlayer;
  materials: Material[];
  bones: Record<"hips" | "spine02" | "spine01" | "spine" | "neck" | "head" | "lArm" | "lFore" | "lHand" | "rArm" | "rFore" | "rHand", Bone | undefined>;
  guns: [Group, Group];
};

/** Rendered muzzles (hand 0 = right, 1 = left) for flashes and tracers. */
export const playerMuzzles: [Vector3, Vector3] = [new Vector3(), new Vector3()];
/** Rendered head / chest points (the kill cam and hit FX look at these). */
export const playerHead = new Vector3();

function makeRig(id: RadbroId, src: Object3D, pack: Object3D | null, gunPack: Object3D | null): Rig {
  const model = cloneSkeleton(src);
  const materials = lightUp(model);
  const root = new Group();
  root.name = `radbro-${id}`;
  root.add(model);
  const clipsOf = (o: Object3D | null) => ((o as unknown as { animations?: AnimationClip[] } | null)?.animations ?? []) as AnimationClip[];
  const pinY = new Set(["Regular_Jump", "Free_Fall", "Leap_of_Faith", "Pistol_Jump"]);
  const player = new AnimPlayer(model, [clipsOf(gunPack), clipsOf(src), clipsOf(pack)], {
    fade: 0.18,
    policy: name => ({ xz: "pin", y: pinY.has(name) ? "pin" : "keep" }),
  });
  const b = (n: string) => findBone(model, n);
  const guns: [Group, Group] = [makePistol(), makePistol()];
  return {
    id, root, model, player, materials, guns,
    bones: {
      hips: b("Hips"), spine02: b("Spine02"), spine01: b("Spine01"), spine: b("Spine"), neck: b("neck"), head: b("Head"),
      lArm: b("LeftArm"), lFore: b("LeftForeArm"), lHand: b("LeftHand"), rArm: b("RightArm"), rFore: b("RightForeArm"), rHand: b("RightHand"),
    },
  };
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
  const st = useRef({ legYaw: 0, lie: 0, roll: 0, twist: 0, recoil: [0, 0], flinch: 0, dead: false, run: -1, clip: "", jumpHold: false, reloadW: 0 });
  const tmp = useMemo(() => ({
    qs: new Quaternion(), ql: new Quaternion(), q: new Quaternion(), m: new Matrix4(), x: new Vector3(), y: new Vector3(), z: new Vector3(),
    aim: new Vector3(), side: new Vector3(), a: new Vector3(), fwd: new Vector3(), rollAxis: new Vector3(), qr: new Quaternion(), hand: new Vector3(),
  }), []);

  useEffect(() => {
    if (!rig) return;
    const off = s.on(e => {
      const r = st.current;
      if (e.type === "shot" && e.shooter === -1) r.recoil[e.hand] = 1;
      if (e.type === "hurt" && e.target === -1) r.flinch = 1;
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
    const dt = Math.min(rawDelta, 0.1);
    if (r.run !== s.run) {
      r.run = s.run; r.dead = false; r.clip = ""; r.lie = 0; r.legYaw = p.facing; r.jumpHold = false;
      rig.player.force(pick(rig.player, CLIPS.idle), 0);
    }
    const pos = s.renderP;
    const pl = rig.player;

    // lying blend: dive / prone -> 1, get-up eases back over its 0.6 s
    const lyingNow = p.mode === "dive" || p.mode === "prone";
    const lieWant = lyingNow ? 1 : p.mode === "getup" ? Math.max(0, 1 - p.modeT / DODGE.getUp) : 0;
    r.lie += (lieWant - r.lie) * Math.min(1, (lyingNow ? 16 : 30) * dt);
    if (p.mode === "getup") r.lie = lieWant;

    // clip for the state
    const speed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    let want = "";
    let rate = 1;
    let twistWant = 0;
    let legYawWant = p.facing;
    if (p.mode === "dead") {
      if (!r.dead) {
        r.dead = true;
        pl.play(pick(pl, CLIPS.death), { hold: true, fade: 0.1 });
      }
    } else if (p.mode === "dive") want = pick(pl, CLIPS.dive);
    else if (p.mode === "prone" || p.mode === "getup") want = pick(pl, p.mode === "prone" ? CLIPS.prone : CLIPS.idle);
    else if (p.mode === "roll") want = pick(pl, CLIPS.run);
    else if (!p.grounded) {
      if (!r.jumpHold) {
        r.jumpHold = true;
        const j = pick(pl, CLIPS.jump);
        if (j) pl.play(j, { hold: true, startAt: 0.48, freezeAt: 0.8, fade: 0.1 });
      }
    } else if (speed > 0.4) {
      const moveYaw = Math.atan2(p.vx, p.vz);
      const rel = wrapAngle(moveYaw - p.facing);
      if (Math.abs(rel) <= 1.95) {
        legYawWant = moveYaw;
        twistWant = -rel;
        want = pick(pl, speed > 3.2 ? CLIPS.run : CLIPS.walk);
        rate = want === "Run_02" ? speed / 5.6 : speed / 1.6;
      } else {
        legYawWant = moveYaw + Math.PI;
        twistWant = wrapAngle(p.facing - legYawWant);
        want = pick(pl, CLIPS.back);
        rate = -Math.max(0.9, speed / 1.5);
      }
    } else want = pick(pl, CLIPS.idle);
    if (p.grounded && r.jumpHold && p.mode !== "dead") { r.jumpHold = false; r.clip = ""; }
    if (want && !r.dead && !r.jumpHold) {
      if (want !== r.clip) { pl.force(want, 0.15, rate); r.clip = want; }
      else pl.setTimeScale(rate);
    }
    r.twist += (Math.max(-1.3, Math.min(1.3, twistWant)) - r.twist) * Math.min(1, 12 * dt);
    r.legYaw += wrapAngle(legYawWant - r.legYaw) * Math.min(1, 12 * dt);

    // standing orientation
    tmp.qs.setFromAxisAngle(UP, r.legYaw);
    let px = pos.x, py = pos.y, pz = pos.z;
    // lying orientation: head along the dive, chest toward the aim (face down when aiming ahead)
    if (r.lie > 0.001) {
      const dx = p.dirX, dz = p.dirZ;
      tmp.y.set(dx, 0, dz).normalize(); // head direction
      tmp.aim.set(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
      const along = tmp.aim.dot(tmp.y);
      tmp.z.copy(tmp.aim).addScaledVector(tmp.y, -along); // chest normal = aim across the body
      tmp.z.addScaledVector(UP, along > 0.5 ? -0.8 : 0.6);
      if (tmp.z.lengthSq() < 1e-4) tmp.z.set(0, 1, 0);
      tmp.z.normalize();
      tmp.x.crossVectors(tmp.y, tmp.z).normalize();
      tmp.z.crossVectors(tmp.x, tmp.y);
      tmp.m.makeBasis(tmp.x, tmp.y, tmp.z);
      tmp.ql.setFromRotationMatrix(tmp.m);
      tmp.q.copy(tmp.qs).slerp(tmp.ql, r.lie);
      const lieH = p.mode === "dive" ? 0.45 : 0.27;
      // hips at the body point, the root (feet) one hips-height back along the body
      const lx = pos.x - tmp.y.x * HIPS, ly = pos.y + lieH - tmp.y.y * HIPS, lz = pos.z - tmp.y.z * HIPS;
      px += (lx - px) * r.lie; py += (ly - py) * r.lie; pz += (lz - pz) * r.lie;
    } else tmp.q.copy(tmp.qs);
    // forward roll: one turn about the axis across the roll direction, pivoting at mid height
    if (p.mode === "roll") {
      const k = Math.min(1, p.modeT / DODGE.roll);
      tmp.rollAxis.set(p.dirZ, 0, -p.dirX).normalize();
      tmp.qr.setFromAxisAngle(tmp.rollAxis, k * Math.PI * 2);
      tmp.q.premultiply(tmp.qr);
      const pivotY = 0.55;
      tmp.a.set(0, -pivotY, 0).applyQuaternion(tmp.qr);
      px = pos.x + tmp.a.x; py = pos.y + pivotY + tmp.a.y; pz = pos.z + tmp.a.z;
    }
    rig.root.position.set(px, py, pz);
    rig.root.quaternion.copy(tmp.q);
  }, FRAME.actors);

  // -4: mixer on the player's clock
  useFrame((_, rawDelta) => {
    if (!rig) return;
    const ts = s.paused ? 0 : Math.max(s.game.timeScale, TIME.playerInBulletTime);
    rig.player.update(Math.min(rawDelta, 0.1) * ts);
  }, FRAME.animator);

  // -3: bones (twist, aim arms, recoil, guns)
  useFrame((_, rawDelta) => {
    if (!rig) return;
    const g = s.game, p = g.player, r = st.current, B = rig.bones;
    const dt = Math.min(rawDelta, 0.1);
    rig.root.updateMatrixWorld(true);
    const alive = p.mode !== "dead";
    // spine twist back toward the aim (standing only)
    const tw = r.twist * (1 - r.lie);
    if (alive && Math.abs(tw) > 1e-3) {
      rotateBoneWorld(B.spine02, UP, tw * 0.3);
      rotateBoneWorld(B.spine01, UP, tw * 0.3);
      rotateBoneWorld(B.spine, UP, tw * 0.4);
    }
    // hit flinch: the upper body snaps back
    r.flinch = Math.max(0, r.flinch - dt * 5);
    if (r.flinch > 0 && alive) {
      tmp.side.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      rotateBoneWorld(B.spine, tmp.side, 0.25 * r.flinch);
    }
    // arms onto the aim point; reload drops the left arm for a moment
    r.reloadW += ((p.weapon.reloadT > 0 ? 1 : 0) - r.reloadW) * Math.min(1, 10 * dt);
    const aimed = AIMED.has(rig.player.current);
    const w = alive && p.mode !== "getup" ? (aimed ? 0.35 : 1) : 0;
    const t = g.aimPoint;
    tmp.aim.set(t.x, t.y, t.z);
    tmp.side.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw)).multiplyScalar(0.08);
    aimLimb(B.rArm, B.rHand, tmp.a.copy(tmp.aim).add(tmp.side), w);
    aimLimb(B.lArm, B.lHand, tmp.a.copy(tmp.aim).sub(tmp.side), w * (1 - 0.7 * r.reloadW));
    // recoil: a quick kick up at the elbow
    for (const h of [0, 1] as const) {
      r.recoil[h] = Math.max(0, r.recoil[h] - dt * 14 * Math.max(g.timeScale, 0.3));
      if (r.recoil[h] > 0 && alive) {
        tmp.side.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
        rotateBoneWorld(h === 0 ? B.rFore : B.lFore, tmp.side, 0.35 * r.recoil[h]);
      }
    }
    // pistols in the hands, pointing at the aim point
    rig.guns.forEach((gun, h) => {
      const hand = h === 0 ? B.rHand : B.lHand;
      gun.visible = !!hand && rig.root.visible;
      if (!hand) return;
      hand.getWorldPosition(tmp.hand);
      gun.position.copy(tmp.hand);
      if (alive) gun.lookAt(tmp.aim);
      else gun.quaternion.copy(rig.root.quaternion);
      gun.updateMatrixWorld(true);
      muzzleWorld(gun, playerMuzzles[h]);
    });
    B.head?.getWorldPosition(playerHead);
  }, FRAME.bones);

  if (!rig) return null;
  return (
    <>
      <primitive object={rig.root} />
      <primitive object={rig.guns[0]} />
      <primitive object={rig.guns[1]} />
    </>
  );
}
