// The stand-in girl (app/standIn.ts): she strides with the ground speed (never slides), stands still
// when the body does, dances, sits and cowers.
import test from "node:test";
import assert from "node:assert/strict";
import { CROWD_LOOK, GOON_LOOK, animateStandIn, makeStandIn } from "../src/app/standIn.ts";

test("stand-in: the legs stride with the ground speed and rest when she stops", () => {
  const si = makeStandIn(GOON_LOOK);
  const swing: number[] = [];
  for (let i = 0; i < 60; i++) { animateStandIn(si, "walk", 1 / 60, 2.5); swing.push(si.legs[0].rotation.x); }
  assert.ok(Math.max(...swing) - Math.min(...swing) > 0.5, "the legs swing while she walks");
  assert.ok(si.legs[0].rotation.x * si.legs[1].rotation.x <= 1e-9, "one leg forward, one back");
  animateStandIn(si, "idle", 1 / 60, 0);
  assert.ok(Math.abs(si.legs[0].rotation.x) < 1e-6 && Math.abs(si.legs[1].rotation.x) < 1e-6, "still legs when she stands");
});

test("stand-in: a dancer moves on her own, a seated girl folds her legs, a cowering one crouches", () => {
  const d = makeStandIn(CROWD_LOOK);
  const ys: number[] = [];
  for (let i = 0; i < 60; i++) { animateStandIn(d, "dance", 1 / 60); ys.push(d.body.position.y); }
  assert.ok(Math.max(...ys) - Math.min(...ys) > 0.02, "the dancer bobs");
  const s = makeStandIn(CROWD_LOOK);
  animateStandIn(s, "sit", 1 / 60);
  assert.ok(s.legs[0].rotation.x < -1.2 && s.body.position.y < 0.6, "legs forward, hips down");
  const c = makeStandIn(CROWD_LOOK);
  animateStandIn(c, "cower", 1 / 60);
  assert.ok(c.body.position.y < 0.7 && c.body.rotation.x > 0.2, "down and hunched");
});
