import { test } from "node:test";
import assert from "node:assert/strict";
import { SHOULDER } from "../src/sim/aim.ts";
import { HIT_ACTOR, HIT_NONE, makeHitActor, makeTraceHit, trace } from "../src/combat/trace.ts";
import { World, makeBox } from "../src/sim/world.ts";
import { Rand } from "../src/sim/math.ts";
import { DT, PROJECTILE_SPEED, TIME } from "../src/sim/tuning.ts";
import { Game } from "../src/sim/game.ts";
import { emptyInput } from "../src/sim/types.ts";
import { aimPoint, makeCapsules, HB_HEAD } from "../src/combat/hitboxes.ts";
import { level, markerNode, boxNode } from "./helpers.ts";

test("a bullet-time projectile through a still scene lands exactly where the hitscan does", () => {
  const world = new World([
    makeBox(0, "cab", 3, 0.75, -9, 4.6, 1.5, 1.9, 0.35),
    makeBox(1, "barrier", -2, 0.5, -6, 0.6, 1, 3.2),
    makeBox(2, "wall", 0, 5, -20, 30, 10, 1),
  ]);
  const actors = [[0, -12, 0, "stand"], [3, -11, 0.4, "crouch"], [-2.5, -8, -0.3, "stand"], [1, -16, 3, "stand"]].map(([x, z, yaw, st]) => {
    const a = makeHitActor("milady", 1);
    Object.assign(a.pose, { x, y: 0, z, yaw, stance: st });
    return a;
  });
  const rng = new Rand(42);
  const step = PROJECTILE_SPEED * DT * TIME.bulletTime;
  let actorHits = 0;
  for (let i = 0; i < 400; i++) {
    const ox = (rng.next() - 0.5) * 2, oy = 1 + rng.next(), oz = 0;
    let dx = (rng.next() - 0.5) * 0.9, dy = (rng.next() - 0.6) * 0.25, dz = -1;
    const l = Math.hypot(dx, dy, dz);
    dx /= l; dy /= l; dz /= l;
    const hs = trace(world, actors, 0, ox, oy, oz, dx, dy, dz, 120, makeTraceHit());
    // the projectile: piecewise traces of one step each
    let x = ox, y = oy, z = oz, left = 120;
    const pr = makeTraceHit();
    for (;;) {
      const len = Math.min(step, left);
      trace(world, actors, 0, x, y, z, dx, dy, dz, len, pr);
      if (pr.kind !== HIT_NONE) break;
      x += dx * len; y += dy * len; z += dz * len;
      left -= len;
      if (left <= 1e-9) break;
    }
    assert.equal(pr.kind, hs.kind, `shot ${i} kind`);
    assert.equal(pr.actor, hs.actor, `shot ${i} actor`);
    assert.equal(pr.part, hs.part, `shot ${i} part`);
    if (hs.kind !== HIT_NONE) assert.ok(Math.hypot(pr.x - hs.x, pr.y - hs.y, pr.z - hs.z) < 1e-6, `shot ${i} point`);
    if (hs.kind === HIT_ACTOR) actorHits++;
  }
  assert.ok(actorHits > 20, `actor hits ${actorHits}`);
});

test("in game: the same headshot in bullet time (projectile) kills like at normal speed (hitscan)", () => {
  const lv = level([
    markerNode("spawn", "spawn", [0, 0, 0], {}, Math.PI),
    markerNode("g", "enemy", [0.4, 0, -14], { milady: 7 }, 0),
    boxNode("far", [0, 2, -40], [20, 4, 1]),
  ]);
  const run = (bt: boolean) => {
    const g = new Game(lv, { ai: false, seed: 3 });
    const inp = emptyInput();
    const caps = makeCapsules(), t = { x: 0, y: 0, z: 0 };
    aimPoint("milady", g.enemies[0].hit.pose, HB_HEAD, t, caps);
    if (bt) { inp.bt = true; g.step(inp); inp.bt = false; }
    for (let k = 0; k < 3; k++) {
      const p = g.player;
      const q = { x: p.x + Math.cos(inp.yaw) * SHOULDER.right, y: p.y + p.pivotUp, z: p.z - Math.sin(inp.yaw) * SHOULDER.right };
      const ex = t.x - q.x, ey = t.y - q.y, ez = t.z - q.z, el = Math.hypot(ex, ey, ez);
      inp.yaw = Math.atan2(-ex, -ez);
      inp.pitch = Math.asin(ey / el);
      g.step(inp);
    }
    inp.fire = true;
    g.step(inp);
    inp.fire = false;
    const flew = g.projectiles.length;
    for (let i = 0; i < 600 && g.projectiles.length; i++) g.step(inp);
    const e = g.enemies[0];
    return { flew, state: e.state, headshot: e.headshot, hp: e.hp };
  };
  const a = run(false), b = run(true);
  assert.equal(a.flew, 0);
  assert.equal(b.flew, 1);
  assert.deepEqual({ state: b.state, headshot: b.headshot, hp: b.hp }, { state: a.state, headshot: a.headshot, hp: a.hp });
  assert.equal(a.state, "dead");
});
