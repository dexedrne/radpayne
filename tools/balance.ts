// Balance runs: the test bot plays rooms 1-5 on each difficulty with a few seeds and prints what it cost
// him: deaths (a death retries from the last checkpoint with the next seed, up to 4 retries), health lost,
// copium used, the time in the room, and for the elevator the spawn-kill rate (hostiles killed within
// 1.5 s real of stepping into the fight).
//   node tools/balance.ts [--rooms room1,room4] [--diffs normal,hard] [--seeds 1,2,3] [--bot cover|plain] [--json out.json]
import fs from "node:fs";
import path from "node:path";
import { readLevel, type LevelData } from "../src/world/level.ts";
import { Game, type Resume } from "../src/sim/game.ts";
import { Bot } from "../src/sim/bot.ts";
import { DT } from "../src/sim/tuning.ts";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const rooms = arg("rooms", "room1,room2,room3,room4,room5").split(",");
const diffs = arg("diffs", "normal").split(",");
const seeds = arg("seeds", "1,2,3").split(",").map(Number);
const botKind = arg("bot", "cover");
const out = arg("json", "");
const RETRIES = 4;
const SPAWN_KILL = 1.5;

const levels = new Map<string, LevelData>();
const load = (r: string) => {
  if (!levels.has(r)) levels.set(r, readLevel(JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "..", "public", "levels", `${r}.json`), "utf8"))));
  return levels.get(r)!;
};

type Row = { room: string; diff: string; seed: number; cleared: boolean; deaths: number; hpLost: number; copium: number; time: number; kills: number; spawnKills: number; appeared: number; coverT: number };
const rows: Row[] = [];
for (const room of rooms) for (const diff of diffs) for (const seed of seeds) {
  const row: Row = { room, diff, seed, cleared: false, deaths: 0, hpLost: 0, copium: 0, time: 0, kills: 0, spawnKills: 0, appeared: 0, coverT: 0 };
  let resume: Resume | undefined;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const g = new Game(load(room), { seed: seed + attempt * 1000, difficulty: diff as never, ...(resume ? { resume } : {}) });
    const bot = new Bot();
    if (botKind === "plain") (bot as unknown as { cover: boolean }).cover = false;
    const seen: number[] = g.enemies.map(e => (e.state === "inactive" ? -1 : 0));
    const statsAt = resume ? { ...resume.stats } : null;
    for (let i = 0; i < 600 / DT && g.phase !== "done" && g.phase !== "dead"; i++) {
      g.step(bot.next(g));
      g.drain();
      if ((g.player as unknown as { cover?: number }).cover !== undefined && (g.player as unknown as { cover: number }).cover >= 0) row.coverT += DT;
      for (const e of g.enemies) {
        if (seen[e.idx] < 0 && e.state !== "inactive") { seen[e.idx] = g.realTime; row.appeared++; }
        if (seen[e.idx] > 0 && e.state === "dead") { if (g.realTime - seen[e.idx] <= SPAWN_KILL) row.spawnKills++; seen[e.idx] = 0; }
      }
    }
    // stats carry over a checkpoint resume: count only this attempt's share
    const s = g.stats;
    row.hpLost += s.damageTaken - (statsAt?.damageTaken ?? 0);
    row.copium += s.copiumUsed - (statsAt?.copiumUsed ?? 0);
    row.time += s.time - (statsAt?.time ?? 0);
    row.kills += s.kills - (statsAt?.kills ?? 0);
    if (g.phase === "done") { row.cleared = true; break; }
    row.deaths++;
    resume = g.saved ?? undefined;
  }
  rows.push(row);
  console.log(`${room} ${diff.padEnd(8)} seed ${seed}: ${row.cleared ? "clear" : "FAIL "} deaths ${row.deaths} hp lost ${row.hpLost.toFixed(0).padStart(4)} copium ${row.copium} time ${row.time.toFixed(0).padStart(4)} s kills ${row.kills}${row.appeared ? ` spawn-kills ${row.spawnKills}/${row.appeared}` : ""}${row.coverT ? ` cover ${row.coverT.toFixed(0)} s` : ""}`);
}
// summary per room and difficulty
console.log("\nroom    diff      clears deaths  hp lost  copium  time  spawn-kill");
for (const room of rooms) for (const diff of diffs) {
  const r = rows.filter(x => x.room === room && x.diff === diff);
  const avg = (f: (x: Row) => number) => r.reduce((s, x) => s + f(x), 0) / r.length;
  const app = r.reduce((s, x) => s + x.appeared, 0), sk = r.reduce((s, x) => s + x.spawnKills, 0);
  console.log(`${room.padEnd(7)} ${diff.padEnd(9)} ${`${r.filter(x => x.cleared).length}/${r.length}`.padStart(6)} ${avg(x => x.deaths).toFixed(1).padStart(6)} ${avg(x => x.hpLost).toFixed(0).padStart(8)} ${avg(x => x.copium).toFixed(1).padStart(7)} ${avg(x => x.time).toFixed(0).padStart(5)}  ${app ? `${((100 * sk) / app).toFixed(0)} % (${sk}/${app})` : "-"}`);
}
if (out) fs.writeFileSync(out, JSON.stringify(rows, null, 1));
