// Round 3's rooms: room 4's ride (the stops and their doors, the door beat, the roof heavy, the cables,
// the car waiting for him, a checkpoint per stop) and room 5's boss (the phases and their adds, the coat,
// the grenades, the chandelier, the last stand, her fall), the bot clearing both, and bit-exact replays.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/sim/game.ts";
import { Bot } from "../src/sim/bot.ts";
import { DT, MADAME, METER, RIDE } from "../src/sim/tuning.ts";
import { HB_HEAD, HB_TORSO } from "../src/combat/hitboxes.ts";
import { emptyInput, type GameEvent, type InputFrame } from "../src/sim/types.ts";
import { room4, room5 } from "./helpers.ts";

type RideEv = Extract<GameEvent, { type: "ride" }>;
type BossEv = Extract<GameEvent, { type: "boss" }>;

function runBot(g: Game, maxS: number, bot = new Bot(), rec?: InputFrame[]): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < maxS / DT && g.phase !== "done" && g.phase !== "dead"; i++) {
    const f = bot.next(g);
    rec?.push({ ...f });
    g.step(f);
    out.push(...g.drain());
  }
  return out;
}
function idle(g: Game, s: number, out: GameEvent[] = [], inp: InputFrame = emptyInput()): GameEvent[] {
  inp.yaw = g.player.yaw;
  for (let i = 0; i < s / DT; i++) { g.step(inp); out.push(...g.drain()); }
  return out;
}
const ride = (ev: GameEvent[]) => ev.filter((e): e is RideEv => e.type === "ride").map(e => e.what + (e.stop ? `:${e.stop}` : ""));
const boss = (ev: GameEvent[]): string[] => ev.filter((e): e is BossEv => e.type === "boss").map(e => e.what);

test("elevator: the ride runs its stops in order (doors, the roof heavy, the cables) and the bot clears it (normal, seeds 1-3)", () => {
  for (const seed of [1, 2, 3]) {
    const g = new Game(room4(), { seed, difficulty: "normal" });
    assert.equal(g.enemies.length, 25);
    assert.ok(g.enemies.every(e => e.state === "inactive"), "every group waits for its stop (or the roof)");
    assert.ok(g.world.off.size === 0, "all three doors shut");
    const ev = runBot(g, 480);
    assert.equal(g.phase, "done", `seed ${seed}: ${g.phase}, ${g.alive} alive, ride ${g.ride!.i}/${g.ride!.phase}, hp ${g.player.health}`);
    assert.deepEqual(ride(ev).filter(w => w !== "back"), [
      "start", "arrive:S1", "open:S1", "close:S1", "depart", "roof", "hatch", "land",
      "arrive:S2", "open:S2", "close:S2", "depart", "cables", "drop", "brake", "arrive:S3", "open:S3",
    ]);
    assert.equal(g.stats.kills, 25, `seed ${seed}: every one of them`);
    // the last stop stays open (the stairwell is the way out); the others closed again
    assert.deepEqual([...g.world.off].sort(), ["door-s"]);
    assert.equal(g.music, "elevatorDead", "the muzak died with the cables");
  }
});

test("elevator: the first doors open on the door beat (0.3 for 1 s real, no meter); a stop waits for him in the car", () => {
  const g = new Game(room4(), { seed: 2 });
  const ev = idle(g, 12 + RIDE.arrive + RIDE.open * RIDE.gap + 0.03);
  assert.deepEqual(ride(ev), ["start", "arrive:S1", "open:S1"]);
  assert.ok(g.world.off.has("door-e"), "the east doors are open enough to shoot through");
  const m = g.meter;
  assert.ok(Math.abs(g.timeScale - RIDE.doorSlow) < 1e-6, `slow at once (${g.timeScale})`);
  idle(g, 0.9);
  assert.ok(g.timeScale < 0.31, `still slow after 0.9 s real (${g.timeScale})`);
  idle(g, 0.6);
  assert.ok(g.timeScale > 0.9, `back to speed (${g.timeScale})`);
  assert.equal(g.meter, m, "no meter cost");
  // the landing's gang is out: kill them where they stand (and the two from the back), him outside the car
  for (const e of g.enemies.filter(k => k.group === "L1" || k.group === "L1b")) g.damageEnemy(e, 999, HB_TORSO, 1, 0, null);
  g.player.x = 8; g.player.z = 2.2;
  const ev2 = idle(g, RIDE.backHint + 0.5);
  assert.equal(g.ride!.phase, "open", "the car waits");
  assert.deepEqual(ride(ev2), ["back"], "and tells him once");
  g.player.x = 0; g.player.z = 0;
  const ev3 = idle(g, RIDE.close + 0.1);
  assert.deepEqual(ride(ev3), ["close:S1", "depart"]);
  assert.ok(!g.world.off.has("door-e"), "shut again");
});

test("elevator: the roof heavy's tell is 2 s, then he drops through the hatch into the car and cannot fire until he has landed", () => {
  const g = new Game(room4(), { seed: 3 });
  idle(g, 12 + RIDE.arrive + 0.1);
  for (const e of g.enemies.filter(k => k.group === "L1" || k.group === "L1b")) g.damageEnemy(e, 999, HB_TORSO, 1, 0, null);
  const inp = emptyInput();
  for (let i = 0; i < 10 / DT && g.ride!.i < 2; i++) { g.step(inp); g.drain(); }
  assert.equal(g.ride!.i, 2, "on the way up again");
  const ev = idle(g, 5 + 0.05);
  assert.deepEqual(ride(ev), ["roof"]);
  const heavy = g.enemies.find(e => e.group === "roof")!;
  assert.equal(heavy.state, "inactive", "nothing yet: the tell");
  const ev2 = idle(g, RIDE.hatchTell);
  assert.deepEqual(ride(ev2), ["hatch"]);
  assert.ok(heavy.y > 2, "at the hatch");
  const shots = heavy.shots;
  const ev3 = idle(g, 0.6);
  assert.deepEqual(ride(ev3), ["land"]);
  assert.equal(heavy.y, 0, "on the car's floor");
  assert.ok(g.ride!.inCar(heavy.x, heavy.z, 0), "in the car");
  assert.equal(heavy.shots, shots, "no shot in the fall or the landing crouch");
  // the leg waits for him
  idle(g, 30);
  assert.equal(g.ride!.i, 2, "still riding while he stands");
});

test("elevator: each stop is a checkpoint; a retry arrives at that stop again with its dead down and the next gang waiting", () => {
  const g = new Game(room4(), { seed: 4 });
  const ev = runBot(g, 400, new Bot());
  void ev;
  // replay to the second stop only
  const h = new Game(room4(), { seed: 4 });
  const bot = new Bot();
  for (let i = 0; i < 400 / DT && !(h.ride!.i === 3 && h.ride!.phase === "opening"); i++) { h.step(bot.next(h)); h.drain(); }
  assert.equal(h.ride!.i, 3);
  const saved = h.saved!;
  assert.equal(saved.ride, 3, "the ride's step rides in the checkpoint");
  assert.ok(saved.dead.includes("roof-heavy") && saved.dead.filter(d => d.startsWith("l1-") || d.startsWith("l1b-")).length === 6);
  const r = new Game(room4(), { seed: 4, resume: saved });
  assert.equal(r.ride!.i, 3);
  assert.equal(r.ride!.phase, "arrive");
  assert.ok(r.enemies.filter(e => e.group === "L2").every(e => e.state === "inactive"), "S2's gang waits behind the doors");
  const ev2 = idle(r, RIDE.arrive + 0.05);
  assert.deepEqual(ride(ev2), ["open:S2"]);
  assert.ok(r.enemies.filter(e => e.group === "L2").every(e => e.state !== "inactive"), "and comes in with them");
  assert.ok(r.enemies.filter(e => e.group === "L1" || e.group === "L1b").every(e => e.state === "dead"));
});

test("boss: the phases at 66 / 33 / 10 %, the add doors' tell, the coat, the last stand's free slow motion, her fall", () => {
  const g = new Game(room5(), { seed: 5, difficulty: "normal" });
  const b = g.boss!;
  const her = g.enemies[b.idx];
  assert.equal(her.kind, "madame");
  assert.equal(her.milady, MADAME.pockit);
  assert.equal(her.hp, MADAME.hp.normal);
  assert.equal(her.hit.pose.scale, MADAME.scale);
  assert.equal(g.enemies.filter(e => e.group === "doorA").length, 8);
  assert.equal(g.enemies.filter(e => e.group === "doorB").length, 7);
  assert.equal(g.enemies.filter(e => e.group === "guards").length, 4, "her guards in the hall from the start");
  // step into the hall: she wakes and says her piece (no damage while she does)
  g.player.x = -14.5;
  const ev = idle(g, 0.5);
  assert.deepEqual(boss(ev), ["intro"]);
  g.damageEnemy(her, 50 * b.damageMul(HB_TORSO), HB_TORSO, 1, 0, null);
  assert.equal(her.hp, MADAME.hp.normal, "the intro protects her");
  idle(g, MADAME.introHold);
  assert.equal(b.damageMul(HB_TORSO), MADAME.coat, "the coat takes a share");
  assert.equal(b.damageMul(HB_HEAD), MADAME.head, "she keeps her head down: x2, not x3");
  g.player.x = -18.6; // out of her sight: the phase rules, not the fight
  g.damageEnemy(her, her.maxHp * 0.35, HB_TORSO, 1, 0, null);
  const ev2 = idle(g, 0.1);
  assert.deepEqual(boss(ev2).filter(w => w !== "reload"), ["phase2", "lamp"]);
  assert.ok(g.world.off.size === 0, "door A still shut: the lamp is the tell");
  idle(g, MADAME.doors.lamp - 0.2);
  assert.equal(g.enemies.filter(e => e.group === "doorA" && e.state !== "inactive").length, 0);
  const ev3 = idle(g, 0.3);
  assert.ok(boss(ev3).includes("door") && g.world.off.has("door-a"));
  assert.equal(g.enemies.filter(e => e.group === "doorA" && e.state !== "inactive").length, MADAME.doors.first);
  // phase 3: the coat comes off; she cannot be hurt while she throws it
  g.damageEnemy(her, her.hp - her.maxHp * 0.32, HB_TORSO, 1, 0, null);
  const ev4 = idle(g, 0.05);
  assert.ok(boss(ev4).includes("phase3"));
  assert.equal(b.coat, false);
  const hp = her.hp;
  g.damageEnemy(her, 100 * b.damageMul(HB_HEAD), HB_HEAD, 1, 0, null);
  assert.equal(her.hp, hp, "the coat throw");
  idle(g, MADAME.coatThrow);
  assert.equal(b.damageMul(HB_TORSO), 1, "no coat, no share");
  // the last stand: the world slows by itself (no meter), she runs for the bag
  const meter = g.meter;
  g.damageEnemy(her, her.hp - her.maxHp * 0.08, HB_TORSO, 1, 0, null);
  const ev5 = idle(g, 0.05);
  assert.ok(boss(ev5).includes("lastStand"));
  assert.ok(Math.abs(g.timeScale - MADAME.lastStandSlow) < 1e-6, `slow (${g.timeScale})`);
  assert.equal(b.lastStand, 1);
  idle(g, 1.8);
  assert.ok(g.timeScale < 0.26, "still slow after 1.8 s real");
  assert.ok(g.meter >= meter - 1e-9, "no meter");
  // down: the adds still standing run for their doors and do not count; the room is clear
  const adds = g.enemies.filter(e => e.kind !== "madame" && e.state !== "inactive" && e.state !== "dead");
  assert.ok(adds.length > 0);
  g.damageEnemy(her, 999, HB_TORSO, 1, 0, { ox: -10, oy: 1.5, oz: 0, x: her.x, y: her.y + 1.2, z: her.z });
  const ev6 = idle(g, 0.05);
  assert.ok(boss(ev6).includes("down"));
  assert.equal(g.alive, 0);
  assert.ok(adds.every(e => e.state === "flee" && e.fled && !e.hit.hittable));
  assert.ok(g.enemies.filter(e => e.group === "doorB").every(e => e.fled), "door B's adds never come");
  idle(g, 8);
  assert.ok(adds.every(e => e.state === "inactive"), "gone through their doors");
  assert.equal(g.phase, "done", "no exit: the room ends after the clear");
});

test("boss: the grenade in her hand goes off on her; one in the air pops; one that lands hurts him inside its ring only", () => {
  const g = new Game(room5(), { seed: 7 });
  const b = g.boss!;
  const her = g.enemies[b.idx];
  idle(g, 0.1);
  b.phase = 2;
  b.introT = 0;
  // the wind-up: a shot at the grenade over her head
  b.wind = { t: 0.5, n: 1 };
  const h = b.handPoint(her);
  const o = { x: h.x - 12, y: h.y - 0.6, z: h.z };
  const l = Math.hypot(h.x - o.x, h.y - o.y, h.z - o.z);
  const hp = her.hp;
  g.shoot(0, -1, 0, o.x, o.y, o.z, (h.x - o.x) / l, (h.y - o.y) / l, (h.z - o.z) / l, 34);
  const ev = g.drain();
  assert.ok(ev.some(e => e.type === "grenade" && e.what === "blast" && e.hand), "it went off in her hand");
  assert.equal(her.hp, hp - MADAME.grenade.hand);
  assert.ok(her.stagger >= MADAME.grenade.stagger - 1e-9 && b.wind === null);
  // a grenade in the air: shot, it pops (no blast)
  her.stagger = 0;
  b.throwAt(g, her, 0, 6);
  idle(g, 0.3);
  const gr = b.grenades[0];
  const l2 = Math.hypot(gr.x - o.x, gr.y - o.y, gr.z - o.z);
  g.shoot(0, -1, 0, o.x, o.y, o.z, (gr.x - o.x) / l2, (gr.y - o.y) / l2, (gr.z - o.z) / l2, 34);
  const ev2 = g.drain();
  assert.ok(ev2.some(e => e.type === "grenade" && e.what === "pop"));
  assert.equal(b.grenades.length, 0);
  // one that lands next to him: the blast, inside the ring only
  g.player.x = 1; g.player.z = 6.5;
  b.throwAt(g, her, 0, 6);
  const before = g.player.health;
  const fuse = b.grenades[0].fuse;
  assert.ok(Math.abs(fuse - (b.grenades[0].flight + MADAME.grenade.fuse)) < 1e-9, "it goes off a moment after it lands");
  const ev3 = idle(g, fuse + 0.05);
  assert.ok(ev3.some(e => e.type === "grenade" && e.what === "blast"));
  assert.ok(g.player.health < before - 20, `hurt (${before} -> ${g.player.health})`);
  g.player.x = 1; g.player.z = 6.5 + MADAME.grenade.radius + 1.2;
  b.throwAt(g, her, 0, 6);
  const h2 = g.player.health;
  idle(g, b.grenades[0].fuse + 0.05);
  assert.equal(g.player.health, h2, "outside the ring");
});

test("boss: two hits on the chandelier's chain drop it; on her it does its damage and knocks her down, once", () => {
  const g = new Game(room5(), { seed: 8 });
  const b = g.boss!;
  const her = g.enemies[b.idx];
  idle(g, 0.1);
  b.introT = 0;
  her.x = 0.5; her.z = 0.3; her.y = 0;
  const [cx, cy, cz] = b.chainAt;
  const o = { x: -10, y: 1.6, z: 0.2 };
  const shoot = () => { const l = Math.hypot(cx - o.x, cy - o.y, cz - o.z); g.shoot(0, -1, 0, o.x, o.y, o.z, (cx - o.x) / l, (cy - o.y) / l, (cz - o.z) / l, 34); return g.drain(); };
  assert.ok(boss(shoot()).includes("chain"));
  assert.equal(b.chandelier, "up");
  assert.ok(boss(shoot()).includes("chandelier"));
  const hp = her.hp;
  her.x = 0.5; her.z = 0.3;
  const ev = idle(g, MADAME.chandelier.fall + 0.05);
  assert.ok(boss(ev).includes("crash"));
  assert.equal(b.chandelier, "down");
  assert.ok(Math.abs(her.hp - (hp - MADAME.chandelier.damage)) < 1e-9, `${hp} -> ${her.hp}`);
  assert.ok(her.stagger > 1.5, "knocked down");
  assert.equal(b.intercept(o.x, o.y, o.z, 1, 0, 0, 100), null, "nothing left to shoot up there");
});

test("boss: the bot beats Madame Pockit (normal, seeds 1-3; hard, seed 1)", () => {
  for (const [seed, difficulty] of [[1, "normal"], [2, "normal"], [3, "normal"], [1, "hard"]] as const) {
    const g = new Game(room5(), { seed, difficulty });
    const ev = runBot(g, 300);
    assert.equal(g.phase, "done", `seed ${seed} ${difficulty}: ${g.phase}, boss hp ${g.enemies[g.boss!.idx].hp}, hp ${g.player.health}`);
    const seq = boss(ev);
    for (const w of ["intro", "phase2", "phase3", "lastStand", "down"]) assert.ok(seq.includes(w), `seed ${seed}: ${w}`);
    assert.ok(seq.indexOf("phase2") < seq.indexOf("phase3") && seq.indexOf("phase3") < seq.indexOf("lastStand"));
  }
});

test("replay: rooms 4 and 5 replay bit-exactly (the ride, the boss, her grenades)", () => {
  for (const [lv, seed, s] of [[room4, 6, 200], [room5, 9, 120]] as const) {
    const g = new Game(lv(), { seed, difficulty: "hard" });
    const rec: InputFrame[] = [];
    const hashes: string[] = [];
    const bot = new Bot();
    for (let i = 0; i < s / DT && g.phase !== "done" && g.phase !== "dead"; i++) { const f = bot.next(g); rec.push({ ...f }); g.step(f); g.drain(); if (i % 60 === 0) hashes.push(g.hash()); }
    const r = new Game(lv(), { seed, difficulty: "hard" });
    for (let i = 0; i < rec.length; i++) { r.step(rec[i]); r.drain(); if (i % 60 === 0 && r.hash() !== hashes[i / 60]) assert.fail(`${lv.name} diverged at step ${i}`); }
    assert.equal(r.hash(), g.hash());
  }
  void METER;
});

test("kill cam: the planned swing never has a post, a column or a pillar at the lens (rooms 4 and 5)", async () => {
  const { World } = await import("../src/sim/world.ts");
  const { KC, planKillcam, spoil, steamOf } = await import("../src/app/killcam.ts");
  for (const [name, lv] of [["room4", room4()], ["room5", room5()]] as const) {
    const cam = new World(lv.camBoxes.map((b, i) => ({ ...b, id: i })));
    const view = new World(lv.viewBoxes.map((b, i) => ({ ...b, id: i })));
    const steam = steamOf(lv);
    // (the first three seeds whose demo run ends on a kill cam: the demo bot may lose to her)
    let found = 0;
    for (let seed = 1; seed <= 6 && found < 3; seed++) {
      const g = new Game(lv, { seed });
      const bot = new Bot(3.5, 0.3, true);
      for (let i = 0; i < 480 / DT && !g.killcam && g.phase === "play"; i++) { g.step(bot.next(g)); g.drain(); }
      const k = g.killcam;
      if (!k && g.phase === "dead") continue;
      assert.ok(k, `${name} seed ${seed}: a kill cam`);
      found++;
      const e = g.enemies[k.enemy];
      if (name === "room5") assert.equal(e.kind, "madame", "the last kill in the penthouse is hers");
      const pl = planKillcam(k, e, cam, lv, view);
      const hl = Math.hypot(k.to.x - k.from.x, k.to.z - k.from.z) || 1;
      const hx = (k.to.x - k.from.x) / hl, hz = (k.to.z - k.from.z) / hl;
      for (const t of [0, 0.25, 0.5]) {
        const a = pl.a0 + pl.dir * t;
        const ex = pl.kx + (-hx * Math.cos(a) + hz * Math.sin(a)) * KC.radius, ez = pl.kz + (-hz * Math.cos(a) - hx * Math.sin(a)) * KC.radius;
        assert.equal(spoil(ex, e.y + KC.eyeY, ez, pl.kx, e.y + KC.atY, pl.kz, view, steam, []), 0, `${name} seed ${seed}: swing at ${t} rad`);
      }
    }
    assert.equal(found, 3, `${name}: three kill cams in seeds 1-6`);
  }
});

// Round 3 playtest fixes: she comes to him and her signature moves reach him; standing still at the
// lift loses; the fight lasts; the hand pop does not restart the wind-up at once; the last stand always
// comes; a lob into a low ceiling lands short; the car's camera boxes
test("boss: standing still at the lift loses (her grenades and sweeps reach him), and the full fight lasts", () => {
  for (const seed of [1, 2, 3]) {
    const g = new Game(room5(), { seed, difficulty: "normal" });
    const bot = new Bot();
    let thrown = 0, sweeps = 0;
    for (let i = 0; i < 400 / DT && g.phase !== "done" && g.phase !== "dead"; i++) {
      const f = bot.next(g);
      f.moveX = 0; f.moveY = 0; f.dodge = false; f.jump = false;
      g.step(f);
      for (const e of g.drain()) {
        if (e.type === "grenade" && e.what === "throw") thrown++;
        if (e.type === "boss" && e.what === "sweep") sweeps++;
      }
    }
    assert.equal(g.phase, "dead", `seed ${seed}: a turret at the lift beat her (her hp ${g.enemies[g.boss!.idx].hp})`);
    assert.ok(thrown >= 2 && sweeps >= 1, `seed ${seed}: her moves reached him (${thrown} grenades, ${sweeps} sweeps)`);
  }
  for (const seed of [1, 2, 3]) {
    const g = new Game(room5(), { seed, difficulty: "normal" });
    const ev = runBot(g, 400);
    assert.equal(g.phase, "done");
    const at = (w: string) => { const i = ev.findIndex(e => e.type === "boss" && e.what === w); return i; };
    const seq = boss(ev);
    assert.ok(at("intro") >= 0 && at("down") > at("lastStand"));
    assert.ok(g.realTime > 55, `seed ${seed}: a real fight (${g.realTime.toFixed(1)} s real)`);
    assert.ok(g.stats.damageTaken > 10, `seed ${seed}: she hurt him (${g.stats.damageTaken})`);
    assert.ok(seq.filter(w => w === "windup").length >= 3, `seed ${seed}: wind-ups ${seq.filter(w => w === "windup").length}`);
  }
});

test("boss: a popped wind-up waits its turn; a finishing hit before her last stand leaves her on 1; a lob into a low ceiling lands short", () => {
  const g = new Game(room5(), { seed: 11 });
  const b = g.boss!;
  const her = g.enemies[b.idx];
  idle(g, 0.1);
  b.phase = 2;
  b.introT = 0;
  b.wind = { t: 0.5, n: 1 };
  b.grenadeNext = 0;
  const h = b.handPoint(her);
  const o = { x: h.x - 12, y: h.y - 0.6, z: h.z };
  const l = Math.hypot(h.x - o.x, h.y - o.y, h.z - o.z);
  g.shoot(0, -1, 0, o.x, o.y, o.z, (h.x - o.x) / l, (h.y - o.y) / l, (h.z - o.z) / l, 34);
  g.drain();
  assert.ok(b.grenadeNext >= MADAME.grenade.every2, `the next wind-up on the clock (${b.grenadeNext})`);
  // a lob at the door vestibule (a 3.2 m ceiling) lands in the hall
  b.throwAt(g, her, 0, -13);
  assert.ok(b.grenades[b.grenades.length - 1].tz > -11, `landed short (${b.grenades[b.grenades.length - 1].tz})`);
  // phase 3, far from the last stand: a huge hit leaves her on 1 and the last stand comes
  b.phase = 3;
  b.coat = false;
  her.stagger = 0;
  g.damageEnemy(her, 99999, HB_TORSO, 1, 0, null);
  assert.equal(her.hp, 1);
  const ev = idle(g, 0.05);
  assert.ok(boss(ev).includes("lastStand"));
});

test("elevator camera: the gates fold before the doors leave the world; the folded stacks are camera boxes", async () => {
  const { gateFold, gateStacks } = await import("../src/app/rideGate.ts");
  const ease = (k: number) => k * k * (3 - 2 * k);
  assert.equal(gateFold(ease(RIDE.gap)), 1, "folded when the doors go");
  assert.ok(gateFold(ease(RIDE.gap * 0.5)) < 1);
  const lv = room4();
  const st = gateStacks(lv);
  assert.equal(st.length, 6, "two stacks at each of the three openings");
  for (const b of st) assert.ok(Math.abs(b.cx) <= 3.0 && Math.abs(b.cz) <= 3.0, `${b.node} inside the car (${b.cx}, ${b.cz})`);
});

test("boss: his frags go through her rules too (the coat throw, never her kill before the last stand)", () => {
  const g = new Game(room5(), { seed: 4, grenades: 2 });
  const b = g.boss!;
  const her = g.enemies[b.idx];
  idle(g, 0.1);
  b.introT = 0;
  const priv = g as unknown as { explode(gr: { id: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; fuse: number; landed: boolean; resting: boolean; bounces: number }): void };
  const frag = () => priv.explode({ id: 99, x: her.x + 0.3, y: her.y, z: her.z, vx: 0, vy: 0, vz: 0, fuse: 0, landed: true, resting: true, bounces: 0 });
  her.hp = 5;
  frag();
  assert.equal(her.hp, 1, "a frag leaves her on 1 before her last stand");
  assert.notEqual(her.state, "dead");
  b.coatT = 1;
  frag();
  assert.equal(her.hp, 1, "nothing while she throws the coat off");
  // her own heart grenades are hers: his frags never land in her list, hers never in his
  assert.equal(b.grenades.length, 0);
  assert.equal((g as unknown as { grenadesLive: unknown[] }).grenadesLive.length, 0);
});
