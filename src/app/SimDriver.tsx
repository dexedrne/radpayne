// Runs the session every frame (input -> fixed steps -> events), feeds the audio (one-shots from the
// events, loops from the state: rain, the club's bass, footsteps, heartbeat, the music cue) and the
// voice director, pushes the HUD to the UI store at ~15 Hz and exposes window.__rp (a smoke probe).
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Session } from "./session.ts";
import { useUi } from "../ui/store.ts";
import { FRAME } from "./frame.ts";
import { WEAPONS } from "../combat/weapons.ts";
import { setAmbience, setClubBass, setFootsteps, setHeartbeat, setMusic, setNeonBuzz, setTimeScaleAudio, sfx } from "../audio/sfx.ts";
import { audioState } from "../audio/engine.ts";
import { Director } from "./director.ts";
import { TIME } from "../sim/tuning.ts";

declare global {
  interface Window {
    __rp?: { session: Session; fps: number; frames: number; audio: string };
  }
}

export function SimDriver({ s, onPhase }: { s: Session; onPhase: (phase: string) => void }) {
  const acc = useRef(0);
  const fps = useRef(60);
  const frames = useRef(0);
  const lastPhase = useRef("");
  const director = useMemo(() => new Director(s), [s]);

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
      case "hurt": if (e.target === -1) sfx.hurt(); break;
      case "kill": sfx.kill(e.headshot); break;
      case "reload": sfx.reload(WEAPONS[p.weapon.id].reload / Math.max(g.timeScale, TIME.playerInBulletTime)); break;
      case "dryfire": sfx.dry(); break;
      case "bt": sfx.bullettime(e.on); setHeartbeat(e.on); break;
      case "dodge": sfx.dodge(); setHeartbeat(true); break;
      case "land": sfx.land(); if (!g.bulletTime) setHeartbeat(false); break;
      case "copium": sfx.copium(); break;
      case "pickup": sfx.pickup(); break;
      case "roomClear": setHeartbeat(false); break;
      case "playerDead": setHeartbeat(false); break;
    }
  }), [s, director]);

  useFrame((_, delta) => {
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
      const moving = !s.paused && p.grounded && p.mode === "normal" ? Math.sqrt(p.vx * p.vx + p.vz * p.vz) / 5.6 : 0;
      setFootsteps(moving > 0.07 ? moving : 0);
      // music: calm on the street, the fight loop once the gang is awake, calm again when clear
      const awake = g.enemies.some(e => e.state !== "idle" && e.state !== "inactive" && e.state !== "dead");
      setMusic(g.phase === "play" && awake ? "fight" : "calm");
      if (!s.paused) director.frame();
    } else setFootsteps(0);
    window.__rp = { session: s, fps: fps.current, frames: frames.current, audio: audioState() };
    if (g.phase !== lastPhase.current) {
      lastPhase.current = g.phase;
      onPhase(g.phase);
    }
    acc.current += delta;
    if (acc.current < 1 / 15) return;
    acc.current = 0;
    const p = g.player, w = p.weapon;
    const hasExit = g.triggers.some(t => t.data.action === "exit");
    useUi.setState({
      hud: {
        health: p.health, copium: p.copium, healing: p.healLeft > 0, meter: g.meter, bt: g.bulletTime, timeScale: g.timeScale,
        mags: [w.mags[0], w.mags[1]], magSize: WEAPONS[w.id].mag, reloading: w.reloadT > 0 ? 1 - w.reloadT / WEAPONS[w.id].reload : 0,
        weapon: WEAPONS[w.id].name, alive: g.alive, total: g.enemies.length, phase: g.phase, onTarget: g.aimEnemy >= 0, mode: p.mode,
        fps: fps.current, hurtAgo: g.realTime - g.hurtAt, killcam: g.phase === "killcam",
        prompt: g.phase === "clear" && hasExit ? "the bag is inside. get to the door." : "",
      },
    });
  }, FRAME.sim);
  return null;
}
