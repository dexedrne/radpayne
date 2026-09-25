import { test } from "node:test";
import assert from "node:assert/strict";
import { SHOULDER } from "../src/sim/aim.ts";
import { HB_HEAD, HB_LEG_L, HB_LEG_R, HB_TORSO, aimPoint, makeCapsules } from "../src/combat/hitboxes.ts";
import { HIT_ACTOR, HIT_NONE, HIT_WORLD, makeHitActor, makeTraceHit, trace } from "../src/combat/trace.ts";
import { World, makeBox } from "../src/sim/world.ts";
import { Game } from "../src/sim/game.ts";
import { emptyInput } from "../src/sim/types.ts";
import { boxNode, level, markerNode } from "./helpers.ts";

const empty = new World([]);

function milady(x: number, z: number, yaw = 0, stance: "stand" | "crouch" = "stand") {
  const a = makeHitActor("milady", 1);
  Object.assign(a.pose, { x, y: 0, z, yaw, stance });
  return a;
}

function shootAt(actors: ReturnType<typeof milady>[], world: World, tx: number, ty: number, tz: number) {
  const ox = 0, oy = 1.5, oz = 0;
  const dx = tx - ox, dy = ty - oy, dz = tz - oz, l = Math.hypot(dx, dy, dz);
  return trace(world, actors, 0, ox, oy, oz, dx / l, dy / l, dz / l, 100, makeTraceHit());
}

test("hitscan finds the head, the torso and the legs on the bone hitboxes", () => {
  const m = milady(0, -10);
  const caps = makeCapsules();
  const p = { x: 0, y: 0, z: 0 };
  for (const [part, name] of [[HB_HEAD, "head"], [HB_TORSO, "torso"], [HB_LEG_L, "leg"]] as const) {
    aimPoint("milady", m.pose, part, p, caps);
    const h = shootAt([m], empty, p.x, p.y, p.z);
    assert.equal(h.kind, HIT_ACTOR, name);
    assert.equal(h.part === HB_LEG_R ? HB_LEG_L : h.part, part, name);
  }
  // beside the head: a miss
  const miss = shootAt([m], empty, 0.6, 1.74, -10);
  assert.notEqual(miss.kind, HIT_ACTOR);
});

test("a crouched goon's head is lower; a wall in front blocks", () => {
  const stand = milady(0, -10), crouch = milady(0, -10, 0, "crouch");
  const caps = makeCapsules();
  const hs = { x: 0, y: 0, z: 0 }, hc = { x: 0, y: 0, z: 0 };
  aimPoint("milady", stand.pose, HB_HEAD, hs, caps);
  aimPoint("milady", crouch.pose, HB_HEAD, hc, caps);
  assert.ok(hc.y < hs.y - 0.4);
  assert.notEqual(shootAt([crouch], empty, hs.x, hs.y, hs.z).part, HB_HEAD);
  const wall = new World([makeBox(0, "wall", 0, 1, -5, 4, 2.4, 0.3)]);
  const h = shootAt([stand], wall, hs.x, hs.y, hs.z);
  assert.equal(h.kind, HIT_WORLD);
  assert.ok(Math.abs(h.z + 4.85) < 1e-6, `wall face z ${h.z}`);
  assert.ok(Math.abs(h.nz - 1) < 1e-9, "normal faces the shooter");
});

test("rotated boxes: a yawed box blocks along its rotated extent", () => {
  const w = new World([makeBox(0, "cab", 0, 0.75, -10, 4.6, 1.5, 1.9, Math.PI / 2)]); // long side along z now
  const h = trace(w, [], 0, 1.5, 1, 0, 0, 0, -1, 100, makeTraceHit()); // x = 1.5 is outside the 0.95 half width
  assert.equal(h.kind, HIT_NONE);
  const h2 = trace(w, [], 0, 0.5, 1, 0, 0, 0, -1, 100, makeTraceHit());
  assert.equal(h2.kind, HIT_WORLD);
  assert.ok(Math.abs(h2.z + 7.7) < 1e-6, `front face z ${h2.z}`);
});

test("in game: a pistol headshot kills a goon (34 x 3), a body shot does not", () => {
  const lv = level([
    markerNode("spawn", "spawn", [0, 0, 0], {}, Math.PI), // facing -Z
    markerNode("g", "enemy", [0, 0, -12], { milady: 1 }, 0),
    boxNode("far", [0, 2, -40], [20, 4, 1]),
  ]);
  const aimAt = (part: number) => {
    const g = new Game(lv, { ai: false });
    const e = g.enemies[0];
    const caps = makeCapsules();
    const t = { x: 0, y: 0, z: 0 };
    aimPoint("milady", e.hit.pose, part, t, caps);
    // aim from the shoulder pivot
    const p = g.player;
    const inp = emptyInput();
    const px = p.x + Math.cos(0) * SHOULDER.right, py = p.y + p.pivotUp, pz = p.z;
    const dx = t.x - px, dy = t.y - py, dz = t.z - pz, l = Math.hypot(dx, dy, dz);
    inp.yaw = Math.atan2(-dx, -dz);
    inp.pitch = Math.asin(dy / l);
    g.step(inp); // aim settles (pivot follows the new yaw)
    const q = { x: p.x + Math.cos(inp.yaw) * SHOULDER.right, y: p.y + p.pivotUp, z: p.z - Math.sin(inp.yaw) * SHOULDER.right };
    const ex = t.x - q.x, ey = t.y - q.y, ez = t.z - q.z, el = Math.hypot(ex, ey, ez);
    inp.yaw = Math.atan2(-ex, -ez);
    inp.pitch = Math.asin(ey / el);
    g.step(inp);
    assert.equal(g.aimEnemy, 0, "crosshair on the goon");
    inp.fire = true;
    g.step(inp);
    return g;
  };
  const head = aimAt(HB_HEAD);
  assert.equal(head.enemies[0].state, "dead");
  assert.equal(head.enemies[0].headshot, true);
  const body = aimAt(HB_TORSO);
  assert.equal(body.enemies[0].hp, 60 - 34);
});
