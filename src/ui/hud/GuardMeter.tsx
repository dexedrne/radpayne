// #4764's guard meter (bottom right, over the ammo; only while he plays): a blade-shaped bar that drains
// while the guard is up and with every round it stops, and refills once it is down. Up: the blade goes
// bright; empty: red and BROKEN until it is back. The hold key (a pad's melee button on a pad).
import { Keycap } from "./Keycap.tsx";

const BLADE = "M2 4.5 H170 C182 4.5 192 6 198 9 C192 12 182 13.5 170 13.5 H2 Z";

export function GuardMeter({ meter, up, broken }: { meter: number; up: boolean; broken: boolean }) {
  const k = Math.max(0, Math.min(1, meter));
  return (
    <div className={`rp-panel rp-guard${up ? " up" : ""}${broken ? " broken" : ""}`} data-testid="guard-meter">
      <span className="rp-lbl">{broken ? "BROKEN" : "GUARD"}</span>
      <svg className="blade" viewBox="0 0 200 18" preserveAspectRatio="none" aria-hidden="true">
        <defs><clipPath id="rp-guard-blade"><path d={BLADE} /></clipPath></defs>
        <path d={BLADE} className="back" />
        <rect x="0" y="0" width={2 + 196 * k} height="18" className="fill" clipPath="url(#rp-guard-blade)" />
        <path d={BLADE} className="edge" />
      </svg>
      <span className="hold">HOLD<Keycap k="F" /></span>
    </div>
  );
}
