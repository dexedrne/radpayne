// The rival heavies (round-2 plan section 3): a recoloured Radbro (#652 / #723, "in black with one red
// accent") x1.12 with the pump shotgun, playing that Radbro's clip packs (the long-gun set, the stagger,
// the deaths). Reads the sim only:
//   the walk at body speed over its ground speed (no skating), the aimed idle when he stands, the
//   gun raised with the faint red laser sight for the tell (e.tell), Shotgun_Fire (kick + pump) on
//   each blast, Shotgun_Reload while he reloads, Heavy_Stagger on a big hit, a death picked by the
//   room behind him (Death_Back for a point-blank shotgun kill). Bodies stay down.
// Readability (REVIEW F1): his clothes are a mid charcoal, and the lift is ADDITIVE (a flat emissive),
// not his own near-black texture multiplied: he reads against the club's walls. His root is named
// "goon-<i>" so the look's hostile rim / outline takes him like the rest of the gang.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAssetRuntime } from "react-three-game";
import { AdditiveBlending, AnimationUtils, BoxGeometry, Group, LoopOnce, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Vector3, type AnimationAction, type AnimationClip, type Material, type Object3D } from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Session } from "./session.ts";
import type { Enemy } from "../sim/actors.ts";
import { AnimPlayer } from "../anim/animPlayer.ts";
import { UPPER_BODY, deathFor, findBone, pick, rotateBoneWorld } from "../anim/rig.ts";
import { RADBRO_GRIPS, SHOTGUN_SCALE } from "../anim/grips.ts";
import { RADBRO_GAIT } from "../anim/gait.ts";
import { clipsPath, gunClipsPath, lightUp, r2ClipsPath, rivalBase, rivalPath } from "./characters.ts";
import { SHOTGUN_PUMP, SHOTGUN_RACK, SHOTGUN_THICK, attachGun, makeShotgun, muzzleWorld } from "./guns.ts";
import { hostileEmissive, setHostileRim } from "./look/tokens.ts";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { enemyMuzzles } from "./EnemiesView.tsx";
import { FRAME } from "./frame.ts";
import { HEAVY_SCALE } from "../sim/tuning.ts";
import { wrapAngle } from "../sim/aim.ts";
import { breathe } from "./warmup.ts";

const UP = new Vector3(0, 1, 0);
/** Additive lift on every heavy material (linear): mid grey, so the charcoal reads on a dark wall. */
const LIFT = 0.1;
/** The laser sight: a hairline, faint, red; brighter at the end of the tell. */
const LASER = { width: 0.008, color: [2.2, 0.08, 0.1] as const, opacity: 0.45, max: 40 };

type HeavyRig = {
  idx: number;
  root: Group;
  model: Object3D;
  player: AnimPlayer;
  materials: Material[];
  shotgun: Group;
  spine: Object3D | undefined;
  hit: AnimationAction | null;
  fire: AnimationAction | null;
  reload: AnimationAction | null;
  laser: Mesh;
  clip: string;
  yaw: number;
  deadShown: boolean;
  blast: boolean;
  fireW: number;
  reloadW: number;
  /** The hostile rim now (fades to 0 once he is down). */
  rim: number;
};

const clipsOf = (o: Object3D | null) => ((o as unknown as { animations?: AnimationClip[] } | null)?.animations ?? []) as AnimationClip[];
const laserGeo = new BoxGeometry(1, 1, 1);
laserGeo.translate(0, 0, 0.5);

function layer(rig: AnimPlayer, clips: AnimationClip[], name: string): AnimationAction | null {
  const src = clips.find(c => c.name === name);
  if (!src) return null;
  const c = src.clone();
  c.name = `${name}_upper`;
  c.tracks = c.tracks.filter(t => UPPER_BODY.test(t.name));
  const a = rig.mixer.clipAction(c);
  a.setLoop(LoopOnce, 1);
  a.clampWhenFinished = true;
  return a;
}

function makeHeavy(e: Enemy, src: Object3D, pack: Object3D | null, gunPack: Object3D | null, r2Pack: Object3D | null): HeavyRig {
  const base = rivalBase(e.model);
  const model = cloneSkeleton(src);
  lightUp(model, 0.7, 0);
  // node materials with a flat (additive) lift + the hostile rim, instead of the texture-multiplied lift
  const materials: Material[] = [];
  model.traverse(o => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const conv = (m: Material): Material => {
      const std = m as MeshStandardMaterial;
      const n = new MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0 });
      Object.assign(n, { map: std.map ?? null, transparent: std.transparent, opacity: std.opacity, alphaTest: std.alphaTest, side: std.side });
      if (std.color) n.color.copy(std.color);
      n.userData.rpOwn = true;
      n.userData.rpHeavy = true;
      hostileEmissive(n, 0, LIFT);
      m.dispose();
      materials.push(n);
      return n;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material);
  });
  const root = new Group();
  root.name = `goon-${e.idx}`;
  root.userData.rpActor = true;
  root.scale.setScalar(HEAVY_SCALE);
  root.add(model);
  const player = new AnimPlayer(model, [clipsOf(gunPack), clipsOf(r2Pack), clipsOf(src), clipsOf(pack)], {
    fade: 0.18,
    policy: name => ({ xz: name.startsWith("Death_") || name === "Heavy_Stagger" ? "keep" : "pin", y: "keep" }),
  });
  const shotgun = makeShotgun();
  const hand = findBone(model, "RightHand");
  if (hand) attachGun(shotgun, hand, RADBRO_GRIPS[base].right, 1, [SHOTGUN_THICK, SHOTGUN_THICK, SHOTGUN_SCALE[base]]);
  let hit: AnimationAction | null = null;
  const hc = clipsOf(gunPack).find(c => c.name === "Hit_Small");
  if (hc) {
    const c = hc.clone();
    c.name = "Hit_Small_add";
    c.tracks = c.tracks.filter(t => !t.name.endsWith(".position"));
    AnimationUtils.makeClipAdditive(c);
    hit = player.mixer.clipAction(c);
    hit.setLoop(LoopOnce, 1);
  }
  const r2 = clipsOf(r2Pack);
  const laserMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  laserMat.color.setRGB(LASER.color[0], LASER.color[1], LASER.color[2]);
  laserMat.userData.rpOwn = true;
  const laser = new Mesh(laserGeo, laserMat);
  laser.frustumCulled = false;
  laser.visible = false;
  laser.renderOrder = 6;
  return {
    idx: e.idx, root, model, player, materials, shotgun, spine: findBone(model, "Spine"), hit,
    fire: layer(player, r2, "Shotgun_Fire"), reload: layer(player, r2, "Shotgun_Reload"), laser,
    clip: "", yaw: e.facing, deadShown: false, blast: false, fireW: 0, reloadW: 0, rim: 1,
  };
}

const V = { a: new Vector3(), b: new Vector3(), dir: new Vector3(), want: new Vector3(), axis: new Vector3(), q: new Quaternion() };

export function HeavyView({ s }: { s: Session }) {
  const assets = useAssetRuntime();
  const heavies = useMemo(() => s.game.enemies.filter(e => e.kind === "heavy"), [s]);
  const group = useMemo(() => new Group(), []);
  const rigs = useRef<Array<HeavyRig | null>>([]);
  const run = useRef(-1);

  // load the rival models and their Radbro's clip packs, then build one rig per heavy
  useEffect(() => {
    if (!heavies.length) return;
    let live = true;
    rigs.current = heavies.map(() => null);
    const load = (p: string) => assets.loadModel(p).then(() => assets.getModel(p), () => null);
    void (async () => {
      for (let i = 0; i < heavies.length; i++) {
        const e = heavies[i];
        const base = rivalBase(e.model);
        const [src, pack, gun, r2] = await Promise.all([load(rivalPath(e.model)), load(clipsPath(base)), load(gunClipsPath(base)), load(r2ClipsPath(base))]);
        if (!live) return;
        if (!src) { console.info(`[heavy] ${e.id}: no model ${e.model}`); continue; }
        await breathe();
        if (!live) return;
        const rig = makeHeavy(e, src, pack, gun, r2);
        // posed before he is shown (never a frame of bind pose): the aimed idle, applied now
        const idle = pick(rig.player, ["Shotgun_Aim_Idle", "Aim_Idle", "Idle"]);
        if (idle) { rig.player.force(idle, 0); rig.player.update(0); }
        rigs.current[i] = rig;
        group.add(rig.root, rig.laser);
        console.info(`[heavy] ${e.id}: ${e.model} ready (${rig.player.clips.size} clips)`);
      }
    })();
    const off = s.on(ev => {
      const i = ev.type === "hurt" || ev.type === "kill" || ev.type === "stagger" ? heavies.findIndex(h => h.idx === (ev.type === "stagger" ? ev.enemy : ev.target)) : ev.type === "shot" ? heavies.findIndex(h => h.idx === ev.shooter) : -1;
      const rig = i >= 0 ? rigs.current[i] : null;
      if (!rig) return;
      if (ev.type === "hurt" && ev.hp > 0) rig.hit?.reset().setEffectiveWeight(0.8).play();
      if (ev.type === "kill") rig.blast = ev.blast === true;
      if (ev.type === "shot" && ev.pellet === 0 && rig.fire) rig.fire.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
      if (ev.type === "stagger") { rig.hit?.stop(); const st = pick(rig.player, ["Heavy_Stagger"]); if (st) { rig.player.play(st, { once: true, fade: 0.08 }); rig.clip = st; } }
    });
    return () => {
      live = false;
      off();
      for (const r of rigs.current) {
        if (!r) continue;
        group.remove(r.root, r.laser);
        r.player.dispose();
        for (const m of r.materials) m.dispose();
        (r.laser.material as Material).dispose();
      }
      rigs.current = [];
    };
  }, [heavies, assets, group, s]);

  // -5: root, facing, clip
  useFrame((_, raw) => {
    const g = s.game;
    const dt = Math.min(raw, 0.1);
    if (run.current !== s.run) {
      run.current = s.run;
      for (const r of rigs.current) if (r) { r.deadShown = false; r.blast = false; r.clip = ""; r.yaw = g.enemies[r.idx]?.facing ?? 0; r.fire?.stop(); r.reload?.stop(); r.hit?.stop(); r.rim = 1; setHostileRim(r.root, 1); }
    }
    rigs.current.forEach(r => {
      if (!r) return;
      const e = g.enemies[r.idx];
      const p = s.renderE[r.idx] ?? e;
      r.root.visible = e.state !== "inactive";
      if (!r.root.visible) return;
      r.root.position.set(p.x, p.y, p.z);
      const rimWant = e.state === "dead" && !e.deathHold ? 0 : 1;
      if (r.rim !== rimWant) { r.rim = rimWant > r.rim ? 1 : Math.max(0, r.rim - dt / 0.6); setHostileRim(r.root, r.rim); }
      const pl = r.player;
      if (e.state === "dead") {
        if (!r.deadShown && !e.deathHold) {
          r.deadShown = true;
          r.yaw = Math.atan2(-e.killDX, -e.killDZ);
          const l = Math.hypot(e.killDX, e.killDZ) || 1;
          const hit = g.world.raycast(e.x, e.y + 0.9, e.z, e.killDX / l, 0, e.killDZ / l, 6, false);
          const d = r.blast ? pick(pl, ["Death_Back", "Death_Back_2", "Falling_Down"]) : pick(pl, deathFor(hit ? hit.t : 6, (r.idx * 0.37 + s.run * 0.61) % 1));
          if (d) pl.play(d, { hold: true, fade: 0.08 });
          r.fire?.stop(); r.reload?.stop();
        }
      } else {
        r.yaw += wrapAngle(e.facing - r.yaw) * Math.min(1, 10 * dt);
        if (e.stagger <= 0 || !pl.busy) {
          const speed = Math.hypot(e.vx, e.vz);
          let want = pick(pl, ["Shotgun_Aim_Idle", "Aim_Idle", "Idle"]), rate = 1;
          if (speed > 0.15) {
            want = pick(pl, ["Shotgun_Walk_Fwd", "Aim_Walk_Fwd", "Casual_Walk"]);
            rate = speed / (RADBRO_GAIT[rivalBase(e.model)].walk * HEAVY_SCALE);
          }
          if (want !== r.clip) { pl.force(want, 0.25, rate); r.clip = want; } else pl.setTimeScale(rate);
        }
      }
      r.root.quaternion.setFromAxisAngle(UP, r.yaw);
    });
  }, FRAME.actors);

  // -4: mixers on world time (the kill cam holds the victim)
  useFrame((_, raw) => {
    const ts = s.paused ? 0 : s.game.timeScale;
    const dt = Math.min(raw, 0.1);
    rigs.current.forEach(r => {
      if (!r || !r.root.visible) return;
      const e = s.game.enemies[r.idx];
      if (e.deathHold) return;
      const alive = e.state !== "dead";
      r.reloadW += ((alive && e.reloadT > 0 ? 1 : 0) - r.reloadW) * Math.min(1, 10 * dt);
      if (r.reloadW > 0.02 && r.reload && !r.reload.isRunning() && e.reloadT > 0) r.reload.reset().setEffectiveTimeScale(r.reload.getClip().duration / 1.6).play();
      r.reload?.setEffectiveWeight(1.5 * r.reloadW);
      r.fireW += ((alive && !!r.fire?.isRunning() ? 1 : 0) - r.fireW) * Math.min(1, 20 * dt);
      r.fire?.setEffectiveWeight(r.fireW * (1 - r.reloadW));
      r.player.update(dt * ts);
    });
  }, FRAME.animator);

  // -3: the upper body onto the player while he aims, the pump, the laser, the muzzle
  useFrame(state => {
    const g = s.game;
    const pr = s.renderP;
    rigs.current.forEach(r => {
      if (!r) return;
      const e = g.enemies[r.idx];
      r.laser.visible = false;
      if (!r.root.visible) return;
      r.root.updateMatrixWorld(true);
      const alive = e.state !== "dead";
      const aiming = alive && e.stagger <= 0 && e.reloadT <= 0 && (e.tell > 0 || e.sees) && e.state !== "idle";
      if (aiming) {
        V.want.set(pr.x, pr.y + 1.0, pr.z);
        for (let k = 0; k < 2; k++) {
          r.shotgun.updateMatrixWorld(true);
          const mz = muzzleWorld(r.shotgun, V.a);
          V.dir.set(0, 0, 1).applyQuaternion(r.shotgun.getWorldQuaternion(V.q)).normalize();
          const want = V.b.copy(V.want).sub(mz).normalize();
          const ang = Math.min(0.6, V.dir.angleTo(want)) * (e.tell > 0 ? 1 : 0.7);
          V.axis.crossVectors(V.dir, want);
          if (ang < 1e-4 || V.axis.lengthSq() < 1e-10) break;
          rotateBoneWorld(r.spine, V.axis.normalize(), ang);
        }
      }
      const pump = r.shotgun.userData.pump as Object3D;
      const t = r.fire && r.fireW > 0.05 ? r.fire.time : -1;
      const u = t >= 0 ? (t - 0.3) / 0.1 : -1;
      pump.position.z = SHOTGUN_PUMP.z - SHOTGUN_RACK * (u > 0 && u < 2 ? (u < 1 ? u : 2 - u) : 0);
      r.shotgun.updateMatrixWorld(true);
      if (enemyMuzzles[r.idx]) muzzleWorld(r.shotgun, enemyMuzzles[r.idx]);
      // the tell: a faint red laser from the muzzle to whatever it meets on the way to his chest
      if (alive && e.tell > 0) {
        const mz = muzzleWorld(r.shotgun, V.a);
        V.dir.set(pr.x, pr.y + 1.1, pr.z).sub(mz);
        const len0 = Math.min(LASER.max, V.dir.length());
        V.dir.normalize();
        const hit = g.world.raycast(mz.x, mz.y, mz.z, V.dir.x, V.dir.y, V.dir.z, len0, true);
        const len = hit ? hit.t : len0;
        r.laser.position.copy(mz);
        r.laser.quaternion.setFromUnitVectors(V.b.set(0, 0, 1), V.dir);
        // at least ~1.5 px wide at 720p wherever he stands (a hairline, but never invisible)
        const w = Math.max(LASER.width, mz.distanceTo(state.camera.position) * 0.0028);
        r.laser.scale.set(w, w, len);
        const m = r.laser.material as MeshBasicMaterial;
        m.opacity = LASER.opacity * (0.55 + 0.45 * (1 - e.tell / 0.35));
        r.laser.visible = true;
      }
    });
  }, FRAME.bones);

  return <primitive object={group} />;
}
