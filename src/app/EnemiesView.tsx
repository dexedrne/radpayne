// The Milady gang: one Pockit model per goon (seeded pick per spawn, see sim/game.ts), a stand-in
// until it has loaded (and for good when it cannot). Reads the sim only:
//   pose + facing from the interpolated position, clip by state (idle / walk / run / crouch in low
//   cover / death), a lean out of high cover, the right arm on the player when shooting, a flinch and
//   a pain face on hits, blinks, bodies that stay down (the kill cam holds the victim until the
//   replayed bullet lands).
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAssetRuntime } from "react-three-game";
import { CapsuleGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3, type Object3D } from "three";
import type { Session } from "./session.ts";
import type { Enemy } from "../sim/actors.ts";
import { AnimPlayer } from "../anim/animPlayer.ts";
import { aimLimb, rotateBoneWorld } from "../anim/rig.ts";
import { buildGoon, fetchPockit, type LoadedGoon } from "../vrm/pockit.ts";
import { RETARGET_SOURCE, clipsPath, modelPath } from "./characters.ts";
import { makePistol, muzzleWorld } from "./guns.ts";
import { FRAME } from "./frame.ts";
import { useUi } from "../ui/store.ts";
import { wrapAngle } from "../sim/aim.ts";

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
  model: LoadedGoon | null;
  player: AnimPlayer | null;
  clip: string;
  yaw: number;
  flinch: number;
  pain: number;
  blinkT: number;
  blinkAt: number;
  deadShown: boolean;
  fallYaw: number;
  loading: boolean;
};

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
  return { idx: e.idx, n: e.milady, root, standIn, gun, model: null, player: null, clip: "", yaw: e.facing, flinch: 0, pain: 0, blinkT: -1, blinkAt: 1 + Math.random() * 3, deadShown: false, fallYaw: 0, loading: false };
}

export function EnemiesView({ s }: { s: Session }) {
  const assets = useAssetRuntime();
  const views = useMemo(() => s.game.enemies.map(makeView), [s]);
  useUi(st => st.assetsVersion); // re-render when models load
  const sourcesReady = !!assets.getModel(modelPath(RETARGET_SOURCE)) && !!assets.getModel(clipsPath(RETARGET_SOURCE));
  const group = useMemo(() => new Group(), []);
  const run = useRef(-1);
  const tmp = useMemo(() => ({ q: new Quaternion(), a: new Vector3(), b: new Vector3(), side: new Vector3(), hand: new Vector3(), fwd: new Vector3() }), []);

  useEffect(() => {
    for (const v of views) group.add(v.root, v.gun);
    enemyMuzzles.length = 0;
    for (let i = 0; i < views.length; i++) enemyMuzzles.push(new Vector3());
    // start every download now; build one at a time (parse + retarget are main-thread work)
    let cancelled = false;
    if (!NO_MILADY && sourcesReady) {
      for (const v of views) void fetchPockit(v.n);
      const sources = [assets.getModel(modelPath(RETARGET_SOURCE)), assets.getModel(clipsPath(RETARGET_SOURCE))].filter(Boolean) as Object3D[];
      void (async () => {
        for (const v of views) {
          if (cancelled) return;
          v.loading = true;
          try {
            const m = await buildGoon(v.n, sources);
            if (cancelled || !m) continue;
            v.model = m;
            v.player = new AnimPlayer(m.vrm.scene, [m.clips], { fade: 0.2 });
            v.root.add(m.body);
            v.standIn.visible = false;
            v.clip = "";
            console.info(`[milady] goon ${v.idx}: #${v.n} ready (${m.clips.length} clips, scale ${m.scale.toFixed(2)}, blink ${m.blink ? "yes" : "no"})`);
          } catch (e) {
            console.info(`[milady] #${v.n} failed: ${String(e)}`);
          } finally {
            v.loading = false;
          }
          await new Promise(r => setTimeout(r, 30));
        }
      })();
    }
    const off = s.on(ev => {
      if (ev.type === "hurt" && ev.target >= 0) {
        const v = views[ev.target];
        if (v) { v.flinch = 1; v.pain = 1; }
      }
    });
    return () => {
      cancelled = true;
      off();
      for (const v of views) {
        group.remove(v.root, v.gun);
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
      for (const v of views) { v.deadShown = false; v.clip = ""; v.flinch = 0; v.pain = 0; v.player?.force("Idle", 0); v.yaw = g.enemies[v.idx]?.facing ?? 0; }
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
          v.fallYaw = Math.atan2(-e.killDX, -e.killDZ); // back toward the shot: Falling_Down falls backward
          v.yaw = v.fallYaw;
          const pl = v.player;
          if (pl) {
            const death = ["Pistol_Death", "Falling_Down"].find(c => pl.has(c));
            if (death) pl.play(death, { hold: true, fade: 0.08 });
          }
        }
      } else v.yaw += wrapAngle(e.facing - v.yaw) * Math.min(1, 14 * dt);
      v.root.position.set(p.x, p.y, p.z);
      tmp.q.setFromAxisAngle(UP, v.yaw);
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
      let want = "Idle", rate = 1;
      const m = v.model!;
      if (e.crouch && pl.has("Big_Land") && m.crouchAt >= 0) want = "Big_Land";
      else if (speed > 2.6) { want = pl.has("Pistol_Run") ? "Pistol_Run" : "Run_02"; rate = speed / 5.2; }
      else if (speed > 0.2) { want = "Casual_Walk"; rate = speed / 1.3; }
      else if (pl.has("Pistol_Aim_Idle") && (e.state === "peek" || e.state === "engage")) want = "Pistol_Aim_Idle";
      if (want !== v.clip) {
        if (want === "Big_Land") pl.play(want, { hold: true, startAt: Math.max(0, m.crouchAt - 0.25), freezeAt: m.crouchAt, fade: 0.2 });
        else pl.force(want, 0.2, rate);
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
    for (const v of views) {
      const e = g.enemies[v.idx];
      if (!e || !v.root.visible) continue;
      v.flinch = Math.max(0, v.flinch - wdt * 5);
      v.pain = Math.max(0, v.pain - wdt * 2.5);
      const m = v.model;
      const alive = e.state !== "dead";
      const aiming = alive && (e.state === "peek" || e.state === "engage" || (e.state === "move" && e.sees) || e.state === "alert");
      tmp.fwd.set(Math.sin(v.yaw), 0, Math.cos(v.yaw));
      tmp.side.set(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
      let rHand: Object3D | undefined;
      if (m) {
        const h = m.vrm.humanoid;
        const nb = (n: Parameters<typeof h.getNormalizedBoneNode>[0]) => h.getNormalizedBoneNode(n) ?? undefined;
        v.root.updateMatrixWorld(true);
        if (alive) {
          // lean out of high cover (sim lean: +1 = local +x)
          if (Math.abs(e.lean) > 0.01) {
            rotateBoneWorld(nb("spine"), tmp.fwd, -e.lean * 0.35);
            rotateBoneWorld(nb("chest"), tmp.fwd, -e.lean * 0.25);
          }
          if (v.flinch > 0) rotateBoneWorld(nb("chest"), tmp.side, -0.35 * v.flinch);
          if (aiming) {
            tmp.a.set(pr.x, pr.y + 1.0, pr.z);
            aimLimb(nb("rightUpperArm"), nb("rightHand"), tmp.a, 1);
          }
        }
        rHand = nb("rightHand");
        // expressions: blink, pain
        const em = m.vrm.expressionManager;
        if (em) {
          if (m.blink && alive) {
            v.blinkAt -= dt;
            if (v.blinkAt <= 0 && v.blinkT < 0) { v.blinkT = 0; v.blinkAt = 2 + Math.random() * 3.5; }
            let w = 0;
            if (v.blinkT >= 0) { v.blinkT += dt; const t = v.blinkT / 0.16; w = t < 0.5 ? t * 2 : Math.max(0, 2 - t * 2); if (t >= 1) v.blinkT = -1; }
            em.setValue("blink", w);
          } else if (m.blink && !alive) em.setValue("blink", 1);
          if (m.pain) em.setValue(m.pain, alive ? v.pain : 0.6);
        }
        m.vrm.update(wdt);
      } else {
        // stand-in: lean the whole body a little, the "hand" is a point at the right shoulder
        v.standIn.rotation.z = alive ? -e.lean * 0.3 : 0;
      }
      // gun in the right hand, pointing at the player while aiming
      const gun = v.gun;
      gun.visible = true;
      if (rHand) rHand.getWorldPosition(tmp.hand);
      else tmp.hand.copy(v.root.position).addScaledVector(UP, e.crouch ? 0.95 : 1.3).addScaledVector(tmp.fwd, 0.35).addScaledVector(tmp.side, -0.2);
      gun.position.copy(tmp.hand);
      if (aiming) gun.lookAt(tmp.a.set(pr.x, pr.y + 1.0, pr.z));
      else if (alive) gun.lookAt(tmp.a.copy(tmp.hand).addScaledVector(tmp.fwd, 1).addScaledVector(UP, -0.6));
      else { gun.position.y = Math.max(p0(e), 0.03) ; gun.rotation.set(Math.PI / 2, v.yaw, 0); }
      gun.updateMatrixWorld(true);
      if (enemyMuzzles[v.idx]) muzzleWorld(gun, enemyMuzzles[v.idx]);
    }
  }, FRAME.bones);

  return <primitive object={group} />;
}

const p0 = (e: Enemy) => e.y + 0.03;
