import { test } from "node:test";
import assert from "node:assert/strict";
import { WEAPONS, ammoIn, makeWeapon, startReload, stepWeapon, triggerWeapon } from "../src/combat/weapons.ts";
import { DT } from "../src/sim/tuning.ts";

test("dual pistols: 0.12 s between shots, alternating hands", () => {
  const w = makeWeapon("pistols");
  const shots: Array<{ step: number; hand: number }> = [];
  for (let i = 0; i < 120; i++) {
    stepWeapon(w, DT);
    const h = triggerWeapon(w, true);
    if (h >= 0) shots.push({ step: i, hand: h });
  }
  // 1 s held: 0, 0.12, ... 0.96 -> 9 shots
  assert.equal(shots.length, 9);
  for (let k = 1; k < shots.length; k++) {
    assert.notEqual(shots[k].hand, shots[k - 1].hand);
    const gap = (shots[k].step - shots[k - 1].step) * DT;
    assert.ok(Math.abs(gap - 0.12) <= DT + 1e-9, `gap ${gap}`); // whole steps; the remainder carries
  }
  // average interval is exact over a long hold (the remainder carries)
  const w2 = makeWeapon("pistols");
  w2.reserve = Infinity;
  let n = 0;
  for (let i = 0; i < 120 * 3; i++) {
    stepWeapon(w2, DT);
    if (w2.mags[0] < 3) w2.mags[0] = w2.mags[1] = 12; // keep it loaded
    if (triggerWeapon(w2, true) >= 0) n++;
  }
  assert.equal(n, 25); // 3 s / 0.12
});

test("dual pistols: 2 x 12 rounds, auto reload when both hands are dry, infinite reserve", () => {
  const w = makeWeapon("pistols");
  let fired = 0, i = 0;
  while (fired < 24 && i < 10000) { stepWeapon(w, DT); if (triggerWeapon(w, true) >= 0) fired++; i++; }
  assert.equal(fired, 24);
  assert.equal(ammoIn(w), 0);
  assert.ok(w.reloadT > 0, "reloading");
  assert.equal(triggerWeapon(w, true), -1);
  let t = 0;
  while (w.reloadT > 0) { stepWeapon(w, DT); t += DT; }
  assert.ok(Math.abs(t - WEAPONS.pistols.reload) < DT + 1e-9);
  assert.deepEqual(w.mags, [12, 12]);
  assert.equal(w.reserve, Infinity);
});

test("R reloads a partial mag; a full one does not reload", () => {
  const w = makeWeapon("pistols");
  assert.equal(startReload(w), false);
  triggerWeapon(w, true);
  triggerWeapon(w, false);
  assert.equal(ammoIn(w), 23);
  assert.equal(startReload(w), true);
  for (let i = 0; i < 200; i++) stepWeapon(w, DT);
  assert.equal(ammoIn(w), 24);
});

test("one empty hand keeps the other firing", () => {
  const w = makeWeapon("pistols");
  w.mags = [0, 5];
  let n = 0;
  for (let i = 0; i < 120 * 2 && w.reloadT === 0; i++) { stepWeapon(w, DT); const h = triggerWeapon(w, true); if (h >= 0) { assert.equal(h, 1); n++; } }
  assert.equal(n, 5);
  assert.ok(w.reloadT > 0, "then reloads");
});
