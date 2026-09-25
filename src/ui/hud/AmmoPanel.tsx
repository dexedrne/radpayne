// Ammo: one row of rounds per hand (L on top = mags[1], R below = mags[0]), live rounds on the left,
// spent from the right. Rows at 3 or fewer go red; the total at 25% of capacity or less turns the
// plate red and raises the crosshair's low-ammo cue. Reloading dims the rows, loads the rounds in
// left to right and shows RELOAD over a sand bar. Shotgun: red shells; dual SMGs: slim rounds.
import type { WeaponId } from "../../combat/weapons.ts";
import { ammoLow, rowLow } from "./logic.ts";
import { useEdge, useStampClass } from "./anim.ts";

const INK = "#0b0a0d";

function Bullet({ live, low }: { live: boolean; low: boolean }) {
  return live ? (
    <svg width="9" height="24" viewBox="0 0 9 24">
      <path d="M1 9 C1 3 4.5 0.8 4.5 0.8 C4.5 0.8 8 3 8 9 Z" fill={low ? "#ff5a4a" : "#c9784a"} stroke={INK} strokeWidth="1.3" />
      <rect x="1" y="9" width="7" height="13.5" fill={low ? "#ff9a6a" : "#d9a441"} stroke={INK} strokeWidth="1.3" />
      <rect x="2.3" y="10" width="1.4" height="11" fill="#fff" opacity="0.45" />
    </svg>
  ) : (
    <svg width="9" height="24" viewBox="0 0 9 24"><rect x="1.3" y="9.3" width="6.4" height="13" fill="none" stroke="rgba(243,234,216,0.32)" strokeWidth="1.3" /></svg>
  );
}

function Shell({ live, low }: { live: boolean; low: boolean }) {
  return live ? (
    <svg width="12" height="24" viewBox="0 0 12 24">
      <rect x="1" y="1" width="10" height="16" rx="1.5" fill={low ? "#ff4a3a" : "#c8312f"} stroke={INK} strokeWidth="1.3" />
      <rect x="1" y="16.5" width="10" height="6.5" fill="#d9a441" stroke={INK} strokeWidth="1.3" />
      <rect x="2.6" y="2.5" width="1.6" height="13" fill="#fff" opacity="0.35" />
    </svg>
  ) : (
    <svg width="12" height="24" viewBox="0 0 12 24"><rect x="1.3" y="1.3" width="9.4" height="21.4" rx="1.5" fill="none" stroke="rgba(243,234,216,0.32)" strokeWidth="1.3" /></svg>
  );
}

function Slim({ live, low }: { live: boolean; low: boolean }) {
  return live ? (
    <svg width="4" height="18" viewBox="0 0 4 18">
      <path d="M0.5 5 C0.5 2 2 0.6 2 0.6 C2 0.6 3.5 2 3.5 5 Z" fill={low ? "#ff5a4a" : "#c9784a"} stroke={INK} strokeWidth="0.9" />
      <rect x="0.5" y="5" width="3" height="12.5" fill={low ? "#ff9a6a" : "#d9a441"} stroke={INK} strokeWidth="0.9" />
    </svg>
  ) : (
    <svg width="4" height="18" viewBox="0 0 4 18"><rect x="0.6" y="5.3" width="2.8" height="12" fill="none" stroke="rgba(243,234,216,0.32)" strokeWidth="0.9" /></svg>
  );
}

function Row({ hand, n, size, kind }: { hand: string; n: number; size: number; kind: WeaponId }) {
  const lo = rowLow(n);
  const Icon = kind === "shotgun" ? Shell : kind === "smgs" ? Slim : Bullet;
  return (
    <div className="row">
      <span className={`hand${lo ? " lo" : ""}`}>{hand}</span>
      <div className={`rp-bul${kind === "smgs" ? " slim" : ""}`}>
        {Array.from({ length: size }, (_, i) => <Icon key={i} live={i < n} low={lo} />)}
      </div>
    </div>
  );
}

export function AmmoPanel({ mags, magSize, hands, reloading, weapon, weaponId, reserve }: {
  mags: [number, number]; magSize: number; hands: 1 | 2; reloading: number; weapon: string; weaponId: WeaponId; reserve: number;
}) {
  const total = mags[0] + (hands === 2 ? mags[1] : 0);
  const low = ammoLow(total, magSize, hands);
  const dry = total === 0 && reserve <= 0;
  const loadIn = Math.round(reloading * magSize);
  const shown = (m: number) => (reloading > 0 ? loadIn : m);
  const switchAt = useEdge(weaponId, () => true);
  const nameRef = useStampClass<HTMLSpanElement>(switchAt, "flash");
  return (
    <div className={`rp-panel rp-ammo${low ? " low" : ""}${reloading > 0 ? " reloading" : ""}`}>
      {hands === 2 && <Row hand="L" n={shown(mags[1])} size={magSize} kind={weaponId} />}
      <Row hand={hands === 2 ? "R" : ""} n={shown(mags[0])} size={magSize} kind={weaponId} />
      <div className="foot">
        <span ref={nameRef} className="rp-wname">{weapon.toUpperCase()}</span>
        {reloading > 0 ? (
          <div className="rp-reload"><span className="t">RELOAD</span><div className="bar"><i style={{ width: `${Math.round(reloading * 100)}%` }} /></div></div>
        ) : (
          <span className={`rp-total${low || dry ? " lo" : ""}`}>
            {total}<small> / {reserve === Infinity ? "∞" : Math.max(0, reserve)}</small>
          </span>
        )}
      </div>
    </div>
  );
}
