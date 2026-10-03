// Chapter 2's spawn report (Node, no browser): the bot plays each room (tools/ch2bot.ts runRoom: retries
// from the room's last checkpoint, like a player) and every time one of the gang comes in (a wave, a rope
// drop, a lift) it notes where he was: her distance from him, whether she came in inside or next to the
// cover he was using or could reach in a step, and whether she came in behind his back at close range
// (more than 100 deg off his aim, under 20 m) and out of his sight. Per room: the gang's total, the most
// standing at once (awake or not) and the most awake at once, the bot's clears, deaths and health lost. The metrics are this file's own (not the
// sim's spawn rule), so a before and an after are measured the same way.
//   node tools/ch2spawns.ts [room6,...] [seeds=1,...,12] [normal,retardio] [--json out.json] [--static]
// --static also lists every place the gang can come in (spawn markers of a later group, rope points, lift
// slots) with the player cover within 12 m of it.
import fs from "node:fs";
import path from "node:path";
import { readLevel } from "../src/world/level.ts";
import { Game } from "../src/sim/game.ts";
import { segLive, segNearest, type CoverSeg } from "../src/sim/cover.ts";
import { laterGroups } from "../src/sim/game.ts";
import type { Difficulty } from "../src/sim/tuning.ts";
import { runRoom } from "./ch2bot.ts";

const pos = process.argv.slice(2).filter(a => !a.startsWith("--"));
const flag = (k: string) => process.argv.includes(`--${k}`);
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : ""; };
const rooms = (pos[0] ?? "room6,room7,room8,room9,room10").split(",");
const seeds = (pos[1] ?? "1,2,3,4,5,6,7,8,9,10,11,12").split(",").map(Number);
const diffs = (pos[2] ?? "normal,retardio").split(",") as Difficulty[];
const out = arg("json");

/** What counts as "his cover" here: the segment he is in, and any live one on his floor within a step. */
const STEP = 1.5, ZONE = 2.5, BACK_ANGLE = (100 * Math.PI) / 180, BACK_DIST = 20;

export type Arrival = { room: string; diff: string; seed: number; id: string; group: string; dist: number; inCover: boolean; zone: boolean; behind: boolean; seen: boolean; px: number; pz: number; x: number; z: number };

function zoneSegs(g: Game): CoverSeg[] {
  const p = g.player;
  return g.cover.filter((s, i) => segLive(g.world, s) && Math.abs(s.y - p.y) < 0.7 && (i === p.cover || segNearest(s, p.x, p.z).d <= STEP));
}

/** Her ground (a girl on a rope is over her landing spot). */
function groundOf(g: Game, idx: number, y: number): number {
  const r = g.stage as unknown as { roping?: Map<number, number> } | null;
  return r?.roping?.get(idx) ?? y;
}

export function measure(room: string, seed: number, diff: Difficulty) {
  const arrivals: Arrival[] = [];
  let maxAlive = 0, maxAwake = 0, total = 0;
  let cur: Game | null = null;
  let prev: string[] = [];
  const onStep = (g: Game) => {
    if (g !== cur) { cur = g; prev = g.enemies.map(e => e.state); total = Math.max(total, g.enemies.length); }
    let alive = 0, awake = 0;
    const p = g.player;
    for (const e of g.enemies) {
      const up = e.state !== "inactive" && e.state !== "dead" && !e.fled;
      if (up) alive++;
      if (up && e.state !== "idle") awake++;
      if (prev[e.idx] === "inactive" && e.state !== "inactive" && !e.fled) {
        const gy = groundOf(g, e.idx, e.y);
        const dx = e.x - p.x, dz = e.z - p.z, dist = Math.hypot(dx, dz);
        const zone = zoneSegs(g).some(s => Math.abs(gy - s.y) < 1.5 && segNearest(s, e.x, e.z).d < ZONE);
        const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
        const ang = Math.acos(Math.max(-1, Math.min(1, (fx * dx + fz * dz) / (dist || 1))));
        const seen = g.world.clear(p.x, p.y + 1.5, p.z, e.x, gy + 1.3, e.z, true);
        arrivals.push({ room, diff, seed, id: e.id, group: e.group, dist, inCover: p.cover >= 0, zone, behind: ang > BACK_ANGLE && dist < BACK_DIST, seen, px: p.x, pz: p.z, x: e.x, z: e.z });
      }
      prev[e.idx] = e.state;
    }
    maxAlive = Math.max(maxAlive, alive);
    maxAwake = Math.max(maxAwake, awake);
  };
  const r = runRoom(room, seed, diff, true, onStep);
  return { run: r, arrivals, maxAlive, maxAwake, total };
}

/** Every place the gang can come in, and the player cover close to it. */
function staticReport(room: string): void {
  const lv = readLevel(JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "..", "public", "levels", `${room}.json`), "utf8")));
  const g = new Game(lv, { seed: 1, difficulty: "hard" });
  const later = laterGroups(lv);
  const pts: Array<{ what: string; x: number; y: number; z: number }> = [];
  for (const e of g.enemies) if (later.has(e.group)) pts.push({ what: `${e.group}:${e.id}`, x: e.x, y: e.y, z: e.z });
  // (the roof's rope drop zones, and the room's named ways in; before 2026-10-03 the roof had `drops`)
  const st = lv.room.stage as { drops?: Array<{ group: string; ropes: number[][] }>; pad?: number[]; ropes?: Record<string, { at: number[]; slots: number[][] }> } | undefined;
  for (const d of st?.drops ?? []) for (const [x, z] of d.ropes) pts.push({ what: `rope ${d.group}`, x, y: st?.pad?.[1] ?? 0, z });
  for (const [name, zone] of Object.entries(st?.ropes ?? {})) for (const [x, z] of zone.slots) pts.push({ what: `rope ${name}`, x, y: zone.at[1], z });
  const ways = (lv.room.arrive as { ways?: Record<string, number[][]> } | undefined)?.ways ?? {};
  for (const [name, slots] of Object.entries(ways)) for (const [x, y, z] of slots) pts.push({ what: `way ${name}`, x, y, z });
  console.log(`${room}: ${pts.length} ways in`);
  for (const q of pts) {
    const near = g.cover.filter(s => Math.abs(s.y - q.y) < 1.5).map(s => segNearest(s, q.x, q.z).d).filter(d => d < 12).sort((a, b) => a - b);
    console.log(`  ${q.what.padEnd(22)} (${q.x.toFixed(1)}, ${q.y.toFixed(1)}, ${q.z.toFixed(1)}): ${near.length} cover segments within 12 m${near.length ? `, nearest ${near[0].toFixed(1)} m` : ""}`);
  }
}

if (import.meta.main) {
  if (flag("static")) for (const room of rooms) staticReport(room);
  const all: Arrival[] = [];
  const rows: Array<{ room: string; diff: string; total: number; maxAlive: number; maxAwake: number; clears: number; n: number; deaths: number; lost: number; arrivals: number; minDist: number; under12: number; zone: number; behind: number; behindUnseen: number }> = [];
  for (const room of rooms) for (const diff of diffs) {
    let clears = 0, deaths = 0, lost = 0, maxAlive = 0, maxAwake = 0, total = 0;
    const arr: Arrival[] = [];
    for (const seed of seeds) {
      const m = measure(room, seed, diff);
      clears += m.run.cleared ? 1 : 0; deaths += m.run.deaths; lost += m.run.lost;
      maxAlive = Math.max(maxAlive, m.maxAlive); maxAwake = Math.max(maxAwake, m.maxAwake); total = Math.max(total, m.total);
      arr.push(...m.arrivals);
      if (flag("verbose")) console.log(`  ${room} ${diff} seed ${seed}: ${m.run.cleared ? "clear" : "FAIL"} deaths ${m.run.deaths} lost ${Math.round(m.run.lost)} max alive ${m.maxAlive}`);
    }
    all.push(...arr);
    const row = { room, diff, total, maxAlive, maxAwake, clears, n: seeds.length, deaths, lost: lost / seeds.length, arrivals: arr.length, minDist: arr.length ? Math.min(...arr.map(a => a.dist)) : NaN, under12: arr.filter(a => a.dist < 12).length, zone: arr.filter(a => a.zone).length, behind: arr.filter(a => a.behind).length, behindUnseen: arr.filter(a => a.behind && !a.seen).length };
    rows.push(row);
  }
  console.log("\nroom    diff      gang  max-up  awake  clears  deaths  hp-lost/run  arrivals  min-dist  <12m  in-his-cover  behind<20m (unseen)");
  for (const r of rows) console.log(`${r.room.padEnd(7)} ${r.diff.padEnd(9)} ${String(r.total).padStart(4)} ${String(r.maxAlive).padStart(7)} ${String(r.maxAwake).padStart(6)} ${`${r.clears}/${r.n}`.padStart(7)} ${String(r.deaths).padStart(7)} ${r.lost.toFixed(0).padStart(12)} ${String(r.arrivals).padStart(9)} ${r.minDist.toFixed(1).padStart(9)} ${String(r.under12).padStart(5)} ${String(r.zone).padStart(13)} ${String(r.behind).padStart(11)} (${r.behindUnseen})`);
  if (out) fs.writeFileSync(out, JSON.stringify({ rows, arrivals: all }, null, 1));
}
