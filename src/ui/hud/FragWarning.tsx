// A goon's frag near him (ai/tactics.ts): a red ring with the frag's glyph round the crosshair, on the
// side it lies (its direction against the view), while one lies or flies within FRAG_WARN m of him. The
// red ring on the floor under it (ArsenalFx) is the in-world tell; this one reaches him behind cover,
// where the camera may not show the floor. Ref-driven from the canvas frame like the threat markers.
import { memo, useEffect, useRef } from "react";
import type { Session } from "../../app/session.ts";
import { hudFrame } from "./HudFrame.tsx";

export const FRAG_WARN = 7;

export const FragWarning = memo(function FragWarning({ s }: { s: Session }) {
  const el = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const fn = () => {
      const d = el.current;
      if (!d) return;
      const g = s.game, p = g.player;
      let best = -1, bd = FRAG_WARN;
      g.grenadesLive.forEach((gr, i) => {
        if ((gr.by ?? -1) < 0) return;
        const dd = Math.hypot(gr.x - p.x, gr.z - p.z);
        if (dd < bd) { bd = dd; best = i; }
      });
      if (best < 0 || p.mode === "dead" || g.phase !== "play") { d.style.display = "none"; return; }
      const gr = g.grenadesLive[best];
      // its bearing against the view: 0 = straight ahead (up on screen), clockwise
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      const vx = gr.x - p.x, vz = gr.z - p.z;
      const a = Math.atan2(vx * rx + vz * rz, vx * fx + vz * fz);
      const r = 96;
      d.style.display = "block";
      d.style.transform = `translate(calc(-50% + ${(Math.sin(a) * r).toFixed(1)}px), calc(-50% + ${(-Math.cos(a) * r).toFixed(1)}px))`;
      d.style.opacity = String(0.55 + 0.45 * Math.abs(Math.sin(g.realTime * 9)));
    };
    hudFrame.add(fn);
    return () => { hudFrame.delete(fn); };
  }, [s]);
  return (
    <div ref={el} className="rp-frag" data-testid="frag-warning" style={{ display: "none" }}>
      <svg width="44" height="44" viewBox="-22 -22 44 44">
        <circle r="18" fill="rgba(11,10,13,0.8)" stroke="#ff3148" strokeWidth="3.5" />
        <ellipse cx="0" cy="2" rx="7" ry="8.5" fill="#ff3148" />
        <rect x="-3.5" y="-10" width="7" height="4" fill="#ff3148" />
        <path d="M3.5 -8 q6 -2 6 3" stroke="#ff3148" strokeWidth="2" fill="none" />
      </svg>
    </div>
  );
});
