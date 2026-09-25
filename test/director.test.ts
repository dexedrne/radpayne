// The voice director's air rules (merge pass, REVIEW F2 / playtest): the DJ on the PA and the rival
// heavies never talk over the narrator (they are held, subtitles included, until the air is clear), the
// narrator never starts over one of them, the rusher line is room 2's own, and the breach hint goes
// the moment he is through the door. Driven with a fake clock and fake voices.
import test from "node:test";
import assert from "node:assert/strict";
import { Director, type DirectorIO } from "../src/app/director.ts";
import { Session } from "../src/app/session.ts";
import { useUi } from "../src/ui/store.ts";
import { room2, room3 } from "./helpers.ts";
import type { GameEvent } from "../src/sim/types.ts";

type Call = { at: number; kind: string; line: string; len: number };

/** A fake audio + clock: every voice returns a fixed length; `until(ms)` advances time in 50 ms frames. */
function rig(roomId: "room2" | "room3") {
  const lvl = roomId === "room2" ? room2() : room3();
  const s = new Session(lvl, {}, roomId, { seed: 1 });
  let t = 0;
  const timers: Array<{ at: number; fn: () => void }> = [];
  const calls: Call[] = [];
  const LEN: Record<string, number> = { narrate: 4.0, pa: 2.0, heavy: 1.0, bark: 0.8 };
  const rec = (kind: string, line: string) => { const len = LEN[kind] ?? 0.5; calls.push({ at: t, kind, line, len }); return len; };
  const io: DirectorIO = {
    now: () => t,
    later: (fn, ms) => { timers.push({ at: t + ms, fn }); },
    narrate: l => rec("narrate", l),
    stopNarration: () => undefined,
    pa: l => rec("pa", l),
    heavyBark: l => rec("heavy", l),
    bark: (_v, k) => rec("bark", k),
    radbro: l => { rec("radbro", l); return 0.5; },
    crowdVoice: () => true,
  };
  const d = new Director(s, io);
  const until = (ms: number) => {
    while (t < ms) {
      t += 50;
      for (const x of timers.filter(x => x.at <= t)) { timers.splice(timers.indexOf(x), 1); x.fn(); }
      d.frame();
    }
  };
  const ev = (e: GameEvent) => d.onEvent(e);
  return { s, d, calls, until, ev, now: () => t };
}

/** Seconds of overlap between the narrator's lines and the lines of `kind`. */
function overlaps(calls: Call[], kind: string): number {
  let worst = 0;
  for (const n of calls.filter(c => c.kind === "narrate")) {
    for (const o of calls.filter(c => c.kind === kind)) {
      const a = Math.max(n.at, o.at), b = Math.min(n.at + n.len * 1000, o.at + o.len * 1000);
      worst = Math.max(worst, (b - a) / 1000);
    }
  }
  return worst;
}

test("director: the DJ's PA waits for the narrator, subtitle and all, and the narrator waits for the PA", () => {
  const r = rig("room2");
  r.until(1700); // the room's opening line is on (r2_enter at +1.5 s)
  assert.ok(r.calls.some(c => c.kind === "narrate" && c.line === "r2_enter"), "the opening line plays");
  const dj = r.s.game.enemies.findIndex(e => e.id === "goon-dj");
  assert.ok(dj >= 0);
  r.ev({ type: "alert", enemy: dj }); // pa_1 is cued 0.4 s later, while the narrator talks
  r.until(3000);
  assert.ok(!r.calls.some(c => c.kind === "pa"), "no PA line over the narrator");
  r.until(8000);
  const pa1 = r.calls.find(c => c.kind === "pa" && c.line === "pa_1");
  assert.ok(pa1, "the PA line plays once the narrator is done");
  assert.equal(overlaps(r.calls, "pa"), 0);
  // its subtitle is on screen with it
  r.until(pa1!.at + 100);
  assert.equal(useUi.getState().subtitle.text, "girls? we have a guest.");
  // a narrator line due while the PA talks waits for it: the first shot (r2_scatter at +1.5 s) and
  // pa_2 six seconds later, then the backup's pa_3 right on top of the scatter line
  r.ev({ type: "firstShot", x: 0, z: 0 });
  r.until(r.now() + 1600);
  r.ev({ type: "trigger", action: "spawn", group: "backup", id: "t" } as unknown as GameEvent);
  r.until(r.now() + 20_000);
  assert.ok(r.calls.some(c => c.kind === "narrate" && c.line === "r2_scatter"));
  assert.ok(r.calls.some(c => c.kind === "pa" && c.line === "pa_3"), "pa_3 is held, not dropped");
  assert.equal(overlaps(r.calls, "pa"), 0, "no PA line and narrator line ever overlap");
});

test("director: the heavies never talk over the narrator: the taunt is held, his grunts are dropped", () => {
  const r = rig("room3");
  const hv = r.s.game.enemies.findIndex(e => e.kind === "heavy");
  assert.ok(hv >= 0);
  const e = r.s.game.enemies[hv];
  r.until(1100); // r3_enter at +1.0 s
  assert.ok(r.calls.some(c => c.kind === "narrate" && c.line === "r3_enter"));
  // a hit on him mid-line: no grunt; his alert: held a moment (the narrator's r3_heavy follows it)
  r.ev({ type: "hurt", target: hv, amount: 10, part: 0, hp: 200 });
  r.until(1500);
  assert.ok(!r.calls.some(c => c.kind === "heavy"), "nothing from him over the narrator");
  // the taunt: close, in sight, advancing, while the narrator still talks -> held, then played
  const p = r.s.game.player;
  e.state = "advance"; e.sees = true; e.x = p.x + 3; e.z = p.z; e.stateT = 0;
  r.until(3000);
  assert.ok(!r.calls.some(c => c.kind === "heavy" && c.line === "taunt_1"));
  r.until(9000);
  const taunt = r.calls.find(c => c.kind === "heavy" && c.line === "taunt_1");
  assert.ok(taunt, "the taunt plays after the line");
  r.until(taunt!.at + 100);
  assert.equal(useUi.getState().subtitle.text, "you should've sold.");
  assert.equal(overlaps(r.calls, "heavy"), 0);
});

test("director: the rusher line is room 2's; room 3's first rusher does not replay it", () => {
  for (const room of ["room2", "room3"] as const) {
    const r = rig(room);
    r.until(8000);
    const ru = r.s.game.enemies.find(e => e.kind === "rusher")!;
    ru.state = "alert";
    r.until(8100);
    ru.state = "rush";
    r.until(16_000);
    const said = r.calls.some(c => c.kind === "narrate" && c.line === "r2_rusher");
    assert.equal(said, room === "room2", `${room}: r2_rusher ${said ? "played" : "did not play"}`);
  }
});

test("director: the breach hint goes the moment he is through (on screen, or still waiting to play)", () => {
  const r = rig("room3");
  r.until(7000);
  r.ev({ type: "trigger", action: "breach", group: "office", id: "b" } as unknown as GameEvent);
  r.until(7400);
  assert.equal(useUi.getState().subtitle.hint, "SHIFT: dive through the door");
  r.ev({ type: "breach", kick: false } as unknown as GameEvent);
  assert.equal(useUi.getState().subtitle.hint, "", "cleared at once");
  // a second attempt: through the door before the line starts -> the line comes without the hint
  const q = rig("room3");
  q.until(1100); // r3_enter is on the air, so r3_breach has to wait
  q.ev({ type: "trigger", action: "breach", group: "office", id: "b" } as unknown as GameEvent);
  q.ev({ type: "breach", kick: false } as unknown as GameEvent);
  q.until(12_000);
  assert.ok(q.calls.some(c => c.kind === "narrate" && c.line === "r3_breach"));
  assert.equal(useUi.getState().subtitle.hint, "");
});
