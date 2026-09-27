// The voice director's air rules (merge pass, REVIEW F2 / playtest): the DJ on the PA and the rival
// heavies never talk over the narrator (they are held, subtitles included, until the air is clear), the
// narrator never starts over one of them, the rusher line is room 2's own, and the breach hint goes
// the moment he is through the door. Driven with a fake clock and fake voices.
import test from "node:test";
import assert from "node:assert/strict";
import { Director, TALK, lineKind, type DirectorIO } from "../src/app/director.ts";
import { Session } from "../src/app/session.ts";
import { useUi } from "../src/ui/store.ts";
import { room2, room3, room4, room5 } from "./helpers.ts";
import type { GameEvent } from "../src/sim/types.ts";

type Call = { at: number; kind: string; line: string; len: number };

/** A fake audio + clock: every voice returns a fixed length; `until(ms)` advances time in 50 ms frames. */
function rig(roomId: "room2" | "room3" | "room4" | "room5") {
  const lvl = roomId === "room2" ? room2() : roomId === "room3" ? room3() : roomId === "room4" ? room4() : room5();
  const s = new Session(lvl, {}, roomId, { seed: 1 });
  let t = 0;
  const timers: Array<{ at: number; fn: () => void }> = [];
  const calls: Call[] = [];
  const LEN: Record<string, number> = { narrate: 4.0, pa: 2.0, heavy: 1.0, bark: 0.8, world: 1.2 };
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
    worldVoice: key => rec("world", key),
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
    r.until(20_000); // (the narrator's opening line and the budget's quiet after it)
    const ru = r.s.game.enemies.find(e => e.kind === "rusher")!;
    ru.state = "alert";
    r.until(20_100);
    ru.state = "rush";
    r.until(28_000);
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
  q.until(12_000); // r3_enter was said: r3_breach has to wait its turn (TALK.narr)
  q.ev({ type: "trigger", action: "breach", group: "office", id: "b" } as unknown as GameEvent);
  q.ev({ type: "breach", kick: false } as unknown as GameEvent);
  q.until(24_000);
  assert.ok(q.calls.some(c => c.kind === "narrate" && c.line === "r3_breach"));
  assert.equal(useUi.getState().subtitle.hint, "");
});

test("director: Madame Pockit's lines never play after her fall, nor out of their moment; the narrator's last-stand line plays first", () => {
  const r = rig("room5");
  const g = r.s.game;
  const b = g.boss!;
  const her = g.enemies[b.idx];
  b.started = true;
  r.until(500);
  // the last stand: the narrator's line, then hers once the air is clear
  b.lastStand = 1;
  r.ev({ type: "boss", what: "lastStand" } as unknown as GameEvent);
  r.until(9000);
  const nar = r.calls.find(c => c.kind === "narrate" && c.line === "r5_laststand");
  const hers = r.calls.find(c => c.kind === "world" && c.line === "madame/last_stand");
  assert.ok(nar, "the narrator's last-stand line plays");
  assert.ok(hers && hers.at >= nar!.at + nar!.len * 1000, "hers after it");
  // a stagger line held behind the narrator, then she falls: it is dropped; her fall line plays
  const q = rig("room5");
  const qb = q.s.game.boss!;
  const qher = q.s.game.enemies[qb.idx];
  qb.started = true;
  q.until(500);
  q.ev({ type: "boss", what: "rug" } as unknown as GameEvent); // the narrator's chandelier hint takes the air
  q.until(700);
  q.ev({ type: "boss", what: "stagger" } as unknown as GameEvent);
  q.until(900);
  qher.state = "dead";
  q.ev({ type: "boss", what: "down" } as unknown as GameEvent);
  q.until(12_000);
  const w = q.calls.filter(c => c.kind === "world").map(c => c.line);
  assert.ok(!w.includes("madame/stagger_1"), `no line after her fall (${w.join(", ")})`);
  assert.ok(w.includes("madame/down_1"), "her fall line");
  // the coat is off: a stagger is not "my coat!"
  const c = rig("room5");
  const cb = c.s.game.boss!;
  cb.started = true;
  cb.coat = false;
  c.until(9000);
  c.ev({ type: "boss", what: "stagger" } as unknown as GameEvent);
  c.until(12_000);
  const cw = c.calls.filter(x => x.kind === "world").map(x => x.line);
  assert.ok(!cw.includes("madame/stagger_1") && cw.includes("madame/hit_2"), cw.join(", "));
  void her;
});

test("director: the talk budget: one voice on the air at a time, a gap between combat lines, key moments through", () => {
  const rnd = Math.random;
  Math.random = () => 0; // every chance says yes: only the budget holds them back
  try {
    const r = rig("room2");
    r.until(7000); // past the opening line
    const n0 = r.calls.length;
    const g = r.s.game;
    const goons = g.enemies.filter(e => e.kind === "goon").map(e => e.idx);
    // a burst of hits on every goon for 20 s: without the budget each would grunt
    for (let k = 0; k < 40; k++) {
      r.ev({ type: "hurt", target: goons[k % goons.length], amount: 5, part: 1, hp: 50 });
      r.until(r.now() + 500);
    }
    const lines = r.calls.slice(n0);
    const barks = lines.filter(c => c.kind === "bark");
    assert.ok(barks.length >= 1 && barks.length <= 3, `${barks.length} grunts in 20 s (gap ${TALK.normal.gap} s)`);
    for (let i = 1; i < barks.length; i++) assert.ok(barks[i].at - (barks[i - 1].at + barks[i - 1].len * 1000) >= TALK.normal.gap * 1000 - 1, "the gap between combat lines");
    // no two voices ever overlap
    const all = r.calls;
    for (let i = 1; i < all.length; i++) assert.ok(all[i].at >= all[i - 1].at + all[i - 1].len * 1000 - 1 || all[i].kind === "radbro" && all[i - 1].kind === "radbro", `${all[i - 1].kind} ${all[i - 1].line} and ${all[i].kind} ${all[i].line} overlap`);
    // a new group's first alert is a key moment: it goes at once, gap or not
    const backup = g.enemies.find(e => e.group === "backup");
    assert.ok(backup);
    r.ev({ type: "hurt", target: goons[0], amount: 5, part: 1, hp: 50 });
    const before = r.calls.length;
    r.until(r.now() + 1200);
    r.ev({ type: "alert", enemy: backup!.idx });
    r.until(r.now() + 2500);
    assert.ok(r.calls.slice(before).some(c => c.kind === "bark" && c.line === "alert"), "the backup's first alert is called");
  } finally {
    Math.random = rnd;
  }
});

test("director: Voice chatter off: no barks, no grunts; the narrator still talks", () => {
  const rnd = Math.random;
  Math.random = () => 0;
  useUi.setState({ chatter: "off" });
  try {
    const r = rig("room2");
    r.until(1700);
    const g = r.s.game;
    for (const e of g.enemies) r.ev({ type: "alert", enemy: e.idx });
    for (let k = 0; k < 20; k++) { r.ev({ type: "hurt", target: k % g.enemies.length, amount: 5, part: 1, hp: 50 }); r.ev({ type: "hurt", target: -1, amount: 5, part: 1, hp: 60 }); r.until(r.now() + 500); }
    assert.ok(r.calls.some(c => c.kind === "narrate" && c.line === "r2_enter"));
    assert.ok(!r.calls.some(c => c.kind === "bark" || c.kind === "heavy" || c.kind === "radbro"), r.calls.map(c => c.line).join(","));
  } finally {
    Math.random = rnd;
    useUi.setState({ chatter: "normal" });
  }
});

test("director: the tutorial lines play the first time ever (localStorage); a retry skips room lines already heard", () => {
  const mem = new Map<string, string>();
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) } });
  try {
    const play = () => {
      const r = rig("room3"); // room 3 teaches too (no tutorial: false)
      r.s.level.room.tutorial = true;
      r.until(6000);
      r.ev({ type: "alert", enemy: r.s.game.enemies.findIndex(e => e.kind !== "heavy") });
      r.until(20_000); // (its turn: TALK.narr after the opening line)
      return r;
    };
    const first = play();
    const tut = (r: ReturnType<typeof rig>) => r.calls.filter(c => c.kind === "narrate" && c.line.startsWith("tut_")).map(c => c.line);
    assert.deepEqual(tut(first), ["tut_shoot"]);
    assert.deepEqual(JSON.parse(mem.get("radpayne.tutHeard") ?? "[]"), ["tut_shoot"]);
    assert.deepEqual(tut(play()), [], "not again on this browser");
    // a retry in the same room: the opening line is not replayed
    const r = first;
    const enters = () => r.calls.filter(c => c.kind === "narrate" && c.line === "r3_enter").length;
    assert.equal(enters(), 1);
    r.s.restart();
    r.until(r.now() + 6000);
    assert.equal(enters(), 1, "a retry does not replay r3_enter");
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had); else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test("director: the narrator is under the talk budget: story beats always, teaching lines spaced (or just their hint), commentary Normal's only", () => {
  // Normal: a burst of teaching cues right after the opening line: spaced TALK.narr apart, the ones that
  // miss their wait show their hint
  const r = rig("room3");
  const hints = new Set<string>();
  const step = (ms: number) => { while (r.now() < ms) { r.until(r.now() + 50); for (const h of useUi.getState().subtitle.hint.split("  ·  ")) if (h) hints.add(h); } };
  step(6000);
  r.ev({ type: "trigger", action: "breach", group: "office", id: "b" } as unknown as GameEvent);
  r.ev({ type: "pickup", item: "shotgun" } as unknown as GameEvent);
  r.ev({ type: "pickup", item: "smgs" } as unknown as GameEvent);
  step(60_000);
  const nar = r.calls.filter(c => c.kind === "narrate");
  assert.equal(nar[0]?.line, "r3_enter", "the room's first word");
  const taught = nar.filter(c => lineKind(c.line) !== "story");
  assert.ok(taught.length >= 1 && taught.length < 3, `${taught.map(c => c.line).join(", ")}: not all three`);
  for (let i = 1; i < nar.length; i++) if (lineKind(nar[i].line) !== "story") assert.ok(nar[i].at - nar[i - 1].at >= TALK.normal.narr * 1000 - 1, `${nar[i].line} ${((nar[i].at - nar[i - 1].at) / 1000).toFixed(1)} s after ${nar[i - 1].line}`);
  assert.ok(hints.has("SHIFT: dive through the door") && hints.has("1-5 / WHEEL: switch weapon") && hints.has("3: dual SMGs"), `every hint showed (${[...hints].join(" | ")})`);
  // Off: no teaching line is said, its hint shows; the story beats stay
  useUi.setState({ chatter: "off" });
  try {
    const o = rig("room3");
    o.until(12_000);
    o.ev({ type: "trigger", action: "breach", group: "office", id: "b" } as unknown as GameEvent);
    o.until(12_400);
    assert.equal(useUi.getState().subtitle.hint, "SHIFT: dive through the door");
    o.until(30_000);
    assert.deepEqual(o.calls.filter(c => c.kind === "narrate").map(c => c.line), ["r3_enter"]);
  } finally {
    useUi.setState({ chatter: "normal" });
  }
  // Less: no commentary (room 2's rusher line)
  useUi.setState({ chatter: "less" });
  try {
    const l = rig("room2");
    l.until(20_000);
    const ru = l.s.game.enemies.find(e => e.kind === "rusher")!;
    ru.state = "alert";
    l.until(20_100);
    ru.state = "rush";
    l.until(40_000);
    assert.ok(!l.calls.some(c => c.line === "r2_rusher"));
  } finally {
    useUi.setState({ chatter: "normal" });
  }
});

test("director: a kill cam holds the round-3 voices too (her lines, the ride's), and no victim bark starts under it", () => {
  const r = rig("room5");
  const b = r.s.game.boss!;
  b.started = true;
  r.until(500);
  r.s.hold = true;
  r.ev({ type: "boss", what: "intro" } as unknown as GameEvent);
  r.until(2500);
  assert.ok(!r.calls.some(c => c.kind === "world"), "nothing of hers while the cam holds");
  r.s.hold = false;
  r.until(4000);
  assert.ok(r.calls.some(c => c.kind === "world" && c.line === "madame/intro"), "her entrance line once it lets go");
  // a long hold: no taunt under it
  const n = r.calls.length;
  r.s.hold = true;
  r.until(90_000);
  assert.equal(r.calls.length, n, r.calls.slice(n).map(c => c.line).join(", "));
  r.s.hold = false;
  // the ride: a girl's "going up?" at the doors waits the cam out
  const q = rig("room4");
  q.until(12_000);
  q.s.hold = true;
  q.ev({ type: "ride", what: "open", stop: "S1", side: "n" } as unknown as GameEvent);
  q.until(12_600);
  assert.ok(!q.calls.some(c => c.kind === "world"));
  q.s.hold = false;
  q.until(14_000);
  assert.ok(q.calls.some(c => c.kind === "world" && c.line === "goon_a/doors_1"));
  // a heavy's death grunt under a cam is dropped (the victim of the ride is quiet)
  const h = rig("room3");
  h.until(20_000);
  const hv = h.s.game.enemies.findIndex(e => e.kind === "heavy");
  h.s.hold = true;
  h.ev({ type: "kill", target: hv, headshot: false, final: false } as unknown as GameEvent);
  h.until(20_500);
  h.s.hold = false;
  h.until(24_000);
  assert.ok(!h.calls.some(c => c.kind === "heavy" && c.line === "death_1"));
  // ...and one the cam has in hand before it holds (his round still flying on into the next body)
  const w = rig("room3");
  w.until(20_000);
  const wv = w.s.game.enemies.findIndex(e => e.kind === "heavy");
  w.s.quiet = i => i === wv;
  w.ev({ type: "kill", target: wv, headshot: false, final: false } as unknown as GameEvent);
  w.until(24_000);
  assert.ok(!w.calls.some(c => c.kind === "heavy"), w.calls.map(c => c.line).join(", "));
});
