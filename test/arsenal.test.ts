// The arsenal (arsenal spec sections 2, 3, 7): the new guns, slots and pickups, drops at the bodies,
// pierce, the scope, grenades and melee, and a replay with all of it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SHOULDER } from "../src/sim/aim.ts";
import { Game, type Grenade } from "../src/sim/game.ts";
import { muzzleOf } from "../src/sim/player.ts";
import { DT, ENEMY, GRENADE, HEAVY, MELEE } from "../src/sim/tuning.ts";
import { PICKUPS, WEAPONS, isLongGun, isOneHand, makeWeapon, slotOf, stepWeapon, triggerWeapon, type WeaponId } from "../src/combat/weapons.ts";
import { HB_TORSO, aimPoint, makeCapsules } from "../src/combat/hitboxes.ts";
import { emptyInput, type GameEvent, type InputFrame } from "../src/sim/types.ts";
import { boxNode, level, markerNode } from "./helpers.ts";

const PI = Math.PI;
const DEG = PI / 180;

function aimAt(g: Game, inp: InputFrame, x: number, y: number, z: number, steps = 3): void {
  for (let k = 0; k < steps; k++) {
    const p = g.player;
    const q = { x: p.x + Math.cos(inp.yaw) * SHOULDER.right, y: p.y + p.pivotUp, z: p.z - Math.sin(inp.yaw) * SHOULDER.right };
    const ex = x - q.x, ey = y - q.y, ez = z - q.z, el = Math.hypot(ex, ey, ez);
    inp.yaw = Math.atan2(-ex, -ez);
    inp.pitch = Math.asin(ey / el);
    g.step(inp);
  }
}
const torso = (g: Game, i: number) => { const e = g.enemies[i], o = { x: 0, y: 0, z: 0 }; aimPoint(e.hit.body, e.hit.pose, HB_TORSO, o, makeCapsules()); return o; };
const events = (g: Game, out: GameEvent[]) => { for (const e of g.drain()) out.push(e); };
const spawn = markerNode("spawn", "spawn", [0, 0, 0], {}, PI);

test("the table: magazines, intervals, reloads, cones, pierce; long and one-handed guns", () => {
  const W = WEAPONS;
  assert.deepEqual([W.sawedoff.mag, W.sawedoff.pellets, W.sawedoff.interval, W.sawedoff.reload], [2, 10, 0.22, 1.5]);
  assert.ok(Math.abs(W.sawedoff.spread - 8 * DEG) < 1e-9);
  assert.deepEqual([W.handcannon.mag, W.handcannon.damage, W.handcannon.interval, W.handcannon.reload, W.handcannon.pierce], [7, 95, 0.42, 1.6, 1]);
  assert.deepEqual([W.rifle.mag, W.rifle.damage, W.rifle.interval, W.rifle.reload, W.rifle.reserve, W.rifle.reserveMax], [30, 30, 0.1, 2.2, 60, 180]);
  assert.deepEqual([W.sniper.mag, W.sniper.damage, W.sniper.interval, W.sniper.reload, W.sniper.pierce, W.sniper.zoomSpread], [5, 160, 1.1, 2.4, 2, 0]);
  assert.equal(W.ak.reserve, Infinity);
  assert.equal(makeWeapon("rifle").reserve, 60);
  assert.equal(makeWeapon("rifle", true).reserve, Infinity, "a base gun never runs dry");
  assert.deepEqual((["shotgun", "ak", "rifle", "sniper", "sawedoff", "handcannon", "pistols"] as WeaponId[]).map(isLongGun), [true, true, true, true, false, false, false]);
  assert.ok(isOneHand("sawedoff") && isOneHand("handcannon") && !isOneHand("shotgun"));
  // the sawed-off: both barrels 0.22 s apart, then a 1.5 s reload by itself
  const w = makeWeapon("sawedoff");
  assert.equal(triggerWeapon(w, true), 0);
  let t = 0;
  for (; t < 1; ) { stepWeapon(w, DT); t += DT; triggerWeapon(w, false); if (triggerWeapon(w, true) >= 0) break; }
  assert.ok(Math.abs(t - 0.22) <= DT + 1e-9, `second barrel at ${t}`);
  assert.equal(w.mags[0], 0);
  assert.ok(Math.abs(w.reloadT - 1.5) < 1e-9);
});

test("keys are categories: 2 and 3 keep their meaning, a second press cycles shotgun <-> sawed-off, rifle <-> sniper", () => {
  const g = new Game(level([spawn]), { ai: false, seed: 1, loadout: ["shotgun", "sawedoff", "smgs", "handcannon", "rifle", "sniper"] });
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  const seq: string[] = [];
  for (const slot of [1, 2, 2, 2, 3, 4, 5, 5, 2, 1, 5]) {
    inp.slot = slot; g.step(inp); inp.slot = 0;
    seq.push(g.player.weapon.id);
  }
  assert.deepEqual(seq, ["pistols", "shotgun", "sawedoff", "shotgun", "smgs", "handcannon", "rifle", "sniper", "shotgun", "pistols", "sniper"]);
  assert.deepEqual(["pistols", "shotgun", "sawedoff", "smgs", "handcannon", "rifle", "sniper"].map(w => slotOf(w as WeaponId)), [1, 2, 2, 3, 4, 5, 5]);
});

test("drops: every hostile drops its gun; 9 mm banked for the SMGs; the rusher's SMGs; a perch drop lands below", () => {
  const lv = level([
    spawn,
    markerNode("g1", "enemy", [0, 0, -3], { milady: 3 }),
    markerNode("r1", "enemy", [0, 0, -5], { kind: "rusher", milady: 4 }),
    markerNode("r2", "enemy", [2, 0, -5], { kind: "rusher", milady: 5 }),
    markerNode("h1", "enemy", [0, 0, -7], { kind: "heavy" }),
    markerNode("s1", "enemy", [6, 3.2, -6], { milady: 6, perch: true, weapon: "sniper" }),
    markerNode("c1", "enemy", [-4, 0, -7], { kind: "heavy", weapon: "handcannon" }),
    markerNode("n1", "enemy", [-6, 0, -7], { milady: 8, drop: false }),
    boxNode("perch", [6, 3.1, -6], [2, 0.2, 1.4]),
  ]);
  const g = new Game(lv, { ai: false, seed: 2 });
  assert.deepEqual(g.enemies.map(e => e.drop), ["pistol", "smg", "smg", "shotgun", "sniper", "handcannon", ""]);
  assert.equal(g.enemies[4].weapon, "sniper");
  assert.equal(g.enemies[5].weapon, "handcannon");
  // kill them all where they stand (a lot of damage straight into the sim)
  const ev: GameEvent[] = [];
  for (const e of g.enemies.slice(0, 6)) {
    e.hp = 1;
    const t = torso(g, e.idx);
    g.shoot(0, -1, 0, t.x, t.y + 0.5, t.z + 2, 0, -0.2425, -0.9701, 500, "pistols");
  }
  assert.deepEqual(g.enemies.map(e => e.state === "dead"), [true, true, true, true, true, true, false], "the last one stays up (the room stays in play)");
  events(g, ev);
  const drops = ev.filter(e => e.type === "drop") as Extract<GameEvent, { type: "drop" }>[];
  const sn = drops.find(d => d.item === "sniper")!;
  assert.ok(sn && Math.abs(sn.y) < 0.05, `the sniper's rifle lands on the ground below the perch (y ${sn?.y})`);
  assert.ok(Math.hypot(sn.x - 6, sn.z + 6) > 1.2, "pushed out from the perch");
  // the pistol first: 15 rounds banked (no SMGs yet)
  const p = g.player;
  const take = (item: string) => { const k = g.pickups.find(x => x.item === item && !x.taken)!; p.x = k.x; p.z = k.z; p.y = k.y; g.step(emptyInput()); events(g, ev); };
  take("pistol");
  assert.equal(p.banked, 15);
  // the rusher's SMGs: the guns, both mags full, 30 + the banked 15 in reserve; the second: +30
  take("smg");
  assert.equal(p.arsenal.smgs!.reserve, 45);
  assert.equal(p.banked, 0);
  take("smg");
  assert.equal(p.arsenal.smgs!.reserve, 75);
  take("shotgun");
  assert.equal(p.arsenal.shotgun!.reserve, WEAPONS.shotgun.reserve);
  take("handcannon");
  assert.equal(p.arsenal.handcannon!.reserve, 7);
  assert.equal(p.arsenal.handcannon!.mags[0], 7);
});

test("#250 carries his own AK: a rifle stays where it lies", () => {
  const lv = level([spawn, markerNode("rf", "pickup", [0, 0, -1.5], { item: "rifle" }), markerNode("sn", "pickup", [0, 0, -3], { item: "sniper" })]);
  const g = new Game(lv, { ai: false, seed: 1, base: "ak" });
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  inp.moveY = 1;
  for (let i = 0; i < 120; i++) g.step(inp);
  assert.equal(g.pickups[0].taken, false);
  assert.equal(g.pickups[1].taken, true);
  assert.deepEqual(g.player.owned, ["ak", "sniper"]);
  assert.equal(g.canTake("rifle"), false);
});

test("pierce: the hand cannon goes on through the first body at 70 %, hitscan and in bullet time alike", () => {
  const run = (bt: boolean) => {
    const lv = level([spawn, markerNode("a", "enemy", [0.5, 0, -6], { milady: 3 }), markerNode("b", "enemy", [0.5, 0, -9], { milady: 4 }), boxNode("wall", [0, 2, -30], [20, 4, 1])]);
    const g = new Game(lv, { ai: false, seed: 5, loadout: ["handcannon"] });
    for (const e of g.enemies) e.hp = 500; // nobody dies: read the damage
    const inp = emptyInput();
    inp.yaw = g.player.yaw;
    const t = torso(g, 0);
    aimAt(g, inp, t.x, t.y, t.z, 30);
    // the second body straight on along the line from the muzzle through the first
    const m = muzzleOf(g.player, 0, { x: 0, y: 0, z: 0 });
    const b = g.enemies[1];
    const k = 3 / Math.hypot(t.x - m.x, t.z - m.z);
    b.x = t.x + (t.x - m.x) * k; b.z = t.z + (t.z - m.z) * k;
    g.syncEnemyPose(b);
    if (bt) { g.meter = 10; g.setBulletTime(true); for (let i = 0; i < 240; i++) g.step(inp); }
    g.drain();
    inp.fire = true;
    g.step(inp);
    inp.fire = false;
    for (let i = 0; i < 600 && g.projectiles.length; i++) g.step(inp);
    return g.enemies.map(e => Math.round((500 - e.hp) * 1000) / 1000);
  };
  const hs = run(false), pr = run(true);
  assert.ok(hs[0] >= 95 * 0.75 - 1e-6, `first body ${hs[0]}`);
  assert.ok(hs[1] > 0 && Math.abs(hs[1] / hs[0] - 0.7) < 0.35, `second body ${hs[1]} (70 % of the round)`);
  assert.deepEqual(pr, hs, "a bullet-time round does what the hitscan did");
});

test("the sniper: the scope takes the cone to 0 and slows him; a swap drops it until the button is let go", () => {
  const lv = level([spawn, boxNode("wall", [0, 2, -40], [40, 4, 1])]);
  const g = new Game(lv, { ai: false, seed: 3, loadout: ["sniper"] });
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  const hits = (zoom: boolean) => {
    const pts: Array<[number, number]> = [];
    inp.zoom = zoom;
    for (let n = 0; n < 5; n++) {
      g.player.weapon.mags[0] = 5;
      g.player.weapon.cooldown = 0;
      inp.fire = true; g.step(inp); inp.fire = false; g.step(inp);
      for (const e of g.drain()) if (e.type === "impact") pts.push([e.x, e.y]);
    }
    return pts;
  };
  const scoped = hits(true);
  assert.equal(g.player.zoom, true);
  assert.ok(scoped.every(q => Math.hypot(q[0] - scoped[0][0], q[1] - scoped[0][1]) < 1e-6), "scoped: every round in one hole");
  const loose = hits(false);
  assert.equal(g.player.zoom, false);
  assert.ok(loose.some(q => Math.hypot(q[0] - loose[0][0], q[1] - loose[0][1]) > 0.05), "unscoped: 2.5 deg of scatter");
  // the scope slows him
  inp.zoom = true; inp.moveY = 1;
  for (let i = 0; i < 120; i++) g.step(inp);
  const v = Math.hypot(g.player.vx, g.player.vz);
  assert.ok(v < 5 * 0.5 && v > 5 * 0.4, `scoped speed ${v}`);
  inp.moveY = 0;
  inp.slot = 1; g.step(inp); inp.slot = 0;
  inp.slot = 5; g.step(inp); inp.slot = 0;
  for (let i = 0; i < 60; i++) g.step(inp);
  assert.equal(g.player.weapon.id, "sniper");
  assert.equal(g.player.zoom, false, "still held since the swap: no scope");
  inp.zoom = false; g.step(inp); inp.zoom = true; g.step(inp);
  assert.equal(g.player.zoom, true, "pressed again");
});

/** A grenade placed by hand (a fuse about to end) at x, y, z. */
function frag(g: Game, x: number, y: number, z: number, fuse = DT / 2): void {
  const gr: Grenade = { id: 99, x, y, z, vx: 0, vy: 0, vz: 0, fuse, landed: true, resting: true, bounces: 1 };
  g.grenadesLive.push(gr);
}

test("grenades: the loft lands on the aim point, bounces, a 1.6 s fuse on world time", () => {
  const g = new Game(level([spawn]), { ai: false, seed: 1, grenades: 3 });
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  aimAt(g, inp, 0, 0, -10);
  inp.throw = true; g.step(inp); inp.throw = false;
  assert.equal(g.player.grenades, 2);
  const ev: GameEvent[] = [];
  let steps = 0;
  for (; steps < 600 && !ev.some(e => e.type === "explode"); steps++) { g.step(inp); events(g, ev); }
  const first = ev.find(e => e.type === "bounce") as Extract<GameEvent, { type: "bounce" }>;
  assert.ok(first, "it bounces");
  assert.ok(Math.abs(Math.hypot(first.x, first.z) - 10) < 0.8, `lands 10 m out (${Math.hypot(first.x, first.z).toFixed(2)})`);
  assert.ok(Math.abs(steps * DT - GRENADE.fuse) < 0.05, `fuse ${steps * DT}`);
  // in bullet time the fuse runs on world time
  const b = new Game(level([spawn]), { ai: false, seed: 1, grenades: 1 });
  b.meter = 10;
  b.setBulletTime(true);
  for (let i = 0; i < 120; i++) b.step(inp);
  inp.throw = true; b.step(inp); inp.throw = false;
  let n = 0;
  for (; n < 2400 && !b.drain().some(e => e.type === "explode"); n++) { b.step(inp); if (b.meter < 5) b.meter = 10; }
  assert.ok(n * DT > GRENADE.fuse / 0.3 - 0.2, `bullet time stretches the fuse (${(n * DT).toFixed(2)} s)`);
});

test("grenades: blast falloff, walls block it, his own share, a heavy staggers", () => {
  const lv = level([
    spawn,
    markerNode("a", "enemy", [0, 0, -11], { milady: 3 }),
    markerNode("b", "enemy", [0, 0, -13], { milady: 4 }),
    markerNode("c", "enemy", [3.5, 0, -10], { milady: 5 }),
    markerNode("d", "enemy", [-2.2, 0, -10], { milady: 6 }),
    markerNode("h", "enemy", [0, 0, -8.4], { kind: "heavy" }),
    markerNode("far", "enemy", [7, 0, -10], { milady: 7 }),
    boxNode("wall", [-1.2, 1.5, -10], [0.3, 3, 3]),
  ]);
  const g = new Game(lv, { ai: false, seed: 1 });
  for (const e of g.enemies) e.hp = 1000;
  g.player.z = -6.5;
  frag(g, 0, 0.05, -10);
  g.step(emptyInput());
  const dmg = g.enemies.map(e => 1000 - e.hp);
  const [a, b, c, d, h, far] = dmg;
  assert.ok(a > b && b > 0 && c > 0, `falloff: ${dmg.map(v => v.toFixed(1))}`);
  assert.equal(d, 0, "behind the wall: nothing");
  assert.equal(far, 0, "outside the radius: nothing");
  assert.ok(h >= HEAVY.staggerAt && g.enemies[4].stagger > 0, "the heavy staggers");
  const expect = (dist: number) => GRENADE.damage * Math.pow(1 - dist / GRENADE.radius, GRENADE.falloff);
  const ta = torso(g, 0);
  assert.ok(Math.abs(a - expect(Math.hypot(ta.x, ta.y - 0.3, ta.z + 10))) < 1e-6);
  const self = 100 - g.player.health;
  const pd = Math.hypot(0, 1.1 - 0.3, 3.5);
  assert.ok(Math.abs(self - expect(pd) * GRENADE.self) < 1e-6, `his share ${self}`);
});

test("melee: the strike (reach 1.5, 40 deg, 45 + a shove) and #4764's katana (reach 2, 55 deg, 120)", () => {
  const mk = (katana: boolean) => {
    const lv = level([
      spawn,
      markerNode("near", "enemy", [0, 0, -1.3], { milady: 3 }),
      markerNode("mid", "enemy", [0.6, 0, -1.9], { milady: 4 }),
      markerNode("side", "enemy", [-1.3, 0, -0.7], { milady: 5 }),
      markerNode("back", "enemy", [0, 0, 1.2], { milady: 6 }),
      markerNode("far", "enemy", [0, 0, -3.5], { milady: 7 }),
    ]);
    const g = new Game(lv, { ai: false, seed: 1, katana });
    const inp = emptyInput();
    inp.yaw = g.player.yaw;
    g.step(inp);
    const ev: GameEvent[] = [];
    inp.melee = true; g.step(inp); inp.melee = false;
    for (let i = 0; i < 40; i++) { g.step(inp); events(g, ev); }
    return { g, ev, lost: g.enemies.map(e => ENEMY.goon.hp - Math.max(0, e.hp)) };
  };
  const s = mk(false);
  assert.deepEqual(s.lost.map(v => Math.round(v)), [45, 0, 0, 0, 0], "the strike: the one in reach and in the arc");
  assert.ok(s.g.enemies[0].flinch > 0);
  const hit = s.ev.find(e => e.type === "melee" && e.phase === "hit") as Extract<GameEvent, { type: "melee" }>;
  assert.equal(hit.hits, 1);
  assert.equal(hit.kind, "strike");
  assert.ok(s.g.enemies[0].z < -1.3 - 0.3, `shoved back (${s.g.enemies[0].z.toFixed(2)})`);
  const k = mk(true);
  assert.deepEqual(k.lost.map(v => Math.round(v)), [60, 60, 0, 0, 0], "the katana: reach 2 m, the side one out of the arc");
  assert.equal(k.g.enemies[0].state, "dead");
  assert.equal(MELEE.max, 3);
});

test("replay: grenades, melee, pickups and the scope replay bit-exactly", () => {
  const lv = () => level([
    spawn,
    ...[0, 1, 2, 3].map(i => markerNode(`e${i}`, "enemy", [-3 + 2 * i, 0, -12 - i], { milady: 10 + i, ...(i === 3 ? { kind: "heavy" } : {}) })),
    markerNode("wake", "trigger", [0, 1, 0], { action: "alert" }, 0, [4, 3, 4]),
    markerNode("gr", "pickup", [0, 0, -2], { item: "grenade", amount: 2 }),
    markerNode("sn", "pickup", [1, 0, -3], { item: "sniper" }),
    boxNode("cover", [0, 0.5, -8], [3, 1, 0.5]),
  ]);
  const script = (i: number, g: Game, f: InputFrame) => {
    f.moveY = i < 150 ? 0.6 : 0;
    f.yaw = Math.sin(i / 90) * 0.3;
    f.pitch = -0.08;
    f.throw = i === 200 || i === 420;
    f.melee = i === 300;
    f.slot = i === 500 ? 5 : 0;
    f.zoom = i > 520 && i < 700;
    f.fire = i > 540 && i % 90 === 0;
    f.bt = i === 610;
    void g;
  };
  const run = () => {
    const g = new Game(lv(), { seed: 11, katana: true });
    const hs: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 900; i++) { const f = emptyInput(); script(i, g, f); g.step(f); hs.push(g.hash()); for (const e of g.drain()) seen.add(e.type); }
    return { hs, g, seen };
  };
  const a = run(), b = run();
  assert.deepEqual(a.hs, b.hs);
  for (const t of ["pickup", "throw", "bounce", "explode", "melee"]) assert.ok(a.seen.has(t), `the run has a ${t}`);
  void PICKUPS;
});
