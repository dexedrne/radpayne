// The crosshair cluster (centre): dot + four ticks (white; pink and 3px closer on a target), hit and
// kill marks, the HEADSHOT sticker, the bullet-time ring (only while slowed: how much slow-mo is
// left), the low-ammo cue. Stamp-driven CSS animations restart with `key`; no per-frame renders.
import { useUi } from "../store.ts";
import { METER } from "../../sim/tuning.ts";
import { Keycap } from "./Keycap.tsx";
import { ammoLow, starPath } from "./logic.ts";

const INK = "#0b0a0d", PAPER = "#f3ead8";
const BURST = starPath(80, 80, 44, 36, 12);

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

export function Crosshair({ now }: { now: number }) {
  const h = useUi(s => s.hud);
  const hitAt = useUi(s => s.hitAt), killAt = useUi(s => s.killAt), hsAt = useUi(s => s.headshotAt);
  const on = h.onTarget;
  const c = on ? "#ff3fa8" : "#ffffff";
  const slowed = h.bt || h.timeScale < 0.99;
  const total = h.mags[0] + (h.hands === 2 ? h.mags[1] : 0);
  const lowAmmo = ammoLow(total, h.magSize, h.hands) && h.reloading <= 0;
  const hit = now - hitAt < 200 && hitAt > killAt;
  const kill = now - killAt < 400;
  const hs = now - hsAt < 650;
  const tick = (r: number) => (
    <g key={r} transform={`rotate(${r} 80 80)`}>
      <rect className="tick" x="78.5" y="60" width="3" height="11" fill={c} stroke={INK} strokeWidth="1.6" />
    </g>
  );
  const mark = (r: number, k: boolean) => (
    <g key={r} transform={`rotate(${r} 80 80)`}>
      <rect x="78.8" y={80 - (k ? 32 : 28)} width="2.6" height={k ? 14 : 10} fill={k ? "#ff3148" : PAPER} stroke={INK} strokeWidth="1.5" />
    </g>
  );
  return (
    <div className={`rp-xh rp-z${on ? " on" : ""}${h.reloading > 0 ? " reload" : ""}`}>
      <svg width="160" height="160" viewBox="0 0 160 160">
        <Ring f={h.meter / METER.max} on={slowed} />
        {kill && (
          <g key={`k${killAt}`} className="killm">
            <path d={BURST} fill="none" stroke={INK} strokeWidth="4.5" opacity="0.7" />
            <path d={BURST} fill="none" stroke="#ff3148" strokeWidth="2" />
            {[45, 135, 225, 315].map(r => mark(r, true))}
          </g>
        )}
        {hit && <g key={`h${hitAt}`} className="hitm">{[45, 135, 225, 315].map(r => mark(r, false))}</g>}
        <g className="core">
          <circle cx="80" cy="80" r="2.6" fill={c} stroke={INK} strokeWidth="1.6" style={{ transition: "fill 80ms" }} />
          {[0, 90, 180, 270].map(tick)}
        </g>
      </svg>
      {hs && <div key={hsAt} className="rp-hs">HEADSHOT</div>}
      {lowAmmo && <div className="rp-xh-ammo"><span className="c">{total}</span><Keycap k="R" /></div>}
    </div>
  );
}
