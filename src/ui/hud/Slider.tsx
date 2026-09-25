// Slider: an 8px track with a sand fill, a paper knob, the value in Bebas on the right. Drag or click;
// the focused settings row also steps it with ←→.
import { useRef } from "react";

export function Slider({ value, min, max, step, onChange, format }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  const track = useRef<HTMLDivElement>(null);
  const f = (value - min) / (max - min);
  const set = (clientX: number) => {
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
    const v = Math.round((min + t * (max - min)) / step) * step;
    onChange(Number(Math.max(min, Math.min(max, v)).toFixed(4)));
  };
  return (
    <div className="rp-slider">
      <div
        ref={track}
        className="track"
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={e => { e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); set(e.clientX); }}
        onPointerMove={e => { if (e.buttons & 1) set(e.clientX); }}
      >
        <div className="fill" style={{ width: `${f * 100}%` }} />
        <div className="knob" style={{ left: `${f * 100}%` }} />
      </div>
      <span className="val">{format(value)}</span>
    </div>
  );
}
