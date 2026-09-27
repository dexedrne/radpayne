// One AI step per enemy kind: the goon's cover-and-peek brain, the rusher's charge, the heavy's advance,
// Madame Pockit's (round 3).
import type { Enemy } from "../sim/actors.ts";
import type { Game } from "../sim/game.ts";
import { stepGoon } from "./goon.ts";
import { stepHeavy } from "./heavy.ts";
import { stepRusher } from "./rusher.ts";
import { stepMadame } from "./madame.ts";
import { stepFlee } from "../sim/boss.ts";

export function stepEnemy(g: Game, e: Enemy, dt: number): void {
  if (e.state === "flee") stepFlee(g, e, dt); // round 3: an add running once the boss is down
  else if (e.kind === "madame") stepMadame(g, e, dt);
  else if (e.kind === "rusher") stepRusher(g, e, dt);
  else if (e.kind === "heavy") stepHeavy(g, e, dt);
  else stepGoon(g, e, dt);
}
