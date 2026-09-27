// Cover (sim/cover.ts): derived from the colliders, the player's cover moves (take, slide, pop out, blind
// fire, vault, dash, leave), shots from the front stopped by it and from the flank not, and the gang using
// the same points.
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.ts";
import { COVER, aiCovers, deriveCover, openA, openB } from "../src/sim/cover.ts";
import { boxNode, level } from "./helpers.ts";

/** A crate (1 m high, 2 m wide) at z = -5 and a wall (3 m high, 3 m wide) at x = 6, on a floor. */
export function coverArena(extra: ReturnType<typeof boxNode>[] = []) {
  return level([
    boxNode("crate", [0, 0.5, -5], [2, 1, 0.8]),
    boxNode("wall", [6, 1.5, -5], [3, 3, 0.4]),
    boxNode("post", [-6, 1.5, -5], [0.2, 3, 0.2]),
    ...extra,
  ]);
}

test("cover: derived from the colliders, low behind a crate, high with two open edges behind a wall, none behind a post", () => {
  const lv = coverArena();
  const segs = deriveCover(new World(lv.boxes));
  const crate = segs.filter(s => s.nodes.includes("crate"));
  const wall = segs.filter(s => s.nodes.includes("wall"));
  assert.equal(segs.filter(s => s.nodes.includes("post")).length, 0, "a post is no cover");
  assert.ok(crate.length >= 2 && crate.every(s => !s.high), "the crate is low cover on its long sides");
  const south = crate.find(s => s.nz > 0.9)!;
  assert.ok(south, "a segment on the crate's south side (normal +z)");
  assert.ok(Math.abs(south.top - 1) < 0.05, `its height is the crate's (${south.top})`);
  assert.ok(Math.abs(south.az - (-5 + 0.4 + COVER.off)) < 0.01, "he stands a hand off its face");
  assert.ok(south.len > 1.4 && south.len < 2, `it runs along the crate (${south.len})`);
  const back = wall.find(s => s.nz > 0.9)!;
  assert.ok(back.high && back.tall, "the wall is high cover, tall enough to hide standing");
  assert.ok(openA(back) && openB(back), "both of its ends are open edges");
  // the gang's points: one or more along the crate, one at each of the wall's edges, facing -n
  const pts = aiCovers(segs);
  const wp = pts.filter(c => c.seg === back.id);
  assert.equal(wp.length, 2);
  assert.ok(wp.every(c => c.high && Math.abs(c.fz + 1) < 1e-6));
  assert.notEqual(wp[0].side, wp[1].side, "they lean out of opposite edges");
  assert.ok(pts.filter(c => c.seg === south.id).length >= 1);
});

test("cover: a segment against a wall that continues (a corner) has no open edge on that end; deriving is deterministic", () => {
  const lv = coverArena([boxNode("return", [7.3, 1.5, -3.8], [0.4, 3, 2])]);
  const w = new World(lv.boxes);
  const a = deriveCover(w), b = deriveCover(w);
  assert.deepEqual(a, b);
  const back = a.find(s => s.nodes.includes("wall") && s.nz > 0.9)!;
  assert.ok(openA(back) !== openB(back), "one end runs into the return wall");
});
