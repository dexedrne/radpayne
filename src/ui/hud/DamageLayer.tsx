// Damage direction: a comic slash on an inner ring around the reticle (an ellipse 0.29 W x 0.305 H),
// teeth pointing at the centre, placed at the shooter's bearing relative to the camera and re-aimed
// every frame as you turn; plus a rim on the canvas layer on that side. Punch in 80 ms, hold 500,
// fade 700 (real time). A hit with no shooter (a fall) rims every side. Death: slashes all round.
// The colour follows the Damage colour setting (--dmg).
import { memo, useEffect, useMemo, useRef } from "react";
import { Vector3, type Camera } from "three";
import type { Session } from "../../app/session.ts";
import { useUi } from "../store.ts";
import { HURT_LIFE, damageAngle, hurtPhase, hurtStrength, slashPath } from "./logic.ts";
import { hudFrame } from "./HudFrame.tsx";
import { hudScaleNow } from "./scale.ts";

const RIM_RGB: Record<string, string> = { red: "255,49,72", yellow: "255,210,63", white: "255,255,255" };
const DEATH_N = 12;
const DEATH_LIFE = 1400;
/** Reduced motion: slashes only fade (no punch). */
const still = (): boolean => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

export const DamageLayer = memo(function DamageLayer({ s }: { s: Session }) {
  const svg = useRef<SVGSVGElement>(null);
  const slashes = useRef<Array<SVGPathElement | null>>([]);
  const rims = useRef<Array<HTMLDivElement | null>>([]);
  const tmp = useMemo(() => ({ fwd: new Vector3(), w: 0, h: 0, still: still() }), []);

  useEffect(() => {
    const hide = (from: number) => {
      for (let i = from; i < slashes.current.length; i++) slashes.current[i]?.setAttribute("visibility", "hidden");
    };
    const f = (camera: Camera, ss: Session, now: number) => {
      const el = svg.current;
      if (!el) return;
      const ui = useUi.getState();
      const W = innerWidth, H = innerHeight, S = hudScaleNow();
      if (tmp.w !== W || tmp.h !== H) {
        tmp.w = W; tmp.h = H;
        el.setAttribute("viewBox", `${-W / 2} ${-H / 2} ${W} ${H}`);
      }
      const rx = 0.29 * W, ry = 0.305 * H;
      const calm = tmp.still;
      camera.getWorldDirection(tmp.fwd);
      const p = ss.renderP;
      const rgb = RIM_RGB[ui.dmgColour] ?? RIM_RGB.red;
      let k = 0;
      // the kill cam shows only its own overlay
      const hurts = (ui.screen === "play" && ss.game.phase !== "killcam") || ui.deadAt ? ui.hurts : [];
      for (let r = 0; r < 4; r++) {
        const rim = rims.current[r];
        const hurt = hurts[r];
        const ph = hurt ? hurtPhase(now - hurt.at) : null;
        if (!hurt || !ph) { if (rim) rim.style.display = "none"; continue; }
        const str = hurtStrength(hurt.amount) * ph.alpha;
        if (Number.isNaN(hurt.sx)) {
          if (rim) { rim.style.display = "block"; rim.style.background = `radial-gradient(ellipse 75% 72% at 50% 50%, transparent 50%, rgba(${rgb},${(0.42 * str).toFixed(3)}) 100%)`; }
          continue;
        }
        const deg = damageAngle(p.x, p.z, hurt.sx, hurt.sz, tmp.fwd.x, tmp.fwd.z);
        const a = (deg * Math.PI) / 180;
        if (rim) {
          rim.style.display = "block";
          rim.style.background = `radial-gradient(ellipse 45% 55% at ${(50 + Math.sin(a) * 50).toFixed(1)}% ${(50 - Math.cos(a) * 50).toFixed(1)}%, rgba(${rgb},${(0.42 * str).toFixed(3)}), transparent 70%)`;
        }
        const sl = slashes.current[k++];
        if (!sl) continue;
        sl.setAttribute("d", slashPath(deg, rx, ry, 34 * S, 9 * S, (calm ? 6 : ph.inset) * S));
        sl.setAttribute("stroke-width", (3.5 * S).toFixed(2));
        sl.setAttribute("opacity", str.toFixed(3));
        sl.setAttribute("visibility", "visible");
      }
      // death: the ring fills with slashes once
      const dAge = ui.deadAt ? now - ui.deadAt : -1;
      if (dAge >= 0 && dAge < DEATH_LIFE) {
        const ph = hurtPhase(dAge * (HURT_LIFE / DEATH_LIFE));
        for (let i = 0; i < DEATH_N; i++) {
          const sl = slashes.current[k++];
          if (!sl || !ph) continue;
          sl.setAttribute("d", slashPath((360 * i) / DEATH_N, rx, ry, 34 * S, 9 * S, (calm ? 6 : ph.inset) * S));
          sl.setAttribute("stroke-width", (3.5 * S).toFixed(2));
          sl.setAttribute("opacity", ph.alpha.toFixed(3));
          sl.setAttribute("visibility", "visible");
        }
      }
      hide(k);
    };
    hudFrame.add(f);
    return () => { hudFrame.delete(f); };
  }, [s, tmp]);

  return (
    <>
      <div className="rp-rims">
        {[0, 1, 2, 3].map(i => <div key={i} ref={el => { rims.current[i] = el; }} />)}
      </div>
      <svg ref={svg} className="rp-damage" width="100%" height="100%" preserveAspectRatio="none">
        {Array.from({ length: 4 + DEATH_N }, (_, i) => (
          <path key={i} ref={el => { slashes.current[i] = el; }} visibility="hidden" fill="var(--dmg)" stroke="#0b0a0d" strokeLinejoin="round" />
        ))}
      </svg>
    </>
  );
});
