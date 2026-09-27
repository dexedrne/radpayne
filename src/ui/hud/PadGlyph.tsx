// Pad glyphs, drawn (no image files): PlayStation's Cross / Circle / Square / Triangle symbols on an ink
// disc, Xbox's coloured A / B / X / Y, shoulder and trigger tabs, the sticks and the d-pad with the arm
// that matters lit pink. Sized like a keycap so a hint reads the same on either device.
import { GLYPH_NAME, type Glyph, type PadKind } from "../../input/pad.ts";

const INK = "#0b0a0d";
const PAPER = "#f3ead8";
/** The d-pad arm that matters (the pink of the menus' focus). */
const LIT = "#ff3fa8";
const PS_COL: Record<string, string> = { cross: "#8fb8ff", circle: "#ff6d7e", square: "#f59ad8", triangle: "#3ee6c1" };
const XB: Record<string, [string, string]> = { cross: ["A", "#6cc24a"], circle: ["B", "#e8453c"], square: ["X", "#3d8fe6"], triangle: ["Y", "#f2c230"] };
const XB_TAB: Record<string, string> = { l1: "LB", r1: "RB", l2: "LT", r2: "RT" };

function Face({ g, kind }: { g: Glyph; kind: PadKind }) {
  if (kind === "xbox") {
    const [l, c] = XB[g];
    return (
      <svg viewBox="0 0 24 24" width="24" height="24">
        <circle cx="12" cy="12" r="11" fill={c} stroke={INK} strokeWidth="1.5" />
        <text x="12" y="16.6" textAnchor="middle" fontFamily="'Courier Prime', 'Courier New', monospace" fontWeight="700" fontSize="14" fill={INK}>{l}</text>
      </svg>
    );
  }
  const c = PS_COL[g];
  return (
    <svg viewBox="0 0 24 24" width="24" height="24">
      <circle cx="12" cy="12" r="11" fill={INK} stroke={PAPER} strokeWidth="1.5" />
      {g === "cross" && <path d="M7.6 7.6 L16.4 16.4 M16.4 7.6 L7.6 16.4" stroke={c} strokeWidth="2.3" strokeLinecap="round" />}
      {g === "circle" && <circle cx="12" cy="12" r="5" fill="none" stroke={c} strokeWidth="2.2" />}
      {g === "square" && <rect x="7.4" y="7.4" width="9.2" height="9.2" fill="none" stroke={c} strokeWidth="2.2" />}
      {g === "triangle" && <path d="M12 6.6 L17.4 16.2 L6.6 16.2 Z" fill="none" stroke={c} strokeWidth="2.1" strokeLinejoin="round" />}
    </svg>
  );
}

function Stick({ g, kind }: { g: Glyph; kind: PadKind }) {
  const left = g === "ls" || g === "l3";
  const click = g === "l3" || g === "r3";
  const label = click ? (kind === "ps" ? (left ? "L3" : "R3") : left ? "LS" : "RS") : left ? "L" : "R";
  return (
    <svg viewBox="0 0 24 24" width="24" height="24">
      <circle cx="12" cy="12" r="11" fill="none" stroke={PAPER} strokeWidth="1.5" strokeDasharray={click ? "none" : "3 2"} />
      <circle cx="12" cy="12" r="8" fill={click ? PAPER : INK} stroke={PAPER} strokeWidth="1.5" />
      <text x="12" y={click ? 15.4 : 16.2} textAnchor="middle" fontFamily="'Courier Prime', 'Courier New', monospace" fontWeight="700" fontSize={click ? 9.5 : 12} fill={click ? INK : PAPER}>{label}</text>
    </svg>
  );
}

const ARMS: Record<string, Array<"u" | "d" | "l" | "r">> = { dpad: ["u", "d", "l", "r"], dpadV: ["u", "d"], dpadH: ["l", "r"], dup: ["u"], ddown: ["d"], dleft: ["l"], dright: ["r"] };

function Dpad({ g }: { g: Glyph }) {
  const lit = new Set(ARMS[g]);
  const arm = (k: "u" | "d" | "l" | "r", x: number, y: number, w: number, h: number) => (
    <rect key={k} x={x} y={y} width={w} height={h} rx="1.2" fill={lit.has(k) ? LIT : "rgba(11,10,13,0.85)"} stroke={lit.has(k) ? INK : "rgba(243,234,216,0.55)"} strokeWidth="1.2" />
  );
  return (
    <svg viewBox="0 0 24 24" width="24" height="24">
      {arm("u", 8.5, 1, 7, 8)}
      {arm("d", 8.5, 15, 7, 8)}
      {arm("l", 1, 8.5, 8, 7)}
      {arm("r", 15, 8.5, 8, 7)}
      <rect x="9.1" y="9.1" width="5.8" height="5.8" fill="rgba(11,10,13,0.85)" />
    </svg>
  );
}

/** One glyph for this pad. */
export function PadGlyph({ g, kind }: { g: Glyph; kind: PadKind }) {
  let body: React.ReactNode;
  if (g === "cross" || g === "circle" || g === "square" || g === "triangle") body = <Face g={g} kind={kind} />;
  else if (g === "l1" || g === "r1" || g === "l2" || g === "r2") body = <span className={`rp-padpill ${g.endsWith("2") ? "trig" : "bump"}`}>{kind === "ps" ? g.toUpperCase() : XB_TAB[g]}</span>;
  else if (g === "options" || g === "create") body = <span className="rp-padpill menu">{kind === "ps" ? (g === "options" ? "OPTIONS" : "CREATE") : g === "options" ? "≡ MENU" : "VIEW"}</span>;
  else if (g === "ls" || g === "rs" || g === "l3" || g === "r3") body = <Stick g={g} kind={kind} />;
  else body = <Dpad g={g} />;
  return <span className="rp-padg" title={GLYPH_NAME[kind][g]} aria-label={GLYPH_NAME[kind][g]}>{body}</span>;
}

/** Several glyphs for one action ("L1 / ←→"). */
export function PadGlyphs({ gs, kind, className, style }: { gs: Glyph[]; kind: PadKind; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`rp-pad${className ? ` ${className}` : ""}`} style={style} data-pad={kind}>
      {gs.map((g, i) => <span key={g} className="rp-pad-one">{i > 0 && <span className="sl">/</span>}<PadGlyph g={g} kind={kind} /></span>)}
    </span>
  );
}
