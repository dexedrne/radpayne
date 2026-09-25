// Health: the copium tank (the MP painkiller figure: you are running on copium). Fluid to hp / 100
// with a wavy top; cream above 50, amber 26-50, red at 25 and below (red stroke + shake ticks).
// Hurt: the fluid drops over 120 ms and the panel shakes; heal: the fluid rises, the wave scrolls and
// the border flashes amber.
import { useId } from "react";
import { PLAYER } from "../../sim/tuning.ts";
import { useEdge, useStampClass } from "./anim.ts";

const INK = "#0b0a0d", PAPER = "#f3ead8";
const BODY = "M12 40 C12 27 20 21 32 21 C44 21 52 27 52 40 V114 C52 119 49 122 44 122 H20 C15 122 12 119 12 114 Z";
// one extra period each side so the wave can scroll by its 42-unit wavelength
const WAVE = "M-42 0 Q -32 -3.5 -21 0 T 0 0 T 21 0 T 42 0 T 63 0 T 84 0 T 105 0";

export const fluidColour = (f: number): string => (f > 0.5 ? "#efe4c8" : f > 0.25 ? "#ffb03f" : "#ff3148");

export function Canister({ f, low }: { f: number; low: boolean }) {
  const id = useId().replace(/:/g, "");
  const y = 122 - Math.max(0, Math.min(1, f)) * 100;
  const col = fluidColour(f);
  return (
    <svg width="62" height="124" viewBox="0 0 64 128" style={{ overflow: "visible", flex: "none" }}>
      <defs>
        <clipPath id={`c${id}`}><path d={BODY} /></clipPath>
        <pattern id={`h${id}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" fill="#141217" /><rect width="2" height="7" fill="#2b2631" />
        </pattern>
      </defs>
      <rect x="21" y="3" width="22" height="6" rx="2" fill={PAPER} stroke={INK} strokeWidth="2.5" />
      <rect x="27" y="8" width="10" height="14" fill={PAPER} stroke={INK} strokeWidth="2.5" />
      <g clipPath={`url(#c${id})`}>
        <rect width="64" height="128" fill={`url(#h${id})`} />
        <g className="fluid" style={{ transform: `translateY(${y.toFixed(2)}px)` }}>
          <g className="wave">
            <path d={`${WAVE} V140 H-42 Z`} fill={col} />
            <path d={WAVE} fill="none" stroke={INK} strokeWidth="2" />
          </g>
        </g>
        <rect x="17" y="30" width="5" height="86" fill="#fff" opacity="0.2" />
        <rect x="12" y="56" width="40" height="30" fill="none" stroke={INK} strokeWidth="2" opacity="0.55" />
        <path d="M32 59 C25 59 22.5 63.5 22.5 68 C22.5 72.5 26 75 32 75 C38 75 41.5 72.5 41.5 68 C41.5 63.5 39 59 32 59 Z M25 77 H39 L41 84 H23 Z" fill={INK} opacity="0.6" />
      </g>
      <path d={BODY} fill="none" stroke={INK} strokeWidth="6" />
      <path d={BODY} fill="none" stroke={low ? "#ff3148" : PAPER} strokeWidth="2.5" />
      {low && <path d="M2 50 l-8 -4 M2 70 l-9 0 M2 90 l-8 4 M62 50 l8 -4 M62 70 l9 0 M62 90 l8 4" stroke="#ff3148" strokeWidth="3" strokeLinecap="round" />}
    </svg>
  );
}

export function HealthTank({ hp, healing, copium, run }: { hp: number; healing: boolean; copium: number; run: number }) {
  const f = hp / PLAYER.maxHealth;
  const low = hp <= 25;
  const hurtAt = useEdge(hp, (a, b) => b < a - 0.01, run);
  // heal start (or a can used): the border flashes amber
  const healAt = Math.max(useEdge(healing, (a, b) => !a && b, run), useEdge(copium, (a, b) => b < a, run));
  const hurtRef = useStampClass<HTMLDivElement>(hurtAt, "hurt");
  const healRef = useStampClass<HTMLDivElement>(healAt, "heal");
  return (
    <div ref={hurtRef} className="rp-shakewrap">
      <div ref={healRef} className={`rp-panel rp-tank${low ? " low" : ""}${healing ? " healing" : ""}`}>
        <Canister f={f} low={low} />
        <div className="read">
          <div className="rp-num" style={low ? { color: "var(--red)" } : undefined}>{Math.max(0, Math.ceil(hp))}</div>
          <div className="rp-lbl" style={{ fontSize: 17, opacity: 0.85 }}>HEALTH</div>
        </div>
      </div>
    </div>
  );
}
