import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/sim/game.ts";
import { METER } from "../src/sim/tuning.ts";
import { emptyInput } from "../src/sim/types.ts";
import { level, markerNode } from "./helpers.ts";
import {
  ammoLow, canvasFx, captionBudget, damageAngle, edgePin, hudScale, hurtPhase, hurtStrength, parseHint, recordBest, rowLow, slashPath, threatScale,
} from "../src/ui/hud/logic.ts";
import { roomLabel, roomText } from "../src/ui/rooms.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("hud scale: 720p 0.72, 1080p 1, 1440p 1.25; S equals M at 720p", () => {
  near(hudScale(720), 0.72);
  near(hudScale(1080), 1);
  near(hudScale(1440), 1.25);
  near(hudScale(720, "s"), 0.72);
  near(hudScale(1080, "l"), 1.2);
  near(hudScale(1080, "s"), 0.85);
});

test("damage angle: 0 ahead, 90 right, 180 behind, -90 left (camera looking down -Z)", () => {
  const f = [0, -1] as const;
  near(damageAngle(0, 0, 0, -10, ...f), 0);
  near(damageAngle(0, 0, 10, 0, ...f), 90);
  near(Math.abs(damageAngle(0, 0, 0, 10, ...f)), 180);
  near(damageAngle(0, 0, -10, 0, ...f), -90);
  // turning the camera turns the slash: facing +X, a shooter at -Z is now on the left
  near(damageAngle(0, 0, 0, -10, 1, 0), -90);
});

test("damage slash: 18 points on the ellipse, the teeth point at the centre, the punch pulls it in", () => {
  const nums = (d: string) => d.replace(/[MLZ]/g, " ").trim().split(/\s+/).map(Number);
  const p = nums(slashPath(0, 560, 330));
  assert.equal(p.length, 36);
  const r = (i: number) => Math.hypot(p[2 * i], p[2 * i + 1]);
  // odd points are the teeth (inward, up to 34 px), even points sit on the ring, 9..17 the outer band
  assert.ok(r(3) < Math.min(r(2), r(4)) - 25, `tooth ${r(3)} vs ring ${r(4)}`);
  near(r(4), 330, 0.1);
  near(r(13), 339, 0.1);
  const q = nums(slashPath(0, 560, 330, 34, 9, 6));
  near(Math.hypot(q[0], q[1]), r(0) - 6, 0.2);
  assert.equal(hurtStrength(0), 0.55);
  assert.equal(hurtStrength(40), 1);
  assert.deepEqual(hurtPhase(0), { inset: 0, alpha: 1 });
  assert.deepEqual(hurtPhase(300), { inset: 6, alpha: 1 });
  near(hurtPhase(930)!.alpha, 0.5);
  assert.equal(hurtPhase(1300), null);
});

test("caption budget: one while the gang is awake, two otherwise, nudge > subtitle > objective", () => {
  const all = { nudge: true, subtitle: true, objective: true };
  assert.deepEqual(captionBudget(all, true), { nudge: true, subtitle: false, objective: false });
  assert.deepEqual(captionBudget(all, false), { nudge: true, subtitle: true, objective: false });
  assert.deepEqual(captionBudget({ nudge: false, subtitle: true, objective: true }, false), { nudge: false, subtitle: true, objective: true });
  assert.deepEqual(captionBudget({ nudge: false, subtitle: false, objective: true }, true), { nudge: false, subtitle: false, objective: true });
});

test("key hints become keycaps", () => {
  assert.deepEqual(parseHint("RMB / Q: bullet time"), [{ keys: ["RMB", "Q"], label: "bullet time" }]);
  assert.deepEqual(parseHint("LMB: shoot · WASD: move"), [{ keys: ["LMB"], label: "shoot" }, { keys: ["WASD"], label: "move" }]);
  assert.deepEqual(parseHint(""), []);
});

test("ammo: total low at 25% of capacity, a row low at 3", () => {
  assert.equal(ammoLow(6, 12, 2), true);
  assert.equal(ammoLow(7, 12, 2), false);
  assert.equal(ammoLow(1, 6, 1), true);
  assert.equal(rowLow(3), true);
  assert.equal(rowLow(4), false);
});

test("threat markers shrink with distance; edge arrows pin inside the screen", () => {
  assert.equal(threatScale(5), 1);
  assert.equal(threatScale(40), 0.7);
  near(threatScale(23.5), 0.85);
  const l = edgePin(-100, 0, 1920, 1080, 42);
  near(l.x, 42); near(l.y, 540); near(l.rot, -90);
  const d = edgePin(0, 5, 1920, 1080, 42);
  near(d.y, 1080 - 42); near(Math.abs(d.rot), 180);
});

test("canvas filter: none at rest; BT grade; low-HP desaturation; pause blur; death greyout; results dim", () => {
  const base = { screen: "play", timeScale: 1, health: 100, deadAt: 0, now: 0 };
  assert.equal(canvasFx(base).filter, "none");
  assert.match(canvasFx({ ...base, timeScale: 0.3 }).filter, /^sepia\(0\.220\) saturate\(0\.850\)/);
  assert.match(canvasFx({ ...base, health: 25 }).filter, /saturate\(0\.600\).*brightness\(0\.950\)/);
  assert.equal(canvasFx({ ...base, health: 35 }).filter, "none");
  assert.equal(canvasFx({ ...base, health: 20, killcam: true }).filter, "none");
  assert.match(canvasFx({ ...base, screen: "paused" }).filter, /grayscale\(0\.750\) brightness\(0\.420\) blur\(3px\)$/);
  const dead = canvasFx({ ...base, deadAt: 5 });
  assert.match(dead.filter, /grayscale\(1\.000\) brightness\(0\.600\)$/);
  assert.match(dead.transition, /1\.2s/);
  assert.match(canvasFx({ ...base, screen: "results" }).filter, /grayscale\(0\.500\) brightness\(0\.380\) blur\(2px\)$/);
  // the function order never changes (CSS interpolates the transitions)
  const order = (f: string) => f.replace(/\([^)]*\)/g, "");
  assert.ok(order(canvasFx({ ...base, screen: "paused" }).filter).startsWith(order(canvasFx({ ...base, timeScale: 0.3 }).filter)));
});

test("personal best: saved per room and difficulty, only when faster", () => {
  const mem = new Map<string, string>();
  const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  assert.deepEqual(recordBest(st, "room1", "normal", 80), { prev: null, isBest: true });
  assert.equal(mem.get("radpayne.best.room1.normal"), "80.000");
  assert.deepEqual(recordBest(st, "room1", "normal", 90), { prev: 80, isBest: false });
  assert.deepEqual(recordBest(st, "room1", "normal", 72.4), { prev: 80, isBest: true });
  assert.deepEqual(recordBest(st, "room1", "hard", 99), { prev: null, isBest: true });
  assert.deepEqual(recordBest(null, "room1", "normal", 50), { prev: null, isBest: true });
});

test("room text: the room tag, objectives, level overrides", () => {
  const t = roomText("room1", { name: "Outside the Milady rave" });
  assert.equal(roomLabel(t), "ROOM 1 · OUTSIDE CLUB MILADY");
  assert.equal(t.objective, "clear the street. my bag is inside the club.");
  assert.equal(t.objectiveClear, "the bag is inside. get to the door.");
  const g = roomText("greybox", { name: "greybox" });
  assert.equal(roomLabel(g), "ROOM 1 · GREYBOX");
  assert.equal(roomText("room1", { name: "x", objective: "find the bag.", number: 2 }).objective, "find the bag.");
  assert.equal(roomLabel(roomText("room1", { name: "x", number: 2 })), "ROOM 2 · OUTSIDE CLUB MILADY");
});

test("sim: bullet time refused with too little meter emits btRefused; hits carry the shooter's position", () => {
  const lv = level([markerNode("spawn", "spawn", [0, 0, 0], {}, Math.PI), markerNode("e1", "enemy", [3, 0, -12])]);
  const g = new Game(lv, { ai: false });
  g.meter = METER.minToStart / 2;
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  inp.bt = true;
  g.step(inp);
  assert.equal(g.bulletTime, false);
  assert.ok(g.drain().some(e => e.type === "btRefused"));
  g.hurtPlayer(9, 0);
  const hurt = g.drain().find(e => e.type === "hurt" && e.target === -1);
  assert.ok(hurt && hurt.type === "hurt");
  assert.equal(hurt.shooter, 0);
  near(hurt.fromX!, g.enemies[0].x);
  near(hurt.fromZ!, g.enemies[0].z);
  // a fall has no shooter
  g.hurtPlayer(1, -1);
  const fall = g.drain().find(e => e.type === "hurt" && e.target === -1);
  assert.ok(fall && fall.type === "hurt" && fall.fromX === undefined);
});
