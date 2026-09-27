// Secrets (arsenal spec section 4): the rooms' three secrets and two pins each, volumes found once, secret
// doors on E (in reach and facing only), breakables at their HP with their drop, pickups waiting behind
// a door, and a checkpoint keeping what was found, opened and broken.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { Game } from "../src/sim/game.ts";
import { emptyInput, type GameEvent } from "../src/sim/types.ts";
import { boxNode, level, markerNode, room1, room2, room3 } from "./helpers.ts";

const PI = Math.PI;

test("the rooms: three secrets and two pins each; the doors, breakables and eggs are where the spec puts them", () => {
  const want: Record<string, string[]> = { room1: ["723", "652"], room2: ["2564", "4764"], room3: ["3171", "250"] };
  for (const [name, lv] of [["room1", room1()], ["room2", room2()], ["room3", room3()]] as const) {
    assert.equal(lv.markers.filter(m => m.kind === "secret").length, 3, `${name}: three secrets`);
    const pins = lv.markers.filter(m => m.kind === "pickup" && m.data.item === "pin").map(m => String(m.data.pin)).sort();
    assert.deepEqual(pins, [...want[name]].sort(), `${name}: its two pins`);
    // every secret found by a breakable names a breakable that exists
    for (const s of lv.markers.filter(m => m.kind === "secret" && m.data.via === "break")) assert.ok(lv.breakables.some(b => b.secret === s.id), `${name}: ${s.id} has its breakable`);
    const g = new Game(lv, { ai: false, seed: 1 });
    assert.equal(g.stats.secretsTotal, 3);
  }
  assert.deepEqual(room2().doors.map(d => d.id).sort(), ["coat-room", "fire-exit"]);
  assert.deepEqual(room3().doors.map(d => d.id).sort(), ["bookshelf", "janitor"]);
  assert.equal(room2().breakables[0].drop, "grenade");
  assert.ok(room1().markers.some(m => m.kind === "egg" && m.data.egg === "george" && m.data.interact === true));
});

test("check-level passes rooms 1-3 (no notes)", () => {
  const out = execFileSync(process.execPath, [path.resolve(import.meta.dirname, "..", "tools", "check-level.ts")], { encoding: "utf8" });
  for (const r of ["room1", "room2", "room3"]) assert.match(out, new RegExp(`${r}\\.json: .*secrets 3`));
  const notes = out.split("\n").filter(l => l.startsWith("  !"));
  assert.deepEqual(notes.filter(l => /room[123]/.test(l) || true).filter(l => !/greybox/.test(l)), [], notes.join("\n"));
});

const secretRoom = () => level([
  markerNode("spawn", "spawn", [0, 0, 0], {}, PI),
  markerNode("sec-a", "secret", [0, 1, -6], { name: "the corner" }, 0, [2, 3, 2]),
  markerNode("sec-b", "secret", [5, 1, -6], { name: "the crate", via: "break" }, 0, [0.4, 0.4, 0.4]),
  boxNode("door", [-4, 1, -3], [0.2, 2, 1.2], { secretDoor: "d1", open: "swing" }),
  boxNode("crate", [5, 0.5, -3], [1, 1, 1], { breakable: 50, surface: "wood", drop: "grenade", amount: 2, secret: "sec-b" }),
  markerNode("stash", "pickup", [-5.2, 0, -3], { item: "copium", amount: 1, behind: "door" }),
  markerNode("egg", "egg", [3, 1, 2], { egg: "george", interact: true }),
  markerNode("e", "enemy", [0, 0, -30], { milady: 3 }),
]);

test("a secret volume is found once: the event, the count, the stat", () => {
  const g = new Game(secretRoom(), { ai: false, seed: 1 });
  const ev: GameEvent[] = [];
  const p = g.player;
  for (const z of [-2, -6, -2, -6]) { p.z = z; g.step(emptyInput()); ev.push(...g.drain()); }
  const found = ev.filter(e => e.type === "secret");
  assert.equal(found.length, 1);
  assert.deepEqual(found[0], { type: "secret", id: "sec-a", n: 1, of: 2, name: "the corner" });
  assert.equal(g.stats.secrets, 1);
});

test("a secret door opens on E only within reach and facing it; the stash behind it waits for it", () => {
  const g = new Game(secretRoom(), { ai: false, seed: 1 });
  const p = g.player;
  const inp = emptyInput();
  const press = () => { inp.interact = true; g.step(inp); inp.interact = false; return g.drain().filter(e => e.type === "open"); };
  // facing away (looking +Z), 1 m from it: nothing
  p.x = -3; p.z = -3;
  inp.yaw = 0; // looks down -Z
  assert.equal(press().length, 0, "not facing it");
  // too far, facing it
  p.x = -1.5; inp.yaw = PI / 2; // looks down -X
  assert.equal(press().length, 0, "out of reach");
  // the stash behind the door is in pickup reach from here, but waits
  p.x = -3.2; p.z = -3;
  g.step(inp);
  assert.equal(g.pickups.find(k => k.id === "stash")!.taken, false, "not through the door");
  assert.deepEqual(press(), [{ type: "open", node: "door" }]);
  assert.ok(g.world.off.has("door"));
  assert.ok(g.opened.includes("door"));
  p.x = -4.4; // through where it stood
  g.step(inp);
  assert.equal(g.pickups.find(k => k.id === "stash")!.taken, true, "taken once it is open");
  // E at the egg reports it
  p.x = 3; p.z = 3.2; inp.yaw = 0;
  inp.interact = true; g.step(inp); inp.interact = false;
  assert.ok(g.drain().some(e => e.type === "interact" && e.egg === "george"));
});

test("a breakable breaks at its HP (bullets), drops its item below it and counts its secret", () => {
  const g = new Game(secretRoom(), { ai: false, seed: 1 });
  const ev: GameEvent[] = [];
  const shoot = () => { g.shoot(0, -1, 0, 5, 0.5, 0, 0, 0, -1, 30, "pistols"); ev.push(...g.drain()); };
  shoot();
  assert.ok(!g.world.off.has("crate"), "30 of 50");
  shoot();
  assert.ok(g.world.off.has("crate"), "broken at 60");
  assert.ok(ev.some(e => e.type === "break" && e.node === "crate" && e.surface === "wood"));
  const drop = g.pickups.find(k => k.id === "brk-crate")!;
  assert.equal(drop.item, "grenade");
  assert.equal(drop.amount, 2);
  assert.ok(Math.abs(drop.y) < 1e-6, "on the floor below it");
  assert.equal(g.stats.secrets, 1);
  assert.ok(ev.some(e => e.type === "secret" && e.id === "sec-b"));
  // a third shot goes through where it was
  shoot();
  assert.equal(ev.filter(e => e.type === "break").length, 1);
});

test("a checkpoint keeps what was found, opened, broken, the grenades and the banked 9 mm", () => {
  const g = new Game(secretRoom(), { ai: false, seed: 1, grenades: 2 });
  g.player.z = -6; g.step(emptyInput());
  g.shoot(0, -1, 0, 5, 0.5, 0, 0, 0, -1, 60, "pistols");
  const inp = emptyInput();
  g.player.x = -3.2; g.player.z = -3; inp.yaw = PI / 2; inp.interact = true; g.step(inp);
  g.player.banked = 45;
  const snap = (g as unknown as { snapshot(at: { x: number; y: number; z: number; yaw: number }): import("../src/sim/game.ts").Resume }).snapshot({ x: 0, y: 0, z: 0, yaw: 0 });
  const r = new Game(secretRoom(), { ai: false, seed: 1, resume: snap });
  assert.deepEqual(r.found.sort(), ["sec-a", "sec-b"]);
  assert.deepEqual(r.opened, ["door"]);
  assert.deepEqual(r.broken, ["crate"]);
  assert.ok(r.world.off.has("door") && r.world.off.has("crate"));
  assert.equal(r.player.grenades, 2);
  assert.equal(r.player.banked, 45);
  assert.equal(r.stats.secrets, 2);
});
