// #250's AK: his base gun in place of the dual pistols (slot 1, never runs dry), full auto at 600 rpm
// from one 30-round mag, and a fight with it plays out and replays like any other.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/sim/game.ts";
import { Bot } from "../src/sim/bot.ts";
import { WEAPONS, isLongGun, makeWeapon, slotOf, triggerWeapon, stepWeapon } from "../src/combat/weapons.ts";
import { RADBROS, baseWeaponOf } from "../src/ui/store.ts";
import { RADBRO_GAIT } from "../src/anim/gait.ts";
import { RADBRO_GRIPS, SHOTGUN_SCALE } from "../src/anim/grips.ts";
import { emptyInput } from "../src/sim/types.ts";
import { greybox, room1 } from "./helpers.ts";

test("roster: #250 carries the AK, everyone else the pistols; every Radbro has a gait, grips and a shotgun scale", () => {
  assert.equal(baseWeaponOf("250"), "ak");
  for (const r of RADBROS) {
    if (r.id !== "250") assert.equal(baseWeaponOf(r.id), "pistols", `#${r.id}`);
    assert.ok(RADBRO_GAIT[r.id].run > 2 && RADBRO_GAIT[r.id].walk > 0.4, `#${r.id} gait`);
    assert.ok(RADBRO_GRIPS[r.id].right.p.length === 3 && RADBRO_GRIPS[r.id].left.q.length === 4, `#${r.id} grips`);
    assert.ok(SHOTGUN_SCALE[r.id] > 0.5 && SHOTGUN_SCALE[r.id] < 0.9, `#${r.id} shotgun scale`);
  }
});

test("AK: full auto, 10 rounds a second from one 30-round mag, then a 2.2 s reload from an endless reserve", () => {
  const d = WEAPONS.ak;
  assert.equal(d.hands, 1);
  assert.equal(d.mag, 30);
  assert.ok(d.auto && d.reserve === Infinity);
  assert.ok(isLongGun("ak") && isLongGun("shotgun") && !isLongGun("pistols"));
  assert.equal(slotOf("ak"), 1);
  assert.equal(slotOf("pistols"), 1);
  const w = makeWeapon("ak");
  const dt = 1 / 120;
  let shots = 0;
  for (let i = 0; i < 120; i++) { stepWeapon(w, dt); if (triggerWeapon(w, true) >= 0) shots++; }
  assert.ok(shots >= 10 && shots <= 11, `${shots} shots in 1 s`);
  for (let i = 0; i < 120 * 5 && shots < 30; i++) { stepWeapon(w, dt); if (triggerWeapon(w, true) >= 0) shots++; }
  assert.equal(shots, 30);
  assert.ok(w.reloadT > 2 && w.reloadT <= 2.2, "the empty mag starts the reload");
  for (let i = 0; i < 120 * 3; i++) stepWeapon(w, dt);
  assert.equal(w.mags[0], 30);
  assert.equal(w.reserve, Infinity);
});

test("a game with base 'ak': he owns only the AK, a pickup's shotgun is slot 2 and key 1 goes back to the AK", () => {
  const g = new Game(greybox(), { ai: false, seed: 1, base: "ak" });
  assert.deepEqual(g.player.owned, ["ak"]);
  assert.equal(g.player.weapon.id, "ak");
  const h = new Game(greybox(), { ai: false, seed: 1, base: "ak", loadout: ["shotgun"] });
  assert.deepEqual(h.player.owned, ["ak", "shotgun"]);
  assert.equal(h.player.weapon.id, "shotgun");
  const step = (slot: number) => { const f = emptyInput(); f.slot = slot; h.step(f); for (let i = 0; i < 60; i++) h.step(emptyInput()); };
  step(1);
  assert.equal(h.player.weapon.id, "ak");
  step(2);
  assert.equal(h.player.weapon.id, "shotgun");
  step(3); // no SMGs owned: nothing happens
  assert.equal(h.player.weapon.id, "shotgun");
  step(9); // next owned wraps round to the AK
  assert.equal(h.player.weapon.id, "ak");
  // the default is still the pistols
  assert.deepEqual(new Game(greybox(), { ai: false, seed: 1 }).player.owned, ["pistols"]);
});

test("smoke: the bot clears room 1 with the AK, and the fight replays bit-exactly", () => {
  for (const [name, lv] of [["greybox", greybox()], ["room1", room1()]] as const) for (const seed of [1, 2]) {
    const g = new Game(lv, { seed, difficulty: "normal", base: "ak" });
    const bot = new Bot();
    const log = [];
    const hashes: string[] = [];
    for (let i = 0; i < 120 * 120 && g.phase !== "done" && g.phase !== "dead"; i++) {
      const f = { ...bot.next(g) };
      log.push(f);
      g.step(f);
      hashes.push(g.hash());
      g.drain();
    }
    assert.equal(g.phase, "done", `${name} seed ${seed}: ${g.phase}, ${g.alive} alive, hp ${g.player.health}`);
    assert.equal(g.stats.kills, g.enemies.length);
    assert.ok(g.stats.shots > 0 && g.player.weapon.id === "ak", `fought with the AK (${g.stats.shots} shots)`);
    const r = new Game(name === "greybox" ? greybox() : room1(), { seed, difficulty: "normal", base: "ak" });
    for (let i = 0; i < log.length; i++) {
      r.step({ ...log[i] });
      if (r.hash() !== hashes[i]) assert.fail(`${name} seed ${seed}: diverged at step ${i}`);
    }
  }
});
