// The two thumbs on a touch screen: a left stick moves, a drag on the right half aims, and the buttons
// down both sides play the rest (fire, aim, jump, reload, bullet time, the shootdodge, cover, the katana
// cut/guard, the frag, use, copium, the gun). Multi-touch: every pointer has its own job, so moving,
// aiming and firing are three at
// once. The buttons sit at least 44 px square, clear of the safe-area insets (the notch, the island, the
// home indicator), and never under the HUD's own corners: the HUD rises while these are up (tokens.css).
import { useEffect, useRef } from "react";
import type { InputLatch, TouchButton } from "../input/input.ts";
import { radial } from "../input/pad.ts";
import "./hud/touch.css";

const HOLD: TouchButton[] = ["fire", "aim", "melee", "nade"];
const TAP: Array<[TouchButton, string]> = [
  ["reload", "RELOAD"], ["bt", "SLOW"], ["melee", "CUT"], ["dodge", "DODGE"], ["cover", "COVER"],
  ["nade", "FRAG"], ["interact", "USE"], ["copium", "HEAL"], ["prev", "◀"], ["next", "▶"],
];

export function TouchControls({ input, onPause }: { input: InputLatch; onPause: () => void }) {
  const stick = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const stickId = useRef(-1);
  const lookId = useRef(-1);
  const lookAt = useRef({ x: 0, y: 0 });

  useEffect(() => () => {
    input.touchMove(0, 0);
    for (const b of HOLD) input.touchUp(b);
  }, [input]);

  const setStick = (e: React.PointerEvent) => {
    const el = stick.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const max = r.width / 2 - 6;
    const m = Math.hypot(dx, dy);
    if (m > max) { dx = (dx / m) * max; dy = (dy / m) * max; }
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
    const [x, y] = radial(dx / max, dy / max, 0.14);
    input.touchMove(x, y);
  };
  const endStick = () => {
    stickId.current = -1;
    if (knob.current) knob.current.style.transform = "translate(0px, 0px)";
    input.touchMove(0, 0);
  };

  const btn = (b: TouchButton) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault(); e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      input.touchDown(b);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault(); e.stopPropagation();
      input.touchUp(b);
    },
    onPointerCancel: () => input.touchUp(b),
    onLostPointerCapture: () => input.touchUp(b),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div className="rp-touch" data-testid="touch-controls" aria-hidden={false}>
      <div
        className="rp-touch-look"
        data-testid="touch-look"
        onPointerDown={e => {
          if (lookId.current >= 0) return;
          lookId.current = e.pointerId;
          lookAt.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture?.(e.pointerId);
          e.preventDefault();
        }}
        onPointerMove={e => {
          if (e.pointerId !== lookId.current) return;
          const dx = e.clientX - lookAt.current.x, dy = e.clientY - lookAt.current.y;
          lookAt.current = { x: e.clientX, y: e.clientY };
          input.touchLook(dx, dy);
        }}
        onPointerUp={e => { if (e.pointerId === lookId.current) lookId.current = -1; }}
        onPointerCancel={e => { if (e.pointerId === lookId.current) lookId.current = -1; }}
      />
      <div
        ref={stick}
        className="rp-stick"
        data-testid="touch-stick"
        onPointerDown={e => {
          if (stickId.current >= 0) return;
          stickId.current = e.pointerId;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          e.preventDefault();
          setStick(e);
        }}
        onPointerMove={e => { if (e.pointerId === stickId.current) setStick(e); }}
        onPointerUp={e => { if (e.pointerId === stickId.current) endStick(); }}
        onPointerCancel={e => { if (e.pointerId === stickId.current) endStick(); }}
      >
        <div ref={knob} className="rp-stick-knob" />
      </div>

      <div className="rp-thumb">
        <button type="button" className="rp-tbtn fire" aria-label="Fire" data-act="fire" {...btn("fire")}>FIRE</button>
        <button type="button" className="rp-tbtn aim" aria-label="Aim" data-act="aim" {...btn("aim")}>AIM</button>
        <button type="button" className="rp-tbtn jump" aria-label="Jump" data-act="jump" {...btn("jump")}>JUMP</button>
        <div className="rp-tools">
          {TAP.map(([b, label]) => (
            <button key={b} type="button" className={`rp-tbtn tool ${b}`} aria-label={b} data-act={b} {...btn(b)}>{label}</button>
          ))}
        </div>
      </div>

      <button type="button" className="rp-tbtn pause" aria-label="Pause" data-act="pause" onPointerDown={e => { e.preventDefault(); e.stopPropagation(); onPause(); }}>II</button>
    </div>
  );
}
