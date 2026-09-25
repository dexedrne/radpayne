// Keycap: a paper block with ink text and a key lip. Used wherever a key is named.
export function Keycap({ k, className, style }: { k: string; className?: string; style?: React.CSSProperties }) {
  return <span className={`rp-key${className ? ` ${className}` : ""}`} style={style}>{k}</span>;
}

/** Key names as players read them (the hint strings use these spellings). */
const PRETTY: Record<string, string> = { LEFT: "←", RIGHT: "→", UP: "↑", DOWN: "↓", ESCAPE: "ESC", RETURN: "ENTER" };
export const keyLabel = (k: string): string => PRETTY[k.toUpperCase()] ?? k.toUpperCase();
