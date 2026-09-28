// The hitmarker (hit feel, app/hitfeel.ts): a sharp X of four ink-keyed shards around the screen centre
// that pops in (a quick overshoot, a random tilt) and fades fast. A body hit is white, a headshot gold
// with four sparks flicking out, a kill a bigger red X with a white core, a ring and a flash (gold core
// and ring and the HEADSHOT sticker for a headshot kill). Rapid hits stack: each builds it bigger and
// heavier (the stack's level), then it settles. CSS animations on real time, so bullet time does not
// slow it; one element re-keyed per hit, rendered from its own store (a hit re-renders nothing else).
// Drawn over the crosshair and over the sniper's scope alike; pad and mouse the same.
import "./hitmarker.css";
import { useFeel } from "../feel.ts";
import { MARK_COLOURS } from "../../app/hitfeel.ts";

const INK = "#0b0a0d";

/** One shard along +x from `ri` to `ro`, `w` wide at its shoulder: sharp at both ends. */
function shard(ri: number, ro: number, w: number): string {
  const sh = ri + (ro - ri) * 0.62;
  return `M${ri} 0 L${sh.toFixed(2)} ${(-w).toFixed(2)} L${ro} 0 L${sh.toFixed(2)} ${w.toFixed(2)} Z`;
}

export function HitMarker() {
  const m = useFeel(s => s.mark);
  if (!m || m.k <= 0) return null;
  const sp = m.spec;
  const kill = m.kind === "kill";
  const ri = kill ? 9 : 8, ro = kill ? 31 : 24;
  const w = (kill ? 4 : 3.1) * sp.weight;
  const blade = shard(ri, ro, w);
  const core = shard(ri + 3, ro - 4, w * 0.42);
  const style = { "--sc": sp.scale, "--rot": `${sp.rot.toFixed(1)}deg`, "--ms": `${sp.ms}ms`, "--k": m.k } as React.CSSProperties;
  return (
    <div className="rp-hm rp-z" data-testid="hitmarker" data-kind={m.kind} data-hs={m.headshot ? "1" : "0"} data-level={m.level.toFixed(2)}>
      <div key={m.id} className={`pop ${m.kind}`} style={style}>
        {kill && <div className="flash" />}
        {sp.ring && <div className="ring" style={{ borderColor: m.headshot ? MARK_COLOURS.head : "#ffffff" }} />}
        <svg width="120" height="120" viewBox="-60 -60 120 120">
          {[45, 135, 225, 315].map(r => (
            <g key={r} transform={`rotate(${r})`}>
              <path d={blade} fill={sp.color} stroke={INK} strokeWidth={kill ? 2.6 : 2.2} strokeLinejoin="miter" paintOrder="stroke" />
              {kill && <path d={core} fill={sp.core} />}
            </g>
          ))}
          {sp.accent && (
            <g className="accent">
              {[0, 90, 180, 270].map(r => (
                <g key={r} transform={`rotate(${r})`}>
                  <path d={shard(kill ? 35 : 28, kill ? 43 : 35, 2)} fill={MARK_COLOURS.head} stroke={INK} strokeWidth="1.4" paintOrder="stroke" />
                </g>
              ))}
            </g>
          )}
        </svg>
      </div>
      {kill && m.headshot && <div key={`hs${m.id}`} className="rp-hs rp-hs-gold">HEADSHOT</div>}
    </div>
  );
}
