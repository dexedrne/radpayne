// One AI step per enemy kind: the goon's cover-and-peek brain, the rusher's charge, the heavy's advance.
import type { Enemy } from "../sim/actors.ts";
import type { Game } from "../sim/game.ts";
import { stepGoon } from "./goon.ts";
import { stepHeavy } from "./heavy.ts";
import { stepRusher } from "./rusher.ts";

export function stepEnemy(g: Game, e: Enemy, dt: number): void {
  if (e.kind === "rusher") stepRusher(g, e, dt);
  else if (e.kind === "heavy") stepHeavy(g, e, dt);
  else stepGoon(g, e, dt);
}
