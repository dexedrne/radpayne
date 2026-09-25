// Runs the session every frame (input -> fixed steps -> events), feeds the audio (one-shots from the
// events, loops from the state: rain, the club's bass, footsteps, heartbeat, the music cue) and the
// voice director, pushes the HUD to the UI store at ~15 Hz and exposes window.__rp (a smoke probe).
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Session } from "./session.ts";
import { useUi } from "../ui/store.ts";
import { FRAME } from "./frame.ts";
import { WEAPONS } from "../combat/weapons.ts";
import { setAmbience, setClubBass, setFootsteps, setHeartbeat, setMusic, setNeonBuzz, setTimeScaleAudio, sfx, voiceLog } from "../audio/sfx.ts";
import { audioState } from "../audio/engine.ts";
import { Director } from "./director.ts";
import { PLAYER, TIME } from "../sim/tuning.ts";
// the HUD's data: hits on the player, refills, objectives, weapons owned
import { pushHurt } from "../ui/store.ts";
import { roomLabel, roomText } from "../ui/rooms.ts";
import { SLOT_ORDER } from "../combat/weapons.ts";
import { METER } from "../sim/tuning.ts";

declare global {
  interface Window {
    __rp?: { session: Session; fps: number; frames: number; audio: string; voices: string[] };
  }
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

  useEffect(() => s.on((e, ss) => {
    const g = ss.game, p = g.player;
    const where = (x: number, z: number) => {
      const dx = x - p.x, dz = z - p.z;
      const dist = Math.sqrt(dx * dx + dz * dz) || 1;
      return { dist, pan: (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / dist };
    };
    director.onEvent(e);
    switch (e.type) {
      case "shot": {
        const player = e.shooter === -1;
        const w = where(e.ox, e.oz);
        sfx.shot(player, player ? 0 : w.dist, w.pan);
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
      case "blood": if (e.target >= 0) { const w = where(e.x, e.z); sfx.flesh(w.dist, w.pan); } break;
      case "hurt":
        if (e.target === -1) {
          sfx.hurt();
          // the HUD's damage-direction slash (NaN = no shooter: rim only)
          pushHurt({ sx: e.fromX ?? NaN, sz: e.fromZ ?? NaN, at: performance.now(), amount: e.amount, shooter: e.shooter ?? -1 });
        }
        break;
      case "kill": {
        sfx.kill(e.headshot);
        // the hourglass refill chip (+1.5 / +2.5), unless the meter was already full
        if (meterSeen.current < METER.max - 1e-6) {
          const hud = useUi.getState().hud;
          useUi.setState({ hud: { ...hud, refill: { amount: e.headshot ? METER.headshotRefill : METER.killRefill, at: performance.now() } } });
        }
        break;
      }
      case "btRefused": useUi.setState(u => ({ hud: { ...u.hud, btRefusedAt: performance.now() } })); break;
      case "killcam": if (e.on) useUi.setState({ lastKillPhoto: null }); break;
      case "reload": sfx.reload(WEAPONS[p.weapon.id].reload / Math.max(g.timeScale, TIME.playerInBulletTime)); break;
      case "dryfire": sfx.dry(); break;
      case "bt": sfx.bullettime(e.on); setHeartbeat(e.on); break;
      case "dodge": sfx.dodge(); setHeartbeat(true); break;
      case "land": sfx.land(); if (!g.bulletTime) setHeartbeat(false); break;
      case "copium": sfx.copium(); break;
      case "pickup": sfx.pickup(); break;
      case "roomClear": setHeartbeat(false); break;
      case "playerDead": setHeartbeat(false); useUi.setState({ deadAt: performance.now() }); break;
    }
  }), [s, director]);

  useFrame((_, delta) => {
    if (hudRun.current !== s.run) {
      // a new attempt: clear the per-attempt HUD state
      hudRun.current = s.run;
      objective.current = { text: "", at: 0 };
      useUi.setState(u => ({ deadAt: 0, hurts: [], hud: { ...u.hud, refill: null, btRefusedAt: 0, objective: "", objectiveAt: 0, run: s.run } }));
    }
    meterSeen.current = s.game.meter;
    s.frame(delta);
    const g = s.game;
    frames.current++;
    fps.current = fps.current * 0.95 + (1 / Math.max(delta, 1e-3)) * 0.05;
    const screen = useUi.getState().screen;
    const inRoom = screen === "play" || screen === "paused";
    setTimeScaleAudio(s.paused ? 1 : g.timeScale);
    if (inRoom) {
      // the club's bass and the neon hum: louder toward the door (the exit marker)
      const door = g.level.markers.find(m => m.kind === "exit");
      const d = door ? Math.sqrt((door.x - g.player.x) ** 2 + (door.z - g.player.z) ** 2) : 99;
      const near = Math.max(0.15, Math.min(1, 1 - d / 45));
      setAmbience(true);
      setClubBass(near);
      setNeonBuzz(Math.max(0, 1 - d / 14));
      const p = g.player;
      const moving = !s.paused && p.grounded && p.mode === "normal" ? Math.sqrt(p.vx * p.vx + p.vz * p.vz) / PLAYER.runSpeed : 0;
      setFootsteps(moving > 0.07 ? moving : 0);
      // music: calm on the street, the fight loop once the gang is awake, calm again when clear
      const awake = g.enemies.some(e => e.state !== "idle" && e.state !== "inactive" && e.state !== "dead");
      setMusic(g.phase === "play" && awake ? "fight" : "calm");
      if (!s.paused) director.frame();
    } else setFootsteps(0);
    window.__rp = { session: s, fps: fps.current, frames: frames.current, audio: audioState(), voices: voiceLog };
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
        fps: fps.current, hurtAgo: g.realTime - g.hurtAt, killcam: g.phase === "killcam",
        roomLabel: roomLabel(room), objective: objective.current.text, objectiveAt: objective.current.at,
        weaponId: w.id, owned: SLOT_ORDER.filter(id => p.owned.includes(id)), reserve: w.reserve, hands: def.hands,
        killcamProgress: g.killcam ? Math.min(1, g.killcam.t / g.killcam.dur) : 0,
        awake: g.enemies.some(e => e.state !== "idle" && e.state !== "inactive" && e.state !== "dead"), run: s.run,
      },
    }));
  }, FRAME.sim);
  return null;
}
