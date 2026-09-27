// #4764's katana guard (sim/game.ts stepGuard / deflect): hold the melee button to guard, tap it to cut;
// rounds from the front meet the blade (the meter pays, a perfect parry does not, a shotgun blast pays
// once and shoves); empty, the guard breaks; in bullet time the round goes back and can kill (the kill
// cam's RETURN TO SENDER); outside it the round glances off. The gang reacts; the input frame carries the
// held button; everything replays bit-exactly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, type Grenade } from "../src/sim/game.ts";
import { Bot } from "../src/sim/bot.ts";
import { alertGoon } from "../src/ai/goon.ts";
import { SHOULDER } from "../src/sim/aim.ts";
import { DT, GUARD } from "../src/sim/tuning.ts";
import { HB_TORSO, aimPoint, makeCapsules } from "../src/combat/hitboxes.ts";
import { InputLatch } from "../src/input/input.ts";
import { CineCtl, pickCine } from "../src/app/cine.ts";
import { emptyInput, type GameEvent, type InputFrame } from "../src/sim/types.ts";
import { level, markerNode, room1 } from "./helpers.ts";

const PI = Math.PI;
const spawn = markerNode("spawn", "spawn", [0, 0, 0], {}, PI);
type Ev<T extends GameEvent["type"]> = Extract<GameEvent, { type: T }>;

/** Him at the origin looking down -Z; goons (ai off unless asked) where the test puts them. */
function mk(goons: Array<[number, number, number] | { at: [number, number, number]; kind?: string }>, opts: { katana?: boolean; ai?: boolean } = {}) {
  const lv = level([spawn, ...goons.map((g, i) => {
    const at = Array.isArray(g) ? g : g.at;
    const kind = Array.isArray(g) ? "goon" : g.kind ?? "goon";
    return markerNode(`e${i}`, "enemy", at, { milady: 3 + i, kind });
  })]);
  const g = new Game(lv, { ai: opts.ai ?? false, seed: 1, katana: opts.katana ?? true });
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  const ev: GameEvent[] = [];
  const step = (n = 1, f: Partial<InputFrame> = {}) => { for (let i = 0; i < n; i++) { Object.assign(inp, f); g.step(inp); inp.melee = false; for (const e of g.drain()) ev.push(e); } };
  return { g, inp, ev, step };
}
const torso = (g: Game, i: number) => { const e = g.enemies[i], o = { x: 0, y: 0, z: 0 }; aimPoint(e.hit.body, e.hit.pose, HB_TORSO, o, makeCapsules()); return o; };
/** Enemy i fires one round at his chest (hitscan, or a projectile while the world is slowed). */
function fire(g: Game, i: number, weapon = "pistol", damage = 9, pellet = 0): void {
  const e = g.enemies[i], p = g.player;
  const ox = e.x, oy = e.y + 1.35, oz = e.z;
  let dx = p.x - ox, dy = p.y + 1.1 - oy, dz = p.z - oz;
  const l = Math.hypot(dx, dy, dz);
  dx /= l; dy /= l; dz /= l;
  g.shoot(1, i, 0, ox, oy, oz, dx, dy, dz, damage, weapon, pellet);
}
const of = <T extends GameEvent["type"]>(ev: GameEvent[], t: T) => ev.filter(e => e.type === t) as Ev<T>[];

test("guard: holding the button raises it (no cut); a round from the front glances off, the meter pays; from behind it hurts", () => {
  const { g, ev, step } = mk([[0, 0, -10], [0, 0, 10]]);
  step();
  step(1, { melee: true, guard: true });
  step(40, { guard: true });
  const p = g.player;
  assert.equal(p.guard, true);
  assert.equal(of(ev, "melee").length, 0, "no cut while it is held");
  assert.deepEqual(of(ev, "guard").map(e => e.what), ["up"]);
  const before = p.guardMeter;
  fire(g, 0);
  for (const e of g.drain()) ev.push(e);
  assert.equal(p.health, 100, "the front round: no damage");
  const d = of(ev, "deflect");
  assert.equal(d.length, 1);
  assert.equal(d[0].returned, false, "outside bullet time it glances off");
  assert.equal(d[0].perfect, false);
  assert.ok(Math.abs(p.guardMeter - (before - GUARD.deflect)) < 1e-9, `the meter paid ${before - p.guardMeter}`);
  assert.equal(of(ev, "blood").length, 0);
  // it met the blade in front of him, not his body
  assert.ok(d[0].z < p.z - 0.2, `caught at z ${d[0].z.toFixed(2)}`);
  fire(g, 1);
  for (const e of g.drain()) ev.push(e);
  assert.equal(p.health, 91, "from behind: the round lands");
  // slower on his feet, and no shooting while it is up
  step(60, { guard: true, moveY: 1, fire: true });
  assert.ok(Math.abs(p.speed - 5 * GUARD.move) < 0.05, `guard speed ${p.speed.toFixed(2)}`);
  assert.equal(of(ev, "shot").filter(e => e.shooter === -1).length, 0, "no shot while guarding");
});

test("guard: a tap cuts on the release; a hold past the tap does not; a press between two steps cuts at once", () => {
  const a = mk([]);
  a.step();
  a.step(1, { melee: true, guard: true });
  a.step(10, { guard: true });
  assert.equal(of(a.ev, "melee").length, 0);
  a.step(1, { guard: false });
  const cut = of(a.ev, "melee").filter(e => e.phase === "start");
  assert.equal(cut.length, 1, "the tap's cut");
  assert.equal(cut[0].kind, "katana");
  assert.ok(a.g.player.meleeT > 0 && !a.g.player.guard);
  const b = mk([]);
  b.step();
  b.step(1, { melee: true, guard: true });
  b.step(Math.ceil(GUARD.tap / DT) + 5, { guard: true });
  b.step(1, { guard: false });
  assert.equal(of(b.ev, "melee").length, 0, "a hold is no cut");
  assert.deepEqual(of(b.ev, "guard").map(e => e.what), ["up", "down"]);
  const c = mk([]);
  c.step();
  c.step(1, { melee: true, guard: false });
  assert.equal(of(c.ev, "melee").filter(e => e.phase === "start").length, 1, "a press that came and went between steps: the cut now");
  // everyone else: the held button is nothing, the press is the strike
  const d = mk([], { katana: false });
  d.step();
  d.step(1, { melee: true, guard: true });
  d.step(40, { guard: true });
  assert.equal(d.g.player.guard, false);
  assert.deepEqual(of(d.ev, "melee").filter(e => e.phase === "start").map(e => e.kind), ["strike"]);
});

test("guard: a perfect parry (inside 0.2 s of the raise) costs nothing; raised again too soon it does", () => {
  const { g, ev, step } = mk([[0, 0, -10]]);
  step(60);
  step(1, { melee: true, guard: true });
  step(5, { guard: true });
  const m0 = g.player.guardMeter;
  fire(g, 0);
  for (const e of g.drain()) ev.push(e);
  assert.equal(of(ev, "deflect")[0].perfect, true);
  assert.equal(g.player.guardMeter, m0, "a parry is free");
  // held past the tap, down and straight back up: no parry this time
  step(Math.ceil(GUARD.tap / DT), { guard: true });
  step(1, { guard: false });
  step(Math.ceil(GUARD.tap / DT) + 2, { guard: false });
  step(1, { melee: true, guard: true });
  step(2, { guard: true });
  assert.ok(g.player.guard && !g.player.parryOk);
  const m1 = g.player.guardMeter;
  fire(g, 0);
  for (const e of g.drain()) ev.push(e);
  assert.equal(of(ev, "deflect")[1].perfect, false);
  assert.ok(Math.abs(g.player.guardMeter - (m1 - GUARD.deflect)) < 1e-9);
});

test("guard meter: drains while held, refills once down; empty it breaks (down for 1 s, locked until 25) and rounds land again", () => {
  const { g, ev, step } = mk([[0, 0, -10]]);
  step();
  step(1, { melee: true, guard: true });
  step(119, { guard: true });
  const p = g.player;
  assert.ok(Math.abs(p.guardMeter - (GUARD.max - GUARD.hold * 120 * DT)) < 0.1, `held 1 s: ${p.guardMeter.toFixed(2)}`);
  let n = 0;
  while (p.guard && n < 30) { fire(g, 0); n++; }
  for (const e of g.drain()) ev.push(e);
  assert.ok(of(ev, "guard").some(e => e.what === "break"), "it broke");
  assert.equal(p.guard, false);
  assert.equal(p.health, 100, "the round that broke it was still stopped");
  assert.ok(p.guardLock && p.guardBroken > 0);
  step(30, { guard: true });
  assert.equal(p.guard, false, "no guard while broken, the button held or not");
  fire(g, 0);
  for (const e of g.drain()) ev.push(e);
  assert.equal(p.health, 91, "unguarded: it lands");
  // back once the meter reaches minRaise (the delay, then the refill)
  const need = GUARD.refillDelay + GUARD.minRaise / GUARD.refill;
  step(Math.ceil((need + 0.1) / DT), { guard: false });
  assert.ok(!p.guardLock && p.guardMeter >= GUARD.minRaise);
  step(1, { melee: true, guard: true });
  assert.equal(p.guard, true);
});

test("guard: a shotgun blast is one heavy charge and a shove back; a frag is not blocked", () => {
  const { g, ev, step } = mk([{ at: [0, 0, -5], kind: "heavy" }]);
  step();
  step(1, { melee: true, guard: true });
  step(40, { guard: true });
  const p = g.player, m0 = p.guardMeter, z0 = p.z;
  for (let k = 0; k < 8; k++) fire(g, 0, "shotgun", 3.5, k);
  for (const e of g.drain()) ev.push(e);
  const d = of(ev, "deflect");
  assert.ok(d.length >= 6, `pellets stopped: ${d.length}`);
  assert.equal(d.filter(e => e.first).length, 1, "one clang for the blast");
  assert.ok(Math.abs(p.guardMeter - (m0 - GUARD.blast)) < 1e-9, `the blast paid ${m0 - p.guardMeter}`);
  assert.equal(p.health, 100);
  step(40, { guard: true });
  assert.ok(p.z - z0 > 0.4, `pushed back ${(p.z - z0).toFixed(2)} m`);
  // a frag at his feet: the guard does nothing for it
  const gr: Grenade = { id: 9, x: 0, y: 0, z: p.z - 1, vx: 0, vy: 0, vz: 0, fuse: 0, landed: true, resting: true, bounces: 0 };
  (g as unknown as { explode(gr: Grenade): void }).explode(gr);
  assert.ok(p.health < 100, "the blast hurts him through the guard");
});

test("bullet time: the deflected round goes back and kills the shooter, or the one under the crosshair; RETURN TO SENDER", () => {
  const run = (aimAtSecond: boolean) => {
    const { g, inp, ev, step } = mk([[0, 0, -10], [4, 0, -12]]);
    step(1, { bt: true });
    step(20, { bt: false });
    if (aimAtSecond) {
      // the crosshair onto the second one's torso
      for (let k = 0; k < 3; k++) {
        const p = g.player, t = torso(g, 1);
        const q = { x: p.x + Math.cos(inp.yaw) * SHOULDER.right, y: p.y + p.pivotUp, z: p.z - Math.sin(inp.yaw) * SHOULDER.right };
        const ex = t.x - q.x, ey = t.y - q.y, ez = t.z - q.z;
        inp.yaw = Math.atan2(-ex, -ez);
        inp.pitch = Math.asin(ey / Math.hypot(ex, ey, ez));
        step();
      }
      assert.equal(g.aimEnemy, 1);
    }
    step(1, { melee: true, guard: true });
    step(40, { guard: true });
    assert.ok(g.bulletTime && g.timeScale < 0.999);
    fire(g, 0);
    for (let i = 0; i < 400 && !of(ev, "kill").length; i++) step(1, { guard: true });
    return { g, ev };
  };
  const a = run(false);
  const d = of(a.ev, "deflect");
  assert.equal(d.length, 1);
  assert.ok(d[0].returned && d[0].target === 0, "back at the shooter");
  const k = of(a.ev, "kill");
  assert.equal(k.length, 1);
  assert.equal(k[0].weapon, "returned");
  assert.equal(k[0].target, 0);
  assert.ok(k[0].shot && Math.abs(k[0].shot.oz - d[0].z) < 1e-9, "the kill's line starts at the blade");
  assert.equal(a.g.player.health, 100);
  assert.equal(a.g.stats.kills, 1);
  const b = run(true);
  const kb = of(b.ev, "kill");
  assert.equal(of(b.ev, "deflect")[0].target, 1, "at the one under the crosshair");
  assert.equal(kb[0]?.target, 1);
  assert.equal(b.g.enemies[0].state === "dead", false, "the shooter still stands");
  // the kill cam: a special shot, tagged RETURN TO SENDER
  const kill = { enemy: 0, weapon: "returned", headshot: false, part: 1, from: { x: 0, y: 1.2, z: -0.5 }, to: { x: 0, y: 1.1, z: -10 }, final: false, at: 100 };
  assert.equal(pickCine([kill], [], "special", 999)?.kind, "return");
  const c = new CineCtl();
  c.kill(kill);
  assert.equal(c.decide(100, "special", false)?.tag, "RETURN TO SENDER");
  const fin = new CineCtl();
  fin.kill({ ...kill, final: true });
  const cam = fin.decide(100, "special", false);
  assert.equal(cam?.kind, "final");
  assert.equal(cam?.tag, "RETURN TO SENDER");
  assert.equal(pickCine([kill], [], "final", 999), null, "Final only: no special cam");
});

test("the gang: a goon in front holds fire for a beat once the guard is up (past a tap); the arc is 120 deg", () => {
  const { g, step } = mk([[0, 0, -10], [8, 0, -1]]);
  step();
  assert.ok(g.inGuardArc(0, -10) && !g.inGuardArc(8, -1) && g.inGuardArc(5, -4) && !g.inGuardArc(0, 10));
  step(1, { melee: true, guard: true });
  assert.equal(g.guardHolds(g.enemies[0]), false, "a tap's guard is no reason to wait");
  step(Math.ceil(GUARD.tap / DT), { guard: true });
  assert.equal(g.guardHolds(g.enemies[0]), true);
  assert.equal(g.guardHolds(g.enemies[1]), false, "out of the arc: no doubt");
  step(Math.ceil(GUARD.hesitate / DT) + 2, { guard: true });
  assert.equal(g.guardHolds(g.enemies[0]), false, "a beat, not forever");
});

test("input: F held is the guard level in the frame, the press still an edge; release drops it", () => {
  const l = new InputLatch();
  l.press("KeyF");
  let f = l.consume();
  assert.equal(f.melee, true);
  assert.equal(f.guard, true);
  f = l.consume();
  assert.equal(f.melee, false);
  assert.equal(f.guard, true, "held");
  l.release("KeyF");
  f = l.consume();
  assert.equal(f.guard, false);
  // a tap between two steps: the edge without the level (the sim cuts at once)
  l.press("KeyF");
  l.release("KeyF");
  f = l.consume();
  assert.equal(f.melee, true);
  assert.equal(f.guard, false);
});

test("determinism: guard, deflects and returns replay bit-exactly (a script, and the blade bot through room 1)", () => {
  const script = () => {
    const { g, inp, ev, step } = mk([[0, 0, -10], [3, 0, -14], { at: [-2, 0, -8], kind: "rusher" }], { ai: true });
    const hs: string[] = [];
    for (let i = 0; i < 1500; i++) {
      const f: Partial<InputFrame> = { bt: i === 30 || i === 900, guard: i > 60 && i < 700 && i % 200 < 150, melee: i === 61 || i === 261 || i === 461, moveX: Math.sin(i / 70) * 0.5 };
      if (i === 750) f.fire = true;
      step(1, f);
      inp.fire = false;
      if (i % 50 === 0) fire(g, 0);
      hs.push(g.hash());
    }
    return { hs, seen: new Set(ev.map(e => e.type)), ev };
  };
  const a = script(), b = script();
  assert.deepEqual(a.hs, b.hs);
  assert.ok(a.seen.has("guard") && a.seen.has("deflect"), [...a.seen].join(","));
  assert.ok(of(a.ev, "deflect").some(e => e.returned), "a round went back in the script's bullet time");
  const botRun = (seed = 1) => {
    const g = new Game(room1(), { seed, katana: true });
    const bot = new Bot();
    bot.blade = true;
    const hs: string[] = [];
    const ev: GameEvent[] = [];
    for (let i = 0; i < 120 * 120 && g.phase !== "done" && g.phase !== "dead"; i++) {
      g.step(bot.next(g));
      if (i % 60 === 0) hs.push(g.hash());
      ev.push(...g.drain());
    }
    return { g, hs, ev };
  };
  const r = botRun(), r2 = botRun();
  assert.deepEqual(r.hs, r2.hs);
  assert.notEqual(r.g.phase, "dead", "the blade bot survives room 1");
  // (seed by seed the gang may never fire into its bullet time: one of the first four does)
  const runs = [r, botRun(2), botRun(3), botRun(4)];
  assert.ok(runs.some(x => x.g.phase !== "dead" && of(x.ev, "deflect").some(e => e.returned)), "it sent a round back");
  assert.ok(runs.some(x => of(x.ev, "kill").some(e => e.weapon === "returned")), "and killed with one");
});

test("the gang: against the guard a rusher circles out of its arc (faster, for the nearer edge) and a heavy walks in close", () => {
  const rush = (guard: boolean) => {
    const { g, step } = mk([{ at: [0, 0, -6.5], kind: "rusher" }], { ai: true });
    const e = g.enemies[0];
    alertGoon(g, e, 0);
    for (let i = 0; i < 600 && e.state !== "engage"; i++) step(1);
    assert.equal(e.state, "engage");
    step(1, { melee: guard, guard });
    step(Math.ceil(GUARD.tap / DT), { guard });
    let speed = 0, out = 0;
    const n = 360;
    for (let i = 0; i < n; i++) {
      step(1, { guard });
      speed = Math.max(speed, Math.hypot(e.vx, e.vz));
      if (!g.inGuardArc(e.x, e.z)) out++;
    }
    return { speed, out: out / n };
  };
  const plain = rush(false), guarded = rush(true);
  assert.ok(guarded.speed > plain.speed * 1.3, `circles faster: ${guarded.speed.toFixed(2)} vs ${plain.speed.toFixed(2)}`);
  assert.ok(guarded.out > plain.out + 0.2, `more of her time out of the arc: ${guarded.out.toFixed(2)} vs ${plain.out.toFixed(2)}`);
  const heavy = (guard: boolean) => {
    const { g, step } = mk([{ at: [0, 0, -6], kind: "heavy" }], { ai: true });
    const e = g.enemies[0];
    alertGoon(g, e, 0);
    step(1, { melee: guard, guard });
    let near = 99;
    for (let i = 0; i < 120 * 6; i++) {
      step(1, { guard });
      near = Math.min(near, Math.hypot(e.x - g.player.x, e.z - g.player.z));
      if (guard && g.player.guardMeter < 40) break;
    }
    return near;
  };
  const far = heavy(false), close = heavy(true);
  assert.ok(far > 4.2, `without the guard he holds at ~4.5 m (${far.toFixed(2)})`);
  assert.ok(close < far - 0.6, `against the guard he walks in (${close.toFixed(2)} vs ${far.toFixed(2)}; his blasts shove the guard back)`);
});
