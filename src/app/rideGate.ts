// Room 4: the car's scissor gates, shared by RideView (draws them) and CameraView (keeps the lens off
// them). Each opening's gate is two lattice halves GATE.inset m inside the door collider's centre line;
// they fold to GATE.stack of their width against the jambs, and are folded away by the time the doors
// leave the world (the camera may then pass through the opening, never through a lattice).
import { makeBox, type Box } from "../sim/world.ts";
import { isStop, type RideSettings } from "../sim/ride.ts";
import { RIDE } from "../sim/tuning.ts";
import type { LevelData } from "../world/level.ts";

export const GATE = { inset: 0.24, stack: 0.1, thick: 0.1 } as const;

const smooth = (k: number) => k * k * (3 - 2 * k);
/** The doors' eased travel at which they leave the world: the gate is folded by then. */
const FOLDED_AT = smooth(RIDE.gap);

/** How far the gate has folded (0 shut .. 1 stacked at the jambs) for the doors' eased travel. */
export function gateFold(ease: number): number {
  return Math.min(1, ease / FOLDED_AT);
}

/** Camera-only boxes for the folded stacks at each opening's jambs (they are there at every stop). */
export function gateStacks(level: LevelData): Box[] {
  const ride = level.room.ride as RideSettings | undefined;
  if (!ride || !Array.isArray(ride.steps)) return [];
  const out: Box[] = [];
  const seen = new Set<string>();
  for (const st of ride.steps) {
    if (!isStop(st)) continue;
    for (const id of st.doors) {
      const b = level.boxes.find(k => k.node === id);
      if (!b || seen.has(id)) continue;
      seen.add(id);
      const alongX = b.hx > b.hz;
      const half = alongX ? b.hx : b.hz;
      const sw = half * GATE.stack; // one folded half
      const inward = -(Math.sign(alongX ? b.cz : b.cx) || 1);
      for (const k of [-1, 1]) {
        const along = k * (half - sw / 2);
        const cx = alongX ? b.cx + along : b.cx + inward * GATE.inset;
        const cz = alongX ? b.cz + inward * GATE.inset : b.cz + along;
        out.push(makeBox(0, `${id}-gate-${k < 0 ? "a" : "b"}`, cx, b.cy, cz, alongX ? sw : GATE.thick, b.hy * 2, alongX ? GATE.thick : sw));
      }
    }
  }
  return out;
}
