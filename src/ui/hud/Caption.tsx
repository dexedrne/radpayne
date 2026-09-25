// Caption: the story voice (Radbro's inner monologue), cream box, Courier Prime italic. `[H]` in the
// text becomes an inverted keycap.
import { Keycap } from "./Keycap.tsx";

/** Splits "one can left. drink it. [H]" into text and keycaps. */
export function withKeys(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<Keycap key={i++} k={m[1]} />);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Caption({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  return <div className={`rp-cap${className ? ` ${className}` : ""}`} style={style}>{withKeys(text)}</div>;
}
