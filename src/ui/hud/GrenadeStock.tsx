// Grenade stock (arsenal spec 3.3): the [G] keycap and up to three frag glyphs in the copium stock's ink
// style; a throw drains the right-most one, a pickup pops the new one in. Hidden until he has carried one.
import { GRENADE } from "../../sim/tuning.ts";
import { Keycap } from "./Keycap.tsx";
import { useEdge } from "./anim.ts";

const INK = "#0b0a0d";

function Frag({ full }: { full: boolean }) {
  const st = full ? INK : "rgba(243,234,216,0.4)";
  return (
    <svg width="26" height="34" viewBox="0 0 26 34">
      <rect x="9" y="1.5" width="8" height="5" rx="1" fill={full ? "#8a8f76" : "none"} stroke={st} strokeWidth="1.5" />
      <path d="M17 4 C22 4 23 7 21 9" fill="none" stroke={st} strokeWidth="1.5" />
      <ellipse cx="13" cy="20" rx="10" ry="12" fill={full ? "#5f6a3e" : "none"} stroke={st} strokeWidth={full ? 2.2 : 1.6} strokeDasharray={full ? undefined : "3 2.5"} />
      {full && <><path d="M4 16 H22 M3.5 23 H22.5 M13 8.5 V31.5" stroke="rgba(11,10,13,0.45)" strokeWidth="1.3" /><rect x="6.5" y="12" width="2.2" height="14" fill="#fff" opacity="0.3" /></>}
    </svg>
  );
}

export function GrenadeStock({ n, run, now }: { n: number; run: number; now: number }) {
  const gotAt = useEdge(n, (a, b) => b > a, run);
  return (
    <div className="rp-panel rp-cop rp-nades">
      <div className="rp-cans">
        {Array.from({ length: GRENADE.carry }, (_, i) => (
          <div key={i} className={i < n ? "" : "empty"}>
            <div key={i === n - 1 && gotAt ? gotAt : 0} className={i === n - 1 && now - gotAt < 250 ? "pop" : ""}><Frag full={i < n} /></div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className="rp-lbl" style={{ fontSize: 20 }}>FRAG ×{n}</span>
        <Keycap k="G" />
      </div>
    </div>
  );
}
