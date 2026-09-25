// The Milady gang: one Pockit model per goon (seeded pick per spawn, see sim/game.ts), a stand-in
// until it has loaded (and for good when it cannot). Reads the sim only:
//   pose + facing from the interpolated position; the shooter clip set retargeted onto each VRM (aimed
//   idle / walk / run / strafe / back while fighting, relaxed idle and walk before the alert, crouched
//   behind low cover, a death picked by the room behind the body); a lean out of high cover, the right
//   arm onto the player when shooting, an additive flinch + pain face on hits, blinks, the mouth moving
//   while she barks; the pistol in the right hand with the clip set's VRM grip. Bodies stay down (the
//   kill cam holds the victim until the replayed bullet lands).
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAssetRuntime } from "react-three-game";
import { CapsuleGeometry, Group, LoopOnce, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3, type AnimationAction, type Object3D } from "three";
import type { Session } from "./session.ts";
import type { Enemy } from "../sim/actors.ts";
import { AnimPlayer } from "../anim/animPlayer.ts";
import { CLIPS, aimLimb, deathFor, pick, rotateBoneWorld } from "../anim/rig.ts";
import { MILADY_GRIP } from "../anim/grips.ts";
import { MILADY_GAIT, RUN_FROM, clipSpeed, legsFor } from "../anim/gait.ts";
import { buildGoon, fetchPockit, type LoadedGoon } from "../vrm/pockit.ts";
import { MILADY_CLIPS, RETARGET_SOURCE, clipsPath, modelPath } from "./characters.ts";
import { aimGun, attachGun, makePistol, muzzleWorld } from "./guns.ts";
import { FRAME } from "./frame.ts";
import { useUi } from "../ui/store.ts";
import { wrapAngle } from "../sim/aim.ts";
import { goonTalk } from "./director.ts";

const UP = new Vector3(0, 1, 0);
const params = new URLSearchParams(location.search);
/** ?milady=0: stand-ins only (tests / offline). */
const NO_MILADY = params.get("milady") === "0";

export const enemyMuzzles: Vector3[] = [];

type GoonView = {
  idx: number;
  n: number;
  root: Group;
  standIn: Group;
  gun: Group;
  gunInHand: boolean;
  model: LoadedGoon | null;
  player: AnimPlayer | null;
  hit: AnimationAction | null;
  clip: string;
  yaw: number;
  /** Legs (root) yaw: along the move, or toward the aim when backing off; the spine twists the rest. */
  legYaw: number;
  back: boolean;
  flinch: number;
  pain: number;
  blinkT: number;
  blinkAt: number;
  deadShown: boolean;
  /** A death clip is on her model (false while dead on the stand-in: a model that mounts late drops
   *  straight into the death's last pose instead of standing in the bind pose). */
  deathPlayed: boolean;
  /** Death clips tried on her model, frames since the last one started, and the procedural fall-back
   *  (a clip that leaves her in the bind pose is swapped for the next; with none left she is posed
   *  lying down by hand). A dead goon never stands in a T-pose. */
  deathTried: Set<string>;
  deathFrames: number;
  deathFallback: boolean;
  fallYaw: number;
  loading: boolean;
};

const DEATHS = ["Death_Back", "Death_Back_2", "Death_Fwd", "Death_Fwd_2", "Falling_Down"];
const LIMBS = ["hips", "leftUpperArm", "rightUpperArm", "leftUpperLeg", "rightUpperLeg"] as const;
const AX = new Vector3(1, 0, 0), AZ = new Vector3(0, 0, 1);

const coat = new MeshStandardMaterial({ color: "#1c1a24", roughness: 0.8 });
const skin = new MeshStandardMaterial({ color: "#f3d9cc", roughness: 0.7 });
const hair = new MeshStandardMaterial({ color: "#ff5fae", roughness: 0.6 });
const capBody = new CapsuleGeometry(0.2, 0.45, 4, 10);
const capLeg = new CapsuleGeometry(0.09, 0.7, 4, 8);
const headGeo = new SphereGeometry(0.17, 16, 12);
const hairGeo = new SphereGeometry(0.19, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);

/** A Milady-shaped stand-in matching the sim's hit skeleton. */
function makeStandIn(): Group {
  const g = new Group();
  const body = new Mesh(capBody, coat);
  body.position.y = 1.22;
  const l = new Mesh(capLeg, coat); l.position.set(0.1, 0.52, 0);
  const r = new Mesh(capLeg, coat); r.position.set(-0.1, 0.52, 0);
  const head = new Mesh(headGeo, skin); head.position.y = 1.74; head.name = "head";
  const h = new Mesh(hairGeo, hair); h.position.y = 1.76; h.rotation.x = -0.25;
  g.add(body, l, r, head, h);
  g.traverse(o => { o.frustumCulled = false; });
  return g;
}

function makeView(e: Enemy): GoonView {
  const root = new Group();
  root.name = `goon-${e.idx}`;
  const standIn = makeStandIn();
  root.add(standIn);
  const gun = makePistol();
  return { idx: e.idx, n: e.milady, root, standIn, gun, gunInHand: false, model: null, player: null, hit: null, clip: "", yaw: e.facing, legYaw: e.facing, back: false, flinch: 0, pain: 0, blinkT: -1, blinkAt: 1 + Math.random() * 3, deadShown: false, deathPlayed: false, deathTried: new Set(), deathFrames: 0, deathFallback: false, fallYaw: 0, loading: false };
}

/** Deterministic 0..1 per goon and attempt (death variant picks). */
const k01 = (i: number, run: number) => { const x = Math.sin(i * 12.9898 + run * 78.233) * 43758.5453; return x - Math.floor(x); };

export function EnemiesView({ s }: { s: Session }) {
  const assets = useAssetRuntime();
  const views = useMemo(() => s.game.enemies.map(makeView), [s]);
  const version = useUi(st => st.assetsVersion); // re-render when models load
  const sourcesReady = version > 0 && !!assets.getModel(modelPath(RETARGET_SOURCE)) && !!assets.getModel(clipsPath(RETARGET_SOURCE));
  const group = useMemo(() => new Group(), []);
  const run = useRef(-1);
  const tmp = useMemo(() => ({ q: new Quaternion(), a: new Vector3(), b: new Vector3(), side: new Vector3(), hand: new Vector3(), fwd: new Vector3() }), []);

  useEffect(() => {
    for (const v of views) group.add(v.root, v.gun);
    enemyMuzzles.length = 0;
    for (let i = 0; i < views.length; i++) enemyMuzzles.push(new Vector3());
    // start every download now; build one at a time (parse + retarget are main-thread work), in the
    // order the downloads finish, so one slow model never holds up the rest. A failed or stuck goon
    // is logged and tried once more at the end; until then (or for good) she keeps her stand-in.
    let cancelled = false;
    if (!NO_MILADY && sourcesReady) {
      const sources = [assets.getModel(MILADY_CLIPS), assets.getModel(modelPath(RETARGET_SOURCE)), assets.getModel(clipsPath(RETARGET_SOURCE))].filter(Boolean) as Object3D[];
      const mount = (v: GoonView, m: LoadedGoon) => {
        if (cancelled || v.model) return;
        v.model = m;
        v.player = new AnimPlayer(m.vrm.scene, [m.clips], { fade: 0.2 });
        if (m.hit) { v.hit = v.player.mixer.clipAction(m.hit); v.hit.setLoop(LoopOnce, 1); }
        v.root.add(m.body);
        v.standIn.visible = false;
        v.clip = "";
        // the pistol into her right hand (VRM grip, scaled to her forearm; VRM0 is turned 180 deg)
        const hand = m.vrm.humanoid.getNormalizedBoneNode("rightHand");
        if (hand) {
          const g = MILADY_GRIP.right;
          const grip = m.vrm0
            ? { p: [-g.p[0], g.p[1], -g.p[2]] as [number, number, number], q: new Quaternion(0, 1, 0, 0).multiply(new Quaternion(...g.q)).toArray() as [number, number, number, number] }
            : g;
          attachGun(v.gun, hand, grip, m.forearm / MILADY_GRIP.forearm, 1 / m.scale);
          v.gunInHand = true;
        }
        console.info(`[milady] goon ${v.idx}: #${v.n} ready (${m.clips.length} clips, scale ${m.scale.toFixed(2)}, blink ${m.blink ? "yes" : "no"}, talk ${m.talk ?? "no"})`);
      };
      const wait = (ms: number) => new Promise<null>(r => setTimeout(() => r(null), ms));
      /** Build + mount one goon; false when it failed or is still stuck after 40 s (a late model still mounts). */
      const build = async (v: GoonView): Promise<boolean> => {
        v.loading = true;
        const job = buildGoon(v.n, sources).then(
          m => { if (m) mount(v, m); else console.info(`[milady] goon ${v.idx}: #${v.n} failed (no model data)`); return !!m; },
          e => { console.info(`[milady] goon ${v.idx}: #${v.n} failed: ${String(e)}`); return false; },
        ).finally(() => { v.loading = false; });
        const ok = await Promise.race([job, wait(40_000)]);
        if (ok === null) console.info(`[milady] goon ${v.idx}: #${v.n} still loading after 40 s, moving on`);
        return ok === true;
      };
      void (async () => {
        const pending = new Map(views.map(v => [v, fetchPockit(v.n).then(() => v)]));
        const retry: GoonView[] = [];
        while (pending.size && !cancelled) {
          const v = await Promise.race(pending.values());
          pending.delete(v);
          if (cancelled) return;
          if (!(await build(v))) retry.push(v);
          await wait(30);
        }
        for (const v of retry) {
          if (cancelled || v.model) continue;
          console.info(`[milady] goon ${v.idx}: retrying #${v.n}`);
          await build(v);
        }
      })();
    }
    const off = s.on(ev => {
      if (ev.type === "hurt" && ev.target >= 0) {
        const v = views[ev.target];
        if (v) {
          v.flinch = 1;
          v.pain = 1;
          if (ev.hp > 0) v.hit?.reset().setEffectiveWeight(0.85).play();
        }
      }
    });
    return () => {
      cancelled = true;
      off();
      for (const v of views) {
        group.remove(v.root);
        v.gun.removeFromParent();
        v.player?.dispose();
        for (const m of v.model?.materials ?? []) m.dispose();
      }
    };
  }, [views, group, s, assets, sourcesReady]);

  // -5: roots, clips
  useFrame((_, rawDelta) => {
    const g = s.game;
    const dt = Math.min(rawDelta, 0.1);
    if (run.current !== s.run) {
      run.current = s.run;
      for (const v of views) {
        v.deadShown = false; v.deathPlayed = false; v.clip = ""; v.flinch = 0; v.pain = 0; v.yaw = g.enemies[v.idx]?.facing ?? 0; v.legYaw = v.yaw; v.back = false;
        v.deathTried.clear(); v.deathFrames = 0;
        if (v.deathFallback && v.model) { v.model.body.rotation.x = 0; v.model.body.position.y = 0; }
        v.deathFallback = false;
        v.hit?.stop();
        if (v.player) v.player.force(pick(v.player, CLIPS.relaxed), 0);
      }
    }
    for (const v of views) {
      const e = g.enemies[v.idx];
      if (!e) { v.root.visible = false; v.gun.visible = false; continue; }
      const p = s.renderE[v.idx] ?? e;
      v.root.visible = e.state !== "inactive";
      v.gun.visible = v.root.visible;
      if (!v.root.visible) continue;
      // facing: the sim's, eased; the dead fall along the killing shot
      if (e.state === "dead") {
        if (!v.deadShown && !e.deathHold) {
          v.deadShown = true;
          v.fallYaw = Math.atan2(-e.killDX, -e.killDZ); // facing the shot: the back deaths fly away from it
          v.yaw = v.fallYaw;
          v.legYaw = v.fallYaw;
          v.hit?.stop();
          const pl = v.player;
          if (pl) {
            const l = Math.sqrt(e.killDX * e.killDX + e.killDZ * e.killDZ) || 1;
            const hit = g.world.raycast(e.x, e.y + 0.9, e.z, e.killDX / l, 0, e.killDZ / l, 6, false);
            const death = pick(pl, deathFor(hit ? hit.t : 6, k01(v.idx, s.run)));
            if (death) { pl.play(death, { hold: true, fade: 0.08 }); v.deathTried.add(death); } else v.deathFallback = true;
            v.deathFrames = 0;
            v.deathPlayed = true;
          }
        } else if (v.deadShown && v.player && !v.deathPlayed) {
          const death = pick(v.player, deathFor(6, k01(v.idx, s.run)));
          if (death) { v.player.play(death, { hold: true, fade: 0, startAt: 1e3 }); v.deathTried.add(death); } else v.deathFallback = true;
          v.deathFrames = 0;
          v.deathPlayed = true;
        } else if (!v.deadShown && e.deathHold && v.player && !v.clip) {
          // mounted while the kill cam holds her (its mixer is frozen): give her a pose now, not the bind pose
          const idle = pick(v.player, CLIPS.idle);
          if (idle) { v.player.force(idle, 0); v.player.update(0); v.clip = idle; }
        }
      } else v.yaw += wrapAngle(e.facing - v.yaw) * Math.min(1, 14 * dt);
      v.root.position.set(p.x, p.y, p.z);
      tmp.q.setFromAxisAngle(UP, v.player && e.state !== "dead" ? v.legYaw : v.yaw);
      v.root.quaternion.copy(tmp.q);
      // stand-in poses (no clips): crouch squash, lying dead
      v.standIn.scale.y = e.crouch && e.state !== "dead" ? 0.66 : 1;
      if (v.standIn.visible) {
        if (e.state === "dead" && v.deadShown) { v.standIn.rotation.x += (-Math.PI / 2 - v.standIn.rotation.x) * Math.min(1, 6 * dt * Math.max(g.timeScale, 0.1) * 4); v.standIn.position.y = 0.15; }
        else { v.standIn.rotation.x = 0; v.standIn.position.y = 0; }
      }
      const pl = v.player;
      if (!pl || e.state === "dead") continue;
      const speed = Math.sqrt(e.vx * e.vx + e.vz * e.vz);
      const fighting = e.state !== "idle";
      let want = "", rate = 1, legWant = v.yaw;
      const m = v.model!;
      if (e.crouch) want = pick(pl, CLIPS.crouch);
      else if (speed > 0.2) {
        // the run / walk cycle at body speed over its ground speed (scaled to her legs): no skating.
        // Legs along the move; backing off while fighting plays the cycle backwards facing the aim.
        const moveYaw = Math.atan2(e.vx, e.vz);
        const legs = fighting ? legsFor(moveYaw, wrapAngle(moveYaw - v.yaw), v.back) : { back: false, legYaw: moveYaw };
        v.back = legs.back;
        legWant = legs.legYaw;
        const running = speed > RUN_FROM * m.legScale;
        want = pick(pl, fighting ? (running ? CLIPS.run : CLIPS.walk) : running ? ["Run_02", "Aim_Run"] : CLIPS.stroll);
        rate = (legs.back ? -1 : 1) * speed / (clipSpeed(MILADY_GAIT, want) * m.legScale);
      } else want = pick(pl, fighting ? CLIPS.idle : CLIPS.relaxed);
      v.legYaw += wrapAngle(legWant - v.legYaw) * Math.min(1, 12 * dt);
      if (!want && e.crouch && pl.has("Big_Land") && m.crouchAt >= 0) want = "Big_Land";
      if (want !== v.clip) {
        if (want === "Big_Land") pl.play(want, { hold: true, startAt: Math.max(0, m.crouchAt - 0.25), freezeAt: m.crouchAt, fade: 0.2 });
        else if (want) pl.force(want, 0.2, rate);
        v.clip = want;
      } else if (want !== "Big_Land") pl.setTimeScale(rate);
    }
  }, FRAME.actors);

  // -4: mixers on world time (bullet time slows the gang)
  useFrame((_, rawDelta) => {
    const ts = s.paused ? 0 : s.game.timeScale;
    const dt = Math.min(rawDelta, 0.1) * ts;
    for (const v of views) {
      if (!v.player || !v.root.visible) continue;
      const e = s.game.enemies[v.idx];
      if (e?.deathHold) continue; // the kill cam holds the victim until its bullet lands
      v.player.update(dt);
    }
  }, FRAME.animator);

  // -3: lean, aim arm, flinch, face, VRM update, gun
  useFrame((_, rawDelta) => {
    const g = s.game;
    const dt = Math.min(rawDelta, 0.1);
    const wdt = dt * (s.paused ? 0 : g.timeScale);
    const pr = s.renderP;
    const now = performance.now();
    for (const v of views) {
      const e = g.enemies[v.idx];
      if (!e || !v.root.visible) continue;
      v.flinch = Math.max(0, v.flinch - wdt * 5);
      v.pain = Math.max(0, v.pain - wdt * 2.5);
      const m = v.model;
      const alive = e.state !== "dead";
      const aiming = alive && !e.crouch && (e.state === "peek" || e.state === "engage" || (e.state === "move" && e.sees) || e.state === "alert");
      tmp.fwd.set(Math.sin(v.yaw), 0, Math.cos(v.yaw));
      tmp.side.set(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
      tmp.a.set(pr.x, pr.y + 1.0, pr.z);
      if (m) {
        const h = m.vrm.humanoid;
        const nb = (n: Parameters<typeof h.getNormalizedBoneNode>[0]) => h.getNormalizedBoneNode(n) ?? undefined;
        v.root.updateMatrixWorld(true);
        if (alive) {
          // the chest back onto the aim when the legs run another way
          const twist = Math.max(-1.75, Math.min(1.75, wrapAngle(v.yaw - v.legYaw)));
          if (Math.abs(twist) > 1e-3) {
            rotateBoneWorld(nb("spine"), UP, twist * 0.45);
            rotateBoneWorld(nb("chest"), UP, twist * (nb("upperChest") ? 0.3 : 0.55));
            rotateBoneWorld(nb("upperChest"), UP, twist * 0.25);
          }
          // lean out of high cover (sim lean: +1 = local +x)
          if (Math.abs(e.lean) > 0.01) {
            rotateBoneWorld(nb("spine"), tmp.fwd, -e.lean * 0.35);
            rotateBoneWorld(nb("chest"), tmp.fwd, -e.lean * 0.25);
          }
          if (v.flinch > 0) rotateBoneWorld(nb("chest"), tmp.side, -0.2 * v.flinch);
          if (aiming) aimLimb(nb("rightUpperArm"), nb("rightHand"), tmp.a, 1);
        } else if (v.player && v.deathPlayed) {
          // a death clip that binds nothing leaves her in the bind pose: try the next, then pose by hand
          if (!v.deathFallback && ++v.deathFrames >= 2 && LIMBS.every(n => { const b = nb(n); return !!b && Math.abs(b.quaternion.w) > 0.9994; })) {
            const next = DEATHS.find(n => v.player!.has(n) && !v.deathTried.has(n));
            console.info(`[milady] goon ${v.idx}: death clip left the bind pose${next ? `, trying ${next}` : ", posing by hand"}`);
            if (next) { v.deathTried.add(next); v.player.play(next, { hold: true, fade: 0, startAt: 1e3 }); v.player.update(0); v.deathFrames = 0; }
            else v.deathFallback = true;
          }
          if (v.deathFallback) {
            // on her back, arms down, knees a little bent (the wrapper turned about her feet)
            nb("leftUpperArm")?.quaternion.setFromAxisAngle(AZ, -1.2);
            nb("rightUpperArm")?.quaternion.setFromAxisAngle(AZ, 1.2);
            nb("leftUpperLeg")?.quaternion.setFromAxisAngle(AX, -0.3);
            nb("leftLowerLeg")?.quaternion.setFromAxisAngle(AX, 0.5);
            nb("rightUpperLeg")?.quaternion.setFromAxisAngle(AX, -0.1);
            m.body.rotation.x = -Math.PI / 2;
            m.body.position.y = 0.12;
          }
        }
        // expressions: blink, pain, talk
        const em = m.vrm.expressionManager;
        if (em) {
          if (m.blink && alive) {
            v.blinkAt -= dt;
            if (v.blinkAt <= 0 && v.blinkT < 0) { v.blinkT = 0; v.blinkAt = 2 + Math.random() * 3.5; }
            let w = 0;
            if (v.blinkT >= 0) { v.blinkT += dt; const t = v.blinkT / 0.16; w = t < 0.5 ? t * 2 : Math.max(0, 2 - t * 2); if (t >= 1) v.blinkT = -1; }
            // pain: the eyes squeeze shut on a hit
            em.setValue("blink", Math.max(w, v.pain > 0.25 ? Math.min(1, v.pain * 1.4) : 0));
          } else if (m.blink && !alive) em.setValue("blink", 1);
          if (m.pain) em.setValue(m.pain, alive ? v.pain : 0.6);
          const talking = alive && (goonTalk[v.idx] ?? 0) > now;
          if (m.talk) em.setValue(m.talk, talking ? 0.2 + 0.6 * Math.abs(Math.sin(now * 0.019 + v.idx)) * (0.6 + 0.4 * Math.sin(now * 0.007)) : 0);
          // Pockit faces have no mouth shapes: talking is a head bob with the words
          else if (talking) rotateBoneWorld(nb("head"), tmp.side, 0.07 * Math.sin(now * 0.021 + v.idx) + 0.04 * Math.sin(now * 0.047));
        }
        m.vrm.update(wdt);
      } else {
        // stand-in: lean the whole body a little
        v.standIn.rotation.z = alive ? -e.lean * 0.3 : 0;
      }
      // the gun: in her hand (swung onto the player while aiming), or floating at the stand-in's hand
      const gun = v.gun;
      gun.visible = true;
      if (v.gunInHand) {
        aimGun(gun, aiming ? tmp.a : null, 1, 0.6);
      } else {
        tmp.hand.copy(v.root.position).addScaledVector(UP, e.crouch ? 0.95 : 1.3).addScaledVector(tmp.fwd, 0.35).addScaledVector(tmp.side, -0.2);
        gun.position.copy(tmp.hand);
        if (!alive) { gun.position.y = e.y + 0.03; gun.rotation.set(Math.PI / 2, v.yaw, 0); }
        else if (aiming) gun.lookAt(tmp.a);
        else gun.lookAt(tmp.b.copy(tmp.hand).addScaledVector(tmp.fwd, 1).addScaledVector(UP, -0.6));
        gun.updateMatrixWorld(true);
      }
      if (enemyMuzzles[v.idx]) muzzleWorld(gun, enemyMuzzles[v.idx]);
    }
  }, FRAME.bones);

  return <primitive object={group} />;
}
