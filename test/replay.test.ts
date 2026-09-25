import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/sim/game.ts";
import { Bot } from "../src/sim/bot.ts";
import type { InputFrame } from "../src/sim/types.ts";
import { greybox } from "./helpers.ts";

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

test("smoke: the bot clears the room-1 greybox and walks out (normal)", () => {
  for (const seed of [1, 2, 3]) {
    const g = new Game(greybox(), { seed, difficulty: "normal" });
    const bot = new Bot();
    let killcam = false;
    for (let i = 0; i < 120 * 120 && g.phase !== "done" && g.phase !== "dead"; i++) {
      g.step(bot.next(g));
      if (g.phase === "killcam") killcam = true;
      g.drain();
    }
    assert.equal(g.phase, "done", `seed ${seed}: ${g.phase}, ${g.alive} alive, hp ${g.player.health}`);
    assert.equal(g.stats.kills, g.enemies.length);
    assert.ok(killcam, "final-kill cam played");
  }
});
