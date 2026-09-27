// Dev hold check (arsenal spec 1.7): ?holdcheck=<any weapon id>&radbro=<id> starts the room
// with that gun in hand, no gang, no crowd, and drives the player from a script instead of the input
// (stand, walk, back-pedal, strafe, run, fire, reload, turns, aim up / down, jump, dive -> prone ->
// get-up, dive into a roll). PlayerView measures the hold every frame into `holdDev.stats[state]`:
//   grip  - the right hand's gun against where the hold wants it (m)
//   left  - the left palm's distance to the gun's rail (m; the authored parts of a reload are exempt)
//   bend  - hand against forearm, from the bind pose (rad)
//   flips - frames with an elbow on the wrong side of its pole
// `holdDev.view` swaps the camera for a close-up (side / right / front / back), `holdDev.mask` draws the
// gun flat magenta (tools/holdcheck.ts counts its visible pixels inside `holdDev.box`, the gun's screen
// box). Window hook: window.__holdcheck. Development builds only.
import type { Game } from "../../sim/game.ts";
import { emptyInput, type InputFrame } from "../../sim/types.ts";
import { WEAPONS, type WeaponId } from "../../combat/weapons.ts";
import type { Session } from "../session.ts";
import { DT } from "../../sim/tuning.ts";

const DEV = import.meta.env.MODE !== "production";
const params = new URLSearchParams(location.search);
const HC = DEV ? params.get("holdcheck") : null;
export const HOLDCHECK: WeaponId | null = HC && HC in WEAPONS ? (HC as WeaponId) : null;

export type HoldStats = { frames: number; grip: number; left: number; bend: number; flips: number; reach: number; slide: number; shift: number };
export type HoldView = "game" | "side" | "right" | "front" | "back";

export const HOLD_STATES = ["idle", "aim-up", "aim-down", "turn", "walk", "back", "strafe-l", "strafe-r", "run", "fire", "bt", "reload", "jump", "dive", "prone", "getup", "roll", "swap"] as const;
export type HoldState = (typeof HOLD_STATES)[number];

export const holdDev = {
  on: HOLDCHECK !== null,
  weapon: HOLDCHECK,
  state: "idle" as HoldState,
  /** Steps since the state was set. */
  t: 0,
  /** Pause the session after this many steps in the state (-1 = never). */
  freezeAt: -1,
  frozen: false,
  view: "game" as HoldView,
  mask: false,
  /** Screen box of the shown gun (px, 1280x720 space of the canvas) and the muzzle's screen point. */
  box: [0, 0, 0, 0] as [number, number, number, number],
  muzzle: [0, 0] as [number, number],
  muzzleOnScreen: false,
  /** Worst values per state, and the last frame's. */
  stats: {} as Record<string, HoldStats>,
  last: { grip: 0, left: 0, bend: 0, flip: false, reach: 0, slide: 0, shift: 0, exempt: false, ik: 0, ready: 0, long: 0 },
  session: null as Session | null,
  /** Live overrides for tuning in the browser (e.g. { ready: 0 }). */
  tweak: {} as Record<string, number>,
  baseYaw: 0,
  set(state: HoldState, freezeAfterS = -1) {
    this.state = state;
    this.t = 0;
    this.freezeAt = freezeAfterS >= 0 ? Math.round(freezeAfterS / DT) : -1;
    this.frozen = false;
    if (this.session) this.session.paused = false;
  },
  /** Where he started (the tool puts him back there before each state: clear of walls for the close-ups). */
  homeAt: null as { x: number; y: number; z: number } | null,
  home() {
    const p = this.session?.game.player;
    if (!p || !this.homeAt) return;
    p.x = this.homeAt.x; p.y = this.homeAt.y; p.z = this.homeAt.z;
    p.vx = 0; p.vy = 0; p.vz = 0;
  },
  unfreeze() {
    this.frozen = false;
    this.freezeAt = -1;
    if (this.session) this.session.paused = false;
  },
  reset() {
    this.stats = {};
  },
  /** Per-frame log while set (debugging a state). */
  trace: null as unknown[] | null,
  record(m: { grip: number; left: number; bend: number; flip: boolean; reach: number; slide: number; shift: number; exempt: boolean }) {
    if (this.trace) this.trace.push({ t: this.t, mode: this.session?.game.player.mode, ...m, ...this.last });
    const s = (this.stats[this.state] ??= { frames: 0, grip: 0, left: 0, bend: 0, flips: 0, reach: 0, slide: 0, shift: 0 });
    s.frames++;
    // the grip counts once the IK is fully in (a swap blends it in from the swap clip's hands)
    if (this.last.ik > 0.99) s.grip = Math.max(s.grip, m.grip);
    if (!m.exempt) s.left = Math.max(s.left, m.left);
    s.bend = Math.max(s.bend, m.bend);
    if (m.flip) s.flips++;
    s.reach = Math.max(s.reach, m.reach);
    s.slide = Math.max(s.slide, m.slide);
    s.shift = Math.max(s.shift, m.shift);
  },
};

if (holdDev.on) (window as unknown as { __holdcheck?: typeof holdDev }).__holdcheck = holdDev;

/** The scripted player: one input pattern per state. */
export class HoldScript {
  next(g: Game): InputFrame {
    const f = emptyInput();
    const h = holdDev;
    const t = h.t++;
    if (h.freezeAt >= 0 && t >= h.freezeAt && h.session && !h.frozen) {
      h.frozen = true;
      h.session.paused = true;
    }
    const base = h.baseYaw;
    f.yaw = base;
    f.pitch = 0;
    const p = g.player;
    switch (h.state) {
      case "idle": f.jump = p.mode === "prone" && t % 30 === 5; break;
      case "aim-up": f.pitch = 0.7; break;
      case "aim-down": f.pitch = -0.7; break;
      case "turn": f.yaw = base + Math.min(1, t / 60) * (Math.PI / 2); break;
      case "walk": f.moveY = 0.2; break;
      case "back": f.moveY = -0.2; break;
      case "strafe-l": f.moveX = -0.2; break;
      case "strafe-r": f.moveX = 0.2; break;
      case "run": f.moveY = 1; break;
      case "fire": f.fire = t % 60 < 3; break;
      // bullet time on (shouldered by it), one shot in it
      case "bt": f.bt = t === 1 && !g.bulletTime; f.fire = t >= 20 && t < 23; break;
      case "reload":
        if (t === 0) p.weapon.mags[0] = Math.min(p.weapon.mags[0], 1);
        f.reload = t === 1;
        break;
      case "jump": f.jump = t === 1; break;
      case "dive": f.dodge = t === 1; break;
      case "prone": f.dodge = t === 1 && p.mode === "normal"; break;
      case "getup": f.jump = p.mode === "prone" && t > 2; break;
      case "roll": f.moveY = t < 150 ? 1 : 0; f.dodge = t === 30; break;
      // to the next owned gun and back to the one being checked (the AK shares slot 1 with the pistols)
      case "swap": f.slot = t === 1 ? 9 : t === 90 ? 8 : 0; break;
    }
    // bullet time off again in every other state
    if (h.state !== "bt" && t === 1 && g.bulletTime) f.bt = true;
    // keep the mag topped up between states (a reload state starts from a partly spent mag)
    if (h.state !== "reload" && h.state !== "fire" && p.weapon.reloadT <= 0) {
      p.weapon.mags[0] = Math.max(p.weapon.mags[0], 2);
      p.weapon.mags[1] = Math.max(p.weapon.mags[1], 2);
    }
    return f;
  }
}
