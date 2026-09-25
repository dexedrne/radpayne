import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/sim/game.ts";
import { Bot } from "../src/sim/bot.ts";
import type { InputFrame } from "../src/sim/types.ts";
import { greybox, room1, room2 } from "./helpers.ts";

test("a recorded input log replays bit-exactly (same hash every step)", () => {
  const lv = greybox();
  const g = new Game(lv, { seed: 7, difficulty: "normal" });
  const bot = new Bot();
  const log: InputFrame[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < 120 * 20 && g.phase !== "done" && g.phase !== "dead"; i++) {
    const f = { ...bot.next(g) };
    log.push(f);
    g.step(f);
    hashes.push(g.hash());
  }
  assert.ok(g.stats.kills > 0 && g.stats.shots > 0, "the log has fighting in it");
  const r = new Game(greybox(), { seed: 7, difficulty: "normal" });
  for (let i = 0; i < log.length; i++) {
    r.step({ ...log[i] });
    if (r.hash() !== hashes[i]) assert.fail(`diverged at step ${i}`);
  }
  // a different seed plays differently (spread, AI timers, Milady picks)
  const o = new Game(greybox(), { seed: 8, difficulty: "normal" });
  for (const f of log) o.step({ ...f });
  assert.notEqual(o.hash(), hashes[hashes.length - 1]);
  assert.notDeepEqual(o.enemies.map(e => e.milady), r.enemies.map(e => e.milady));
});

test("smoke: the bot clears room 1 (greybox and the street) and walks out (normal)", () => {
  for (const [name, lv] of [["greybox", greybox()], ["room1", room1()]] as const) for (const seed of [1, 2, 3]) {
    const g = new Game(lv, { seed, difficulty: "normal" });
    const bot = new Bot();
    let killcam = false;
    for (let i = 0; i < 120 * 120 && g.phase !== "done" && g.phase !== "dead"; i++) {
      g.step(bot.next(g));
      if (g.phase === "killcam") killcam = true;
      g.drain();
    }
    assert.equal(g.phase, "done", `${name} seed ${seed}: ${g.phase}, ${g.alive} alive, hp ${g.player.health}`);
    assert.equal(g.stats.kills, g.enemies.length);
    assert.ok(killcam, "final-kill cam played");
  }
});

test("smoke: the bot clears room 2 (the rave: goons, the rusher backup, the crowd) and walks out (normal)", () => {
  const lv = room2();
  for (const seed of [1, 2, 3]) {
    const g = new Game(lv, { seed, difficulty: "normal" });
    const bot = new Bot();
    let killcam = false, crowdHit = false;
    for (let i = 0; i < 120 * 150 && g.phase !== "done" && g.phase !== "dead"; i++) {
      g.step(bot.next(g));
      if (g.phase === "killcam") killcam = true;
      for (const e of g.drain()) if (e.type === "hurt" && e.target >= g.enemies.length) crowdHit = true;
    }
    assert.equal(g.phase, "done", `room2 seed ${seed}: ${g.phase}, ${g.alive} alive, hp ${g.player.health}`);
    assert.equal(g.stats.kills, 11);
    assert.deepEqual(g.enemies.map(e => e.kind).sort(), [..."ggggggg".split("").map(() => "goon"), "rusher", "rusher", "rusher", "rusher"].sort());
    assert.ok(killcam, "final-kill cam played");
    assert.ok(!crowdHit);
    assert.ok(g.crowd.people.every(p => p.state === "gone" || p.state === "cower"), "the floor is clear of dancers");
  }
});

test("replay: room 2 replays bit-exactly (the crowd and the rushers included)", () => {
  const g = new Game(room2(), { seed: 4, difficulty: "hard" });
  const bot = new Bot();
  const log: InputFrame[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < 120 * 25 && g.phase === "play"; i++) {
    const f = { ...bot.next(g) };
    log.push(f);
    g.step(f);
    hashes.push(g.hash());
  }
  const r = new Game(room2(), { seed: 4, difficulty: "hard" });
  for (let i = 0; i < log.length; i++) {
    r.step({ ...log[i] });
    if (r.hash() !== hashes[i]) assert.fail(`diverged at step ${i}`);
  }
  assert.deepEqual(r.crowd.people.map(p => [p.x, p.z, p.state]), g.crowd.people.map(p => [p.x, p.z, p.state]));
});
