// The kill cam (app/cine.ts): which kills earn one (the setting, the cooldown, the last kill), its
// timeline (the ride, the X-ray, the release, a skip), the victims it holds up, and the hold itself: the
// fight stops for it and the sim never knows (a run with kill cams in it ends bit-exactly where one
// without them does, step for step).
import test from "node:test";
import assert from "node:assert/strict";
import { CINE, CineCtl, bossBusy, flightFor, pickCine, rideLens, rideMoving, type CineKill } from "../src/app/cine.ts";
import { planGroup, planRide } from "../src/app/killcam.ts";
import { World, makeBox } from "../src/sim/world.ts";
import { Session } from "../src/app/session.ts";
import { Game } from "../src/sim/game.ts";
import { Bot } from "../src/sim/bot.ts";
import { room1, room5 } from "./helpers.ts";

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

test("kill cam: none while Madame Pockit makes her entrance, changes phase, throws her coat or starts her last stand; her last kill passes", () => {
  const g = new Game(room5(), { seed: 1, difficulty: "normal" });
  const b = g.boss!;
  assert.ok(b, "room 5 has her");
  const memo = { phase: -1, stand: 0, at: -1e9 };
  assert.equal(bossBusy(null, 0, memo), false, "no boss");
  assert.equal(bossBusy(b, 1, memo), true, "before her entrance");
  b.started = true;
  b.introT = 1.5;
  assert.equal(bossBusy(b, 2, memo), true, "her entrance");
  b.introT = 0;
  assert.equal(bossBusy(b, 3, memo), false);
  b.phase = 2;
  assert.equal(bossBusy(b, 10, memo), true, "phase 2: door A's lamp");
  assert.equal(bossBusy(b, 10 + CINE.bossBeat - 0.1, memo), true);
  assert.equal(bossBusy(b, 10 + CINE.bossBeat + 0.1, memo), false);
  b.phase = 3;
  b.coatT = 5; // (a long coat throw outlasts the beat)
  assert.equal(bossBusy(b, 20, memo), true, "phase 3");
  assert.equal(bossBusy(b, 20 + CINE.bossBeat + 1, memo), true, "the coat coming off");
  b.coatT = 0;
  assert.equal(bossBusy(b, 20 + CINE.bossBeat + 1, memo), false);
  b.lastStand = 1;
  assert.equal(bossBusy(b, 30, memo), true, "her last stand starts");
  b.lastStand = 2;
  assert.equal(bossBusy(b, 32, memo), true, "she turns for the terrace");
  assert.equal(bossBusy(b, 32 + CINE.bossBeat + 0.1, memo), false);
  // her last kill passes any block: the final-kill cam
  const c = new CineCtl();
  b.lastStand = 3;
  c.kill(kill({ enemy: b.idx, final: true, weapon: "heart" }));
  const fin = c.decide(40, "special", true);
  assert.ok(fin && fin.final && fin.ride, "her last kill: the final-kill cam, riding the round into the grenade in her hand");
  c.skip();
  c.kill(kill({ enemy: b.idx, final: true, weapon: "chandelier" }));
  const ch = c.decide(50, "special", true);
  assert.ok(ch && ch.final && !ch.ride, "the chandelier on her: no round to ride, the push in");
});

test("kill cam: none while the elevator car is between stops", () => {
  assert.equal(rideMoving(null), false);
  for (const phase of ["leg", "arrive", "closing"]) assert.equal(rideMoving({ phase }), true, phase);
  for (const phase of ["opening", "open"]) assert.equal(rideMoving({ phase }), false, phase);
});

test("kill cam: a round through two in bullet time is one cam (the first kill waits for the round)", () => {
  const c = new CineCtl();
  let flying = true;
  c.kill(kill({ enemy: 0, weapon: "sniper", to: at(8), at: 50 }));
  assert.equal(c.decide(50, "special", false, () => flying), null, "the round flies on: no cam yet");
  assert.ok(c.holds(0), "she stands while it does");
  assert.equal(c.decide(50.1, "special", false, () => flying), null, "still flying");
  c.kill(kill({ enemy: 1, weapon: "sniper", to: at(14), at: 50.3 }));
  flying = false;
  const cam = c.decide(50.3, "special", false, () => flying);
  assert.equal(cam?.kind, "pierce");
  assert.deepEqual(cam!.kills.map(k => k.enemy), [0, 1], "both bodies, nearest first");
  assert.equal(cam!.tag, "TWO WITH ONE");
  // a round flying on into nothing: the cam comes once the wait is over
  const d = new CineCtl();
  d.kill(kill({ enemy: 2, weapon: "sniper", at: 60 }));
  assert.equal(d.decide(60, "special", false, () => true), null);
  assert.equal(d.decide(60 + CINE.pierceWait + 0.01, "special", false, () => true)?.kind, "sniper");
  // no cam to be had (the cooldown): no waiting, her fall is not held
  d.skip();
  d.kill(kill({ enemy: 3, weapon: "sniper", at: 61 }));
  assert.equal(d.decide(61, "special", false, () => true), null);
  assert.equal(d.holds(3), false);
});

test("kill cam: the ride is checked along its whole path; a cabin beside the round moves the lens off it, a slot with no room holds a side angle", () => {
  const c = { from: { x: 0, y: 1.4, z: 0 }, to: { x: 0, y: 1.2, z: -14 }, dist: 0, flight: 0 };
  c.dist = Math.hypot(0, -0.2, -14);
  c.flight = flightFor(c.dist);
  const lv = room1();
  // a parked car's cabin just off the round's line on the lens's usual side, mid-way (the old
  // three-point check stepped over it)
  const cab = makeBox(0, "cab", -0.35, 1.45, -5.2, 0.4, 0.7, 1.4);
  const eye0 = { x: 0, y: 0, z: 0 }, look0 = { x: 0, y: 0, z: 0 };
  let hit0 = false;
  for (let i = 0; i <= 200; i++) { rideLens(c, ((c.flight + CINE.xray) * i) / 200, 0.25, 0.18, eye0, look0); if (eye0.x > cab.x0 && eye0.x < cab.x1 && eye0.z > cab.z0 && eye0.z < cab.z1 && eye0.y > cab.bottom && eye0.y < cab.top) hit0 = true; }
  assert.ok(hit0, "(the usual offset rides through it)");
  const w = new World([cab]);
  const pl = planRide(c, { x: 0, y: 0, z: -14 }, [], w, lv, w);
  assert.ok(pl.ok, "a clean offset exists");
  const eye = { x: 0, y: 0, z: 0 }, look = { x: 0, y: 0, z: 0 };
  for (let i = 0; i <= 200; i++) {
    rideLens(c, ((c.flight + CINE.xray) * i) / 200, pl.side, pl.lift, eye, look);
    const inX = eye.x > cab.x0 - 0.15 && eye.x < cab.x1 + 0.15, inZ = eye.z > cab.z0 - 0.15 && eye.z < cab.z1 + 0.15, inY = eye.y > cab.bottom - 0.15 && eye.y < cab.top + 0.15;
    assert.ok(!(inX && inY && inZ), `the lens in the cabin at sample ${i} (${eye.x.toFixed(2)}, ${eye.y.toFixed(2)}, ${eye.z.toFixed(2)})`);
  }
  // a body down beside the line: the lens keeps off it (no face filling the frame)
  const down = { x: 0.5, y: 0, z: -7, h: 0.7, r: 0.95 };
  const open = new World([]);
  const low = { ...c, from: { x: 0, y: 0.45, z: 0 }, to: { x: 0, y: 0.5, z: -14 } }; // (fired lying down, along the floor)
  for (const cc of [c, low]) {
    const pb = planRide(cc, { x: 0, y: 0, z: -14 }, [down], open, lv, open);
    assert.ok(pb.ok);
    for (let i = 0; i <= 200; i++) {
      rideLens(cc, ((cc.flight + CINE.xray) * i) / 200, pb.side, pb.lift, eye, look);
      assert.ok(!(eye.y < down.h + 0.1 && Math.hypot(eye.x - down.x, eye.z - down.z) < down.r + 0.15), `the lens at the body (sample ${i}, from ${cc.from.y} m)`);
    }
  }
  // a slot 0.6 m wide under a low ceiling: nowhere to ride
  const slot = new World([makeBox(0, "l", -0.55, 1.5, -7, 0.5, 3, 12), makeBox(1, "r", 0.55, 1.5, -7, 0.5, 3, 12), makeBox(2, "c", 0, 1.95, -7, 1.6, 0.3, 12)]);
  assert.equal(planRide(c, { x: 0, y: 0, z: -14 }, [], slot, lv, slot).ok, false);
});

test("kill cam: a round through two freezes on a frame with both bodies in it", () => {
  const lv = room1();
  const bodies = [{ x: 0, y: 0, z: -8, h: 1.9 }, { x: 0.4, y: 0, z: -13, h: 1.9 }];
  // a wall down the right of the line: the frame comes from the left
  const w = new World([makeBox(0, "wall", 2.2, 2, -10, 0.6, 4, 20)]);
  const gs = planGroup(bodies, { x: 0, y: 1.4, z: 0 }, w, lv, w);
  assert.ok(gs, "a frame exists");
  assert.ok(gs!.ex < 0, `from the open side (x ${gs!.ex.toFixed(2)})`);
  for (const b of bodies) {
    const vx: number = b.x - gs!.ex, vy: number = b.y + 1.1 - gs!.ey, vz: number = b.z - gs!.ez;
    const d = Math.hypot(vx, vy, vz);
    assert.equal(w.raycast(gs!.ex, gs!.ey, gs!.ez, vx / d, vy / d, vz / d, d - 0.1, false), null, "each chest in sight");
    // inside ~70 % of a 16:9 lens's width around the look-at point
    const a1 = Math.atan2(b.x - gs!.ex, b.z - gs!.ez), a0 = Math.atan2(gs!.ax - gs!.ex, gs!.az - gs!.ez);
    assert.ok(Math.abs(Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0))) < 0.62, "in frame");
  }
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
