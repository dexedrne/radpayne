// Runs the session every frame (input -> fixed steps -> events), feeds the audio (one-shots from the
// events, loops from the state: rain, the club's bass, footsteps, heartbeat, the music cue) and the
// voice director, pushes the HUD to the UI store at ~15 Hz and exposes window.__rp (a smoke probe).
// It also runs the kill cam (cine.ts): his kills go to it, after each step it may hold the fight, and
// its clock runs here in real time (any key skips it; the aim he had comes back with the fight). The
// voice director hears a step's events only after that decision, so a cam that starts on the step
// finds the air held: no victim's grunt, no call, no line of hers at the start of the ride.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Session } from "./session.ts";
import { useUi } from "../ui/store.ts";
import { FRAME } from "./frame.ts";
import { WEAPONS } from "../combat/weapons.ts";
import { gunLog, setAmbience, setClubBass, setCrowd, setFootsteps, setHeartbeat, setIndoor, setMusic, setNeonBuzz, setRoomTone, setSpace, setTimeScaleAudio, sfx, sfxArsenal, voiceLog } from "../audio/sfx.ts";
import { audioState } from "../audio/engine.ts";
import { Director } from "./director.ts";
import { GUARD, MELEE, PLAYER, TIME } from "../sim/tuning.ts";
// the HUD's data: hits on the player, refills, objectives, weapons owned
import { pushHurt } from "../ui/store.ts";
import { roomLabel, roomText } from "../ui/rooms.ts";
import { SLOT_ORDER, ammoLeft, type WeaponId } from "../combat/weapons.ts";
import { addPin } from "../ui/pins.ts";
import type { Player } from "../sim/actors.ts";
import type { GameEvent } from "../sim/types.ts";
import { METER } from "../sim/tuning.ts";
import { bossBusy, cine, rideMoving } from "./cine.ts";
import { sfxCine } from "../audio/sfx.ts";

/** Dev builds: window.__rp.cineCtl is the kill cam (a browser check can stage one). */
const DEV = import.meta.env.MODE !== "production";

/** Guns whose reloads have their own sounds in the arsenal block. */
const ARSENAL_GUNS = new Set(["handcannon", "sawedoff", "sniper"]);

declare global {
  interface Window {
    __rp?: { session: Session; fps: number; frames: number; audio: string; voices: string[]; guns: string[]; cine: { phase: string; kind: string; tag: string; n: number; t: number; flight: number }; cineCtl?: typeof cine };
  }
}

/** Rounds left (magazines + reserve) in every owned gun: the HUD's weapon tabs mark the dry ones. */
function ammoByWeapon(p: Player): Partial<Record<WeaponId, number>> {
  const out: Partial<Record<WeaponId, number>> = {};
  for (const id of p.owned) { const w = p.arsenal[id]; if (w) out[id] = ammoLeft(w); }
  return out;
}

export function SimDriver({ s, onPhase }: { s: Session; onPhase: (phase: string) => void }) {
  const acc = useRef(0);
  const fps = useRef(60);
  const frames = useRef(0);
  const lastPhase = useRef("");
  const director = useMemo(() => new Director(s), [s]);
  // HUD bookkeeping: the attempt, the meter last frame (refill chips), the objective's text + stamp
  const hudRun = useRef(-1);
  const meterSeen = useRef<number>(METER.max);
  const objective = useRef({ text: "", at: 0 });
  const room = useMemo(() => roomText(s.roomId, s.level.room), [s]);
  /** World seconds to each heavy's next footstep (they are heard before they are seen). */
  const heavySteps = useRef<number[]>([]);
  /** #4764's guard has rung since it went up (the ring waits out a tap). */
  const guardRing = useRef(true);
  /** The kill cam: the aim he had when it took over, how many played (the probe), the boss's phase. */
  const kc = useMemo(() => ({ yaw: 0, pitch: 0, n: 0, boss: { phase: -1, stand: 0, at: -1e9 } }), []);
  /** The step's events for the voice director, handed over after the kill cam's decision. */
  const heard = useMemo<GameEvent[]>(() => [], []);
  /** The kill cam's state on the HUD at once (the ride, the X-ray, the release), not at the next push. */
  const cineHud = () => {
    const c = cine.cur, g = s.game;
    useUi.setState(u => ({ hud: { ...u.hud, killcam: cine.holding || g.phase === "killcam", cine: c && c.phase !== "out" ? (c.phase === "flight" ? 1 : 2) : 0, cineTag: cine.holding ? c!.tag : "", killcamProgress: kcProgress() } }));
  };
  /** The letterbox's progress line: the kill cam's; for the last kill its ride and X-ray fill the first
   *  60 % and the sim's final-kill cam (the swing after it) the rest. */
  const kcProgress = (): number => {
    const k = s.game.killcam;
    if (cine.holding) return (cine.cur!.final ? 0.6 : 1) * cine.progress;
    if (!k) return 0;
    const f = Math.min(1, k.t / k.dur);
    return cine.flownFinal ? 0.6 + 0.4 * f : f;
  };
  const release = () => {
    s.hold = false;
    s.input.yaw = kc.yaw;
    s.input.pitch = kc.pitch;
  };

  // after each step: his kills may start a kill cam (it holds the fight from here); Kill cam: Off skips
  // the sim's own final-kill cam
  useEffect(() => {
    cine.reset();
    s.afterStep = () => {
      const g = s.game;
      const now = performance.now() / 1000;
      const mode = useUi.getState().killcam;
      // no special-shot cam: out of the fight, him down, a breach's (or her last stand's) slow motion,
      // her big moments, the car between stops (the room's last kill always passes)
      const blocked = g.phase !== "play" || g.player.mode === "dead" || g.breachSlow > 0 || bossBusy(g.boss, now, kc.boss) || rideMoving(g.ride) || !!g.stage?.busy?.(g);
      // a hand-cannon / sniper round still in the air, with a body left in it: its next kill joins the cam
      const flying = (k: { weapon: string; from: { x: number; y: number; z: number } }) => g.projectiles.some(b => b.team === 0 && b.alive && b.pierce > 0 && b.weapon === k.weapon && Math.abs(b.sx - k.from.x) + Math.abs(b.sy - k.from.y) + Math.abs(b.sz - k.from.z) < 1e-4);
      const c = cine.decide(now, mode, blocked, flying);
      if (c) {
        s.hold = true;
        kc.yaw = s.input.yaw;
        kc.pitch = s.input.pitch;
        kc.n++;
        s.input.anyPress = false;
        sfxCine.whoosh(c.flight);
        cineHud();
      } else if (mode === "off" && g.phase === "killcam") s.skipNext = true;
      for (const e of heard) director.onEvent(e);
      heard.length = 0;
    };
    s.quiet = i => cine.holds(i);
    return () => { s.afterStep = null; s.quiet = null; s.hold = false; cine.reset(); heard.length = 0; };
  }, [s, kc, director, heard]);

  useEffect(() => s.on((e, ss) => {
    const g = ss.game, p = g.player;
    const where = (x: number, z: number) => {
      const dx = x - p.x, dz = z - p.z;
      const dist = Math.sqrt(dx * dx + dz * dz) || 1;
      return { dist, pan: (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / dist };
    };
    heard.push(e); // (to the director after the kill cam's decision: afterStep)
    switch (e.type) {
      case "shot": {
        const player = e.shooter === -1;
        const w = where(e.ox, e.oz);
        if (e.pellet === 0) {
          // his next shot comes `gap` real seconds on (his weapon clock runs at half speed in bullet time);
          // every gun, the arsenal's too, plays through its own pool (the rifle is the AK's voice)
          const gap = player ? (WEAPONS[e.weapon as WeaponId]?.interval ?? 0.1) / Math.max(g.timeScale, TIME.playerInBulletTime) : 0;
          sfx.shot(player, player ? 0 : w.dist, w.pan, e.weapon, e.hand, gap);
        }
        if (!player && p.mode !== "dead") {
          // a near miss past his head: closest approach of the shot line to the head
          const hx = p.x, hy = p.y + 1.55, hz = p.z;
          const dx = e.ex - e.ox, dy = e.ey - e.oy, dz = e.ez - e.oz;
          const l2 = dx * dx + dy * dy + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((hx - e.ox) * dx + (hy - e.oy) * dy + (hz - e.oz) * dz) / l2));
          const cx = e.ox + dx * t - hx, cy = e.oy + dy * t - hy, cz = e.oz + dz * t - hz;
          const miss = Math.sqrt(cx * cx + cy * cy + cz * cz);
          const endNear = Math.sqrt((e.ex - hx) ** 2 + (e.ez - hz) ** 2) < 0.6;
          if (miss < 1.4 && !endNear && t < 0.999) sfx.whiz(w.pan);
        }
        break;
      }
      case "impact": { const w = where(e.x, e.z); sfx.impact(e.surface, w.dist, w.pan); break; }
      case "blood": if (e.target >= 0 && !e.ink) { const w = where(e.x, e.z); if (g.enemies[e.target]?.kind === "heavy") sfx.fleshHeavy(w.dist, w.pan); else sfx.flesh(w.dist, w.pan); } break;
      case "hurt":
        if (e.target === -1) {
          sfx.hurt();
          // the HUD's damage-direction slash (NaN = no shooter: rim only)
          pushHurt({ sx: e.fromX ?? NaN, sz: e.fromZ ?? NaN, at: performance.now(), amount: e.amount, shooter: e.shooter ?? -1 });
        }
        break;
      case "kill": {
        sfx.kill(e.headshot);
        if (e.shot) cine.kill({ enemy: e.target, weapon: e.weapon ?? "", headshot: e.headshot, part: e.headshot ? 0 : 1, from: { x: e.shot.ox, y: e.shot.oy, z: e.shot.oz }, to: { x: e.shot.x, y: e.shot.y, z: e.shot.z }, final: e.final, at: performance.now() / 1000 });
        // the hourglass refill chip (+1.5 / +2.5), unless the meter was already full
        if (meterSeen.current < METER.max - 1e-6) {
          const hud = useUi.getState().hud;
          useUi.setState({ hud: { ...hud, refill: { amount: e.headshot ? METER.headshotRefill : METER.killRefill, at: performance.now() } } });
        }
        break;
      }
      case "btRefused": useUi.setState(u => ({ hud: { ...u.hud, btRefusedAt: performance.now() } })); break;
      case "killcam": if (e.on) useUi.setState({ lastKillPhoto: null }); break;
      case "reload": {
        const d = WEAPONS[p.weapon.id].reload / Math.max(g.timeScale, TIME.playerInBulletTime);
        if (ARSENAL_GUNS.has(p.weapon.id)) { sfxArsenal.reload(p.weapon.id, d); break; }
        if (p.weapon.id === "shotgun") sfx.reloadShotgun(d); else sfx.reload(d);
        break;
      }
      case "swap": sfx.swap(); break;
      case "firstShot": if (g.level.room.music === "rave") { sfx.scatter(); setCrowd("panic"); } break;
      case "dryfire": sfx.dry(); break;
      case "bt": sfx.bullettime(e.on); setHeartbeat(e.on); break;
      case "dodge": sfx.dodge(); setHeartbeat(true); break;
      case "land": sfx.land(); if (!g.bulletTime) setHeartbeat(false); break;
      case "copium": sfx.copium(); break;
      case "pickup":
        if (e.item === "pin") {
          if (e.pin) { addPin(e.pin); useUi.setState(u => ({ hud: { ...u.hud, pins: [...u.hud.pins, e.pin!] } })); }
          sfxArsenal.secret(true);
        } else if (e.item === "copium") sfx.pickup();
        else if (e.item === "grenade") sfxArsenal.grenade("pickup");
        else sfx.weaponPickup(e.item.endsWith("_ammo"));
        break;
      case "roomClear": setHeartbeat(false); break;
      // the arsenal and the secrets
      case "throw": sfxArsenal.grenade("throw"); break;
      case "bounce": { const w = where(e.x, e.z); sfxArsenal.grenade("bounce", w.dist, w.pan, e.speed); break; }
      case "explode": { const w = where(e.x, e.z); sfxArsenal.grenade("explode", w.dist, w.pan); break; }
      case "melee":
        sfxArsenal.melee(e.kind, e.phase === "hit" && e.hits > 0);
        // #4764 sheathes the blade after the cut (his clock: half speed in bullet time)
        if (e.kind === "katana" && e.phase === "start") sfxArsenal.guard("sheathe", (MELEE.katana.time + 0.1) / Math.max(g.timeScale, TIME.playerInBulletTime));
        break;
      case "guard":
        // (the ring waits for the frame loop: a tap's guard, down again in a moment, makes no sound)
        if (e.what === "up") guardRing.current = false;
        else if (e.what === "break") sfxArsenal.guard("break");
        else if (guardRing.current) sfxArsenal.guard("sheathe", 0.05);
        break;
      case "deflect": if (e.first) sfxArsenal.deflect(e); break;
      case "zoom": sfxArsenal.zoom(e.on); break;
      case "secret": sfxArsenal.secret(false); break;
      case "open": sfxArsenal.door(); break;
      case "break": { const w = where(e.x, e.z); sfxArsenal.breakIt(e.surface, w.dist, w.pan); break; }
      case "interact": if (e.egg === "george") sfxArsenal.meow("happy"); else if (e.egg === "cabinet") sfxArsenal.egg("arcade"); else if (e.egg === "figurine" || e.egg === "duck" || e.egg === "koi") sfxArsenal.egg("squeak"); break;
      case "playerDead": setHeartbeat(false); useUi.setState({ deadAt: performance.now() }); break;
    }
  }), [s, heard]);

  useFrame((_, delta) => {
    if (hudRun.current !== s.run) {
      // a new attempt: clear the per-attempt HUD state
      hudRun.current = s.run;
      objective.current = { text: "", at: 0 };
      heavySteps.current = [];
      useUi.setState(u => ({ deadAt: 0, hurts: [], hud: { ...u.hud, refill: null, btRefusedAt: 0, objective: "", objectiveAt: 0, run: s.run, pins: [], cine: 0, cineTag: "" } }));
      cine.reset();
    }
    // the kill cam's clock (real time; it waits while the game is paused); any key ends it
    if (cine.cur && !s.paused) {
      if (cine.holding && s.input.anyPress) {
        const fin = cine.cur.final;
        cine.skip();
        release();
        s.input.flush(); // the key that skipped does nothing else
        if (fin) s.skipNext = true; // ...and it skips the sim's own final-kill cam after it
        cineHud();
      } else {
        const r = cine.step(Math.min(delta, 0.1));
        if (r.impact) sfxCine.impact();
        if (r.release) { release(); sfxCine.release(); }
        if (r.impact || r.release || r.done) cineHud();
      }
    }
    meterSeen.current = s.game.meter;
    s.frame(delta);
    const g = s.game;
    if (g.player.guard && !guardRing.current && g.player.guardPress >= GUARD.tap) { guardRing.current = true; sfxArsenal.guard("up"); }
    frames.current++;
    fps.current = fps.current * 0.95 + (1 / Math.max(delta, 1e-3)) * 0.05;
    const screen = useUi.getState().screen;
    const inRoom = screen === "play" || screen === "paused";
    setTimeScaleAudio(s.paused ? 1 : s.hold ? 0.15 : g.timeScale);
    if (inRoom) {
      const room = g.level.room;
      const indoor = room.footsteps === "hard";
      setIndoor(indoor);
      setSpace(room.look, indoor);
      if (!indoor) {
        // the club's bass and the neon hum: louder toward the door (the exit marker)
        const door = g.level.markers.find(m => m.kind === "exit");
        const d = door ? Math.sqrt((door.x - g.player.x) ** 2 + (door.z - g.player.z) ** 2) : 99;
        const near = Math.max(0.15, Math.min(1, 1 - d / 45));
        setAmbience(true);
        // (chapter 2's roof: the storm, no club under it)
        const storm = room.ambience === "storm";
        setClubBass(storm ? 0 : near);
        setNeonBuzz(storm ? 0 : Math.max(0, 1 - d / 14));
      } else {
        // the back rooms: the air handling, and the club's kick through the wall (heavily low-passed)
        const back = room.look === "backrooms";
        setAmbience(false);
        setClubBass(back ? 0.3 : 0);
        setNeonBuzz(0);
        setRoomTone(back ? 0.7 : 0);
      }
      // the heavies' boots
      if (!s.paused) for (const e of g.enemies) {
        if (e.kind !== "heavy" || e.state === "dead" || e.state === "inactive" || Math.hypot(e.vx, e.vz) < 0.3) continue;
        const t = (heavySteps.current[e.idx] ?? 0) - Math.min(delta, 0.1) * g.timeScale;
        heavySteps.current[e.idx] = t;
        if (t > 0) continue;
        heavySteps.current[e.idx] = 0.62;
        const dx = e.x - g.player.x, dz = e.z - g.player.z, d = Math.hypot(dx, dz) || 1;
        if (d < 26) sfx.heavyStep(d, (dx * Math.cos(g.player.yaw) - dz * Math.sin(g.player.yaw)) / d);
      }
      const p = g.player;
      const moving = !s.paused && p.grounded && p.mode === "normal" ? Math.sqrt(p.vx * p.vx + p.vz * p.vz) / PLAYER.runSpeed : 0;
      setFootsteps(moving > 0.07 ? moving : 0);
      // (round 3: the room's own set, or the one the sim put over it: room 4 after the cables snap)
      const music = g.music ?? (typeof room.music === "string" ? room.music : "street");
      if (music === "rave") {
        // the club's track until the first shot, the fight loop after it, the track back (quiet) once clear
        setMusic(g.firstShotAt < 0 ? "calm" : g.phase === "play" ? "fight" : "clear", "rave");
        if (g.firstShotAt < 0) setCrowd("party");
      } else {
        // music: calm on the street, the fight loop once the gang is awake, calm again when clear
        const awake = g.enemies.some(e => e.state !== "idle" && e.state !== "inactive" && e.state !== "dead");
        setMusic(g.phase === "play" && awake ? "fight" : "calm", music);
      }
      if (!s.paused) director.frame();
    } else setFootsteps(0);
    window.__rp = { session: s, fps: fps.current, frames: frames.current, audio: audioState(), voices: voiceLog, guns: gunLog, cine: { phase: cine.cur?.phase ?? "", kind: cine.cur?.kind ?? "", tag: cine.cur?.tag ?? "", n: kc.n, t: cine.cur?.t ?? 0, flight: cine.cur?.flight ?? 0 }, ...(DEV ? { cineCtl: cine } : {}) };
    if (g.phase !== lastPhase.current) {
      lastPhase.current = g.phase;
      onPhase(g.phase);
    }
    acc.current += delta;
    if (acc.current < 1 / 15) return;
    acc.current = 0;
    const p = g.player, w = p.weapon;
    const hasExit = g.triggers.some(t => t.data.action === "exit");
    // Radbro's objective: shown once the fight starts (the sim has run), again when it changes
    const want = g.realTime <= 0 ? "" : g.phase === "clear" && hasExit ? room.objectiveClear : g.phase === "play" ? room.objective : objective.current.text;
    if (want !== objective.current.text) objective.current = { text: want, at: want ? performance.now() : 0 };
    const def = WEAPONS[w.id];
    useUi.setState(u => ({
      hud: {
        ...u.hud,
        health: p.health, copium: p.copium, healing: p.healLeft > 0, meter: g.meter, bt: g.bulletTime, timeScale: g.timeScale,
        mags: [w.mags[0], w.mags[1]], magSize: def.mag, reloading: w.reloadT > 0 ? 1 - w.reloadT / def.reload : 0,
        weapon: def.name, alive: g.alive, total: g.enemies.length, phase: g.phase, onTarget: g.aimEnemy >= 0, mode: p.mode,
        fps: fps.current, hurtAgo: g.realTime - g.hurtAt, killcam: g.phase === "killcam" || cine.holding,
        cine: cine.cur && cine.cur.phase !== "out" ? (cine.cur.phase === "flight" ? 1 : 2) : 0, cineTag: cine.holding ? cine.cur!.tag : "",
        roomLabel: roomLabel(room), objective: objective.current.text, objectiveAt: objective.current.at,
        weaponId: w.id, owned: SLOT_ORDER.filter(id => p.owned.includes(id)), reserve: w.reserve, hands: def.hands,
        ammo: ammoByWeapon(p),
        killcamProgress: kcProgress(),
        awake: g.enemies.some(e => e.state !== "idle" && e.state !== "inactive" && e.state !== "dead"), run: s.run,
        grenades: p.grenades, lastInSlot: { ...p.lastInSlot }, zoom: p.zoom, secrets: g.found.length, secretsTotal: g.secrets.length,
        use: promptOf(g.phase === "play" || g.phase === "clear" ? g.useTarget() : null, p.health > 0 && !s.paused),
        katana: g.katana, guard: p.guardMeter / GUARD.max, guardUp: p.guard, guardBroken: p.guardLock,
      },
    }));
  }, FRAME.sim);
  return null;
}

/** The E prompt by the crosshair: what E would do facing a secret door or an egg in reach ("" = none). */
function promptOf(t: ReturnType<Session["game"]["useTarget"]>, alive: boolean): string {
  if (!t || !alive) return "";
  if ("door" in t) return "open";
  const egg = String(t.egg.data.egg ?? "");
  return egg === "george" ? "pet george" : egg === "cabinet" ? "play" : egg === "duck" ? "squeeze" : egg === "koi" ? "feed" : "use";
}
