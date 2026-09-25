// Menu input: keyboard (arrows, Enter / Space, Esc, Tab / Shift+Tab) and gamepad (D-pad, A, B,
// LB / RB, Start) turned into menu actions. Keys are taken in the capture phase so the page's own
// Esc handler (pause while playing) never sees a key a menu used.
import { useEffect, useRef, useState } from "react";

export type MenuAction = "up" | "down" | "left" | "right" | "enter" | "back" | "tabNext" | "tabPrev";

const KEYS: Record<string, MenuAction> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  Enter: "enter", NumpadEnter: "enter", Space: "enter", Escape: "back",
};
// standard mapping: 0 A, 1 B, 4 LB, 5 RB, 9 Start, 12-15 D-pad
const PAD: Array<[number, MenuAction]> = [[12, "up"], [13, "down"], [14, "left"], [15, "right"], [0, "enter"], [1, "back"], [9, "back"], [4, "tabPrev"], [5, "tabNext"]];

/** Calls `on(action)`; return false from it to let the key through. */
export function useMenuInput(on: (a: MenuAction, e?: KeyboardEvent) => boolean | void, enabled = true): void {
  const cb = useRef(on);
  cb.current = on;
  useEffect(() => {
    if (!enabled) return;
    const kd = (e: KeyboardEvent) => {
      const a: MenuAction | undefined = e.code === "Tab" ? (e.shiftKey ? "tabPrev" : "tabNext") : KEYS[e.code];
      if (!a) return;
      if (e.repeat && (a === "enter" || a === "back")) return;
      const used = cb.current(a, e);
      if (used === false) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    addEventListener("keydown", kd, true);
    return () => removeEventListener("keydown", kd, true);
  }, [enabled]);
  usePadInput(a => { cb.current(a); }, { enabled });
}

/**
 * Gamepad only: edges on the buttons (`buttons`: [index, action], the standard mapping by default:
 * D-pad, A enter, B / Start back, LB / RB tabs) and, with `stick`, the left stick as a D-pad with
 * repeat. A button held when the hook starts (the press that opened this screen) must be released
 * first.
 */
export function usePadInput(on: (a: MenuAction) => void, opts: { enabled?: boolean; buttons?: ReadonlyArray<readonly [number, MenuAction]>; stick?: boolean } = {}): void {
  const cb = useRef(on);
  cb.current = on;
  const { enabled = true, buttons = PAD, stick = true } = opts;
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const prev: boolean[] = [];
    let stickDir = "", stickNext = 0;
    const poll = () => {
      raf = requestAnimationFrame(poll);
      const p = firstPad();
      if (!p) return;
      for (const [b, a] of buttons) {
        const down = !!p.buttons[b]?.pressed;
        if (down && !prev[b]) cb.current(a);
        prev[b] = down;
      }
      if (!stick) return;
      const x = p.axes[0] ?? 0, y = p.axes[1] ?? 0;
      const dir = Math.abs(y) > 0.6 ? (y < 0 ? "up" : "down") : Math.abs(x) > 0.6 ? (x < 0 ? "left" : "right") : "";
      const t = performance.now();
      if (dir && (dir !== stickDir || t >= stickNext)) { cb.current(dir as MenuAction); stickNext = t + (dir !== stickDir ? 380 : 140); }
      stickDir = dir;
    };
    const first = firstPad();
    if (first) for (const [b] of buttons) prev[b] = !!first.buttons[b]?.pressed;
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
    // the button map is a module constant at every call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, stick]);
}

function firstPad(): Gamepad | null {
  const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() ?? [] : [];
  return [...pads].find(x => x && x.connected) ?? null;
}

/** Whether a gamepad is plugged in (for showing its buttons in hints). */
export function usePadConnected(): boolean {
  const [on, setOn] = useState(() => !!firstPad());
  useEffect(() => {
    const f = () => setOn(!!firstPad());
    addEventListener("gamepadconnected", f);
    addEventListener("gamepaddisconnected", f);
    // some browsers only list a pad after its first button press: look again now and then
    const t = setInterval(f, 1000);
    return () => { removeEventListener("gamepadconnected", f); removeEventListener("gamepaddisconnected", f); clearInterval(t); };
  }, []);
  return on;
}
