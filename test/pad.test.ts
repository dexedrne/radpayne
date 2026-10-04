import { test } from "node:test";
import assert from "node:assert/strict";
import { InputLatch } from "../src/input/input.ts";
import { Session } from "../src/app/session.ts";
import { Game } from "../src/sim/game.ts";
import { BTN, PAD_CONTROLS, PAD_GLYPHS, TRIGGER, keyAct, lookCurve, padKeys, padKind, radial, readPad, triggerDown } from "../src/input/pad.ts";
import { activePad, padBusy, resetDevices, useDevice } from "../src/input/device.ts";
import { ASSIST, assistStep, assistTarget } from "../src/input/assist.ts";
import { rumbleOf } from "../src/input/rumble.ts";
import { PLAYER_ID, emptyInput, type InputFrame } from "../src/sim/types.ts";
import { boxNode, level, markerNode } from "./helpers.ts";

type Btn = { pressed: boolean; value: number };
type FakePad = { id: string; index: number; mapping: string; connected: boolean; axes: number[]; buttons: Btn[]; timestamp: number };
const DUALSENSE = "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)";
const XBOX = "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)";

const makePad = (id = DUALSENSE, index = 0, mapping = "standard"): FakePad =>
  ({ id, index, mapping, connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })), timestamp: 0 });

/** Standard-mapping pads the code reads through navigator.getGamepads (restored afterwards). */
function withPads(pads: FakePad[], fn: () => void): void {
  const nav = globalThis.navigator as unknown as Record<string, unknown>;
  const had = Object.getOwnPropertyDescriptor(nav, "getGamepads");
  Object.defineProperty(nav, "getGamepads", { value: () => pads, configurable: true });
  resetDevices();
  try {
    fn();
  } finally {
    if (had) Object.defineProperty(nav, "getGamepads", had);
    else delete nav.getGamepads;
    resetDevices();
  }
}
function withPad(fn: (b: Btn[], pad: FakePad) => void, id = DUALSENSE): void {
  const pad = makePad(id);
  withPads([pad], () => fn(pad.buttons, pad));
}
const press = (b: Btn[], i: number, on = true) => { b[i].pressed = on; b[i].value = on ? 1 : 0; };

test("gamepad: Cross and Options are edges (held, they fire once)", () => {
  withPad(b => {
    const l = new InputLatch();
    l.poll(1 / 60);
    assert.equal(l.padA, false);
    press(b, BTN.cross);
    l.poll(1 / 60);
    assert.equal(l.padA, true);
    l.poll(1 / 60);
    assert.equal(l.padA, false);
    press(b, BTN.options);
    l.poll(1 / 60);
    assert.equal(l.padStart, true);
    l.poll(1 / 60);
    assert.equal(l.padStart, false);
  });
});

test("gamepad: Cross on the fight prompt starts the room before the steps, and the press never becomes a jump", () => {
  withPad(b => {
    const lv = level([markerNode("spawn", "spawn", [0, 0, 0], {}, Math.PI), markerNode("e1", "enemy", [3, 0, -30])]);
    const s = new Session(lv, {}, "t", { seed: 1, ai: false });
    s.paused = true;
    let started = 0;
    // what PlayPage does on the prompt: flush the press, unpause
    s.onPadA = () => { started++; s.input.flush(); s.paused = false; };
    s.frame(1 / 60);
    assert.equal(started, 0);
    press(b, BTN.cross);
    s.frame(1 / 60);
    assert.equal(started, 1);
    assert.equal(s.paused, false);
    assert.ok(s.stepsLast > 0, "the room ran this frame");
    assert.equal(s.game.player.grounded, true, "no jump from the Cross that started it");
    s.frame(1 / 60);
    assert.equal(started, 1, "held Cross does not fire again");
  });
});

test("gamepad: the console layout (every button -> its action, held buttons once)", () => {
  const cases: Array<[number, (f: InputFrame) => unknown, unknown]> = [
    [BTN.cross, f => f.jump, true], [BTN.circle, f => f.melee, true], [BTN.square, f => f.reload, true], [BTN.triangle, f => f.throw, true],
    [BTN.r1, f => f.dodge, true], [BTN.r3, f => f.bt, true], [BTN.l3, f => f.bt, true], [BTN.l1, f => f.cover, true],
    [BTN.right, f => f.slot, 9], [BTN.left, f => f.slot, 8], [BTN.up, f => f.copium, true], [BTN.down, f => f.interact, true],
  ];
  for (const [i, get, want] of cases) withPad(b => {
    const l = new InputLatch();
    l.poll(1 / 60);
    l.consume();
    press(b, i);
    l.poll(1 / 60);
    const f = { ...l.consume() };
    assert.equal(get(f), want, `button ${i}`);
    assert.equal(f.skip, true, `button ${i} skips the kill cam`);
    l.poll(1 / 60);
    assert.notEqual(get({ ...l.consume() }), want, `button ${i} held: once`);
  });
});

test("gamepad: Square uses what is in reach instead of reloading", () => {
  withPad(b => {
    const l = new InputLatch();
    l.useHere = true;
    l.poll(1 / 60);
    press(b, BTN.square);
    l.poll(1 / 60);
    const f = l.consume();
    assert.equal(f.interact, true);
    assert.equal(f.reload, false);
  });
});

test("gamepad: R2 is an analog trigger with hysteresis; L2 is the scope with the sniper, never bullet time", () => {
  withPad(b => {
    const l = new InputLatch();
    const r2 = (v: number) => { b[BTN.r2].value = v; b[BTN.r2].pressed = v > 0.1; l.poll(1 / 60); return l.consume().fire; };
    assert.equal(r2(0.15), false);
    assert.equal(r2(0.22), true);
    assert.equal(r2(0.14), true, "held past the release point");
    assert.equal(r2(0.1), false);
    const l2 = (v: number) => { b[BTN.l2].value = v; b[BTN.l2].pressed = v > 0.1; l.poll(1 / 60); return { ...l.consume() }; };
    let f = l2(1);
    assert.equal(f.zoom, false, "no scope without the sniper");
    assert.equal(f.bt, false, "L2 is not bullet time");
    l.zoomMode = true;
    f = l2(1);
    assert.equal(f.zoom, true);
    f = l2(0);
    assert.equal(f.zoom, false);
  });
  assert.equal(triggerDown(TRIGGER.on + 0.01, false), true);
  assert.equal(triggerDown(TRIGGER.on - 0.01, false), false);
  assert.equal(triggerDown(TRIGGER.off + 0.01, true), true);
  assert.equal(triggerDown(TRIGGER.off - 0.01, true), false);
});

// ---- the triggers under WebKit, pads without the standard mapping --------------------------------

/** WebKit's DualSense (Safari, and every browser on an iPad): a trigger's pull is in its value while
 *  `pressed` stays false until the controller's click point (here: all the way down). */
const webkitPull = (b: Btn[], i: number, v: number) => { b[i].value = v; b[i].pressed = v >= 0.999; };

test("gamepad (WebKit): a light pull on a trigger whose `pressed` stays false aims, scopes and fires; it skips and counts as the pad", () => {
  withPad(b => {
    const l = new InputLatch();
    l.poll(1 / 60);
    l.consume();
    webkitPull(b, BTN.l2, 0.33);
    l.poll(1 / 60);
    let f = { ...l.consume() };
    assert.equal(f.aim, true, "L2 at a third: the aim");
    assert.equal(l.padAiming, true);
    assert.equal(f.skip, true, "a trigger's pull skips the kill cam like any button");
    assert.equal(useDevice.getState().device, "pad", "and brings the pad's glyphs");
    l.zoomMode = true;
    l.poll(1 / 60);
    assert.equal({ ...l.consume() }.zoom, true, "with the sniper: the scope");
    webkitPull(b, BTN.l2, 0);
    webkitPull(b, BTN.r2, 0.33);
    l.poll(1 / 60);
    f = { ...l.consume() };
    assert.equal(f.zoom, false);
    assert.equal(f.fire, true, "R2 at a third fires");
  });
  // a pad with digital triggers (pressed, no value): all the way
  assert.equal(readPad({ id: "x", mapping: "standard", buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === BTN.l2, value: 0 })), axes: [0, 0, 0, 0] }).value[BTN.l2], 1);
});

test("gamepad (WebKit): the device watcher and the menus see a trigger by its value", () => {
  withPad((b, pad) => {
    assert.equal(padBusy(pad as unknown as Gamepad), false);
    webkitPull(b, BTN.r2, 0.4);
    assert.equal(padBusy(pad as unknown as Gamepad), true, "a pulled trigger is someone using the pad");
  });
});

/** A DualSense as WebKit's and Firefox's HID path on a Mac list it: no standard mapping, 14 buttons
 *  (Square, Cross, Circle, Triangle, L1, R1, L2, R2, Create, Options, L3, R3, PS, touchpad), the sticks on
 *  axes 0, 1 and 2, 5, the triggers' pull on axes 3 and 4 from -1, the d-pad a hat on axis 9. */
function hidPad(): FakePad {
  const p = makePad("054c-0ce6-DualSense Wireless Controller", 0, "");
  p.buttons = Array.from({ length: 14 }, () => ({ pressed: false, value: 0 }));
  p.axes = [0, 0, 0, -1, -1, 0, 0, 0, 0, 1.2857];
  return p;
}

test("gamepad (no standard mapping): a Sony pad's HID layout is remapped; its triggers' pull comes off their axes", () => {
  const pad = hidPad();
  withPads([pad], () => {
    const l = new InputLatch();
    l.poll(1 / 60);
    l.consume();
    // Cross is the HID's button 1
    pad.buttons[1] = { pressed: true, value: 1 };
    l.poll(1 / 60);
    let f = { ...l.consume() };
    assert.equal(f.jump, true, "Cross (HID button 1) jumps");
    pad.buttons[1] = { pressed: false, value: 0 };
    // L2 a third down: axis 3 from -1
    pad.axes[3] = -1 + 2 * 0.33;
    l.poll(1 / 60);
    f = { ...l.consume() };
    assert.equal(f.aim, true, "L2 off axis 3");
    pad.axes[3] = -1;
    pad.axes[4] = -1 + 2 * 0.33;
    l.poll(1 / 60);
    f = { ...l.consume() };
    assert.equal(f.aim, false);
    assert.equal(f.fire, true, "R2 off axis 4");
    pad.axes[4] = -1;
    // the hat: right is 2/7 clockwise from up (-1)
    pad.axes[9] = -1 + 4 / 7;
    l.poll(1 / 60);
    assert.equal({ ...l.consume() }.slot, 9, "the hat's right: the next gun");
    pad.axes[9] = 1.2857;
    // the right stick's y on axis 5
    pad.axes[5] = -1;
    const p0 = l.pitch;
    l.poll(0.1);
    assert.ok(l.pitch > p0, "axis 5 up looks up");
  });
  const r = readPad(hidPad());
  assert.equal(r.how, "sony-hid");
  assert.deepEqual([r.value[BTN.l2], r.value[BTN.r2]], [0, 0], "triggers at rest");
  // a pad not seen moving yet may list its trigger axes at 0: not a half pull
  const fresh = hidPad();
  fresh.axes[3] = 0; fresh.axes[4] = 0;
  assert.equal(readPad(fresh).pressed[BTN.l2], false);
  // any other pad without the mapping is read as if standard
  const other = makePad("Generic USB Joystick (Vendor: 0079 Product: 0006)", 0, "");
  other.buttons[0] = { pressed: true, value: 1 };
  other.buttons[BTN.l2] = { pressed: false, value: 0.3 };
  const ro = readPad(other);
  assert.equal(ro.how, "raw");
  assert.equal(ro.pressed[BTN.cross], true);
  assert.equal(ro.pressed[BTN.l2], true, "its trigger by value too");
});

test("gamepad (WebKit): in the game a light L2 pull scopes the sniper and a light R2 pull fires it; with the pistols L2 is the aim", () => {
  const lv = level([markerNode("spawn", "spawn", [0, 0, 0], {}, Math.PI), markerNode("e1", "enemy", [3, 0, -30])]);
  for (const layout of ["webkit", "hid"] as const) {
    const pad = layout === "hid" ? hidPad() : makePad();
    withPads([pad], () => {
      const s = new Session(lv, {}, "t", { seed: 1, ai: false, loadout: ["sniper"] });
      s.paused = false;
      for (let i = 0; i < 30; i++) s.frame(1 / 60);
      assert.equal(s.game.player.weapon.id, "sniper", "the sniper in hand");
      const l2 = (v: number) => { if (layout === "hid") pad.axes[3] = v > 0 ? -1 + 2 * v : -1; else webkitPull(pad.buttons, BTN.l2, v); };
      const r2 = (v: number) => { if (layout === "hid") pad.axes[4] = v > 0 ? -1 + 2 * v : -1; else webkitPull(pad.buttons, BTN.r2, v); };
      l2(0.3);
      for (let i = 0; i < 30; i++) s.frame(1 / 60);
      assert.equal(s.game.player.zoom, true, `${layout}: scoped on a light L2 pull`);
      const shots = s.game.stats.shots;
      r2(0.3);
      for (let i = 0; i < 10; i++) s.frame(1 / 60);
      assert.ok(s.game.stats.shots > shots, `${layout}: a light R2 pull fires`);
      r2(0);
      l2(0);
      for (let i = 0; i < 10; i++) s.frame(1 / 60);
      assert.equal(s.game.player.zoom, false, `${layout}: let go, out of the scope`);
    });
  }
  withPad(b => {
    const s = new Session(lv, {}, "t", { seed: 1, ai: false });
    s.paused = false;
    s.frame(1 / 60);
    webkitPull(b, BTN.l2, 0.3);
    s.frame(1 / 60);
    assert.equal(s.input.padAiming, true, "the pistols: L2 is the aim (the camera's zoom reads it)");
    assert.equal(s.game.player.zoom, false, "no scope");
  });
});

test("gamepad: radial dead zone and the look curve", () => {
  assert.deepEqual(radial(0.1, 0.05, 0.12), [0, 0]);
  const [x, y] = radial(0.5, 0.5, 0.12);
  assert.ok(Math.abs(x - y) < 1e-9, "a diagonal stays a diagonal (radial, not per axis)");
  assert.ok(Math.hypot(x, y) > 0.6 && Math.hypot(x, y) < 0.8);
  assert.deepEqual(radial(0, -0.97, 0.12).map(v => Math.round(v * 1000) / 1000), [0, -1], "full tilt from the outer edge");
  assert.equal(lookCurve(1), 1);
  assert.ok(lookCurve(0.3) < 0.3 * 0.5, "fine aim near the centre");
});

test("gamepad: the left stick moves (drift inside the dead zone does not), the right stick turns; pad invert Y is its own", () => {
  withPad((b, pad) => {
    const l = new InputLatch();
    pad.axes = [0.06, -0.08, 0.05, 0.05];
    l.poll(1 / 60);
    let f = { ...l.consume() };
    assert.equal(f.moveX, 0);
    assert.equal(f.moveY, 0);
    assert.equal(f.yaw, 0);
    pad.axes = [0, -1, 1, 0];
    l.poll(1 / 60);
    f = { ...l.consume() };
    assert.equal(f.moveY, 1, "stick up = forward");
    assert.ok(f.yaw < -0.05, "right stick right turns right");
    const p0 = l.pitch;
    pad.axes = [0, 0, 0, -1];
    l.poll(0.1);
    assert.ok(l.pitch > p0, "stick up looks up");
    l.padInvertY = true;
    const p1 = l.pitch;
    l.poll(0.1);
    assert.ok(l.pitch < p1, "inverted");
    // the mouse keeps its own setting
    const m0 = l.pitch;
    l.look(0, -10);
    assert.ok(l.pitch > m0);
  });
});

test("gamepad: PlayStation glyphs for a Sony pad, Xbox otherwise; the last device decides; a standard pad beats a motion-sensor device", () => {
  assert.equal(padKind(DUALSENSE), "ps");
  assert.equal(padKind("Sony Interactive Entertainment Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)"), "ps");
  assert.equal(padKind("Wireless Controller (STANDARD GAMEPAD)"), "ps");
  assert.equal(padKind(XBOX), "xbox");
  assert.equal(padKind("8BitDo Pro 2 (STANDARD GAMEPAD Vendor: 2dc8 Product: 6006)"), "xbox");
  withPad(b => {
    const l = new InputLatch();
    assert.equal(useDevice.getState().device, "kbm");
    press(b, BTN.cross);
    l.poll(1 / 60);
    assert.deepEqual([useDevice.getState().device, useDevice.getState().kind], ["pad", "ps"]);
    assert.equal(l.via, "pad");
    l.press("KeyW");
    assert.equal(useDevice.getState().device, "kbm", "a key: back to the keys");
    assert.equal(l.via, "kbm");
  });
  withPad(b => {
    const l = new InputLatch();
    press(b, BTN.r2);
    l.poll(1 / 60);
    assert.equal(useDevice.getState().kind, "xbox");
  }, XBOX);
  const sensors = makePad("DualSense Wireless Controller Motion Sensors", 0, "");
  sensors.axes = [0.9, -0.8, 0.7, 0.9];
  const ds = makePad(DUALSENSE, 1);
  withPads([sensors, ds], () => assert.equal(activePad()?.index, 1));
});

test("gamepad: every key a prompt names has a pad glyph (M: mute stays a key), one per action", () => {
  for (const k of ["W", "WASD", "MOUSE", "LMB", "RMB", "Q", "SHIFT", "SPACE", "R", "H", "1-5", "3", "WHEEL", "F", "G", "E", "ESC", "ENTER", "CLICK", "↑↓", "←→", "TAB", "P"]) {
    const a = keyAct(k);
    assert.ok(a, k);
    assert.ok(PAD_GLYPHS[a].length > 0, `${k}: ${a}`);
  }
  assert.deepEqual(PAD_GLYPHS[keyAct("M")!], []);
  assert.deepEqual(padKeys(["RMB", "Q"]), ["RMB"]);
  assert.deepEqual(padKeys(["1-5", "WHEEL"]), ["1-5"]);
  assert.deepEqual(padKeys(["LMB"]), ["LMB"]);
  // the layout the prompts show is the one the input reads
  assert.deepEqual([PAD_GLYPHS.fire, PAD_GLYPHS.dodge, PAD_GLYPHS.bt, PAD_GLYPHS.jump, PAD_GLYPHS.reload, PAD_GLYPHS.grenade, PAD_GLYPHS.melee, PAD_GLYPHS.copium, PAD_GLYPHS.scope],
    [["r2"], ["r1"], ["r3"], ["cross"], ["square"], ["triangle"], ["circle"], ["dup"], ["l2"]]);
  assert.ok(PAD_CONTROLS.length >= 12);
});

test("gamepad: vibration is light and his own (shots, hits on him, landings)", () => {
  const shot = (shooter: number, weapon: string, pellet = 0) => rumbleOf({ type: "shot", shooter, hand: 0, ox: 0, oy: 0, oz: 0, ex: 0, ey: 0, ez: 0, projectile: false, id: 1, weapon, pellet });
  assert.ok(shot(PLAYER_ID, "pistols"));
  assert.equal(shot(PLAYER_ID, "shotgun", 3), null, "one kick per trigger pull");
  assert.equal(shot(2, "pistol"), null, "their shots do not shake his hands");
  assert.ok(shot(PLAYER_ID, "shotgun")!.strong > shot(PLAYER_ID, "pistols")!.strong);
  assert.ok(rumbleOf({ type: "hurt", target: PLAYER_ID, amount: 20, part: 1, hp: 80 }));
  assert.equal(rumbleOf({ type: "hurt", target: 0, amount: 20, part: 1, hp: 80 }), null);
  assert.ok(rumbleOf({ type: "land", prone: true }));
  for (const r of [shot(PLAYER_ID, "sniper")!, rumbleOf({ type: "hurt", target: PLAYER_ID, amount: 200, part: 1, hp: 0 })!]) assert.ok(r.strong <= 0.7 && r.weak <= 0.5 && r.ms <= 250, "light");
});

// ---- aim assist -----------------------------------------------------------------------------------

/** A room with one goon 15 m out (and a wall between when asked); the game stepped once (poses). */
function assistRoom(wall = false): Game {
  const lv = level([markerNode("spawn", "spawn", [0, 0, 0], {}, 0), markerNode("e1", "enemy", [0, 0, -15]), ...(wall ? [boxNode("wall", [0, 1.5, -8], [6, 3, 0.4])] : [])]);
  const g = new Game(lv, { seed: 1, ai: false });
  g.step({ ...emptyInput(), yaw: g.player.yaw });
  return g;
}
/** The yaw / pitch that put the crosshair on her torso. */
function onHer(g: Game): { yaw: number; pitch: number } {
  const p = g.player, e = g.enemies[0];
  const yaw = Math.atan2(-(e.x - p.x), -(e.z - p.z));
  const t = assistTarget(g, yaw, 0);
  assert.ok(t, "she is in the zone when he looks her way");
  return { yaw: yaw + t.dyaw, pitch: t.dpitch };
}

test("aim assist: a hostile near the crosshair in plain sight; never through a wall, never the dead, never far off", () => {
  const g = assistRoom();
  const on = onHer(g);
  const t = assistTarget(g, on.yaw + 0.02, on.pitch)!;
  assert.ok(t && t.dyaw < 0 && Math.abs(t.dyaw + 0.02) < 1e-6, "the error points back at her");
  assert.equal(assistTarget(g, on.yaw + 0.3, on.pitch), null, "well off her: no assist");
  assert.equal(assistTarget(assistRoom(true), on.yaw, on.pitch), null, "a wall between");
  const e = g.enemies[0];
  e.state = "dead";
  e.hp = 0;
  assert.equal(assistTarget(g, on.yaw + 0.02, on.pitch), null, "the dead");
});

test("aim assist: friction near her, a light pull only while aiming, nothing when Off; Low is lighter than Normal", () => {
  const t = { enemy: 0, dyaw: 0.02, dpitch: 0, err: 0.02, radius: 0.07 };
  assert.deepEqual(assistStep("off", t, 1, 1 / 60), { slow: 1, dyaw: 0, dpitch: 0 });
  const n = assistStep("normal", t, 0, 1 / 60);
  assert.ok(n.slow < 1 && n.slow >= 1 - ASSIST.normal.slow);
  assert.equal(n.dyaw, 0, "no pull without aiming");
  const pull = assistStep("normal", t, 1, 1 / 60);
  assert.ok(pull.dyaw > 0 && pull.dyaw < 0.02 * 0.1, "a light pull (a few % of the error a frame)");
  const low = assistStep("low", t, 1, 1 / 60);
  assert.ok(low.slow > n.slow && low.dyaw < pull.dyaw);
});

test("aim assist: the pad gets it (slower stick near her, L2 pulls onto her), the mouse never does", () => {
  const lv = level([markerNode("spawn", "spawn", [0, 0, 0], {}, 0), markerNode("e1", "enemy", [0, 0, -15])]);
  const run = (assist: "off" | "normal", drive: (s: Session, pad: FakePad) => void): { s: Session; start: number } => {
    let out!: { s: Session; start: number };
    withPad((_b, pad) => {
      const s = new Session(lv, {}, "t", { seed: 1, ai: false });
      s.paused = false;
      s.input.assistLevel = assist;
      s.frame(1 / 60);
      const on = onHer(s.game);
      s.input.yaw = on.yaw + 0.03;
      s.input.pitch = on.pitch;
      out = { s, start: s.input.yaw };
      drive(s, pad);
    });
    return out;
  };
  // a small stick push toward her (right: the aim is 0.03 rad to her left): slower with the assist on
  const turn = (s: Session, pad: FakePad) => { pad.axes = [0, 0, 0.4, 0]; for (let i = 0; i < 2; i++) s.frame(1 / 60); };
  const y0 = run("off", turn), y1 = run("normal", turn);
  const moved = (r: { s: Session; start: number }) => r.start - r.s.input.yaw;
  assert.ok(moved(y0) > 0 && moved(y1) > 0 && moved(y1) < moved(y0) * 0.9, `friction near her (${moved(y1).toFixed(4)} vs ${moved(y0).toFixed(4)})`);
  // L2 held, no stick: the aim drifts onto her
  const hold = (s: Session, pad: FakePad) => { pad.buttons[BTN.l2] = { pressed: true, value: 1 }; for (let i = 0; i < 60; i++) s.frame(1 / 60); };
  const pulled = run("normal", hold), still = run("off", hold);
  const her = onHer(pulled.s.game).yaw;
  assert.ok(Math.abs(pulled.s.input.yaw - her) < 0.03 * 0.7, `pulled toward her (${(pulled.s.input.yaw - her).toFixed(4)})`);
  assert.equal(still.s.input.yaw, still.start, "Off: no pull");
  // the mouse: exactly its own motion, however close she is
  const m = run("normal", (s: Session) => {
    const y = s.input.yaw;
    s.input.look(-10, 0);
    const want = y + 10 * 0.0022 * s.input.sensitivity;
    assert.ok(Math.abs(s.input.yaw - want) < 1e-12, "no friction on the mouse");
    for (let i = 0; i < 30; i++) s.frame(1 / 60);
    assert.ok(Math.abs(s.input.yaw - want) < 1e-12, "no pull on the mouse");
  });
  assert.equal(m.s.input.via, "kbm");
});

test("gamepad: a pad-played room's recorded frames replay bit-exactly", () => {
  const lv = level([markerNode("spawn", "spawn", [0, 0, 0], {}, 0), markerNode("e1", "enemy", [2, 0, -14]), markerNode("e2", "enemy", [-3, 0, -18]), boxNode("crate", [1.5, 0.5, -6], [1, 1, 1])]);
  withPad((b, pad) => {
    const s = new Session(lv, {}, "t", { seed: 3, difficulty: "normal" });
    s.paused = false;
    s.record = [];
    /** The game's hash after each frame, at the index of that frame's last step. */
    const marks = new Map<number, string>();
    let f = 0;
    const script = () => {
      // walk forward and strafe, sweep the aim, fire in bursts, a dive, bullet time, a reload
      pad.axes = [Math.sin(f / 40) * 0.8, -0.7, Math.sin(f / 25) * 0.35, Math.cos(f / 50) * 0.15];
      const fire = f % 50 < 30;
      pad.buttons[BTN.r2] = { pressed: fire, value: fire ? 0.9 : 0 };
      for (const [i, at] of [[BTN.r1, 90], [BTN.r3, 40], [BTN.square, 200], [BTN.l1, 260], [BTN.triangle, 300]] as const) press(b, i, f === at);
      f++;
    };
    for (let i = 0; i < 480; i++) {
      script();
      s.frame(1 / 60);
      if (s.record!.length) marks.set(s.record!.length - 1, s.game.hash());
    }
    const log = s.record!;
    assert.ok(log.length > 800, `steps recorded (${log.length})`);
    assert.ok(s.game.stats.shots > 0 && s.game.stats.dodges > 0, "it fought");
    const r = new Game(lv, { seed: 3, difficulty: "normal" });
    for (let i = 0; i < log.length; i++) {
      r.step({ ...log[i] });
      const want = marks.get(i);
      if (want && r.hash() !== want) assert.fail(`diverged at step ${i}`);
    }
    assert.equal(r.hash(), s.game.hash());
  });
});

test("gamepad: Circle held is #4764's guard (the level in the frame), its press still the melee edge", () => {
  withPad(b => {
    const l = new InputLatch();
    l.poll(1 / 60);
    press(b, BTN.circle);
    l.poll(1 / 60);
    let f = l.consume();
    assert.equal(f.melee, true);
    assert.equal(f.guard, true);
    l.poll(1 / 60);
    f = l.consume();
    assert.equal(f.melee, false);
    assert.equal(f.guard, true, "held");
    press(b, BTN.circle, false);
    l.poll(1 / 60);
    f = l.consume();
    assert.equal(f.guard, false);
  });
  assert.ok(PAD_CONTROLS.some(([gs, what]) => gs.includes("circle") && /guard/.test(what)), "the controls list says so");
});

test("gamepad: a stick that rests past the dead zone (drift) does not keep the pad's glyphs after a key; a real push brings them back", () => {
  withPad((_b, pad) => {
    const l = new InputLatch();
    pad.axes = [0.3, 0.1, 0, 0.25];
    l.poll(1 / 60);
    assert.equal(useDevice.getState().device, "pad", "the stick leaving its dead zone is a use");
    l.press("KeyW");
    l.release("KeyW");
    assert.equal(useDevice.getState().device, "kbm");
    for (let i = 0; i < 30; i++) l.poll(1 / 60);
    assert.equal(useDevice.getState().device, "kbm", "the same resting stick, frame after frame: the keys stay");
    assert.equal(l.via, "kbm");
    // a small wobble around the resting spot: still the keys
    pad.axes = [0.34, 0.12, 0.02, 0.27];
    l.poll(1 / 60);
    assert.equal(useDevice.getState().device, "kbm");
    // a real push
    pad.axes = [1, 0, 0, 0.25];
    l.poll(1 / 60);
    assert.equal(useDevice.getState().device, "pad");
    // back to centre and out again: a use
    l.press("KeyA");
    pad.axes = [0, 0, 0, 0];
    l.poll(1 / 60);
    assert.equal(useDevice.getState().device, "kbm");
    pad.axes = [0, 0, 0.4, 0];
    l.poll(1 / 60);
    assert.equal(useDevice.getState().device, "pad");
  });
});

test("cover keys: C takes cover; in cover the right mouse pops out while held (Q stays bullet time); L2 is the pad's pop", () => {
  const l = new InputLatch();
  l.press("KeyC");
  let f = { ...l.consume() };
  assert.equal(f.cover, true);
  assert.equal({ ...l.consume() }.cover, false, "an edge");
  l.mouseDown(2);
  f = { ...l.consume() };
  assert.equal(f.bt, true, "out of cover: right mouse is bullet time");
  l.mouseUp(2);
  l.coverMode = true;
  l.mouseDown(2);
  f = { ...l.consume() };
  assert.equal(f.bt, false, "in cover: no bullet time on the right mouse");
  assert.equal(f.aim, true, "held: aim (pop out)");
  l.mouseUp(2);
  assert.equal({ ...l.consume() }.aim, false);
  l.press("KeyQ");
  assert.equal({ ...l.consume() }.bt, true, "Q still toggles it");
  withPad(b => {
    const k = new InputLatch();
    b[BTN.l2].value = 0.8; b[BTN.l2].pressed = true;
    k.poll(1 / 60);
    assert.equal({ ...k.consume() }.aim, true);
  });
});
