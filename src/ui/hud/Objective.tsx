// Radbro's objective (top-left, under the tally): slides in, holds 8 s, fades out rising.
import { Caption } from "./Caption.tsx";

export function Objective({ text, at, show, now }: { text: string; at: number; show: boolean; now: number }) {
  return (
    <div className={`rp-obj${show ? "" : " hide"}`}>
      {/* a negative delay keeps the hold in step after a remount (pause / resume) */}
      <Caption key={at} text={text} className="rp-obj show" style={{ animationDelay: `${-Math.max(0, now - at).toFixed(0)}ms` }} />
    </div>
  );
}
