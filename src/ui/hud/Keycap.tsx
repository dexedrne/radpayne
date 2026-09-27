// Keycap: a paper block with ink text and a key lip. Used wherever a key is named. On a pad (the last
// device used) it shows that pad's glyph for the key's action instead (`a` names the action where the
// key alone would be ambiguous: Esc pauses in the fight, goes back in a menu); a key with no pad button
// (M: mute) stays a key.
import { useDevice } from "../../input/device.ts";
import { PAD_GLYPHS, keyAct, type Act } from "../../input/pad.ts";
import { PadGlyphs } from "./PadGlyph.tsx";

export function Keycap({ k, a, className, style }: { k: string; a?: Act; className?: string; style?: React.CSSProperties }) {
  const pad = usePadGlyphs(k, a);
  if (pad) return <PadGlyphs gs={pad.gs} kind={pad.kind} className={className} style={style} />;
  return <span className={`rp-key${className ? ` ${className}` : ""}`} style={style}>{k}</span>;
}

/** The key's label as plain text on a button (ENTER, ESC), or the pad's glyph there. */
export function BtnKey({ k, a }: { k: string; a?: Act }) {
  const pad = usePadGlyphs(k, a);
  return <span className="k">{pad ? <PadGlyphs gs={pad.gs} kind={pad.kind} /> : k}</span>;
}

/** Keyboard or pad: which one the prompts are for right now. */
export function usePadPrompts(): boolean {
  return useDevice(s => s.device === "pad");
}

function usePadGlyphs(k: string, a?: Act) {
  const device = useDevice(s => s.device);
  const kind = useDevice(s => s.kind);
  if (device !== "pad") return null;
  const act = a ?? keyAct(k);
  const gs = act ? PAD_GLYPHS[act] : undefined;
  return gs && gs.length ? { gs, kind } : null;
}

/** Key names as players read them (the hint strings use these spellings). */
const PRETTY: Record<string, string> = { LEFT: "←", RIGHT: "→", UP: "↑", DOWN: "↓", ESCAPE: "ESC", RETURN: "ENTER" };
export const keyLabel = (k: string): string => PRETTY[k.toUpperCase()] ?? k.toUpperCase();
