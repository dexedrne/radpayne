// Voice chatter count (Node, no browser): the bot fights rooms 1-5 in order (seeds 1-3) with the voice
// director on a fake clock and fake voices (fixed line lengths), and this prints the lines per fight
// minute by speaker, rooms 1-3 apart (a director from before rooms 4-5 compares like for like there).
// Deterministic (the director's dice are seeded here). The browser smoke prints the same count from
// the real voices. No browser storage here: every "first time ever" line counts as the first time.
//   node tools/chatter.ts [normal|less|off] [rooms, e.g. room1,room2,room3]
import fs from "node:fs";
import path from "node:path";
import { readLevel } from "../src/world/level.ts";
import { Session } from "../src/app/session.ts";
import { Director, type DirectorIO } from "../src/app/director.ts";
import { Bot } from "../src/sim/bot.ts";
import { useUi } from "../src/ui/store.ts";

const mode = process.argv[2] ?? "normal";
useUi.setState({ chatter: mode === "less" || mode === "off" ? mode : "normal" });

// seeded dice for the director's chances (and the crowd's picks)
let seed = 12345;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Line lengths (s) close to the real files. */
const LEN = { narrate: 3.6, pa: 2.0, heavy: 1.1, bark: 0.9, radbro: 0.7, crowd: 0.8, world: 1.3 };
type Count = Map<string, number>;
const total: Count = new Map();
const first3: Count = new Map();
let totalFight = 0, fight3 = 0;
const add = (c: Count, k: string, n = 1) => c.set(k, (c.get(k) ?? 0) + n);
const fmt = (c: Count, mins: number) => [...c].sort().map(([k, n]) => `${k} ${n} (${(n / mins).toFixed(1)}/min)`).join(", ");

for (const seedN of [1, 2, 3]) {
  for (const room of (process.argv[3] ?? "room1,room2,room3,room4,room5").split(",")) {
    if (!fs.existsSync(path.resolve(import.meta.dirname, "..", "public", "levels", `${room}.json`))) continue;
    const lvl = readLevel(JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "..", "public", "levels", `${room}.json`), "utf8")));
    const s = new Session(lvl, {}, room, { seed: seedN, difficulty: "normal" });
    let t = 0;
    const timers: Array<{ at: number; fn: () => void }> = [];
    const c: Count = new Map();
    const io: DirectorIO = {
      now: () => t,
      later: (fn, ms) => { timers.push({ at: t + ms, fn }); },
      narrate: l => { add(c, /^tut_/.test(l) ? "narrator (tutorial)" : "narrator (room)"); return LEN.narrate; },
      stopNarration: () => undefined,
      pa: () => { add(c, "pa"); return LEN.pa; },
      heavyBark: () => { add(c, "heavy"); return LEN.heavy; },
      bark: () => { add(c, "goons"); return LEN.bark; },
      radbro: () => { add(c, "radbro"); return LEN.radbro; },
      crowdVoice: () => { add(c, "crowd"); return true; },
      worldVoice: (key: string) => { add(c, key.startsWith("madame/") ? "madame" : key.startsWith("radbro/") ? "radbro" : key.startsWith("heavy/") ? "heavy" : "goons"); return LEN.world; },
    } as DirectorIO;
    const d = new Director(s, io);
    s.on(e => d.onEvent(e));
    const g = s.game;
    const bot = new Bot();
    let fight = 0;
    for (let i = 0; i < 120 * 480 && g.phase !== "done" && g.phase !== "dead"; i++) {
      g.step(bot.next(g));
      for (const ev of g.drain()) d.onEvent(ev);
      t += 1000 / 120;
      if (g.phase === "play") fight += 1 / 120;
      for (const x of timers.filter(x => x.at <= t)) { timers.splice(timers.indexOf(x), 1); x.fn(); }
      if (i % 2 === 1) d.frame();
    }
    const mins = fight / 60;
    const n = [...c.values()].reduce((a, b) => a + b, 0);
    console.log(`${room} seed ${seedN}: ${g.phase}, ${fight.toFixed(0)} s of fight, ${n} lines = ${(n / mins).toFixed(1)}/min: ${fmt(c, mins)}`);
    for (const [k, v] of c) add(total, k, v);
    totalFight += fight;
    if (["room1", "room2", "room3"].includes(room)) { for (const [k, v] of c) add(first3, k, v); fight3 += fight; }
  }
}
const sum = (c: Count) => [...c.values()].reduce((a, b) => a + b, 0);
const m3 = fight3 / 60;
console.log(`\nROOMS 1-3 (${mode}): ${fight3.toFixed(0)} s of fight, ${sum(first3)} lines = ${(sum(first3) / m3).toFixed(1)} lines/min`);
console.log(fmt(first3, m3));
const mins = totalFight / 60;
console.log(`\nALL (${mode}): ${totalFight.toFixed(0)} s of fight, ${sum(total)} lines = ${(sum(total) / mins).toFixed(1)} lines/min`);
console.log(fmt(total, mins));
