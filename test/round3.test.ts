// Room 3's systems: the breach door (a shootdodge through it, the 25 s kick as the fallback), enemies
// behind closed doors (deaf, awake from the start unless a spawn trigger brings them in), conditional
// triggers (whenClear), the checkpoint and its resume, and the room itself (the bot, replays).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/sim/game.ts";
import { Bot } from "../src/sim/bot.ts";
import { BREACH, DIFFICULTY, DT, METER } from "../src/sim/tuning.ts";
import { emptyInput, type GameEvent, type InputFrame } from "../src/sim/types.ts";
import { boxNode, level, markerNode, room3 } from "./helpers.ts";

const PI = Math.PI;

/** A hall (x -1.3..1.3) running north into a locked door at z -8, the office behind it (a deaf heavy and
 *  a deaf goon, group "office"), the breach trigger over the last 4 m of the hall. */
const doorLevel = () => level([
  markerNode("spawn", "spawn", [0, 0, -2], {}, PI),
  boxNode("wall-w", [-1.5, 1.5, -4], [0.4, 3, 10]),
  boxNode("wall-e", [1.5, 1.5, -4], [0.4, 3, 10]),
  boxNode("front-w", [-1.6, 1.5, -8], [2, 3, 0.2]),
  boxNode("front-e", [1.6, 1.5, -8], [2, 3, 0.2]),
  boxNode("door-x", [0, 1.1, -8], [1.2, 2.2, 0.1], { surface: "wood" }),
  boxNode("office-back", [0, 1.5, -18], [12, 3, 0.4]),
  markerNode("heavy", "enemy", [-2, 0, -14], { kind: "heavy", group: "office", deaf: true }, 0),
  markerNode("goon", "enemy", [2, 0, -14], { kind: "goon", group: "office", deaf: true, milady: 5 }, 0),
  markerNode("breach", "trigger", [0, 1, -6], { action: "breach", door: "door-x", group: "office" }, 0, [2.6, 3, 4]),
]);

function run(g: Game, inp: InputFrame, steps: number, out: GameEvent[] = []): GameEvent[] {
  for (let i = 0; i < steps; i++) { g.step(inp); out.push(...g.drain()); }
  return out;
}

test("breach: a dive into the door inside its trigger takes the collider out once, 0.2 world speed for 1 s real, no meter, the office wakes 0.5 s late", () => {
  const g = new Game(doorLevel(), { seed: 3 });
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  inp.moveY = 1;
  const ev = run(g, inp, 60); // walk into the trigger (the hint)
  assert.ok(ev.some(e => e.type === "trigger" && e.action === "breach"), "the hint fires on entry");
  assert.ok(g.player.z < -4 && g.player.z > -7.5, `in the trigger, short of the door (${g.player.z})`);
  assert.equal(g.enemies.every(e => e.state === "idle"), true, "the office is there from the start (not a spawn group)");
  const meter = g.meter;
  inp.dodge = true; g.step(inp); inp.dodge = false;
  ev.length = 0;
  let breachAt = -1;
  for (let i = 0; i < 120 * 3; i++) {
    g.step(inp);
    for (const e of g.drain()) { ev.push(e); if (e.type === "breach") breachAt = i; }
    if (breachAt >= 0 && i === breachAt) assert.ok(Math.abs(g.timeScale - BREACH.slowScale) < 1e-6, "slow motion at once");
    if (breachAt >= 0 && i === breachAt + Math.round(0.95 / DT)) assert.ok(g.timeScale < 0.21, `still slow after 0.95 s real (${g.timeScale})`);
    if (breachAt >= 0 && i === breachAt + Math.round(1.6 / DT)) assert.ok(g.timeScale > 0.9, `back to speed after the dive (${g.timeScale})`);
  }
  const breaches = ev.filter((e): e is Extract<GameEvent, { type: "breach" }> => e.type === "breach");
  assert.equal(breaches.length, 1);
  assert.deepEqual([breaches[0].id, breaches[0].kick], ["door-x", false]);
  assert.ok(breaches[0].dz < -0.9, "the door flies along the dive");
  assert.ok(g.world.off.has("door-x") && g.breached.includes("door-x"));
  assert.ok(g.player.z < -8.5, `he went through (${g.player.z})`);
  assert.equal(g.meter, meter, "no meter cost");
  // the office woke: later than a plain alert by BREACH.react
  const alerts = ev.filter(e => e.type === "alert").length;
  assert.equal(alerts, 2);
  assert.ok(g.enemies.every(e => !e.deaf));
});

test("breach: the reaction delay is BREACH.react longer than a plain alert", () => {
  const g = new Game(doorLevel(), { seed: 5 });
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  inp.moveY = 1;
  run(g, inp, 60);
  inp.dodge = true; g.step(inp); inp.dodge = false;
  let react = -1;
  for (let i = 0; i < 120 && react < 0; i++) { g.step(inp); g.drain(); if (g.breached.length) react = g.enemies[0].react; }
  const lo = DIFFICULTY.normal.reaction * 0.85;
  assert.ok(react >= lo + BREACH.react - 1e-9, `react ${react}`);
});

test("breach: walking into the door does nothing; after 25 s in the trigger the heavy inside kicks it open", () => {
  const g = new Game(doorLevel(), { seed: 2 });
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  inp.moveY = 1;
  const ev = run(g, inp, Math.round(24 / DT));
  assert.equal(ev.filter(e => e.type === "breach").length, 0);
  assert.ok(!g.world.off.has("door-x"));
  assert.ok(g.player.z > -7.75, "the door holds him");
  assert.ok(g.enemies.every(e => e.state === "idle"), "nobody inside heard him");
  run(g, inp, Math.round(2 / DT), ev);
  const b = ev.filter((e): e is Extract<GameEvent, { type: "breach" }> => e.type === "breach");
  assert.equal(b.length, 1);
  assert.equal(b[0].kick, true);
  assert.ok(b[0].dz > 0.9, "kicked out toward the hall");
  const heavy = g.enemies[0];
  assert.ok(Math.abs(heavy.x) < 0.3 && heavy.z < -8.5 && heavy.z > -9.5, `the kicker stands in the doorway (${heavy.x}, ${heavy.z})`);
  assert.ok(g.enemies.every(e => e.state !== "idle"), "the office is awake");
});

test("breach: a dive away from the door, or one that lands short of it, leaves it shut", () => {
  const g = new Game(doorLevel(), { seed: 2 });
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  inp.moveY = 1;
  run(g, inp, 60); // into the trigger
  // dive back the way he came (moveY -1: away from the door)
  inp.moveY = -1;
  inp.dodge = true; g.step(inp); inp.dodge = false;
  inp.moveY = 0;
  let ev = run(g, inp, 240);
  assert.equal(ev.filter(e => e.type === "breach").length, 0);
  // from 8 m out, straight at it: the dive runs out ~2.4 m short
  const h = new Game(doorLevel(), { seed: 2 });
  const i2 = emptyInput();
  i2.yaw = h.player.yaw;
  i2.moveY = -1;
  run(h, i2, 70); // back to z ~ 0
  i2.moveY = 1;
  i2.dodge = true; h.step(i2); i2.dodge = false;
  i2.moveY = 0;
  ev = run(h, i2, 240);
  assert.equal(ev.filter(e => e.type === "breach").length, 0);
  assert.ok(!h.world.off.has("door-x"));
});

test("deaf enemies sleep through gunfire; groups spawn only when a spawn trigger names them", () => {
  const g = new Game(level([
    markerNode("spawn", "spawn", [0, 0, 0], {}, PI),
    markerNode("deaf", "enemy", [3, 0, 6], { kind: "goon", deaf: true, milady: 3 }, 0),
    markerNode("hearing", "enemy", [-3, 0, 6], { kind: "goon", milady: 4 }, 0),
    markerNode("later", "enemy", [0, 0, 8], { kind: "rusher", group: "later" }, 0),
    markerNode("alerted", "enemy", [5, 0, 8], { kind: "goon", group: "hall", milady: 6 }, 0),
    markerNode("t-later", "trigger", [0, 1, -30], { action: "spawn", group: "later" }, 0, [2, 2, 2]),
    markerNode("t-hall", "trigger", [0, 1, -30], { action: "alert", group: "hall" }, 0, [2, 2, 2]),
  ]), { seed: 1 });
  assert.deepEqual(g.enemies.map(e => e.state), ["idle", "idle", "inactive", "idle"]);
  const inp = emptyInput();
  inp.yaw = g.player.yaw; // facing away from all of them (-Z)
  inp.fire = true;
  run(g, inp, 30);
  assert.equal(g.enemies[0].state, "idle", "deaf: slept through it");
  assert.notEqual(g.enemies[1].state, "idle", "the other one heard it");
});

test("whenClear triggers fire once the group is down; the checkpoint resumes the room as it was", () => {
  const lv = level([
    markerNode("spawn", "spawn", [0, 0, 0], {}, PI),
    markerNode("cp", "checkpoint", [4, 0, -4], {}, PI / 2),
    markerNode("a", "enemy", [0, 0, -6], { kind: "goon", group: "office", milady: 2 }, 0),
    markerNode("b", "enemy", [20, 0, -30], { kind: "rusher", group: "backup" }, 0),
    markerNode("c", "enemy", [-20, 0, -30], { kind: "goon", milady: 9 }, 0),
    markerNode("sg", "pickup", [0, 0, -1.5], { item: "shotgun" }),
    markerNode("t-backup", "trigger", [0, -40, 0], { action: "spawn", group: "backup", whenClear: "office" }, 0, [0.2, 0.2, 0.2]),
    markerNode("t-cp", "trigger", [0, -40, 0], { action: "checkpoint", whenClear: "office", at: "cp" }, 0, [0.2, 0.2, 0.2]),
  ]);
  const g = new Game(lv, { seed: 4, ai: false });
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  inp.moveY = 1;
  run(g, inp, 60); // picks the shotgun up
  inp.moveY = 0;
  assert.ok(g.player.owned.includes("shotgun"));
  assert.equal(g.enemies[1].state, "inactive");
  assert.equal(g.saved, null);
  // down the office goon
  inp.pitch = -0.08;
  const ev: GameEvent[] = [];
  for (let i = 0; i < 400 && g.enemies[0].state !== "dead"; i++) { inp.fire = i % 2 === 0; g.step(inp); ev.push(...g.drain()); }
  inp.fire = false;
  run(g, inp, 2, ev);
  assert.equal(g.enemies[0].state, "dead");
  assert.ok(ev.some(e => e.type === "trigger" && e.id === "t-backup"));
  assert.ok(ev.some(e => e.type === "trigger" && e.id === "t-cp"));
  assert.notEqual(g.enemies[1].state, "inactive", "the backup came");
  const s = g.saved!;
  assert.ok(s);
  assert.deepEqual([s.x, s.z, s.dead, s.owned], [4, -4, ["a"], ["pistols", "shotgun"]]);
  // a retry from it: the goon stays down, the shotgun is his, the pickup is gone, the backup is awake,
  // the checkpoint does not fire twice, the kills carry over
  const r = new Game(lv, { seed: 4, ai: false, resume: s });
  assert.ok(r.resumed);
  assert.deepEqual([r.player.x, r.player.z], [4, -4]);
  assert.equal(r.enemies[0].state, "dead");
  assert.equal(r.enemies[1].state, "idle");
  assert.equal(r.enemies[2].state, "idle");
  assert.ok(r.player.owned.includes("shotgun"));
  assert.equal(r.pickups.find(k => k.id === "sg")!.taken, true);
  assert.equal(r.stats.kills, 1);
  assert.equal(r.alive, 2);
  const e2 = run(r, emptyInput(), 30);
  assert.ok(!e2.some(e => e.type === "trigger"), "nothing re-fires");
  assert.equal(r.saved, s, "the checkpoint holds for the next retry");
});

test("checkpoint: a resume keeps a breached door open and restores at least 60 HP", () => {
  const g = new Game(doorLevel(), { seed: 3 });
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  inp.moveY = 1;
  run(g, inp, 60);
  inp.dodge = true; g.step(inp); inp.dodge = false;
  run(g, inp, 120);
  assert.ok(g.world.off.has("door-x"));
  const lv = doorLevel();
  const r = new Game(lv, { seed: 3, resume: { x: 0, y: 0, z: -10, facing: PI, dead: ["goon"], breached: ["door-x"], taken: [], fired: ["breach"], drops: [], owned: ["pistols"], weapon: "pistols", ammo: [["pistols", 5, 7, Infinity]], health: 12, copium: 0, meter: 1, stats: { ...g.stats } } });
  assert.ok(r.world.off.has("door-x") && r.breached.includes("door-x"));
  assert.equal(r.player.health, 60);
  assert.ok(r.meter >= METER.start * 0.5);
  assert.equal(r.enemies[0].deaf, false, "the office is no longer behind a door");
  assert.equal(r.enemies[1].state, "dead");
  assert.deepEqual(r.player.weapon.mags, [5, 7]);
});

test("smoke: the bot clears room 3 (the corridor heavy, the storage room, the breach, the manager) and reaches the elevator (normal)", () => {
  const lv = room3();
  for (const [seed, demo] of [[1, false], [2, false], [3, false], [1, true]] as const) {
    const g = new Game(lv, { seed, difficulty: "normal" });
    const bot = new Bot(3.5, 0.3, demo);
    let killcam = false, dove = false, cp = false;
    for (let i = 0; i < 120 * 150 && g.phase !== "done" && g.phase !== "dead"; i++) {
      g.step(bot.next(g));
      if (g.phase === "killcam") killcam = true;
      for (const e of g.drain()) {
        if (e.type === "breach" && !e.kick) dove = true;
        if (e.type === "trigger" && e.action === "checkpoint") cp = true;
      }
    }
    assert.equal(g.phase, "done", `room3 seed ${seed}: ${g.phase}, ${g.alive} alive, hp ${g.player.health}`);
    assert.equal(g.stats.kills, 9);
    assert.deepEqual(g.enemies.map(e => e.kind).sort(), ["goon", "goon", "goon", "heavy", "heavy", "heavy", "rusher", "rusher", "rusher"]);
    assert.ok(killcam, "final-kill cam played");
    assert.ok(dove, "went through the office door with a dive");
    assert.ok(cp, "the checkpoint after the security office");
    assert.ok(g.player.owned.includes("shotgun"), "the heavy's shotgun picked up");
  }
});

test("replay: room 3 replays bit-exactly (the breach included)", () => {
  const g = new Game(room3(), { seed: 6, difficulty: "hard" });
  const bot = new Bot();
  const log: InputFrame[] = [];
  const hashes: string[] = [];
  let breached = false;
  for (let i = 0; i < 120 * 40 && g.phase === "play"; i++) {
    const f = { ...bot.next(g) };
    log.push(f);
    g.step(f);
    hashes.push(g.hash());
    if (g.breached.length) breached = true;
  }
  assert.ok(breached, "the log reaches the breach");
  const r = new Game(room3(), { seed: 6, difficulty: "hard" });
  for (let i = 0; i < log.length; i++) {
    r.step({ ...log[i] });
    if (r.hash() !== hashes[i]) assert.fail(`diverged at step ${i}`);
  }
});
