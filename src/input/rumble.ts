// Pad vibration, light: his shots (a heavier kick for the big guns), hits on him, the landings, a melee
// that connects, a frag going off, a round off #4764's blade and his guard breaking; his hits landing
// (rumbleOfHit: a light tick, a sharp headshot, a firm kill; played by the hit feel, app/HitFeelView.tsx). Dual-rumble through gamepad.vibrationActuator where the browser has
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
    // #4764's blade stops a round: a sharp tick (a shotgun blast knocks, a broken guard jolts)
    case "deflect":
      return !e.first ? null : e.blast ? { strong: 0.35, weak: 0.3, ms: 120 } : { strong: 0.05, weak: 0.3, ms: 40 };
    case "guard":
      return e.what === "break" ? { strong: 0.45, weak: 0.3, ms: 160 } : null;
    default:
      return null;
  }
}

/** A landed hit of his (app/hitfeel.ts groups them; `k` = Hit feedback's strength, 0 = none). */
export { rumbleOfHit } from "../app/hitfeel.ts";

type Actuator ={ playEffect?: (type: string, p: Record<string, number>) => Promise<unknown> };

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
