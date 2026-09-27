// Keyboard / mouse (pointer lock) / gamepad -> one InputFrame per fixed step. The aim (yaw / pitch)
// integrates mouse and right-stick motion in real time, every frame, whatever the time scale. Press
// edges latch until a step consumes them, so a frame with zero steps never loses a press. The pad feeds
// the same frame as the keys (a recorded log replays the same whatever played it); its layout is
// pad.ts's: L2 aims (steadier, the aim assist's pull; the scope with the sniper), R2 fires (analog, with
// hysteresis), R1 dives, R3 / L3 bullet time, Cross jumps, Square reloads (or uses what is in reach),
// Triangle throws, Circle strikes, L1 / d-pad left-right change the gun, d-pad up copium, down use.
// #4764's katana: the melee button (F / Circle) held is his guard, a tap the cut (the sim decides which
// from the held level in the frame, `guard`).
import { PITCH_MAX, PITCH_MIN } from "../sim/aim.ts";
import { emptyInput, type InputFrame } from "../sim/types.ts";
import { assistStep, type AssistLevel, type AssistTarget } from "./assist.ts";
import { activePad, noteKbm, notePad } from "./device.ts";
import { BTN, lookCurve, radial, triggerDown, triggerValue } from "./pad.ts";

/** Radians per mouse pixel at sensitivity 1. */
const MOUSE_K = 0.0022;
/** Gamepad right stick: radians per second at full tilt (sensitivity 1). */
const PAD_YAW = 4;
const PAD_PITCH = 2.75;
/** L2 fully pulled: the stick turns this much slower (a steadier aim). */
const AIM_STEADY = 0.4;

export class InputLatch {
  readonly keys = new Set<string>();
  yaw = 0;
  pitch = 0;
  sensitivity = 1;
  invertY = false;
  lmb = false;
  /** The pad's own settings: stick sensitivity, invert Y, the sticks' radial dead zone, the aim assist. */
  padSens = 1;
  padInvertY = false;
  deadZone = 0.12;
  assistLevel: AssistLevel = "normal";
  /** The aim assist's eyes on the game (the session sets it; null: none, e.g. the bot plays). */
  assistQuery: ((yaw: number, pitch: number) => AssistTarget | null) | null = null;
  /** Square uses (not reloads) this frame: something usable is in reach (the session sets it). */
  useHere = false;
  /** The sniper is in hand (the game sets it): right mouse / L2 hold the scope instead of bullet time. */
  zoomMode = false;
  /** Look sensitivity x this (the camera sets the FOV ratio while scoped). */
  fovK = 1;
  rmb = false;
  /** What drove the aim last: the mouse / keys or the pad (the assist is the pad's only). */
  via: "kbm" | "pad" = "kbm";
  private edges = { bt: false, dodge: false, jump: false, reload: false, copium: false, skip: false, slot: 0, melee: false, throw: false, interact: false };
  private pad = { lx: 0, ly: 0, fire: false, l2: 0, active: false, start: false, a: false, circle: false, prev: [] as boolean[], sticks: [0, 0, 0, 0] };
  readonly frame: InputFrame = emptyInput();
  /** Any key / button this frame (skips cutscenes and the kill cam). */
  anyPress = false;
  /** The last assist target (the tests and the probe read it). */
  assistOn: AssistTarget | null = null;

  press(code: string): void {
    this.via = "kbm";
    noteKbm();
    if (this.keys.has(code)) return;
    this.keys.add(code);
    this.anyPress = true;
    this.edges.skip = true;
    switch (code) {
      case "KeyQ": this.edges.bt = true; break;
      case "ShiftLeft": case "ShiftRight": this.edges.dodge = true; break;
      case "Space": this.edges.jump = true; break;
      case "KeyR": this.edges.reload = true; break;
      case "KeyH": this.edges.copium = true; break;
      case "Digit1": this.edges.slot = 1; break;
      case "Digit2": this.edges.slot = 2; break;
      case "Digit3": this.edges.slot = 3; break;
      case "Digit4": this.edges.slot = 4; break;
      case "Digit5": this.edges.slot = 5; break;
      case "KeyF": this.edges.melee = true; break;
      case "KeyG": this.edges.throw = true; break;
      case "KeyE": this.edges.interact = true; break;
    }
  }
  release(code: string): void {
    this.keys.delete(code);
  }
  mouseDown(button: number): void {
    this.via = "kbm";
    noteKbm();
    this.anyPress = true;
    this.edges.skip = true;
    if (button === 0) this.lmb = true;
    if (button === 2) { this.rmb = true; if (!this.zoomMode) this.edges.bt = true; }
  }
  mouseUp(button: number): void {
    if (button === 0) this.lmb = false;
    if (button === 2) this.rmb = false;
  }
  look(dx: number, dy: number): void {
    if (Math.abs(dx) + Math.abs(dy) > 2) this.via = "kbm";
    const k = MOUSE_K * this.sensitivity * this.fovK;
    this.yaw -= dx * k;
    this.pitch -= dy * k * (this.invertY ? -1 : 1);
    this.clampPitch();
  }
  wheel(dy: number): void {
    this.via = "kbm";
    this.edges.slot = dy > 0 ? 9 : 8; // 8 = previous, 9 = next (the game maps them)
  }
  clear(): void {
    this.keys.clear();
    this.lmb = false;
    this.rmb = false;
  }
  private clampPitch(): void {
    this.pitch = this.pitch < PITCH_MIN ? PITCH_MIN : this.pitch > PITCH_MAX ? PITCH_MAX : this.pitch;
  }

  /** Once per rendered frame: gamepad polling, right-stick look and the aim assist (real-time dt). */
  poll(dt: number): void {
    const gp = activePad();
    const pd = this.pad;
    if (!gp) { pd.active = false; pd.lx = pd.ly = 0; pd.fire = false; pd.l2 = 0; pd.start = false; pd.a = false; pd.circle = false; pd.prev = []; pd.sticks = [0, 0, 0, 0]; this.assistOn = null; return; }
    const [lx, ly] = radial(gp.axes[0] ?? 0, gp.axes[1] ?? 0, this.deadZone);
    const [rx, ry] = radial(gp.axes[2] ?? 0, gp.axes[3] ?? 0, this.deadZone);
    pd.lx = lx;
    pd.ly = ly;
    const now = gp.buttons.map(x => !!x?.pressed);
    const hit = (i: number) => !!now[i] && !pd.prev[i];
    // the triggers are analog: R2 fires past a threshold (with hysteresis), L2's pull steadies the aim
    const r2 = triggerValue(gp.buttons[BTN.r2]), l2 = triggerValue(gp.buttons[BTN.l2]);
    const fireWas = pd.fire;
    pd.fire = triggerDown(r2, pd.fire);
    const l2Was = pd.l2 >= 0.3;
    pd.l2 = l2;
    // a stick counts as used on an edge only: pushed out of the dead zone, or moved well away from where it
    // was last noted (a stick that drifts, or rests just past the dead zone, does not keep the pad's glyphs
    // on screen after a key brought the keys back)
    const sticks = stickUse(pd.sticks, lx, ly, rx, ry);
    const used = sticks || now.some((d, i) => d && !pd.prev[i]) || (pd.fire && !fireWas) || (l2 >= 0.3 && !l2Was);
    if (used) { pd.active = true; this.via = "pad"; notePad(gp); }
    // right stick: radial dead zone, the response curve, sensitivity, L2's steadiness, the assist's friction
    const aiming = this.via === "pad" ? Math.max(l2 >= 0.3 ? l2 : 0, pd.fire ? 0.6 : 0) : 0;
    const t = this.via === "pad" && this.assistLevel !== "off" && this.assistQuery ? this.assistQuery(this.yaw, this.pitch) : null;
    this.assistOn = t;
    const a = assistStep(this.assistLevel, t, aiming, dt);
    const m = Math.hypot(rx, ry);
    const c = m > 0 ? lookCurve(m) / m : 0;
    const k = this.padSens * this.fovK * (1 - AIM_STEADY * (l2 >= 0.3 ? l2 : 0)) * a.slow * dt;
    this.yaw -= rx * c * PAD_YAW * k;
    this.pitch -= ry * c * PAD_PITCH * k * (this.padInvertY ? -1 : 1);
    this.yaw += a.dyaw;
    this.pitch += a.dpitch;
    this.clampPitch();
    // the buttons (pad.ts's layout)
    if (hit(BTN.r3) || hit(BTN.l3)) this.edges.bt = true;
    if (hit(BTN.r1)) this.edges.dodge = true;
    if (hit(BTN.cross)) this.edges.jump = true;
    if (hit(BTN.square)) { if (this.useHere) this.edges.interact = true; else this.edges.reload = true; }
    if (hit(BTN.triangle)) this.edges.throw = true;
    if (hit(BTN.circle)) this.edges.melee = true;
    pd.circle = !!now[BTN.circle];
    if (hit(BTN.l1) || hit(BTN.right)) this.edges.slot = 9;
    if (hit(BTN.left)) this.edges.slot = 8;
    if (hit(BTN.up)) this.edges.copium = true;
    if (hit(BTN.down)) this.edges.interact = true;
    pd.start = hit(BTN.options);
    pd.a = hit(BTN.cross);
    // any button skips (the kill cam, the final-kill cam)
    if (now.some((d, i) => d && !pd.prev[i]) || (pd.fire && !fireWas)) { this.anyPress = true; this.edges.skip = true; }
    pd.prev = now;
  }

  /** The pad's L2 pull (0..1). */
  get padAim(): number {
    return this.pad.l2;
  }

  get padActive(): boolean {
    return this.pad.active;
  }
  /** Start pressed this frame (pause). */
  get padStart(): boolean {
    return this.pad.start;
  }
  /** A pressed this frame (the "click to fight" prompt takes it). */
  get padA(): boolean {
    return this.pad.a;
  }

  /** Fill the frame for one fixed step and consume the edges. */
  consume(): InputFrame {
    const f = this.frame;
    const kx = (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) - (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
    const ky = (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) - (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);
    let mx = kx + this.pad.lx, my = ky - this.pad.ly;
    const l = Math.sqrt(mx * mx + my * my);
    if (l > 1) { mx /= l; my /= l; }
    f.moveX = mx;
    f.moveY = my;
    f.yaw = this.yaw;
    f.pitch = this.pitch;
    f.fire = this.lmb || this.pad.fire;
    f.zoom = this.zoomMode && (this.rmb || this.pad.l2 >= 0.3);
    f.guard = this.keys.has("KeyF") || this.pad.circle;
    const e = this.edges;
    f.bt = e.bt; f.dodge = e.dodge; f.jump = e.jump; f.reload = e.reload; f.copium = e.copium; f.skip = e.skip; f.slot = e.slot;
    f.melee = e.melee; f.throw = e.throw; f.interact = e.interact;
    e.bt = e.dodge = e.jump = e.reload = e.copium = e.skip = e.melee = e.throw = e.interact = false;
    e.slot = 0;
    return f;
  }

  /** Drop pending edges (e.g. the click that locked the pointer must not fire). */
  flush(): void {
    const e = this.edges;
    e.bt = e.dodge = e.jump = e.reload = e.copium = e.skip = e.melee = e.throw = e.interact = false;
    e.slot = 0;
    this.anyPress = false;
  }
}

/** Stick use by edges: `ref` holds (lx, ly, rx, ry) as last noted. A stick is used when it leaves its
 *  dead zone (it was at 0) or moves STICK_MOVE away from the noted position; the noted position follows
 *  it then, and resets to 0 once it is back inside the dead zone. Returns whether either stick was used. */
export const STICK_MOVE = 0.35;
export function stickUse(ref: number[], lx: number, ly: number, rx: number, ry: number): boolean {
  let used = false;
  const one = (i: number, x: number, y: number) => {
    if (x === 0 && y === 0) { ref[i] = ref[i + 1] = 0; return; }
    const was = ref[i] !== 0 || ref[i + 1] !== 0;
    if (!was || Math.hypot(x - ref[i], y - ref[i + 1]) >= STICK_MOVE) { ref[i] = x; ref[i + 1] = y; used = true; }
  };
  one(0, lx, ly);
  one(2, rx, ry);
  return used;
}

/** Wire DOM events into a latch. Returns a detach function. */
export function attachDom(latch: InputLatch, el: () => HTMLElement | null, onLockChange?: (locked: boolean) => void): () => void {
  const locked = () => document.pointerLockElement !== null && document.pointerLockElement === el();
  const kd = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) e.preventDefault();
    latch.press(e.code);
  };
  const ku = (e: KeyboardEvent) => latch.release(e.code);
  const md = (e: MouseEvent) => { if (locked()) latch.mouseDown(e.button); };
  const mu = (e: MouseEvent) => latch.mouseUp(e.button);
  const mm = (e: MouseEvent) => { if (locked()) latch.look(e.movementX, e.movementY); };
  const wh = (e: WheelEvent) => { if (locked() && Math.abs(e.deltaY) > 1) latch.wheel(e.deltaY); };
  const blur = () => latch.clear();
  const lock = () => {
    const l = locked();
    if (!l) latch.clear();
    onLockChange?.(l);
  };
  const ctx = (e: Event) => e.preventDefault();
  addEventListener("keydown", kd);
  addEventListener("keyup", ku);
  addEventListener("mousedown", md);
  addEventListener("mouseup", mu);
  addEventListener("mousemove", mm);
  addEventListener("wheel", wh, { passive: true });
  addEventListener("blur", blur);
  addEventListener("contextmenu", ctx);
  document.addEventListener("pointerlockchange", lock);
  return () => {
    removeEventListener("keydown", kd);
    removeEventListener("keyup", ku);
    removeEventListener("mousedown", md);
    removeEventListener("mouseup", mu);
    removeEventListener("mousemove", mm);
    removeEventListener("wheel", wh);
    removeEventListener("blur", blur);
    removeEventListener("contextmenu", ctx);
    document.removeEventListener("pointerlockchange", lock);
  };
}
