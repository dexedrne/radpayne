// Top-left: the room tag and the Milady tally (one bob-cut head per Milady; downed heads fill from
// the left with X eyes; "5 LEFT"). The latest downed head flips over and the number pops.
import { Tag } from "./Tag.tsx";
import { useEdge } from "./anim.ts";

const INK = "#0b0a0d", PAPER = "#f3ead8";
const HAIR = "M3 21V10.5a8 8 0 0 1 16 0V21h-3.6V9.8H6.6V21Z";

export function MiladyHead({ down }: { down: boolean }) {
  if (down) return (
    <svg viewBox="0 0 22 22">
      <path d={HAIR} fill="none" stroke="rgba(243,234,216,.42)" strokeWidth="1.6" />
      <path d="M7.6 12.6l2.4 2.4M10 12.6l-2.4 2.4M12 12.6l2.4 2.4M14.4 12.6 12 15" stroke="rgba(243,234,216,.55)" strokeWidth="1.4" />
    </svg>
  );
  return (
    <svg viewBox="0 0 22 22">
      <rect x="6" y="9" width="10" height="11" rx="3.5" fill={PAPER} stroke={INK} strokeWidth="2.4" />
      <path d={HAIR} fill="#ff3fa8" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="9" cy="13.8" r="1.25" fill={INK} /><circle cx="13" cy="13.8" r="1.25" fill={INK} />
      <path d="M7.2 16.2h1.6M13.2 16.2h1.6" stroke="#ff8fc8" strokeWidth="1.2" />
    </svg>
  );
}

export function Tally({ alive, total, run }: { alive: number; total: number; run: number }) {
  const killAt = useEdge(alive, (a, b) => b < a, run);
  const down = total - alive;
  const shown = Math.min(total, 12);
  return (
    <div className="rp-tally">
      {Array.from({ length: shown }, (_, i) => (
        <div key={i === down - 1 ? `f${killAt}` : i} className={i === down - 1 && killAt && performance.now() - killAt < 250 ? "flip" : ""}>
          {/* the flip swaps the face halfway through */}
          <MiladyHead down={i < down && !(i === down - 1 && performance.now() - killAt < 100)} />
        </div>
      ))}
      {total > 12 && <span className="more">+{total - 12}</span>}
      <span className="n"><b key={killAt} className={killAt ? "pop" : ""}>{alive}</b> LEFT</span>
    </div>
  );
}

export function RoomTag({ label, short }: { label: string; short: boolean }) {
  return <Tag>{short ? label.split(" · ")[0] : label}</Tag>;
}
