// Menu input: keyboard (arrows, Enter / Space, Esc, Tab / Shift+Tab) and gamepad (D-pad, A, B,
// LB / RB, Start) turned into menu actions. Keys are taken in the capture phase so the page's own
// Esc handler (pause while playing) never sees a key a menu used.
import { useEffect, useRef } from "react";

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
    // gamepad: edges on the buttons, the left stick as a D-pad with repeat
    let raf = 0;
    const prev: boolean[] = [];
    let stickDir = "", stickNext = 0;
    const poll = () => {
      raf = requestAnimationFrame(poll);
      const pads = navigator.getGamepads?.() ?? [];
      const p = [...pads].find(x => x && x.connected);
      if (!p) return;
      for (const [b, a] of PAD) {
        const down = !!p.buttons[b]?.pressed;
        if (down && !prev[b]) cb.current(a);
        prev[b] = down;
      }
      const x = p.axes[0] ?? 0, y = p.axes[1] ?? 0;
      const dir = Math.abs(y) > 0.6 ? (y < 0 ? "up" : "down") : Math.abs(x) > 0.6 ? (x < 0 ? "left" : "right") : "";
      const t = performance.now();
      if (dir && (dir !== stickDir || t >= stickNext)) { cb.current(dir as MenuAction); stickNext = t + (dir !== stickDir ? 380 : 140); }
      stickDir = dir;
    };
    // the pad that opened the menu (Start) must be released first
    const first = [...(navigator.getGamepads?.() ?? [])].find(x => x && x.connected);
    if (first) for (const [b] of PAD) prev[b] = !!first.buttons[b]?.pressed;
    raf = requestAnimationFrame(poll);
    return () => { removeEventListener("keydown", kd, true); cancelAnimationFrame(raf); };
  }, [enabled]);
}
