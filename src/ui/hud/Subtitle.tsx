// Bottom centre: the narrator's subtitle (a cream caption) and the key-hint row under it.
import { Caption } from "./Caption.tsx";
import { Keycap } from "./Keycap.tsx";
import { parseHint } from "./logic.ts";

export function HintRow({ hint }: { hint: string }) {
  const parts = parseHint(hint);
  if (!parts.length) return null;
  return (
    <div className="rp-hint">
      {parts.map((p, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {i > 0 && <span className="sep">·</span>}
          {p.keys.map((k, j) => <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{j > 0 && "/"}<Keycap k={k} /></span>)}
          <span style={{ marginLeft: p.keys.length ? 8 : 0 }}>{p.label}</span>
        </span>
      ))}
    </div>
  );
}

export function Subtitle({ text, hint, until, show, now }: { text: string; hint: string; until: number; show: boolean; now: number }) {
  const o = Math.min(1, Math.max(0, (until - now) / 400));
  const narrow = innerWidth / Math.max(1, innerHeight) < 1.6;
  return (
    <div className={`rp-sub rp-z${narrow ? " narrow" : ""}`} style={{ opacity: o }}>
      <Caption text={text} className={show ? "" : "hide"} />
      {hint && <HintRow hint={hint} />}
    </div>
  );
}
