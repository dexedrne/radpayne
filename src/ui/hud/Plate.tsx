// Plate: the main building block. Ink fill, paper keyline (reads over black), ink outline (reads over
// bloom), a hard shadow. No blur, no glow.
import { forwardRef } from "react";

export const Plate = forwardRef<HTMLDivElement, { children?: React.ReactNode; className?: string; style?: React.CSSProperties }>(
  function Plate({ children, className, style }, ref) {
    return <div ref={ref} className={`rp-panel${className ? ` ${className}` : ""}`} style={style}>{children}</div>;
  },
);
