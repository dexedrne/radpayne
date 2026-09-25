// Keyboard / mouse (pointer lock) / gamepad -> one InputFrame per fixed step. The aim (yaw / pitch)
// integrates mouse and right-stick motion in real time, every frame, whatever the time scale. Press
// edges latch until a step consumes them, so a frame with zero steps never loses a press.
import { PITCH_MAX, PITCH_MIN } from "../sim/aim.ts";
import { emptyInput, type InputFrame } from "../sim/types.ts";

/** Radians per mouse pixel at sensitivity 1. */
const MOUSE_K = 0.0022;
/** Gamepad right stick: radians per second at full tilt. */
const PAD_YAW = 3.2;
const PAD_PITCH = 2.2;

export class InputLatch {
  readonly keys = new Set<string>();
  yaw = 0;
  pitch = 0;
  sensitivity = 1;
  invertY = false;
  lmb = false;
  /** Aim-assist slowdown multiplier the game sets while the crosshair is on a target (gamepad only). */
  assist = 1;
  private edges = { bt: false, dodge: false, jump: false, reload: false, copium: false, skip: false, slot: 0 };
  private pad = { lx: 0, ly: 0, fire: false, active: false, start: false, a: false, prev: [] as boolean[] };
  readonly frame: InputFrame = emptyInput();
  /** Any key / button this frame (skips cutscenes and the kill cam). */
  anyPress = false;

  press(code: string): void {
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
    }
  }
  release(code: string): void {
    this.keys.delete(code);
  }
  mouseDown(button: number): void {
    this.anyPress = true;
    this.edges.skip = true;
    if (button === 0) this.lmb = true;
    if (button === 2) this.edges.bt = true;
  }
  mouseUp(button: number): void {
    if (button === 0) this.lmb = false;
  }
  look(dx: number, dy: number): void {
    const k = MOUSE_K * this.sensitivity;
    this.yaw -= dx * k;
    this.pitch -= dy * k * (this.invertY ? -1 : 1);
    this.clampPitch();
  }
  wheel(dy: number): void {
    this.edges.slot = dy > 0 ? 9 : 8; // 8 = previous, 9 = next (the game maps them)
  }
  clear(): void {
    this.keys.clear();
    this.lmb = false;
  }
  private clampPitch(): void {
    this.pitch = this.pitch < PITCH_MIN ? PITCH_MIN : this.pitch > PITCH_MAX ? PITCH_MAX : this.pitch;
  }

  /** Once per rendered frame: gamepad polling and right-stick look (real-time dt). */
  poll(dt: number): void {
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = Array.from(pads ?? []).find(p => p && p.connected) ?? null;
    const pd = this.pad;
    if (!gp) { pd.active = false; pd.lx = pd.ly = 0; pd.fire = false; pd.start = false; pd.a = false; return; }
    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    pd.lx = dz(gp.axes[0] ?? 0);
    pd.ly = dz(gp.axes[1] ?? 0);
    const rx = dz(gp.axes[2] ?? 0), ry = dz(gp.axes[3] ?? 0);
    const now = gp.buttons.map(x => !!x?.pressed);
    const hit = (i: number) => !!now[i] && !pd.prev[i];
    if (Math.abs(rx) + Math.abs(ry) + Math.abs(pd.lx) + Math.abs(pd.ly) > 0 || now.some(Boolean)) pd.active = true;
    // twin stick: right stick aims (cubic curve for fine aim), with the aim-assist slowdown
    const k = this.sensitivity * this.assist * dt;
    this.yaw -= (rx * rx * rx + rx * 0.25) * PAD_YAW * k;
    this.pitch -= (ry * ry * ry + ry * 0.25) * PAD_PITCH * k * (this.invertY ? -1 : 1);
    this.clampPitch();
    // standard mapping: A 0, B 1, X 2, Y 3, LB 4, RB 5, LT 6, RT 7, start 9, L3 10
    pd.fire = !!now[7] || !!now[5];
    if (hit(6)) this.edges.bt = true;
    if (hit(1) || hit(10)) this.edges.dodge = true;
    if (hit(0)) this.edges.jump = true;
    if (hit(2)) this.edges.reload = true;
    if (hit(3)) this.edges.copium = true;
    if (hit(4)) this.edges.slot = 9;
    pd.start = hit(9);
    pd.a = hit(0);
    if ([0, 1, 2, 3, 7, 9].some(hit)) { this.anyPress = true; this.edges.skip = true; }
    pd.prev = now;
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
    const e = this.edges;
    f.bt = e.bt; f.dodge = e.dodge; f.jump = e.jump; f.reload = e.reload; f.copium = e.copium; f.skip = e.skip; f.slot = e.slot;
    e.bt = e.dodge = e.jump = e.reload = e.copium = e.skip = false;
    e.slot = 0;
    return f;
  }

  /** Drop pending edges (e.g. the click that locked the pointer must not fire). */
  flush(): void {
    const e = this.edges;
    e.bt = e.dodge = e.jump = e.reload = e.copium = e.skip = false;
    e.slot = 0;
    this.anyPress = false;
  }
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
