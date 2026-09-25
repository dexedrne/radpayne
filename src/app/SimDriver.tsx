// Runs the session every frame (input -> fixed steps -> events), feeds the audio, pushes the HUD to
// the UI store at ~15 Hz and exposes window.__rp (a probe for the smoke test).
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Session } from "./session.ts";
import { useUi } from "../ui/store.ts";
import { FRAME } from "./frame.ts";
import { WEAPONS } from "../combat/weapons.ts";
import { setClubBass, setHeartbeat, setTimeScaleAudio, sfx } from "../audio/sfx.ts";
import { audioState } from "../audio/engine.ts";

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

  useEffect(() => s.on((e, ss) => {
    const p = ss.game.player;
    const dist = (x: number, z: number) => Math.sqrt((x - p.x) ** 2 + (z - p.z) ** 2);
    switch (e.type) {
      case "shot": sfx.shot(e.shooter === -1, e.shooter === -1 ? 0 : dist(e.ox, e.oz)); break;
      case "impact": sfx.impact(e.surface, dist(e.x, e.z)); break;
      case "blood": sfx.flesh(); break;
      case "hurt": if (e.target === -1) sfx.hurt(); break;
      case "kill": sfx.kill(e.headshot); break;
      case "reload": sfx.reload(); break;
      case "dryfire": sfx.dry(); break;
      case "bt": sfx.whoosh(!e.on); setHeartbeat(e.on); break;
      case "dodge": sfx.dodge(); setHeartbeat(true); break;
      case "land": sfx.land(); if (!ss.game.bulletTime) setHeartbeat(false); break;
      case "copium": sfx.copium(); break;
      case "pickup": sfx.pickup(); break;
      case "alert": sfx.alert(); break;
      case "roomClear": sfx.clear(); setHeartbeat(false); break;
      case "playerDead": setHeartbeat(false); break;
    }
  }), [s]);

  useFrame((_, delta) => {
    s.frame(delta);
    const g = s.game;
    frames.current++;
    fps.current = fps.current * 0.95 + (1 / Math.max(delta, 1e-3)) * 0.05;
    setTimeScaleAudio(s.paused ? 1 : g.timeScale);
    // the club's bass: louder toward the door (the exit marker)
    const door = g.level.markers.find(m => m.kind === "exit");
    if (door && !s.paused) {
      const d = Math.sqrt((door.x - g.player.x) ** 2 + (door.z - g.player.z) ** 2);
      setClubBass(Math.max(0.15, Math.min(1, 1 - d / 45)));
    } else setClubBass(0);
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
