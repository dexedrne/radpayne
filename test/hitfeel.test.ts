// Hit feel (src/app/hitfeel.ts): the grouping of the sim's events into hits, the hitmarker's stacking
// and looks, the sound variant picks, the pad / punch / reaction numbers, the burst budget, and the
// Hit feedback setting. Plus a full bot clear of room 1 fed through the grouper: every kill of his is
// one kill hit, and the sim is untouched (the replay test covers its hashes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/sim/game.ts";
import { Bot } from "../src/sim/bot.ts";
import type { GameEvent } from "../src/sim/types.ts";
import {
  FEEL, HitGrouper, PUNCH, burstBudget, burstOf, centsRate, hitRate, markSpec, newStack, parseHitFeel, pickVariant, punchEnv, punchOf,
  reactionOf, rumbleOfHit, springKick, springStep, stackHit, stackLevel, stackRate, weaponWeight, type Hit, type Spring,
} from "../src/app/hitfeel.ts";
import { room1 } from "./helpers.ts";

const shot = (weapon: string, pellet = 0): GameEvent => ({ type: "shot", shooter: -1, hand: 0, ox: 0, oy: 1.4, oz: 0, ex: 0, ey: 1.4, ez: 10, projectile: false, id: 1, weapon, pellet });
const blood = (target: number, part = 1, x = 0, z = 10): GameEvent => ({ type: "blood", x, y: 1.3, z, dx: 0, dy: 0, dz: 1, target, part });
const hurt = (target: number, part = 1, amount = 20, hp = 50): GameEvent => ({ type: "hurt", target, amount, part, hp });
const kill = (target: number, headshot = false, final = false, weapon = "pistols"): GameEvent => ({ type: "kill", target, headshot, final, weapon, shot: { ox: 0, oy: 1.4, oz: 0, x: 0, y: 1.5, z: 10 } });

test("grouping: a shotgun blast's pellets on one girl are one hit, with the gun and the pellet count", () => {
  const g = new HitGrouper();
  for (let i = 0; i < 6; i++) { g.feed(shot("shotgun", i)); g.feed(blood(2)); g.feed(hurt(2, 1, 12)); }
  const hits = g.flush();
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, "body");
  assert.equal(hits[0].weapon, "shotgun");
  assert.equal(hits[0].n, 6);
  assert.equal(hits[0].amount, 72);
  assert.equal(g.flush().length, 0, "flushed");
});

test("grouping: head over body, kill over head; two girls in one frame come out kill last", () => {
  const g = new HitGrouper();
  g.feed(shot("pistols"));
  g.feed(blood(0)); g.feed(hurt(0));
  g.feed(blood(1, 0)); g.feed(hurt(1, 0, 60, 0)); g.feed(kill(1, true));
  g.feed(blood(3, 0)); g.feed(hurt(3, 0, 60, 20));
  const hits = g.flush(2);
  assert.deepEqual(hits.map(h => [h.target, h.kind, h.headshot]), [[0, "body", false], [3, "head", true], [1, "kill", true]]);
  assert.equal(hits[2].waveEnd, false);
});

test("grouping: the wave's last kill, the room's final, a kill that is not his, hits on him", () => {
  const g = new HitGrouper();
  g.feed(blood(4)); g.feed(hurt(4, 1, 99, 0)); g.feed(kill(4, false, true));
  const [h] = g.flush(0);
  assert.equal(h.kind, "kill");
  assert.ok(h.final && h.waveEnd);
  // her adds caught in her own blast (no shot line): no marker of his
  g.feed(hurt(5, 1, 99, 0));
  g.feed({ type: "kill", target: 5, headshot: false, final: false });
  assert.equal(g.flush().length, 0);
  // blood and hurt on the player are not his hits
  g.feed({ type: "blood", x: 0, y: 1, z: 0, dx: 1, dy: 0, dz: 0, target: -1, part: 1 });
  g.feed({ type: "hurt", target: -1, amount: 10, part: 1, hp: 90, shooter: 2 });
  assert.equal(g.flush().length, 0);
});

test("grouping: a bullet-time round keeps its gun; a melee hit and a frag are named", () => {
  const g = new HitGrouper();
  g.feed(shot("sniper"));
  assert.equal(g.flush().length, 0);
  g.feed(blood(1)); g.feed(hurt(1, 1, 90));
  assert.equal(g.flush()[0].weapon, "sniper", "the round landed frames after the shot");
  g.feed(blood(2)); g.feed(hurt(2)); g.feed({ type: "melee", kind: "strike", phase: "hit", hits: 1 });
  assert.equal(g.flush()[0].weapon, "melee");
  g.feed({ type: "explode", id: 1, x: 0, y: 0, z: 0 }); g.feed(hurt(3, 1, 80));
  const [f] = g.flush();
  assert.equal(f.weapon, "grenade");
  assert.equal(f.placed, false, "a frag's hit has no blood point");
});

test("stacking: rapid hits build the marker up to the cap, a pause lets it settle and restarts the count", () => {
  let s = newStack();
  const lv: number[] = [];
  for (let i = 0; i < 8; i++) { s = stackHit(s, 1000 + i * 70, "body"); lv.push(s.level); }
  for (let i = 1; i < 4; i++) assert.ok(lv[i] > lv[i - 1], `builds: ${lv}`);
  assert.ok(lv[7] <= 1 && lv[7] > 0.7, `capped high: ${lv[7]}`);
  assert.equal(s.count, 8);
  assert.ok(stackLevel(s, s.at + 600) < 0.1, "settles");
  s = stackHit(s, s.at + 2000, "body");
  assert.equal(s.count, 1);
  assert.ok(s.level < 0.35);
  // a kill adds more than a body hit; a heavy gun more than an SMG
  assert.ok(stackHit(newStack(), 0, "kill").level > stackHit(newStack(), 0, "body").level);
  assert.ok(stackHit(newStack(), 0, "body", weaponWeight("shotgun")).level > stackHit(newStack(), 0, "body", weaponWeight("smgs")).level);
});

test("marker variants: white body, gold headshot with an accent, a bigger red kill with a ring; the stack grows it", () => {
  const b = markSpec("body", false, 0, 0.5), b1 = markSpec("body", false, 1, 0.5);
  const h = markSpec("head", true, 0, 0.5), k = markSpec("kill", false, 0, 0.5), kh = markSpec("kill", true, 0, 0.5);
  assert.equal(b.color, "#ffffff");
  assert.equal(h.color, "#ffcf3a");
  assert.ok(h.accent && !b.accent);
  assert.equal(k.color, "#ff2840");
  assert.equal(k.core, "#ffffff");
  assert.equal(kh.core, "#ffcf3a");
  assert.ok(k.ring && !h.ring && !b.ring);
  assert.ok(k.scale > h.scale && h.scale > b.scale);
  assert.ok(b1.scale > b.scale && b1.weight > b.weight);
  assert.ok(k.ms > h.ms && h.ms > b.ms && b.ms <= 400, "fades fast");
  // a small random tilt either way
  assert.ok(Math.abs(markSpec("body", false, 0, 0).rot) <= 9 && markSpec("body", false, 0, 0).rot < 0 && markSpec("body", false, 0, 1).rot > 0);
});

test("sound variants: never the same one twice running, every one used; pitch helpers", () => {
  let last = -1;
  const seen = new Set<number>();
  for (let i = 0; i < 400; i++) {
    const v = pickVariant(4, last, (i * 0.618) % 1);
    assert.ok(v >= 0 && v < 4);
    assert.notEqual(v, last);
    seen.add(v);
    last = v;
  }
  assert.equal(seen.size, 4);
  assert.equal(pickVariant(1, 0, 0.7), 0);
  assert.ok(Math.abs(centsRate(1200) - 2) < 1e-9);
  assert.equal(hitRate(1), 1);
  assert.ok(hitRate(0.3) < 1 && hitRate(0.3) > 0.8, "bullet time: a little lower, never as far as the world");
  assert.ok(Math.abs(stackRate(1) - Math.pow(2, 3 / 12)) < 1e-9);
});

const H = (o: Partial<Hit>): Hit => ({ kind: "body", headshot: false, target: 0, weapon: "pistols", x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1, placed: true, n: 1, amount: 20, final: false, waveEnd: false, stagger: false, ...o });

test("camera punch and pad: only kills and headshots punch, the wave's last kill hardest; the pad by kind", () => {
  assert.equal(punchOf(H({})), 0);
  assert.ok(punchOf(H({ kind: "head", headshot: true })) > 0);
  const k = punchOf(H({ kind: "kill" })), kw = punchOf(H({ kind: "kill", waveEnd: true }));
  assert.ok(kw > k && k > punchOf(H({ kind: "head", headshot: true })));
  assert.ok(punchEnv(PUNCH.attack) > 0.99 && punchEnv(0.3) < 0.05 && punchEnv(1) === 0);
  const body = rumbleOfHit(H({}))!, head = rumbleOfHit(H({ kind: "head", headshot: true }))!, kill = rumbleOfHit(H({ kind: "kill" }))!;
  assert.ok(body.strong < 0.1 && body.ms < 50, "light");
  assert.ok(head.weak > body.weak && head.ms < kill.ms, "sharp");
  assert.ok(kill.strong > head.strong && kill.ms >= 100, "firm");
  assert.equal(rumbleOfHit(H({}), 0), null);
  assert.ok(rumbleOfHit(H({ kind: "kill" }), 0.5)!.strong < kill.strong);
});

test("reactions: a flinch on every hit, more for the big guns, a head snap on a headshot; the spring settles", () => {
  const p = reactionOf(H({})), sg = reactionOf(H({ weapon: "shotgun", n: 6 })), hs = reactionOf(H({ kind: "head", headshot: true }));
  assert.ok(p.lean > 0.15 && p.knock === 0);
  assert.ok(sg.lean > p.lean && sg.knock > 0);
  assert.ok(reactionOf(H({ weapon: "sniper" })).knock > 0 && reactionOf(H({ weapon: "handcannon" })).knock > 0 && reactionOf(H({ weapon: "sawedoff" })).knock > 0);
  assert.ok(hs.head > 0.6 && p.head < 0.2);
  const s: Spring = { x: 0, v: 0 };
  springKick(s, 0.3);
  let peak = 0;
  for (let i = 0; i < 120; i++) { springStep(s, 1 / 120); peak = Math.max(peak, s.x); }
  assert.ok(peak > 0.2 && peak < 0.42, `peaks near the kick: ${peak}`);
  for (let i = 0; i < 240; i++) springStep(s, 1 / 60);
  assert.equal(s.x, 0);
});

test("bursts: sized by the gun, the star on the big guns, the ring on kills, counts by the graphics preset", () => {
  const p = burstOf(H({})), sg = burstOf(H({ weapon: "shotgun" })), k = burstOf(H({ kind: "kill" })), kh = burstOf(H({ kind: "kill", headshot: true }));
  assert.ok(sg.size > p.size && sg.ink > p.ink);
  assert.ok(sg.star && !p.star && kh.star && !k.star);
  assert.ok(k.ring && !p.ring);
  const lo = burstBudget("low", true), med = burstBudget("medium", false), hi = burstBudget("high", false), cin = burstBudget("cinematic", false);
  assert.ok(lo.count < med.count && med.count < hi.count && hi.count < cin.count);
  assert.ok(!lo.ring && hi.ring);
  assert.equal(burstBudget("custom", true).count, lo.count);
});

test("Hit feedback setting: Full by default, Subtle softer, Off drops the overlays (the flinch stays); remembered", async () => {
  assert.equal(parseHitFeel(null), "full");
  assert.equal(parseHitFeel("subtle"), "subtle");
  assert.equal(parseHitFeel("loud"), "full");
  for (const k of ["marker", "sound", "burst", "cam", "rumble", "flash"] as const) {
    assert.ok(FEEL.subtle[k] < FEEL.full[k] && FEEL.subtle[k] > 0, k);
    assert.equal(FEEL.off[k], 0, k);
  }
  assert.ok(FEEL.off.react > 0 && FEEL.off.react < FEEL.subtle.react);
  // persisted as radpayne.hitFeel, read back at start-up
  const mem = new Map<string, string>([["radpayne.hitFeel", "subtle"]]);
  const ls = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true });
  const { useFeel, setHitFeel, hitFeelMode } = await import("../src/ui/feel.ts");
  assert.equal(useFeel.getState().mode, "subtle");
  setHitFeel("off");
  assert.equal(hitFeelMode(), "off");
  assert.equal(mem.get("radpayne.hitFeel"), "off");
});

test("a bot clear of room 1 through the grouper: one kill hit per kill of his, his hits all seen", () => {
  const g = new Game(room1(), { seed: 2, difficulty: "normal" });
  const bot = new Bot();
  const grp = new HitGrouper();
  let kills = 0, heads = 0, hits = 0, waveEnds = 0;
  for (let i = 0; i < 120 * 120 && g.phase !== "done" && g.phase !== "dead"; i++) {
    g.step(bot.next(g));
    for (const e of g.drain()) grp.feed(e);
    const awake = g.enemies.filter(e => e.state !== "dead" && e.state !== "inactive" && !e.fled).length;
    for (const h of grp.flush(awake)) {
      hits++;
      if (h.kind === "kill") { kills++; if (h.headshot) heads++; if (h.waveEnd) waveEnds++; }
    }
  }
  assert.equal(g.phase, "done");
  assert.equal(kills, g.stats.kills);
  assert.equal(heads, g.stats.headshots);
  assert.ok(hits >= kills && hits <= g.stats.hits, `${hits} hits, ${g.stats.hits} landed rounds`);
  assert.ok(waveEnds >= 1, "the last kill ends a wave");
});
