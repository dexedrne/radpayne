// Bullet time: the hourglass. The top bulb holds meter / max, the bottom the spent sand. While
// slowed the frame and panel turn sand-hot with a glow and a sand stream falls. Refused (too little
// meter): the glass flashes red twice and the panel nudges. A kill refill floats a "+1.5" chip.
import { useId } from "react";
import { METER } from "../../sim/tuning.ts";
import { Keycap } from "./Keycap.tsx";
import { useStampClass } from "./anim.ts";

const INK = "#0b0a0d", PAPER = "#f3ead8";
const GLASS = "M14 12 H42 C42 30 31 40 29.5 50 C31 60 42 70 42 88 H14 C14 70 25 60 26.5 50 C25 40 14 30 14 12 Z";

export function HourglassFigure({ f, on }: { f: number; on: boolean }) {
  const id = useId().replace(/:/g, "");
  f = Math.max(0, Math.min(1, f));
  const frame = on ? "#ffcf6a" : PAPER;
  const botH = 32 * (1 - f);
  return (
    <svg className="hg" width="62" height="108" viewBox="0 0 56 100" style={{ overflow: "visible", flex: "none" }}>
      <defs>
        <clipPath id={`t${id}`}><path d="M14 12 H42 C42 30 31 40 29.5 50 H26.5 C25 40 14 30 14 12 Z" /></clipPath>
        <clipPath id={`b${id}`}><path d="M26.5 50 H29.5 C31 60 42 70 42 88 H14 C14 70 25 60 26.5 50 Z" /></clipPath>
      </defs>
      <path d={GLASS} fill="rgba(243,234,216,0.08)" />
      <g clipPath={`url(#t${id})`}>
        <path className="topsand" d="M0 16 Q 28 21 56 16 V52 H0 Z" fill="#e8a94a" style={{ transform: `translateY(${(34 * (1 - f)).toFixed(2)}px)` }} />
      </g>
      <g clipPath={`url(#b${id})`}>
        <path d={`M0 88 V${88 - botH * 0.45} Q 28 ${88 - botH * 1.25} 56 ${88 - botH * 0.45} V88 Z`} fill="#e8a94a" opacity="0.92" />
      </g>
      {on && f > 0 && <rect x="27.3" y="49" width="1.6" height={Math.max(0, 38 - botH * 0.9)} fill="#ffcf6a" />}
      <path d={GLASS} fill="none" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <path className="glass-line" d={GLASS} fill="none" stroke={frame} strokeWidth="2" strokeLinejoin="round" style={{ color: frame }} />
      <rect x="6" y="11" width="4" height="78" fill={frame} stroke={INK} strokeWidth="2" />
      <rect x="46" y="11" width="4" height="78" fill={frame} stroke={INK} strokeWidth="2" />
      <rect x="3" y="4" width="50" height="8" rx="1.5" fill={frame} stroke={INK} strokeWidth="2.5" />
      <rect x="3" y="88" width="50" height="8" rx="1.5" fill={frame} stroke={INK} strokeWidth="2.5" />
      <path d="M18 18 C19 28 22 34 25 38" stroke="#fff" strokeWidth="1.6" fill="none" opacity="0.4" />
    </svg>
  );
}

export function Hourglass({ meter, on, refusedAt, refill, now }: { meter: number; on: boolean; refusedAt: number; refill: { amount: number; at: number } | null; now: number }) {
  const ref = useStampClass<HTMLDivElement>(refusedAt, "refused");
  const chip = refill && now - refill.at < 600 ? refill : null;
  return (
    <div ref={ref} className={`rp-panel rp-glass${on ? " on" : ""}`}>
      {chip && <div key={chip.at} className="rp-refill">+{chip.amount.toFixed(1)}</div>}
      <HourglassFigure f={meter / METER.max} on={on} />
      {on
        ? <div className="rp-lbl slow-on" style={{ fontSize: 17 }}>SLOW</div>
        : <div className="rp-lbl" style={{ fontSize: 17, display: "flex", alignItems: "center", gap: 6 }}><Keycap k="Q" /> SLOW</div>}
    </div>
  );
}
