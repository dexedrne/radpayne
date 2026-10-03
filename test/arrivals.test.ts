// Chapter 2's arrivals (sim/arrive.ts, the vault's lifts in sim/ch2/vault.ts): the gang a wave, a rope drop
// or a lift brings in comes in only by a way in, never near him, never in or next to the cover he hides
// behind, never behind his back at close range; one at a time, and never more than ARRIVE.maxUp standing.
// The owner, on chapter 2: "too many enemies, they even spawn in places where you hide".
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readLevel, type LevelData } from "../src/world/level.ts";
import { Game, laterGroups } from "../src/sim/game.ts";
import { DT } from "../src/sim/tuning.ts";
import { ARRIVE, perDiff } from "../src/sim/tuning2.ts";
import { attachCover, hideRange, segLive, segNearest, type CoverSeg } from "../src/sim/cover.ts";
import { arrivalOk, standing } from "../src/sim/arrive.ts";
import { HB_TORSO } from "../src/combat/hitboxes.ts";
import { emptyInput } from "../src/sim/types.ts";
import type { Difficulty } from "../src/sim/tuning.ts";
import type { Vault } from "../src/sim/ch2/vault.ts";

const room = (id: string): LevelData => readLevel(JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "..", "public", "levels", `${id}.json`), "utf8")));
const ROOMS = ["room6", "room7", "room8", "room9", "room10"];

/** Him in cover at u on segment s, facing the way it covers (no input from here on). */
function putInCover(g: Game, s: CoverSeg, u: number): void {
  const p = g.player;
  attachCover(s, p, u);
  p.x = s.ax + s.tx * p.coverU; p.z = s.az + s.tz * p.coverU; p.y = s.y;
  p.vx = p.vy = p.vz = 0;
  p.yaw = Math.atan2(s.nx, s.nz);
  p.facing = p.yaw + Math.PI;
}

/** Every wave of the room called at once (no set piece, checkpoint, alert or exit), the room's own girls
 *  down (the vault's Countess stays: her lifts run while she stands, all three phases' waves lit). */
function callEverything(g: Game): void {
  for (let i = g.triggers.length - 1; i >= 0; i--) {
    const t = g.triggers[i];
    if (t.data.action === "spawn") t.data.afterKills = 0;
    else g.triggers.splice(i, 1);
  }
  const later = laterGroups(g.level);
  for (const e of g.enemies) if (e.state !== "inactive" && e.kind !== "countess" && !later.has(e.group)) g.damageEnemy(e, 9999, HB_TORSO, 0, 1, null);
  if (g.stage?.kind === "vault") {
    const v = g.stage as Vault;
    v.started = true;
    for (const ph of [1, 2, 3]) (v as unknown as { lightWaves(g: Game, ph: number): void }).lightWaves(g, ph);
  }
}

type Arrival = { id: string; dist: number; zone: number; behind: boolean };
/** His cover zone, worked out here on its own: the stretch of the cover he is in a step either side of
 *  his spot, and of every live cover on his floor within a step of him, round the point nearest him. */
function zoneOf(g: Game, mine: CoverSeg | null): Array<{ s: CoverSeg; a: number; b: number }> {
  const p = g.player, out: Array<{ s: CoverSeg; a: number; b: number }> = [];
  for (const s of g.cover) {
    if (!segLive(g.world, s) || Math.abs(s.y - p.y) > 0.7) continue;
    const n = segNearest(s, p.x, p.z);
    const u = s === mine ? p.coverU : n.u;
    if (s !== mine && n.d > ARRIVE.step) continue;
    out.push({ s, a: Math.max(0, u - ARRIVE.step), b: Math.min(s.len, u + ARRIVE.step) });
  }
  return out;
}
const stretchDist = (q: { s: CoverSeg; a: number; b: number }, x: number, z: number) => {
  const u = Math.max(q.a, Math.min(q.b, (x - q.s.ax) * q.s.tx + (z - q.s.az) * q.s.tz));
  return Math.hypot(q.s.ax + q.s.tx * u - x, q.s.az + q.s.tz * u - z);
};
/** Run the room's waves with him held where he is: each girl is noted as she comes in and put down at
 *  once (so the next may come); until none of `groups` (all: every group) is left to come, or `maxS`
 *  world seconds. */
function runWaves(g: Game, maxS: number, mine: CoverSeg | null, groups?: string[]): { arrivals: Arrival[]; left: number; most: number } {
  const p = g.player;
  const inp = emptyInput();
  inp.yaw = p.yaw;
  const out: Arrival[] = [];
  const near = zoneOf(g, mine);
  const was = g.enemies.map(e => e.state);
  let most = 0;
  const left = () => g.enemies.filter(e => e.state === "inactive" && !e.fled && (!groups || groups.includes(e.group))).length;
  for (let i = 0; i < maxS / DT && left() > 0; i++) {
    g.step(inp);
    g.drain();
    most = Math.max(most, standing(g));
    for (const e of g.enemies) {
      if (was[e.idx] === "inactive" && e.state !== "inactive" && !e.fled) {
        const roped = (g.stage as unknown as { roping?: Map<number, number> }).roping?.get(e.idx);
        const gy = roped ?? e.y;
        const dx = e.x - p.x, dz = e.z - p.z, dist = Math.hypot(dx, dz);
        // distance from his cover spot (the cover he is in, and any within a step) on its floor
        const zone = Math.min(Infinity, ...near.filter(q => Math.abs(gy - q.s.y) < 1.5).map(q => stretchDist(q, e.x, e.z)));
        const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
        const behind = dist < ARRIVE.backDist && (fx * dx + fz * dz) / (dist || 1) < Math.cos(ARRIVE.backAngle);
        out.push({ id: e.id, dist, zone, behind });
        if (e.kind !== "countess") g.damageEnemy(e, 9999, HB_TORSO, 0, 1, null);
      }
      was[e.idx] = e.state;
    }
  }
  return { arrivals: out, left: left(), most };
}

test("no spawns where he hides: him at every cover spot of every chapter 2 room, every wave comes in at least 12 m away, never in or next to his cover, never behind his back close up", () => {
  const d: Difficulty = "hardcore"; // (every girl the rooms have)
  for (const id of ROOMS) {
    const lv = room(id);
    const probe = new Game(lv, { seed: 1, difficulty: d, ai: false });
    // every cover spot: each live cover segment, every 6 m along it (its middle when it is shorter)
    const spots: Array<[number, number]> = [];
    probe.cover.forEach((s, i) => {
      if (!segLive(probe.world, s)) return;
      const [lo, hi] = hideRange(s);
      const n = Math.max(1, Math.round((hi - lo) / 6));
      for (let k = 0; k < n; k++) spots.push([i, lo + ((k + 0.5) * (hi - lo)) / n]);
    });
    let minDist = Infinity, minZone = Infinity, runs = 0, comes = 0;
    for (const [i, u] of spots) {
      const g = new Game(lv, { seed: 1, difficulty: d, ai: false });
      callEverything(g);
      const s = g.cover[i];
      putInCover(g, s, u);
      const r = runWaves(g, 150, s);
      runs++;
      comes += r.arrivals.length;
      assert.equal(r.left, 0, `${id}: him in cover ${i} at (${g.player.x.toFixed(1)}, ${g.player.z.toFixed(1)}): ${r.left} never came in`);
      for (const a of r.arrivals) {
        assert.ok(a.dist >= ARRIVE.minDist, `${id}: ${a.id} came in ${a.dist.toFixed(1)} m from him in cover ${i} at (${g.player.x.toFixed(1)}, ${g.player.z.toFixed(1)})`);
        assert.ok(a.zone >= ARRIVE.zone, `${id}: ${a.id} came in ${a.zone.toFixed(1)} m from his cover ${i}`);
        assert.ok(!a.behind, `${id}: ${a.id} came in behind his back ${a.dist.toFixed(1)} m away (cover ${i})`);
        minDist = Math.min(minDist, a.dist);
        minZone = Math.min(minZone, a.zone);
      }
      assert.ok(r.most <= perDiff(ARRIVE.maxUp, d), `${id}: ${r.most} standing at once`);
    }
    assert.ok(runs >= 40 && comes > runs * 5, `${id}: ${runs} spots, ${comes} arrivals`);
    console.log(`  ${id}: ${runs} cover spots, ${comes} arrivals, nearest ${minDist.toFixed(1)} m (to his cover ${minZone.toFixed(1)} m)`);
  }
});

test("a way in that fails the rule now gives her another of her group's ways; with none, she waits until one passes", () => {
  // room 6, wave A (the machine room's door, else the south-east stair, else the west stairwell): him by the
  // machine room's door, she takes the next way
  const lv = room("room6");
  const g = new Game(lv, { seed: 1, difficulty: "normal", ai: false });
  callEverything(g);
  for (const t of g.triggers) if (t.data.group !== "waveA") t.data.afterKills = 99;
  g.player.x = 19.2; g.player.z = -9; g.player.yaw = 0; // (by the door, facing north at it)
  const r = runWaves(g, 20, null, ["waveA"]);
  assert.ok(r.left === 0 && r.arrivals.length >= 2 && r.arrivals.every(a => a.dist >= ARRIVE.minDist));
  const home = new Game(lv, { seed: 1, difficulty: "normal", ai: false });
  const machine = home.enemies.filter(e => e.group === "waveA").map(e => [e.x, e.z]);
  const g2 = g.enemies.filter(e => e.group === "waveA");
  assert.ok(g2.every(e => !machine.some(([x, z]) => Math.hypot(x - e.x, z - e.z) < 2)), "none came through the door he stands by");
  // only her own way, and him by it: she waits; he walks off: she comes
  const h = new Game(lv, { seed: 1, difficulty: "normal", ai: false });
  callEverything(h);
  for (const t of h.triggers) if (t.data.group !== "waveA") t.data.afterKills = 99;
  h.arrivals!.groups.set("waveA", ["self"]);
  h.player.x = 19.2; h.player.z = -9; h.player.yaw = 0;
  const held = runWaves(h, 10, null, ["waveA"]);
  assert.equal(held.arrivals.length, 0, "held while he stands by her door");
  assert.ok(held.left > 0);
  h.player.x = -12; h.player.z = 0;
  const later = runWaves(h, 20, null, ["waveA"]);
  assert.equal(later.left, 0, "in once he is away");
  assert.ok(later.arrivals.every(a => a.dist >= ARRIVE.minDist));
});

test("behind his back at close range is out: the bridge's wave comes in from it only while he faces it or is far from it", () => {
  const lv = room("room7");
  const setup = (yaw: number) => {
    const g = new Game(lv, { seed: 1, difficulty: "normal", ai: false });
    callEverything(g);
    for (const t of g.triggers) if (t.data.group !== "waveE") t.data.afterKills = 99;
    g.player.x = -16; g.player.z = 0; g.player.y = 4; g.player.yaw = yaw;
    return g;
  };
  const bridge = (g: Game) => g.enemies.filter(e => e.group === "waveE" && e.state !== "inactive").every(e => e.x < -24);
  // (yaw -pi/2: facing east, the bridge 14-17 m behind him; yaw pi/2: facing west, at it)
  const away = setup(-Math.PI / 2);
  const r1 = runWaves(away, 20, null, ["waveE"]);
  assert.ok(r1.left === 0 && r1.arrivals.every(a => !a.behind && a.dist >= ARRIVE.minDist));
  assert.ok(!bridge(away), "his back to the bridge: she came another way");
  const facing = setup(Math.PI / 2);
  const r2 = runWaves(facing, 20, null, ["waveE"]);
  assert.ok(r2.left === 0 && bridge(facing), "facing it: across the bridge, in front of him");
  // the rule itself: right behind him at 15 m is out, in front at 15 m is fine, 25 m behind is fine
  const g = setup(-Math.PI / 2);
  assert.equal(arrivalOk(g, -31, 4, 0), false);
  assert.equal(arrivalOk(g, -1, 4, 0), true);
  assert.equal(arrivalOk(g, -41, 4, 0), true);
  assert.equal(arrivalOk(g, -20, 4, 0), false, "under 12 m");
});

test("the trickle: every wave of a room called at once comes in one at a time, ARRIVE.gap apart, never more than ARRIVE.maxUp standing", () => {
  for (const [id, d] of [["room6", "normal"], ["room8", "retardio"], ["room9", "hard"]] as Array<[string, Difficulty]>) {
    const g = new Game(room(id), { seed: 2, difficulty: d, ai: false });
    for (let i = g.triggers.length - 1; i >= 0; i--) { const t = g.triggers[i]; if (t.data.action === "spawn") t.data.afterKills = 0; else g.triggers.splice(i, 1); }
    g.player.x = g.checkpoint.x; g.player.z = g.checkpoint.z;
    const cap = perDiff(ARRIVE.maxUp, d), gap = perDiff(ARRIVE.gap, d);
    const inp = emptyInput();
    const times: number[] = [];
    const was = g.enemies.map(e => e.state);
    let most = 0;
    for (let i = 0; i < 90 / DT; i++) {
      g.step(inp);
      g.drain();
      const n = standing(g);
      for (const e of g.enemies) {
        if (was[e.idx] === "inactive" && e.state !== "inactive") { times.push(g.time); assert.ok(n <= cap, `${id} ${d}: ${n} standing as ${e.id} came in`); }
        was[e.idx] = e.state;
      }
      most = Math.max(most, n);
      // (a girl down now and then: room for the next)
      if (i % Math.round(3 / DT) === 0) { const e = g.enemies.find(k => k.state !== "inactive" && k.state !== "dead" && !k.fled); if (e) g.damageEnemy(e, 9999, HB_TORSO, 0, 1, null); }
    }
    assert.ok(times.length >= 4, `${id}: ${times.length} came in`);
    for (let k = 1; k < times.length; k++) assert.ok(times[k] - times[k - 1] >= gap - 1e-6, `${id}: two came in ${(times[k] - times[k - 1]).toFixed(2)} s apart`);
    const start = new Game(room(id), { seed: 2, difficulty: d, ai: false });
    assert.ok(most <= Math.max(cap, standing(start)), `${id}: ${most} standing at once`);
  }
});

test("the vault: him by the east lift, its girls come through the west one (its lamp first); a checkpoint's resume queues a room's called waves again", () => {
  const g = new Game(room("room10"), { seed: 3, difficulty: "normal", ai: false });
  const v = g.stage as Vault;
  callEverything(g);
  g.player.x = 9; g.player.z = 2; g.player.yaw = -Math.PI / 2;
  const r = runWaves(g, 40, null);
  assert.equal(r.left, 0);
  assert.ok(r.arrivals.every(a => a.dist >= ARRIVE.minDist && !a.behind));
  const east = g.enemies.filter(e => e.group.startsWith("liftE"));
  assert.ok(east.length > 0 && east.every(e => e.x < 0), "the east lift's girls came through the west one");
  assert.ok(v.lifts.every(l => l.open));
  // room 7: a checkpoint after wave A was called; the retry has wave A's living girls come in again, by the rule
  const lv = room("room7");
  const h = new Game(lv, { seed: 1, difficulty: "normal" });
  for (const t of h.triggers) if (t.data.group === "waveA") t.data.afterKills = 0;
  h.step(emptyInput());
  const saved = (h as unknown as { snapshot(at: { x: number; y: number; z: number; yaw: number }): import("../src/sim/game.ts").Resume }).snapshot({ x: -17, y: 4, z: 0, yaw: Math.PI / 2 });
  const re = new Game(lv, { seed: 1, difficulty: "normal", resume: saved });
  const waveA = re.enemies.filter(e => e.group === "waveA");
  assert.ok(waveA.every(e => e.state === "inactive") && waveA.every(e => re.arrivals!.queue.includes(e.idx)), "queued, not standing at their door");
});
