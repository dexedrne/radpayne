import { test } from "node:test";
import assert from "node:assert/strict";
import { InputLatch } from "../src/input/input.ts";
import { Session } from "../src/app/session.ts";
import { level, markerNode } from "./helpers.ts";

/** A standard-mapping pad the latch polls through navigator.getGamepads (restored afterwards). */
function withPad(fn: (buttons: Array<{ pressed: boolean; value: number }>) => void): void {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  const pad = { connected: true, axes: [0, 0, 0, 0], buttons };
  const nav = globalThis.navigator as unknown as Record<string, unknown>;
  const had = Object.getOwnPropertyDescriptor(nav, "getGamepads");
  Object.defineProperty(nav, "getGamepads", { value: () => [pad], configurable: true });
  try {
    fn(buttons);
  } finally {
    if (had) Object.defineProperty(nav, "getGamepads", had);
    else delete nav.getGamepads;
  }
}

test("gamepad: A and Start are edges (held, they fire once)", () => {
  withPad(b => {
    const l = new InputLatch();
    l.poll(1 / 60);
    assert.equal(l.padA, false);
    b[0].pressed = true;
    l.poll(1 / 60);
    assert.equal(l.padA, true);
    l.poll(1 / 60);
    assert.equal(l.padA, false);
    b[9].pressed = true;
    l.poll(1 / 60);
    assert.equal(l.padStart, true);
    l.poll(1 / 60);
    assert.equal(l.padStart, false);
  });
});

test("gamepad: A on the fight prompt starts the room before the steps, and the press never becomes a jump", () => {
  withPad(b => {
    const lv = level([markerNode("spawn", "spawn", [0, 0, 0], {}, Math.PI), markerNode("e1", "enemy", [3, 0, -30])]);
    const s = new Session(lv, {}, "t", { seed: 1, ai: false });
    s.paused = true;
    let started = 0;
    // what PlayPage does on the prompt: flush the press, unpause
    s.onPadA = () => { started++; s.input.flush(); s.paused = false; };
    s.frame(1 / 60);
    assert.equal(started, 0);
    b[0].pressed = true;
    s.frame(1 / 60);
    assert.equal(started, 1);
    assert.equal(s.paused, false);
    assert.ok(s.stepsLast > 0, "the room ran this frame");
    assert.equal(s.game.player.grounded, true, "no jump from the A that started it");
    s.frame(1 / 60);
    assert.equal(started, 1, "held A does not fire again");
  });
});
