// Chapter 2's tuning run (Node, no browser): the demo bot plays each chapter 2 room on a few seeds and
// difficulties and reports the clear time (game seconds), the deaths (it retries from the room's last
// checkpoint, like a player), the health it lost, the kills and the set pieces that fired.
//   node tools/ch2bot.ts [room6,room7,...] [seeds=1,2,3] [difficulty=normal]   (CH2_TRIES=6: tries a seed gets;
//   difficulty retardio: RetardioPayne's harder cut, sim/cut.ts)
import fs from "node:fs";
import path from "node:path";
import { readLevel } from "../src/world/level.ts";
import { Game, type Resume } from "../src/sim/game.ts";
import { Bot } from "../src/sim/bot.ts";
import { DT } from "../src/sim/tuning.ts";
import type { Difficulty } from "../src/sim/tuning.ts";

const rooms = (process.argv[2] ?? "room6,room7,room8,room9,room10").split(",");
const seeds = (process.argv[3] ?? "1,2,3").split(",").map(Number);
const diff = (process.argv[4] ?? "normal") as Difficulty;
const MAX_S = Number(process.env.CH2_MAX_S ?? 600);
const TRIES = Number(process.env.CH2_TRIES ?? 6);

export type RunResult = { room: string; seed: number; cleared: boolean; time: number; deaths: number; lost: number; kills: number; total: number; stage: string[]; left: number };

export function runRoom(room: string, seed: number, difficulty: Difficulty = "normal", demo = true): RunResult {
  const file = path.resolve(import.meta.dirname, "..", "public", "levels", `${room}.json`);
  const level = () => readLevel(JSON.parse(fs.readFileSync(file, "utf8")));
  let resume: Resume | undefined;
  let deaths = 0, lost = 0, time = 0;
  const stage = new Set<string>();
  let g!: Game;
  for (let tr = 0; tr < TRIES; tr++) {
    g = new Game(level(), { seed: seed + tr * 101, difficulty, ...(resume ? { resume } : {}) });
    const bot = new Bot(3.5, 0.3, demo);
    // stats carry over a checkpoint resume: count only this try's share
    const t0 = g.stats.time, lost0 = g.stats.damageTaken;
    // (down with the room's last kill in the same moment: the room is clear but he is not walking out,
    // so that counts as a death too)
    const down = () => g.phase === "dead" || (g.player.mode === "dead" && g.player.modeT > 2);
    for (let i = 0; i < MAX_S / DT && g.phase !== "done" && !down(); i++) {
      g.step(bot.next(g));
      for (const e of g.drain()) if (e.type === "stage") stage.add(e.what);
    }
    lost += g.stats.damageTaken - lost0;
    time += g.stats.time - t0;
    if (g.phase === "done") break;
    if (!down()) break; // out of time: no retry
    deaths++;
    resume = g.saved ?? undefined;
  }
  return { room, seed, cleared: g.phase === "done", time, deaths, lost, kills: g.enemies.filter(e => e.state === "dead").length, total: g.enemies.length, stage: [...stage], left: g.alive };
}

if (import.meta.main) {
  for (const room of rooms) for (const seed of seeds) {
    const r = runRoom(room, seed, diff);
    console.log(`${room} seed ${seed} ${diff}: ${r.cleared ? "CLEAR" : `NOT CLEAR (${r.left} left)`} in ${r.time.toFixed(1)} s, deaths ${r.deaths}, health lost ${Math.round(r.lost)}, down ${r.kills}/${r.total}; set pieces: ${r.stage.join(" ")}`);
  }
}
