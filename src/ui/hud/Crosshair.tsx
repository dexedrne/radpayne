// The crosshair cluster (centre): dot + four ticks (white; pink and 3px closer on a target), the
// bullet-time ring (only while slowed: how much slow-mo is
// left), the low-ammo cue, the E prompt (a secret door or an egg in reach, faced). Stamp-driven CSS
// animations restart with `key`; no per-frame renders. The hit / kill marks and the HEADSHOT sticker are
// the hitmarker's (HitMarker.tsx: it shows over the scope too).
import { useUi } from "../store.ts";
import { METER } from "../../sim/tuning.ts";
import { Keycap } from "./Keycap.tsx";
import { ammoLow } from "./logic.ts";

const INK = "#0b0a0d";

function Ring({ f, on }: { f: number; on: boolean }) {
  const R = 52, a = Math.max(0.001, Math.min(0.999, f)) * 2 * Math.PI;
  const ex = 80 + R * Math.sin(a), ey = 80 - R * Math.cos(a);
  const arc = `M80 ${80 - R} A${R} ${R} 0 ${a > Math.PI ? 1 : 0} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  return (
    <g className={`ring${on ? " on" : ""}`}>
      <circle cx="80" cy="80" r={R} fill="none" stroke={INK} strokeWidth="6" opacity=".55" />
      <circle cx="80" cy="80" r={R} fill="none" stroke="rgba(255,207,106,.25)" strokeWidth="2" />
      {f > 0.002 && <path d={arc} fill="none" stroke={INK} strokeWidth="6" />}
      {f > 0.002 && <path d={arc} fill="none" stroke="#ffcf6a" strokeWidth="3" />}
    </g>
  );
}

export function Crosshair(_: { now: number }) {
  const h = useUi(s => s.hud);
  const on = h.onTarget;
  const c = on ? "#ff3fa8" : "#ffffff";
  const slowed = h.bt || h.timeScale < 0.99;
  const total = h.mags[0] + (h.hands === 2 ? h.mags[1] : 0);
  const lowAmmo = ammoLow(total, h.magSize, h.hands) && h.reloading <= 0;
  const tick = (r: number) => (
    <g key={r} transform={`rotate(${r} 80 80)`}>
      <rect className="tick" x="78.5" y="60" width="3" height="11" fill={c} stroke={INK} strokeWidth="1.6" />
    </g>
  );
  return (
    <div className={`rp-xh rp-z${on ? " on" : ""}${h.reloading > 0 ? " reload" : ""}`}>
      <svg width="160" height="160" viewBox="0 0 160 160">
        <Ring f={h.meter / METER.max} on={slowed} />
        <g className="core">
          <circle cx="80" cy="80" r="2.6" fill={c} stroke={INK} strokeWidth="1.6" style={{ transition: "fill 80ms" }} />
          {[0, 90, 180, 270].map(tick)}
        </g>
      </svg>
      {lowAmmo && <div className="rp-xh-ammo"><span className="c">{total}</span><Keycap k="R" /></div>}
      {h.use && <div className="rp-xh-use" data-testid="use-prompt"><Keycap k="E" /><span>{h.use}</span></div>}
    </div>
  );
}
