// Round 2's shared systems: the shotgun and the dual SMGs, pickups and the weapon switch, the rusher
// and the heavy, the rave crowd, and the fallback spawn trigger.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SHOULDER } from "../src/sim/aim.ts";
import { Game } from "../src/sim/game.ts";
import { Bot } from "../src/sim/bot.ts";
import { DT, ENEMY, HEAVY, RUSHER, TIME } from "../src/sim/tuning.ts";
import { SLOT_ORDER, SWAP_TIME, WEAPONS, makeWeapon, stepWeapon, triggerWeapon } from "../src/combat/weapons.ts";
import { HB_TORSO, aimPoint, makeCapsules } from "../src/combat/hitboxes.ts";
import { emptyInput, type GameEvent, type InputFrame } from "../src/sim/types.ts";
import { boxNode, level, markerNode } from "./helpers.ts";

const PI = Math.PI;

/** Aim the input at a point from the player's shoulder pivot (as the crosshair would). */
function aimAt(g: Game, inp: InputFrame, x: number, y: number, z: number): void {
  for (let k = 0; k < 3; k++) {
    const p = g.player;
    const q = { x: p.x + Math.cos(inp.yaw) * SHOULDER.right, y: p.y + p.pivotUp, z: p.z - Math.sin(inp.yaw) * SHOULDER.right };
    const ex = x - q.x, ey = y - q.y, ez = z - q.z, el = Math.hypot(ex, ey, ez);
    inp.yaw = Math.atan2(-ex, -ez);
    inp.pitch = Math.asin(ey / el);
    g.step(inp);
  }
}

const range = () => level([
  markerNode("spawn", "spawn", [0, 0, 0], {}, PI),
  markerNode("g", "enemy", [0, 0, -6], { milady: 7 }, 0),
  boxNode("far", [0, 2, -40], [20, 4, 1]),
]);

test("shotgun: 8 pellets per pull inside the 6 deg cone, semi-auto 0.8 s, 6 shells, 2 s reload", () => {
  const g = new Game(range(), { ai: false, seed: 4, loadout: ["shotgun"] });
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  inp.slot = 2;
  g.step(inp);
  inp.slot = 0;
  assert.equal(g.player.weapon.id, "shotgun");
  for (let i = 0; i < Math.ceil(SWAP_TIME / (DT * TIME.playerInBulletTime)) + 2; i++) g.step(inp);
  g.drain();
  inp.fire = true;
  g.step(inp);
  const shots = g.drain().filter((e): e is Extract<GameEvent, { type: "shot" }> => e.type === "shot");
  assert.equal(shots.length, 8);
  assert.deepEqual(shots.map(s => s.pellet), [0, 1, 2, 3, 4, 5, 6, 7]);
  // inside the cone around the mean direction (gaussian, cut at ~3 sigma)
  const dirs = shots.map(s => { const l = Math.hypot(s.ex - s.ox, s.ey - s.oy, s.ez - s.oz); return [(s.ex - s.ox) / l, (s.ey - s.oy) / l, (s.ez - s.oz) / l]; });
  const m = [0, 1, 2].map(k => dirs.reduce((a, d) => a + d[k], 0) / dirs.length);
  const ml = Math.hypot(...m);
  for (const d of dirs) assert.ok(Math.acos(Math.min(1, (d[0] * m[0] + d[1] * m[1] + d[2] * m[2]) / ml)) < WEAPONS.shotgun.spread * 2, "pellet in the cone");
  assert.ok(new Set(dirs.map(d => d.join())).size === 8, "pellets spread");
  // holding the trigger does not fire again (semi-auto); a new press after 0.8 s does
  for (let i = 0; i < 150; i++) g.step(inp);
  assert.equal(g.drain().filter(e => e.type === "shot").length, 0);
  inp.fire = false; g.step(inp); inp.fire = true; g.step(inp);
  assert.equal(g.drain().filter(e => e.type === "shot").length, 8);
  // magazine + reserve
  const w = makeWeapon("shotgun");
  assert.deepEqual([w.mags[0], w.reserve], [6, 24]);
  let fired = 0;
  for (let i = 0; i < 2000 && fired < 6; i++) { stepWeapon(w, DT); if (triggerWeapon(w, i % 2 === 0) >= 0) fired++; }
  assert.equal(fired, 6);
  let t = 0;
  while (w.reloadT > 0) { stepWeapon(w, DT); t += DT; }
  assert.ok(Math.abs(t - 2) < DT * 2, `reload ${t}`);
  assert.deepEqual([w.mags[0], w.reserve], [6, 18]);
});

test("shotgun: the same seed spreads the same; a projectile blast in bullet time does what the hitscan does", () => {
  const blast = (bt: boolean, seed: number) => {
    const g = new Game(range(), { ai: false, seed, loadout: ["shotgun"] });
    const inp = emptyInput();
    inp.yaw = g.player.yaw;
    inp.slot = 2; g.step(inp); inp.slot = 0;
    for (let i = 0; i < 200; i++) g.step(inp);
    const t = { x: 0, y: 0, z: 0 };
    aimPoint("milady", g.enemies[0].hit.pose, HB_TORSO, t, makeCapsules());
    if (bt) { inp.bt = true; g.step(inp); inp.bt = false; }
    aimAt(g, inp, t.x, t.y, t.z);
    g.drain();
    inp.fire = true;
    g.step(inp);
    inp.fire = false;
    const flew = g.projectiles.length;
    for (let i = 0; i < 600 && g.projectiles.length; i++) g.step(inp);
    const hurt = g.drain().filter(e => e.type === "hurt").length;
    return { flew, hp: g.enemies[0].hp, hurt };
  };
  const a = blast(false, 9), b = blast(true, 9), c = blast(false, 9);
  assert.equal(a.flew, 0);
  assert.equal(b.flew, 8);
  assert.deepEqual(a, c);
  assert.deepEqual({ hp: b.hp, hurt: b.hurt }, { hp: a.hp, hurt: a.hurt });
  assert.ok(a.hurt >= 5, `most pellets hit at 6 m (${a.hurt})`);
});

test("dual SMGs: 0.06 s between shots, alternating hands, 2 x 30", () => {
  const w = makeWeapon("smgs");
  const shots: Array<{ step: number; hand: number }> = [];
  for (let i = 0; i < 120; i++) { stepWeapon(w, DT); const h = triggerWeapon(w, true); if (h >= 0) shots.push({ step: i, hand: h }); }
  assert.equal(shots.length, 17); // 0 .. 0.96 s
  for (let k = 1; k < shots.length; k++) {
    assert.notEqual(shots[k].hand, shots[k - 1].hand);
    assert.ok(Math.abs((shots[k].step - shots[k - 1].step) * DT - 0.06) <= DT + 1e-9);
  }
  assert.equal(w.mags[0] + w.mags[1], 60 - 17);
});

test("pickups: the weapon the first time, then ammo; slots and the wheel switch; the clock resets", () => {
  const lv = level([
    markerNode("spawn", "spawn", [0, 0, 0], {}, PI),
    markerNode("sg", "pickup", [0, 0, -2], { item: "shotgun" }),
    markerNode("sg2", "pickup", [0, 0, -4], { item: "shotgun" }),
    markerNode("ammo", "pickup", [0, 0, -5], { item: "smgs_ammo" }),
    markerNode("smg", "pickup", [0, 0, -9], { item: "smgs" }),
    markerNode("ammo2", "pickup", [0, 0, -12], { item: "smgs_ammo" }),
  ]);
  const g = new Game(lv, { ai: false, seed: 1 });
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  inp.moveY = 1;
  const picked: string[] = [];
  for (let i = 0; i < 120 * 4; i++) { g.step(inp); for (const e of g.drain()) if (e.type === "pickup") picked.push(`${e.item}:${e.amount}`); }
  // the smgs_ammo before the SMGs stays on the floor (no gun for it yet)
  assert.deepEqual(picked, ["shotgun:24", "shotgun_ammo:6", "smgs:180", "smgs_ammo:30"]);
  const p = g.player;
  assert.deepEqual(p.owned, ["pistols", "shotgun", "smgs"]);
  assert.equal(p.arsenal.shotgun!.reserve, 30);
  assert.equal(p.arsenal.smgs!.reserve, 210);
  assert.equal(p.weapon.id, "pistols", "no auto-switch");
  assert.equal(g.pickups.find(k => k.id === "ammo")!.taken, false);
  inp.moveY = 0;
  // slot 3, then the wheel back (8 = previous) to the shotgun, then next (9) to the SMGs
  const swaps: string[] = [];
  for (const slot of [3, 8, 9, 1]) {
    inp.slot = slot; g.step(inp); inp.slot = 0;
    for (const e of g.drain()) if (e.type === "swap") swaps.push(e.weapon);
  }
  assert.deepEqual(swaps, ["smgs", "shotgun", "smgs", "pistols"]);
  // ammo survives the switches; a switch cancels a reload and delays the next shot
  p.arsenal.smgs!.mags = [3, 30];
  inp.slot = 3; g.step(inp); inp.slot = 0;
  assert.deepEqual(p.weapon.mags, [3, 30]);
  inp.reload = true; g.step(inp); inp.reload = false;
  assert.ok(p.weapon.reloadT > 0);
  inp.slot = 1; g.step(inp); inp.slot = 0;
  assert.equal(p.arsenal.smgs!.reloadT, 0, "reload dropped");
  assert.ok(p.weapon.cooldown > SWAP_TIME * 0.9, "the new gun comes up first");
  inp.fire = true;
  let firstShot = -1;
  for (let i = 0; i < 120 && firstShot < 0; i++) { g.step(inp); if (g.drain().some(e => e.type === "shot")) firstShot = i; }
  assert.ok(firstShot * DT >= SWAP_TIME - 0.05, `fired ${firstShot * DT} s after the switch`);
  assert.equal(SLOT_ORDER.join(), "pistols,shotgun,smgs");
});

// a rusher 30 m out down a long room, the player at the origin
const hall = (kind: string, extra: ReturnType<typeof markerNode>[] = []) => level([
  markerNode("spawn", "spawn", [0, 0, 0], {}, PI),
  markerNode("e", "enemy", [0, 0, -30], { kind, milady: 5 }, 0),
  markerNode("wake", "trigger", [0, 1, 0], { action: "alert" }, 0, [4, 3, 4]),
  ...[0, -8, -16, -24, -32].map((z, i) => markerNode(`wp-${i}`, "waypoint", [0, 0, z])),
  ...extra,
]);

test("rusher: alert -> charges to 5-9 m -> strafes (flipping every 1.2 s) and fires bursts", () => {
  const g = new Game(hall("rusher"), { seed: 21 });
  const e = g.enemies[0];
  assert.equal(e.kind, "rusher");
  assert.equal(e.hp, ENEMY.rusher.hp);
  assert.ok(e.engageAt >= RUSHER.engage[0] && e.engageAt <= RUSHER.engage[1]);
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  g.player.health = 1e9; // keep him standing
  const seen: string[] = [];
  let engageDist = -1, maxSpeed = 0, flips = 0, lastStrafe = 0, shots = 0;
  for (let i = 0; i < 120 * 12; i++) {
    g.step(inp);
    if (seen[seen.length - 1] !== e.state) seen.push(e.state);
    if (e.state === "rush") maxSpeed = Math.max(maxSpeed, Math.hypot(e.vx, e.vz));
    if (e.state === "engage") {
      if (engageDist < 0) engageDist = Math.hypot(e.x - g.player.x, e.z - g.player.z);
      if (lastStrafe && e.strafe !== lastStrafe) flips++;
      lastStrafe = e.strafe;
    }
    shots += g.drain().filter(ev => ev.type === "shot" && ev.shooter === 0).length;
  }
  assert.deepEqual(seen.slice(0, 3), ["alert", "rush", "engage"]); // the trigger at his feet wakes her on the first step
  assert.ok(Math.abs(maxSpeed - ENEMY.rusher.run) < 0.05, `charges at run speed (${maxSpeed})`);
  assert.ok(engageDist <= e.engageAt + 0.2 && engageDist > 3, `stops at ${engageDist} (wants ${e.engageAt})`);
  assert.ok(flips >= 3, `strafe flips ${flips}`);
  assert.ok(shots >= 12, `bursts fired (${shots} shots)`);
});

test("rusher: takes cover once when hurt below 25 HP, then charges again", () => {
  const lv = hall("rusher", [boxNode("crate", [3, 0.5, -12], [2, 1, 0.6]), markerNode("cover", "cover", [3, 0, -12.8], { height: "low" }, 0)]);
  const g = new Game(lv, { seed: 3 });
  const e = g.enemies[0];
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  g.player.health = 1e9;
  const seen: string[] = [];
  for (let i = 0; i < 120 * 20; i++) {
    g.step(inp);
    if (e.state === "rush" && e.hp > RUSHER.coverBelow && Math.hypot(e.x, e.z + 20) < 6) e.hp = RUSHER.coverBelow - 1; // hurt her on the way in
    if (seen[seen.length - 1] !== e.state) seen.push(e.state);
  }
  const s = seen.join(" > ");
  assert.ok(s.includes("move > cover > peek > rush"), s);
  assert.equal(seen.filter(x => x === "cover").length, 1, `cover only once: ${s}`);
  assert.ok(e.coverUsed);
});

test("heavy: advances slowly, a 0.35 s laser tell before every blast, 8 pellets; a 40+ hit staggers and cancels it", () => {
  const g = new Game(hall("heavy"), { seed: 8 });
  const e = g.enemies[0];
  assert.equal(e.kind, "heavy");
  assert.equal(e.hp, 140);
  assert.equal(e.drop, "shotgun");
  assert.ok(Math.abs((e.hit.pose.scale ?? 1) - 1.12) < 1e-9);
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  g.player.health = 1e9;
  let tellStart = -1, maxSpeed = 0, blasts = 0, tells = 0;
  const tellLens: number[] = [];
  let cover = false;
  for (let i = 0; i < 120 * 24; i++) {
    const before = e.tell;
    g.step(inp);
    if (e.state === "cover" || e.state === "peek") cover = true;
    maxSpeed = Math.max(maxSpeed, Math.hypot(e.vx, e.vz));
    if (before <= 0 && e.tell > 0) { tellStart = g.time; tells++; }
    const ev = g.drain();
    const pellets = ev.filter(x => x.type === "shot" && x.shooter === 0);
    if (pellets.length) {
      blasts++;
      assert.equal(pellets.length, 8);
      tellLens.push(g.time - tellStart);
      assert.ok(Math.hypot(e.x - g.player.x, e.z - g.player.z) <= HEAVY.range + 0.5, "fires within 12 m");
    }
  }
  assert.ok(!cover, "never takes cover");
  assert.ok(maxSpeed <= ENEMY.heavy.walk + 1e-6 && maxSpeed > 1.2, `walks at ${maxSpeed}`);
  assert.ok(blasts >= 3 && tells >= blasts, `${blasts} blasts`);
  for (const t of tellLens) assert.ok(Math.abs(t - HEAVY.tell) < 0.02, `tell ${t}`);

  // stagger: a 40-damage hit during the tell cancels the shot
  const g2 = new Game(hall("heavy"), { seed: 8 });
  const h = g2.enemies[0];
  g2.player.health = 1e9;
  let staggered = false, firedDuring = false;
  for (let i = 0; i < 120 * 16 && !staggered; i++) {
    g2.step(inp);
    g2.drain();
    if (h.tell > 0 && h.tell < HEAVY.tell * 0.6) {
      // hit him: a pistol headshot is 102
      const t = { x: 0, y: 0, z: 0 };
      aimPoint("radbro", h.hit.pose, 0, t, makeCapsules());
      const p = g2.player;
      const ox = p.x, oy = p.y + 1.3, oz = p.z;
      const d = Math.hypot(t.x - ox, t.y - oy, t.z - oz);
      g2.shoot(0, -1, 0, ox, oy, oz, (t.x - ox) / d, (t.y - oy) / d, (t.z - oz) / d, 20, "pistols", 0); // a 20 headshot = 60
      staggered = h.stagger > 0 && g2.drain().some(ev => ev.type === "stagger");
      assert.equal(h.tell, 0, "the tell is cancelled");
      for (let k = 0; k < Math.round(HEAVY.stagger / DT) - 2; k++) { g2.step(inp); if (g2.drain().some(ev => ev.type === "shot" && ev.shooter === 0)) firedDuring = true; }
    }
  }
  assert.ok(staggered, "staggered");
  assert.ok(!firedDuring, "the shot in the tell was cancelled");
});

test("heavy: dies into a shotgun pickup at the body", () => {
  const g = new Game(hall("heavy"), { seed: 2, ai: false });
  const e = g.enemies[0];
  const p = g.player;
  e.hp = 1;
  const t = { x: 0, y: 0, z: 0 };
  aimPoint("radbro", e.hit.pose, 1, t, makeCapsules());
  const ox = p.x, oy = p.y + 1.3, oz = p.z, d = Math.hypot(t.x - ox, t.y - oy, t.z - oz);
  g.shoot(0, -1, 0, ox, oy, oz, (t.x - ox) / d, (t.y - oy) / d, (t.z - oz) / d, 34, "pistols", 0);
  assert.equal(e.state, "dead");
  const drop = g.pickups.find(k => k.id === `drop-${e.id}`);
  assert.ok(drop && drop.item === "shotgun" && !drop.taken);
  assert.ok(g.drain().some(ev => ev.type === "drop"));
});

// the crowd: a dance floor between the player and the gang, two exits
const club = () => level([
  markerNode("spawn", "spawn", [0, 0, 0], {}, PI),
  markerNode("g", "enemy", [0, 0, -24], { milady: 3 }, 0),
  markerNode("dancers", "crowd", [0, 0, -12], { count: 14, clips: ["Dance_1", "Dance_2"] }, 0, [10, 1, 8]),
  markerNode("bouncer", "crowd", [9, 0, -20], { count: 1, milady: 42, role: "bouncer", flee: "exit-staff", clips: ["Drink_Idle"] }, 0),
  markerNode("exit-front", "crowdExit", [-12, 0, -12]),
  markerNode("exit-staff", "crowdExit", [12, 0, -22]),
  ...[[-12, -12], [-6, -12], [0, -12], [6, -12], [12, -12], [12, -22], [6, -20], [0, -6], [0, -18]].map(([x, z], i) => markerNode(`wp-${i}`, "waypoint", [x, 0, z])),
]);

test("crowd: dances until the first shot, then scatters to the exits (the bouncer to the staff door) and is gone", () => {
  const g = new Game(club(), { seed: 12 });
  const c = g.crowd;
  assert.equal(c.people.length, 15);
  const b = c.people.find(p => p.role === "bouncer")!;
  assert.equal(b.milady, 42);
  // not in the trace, not hittable: the actors are the player + the gang only
  assert.equal(g.actors.length, 1 + g.enemies.length);
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  g.player.health = 1e9;
  for (let i = 0; i < 240; i++) g.step(inp);
  assert.ok(c.people.every(p => p.state === "dance"), "still dancing");
  // the first shot (his), aimed over the dance floor
  inp.pitch = 0.3;
  inp.fire = true;
  g.step(inp);
  inp.fire = false;
  assert.ok(c.scattered && g.firstShotAt >= 0);
  assert.ok(g.drain().some(e => e.type === "firstShot"));
  let fleeing = 0, maxSpeed = 0;
  for (let i = 0; i < 120 * 14; i++) {
    g.step(inp);
    for (const p of c.people) { if (p.state === "flee") fleeing++; maxSpeed = Math.max(maxSpeed, p.speed); }
  }
  assert.ok(fleeing > 0);
  assert.ok(maxSpeed <= 3.0 + 1e-6 && maxSpeed > 2.5, `flee speed ${maxSpeed}`);
  assert.equal(b.exit, "exit-staff");
  const left = c.people.filter(p => p.state !== "gone" && p.state !== "cower");
  assert.equal(left.length, 0, `still on the floor: ${left.map(p => `${p.state}@${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(" ")}`);
  assert.ok(c.people.filter(p => p.state === "gone").length >= 14);
});

test("crowd: never enters a trace, never shifts the fight (same hash with and without dancers)", () => {
  const withCrowd = club();
  const noCrowd = { ...withCrowd, markers: withCrowd.markers.filter(m => m.kind !== "crowd") };
  const play = (lv: typeof withCrowd) => {
    const g = new Game(lv, { seed: 5 });
    const bot = new Bot();
    const hashes: string[] = [];
    let crowdHit = false;
    for (let i = 0; i < 120 * 20 && g.phase === "play"; i++) {
      g.step(bot.next(g));
      for (const e of g.drain()) if ((e.type === "blood" || e.type === "hurt") && e.target >= g.enemies.length) crowdHit = true;
      hashes.push(g.hash());
    }
    return { hashes, crowdHit, g };
  };
  const a = play(withCrowd), b = play(noCrowd);
  assert.ok(a.g.crowd.people.length > 0 && b.g.crowd.people.length === 0);
  assert.equal(a.crowdHit, false);
  assert.deepEqual(a.hashes, b.hashes);
  assert.ok(a.g.stats.shots > 0);
});

test("spawn fallback: {afterKills: N} brings the backup once N hostiles are down", () => {
  const lv = level([
    markerNode("spawn", "spawn", [0, 0, 0], {}, PI),
    markerNode("a", "enemy", [2, 0, -10], { milady: 1 }, 0),
    markerNode("b", "enemy", [-2, 0, -10], { milady: 2 }, 0),
    markerNode("r", "enemy", [0, 0, -30], { kind: "rusher", group: "backup", milady: 3 }, 0),
    markerNode("t-centre", "trigger", [0, 1, -60], { action: "spawn", group: "backup" }, 0, [4, 3, 1]),
    markerNode("t-fallback", "trigger", [0, 1, -200], { action: "spawn", group: "backup", afterKills: 2 }, 0, [0.1, 0.1, 0.1]),
  ]);
  const g = new Game(lv, { seed: 1, ai: false });
  const r = g.enemies[2];
  assert.equal(r.state, "inactive");
  g.enemies[0].hp = 0; g.enemies[0].state = "dead";
  const inp = emptyInput();
  g.step(inp);
  assert.equal(r.state, "inactive", "one down: not yet");
  g.enemies[1].hp = 0; g.enemies[1].state = "dead";
  g.step(inp);
  assert.notEqual(r.state, "inactive");
  assert.ok(g.drain().some(e => e.type === "trigger" && e.id === "t-fallback"));
});
