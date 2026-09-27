// Caption: the story voice (Radbro's inner monologue), cream box, Courier Prime italic. `[H]` in the
// text becomes an inverted keycap.
import { Keycap } from "./Keycap.tsx";
import type { Act } from "../../input/pad.ts";

/** Splits "one can left. drink it. [H]" into text and keycaps ("[RMB|aimHold]": a key and its pad action). */
export function withKeys(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    // [K|act]: key K, and on a pad the button of that action (RMB in cover is L2, not bullet time)
    const [k, a] = m[1].split("|");
    out.push(<Keycap key={i++} k={k} a={a as Act | undefined} />);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Caption({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  return <div className={`rp-cap${className ? ` ${className}` : ""}`} style={style}>{withKeys(text)}</div>;
}
