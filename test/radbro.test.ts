// The radbro.fun bridge (src/radbro/bridge.ts): message shapes, framed-only, the ready-request answer,
// the first-click focus + audio unlock, and the room end -> portal result mapping.
import { test } from "node:test";
import assert from "node:assert/strict";
import { RADPAYNE, createBridge, isFramed, readyMessage, resultMessage, roomResult, type BridgeWindow } from "../src/radbro/bridge.ts";

type Listener = { type: string; fn: (e: unknown) => void; once: boolean };

function fakeWindow(framed: boolean) {
  const sent: Array<{ m: unknown; origin: string }> = [];
  const parent = { postMessage: (m: unknown, origin: string) => sent.push({ m, origin }) };
  const ls: Listener[] = [];
  let focused = 0;
  const w: BridgeWindow & { parent: unknown } = {
    parent,
    addEventListener: (type, fn, opts) => ls.push({ type, fn: fn as (e: unknown) => void, once: typeof opts === "object" && !!opts.once }),
    removeEventListener: (type, fn) => { const i = ls.findIndex(l => l.type === type && l.fn === fn); if (i >= 0) ls.splice(i, 1); },
    focus: () => { focused++; },
  };
  if (!framed) w.parent = w;
  const fire = (type: string, e: unknown) => {
    for (const l of [...ls]) if (l.type === type) { l.fn(e); if (l.once) ls.splice(ls.indexOf(l), 1); }
  };
  return { w, sent, parent, fire, listeners: ls, focused: () => focused };
}

test("radbro: not framed = inert (no messages, no listeners)", () => {
  const f = fakeWindow(false);
  assert.equal(isFramed(f.w), false);
  const b = createBridge(RADPAYNE, f.w, { onFirstGesture: () => assert.fail("no gesture hook unframed") });
  assert.equal(b.active, false);
  b.ready();
  b.result("clear", 12);
  assert.equal(f.sent.length, 0);
  assert.equal(f.listeners.length, 0);
});

test("radbro: framed posts game-ready on start, with the full payload", () => {
  const f = fakeWindow(true);
  assert.equal(isFramed(f.w), true);
  const b = createBridge(RADPAYNE, f.w);
  assert.equal(b.active, true);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].origin, "*");
  const m = f.sent[0].m as Record<string, unknown>;
  assert.deepEqual(Object.keys(m).sort(), ["controls", "game", "hint", "objective", "padControls", "title", "type", "viewport"]);
  assert.equal(m.type, "radbro:game-ready");
  assert.equal(m.game, "radpayne");
  assert.equal(m.title, "RadPayne");
  assert.ok(typeof m.objective === "string" && m.objective.length > 10);
  assert.ok(typeof m.hint === "string" && m.hint.length > 10);
  assert.ok(Array.isArray(m.controls) && m.controls.length >= 4 && m.controls.every(c => typeof c === "string"));
  // the portal's play guide takes the controls as one comma-separated string: no commas inside an entry
  assert.ok((m.controls as string[]).every(c => !c.includes(",")));
  // and a pad version of the list: every action the keys have, named for PlayStation and Xbox
  const pad = m.padControls as string[];
  assert.ok(Array.isArray(pad) && pad.length >= m.controls.length - 2 && pad.every(c => typeof c === "string" && !c.includes(",")));
  for (const what of ["move", "aim", "fire", "bullet time", "shootdodge", "reload", "copium", "weapon", "melee", "grenade", "use", "pause", "scope"]) assert.ok(pad.some(c => c.includes(what)), what);
  assert.ok(pad.some(c => c.startsWith("R2 (RT)")), "PlayStation names, Xbox in brackets");
  assert.deepEqual(m.viewport, { width: 1280, height: 720 });
  b.dispose();
});

test("radbro: answers game-ready-request from the parent only", () => {
  const f = fakeWindow(true);
  createBridge(RADPAYNE, f.w);
  f.fire("message", { source: f.parent, data: { type: "radbro:game-ready-request" } });
  assert.equal(f.sent.length, 2);
  assert.equal((f.sent[1].m as { type: string }).type, "radbro:game-ready");
  f.fire("message", { source: {}, data: { type: "radbro:game-ready-request" } }); // someone else
  f.fire("message", { source: f.parent, data: { type: "something-else" } });
  f.fire("message", { source: f.parent, data: null });
  f.fire("message", { source: f.parent, data: "radbro:game-ready-request" });
  assert.equal(f.sent.length, 2);
});

test("radbro: game-result shapes (run / clear / gameover; score rounded, bad scores left out)", () => {
  const f = fakeWindow(true);
  const b = createBridge(RADPAYNE, f.w);
  b.result("run");
  b.result("clear", 23.456);
  b.result("gameover");
  b.result("clear", Number.NaN);
  assert.deepEqual(f.sent.slice(1).map(s => s.m), [
    { type: "radbro:game-result", game: "radpayne", status: "run" },
    { type: "radbro:game-result", game: "radpayne", status: "clear", score: 23.46 },
    { type: "radbro:game-result", game: "radpayne", status: "gameover" },
    { type: "radbro:game-result", game: "radpayne", status: "clear" },
  ]);
  assert.deepEqual(resultMessage("radpayne", "clear", null), { type: "radbro:game-result", game: "radpayne", status: "clear" });
  assert.deepEqual(resultMessage("radpayne", "clear", 0), { type: "radbro:game-result", game: "radpayne", status: "clear", score: 0 });
});

test("radbro: the first pointer press focuses the frame and unlocks the audio, once", () => {
  const f = fakeWindow(true);
  let unlocks = 0;
  createBridge(RADPAYNE, f.w, { onFirstGesture: () => { unlocks++; } });
  f.fire("pointerdown", {});
  f.fire("pointerdown", {});
  assert.equal(unlocks, 1);
  assert.equal(f.focused(), 1);
});

test("radbro: dispose removes the listeners", () => {
  const f = fakeWindow(true);
  const b = createBridge(RADPAYNE, f.w);
  b.dispose();
  assert.equal(f.listeners.length, 0);
  f.fire("message", { source: f.parent, data: { type: "radbro:game-ready-request" } });
  assert.equal(f.sent.length, 1);
});

test("radbro: a cleared room is a clear (its time in seconds); a death is a gameover", () => {
  assert.deepEqual(roomResult("done", { time: 83.4 }), { status: "clear", score: 83.4 });
  assert.deepEqual(roomResult("dead", { time: 12 }), { status: "gameover" });
});

test("radbro: readyMessage copies (the payload can't be mutated through a sent message)", () => {
  const m = readyMessage(RADPAYNE);
  m.controls.push("x");
  m.viewport.width = 1;
  assert.notEqual(RADPAYNE.controls.at(-1), "x");
  assert.equal(RADPAYNE.viewport.width, 1280);
});
