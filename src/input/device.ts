import { getPads, isPhone } from '../phone.ts';
// The last-used device decides the prompts: a pad button or a stick push shows that pad's glyphs
// (PlayStation for a Sony pad, else Xbox), a key, a click or a real mouse move goes back to the keys.
// Also which pad is "the" pad: the one last used (a DualSense on Linux can list its motion sensors as a
// second device; a standard-mapping pad is always preferred). The watcher (started once by main.tsx)
// polls the pads every frame for this and listens for hot-plug; the game's and the menus' own polls
// read activePad().
import { create } from "zustand";
import { padKind, readPad, type PadKind } from "./pad.ts";

export type Device = "kbm" | "pad";
type DeviceState = { device: Device; kind: PadKind; id: string; connected: boolean };

export const useDevice = create<DeviceState>(() => ({ device: "kbm", kind: "xbox", id: "", connected: false }));

let activeIndex = -1;

function listPads(): Gamepad[] {
  try {
    const pads = getPads();
    return Array.from(pads ?? []).filter((p): p is Gamepad => !!p && p.connected);
  } catch {
    return [];
  }
}

/** The pad to read: the last one used, else the first standard-mapping one, else the first. */
export function activePad(): Gamepad | null {
  const pads = listPads();
  if (!pads.length) return null;
  const std = pads.filter(p => p.mapping === "standard");
  const pool = std.length ? std : pads;
  return pool.find(p => p.index === activeIndex) ?? pool[0];
}

/** A pad was used (a press, a stick pushed): its glyphs from now on. */
export function notePad(gp: Gamepad): void {
  activeIndex = gp.index;
  const kind = padKind(gp.id);
  const s = useDevice.getState();
  if (s.device !== "pad" || s.kind !== kind || s.id !== gp.id || !s.connected) useDevice.setState({ device: "pad", kind, id: gp.id, connected: true });
}

/** A key, a click or the mouse: the keys' prompts. */
export function noteKbm(): void {
  if (useDevice.getState().device !== "kbm") useDevice.setState({ device: "kbm" });
}

/** Whether this pad state is someone using it (a button down, a trigger pulled by its value, a stick well
 *  off centre; read in the standard layout, pad.ts readPad). */
export function padBusy(gp: Gamepad, stick = 0.5): boolean {
  const r = readPad(gp);
  if (r.pressed.some(Boolean)) return true;
  for (const a of r.axes) if (Math.abs(a) > stick) return true;
  return false;
}

let watching = false;

/** Start the page's device watcher (idempotent). Returns a stop function. */
export function watchDevices(): () => void {
  if (watching || typeof window === "undefined") return () => undefined;
  watching = true;
  // a use is a press or a push that starts (a browser often lists a pad only from its first press: that
  // press counts)
  const held = new Map<number, boolean>();
  let raf = 0;
  const poll = () => {
    raf = requestAnimationFrame(poll);
    const pads = listPads();
    const connected = pads.length > 0;
    if (connected !== useDevice.getState().connected) useDevice.setState({ connected, ...(connected ? {} : { device: "kbm" as Device }) });
    if (connected && isPhone() && !useDevice.getState().id) notePad(activePad()!);
    for (const p of pads) {
      if (p.mapping !== "standard" && pads.some(q => q.mapping === "standard")) continue;
      const busy = padBusy(p);
      if (busy && held.get(p.index) !== true) notePad(p);
      held.set(p.index, busy);
    }
  };
  let moved = 0;
  const key = (e: KeyboardEvent) => { if (!e.repeat) noteKbm(); };
  const click = () => noteKbm();
  const move = (e: MouseEvent) => {
    // a real move, not a nudge of the desk
    moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    if (moved > 24) { moved = 0; noteKbm(); }
  };
  const settle = setInterval(() => { moved = 0; }, 500);
  const plug = () => {
    const pads = listPads();
    if (!pads.length) { activeIndex = -1; useDevice.setState({ connected: false, device: "kbm" }); }
    else if (isPhone()) notePad(activePad()!);
    else useDevice.setState({ connected: true });
  };
  addEventListener("keydown", key, true);
  addEventListener("mousedown", click, true);
  addEventListener("mousemove", move, true);
  addEventListener("wheel", click, { capture: true, passive: true });
  addEventListener("gamepadconnected", plug);
  addEventListener("gamepaddisconnected", plug);
  raf = requestAnimationFrame(poll);
  return () => {
    watching = false;
    cancelAnimationFrame(raf);
    clearInterval(settle);
    removeEventListener("keydown", key, true);
    removeEventListener("mousedown", click, true);
    removeEventListener("mousemove", move, true);
    removeEventListener("wheel", click, true);
    removeEventListener("gamepadconnected", plug);
    removeEventListener("gamepaddisconnected", plug);
  };
}

/** Test helper: forget the last-used pad. */
export function resetDevices(): void {
  activeIndex = -1;
  useDevice.setState({ device: "kbm", kind: "xbox", id: "", connected: false });
}
