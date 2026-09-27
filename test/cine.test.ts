// The kill cam (app/cine.ts): which kills earn one (the setting, the cooldown, the last kill), its
// timeline (the ride, the X-ray, the release, a skip), the victims it holds up, and the hold itself: the
// fight stops for it and the sim never knows (a run with kill cams in it ends bit-exactly where one
// without them does, step for step).
import test from "node:test";
import assert from "node:assert/strict";
import { CINE, CineCtl, bossBusy, flightFor, pickCine, type CineKill } from "../src/app/cine.ts";
import { Session } from "../src/app/session.ts";
import { Game } from "../src/sim/game.ts";
import { Bot } from "../src/sim/bot.ts";
import { room1 } from "./helpers.ts";

const kill = (o: Partial<CineKill> & { enemy: number }): CineKill => ({ weapon: "pistols", headshot: false, part: 1, from: { x: 0, y: 1.4, z: 0 }, to: { x: 0, y: 1.2, z: -10 }, final: false, at: 0, ...o });
const at = (m: number) => ({ x: 0, y: 1.2, z: -m });

test("kill cam: which kills earn one", () => {
  const long = 99;
  // special shots: a sniper kill, a headshot past 25 m, a round through two, a grenade's double
  assert.equal(pickCine([kill({ enemy: 0, weapon: "sniper", to: at(12) })], [], "special", long)?.kind, "sniper");
  assert.equal(pickCine([kill({ enemy: 0, headshot: true, to: at(31) })], [], "special", long)?.kind, "long");
  assert.equal(pickCine([kill({ enemy: 0, headshot: true, to: at(18) })], [], "special", long), null, "a close headshot is no special shot");
  assert.equal(pickCine([kill({ enemy: 0, to: at(40) })], [], "special", long), null, "nor a long body shot");
  const through = pickCine([kill({ enemy: 0, weapon: "handcannon", to: at(8) }), kill({ enemy: 1, weapon: "handcannon", to: at(11) })], [], "special", long);
  assert.equal(through?.kind, "pierce");
  assert.deepEqual(through?.kills.map(k => k.enemy), [0, 1]);
  // in bullet time the second body is reached a few steps later: the first kill is still recent
  assert.equal(pickCine([kill({ enemy: 1, weapon: "handcannon", to: at(11) })], [kill({ enemy: 0, weapon: "handcannon", to: at(8) })], "special", long)?.kind, "pierce");
  // a shotgun's pellets share the muzzle too: no "through two" for them
  assert.equal(pickCine([kill({ enemy: 0, weapon: "shotgun" }), kill({ enemy: 1, weapon: "shotgun" })], [], "special", long), null);
  const frag = { weapon: "grenade", from: { x: 3, y: 0.3, z: -9 } };
  assert.equal(pickCine([kill({ enemy: 0, ...frag }), kill({ enemy: 1, ...frag })], [], "special", long)?.kind, "grenade");
  assert.equal(pickCine([kill({ enemy: 0, ...frag })], [], "special", long), null, "one body is no double");
  // the cooldown: none within 20 s of the last cam; the last kill of a room ignores it
  assert.equal(pickCine([kill({ enemy: 0, weapon: "sniper" })], [], "special", CINE.cooldown - 1), null);
  assert.equal(pickCine([kill({ enemy: 0, final: true })], [], "special", 0.5)?.kind, "final");
  // the settings
  assert.equal(pickCine([kill({ enemy: 0, weapon: "sniper" })], [], "final", long), null, "final kill only");
  assert.equal(pickCine([kill({ enemy: 0, final: true })], [], "final", long)?.kind, "final");
  assert.equal(pickCine([kill({ enemy: 0, final: true })], [], "off", long), null, "off: not even the last");
  assert.equal(pickCine([kill({ enemy: 0 })], [], "always", CINE.alwaysCooldown + 0.1)?.kind, "shot", "always: any kill by a shot");
  assert.equal(pickCine([kill({ enemy: 0, weapon: "melee" })], [], "always", long), null, "a melee is not a shot");
});

test("kill cam: the ride, the X-ray, the release; any key skips; the victim stands until her round lands", () => {
  const c = new CineCtl();
  c.kill(kill({ enemy: 3, weapon: "sniper", to: at(36) }));
  const cam = c.decide(100, "special", false);
  assert.ok(cam && cam.ride && cam.kind === "sniper");
  assert.equal(cam.tag, "SNIPER · 36 M");
  assert.ok(Math.abs(cam.flight - flightFor(cam.dist)) < 1e-9 && cam.flight >= CINE.minFlight && cam.flight <= CINE.maxFlight);
  assert.ok(c.holding && c.holds(3) && !c.holds(2));
  // the round goes out fast and slows into her, never past her
  let prev = -1;
  for (let t = 0; t < cam.flight; t += 0.05) { cam.t = t; const b = c.bulletAt(cam); assert.ok(b > prev && b <= cam.dist + 1e-9); prev = b; }
  cam.t = 0;
  let impact = -1, release = -1, done = -1;
  for (let i = 1; i < 200 && done < 0; i++) {
    const r = c.step(1 / 60);
    if (r.impact) impact = i / 60;
    if (r.release) release = i / 60;
    if (r.done) done = i / 60;
  }
  assert.ok(Math.abs(impact - cam.flight) < 0.02 && Math.abs(release - cam.flight - CINE.xray) < 0.02 && Math.abs(done - cam.flight - CINE.xray - CINE.out) < 0.02, `${impact} ${release} ${done}`);
  assert.equal(c.cur, null);
  // a second special kill inside the cooldown earns nothing; the room's last kill does, and a key ends it
  c.kill(kill({ enemy: 4, weapon: "sniper" }));
  assert.equal(c.decide(105, "special", false), null);
  c.kill(kill({ enemy: 5, final: true }));
  const fin = c.decide(106, "special", true);
  assert.ok(fin && fin.final, "the last kill passes a block (the fight is over)");
  assert.ok(c.skip());
  assert.ok(c.flownFinal && c.landed.has(5));
  // blocked (a breach running slow, a boss changing phase): no cam
  c.kill(kill({ enemy: 6, weapon: "sniper" }));
  assert.equal(c.decide(200, "special", true), null);
});

test("kill cam: a boss changing phase blocks it for a few seconds", () => {
  const memo = { phase: -1, at: -1e9 };
  const g = { boss: { phase: 1, introT: 0 } };
  assert.equal(bossBusy({}, 10, memo), false, "no boss");
  assert.equal(bossBusy(g, 10, memo), false);
  g.boss.phase = 2;
  assert.equal(bossBusy(g, 11, memo), true);
  assert.equal(bossBusy(g, 13.5, memo), true);
  assert.equal(bossBusy(g, 14.5, memo), false);
  g.boss.introT = 1;
  assert.equal(bossBusy(g, 20, memo), true, "her intro");
});

test("kill cam: the hold stops the fight and the sim never knows (same steps, same state)", () => {
  const ref = new Game(room1(), { seed: 2, difficulty: "normal" });
  const refBot = new Bot();
  const hashes: string[] = [];
  for (let i = 0; i < 120 * 12; i++) { ref.step(refBot.next(ref)); ref.drain(); hashes.push(ref.hash()); }
  const s = new Session(room1(), {}, "room1", { seed: 2, difficulty: "normal" });
  s.bot = new Bot();
  s.paused = false;
  let steps = 0, held = 0;
  s.afterStep = () => {
    steps++;
    if (s.game.hash() !== hashes[steps - 1]) assert.fail(`diverged at step ${steps}`);
    if (steps % 300 === 0) s.hold = true; // a kill cam takes over mid-frame: the frame's other steps wait
  };
  for (let f = 0; f < 60 * 40 && steps < hashes.length; f++) {
    if (s.hold && ++held % 90 === 0) s.hold = false; // 1.5 s of cam
    const before = steps;
    s.frame(1 / 60);
    if (s.hold && steps - before > 0) assert.equal(steps % 300, 0, "the hold starts right after its step");
  }
  assert.ok(steps >= hashes.length, `${steps} steps`);
  assert.ok(held > 0, "the fight was held");
});

test("kill cam off: the sim's own final-kill cam is skipped through the input (a recorded log replays it)", () => {
  const s = new Session(room1(), {}, "room1", { seed: 1, difficulty: "normal" });
  s.bot = new Bot();
  s.paused = false;
  s.record = [];
  let skipped = false, inCam = 0;
  s.afterStep = () => { if (s.game.phase === "killcam") { inCam++; if (!skipped) { s.skipNext = true; skipped = true; } } };
  for (let f = 0; f < 60 * 120 && s.game.phase !== "done" && s.game.phase !== "clear"; f++) s.frame(1 / 60);
  assert.ok(skipped, "the final-kill cam started");
  assert.equal(s.game.phase, "clear");
  assert.equal(inCam, 1, "one step later it is over (the bot alone would watch 0.6 s of it)");
  assert.equal(s.record.filter(f => f.skip).length, 1, "the skip is in the recorded input");
  // the log replays to the same state
  const r = new Game(room1(), { seed: 1, difficulty: "normal" });
  for (const f of s.record) r.step({ ...f });
  assert.equal(r.hash(), s.game.hash());
});
