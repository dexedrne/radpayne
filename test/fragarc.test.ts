// His frag held up (the grenade button held): the aim preview replays the sim's own flight (sim/frag.ts),
// so the arc, its bounces and the landing ring are where the frag goes, at any time scale; the hold, the
// release, the tap, the cancel; the keys and the pad.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/sim/game.ts";
import { FRAG_STEP, emptyPath, fragLaunch, predictFrag } from "../src/sim/frag.ts";
import { DT, GRENADE } from "../src/sim/tuning.ts";
import { InputLatch } from "../src/input/input.ts";
import { ammoIn } from "../src/combat/weapons.ts";
import { BTN } from "../src/input/pad.ts";
import { resetDevices } from "../src/input/device.ts";
import { PLAYER_ID, emptyInput, type GameEvent, type InputFrame } from "../src/sim/types.ts";
import { boxNode, level, markerNode } from "./helpers.ts";

const PI = Math.PI;
const spawn = markerNode("spawn", "spawn", [0, 0, 0], {}, PI);
/** A yard with things to bounce off: a back wall, a side wall at an angle, a turned crate, a pillar, a
 *  raised step, a low wall. */
const yard = () => level([
  spawn,
  boxNode("back", [0, 2, -13], [34, 4, 0.5]),
  boxNode("side", [9, 1.5, -6], [0.5, 3, 12], undefined, 0.25),
  boxNode("crate", [3, 0.5, -7], [2, 1, 2], undefined, 0.4),
  boxNode("pillar", [-4, 1.5, -8], [0.8, 3, 0.8]),
  boxNode("step", [-8, 0.4, -4], [4, 0.8, 4]),
  boxNode("low", [-1, 0.45, -4.5], [3, 0.9, 0.4], undefined, -0.3),
]);

type Bounce = Extract<GameEvent, { type: "bounce" }>;
type Boom = Extract<GameEvent, { type: "explode" }>;
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** Aim, hold the button (the frag comes up), read the preview, let go; then fly it to the blast with the
 *  time scale as `mode` says: full speed, bullet time throughout, or bullet time switched on and off
 *  while it flies. */
function throwOnce(yaw: number, pitch: number, mode: "normal" | "bt" | "toggle") {
  const g = new Game(yard(), { ai: false, seed: 1, grenades: 3 });
  const inp = emptyInput();
  inp.yaw = yaw; inp.pitch = pitch;
  if (mode === "bt") { g.meter = 10; g.setBulletTime(true); }
  for (let i = 0; i < 90; i++) { g.step(inp); if (g.meter < 5) g.meter = 10; }
  inp.throw = true; inp.nade = true; g.step(inp); inp.throw = false;
  for (let i = 0; i < 12; i++) g.step(inp);
  assert.ok(g.player.nadeUp, "held: the frag is up");
  const pred = g.fragPreview();
  const predBounces = pred.bounces.slice(0, pred.nb).filter(b => b.speed > 1).map(b => ({ ...b }));
  const end = { ...pred.end }, land = pred.land ? { ...pred.land } : null, steps = pred.steps;
  g.drain();
  inp.nade = false; g.step(inp);
  const ev = g.drain();
  assert.ok(ev.some(e => e.type === "throw"), "let go: it goes");
  let boom: Boom | undefined;
  const bounces: Bounce[] = [];
  for (const e of ev) if (e.type === "bounce") bounces.push(e);
  for (let i = 0; i < 4000 && !boom; i++) {
    if (mode === "toggle" && i === 20) { g.meter = 10; g.setBulletTime(true); }
    if (mode === "toggle" && i === 90) g.setBulletTime(false);
    g.step(inp);
    if (g.meter < 5) g.meter = 10;
    for (const e of g.drain()) { if (e.type === "bounce") bounces.push(e); if (e.type === "explode") boom = e; }
  }
  assert.ok(boom, "it went off");
  return { end, land, steps, predBounces, bounces, boom: boom! };
}

test("the aim preview is the flight: the blast point and every bounce as the sim has them, for many angles, in bullet time and across it", () => {
  let n = 0, multi = 0, walls = 0, far = 0;
  for (const mode of ["normal", "bt", "toggle"] as const) {
    for (let a = 0; a < 12; a++) for (const pitch of [-0.3, -0.12, 0, 0.18, 0.4]) {
      const yaw = -1.1 + (2.2 * a) / 11;
      const r = throwOnce(yaw, pitch, mode);
      const tag = `${mode} yaw ${yaw.toFixed(2)} pitch ${pitch}`;
      assert.ok(close(r.boom.x, r.end.x) && close(r.boom.y, r.end.y) && close(r.boom.z, r.end.z),
        `${tag}: blast at (${r.boom.x.toFixed(3)}, ${r.boom.y.toFixed(3)}, ${r.boom.z.toFixed(3)}), predicted (${r.end.x.toFixed(3)}, ${r.end.y.toFixed(3)}, ${r.end.z.toFixed(3)})`);
      assert.equal(r.bounces.length, r.predBounces.length, `${tag}: bounces`);
      r.bounces.forEach((b, i) => {
        const p = r.predBounces[i];
        assert.ok(close(b.x, p.x) && close(b.y, p.y) && close(b.z, p.z) && close(b.speed, p.speed), `${tag}: bounce ${i}`);
      });
      // the landing ring's first touch is the first bounce
      if (r.bounces.length) assert.ok(r.land && close(r.land.x, r.bounces[0].x) && close(r.land.z, r.bounces[0].z), `${tag}: first touch`);
      n++;
      if (r.predBounces.length >= 3) multi++;
      if (r.predBounces.some(b => Math.abs(b.ny) < 0.7)) walls++;
      if (Math.hypot(r.end.x, r.end.z) > 11) far++;
      assert.equal(r.steps, Math.round(GRENADE.fuse / FRAG_STEP), "the fuse: the same count of sub-steps");
    }
  }
  // the yard really tests it: many bounce more than twice, many come off a wall or a box side, some go far
  assert.equal(n, 180);
  assert.ok(multi > 60, `three or more bounces: ${multi}`);
  assert.ok(walls > 30, `off a wall or a box side: ${walls}`);
  assert.ok(far > 20, `far out: ${far}`);
});

test("the preview on its own: a lob onto open floor lands on the aim point; bullet time slows it along the same path", () => {
  const g = new Game(level([spawn]), { ai: false, seed: 1, grenades: 1 });
  const l = fragLaunch(0, 0, 0, 0, { x: 0, y: 0, z: -10 }, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
  const p = predictFrag(g.world, l);
  assert.ok(p.land && Math.abs(Math.hypot(p.land.x, p.land.z) - 10) < 0.4, `lands 10 m out (${p.land && Math.hypot(p.land.x, p.land.z).toFixed(2)})`);
  assert.ok(p.nb >= 2, "and bounces on");
  assert.ok(p.n > 20 && p.pts.length >= p.n * 3, "points along the arc");
  // the same output object again (the view reuses it every frame): the same path
  const q = predictFrag(g.world, l, emptyPath());
  const again = predictFrag(g.world, l, q);
  assert.equal(again.n, p.n);
  assert.ok(close(again.end.x, p.end.x) && close(again.end.z, p.end.z));
});

test("hold to aim: up on the press, gone on the release; a tap between steps throws at once; a switch or a melee puts it back until let go", () => {
  const g = new Game(level([spawn]), { ai: false, seed: 1, grenades: 3, loadout: ["shotgun"] });
  const p = g.player;
  const inp = emptyInput();
  inp.yaw = p.yaw; inp.pitch = -0.1;
  const run = (steps: number) => { const ev: GameEvent[] = []; for (let i = 0; i < steps; i++) { g.step(inp); ev.push(...g.drain()); } return ev; };
  const throws = (ev: GameEvent[]) => ev.filter(e => e.type === "throw").length;
  run(30);
  // held: up, nothing thrown however long; he still shoots one-handed
  inp.throw = true; inp.nade = true;
  let ev = run(1);
  inp.throw = false;
  assert.ok(p.nadeUp);
  assert.ok(ev.some(e => e.type === "nade" && e.up));
  inp.fire = true;
  ev = run(120);
  inp.fire = false;
  assert.equal(throws(ev), 0);
  assert.equal(p.grenades, 3);
  assert.ok(ev.some(e => e.type === "shot"), "the gun still fires");
  // let go: it goes (from the raised hand: the view plays the lob alone, the pin was heard)
  inp.nade = false;
  ev = run(1);
  assert.equal(throws(ev), 1);
  assert.equal((ev.find(e => e.type === "throw") as Extract<GameEvent, { type: "throw" }>).raised, true);
  assert.equal(p.grenades, 2);
  assert.ok(!p.nadeUp);
  run(Math.ceil(GRENADE.cooldown / DT) + 2);
  // a tap that came and went between two steps throws at once
  inp.throw = true;
  ev = run(1);
  inp.throw = false;
  assert.equal(throws(ev), 1);
  assert.ok(!(ev.find(e => e.type === "throw") as Extract<GameEvent, { type: "throw" }>).raised, "a tap: pin and throw at once");
  assert.ok(!ev.some(e => e.type === "nade"), "nothing came up");
  assert.equal(p.grenades, 1);
  run(Math.ceil(GRENADE.cooldown / DT) + 2);
  // up again, then a weapon switch: it goes back, the switch happens, and it stays down until let go
  inp.throw = true; inp.nade = true;
  run(1);
  inp.throw = false;
  assert.ok(p.nadeUp);
  inp.slot = 1;
  ev = run(1);
  inp.slot = 0;
  assert.ok(!p.nadeUp, "a switch puts it back");
  assert.ok(ev.some(e => e.type === "nade" && !e.up) && ev.some(e => e.type === "swap"));
  ev = run(60);
  assert.ok(!p.nadeUp && throws(ev) === 0, "still held: it stays down");
  inp.nade = false;
  ev = run(1);
  assert.equal(throws(ev), 0, "the release after a cancel throws nothing");
  assert.equal(p.grenades, 1);
  // up again, then a melee: back in the pouch
  inp.throw = true; inp.nade = true;
  run(1);
  inp.throw = false;
  assert.ok(p.nadeUp);
  inp.melee = true;
  run(1);
  inp.melee = false;
  assert.ok(!p.nadeUp, "the strike puts it back");
  inp.nade = false;
  assert.equal(throws(run(60)), 0);
  // a dive takes it down; still held when he is back on his feet, it comes up again
  inp.throw = true; inp.nade = true;
  run(1);
  inp.throw = false;
  assert.ok(p.nadeUp);
  inp.dodge = true; inp.moveY = 1;
  run(1);
  inp.dodge = false;
  assert.equal(p.mode, "dive");
  assert.ok(!p.nadeUp);
  // (moving as he lands: the roll into a run, then on his feet)
  const mode = (): string => p.mode;
  for (let i = 0; i < 1200 && mode() !== "normal"; i++) run(1);
  inp.moveY = 0;
  run(2);
  assert.ok(p.nadeUp, "back up on his feet");
  inp.nade = false;
  assert.equal(throws(run(1)), 1);
  assert.equal(p.grenades, 0);
  // none left: nothing comes up
  inp.throw = true; inp.nade = true;
  run(1);
  inp.throw = false;
  assert.ok(!p.nadeUp);
});

test("hold to aim: no scope while the frag is up", () => {
  const g = new Game(level([spawn]), { ai: false, seed: 1, grenades: 2, loadout: ["sniper"] });
  const p = g.player;
  const inp = emptyInput();
  inp.yaw = p.yaw;
  for (let i = 0; i < 30; i++) g.step(inp);
  inp.zoom = true;
  g.step(inp);
  assert.ok(p.zoom);
  inp.throw = true; inp.nade = true;
  g.step(inp); g.step(inp);
  inp.throw = false;
  assert.ok(p.nadeUp && !p.zoom, "the frag up drops the scope");
  inp.nade = false;
  g.step(inp);
  assert.equal(p.grenades, 1);
});

test("a hold replays bit-exactly (the preview is read-only: it never moves the sim)", () => {
  const log: InputFrame[] = [];
  const hashes: string[] = [];
  const a = new Game(level([spawn, boxNode("wall", [0, 2, -9], [12, 4, 0.5])]), { ai: false, seed: 5, grenades: 3 });
  for (let i = 0; i < 900; i++) {
    const f = emptyInput();
    f.yaw = a.player.yaw + 0.4 * Math.sin(i / 90);
    f.pitch = 0.2 * Math.cos(i / 70);
    f.nade = (i >= 100 && i < 220) || (i >= 400 && i < 610);
    f.throw = i === 100 || i === 400 || i === 760;
    f.moveX = i > 450 && i < 560 ? 1 : 0;
    log.push({ ...f });
    a.step(f);
    if (a.player.nadeUp) a.fragPreview();
    hashes.push(a.hash());
  }
  assert.equal(a.player.grenades, 0, "three frags thrown: two holds and a tap");
  const b = new Game(level([spawn, boxNode("wall", [0, 2, -9], [12, 4, 0.5])]), { ai: false, seed: 5, grenades: 3 });
  for (let i = 0; i < log.length; i++) {
    b.step({ ...log[i] });
    if (b.hash() !== hashes[i]) assert.fail(`diverged at step ${i}`);
  }
});

test("keys: G held is the hold (the press edge on its first step), a tap between steps is the edge alone", () => {
  const l = new InputLatch();
  l.press("KeyG");
  let f = l.consume();
  assert.ok(f.throw && f.nade);
  f = l.consume();
  assert.ok(!f.throw && f.nade);
  l.release("KeyG");
  f = l.consume();
  assert.ok(!f.throw && !f.nade);
  l.press("KeyG");
  l.release("KeyG");
  f = l.consume();
  assert.ok(f.throw && !f.nade, "a tap: throw at once");
});

test("pad: Triangle held is the hold, its press the edge", () => {
  type Btn = { pressed: boolean; value: number };
  const buttons: Btn[] = Array.from({ length: 18 }, () => ({ pressed: false, value: 0 }));
  const pad = { id: "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)", index: 0, mapping: "standard", connected: true, axes: [0, 0, 0, 0], buttons, timestamp: 0 };
  const nav = globalThis.navigator as unknown as Record<string, unknown>;
  const had = Object.getOwnPropertyDescriptor(nav, "getGamepads");
  Object.defineProperty(nav, "getGamepads", { value: () => [pad], configurable: true });
  resetDevices();
  try {
    const l = new InputLatch();
    l.poll(1 / 60);
    buttons[BTN.triangle] = { pressed: true, value: 1 };
    l.poll(1 / 60);
    let f = l.consume();
    assert.ok(f.throw && f.nade);
    l.poll(1 / 60);
    f = l.consume();
    assert.ok(!f.throw && f.nade);
    buttons[BTN.triangle] = { pressed: false, value: 0 };
    l.poll(1 / 60);
    f = l.consume();
    assert.ok(!f.throw && !f.nade);
  } finally {
    if (had) Object.defineProperty(nav, "getGamepads", had);
    else delete nav.getGamepads;
    resetDevices();
  }
});

test("hold to aim: a pair fires from the right hand alone while the frag is up, at that gun's own pace", () => {
  const g = new Game(level([spawn]), { ai: false, seed: 1, grenades: 2 });
  const p = g.player;
  assert.equal(p.weapon.id, "pistols");
  const inp = emptyInput();
  inp.yaw = p.yaw;
  for (let i = 0; i < 30; i++) g.step(inp);
  g.drain();
  const shots = (steps: number) => {
    const hands: number[] = [];
    for (let i = 0; i < steps; i++) { g.step(inp); for (const e of g.drain()) if (e.type === "shot" && e.shooter === PLAYER_ID) hands.push(e.hand); }
    return hands;
  };
  // both hands, alternating
  inp.fire = true;
  const both = shots(Math.round(1.2 / DT));
  inp.fire = false;
  assert.ok(both.includes(0) && both.includes(1));
  for (let i = 0; i < Math.round(2 / DT); i++) g.step(inp);
  inp.reload = true; g.step(inp); inp.reload = false;
  for (let i = 0; i < Math.round(2 / DT); i++) g.step(inp);
  g.drain();
  // the frag up: the right gun alone, half the pair's rate
  inp.throw = true; inp.nade = true; g.step(inp); inp.throw = false;
  assert.ok(p.nadeUp);
  inp.fire = true;
  const solo = shots(Math.round(1.2 / DT));
  inp.fire = false;
  assert.ok(solo.length > 0 && solo.every(h => h === 0), `right hand only: ${solo.join("")}`);
  assert.ok(Math.abs(solo.length - both.length / 2) <= 1, `half the rate: ${solo.length} against ${both.length}`);
  // let go: it goes, and the pair is back
  inp.nade = false; g.step(inp);
  assert.equal(p.grenades, 1);
});

test("hold to aim: the keys lost (focus, the pause) put the frag back instead of throwing it", () => {
  const l = new InputLatch();
  const g = new Game(level([spawn]), { ai: false, seed: 1, grenades: 2 });
  const p = g.player;
  for (let i = 0; i < 30; i++) { const f = l.consume(); f.yaw = p.yaw; g.step(f); }
  l.press("KeyG");
  for (let i = 0; i < 20; i++) { const f = l.consume(); f.yaw = p.yaw; g.step(f); }
  assert.ok(p.nadeUp);
  g.drain();
  // the pointer let go (the pause), then the click that locks it again flushes the pending presses
  l.clear();
  l.flush();
  let f = l.consume();
  assert.ok(f.stow && !f.nade);
  f.yaw = p.yaw;
  g.step(f);
  for (let i = 0; i < 60; i++) { f = l.consume(); f.yaw = p.yaw; g.step(f); }
  assert.ok(!p.nadeUp, "back in the pouch");
  assert.equal(p.grenades, 2, "nothing thrown");
  assert.ok(!g.drain().some(e => e.type === "throw"));
  assert.ok(!l.consume().stow, "once");
});

test("hold to aim: no reload with the frag up (one in progress is dropped); a gun run dry reloads once the frag has gone", () => {
  const g = new Game(level([spawn]), { ai: false, seed: 1, grenades: 2, loadout: ["shotgun"] });
  const p = g.player, w = p.weapon;
  assert.equal(w.id, "shotgun");
  const inp = emptyInput();
  inp.yaw = p.yaw;
  const run = (n: number) => { const ev: GameEvent[] = []; for (let i = 0; i < n; i++) { g.step(inp); ev.push(...g.drain()); } return ev; };
  const shoot = () => { inp.fire = true; run(1); inp.fire = false; run(Math.ceil(0.85 / DT)); };
  run(120);
  // a round out, a reload under way, then the frag up: the reload is dropped
  shoot();
  inp.reload = true; run(1); inp.reload = false;
  assert.ok(w.reloadT > 0, "reloading");
  inp.throw = true; inp.nade = true; run(1); inp.throw = false;
  assert.ok(p.nadeUp && w.reloadT === 0, "the frag up drops the reload");
  // R waits while it is up
  inp.reload = true;
  const ev = run(1);
  inp.reload = false;
  assert.ok(w.reloadT === 0 && !ev.some(e => e.type === "reload"), "no reload with the frag up");
  // fired dry one-handed: it waits
  for (let k = 0; k < 8; k++) shoot();
  assert.equal(ammoIn(w), 0);
  assert.equal(w.reloadT, 0, "dry with the frag up: no reload");
  assert.ok(p.nadeUp);
  // let go: the frag goes and the reload starts
  inp.nade = false;
  const out = run(1);
  assert.ok(out.some(e => e.type === "throw") && out.some(e => e.type === "reload"), "the throw, then the reload");
  assert.ok(w.reloadT > 0);
});
