// Pad vibration, light: his shots (a heavier kick for the big guns), hits on him, the landings, a melee
// that connects, a frag going off. Dual-rumble through gamepad.vibrationActuator where the browser has
// it; nothing where it does not. The page plays it only with Vibration on and the pad in use.
import { PLAYER_ID, type GameEvent } from "../sim/types.ts";

export type Rumble = { strong: number; weak: number; ms: number };

const HEAVY_GUNS = new Set(["shotgun", "sawedoff", "handcannon", "sniper", "rifle", "ak"]);

/** The rumble for one game event (null: none). */
export function rumbleOf(e: GameEvent): Rumble | null {
  switch (e.type) {
    case "shot":
      if (e.shooter !== PLAYER_ID || e.pellet !== 0) return null;
      return HEAVY_GUNS.has(e.weapon) ? { strong: 0.35, weak: 0.3, ms: 90 } : { strong: 0.06, weak: 0.22, ms: 45 };
    case "hurt": {
      if (e.target !== PLAYER_ID) return null;
      const k = Math.min(1, e.amount / 40);
      return { strong: 0.25 + 0.4 * k, weak: 0.2 + 0.2 * k, ms: Math.round(110 + 90 * k) };
    }
    case "land":
      return e.prone ? { strong: 0.3, weak: 0.25, ms: 110 } : { strong: 0.12, weak: 0.2, ms: 70 };
    case "melee":
      return e.phase === "hit" && e.hits > 0 ? { strong: 0.2, weak: 0.35, ms: 80 } : null;
    case "explode":
      return { strong: 0.4, weak: 0.3, ms: 200 };
    default:
      return null;
  }
}

type Actuator = { playEffect?: (type: string, p: Record<string, number>) => Promise<unknown> };

/** Play it on this pad (no-op without a dual-rumble actuator). */
export function playRumble(gp: Gamepad | null, r: Rumble): void {
  try {
    const a = (gp as unknown as { vibrationActuator?: Actuator } | null)?.vibrationActuator;
    if (!a?.playEffect) return;
    void a.playEffect("dual-rumble", { startDelay: 0, duration: r.ms, strongMagnitude: r.strong, weakMagnitude: r.weak }).catch(() => undefined);
  } catch {
    /* no vibration here */
  }
}
