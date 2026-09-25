// Bottom-left, above the strip: a one-off nudge caption (heal prompt, out of copium, dry gun, pickup).
import { Caption } from "./Caption.tsx";

export function Nudge({ text, at, show }: { text: string; at: number; show: boolean }) {
  return (
    <div className={`rp-nudge rp-z${show ? "" : " hide"}`}>
      <Caption key={at} text={text} />
    </div>
  );
}
