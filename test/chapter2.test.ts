// Chapter 2 (rooms 6-10): every room is a full room (its size, the waves from several places, three
// secrets, a pin and an egg), the bot clears each one, the set pieces do what they say (the searchlight and
// the rope drops, the glass floor, the cargo door, the shutters and the blackout), the Countess's fight
// (phases, the gate, the beams over and under, her aim broken, her last stand and fall), checkpoints keep
// a set piece's state, and replays stay bit-exact.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readLevel, type LevelData } from "../src/world/level.ts";
import { Game } from "../src/sim/game.ts";
import { Bot } from "../src/sim/bot.ts";
import { DT } from "../src/sim/tuning.ts";
import { BEAM, CH2_DIFF, COUNTESS, ROOF, SNIPER2, killsFor, perDiff } from "../src/sim/tuning2.ts";
import { DIFFICULTY, ENEMY_ARMS, type Difficulty } from "../src/sim/tuning.ts";
import { HB_HEAD, HB_TORSO } from "../src/combat/hitboxes.ts";
import { emptyInput, type GameEvent, type InputFrame } from "../src/sim/types.ts";
import type { Roof } from "../src/sim/ch2/roof.ts";
import type { Garden } from "../src/sim/ch2/garden.ts";
import type { Airship } from "../src/sim/ch2/airship.ts";
import type { Counting } from "../src/sim/ch2/counting.ts";
import type { Vault } from "../src/sim/ch2/vault.ts";

const room = (id: string): LevelData => readLevel(JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "..", "public", "levels", `${id}.json`), "utf8")));
const ROOMS = ["room6", "room7", "room8", "room9", "room10"];
type StageEv = Extract<GameEvent, { type: "stage" }>;
const stage = (ev: GameEvent[]) => ev.filter((e): e is StageEv => e.type === "stage").map(e => e.what);

function runBot(g: Game, maxS: number, bot = new Bot(3.5, 0.3, true), rec?: InputFrame[]): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < maxS / DT && g.phase !== "done" && g.phase !== "dead"; i++) {
    const f = bot.next(g);
    rec?.push({ ...f });
    g.step(f);
    out.push(...g.drain());
  }
  return out;
}
function idle(g: Game, s: number, inp: InputFrame = emptyInput()): GameEvent[] {
  const out: GameEvent[] = [];
  inp.yaw = g.player.yaw;
  for (let i = 0; i < s / DT; i++) { g.step(inp); out.push(...g.drain()); }
  return out;
}

test("chapter 2's rooms: each a full room (25-40 of the gang in waves from several places, 3 secrets, a pin, an egg, checkpoints) and they chain", () => {
  const chain: string[] = [];
  for (const id of ROOMS) {
    const lv = room(id);
    assert.deepEqual(lv.warnings, [], `${id}: ${lv.warnings.join("; ")}`);
    const enemies = lv.markers.filter(m => m.kind === "enemy");
    if (id !== "room10") assert.ok(enemies.length >= 25 && enemies.length <= 40, `${id}: ${enemies.length} hostiles`);
    const groups = new Set(enemies.map(m => String(m.data.group ?? "")));
    assert.ok(groups.size >= 4, `${id}: waves (${[...groups].join(", ")})`);
    // they come from several places: the waves' centres are spread over the room
    const centres = [...groups].filter(Boolean).map(gr => { const es = enemies.filter(m => m.data.group === gr); return [es.reduce((s, m) => s + m.x, 0) / es.length, es.reduce((s, m) => s + m.z, 0) / es.length]; });
    const far = centres.some(a => centres.some(b => Math.hypot(a[0] - b[0], a[1] - b[1]) > 20));
    assert.ok(far, `${id}: the waves all come from one corner`);
    assert.equal(lv.markers.filter(m => m.kind === "secret").length, 3, `${id}: secrets`);
    assert.ok(lv.markers.some(m => m.kind === "pickup" && m.data.item === "pin"), `${id}: a pin`);
    assert.ok(lv.markers.some(m => m.kind === "egg"), `${id}: an egg`);
    assert.ok(lv.markers.some(m => m.kind === "checkpoint"), `${id}: a checkpoint`);
    assert.equal(lv.room.chapter, 2);
    assert.ok(typeof lv.room.cutsceneAfter === "string" && fs.existsSync(path.resolve(import.meta.dirname, "..", "public", "cutscenes", `${lv.room.cutsceneAfter}.json`)), `${id}: its cutscene`);
    chain.push(`${id}>${String(lv.room.next ?? "")}`);
  }
  assert.deepEqual(chain, ["room6>room7", "room7>room8", "room8>room9", "room9>room10", "room10>"]);
  assert.equal(room("room10").room.chapterEnd, true);
  // the gold pins: six, one of each Radbro, none twice
  const pins = ROOMS.flatMap(id => room(id).markers.filter(m => m.kind === "pickup" && m.data.item === "pin").map(m => String(m.data.pin)));
  assert.deepEqual([...pins].sort(), ["g250", "g2564", "g3171", "g4764", "g652", "g723"]);
});

test("chapter 2 on every difficulty: its roster (Normal leaves some of the gang out) and every wave still comes in (each afterKills count is reachable)", () => {
  const DIFFS: Difficulty[] = ["easy", "normal", "hard", "hardcore"];
  const counts: Record<string, number[]> = {};
  for (const id of ROOMS) {
    const lv = room(id);
    counts[id] = [];
    for (const d of DIFFS) {
      const g = new Game(lv, { seed: 1, difficulty: d });
      counts[id].push(g.enemies.length);
      // the kills there are to be had: whoever is up from the start, then each group a trigger brings in
      // once its count is reached (a group no trigger names comes in by the room's own mechanism)
      const named = new Set(g.triggers.filter(t => t.data.action === "spawn").map(t => String(t.data.group)));
      const inGroups = new Set<string>();
      let avail = g.enemies.filter(e => e.state !== "inactive" || !named.has(e.group)).length;
      for (let changed = true; changed;) {
        changed = false;
        for (const t of g.triggers) {
          if (t.data.action !== "spawn" || inGroups.has(String(t.data.group))) continue;
          const k = killsFor(t.data.afterKills, d);
          if (k !== undefined && k > avail) continue;
          inGroups.add(String(t.data.group));
          avail += g.enemies.filter(e => e.group === t.data.group && e.state === "inactive").length;
          changed = true;
        }
      }
      assert.equal(avail, g.enemies.length, `${id} ${d}: some of the gang never comes in`);
      for (const t of g.triggers) {
        const k = killsFor(t.data.afterKills, d);
        if (k !== undefined) assert.ok(k <= g.enemies.length, `${id} ${d}: ${t.id} waits for ${k} of ${g.enemies.length}`);
      }
    }
    // Normal is lighter than Hard; Chill has what Normal has
    const [easy, normal, hard, hardcore] = counts[id];
    assert.ok(normal < hard && easy === normal && hardcore === hard, `${id}: ${counts[id].join(" / ")}`);
    if (id !== "room10") assert.ok(normal >= 20 && normal <= 28, `${id}: ${normal} on Normal`);
  }
  // chapter 2's own Normal: chapter 1's aim and damage, their frags and rushers less often, every can, a
  // checkpoint restores more, the snipers' tell longer; Hard and Hardcore untouched
  const n2 = new Game(room("room6"), { seed: 1, difficulty: "normal" });
  assert.equal(n2.diff.keep, CH2_DIFF.normal!.keep);
  assert.ok(n2.diff.damage === DIFFICULTY.normal.damage && n2.diff.accuracy === DIFFICULTY.normal.accuracy);
  assert.ok(n2.diff.grenade > DIFFICULTY.normal.grenade && n2.diff.rush > DIFFICULTY.normal.rush && n2.diff.suppress < DIFFICULTY.normal.suppress);
  assert.ok(n2.diff.keep > DIFFICULTY.normal.keep && n2.diff.checkpoint > DIFFICULTY.normal.checkpoint);
  assert.equal(n2.sniperArms.tell, perDiff(SNIPER2.tell, "normal"));
  assert.ok(n2.sniperArms.tell > ENEMY_ARMS.sniper.tell && n2.sniperArms.damage < ENEMY_ARMS.sniper.damage);
  for (const d of ["hard", "hardcore"] as const) {
    const g = new Game(room("room6"), { seed: 1, difficulty: d });
    assert.deepEqual(g.diff, DIFFICULTY[d], `${d}: chapter 2 takes the table as it is`);
    assert.equal(g.sniperArms.damage, ENEMY_ARMS.sniper.damage);
  }
  // Hardcore's chapter 2 numbers are at least Hard's (a table without a Hardcore entry takes Hard's)
  assert.equal(perDiff(COUNTESS.hp, "hardcore"), perDiff(COUNTESS.hp, "hard"));
  assert.equal(perDiff(ROOF.accuracy, "hardcore"), ROOF.accuracy.hard);
  // chapter 1 keeps its own Normal
  const g1 = new Game(room("room1"), { seed: 1, difficulty: "normal" });
  assert.deepEqual(g1.diff, DIFFICULTY.normal);
  assert.equal(g1.sniperArms, ENEMY_ARMS.sniper);
});

test("the bot clears every chapter 2 room on normal (seeds 1-3; the vault's boss on 1, 4, 5), each set piece on the way", () => {
  const want: Record<string, string[]> = { room6: ["lit", "drop", "landed"], room7: ["crack", "collapse"], room8: ["klaxon", "blow", "gone"], room9: ["shutterWarn", "shutters", "dark", "lights"], room10: ["intro", "door", "phase2", "beamGo", "phase3", "lastStand", "down"] };
  for (const id of ROOMS) for (const seed of id === "room10" ? [1, 4, 5] : [1, 2, 3]) {
    const g = new Game(room(id), { seed, difficulty: "normal" });
    const ev = runBot(g, 600);
    assert.equal(g.phase, "done", `${id} seed ${seed}: ${g.phase}, ${g.alive} left, hp ${g.player.health.toFixed(0)}`);
    const got = new Set(stage(ev));
    for (const w of want[id]) assert.ok(got.has(w), `${id} seed ${seed}: no "${w}" (${[...got].join(" ")})`);
  }
});

test("roof: the light patrols, then follows him slower than he runs; lit, the gang aims better; the lamp shot out sends the helicopter away", () => {
  const g = new Game(room("room6"), { seed: 1 });
  const r = g.stage as Roof;
  assert.equal(r.kind, "roof");
  const start = [r.lx, r.lz];
  idle(g, 2);
  assert.ok(Math.hypot(r.lx - start[0], r.lz - start[1]) > 3, "it patrols");
  // wake the gang: it comes for him at its tracking speed
  for (const e of g.enemies) if (e.state === "idle") { e.state = "alert"; e.react = 99; }
  const d0 = Math.hypot(r.lx - g.player.x, r.lz - g.player.z);
  idle(g, 1);
  const d1 = Math.hypot(r.lx - g.player.x, r.lz - g.player.z);
  assert.ok(d0 - d1 > perDiff(ROOF.track, "normal") * 0.9 && d0 - d1 < ROOF.track.normal * 1.1 + 0.01, `tracks at ${(d0 - d1).toFixed(2)} m/s`);
  // put it on him in the open: lit, and their aim is better
  g.player.x = 0; g.player.z = 6;
  r.lx = 0; r.lz = 6;
  const ev = idle(g, 0.05);
  void ev;
  assert.ok(r.lit, "in the light");
  assert.equal(r.accuracy(g, g.enemies[0]), ROOF.accuracy.normal);
  // shoot the lamp until it is out
  const c = r.lampAt();
  let n = 0;
  while (r.lightOn && n++ < 100) { const t = r.intercept(c.x, c.y - 5, c.z, 0, 1, 0, 10); assert.ok(t); r.hitTarget(g, t!, c.x, c.y - 5, c.z, 30); }
  assert.ok(!r.lightOn && r.gone && !r.lit);
  assert.equal(r.accuracy(g, g.enemies[0]), 1);
  assert.ok(stage(g.drain()).includes("lampOut"));
});

test("roof: a drop group comes down the ropes onto the pad (hittable, not firing until down); one shot off her rope lands on the pad", () => {
  const g = new Game(room("room6"), { seed: 2 });
  const r = g.stage as Roof;
  const t = g.triggers.find(x => x.data.group === "drop1")!;
  t.data.afterKills = 0;
  const ev = idle(g, 0.1);
  assert.ok(stage(ev).includes("drop"));
  const girls = g.enemies.filter(e => e.group === "drop1");
  assert.ok(girls.every(e => e.y > ROOF.ropeY * 0.9 && e.hit.hittable), "up on the ropes, and she can be shot");
  const shots = girls.map(e => e.shots);
  g.damageEnemy(girls[0], 999, HB_TORSO, 0, 1, null);
  assert.ok(Math.abs(girls[0].y - 1) < 1e-6, "shot off her rope: on the pad");
  const ev2 = idle(g, ROOF.ropeY / ROOF.ropeSpeed + 1.2);
  assert.ok(stage(ev2).filter(w => w === "landed").length >= girls.length - 1);
  assert.ok(girls.slice(1).every(e => Math.abs(e.y - 1) < 1e-6), "on the pad");
  assert.deepEqual(girls.slice(1).map(e => e.shots), shots.slice(1), "no shot from the rope");
  assert.equal(r.roping.size, 0);
});

test("garden: the glass cracks when he steps on it, gives way 2.6 s later: the girls on it drop to the pit and take the fall, the colliders are gone; a checkpoint keeps it gone", () => {
  const g = new Game(room("room7"), { seed: 1, ai: false });
  const gd = g.stage as Garden;
  void gd;
  const floor = g.player.y;
  const girl = g.enemies.find(e => e.id === "g-5")!;
  assert.ok(Math.abs(girl.y - floor) < 1e-6, "she stands on the walkway");
  g.player.x = -2; g.player.z = 0;
  const ev = idle(g, 0.1);
  assert.ok(stage(ev).includes("crack"));
  assert.ok(!g.world.off.has("glass-2"), "not yet");
  const ev2 = idle(g, 2.6);
  assert.ok(stage(ev2).includes("collapse"));
  idle(g, 1);
  assert.ok(["glass-1", "glass-2", "glass-3", "glass-4"].every(id => g.world.off.has(id)));
  assert.ok(girl.y < floor - 3, `down in the pit (${girl.y})`);
  assert.ok(girl.hp < 60 || girl.state === "dead");
  assert.ok(g.player.y < floor - 1, "and so did he");
  // a checkpoint after it: the glass stays gone
  const saved = (g as unknown as { snapshot(at: { x: number; y: number; z: number; yaw: number }): import("../src/sim/game.ts").Resume }).snapshot({ x: -17, y: floor, z: 0, yaw: 0 });
  const r = new Game(room("room7"), { seed: 1, resume: saved });
  assert.equal((r.stage as Garden).state, 2);
  assert.ok(r.world.off.has("glass-3"));
});

test("airship: the klaxon, then the door is gone and the hold pulls: he can hold his ground (and the net holds him), a girl near the opening is out (not his kill)", () => {
  const g = new Game(room("room8"), { seed: 1 });
  const a = g.stage as Airship;
  g.player.x = 19.8; g.player.z = 0;
  const ev = idle(g, 0.1);
  assert.deepEqual(stage(ev), ["klaxon"]);
  const ev2 = idle(g, 2.2);
  assert.ok(stage(ev2).includes("blow") && g.world.off.has("cargo-door") && a.wind);
  // standing still in the hold he drifts to the net but never through it
  g.player.x = 25; g.player.z = 4;
  const girl = g.enemies.find(e => e.id === "h-4")!; // (h-5 is there on Hard and up only)
  girl.x = 26; girl.z = 5.8; girl.state = "cover";
  const kills = g.stats.kills;
  const ev3 = idle(g, 3);
  assert.ok(g.player.z > 5 && g.player.z < 7.3 - 0.3, `pinned on the net (${g.player.z.toFixed(2)})`);
  assert.equal(girl.state, "dead");
  assert.ok(stage(ev3).includes("gone"));
  assert.equal(g.stats.kills, kills, "the sky's kill, not his");
  // running away from the opening, he makes ground against it
  g.player.x = 25; g.player.z = 2;
  // (yaw 0 looks down -Z: forward is away from the door)
  const inp = emptyInput(); inp.yaw = 0; inp.moveY = 1;
  const z0 = g.player.z;
  for (let i = 0; i < 1 / DT; i++) { g.step(inp); g.drain(); }
  assert.ok(g.player.z < z0 - 1.5, `he runs against it (${(z0 - g.player.z).toFixed(2)} m)`);
});

test("counting floor: the shutters warn, then close the floor in two (the gang's ways through them shut, the catwalk stays); the blackout makes their aim worse", () => {
  const g = new Game(room("room9"), { seed: 1 });
  const c = g.stage as Counting;
  assert.ok(["shutter-1", "shutter-2", "shutter-3"].every(id => g.world.off.has(id)), "up at the start");
  const west = g.graph.path(12, 0, 0, 18, 0, 0);
  assert.ok(west && west.length <= 3, "through the middle opening while it is up");
  g.triggers.find(t => t.data.cue === "shutters")!.data.afterKills = 0;
  g.triggers.find(t => t.data.cue === "dark")!.data.afterKills = 0;
  const ev = idle(g, 0.1);
  assert.ok(stage(ev).includes("shutterWarn") && stage(ev).includes("dark"));
  assert.ok(c.accuracy(g, g.enemies[0]) < 1);
  idle(g, 1.6);
  assert.ok(["shutter-1", "shutter-2", "shutter-3"].every(id => !g.world.off.has(id)), "down");
  const round = g.graph.path(12, 0, 0, 18, 0, 0);
  assert.ok(round && round.some(p => p.z < -14), "the way east is the catwalk now");
  idle(g, 14);
  assert.equal(c.accuracy(g, g.enemies[0]), 1, "the lights are back");
});

test("vault: her entrance (no damage), the gate shuts behind him, the phases, the beams (over the low, under the high, behind a pillar), her aim broken, the last stand's slow motion, her fall", () => {
  const g = new Game(room("room10"), { seed: 5, difficulty: "normal" });
  const v = g.stage as Vault;
  const her = g.enemies[v.idx];
  assert.equal(her.kind, "countess");
  assert.equal(her.milady, COUNTESS.pockit);
  assert.equal(her.hp, perDiff(COUNTESS.hp, "normal"));
  assert.equal(her.hit.pose.scale, COUNTESS.scale);
  assert.ok(g.world.off.has("vault-gate"), "the gate is open while he is in the corridor");
  g.player.x = 0; g.player.z = 12;
  const ev = idle(g, 0.5);
  assert.ok(stage(ev).includes("intro") && stage(ev).includes("locked"));
  assert.ok(!g.world.off.has("vault-gate"), "shut behind him");
  g.damageEnemy(her, 100 * v.damageMul(her, HB_TORSO), HB_TORSO, 1, 0, null);
  assert.equal(her.hp, her.maxHp, "the entrance protects her");
  idle(g, COUNTESS.introHold);
  // phase 2 at 66 %
  g.damageEnemy(her, her.maxHp * 0.35, HB_TORSO, 1, 0, null);
  const ev2 = idle(g, 0.05);
  assert.ok(stage(ev2).includes("phase2") && v.phase === 2 && v.shiftT > 0);
  assert.equal(v.damageMul(her, HB_TORSO), 0, "a phase change: no damage for a moment");
  idle(g, COUNTESS.shift + 0.1);
  assert.ok(!her.perch, "off the desk");
  // a low beam: standing he is hit; jumping over it he is not
  const b = v.beam;
  const hp = g.player.health;
  v.beamNext = 0;
  idle(g, 0.02);
  b.high = false;
  assert.ok(b.state === 1);
  g.player.x = 6; g.player.z = 6; g.player.y = 0;
  assert.ok(v.touches(g), "the low beam meets his shins");
  g.player.y = BEAM.clear + 0.05;
  assert.ok(!v.touches(g), "over it");
  g.player.y = 0;
  b.high = true;
  g.player.mode = "prone";
  assert.ok(!v.touches(g), "under the high one, prone");
  g.player.mode = "normal";
  g.player.x = 7.8 * 1.2; g.player.z = 7.8 * 1.2;
  assert.ok(!v.touches(g), "behind a pillar");
  g.player.x = 6; g.player.z = 6;
  assert.ok(v.touches(g));
  void hp;
  // her aim broken: enough damage during the tell
  her.tell = 0.5; v.tellHp = -1; her.stagger = 0;
  idle(g, 0.02);
  g.damageEnemy(her, COUNTESS.breakAt + 5, HB_HEAD, 1, 0, null);
  const ev3 = idle(g, 0.02);
  assert.ok(stage(ev3).includes("stagger") && her.tell === 0 && her.stagger > 0, `${stage(ev3)} tell ${her.tell} stagger ${her.stagger} tellHp ${v.tellHp} hp ${her.hp}`);
  // phase 3, then the last stand: free slow motion, she runs for the vault door; she cannot die before it
  g.damageEnemy(her, her.hp - her.maxHp * 0.3, HB_TORSO, 1, 0, null);
  idle(g, 0.05);
  assert.equal(v.phase, 3);
  idle(g, COUNTESS.shift + 0.1);
  g.damageEnemy(her, her.hp + 500, HB_TORSO, 1, 0, null);
  assert.equal(her.hp, 1, "held on 1 for her last stand");
  const ev4 = idle(g, 0.05);
  assert.ok(stage(ev4).includes("lastStand") && v.lastStand === 1 && g.timeScale < 0.3);
  // her fall: the girls still standing run (not counted); the clear is hers
  const add = g.enemies.find(e => e.group === "liftE" && e.state !== "inactive" && e.state !== "dead");
  g.damageEnemy(her, 50, HB_TORSO, 1, 0, { ox: 0, oy: 1, oz: 9, x: her.x, y: her.y + 1, z: her.z });
  assert.equal(her.state, "dead");
  if (add) assert.ok(add.fled);
  assert.equal(g.alive, 0);
  assert.equal(g.phase, "killcam", "her kill cam");
});

test("chapter 2 replays bit-exact (the airship's wind, the vault's beams)", () => {
  for (const [id, seed, s] of [["room8", 3, 60], ["room10", 4, 50]] as const) {
    const rec: InputFrame[] = [];
    const g = new Game(room(id), { seed });
    runBot(g, s, new Bot(3.5, 0.3, true), rec);
    const h = new Game(room(id), { seed });
    for (const f of rec) { h.step(f); h.drain(); }
    assert.equal(h.hash(), g.hash(), `${id}: the replay drifted`);
  }
});
