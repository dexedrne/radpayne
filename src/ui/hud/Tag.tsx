// Tag: an ink block with a pink left bar (room tag, FINAL KILL, DOOR).
export function Tag({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`rp-tag${className ? ` ${className}` : ""}`} style={style}>{children}</div>;
}
