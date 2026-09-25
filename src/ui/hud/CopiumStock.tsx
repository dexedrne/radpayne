// Copium stock: one small can per slot (PLAYER.maxCopium), "COPIUM ×n" and the [H] keycap. Using one
// drains the right-most full can; a pickup pops the new can. Low health with cans left: the panel,
// label and keycap turn amber (the "drink it" cue) until a can is being drunk. Low with none (and none
// being drunk): the empty cans flash red once.
import { PLAYER } from "../../sim/tuning.ts";
import { Keycap } from "./Keycap.tsx";
import { useEdge, useStampClass } from "./anim.ts";

const INK = "#0b0a0d", PAPER = "#f3ead8";

export function SmallCan({ full }: { full: boolean }) {
  const st = full ? INK : "rgba(243,234,216,0.4)";
  return (
    <svg width="30" height="42" viewBox="0 0 30 42">
      <rect x="10" y="1.5" width="10" height="4" rx="1" fill={full ? PAPER : "none"} stroke={st} strokeWidth="1.6" />
      <rect x="12.5" y="5" width="5" height="5" fill={full ? PAPER : "none"} stroke={st} strokeWidth="1.6" />
      <path d="M5 16 C5 11 9 9.5 15 9.5 C21 9.5 25 11 25 16 V37 C25 39 24 40.5 22 40.5 H8 C6 40.5 5 39 5 37 Z" fill={full ? "#ff8a1f" : "none"} stroke={st} strokeWidth={full ? 2.2 : 1.6} strokeDasharray={full ? undefined : "3 2.5"} />
      {full && <><rect x="8" y="14" width="2.5" height="22" fill="#fff" opacity="0.35" /><rect x="5" y="22" width="20" height="7" fill="rgba(11,10,13,0.35)" /></>}
    </svg>
  );
}

export function CopiumStock({ copium, hp, healing, now, run }: { copium: number; hp: number; healing: boolean; now: number; run: number }) {
  const low = hp <= 25 && hp > 0;
  // while a can is being drunk there is nothing to press (and drinking the last one is not "out")
  const cue = low && copium > 0 && !healing;
  const usedAt = useEdge(copium, (a, b) => b < a, run);
  const gotAt = useEdge(copium, (a, b) => b > a, run);
  const dryAt = useEdge(low && copium === 0 && !healing, (a, b) => !a && b, run);
  const cansRef = useStampClass<HTMLDivElement>(dryAt, "red");
  const draining = now - usedAt < 260 ? copium : -1; // the can just used (index = the new count)
  return (
    <div className={`rp-panel rp-cop${cue ? " cue" : ""}`}>
      <div ref={cansRef} className="rp-cans">
        {Array.from({ length: PLAYER.maxCopium }, (_, i) => (
          <div key={i} style={{ position: "relative", width: 30, height: 42 }} className={i < copium ? "" : "empty"}>
            <div key={i === copium - 1 && gotAt ? gotAt : 0} className={i === copium - 1 && now - gotAt < 250 ? "pop" : ""}><SmallCan full={i < copium} /></div>
            {i === draining && <div key={usedAt} className="drain" style={{ position: "absolute", inset: 0 }}><SmallCan full /></div>}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="rp-lbl" style={{ fontSize: 20 }}>COPIUM ×{copium}</span>
        <Keycap k="H" />
      </div>
    </div>
  );
}
