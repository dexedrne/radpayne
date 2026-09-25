import { test } from "node:test";
import assert from "node:assert/strict";
import { FixedStepper } from "../src/sim/stepper.ts";
import { Game } from "../src/sim/game.ts";
import { DT, METER, PROJECTILE_SPEED, TIME } from "../src/sim/tuning.ts";
import { emptyInput } from "../src/sim/types.ts";
import { level, markerNode } from "./helpers.ts";

const open = () => level([markerNode("spawn", "spawn", [0, 0, 0], {}, Math.PI)]);

test("stepper: 120 Hz steps, backlog capped, alpha in [0, 1)", () => {
  const s = new FixedStepper();
  let n = 0;
  for (let i = 0; i < 60; i++) n += s.frame(1 / 60);
  assert.ok(Math.abs(n - 120) <= 1, `steps in 1 s: ${n}`);
  assert.ok(s.alpha >= 0 && s.alpha < 1);
  assert.equal(s.frame(5), 12); // a 5 s hitch runs at most 12 steps and drops the rest
  assert.ok(s.acc < 1e-9);
});

test("bullet time: eases to 0.3, drains the meter in real time, turns itself off when empty", () => {
  const g = new Game(open(), { ai: false });
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  inp.bt = true;
  g.step(inp);
  inp.bt = false;
  assert.equal(g.bulletTime, true);
  for (let i = 0; i < 120; i++) g.step(inp);
  assert.equal(g.timeScale, TIME.bulletTime);
  assert.ok(Math.abs(g.meter - (METER.start - 121 * DT)) < 1e-9, `meter ${g.meter}`);
  for (let i = 0; i < 120 * 10; i++) g.step(inp);
  assert.equal(g.bulletTime, false);
  assert.equal(g.meter, 0);
  for (let i = 0; i < 240; i++) g.step(inp);
  assert.equal(g.timeScale, 1);
});

test("bullet time: the world runs at 0.3, the player moves at 0.5, the aim stays real time", () => {
  const run = (bt: boolean) => {
    const g = new Game(open(), { ai: false });
    const inp = emptyInput();
    inp.yaw = g.player.yaw;
    if (bt) { inp.bt = true; g.step(inp); inp.bt = false; for (let i = 0; i < 240; i++) g.step(inp); }
    const x0 = g.player.x, z0 = g.player.z, t0 = g.time;
    inp.moveY = 1;
    for (let i = 0; i < 240; i++) g.step(inp); // 2 s real, already at full speed after the first steps
    return { d: Math.hypot(g.player.x - x0, g.player.z - z0), world: g.time - t0, g };
  };
  const normal = run(false), slow = run(true);
  assert.ok(Math.abs(normal.world - 2) < 1e-9);
  assert.ok(Math.abs(slow.world - 2 * TIME.bulletTime) < 1e-9, `world time ${slow.world}`);
  const ratio = slow.d / normal.d;
  assert.ok(Math.abs(ratio - TIME.playerInBulletTime) < 0.03, `move ratio ${ratio}`);
  // aim: a yaw change applies on the very next step whatever the time scale
  const inp = emptyInput();
  inp.yaw = 1.234;
  slow.g.step(inp);
  assert.equal(slow.g.player.yaw, 1.234);
});

test("bullet time: projectiles fly 60 m/s of world time", () => {
  const g = new Game(open(), { ai: false });
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  inp.bt = true;
  g.step(inp);
  inp.bt = false;
  for (let i = 0; i < 240; i++) g.step(inp);
  inp.fire = true;
  g.step(inp);
  inp.fire = false;
  assert.equal(g.projectiles.length, 1);
  const b = g.projectiles[0];
  const x0 = b.x, z0 = b.z;
  g.step(inp);
  const d = Math.hypot(b.x - x0, b.z - z0);
  assert.ok(Math.abs(d - PROJECTILE_SPEED * DT * TIME.bulletTime) < 1e-6, `per-step ${d}`);
});

test("shootdodge: 0.3 time scale for the dive even with an empty meter, ~0.9 s airborne, lands prone", () => {
  const g = new Game(open(), { ai: false });
  g.meter = 0;
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  inp.dodge = true;
  g.step(inp);
  inp.dodge = false;
  assert.equal(g.player.mode, "dive");
  let air = 0;
  while (g.player.mode === "dive" && air < 400) { g.step(inp); air++; }
  assert.ok(Math.abs(air * DT - 0.9) < 0.05, `airborne ${air * DT}`);
  assert.equal(g.player.mode, "prone");
  assert.ok(g.timeScale < 0.5, `time scale during the dive ${g.timeScale}`);
  inp.moveY = 1;
  g.step(inp);
  assert.equal(g.player.mode, "getup");
  let up = 0;
  while (g.player.mode === "getup") { g.step(inp); up++; }
  assert.ok(Math.abs(up * DT - 0.6) < 0.02, `get up ${up * DT}`);
});

test("shootdodge: holding a move key rolls straight into a run", () => {
  const g = new Game(open(), { ai: false });
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  inp.moveX = 1;
  inp.dodge = true;
  g.step(inp);
  inp.dodge = false;
  while (g.player.mode === "dive") g.step(inp);
  assert.equal(g.player.mode, "roll");
  while (g.player.mode === "roll") g.step(inp);
  assert.equal(g.player.mode, "normal");
});
