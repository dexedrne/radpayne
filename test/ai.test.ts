import { test } from "node:test";
import assert from "node:assert/strict";
import { SHOULDER } from "../src/sim/aim.ts";
import { Game } from "../src/sim/game.ts";
import { DIFFICULTY, DT } from "../src/sim/tuning.ts";
import { emptyInput } from "../src/sim/types.ts";
import { boxNode, level, markerNode } from "./helpers.ts";

const R90 = Math.PI / 2;

// Player at the origin facing -Z; a goon 16 m away facing him; a low barrier with a cover point
// behind it (protecting toward +Z, i.e. toward the player) and one on the far side.
const arena = () => level([
  markerNode("spawn", "spawn", [0, 0, 0], {}, Math.PI),
  markerNode("goon", "enemy", [3, 0, -16], { milady: 3 }, 0),
  boxNode("barrier", [2, 0.5, -10], [3, 1, 0.6]),
  markerNode("cover-front", "cover", [2, 0, -10.8], { height: "low" }, 0),
  markerNode("cover-side", "cover", [-6, 0, -12], { height: "low" }, 0),
  boxNode("barrier-2", [-6, 0.5, -11.2], [3, 1, 0.6]),
  markerNode("wp-0", "waypoint", [5, 0, -14]),
  markerNode("wp-1", "waypoint", [-3, 0, -14]),
]);

function run(g: Game, steps: number, onStep?: (i: number) => void) {
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  for (let i = 0; i < steps; i++) { g.step(inp); onStep?.(i); }
}

test("goon: idle -> alert (reaction delay) -> move -> cover -> peek and shoot", () => {
  for (const d of ["easy", "normal", "hard"] as const) {
    const g = new Game(arena(), { difficulty: d, seed: 11 });
    const e = g.enemies[0];
    const seen: string[] = [];
    let alertAt = -1, moveAt = -1, firstCover = -1;
    run(g, 120 * 12, i => {
      if (seen[seen.length - 1] !== e.state) seen.push(e.state);
      if (firstCover < 0 && e.cover >= 0) firstCover = e.cover;
      if (e.state === "alert" && alertAt < 0) alertAt = i;
      if (e.state === "move" && moveAt < 0) moveAt = i;
    });
    for (const s of ["idle", "alert", "move", "cover", "peek"]) assert.ok(seen.includes(s), `${d}: reached ${s} (${seen.join(" > ")})`);
    assert.ok(seen.indexOf("alert") < seen.indexOf("move") && seen.indexOf("move") < seen.indexOf("cover") && seen.indexOf("cover") < seen.indexOf("peek"), seen.join(" > "));
    const react = (moveAt - alertAt) * DT;
    const want = DIFFICULTY[d].reaction;
    assert.ok(react >= want * 0.84 && react <= want * 1.16 + 0.02, `${d} reaction ${react} vs ${want}`);
    assert.equal(g.graph.covers[firstCover].id, "cover-front");
    assert.ok(e.shots > 0, "fired from cover");
  }
});

test("goon: crouches in low cover (lower hit pose), stands to peek", () => {
  const g = new Game(arena(), { seed: 5 });
  const e = g.enemies[0];
  let crouchedInCover = false, stoodToPeek = false;
  run(g, 120 * 12, () => {
    if (e.state === "cover" && e.hit.pose.stance === "crouch") crouchedInCover = true;
    if (e.state === "peek" && e.hit.pose.stance === "stand") stoodToPeek = true;
  });
  assert.ok(crouchedInCover && stoodToPeek);
});

test("goon: a flanked cover point makes it move to another", () => {
  const g = new Game(arena(), { seed: 5 });
  const e = g.enemies[0];
  run(g, 120 * 6);
  assert.ok(e.state === "cover" || e.state === "peek", e.state);
  const first = e.cover;
  // teleport the player behind the barrier line
  g.player.x = 2; g.player.z = -20;
  let moved = false;
  run(g, 120 * 3, () => { if (e.state === "move" || e.state === "engage") moved = true; });
  assert.ok(moved, "left the flanked cover");
  assert.notEqual(e.cover, first);
});

test("goon: a hit alerts an idle goon (facing away) and flinches it", () => {
  const g = new Game(level([markerNode("spawn", "spawn", [0, 0, 0], {}, Math.PI), markerNode("goon", "enemy", [0, 0, -12], { milady: 3 }, Math.PI)]), { seed: 2 });
  const e = g.enemies[0];
  run(g, 60);
  assert.equal(e.state, "idle", "cannot see him from behind");
  const inp = emptyInput();
  for (let k = 0; k < 3; k++) {
    const p = g.player;
    const q = { x: p.x + Math.cos(inp.yaw) * SHOULDER.right, y: p.y + p.pivotUp, z: p.z - Math.sin(inp.yaw) * SHOULDER.right };
    const ex = 0 - q.x, ey = 1.25 - q.y, ez = -12 - q.z, el = Math.hypot(ex, ey, ez);
    inp.yaw = Math.atan2(-ex, -ez);
    inp.pitch = Math.asin(ey / el);
    g.step(inp);
  }
  inp.fire = true;
  g.step(inp);
  assert.equal(e.hp, 26);
  assert.equal(e.state, "alert");
  assert.ok(e.flinch > 0);
});

test("goon: bullet time stretches its reaction by 1 / 0.3 in real time", () => {
  const reactTime = (bt: boolean) => {
    const h = new Game(level([markerNode("spawn", "spawn", [0, 0, 0], {}, Math.PI), markerNode("goon", "enemy", [0, 0, -12], { milady: 3 }, Math.PI)]), { seed: 2 });
    const inp = emptyInput();
    inp.yaw = h.player.yaw;
    if (bt) inp.bt = true;
    h.step(inp);
    inp.bt = false;
    for (let i = 0; i < 120; i++) h.step(inp);
    h.enemies[0].facing = 0; // turn around: sees him at the next check
    let a = -1, b = -1;
    for (let i = 0; i < 1200 && b < 0; i++) {
      h.step(inp);
      const s = h.enemies[0].state;
      if (s === "alert" && a < 0) a = i;
      if (a >= 0 && s !== "alert") b = i;
    }
    return (b - a) * DT;
  };
  const normal = reactTime(false), slow = reactTime(true);
  const k = slow / normal;
  assert.ok(Math.abs(k - 1 / 0.3) < 0.15, `bullet time reaction x${k.toFixed(2)}`);
});
