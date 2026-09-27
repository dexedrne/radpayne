// Round 3, room 5: Madame Pockit's health, top centre once she steps into the fight: her name on an ink
// plate, a thin segmented pink bar with the two phase notches (66 % and 33 %), the last hits trailing in
// paper white. Hidden in every other room; gone once she is down or during the kill cam.
import { useEffect, useRef, useState } from "react";
import { hudSession } from "./HudFrame.tsx";
import { MADAME } from "../../sim/tuning.ts";

type Bar = { on: boolean; hp: number; trail: number; phase: number; hurt: number };

export function BossBar() {
  const [b, setB] = useState<Bar>({ on: false, hp: 1, trail: 1, phase: 1, hurt: 0 });
  const trail = useRef(1);
  useEffect(() => {
    let raf = 0, last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 66) return;
      const dt = Math.min(0.2, (t - last) / 1000);
      last = t;
      const g = hudSession.current?.game;
      const boss = g?.boss;
      const her = boss ? g!.enemies[boss.idx] : undefined;
      if (!g || !boss || !her) { setB(o => (o.on ? { ...o, on: false } : o)); return; }
      const hp = Math.max(0, her.hp / her.maxHp);
      // the trail catches up after a moment
      trail.current = trail.current < hp ? hp : Math.max(hp, trail.current - dt * 0.35);
      const on = boss.started && her.state !== "dead" && g.phase === "play";
      setB({ on, hp, trail: trail.current, phase: boss.phase, hurt: boss.coatT > 0 || boss.introT > 0 ? 0 : 1 });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const W = 560;
  return (
    <div className="rp-z" style={{ position: "fixed", top: "var(--m)", left: "50%", transform: "translateX(-50%)", zIndex: 10, pointerEvents: "none", opacity: b.on ? 1 : 0, transition: "opacity 0.4s", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }} data-testid="boss-bar">
      <div className="rp-tag" style={{ fontSize: 22, letterSpacing: 3 }}>MADAME POCKIT</div>
      <div style={{ position: "relative", width: W, height: 14, background: "rgba(11,10,13,0.84)", outline: "2px solid var(--ink)", border: "2px solid var(--paper)", boxShadow: "4px 4px 0 rgba(0,0,0,0.7)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${b.trail * 100}%`, background: "var(--paper)", opacity: 0.85 }} />
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${b.hp * 100}%`, background: b.hurt ? "var(--pink)" : "#b98aa4" }} />
        {/* segments every 5 %, the phase notches heavier */}
        {Array.from({ length: 19 }, (_, i) => (i + 1) * 5).map(p => (
          <div key={p} style={{ position: "absolute", left: `${p}%`, top: 0, bottom: 0, width: 1, background: "rgba(11,10,13,0.55)" }} />
        ))}
        {[MADAME.phase2, MADAME.phase3].map(p => (
          <div key={p} style={{ position: "absolute", left: `${p * 100}%`, top: -5, bottom: -5, width: 4, marginLeft: -2, background: "var(--ink)", outline: "1px solid var(--paper)" }} />
        ))}
      </div>
    </div>
  );
}
