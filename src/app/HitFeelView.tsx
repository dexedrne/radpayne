// The hit feel dispatcher (see hitfeel.ts): hears the sim's events, and once per frame, right after the
// steps ran, turns them into hits and sends each one out: the hitmarker (ui/feel.ts), the confirm sound
// (audio/hitSounds.ts), the pad, the camera punch, the struck body's reaction (hitReact.ts) and the
// burst at the hit (HitBurstFx.tsx), each at the Hit feedback setting's strength. A kill the kill cam
// takes over keeps its marker, sound and punch to itself (the cam has its own impact); her reaction and
// burst wait for the cam's round to land.
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import type { Session } from "./session.ts";
import { FRAME } from "./frame.ts";
import { cine } from "./cine.ts";
import { FEEL, HitGrouper, isHeavyHit, markSpec, newStack, punchOf, rumbleOfHit, stackHit, startPunch, weaponWeight } from "./hitfeel.ts";
import { kickReact, resetReacts } from "./hitReact.ts";
import { burstQueue } from "./HitBurstFx.tsx";
import { useFeel, type Mark } from "../ui/feel.ts";
import { useUi } from "../ui/store.ts";
import { hitSound } from "../audio/hitSounds.ts";
import { playRumble } from "../input/rumble.ts";
import { activePad, useDevice } from "../input/device.ts";

/** Dev / test probe: the last hits sent out (kind, weapon, stack level), newest last. */
export const hitLog: string[] = [];

if (import.meta.env.MODE !== "production" && typeof window !== "undefined") (window as unknown as { __hits?: string[] }).__hits = hitLog;

export function HitFeelView({ s }: { s: Session }) {
  const st = useMemo(() => ({ grouper: new HitGrouper(), stack: newStack(), id: 0, run: -1 }), []);
  useEffect(() => s.on(e => st.grouper.feed(e)), [s, st]);

  // right after the sim's steps (FRAME.sim), before the actors pose: the reaction shows this frame
  useFrame(() => {
    const g = s.game;
    if (st.run !== s.run) {
      st.run = s.run;
      st.grouper.reset();
      st.stack = newStack();
      resetReacts();
      burstQueue.length = 0;
      useFeel.setState({ mark: null });
    }
    let awake = 0;
    for (const e of g.enemies) if (e.state !== "dead" && e.state !== "inactive" && !e.fled) awake++;
    const hits = st.grouper.flush(awake);
    if (!hits.length) return;
    const F = FEEL[useFeel.getState().mode];
    const now = performance.now();
    let mark: Mark | null = null;
    for (const h of hits) {
      kickReact(h, g.enemies[h.target]?.facing ?? 0, F.react, F.flash);
      if (F.burst > 0 && h.placed) burstQueue.push({ h, k: F.burst });
      // the kill cam took this one: its ride and impact are the feedback
      if (h.kind === "kill" && (cine.holds(h.target) || cine.holding)) continue;
      st.stack = stackHit(st.stack, now, h.kind, weaponWeight(h.weapon));
      const level = st.stack.level;
      if (F.marker > 0) mark = { id: ++st.id, kind: h.kind, headshot: h.headshot, level, spec: markSpec(h.kind, h.headshot, level, Math.random(), isHeavyHit(h)), at: now, k: F.marker };
      hitSound(h, level, s.hold ? 0.15 : g.timeScale, F.sound);
      startPunch(punchOf(h) * F.cam);
      if (!s.bot && useUi.getState().vibration && useDevice.getState().device === "pad") {
        const r = rumbleOfHit(h, F.rumble);
        if (r) playRumble(activePad(), r);
      }
      hitLog.push(`${h.kind}${h.headshot ? "+hs" : ""} ${h.weapon} x${h.n} ${level.toFixed(2)}${h.waveEnd ? " wave" : ""}`);
      if (hitLog.length > 200) hitLog.shift();
    }
    if (mark) useFeel.setState({ mark });
  }, FRAME.sim + 0.5);

  return null;
}
