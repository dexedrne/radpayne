// Cover (sim/cover.ts): derived from the colliders, the player's cover moves (take, slide, pop out, blind
// fire, vault, dash, leave), shots from the front stopped by it and from the flank not, and the gang using
// the same points.
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/sim/world.ts";
import { COVER, aiCovers, deriveCover, openA, openB } from "../src/sim/cover.ts";
import { boxNode, level } from "./helpers.ts";

/** A crate (1 m high, 2 m wide) at z = -5 and a wall (3 m high, 3 m wide) at x = 6, on a floor. */
export function coverArena(extra: ReturnType<typeof boxNode>[] = []) {
  return level([
    boxNode("crate", [0, 0.5, -5], [2, 1, 0.8]),
    boxNode("wall", [6, 1.5, -5], [3, 3, 0.4]),
    boxNode("post", [-6, 1.5, -5], [0.2, 3, 0.2]),
    ...extra,
  ]);
}

test("cover: derived from the colliders, low behind a crate, high with two open edges behind a wall, none behind a post", () => {
  const lv = coverArena();
  const segs = deriveCover(new World(lv.boxes));
  const crate = segs.filter(s => s.nodes.includes("crate"));
  const wall = segs.filter(s => s.nodes.includes("wall"));
  assert.equal(segs.filter(s => s.nodes.includes("post")).length, 0, "a post is no cover");
  assert.ok(crate.length >= 2 && crate.every(s => !s.high), "the crate is low cover on its long sides");
  const south = crate.find(s => s.nz > 0.9)!;
  assert.ok(south, "a segment on the crate's south side (normal +z)");
  assert.ok(Math.abs(south.top - 1) < 0.05, `its height is the crate's (${south.top})`);
  assert.ok(Math.abs(south.az - (-5 + 0.4 + COVER.off)) < 0.01, "he stands a hand off its face");
  assert.ok(south.len > 1.4 && south.len < 2, `it runs along the crate (${south.len})`);
  const back = wall.find(s => s.nz > 0.9)!;
  assert.ok(back.high && back.tall, "the wall is high cover, tall enough to hide standing");
  assert.ok(openA(back) && openB(back), "both of its ends are open edges");
  // the gang's points: one or more along the crate, one at each of the wall's edges, facing -n
  const pts = aiCovers(segs);
  const wp = pts.filter(c => c.seg === back.id);
  assert.equal(wp.length, 2);
  assert.ok(wp.every(c => c.high && Math.abs(c.fz + 1) < 1e-6));
  assert.notEqual(wp[0].side, wp[1].side, "they lean out of opposite edges");
  assert.ok(pts.filter(c => c.seg === south.id).length >= 1);
});

test("cover: a segment against a wall that continues (a corner) has no open edge on that end; deriving is deterministic", () => {
  const lv = coverArena([boxNode("return", [7.3, 1.5, -3.8], [0.4, 3, 2])]);
  const w = new World(lv.boxes);
  const a = deriveCover(w), b = deriveCover(w);
  assert.deepEqual(a, b);
  const back = a.find(s => s.nodes.includes("wall") && s.nz > 0.9)!;
  assert.ok(openA(back) !== openB(back), "one end runs into the return wall");
});

// ---- his cover ------------------------------------------------------------------------------------
import { Game } from "../src/sim/game.ts";
import { DT } from "../src/sim/tuning.ts";
import { emptyInput, type GameEvent, type InputFrame } from "../src/sim/types.ts";
import { markerNode } from "./helpers.ts";
import { HB_HEAD, HB_TORSO, aimPoint, makeCapsules } from "../src/combat/hitboxes.ts";
import { pivotOf } from "../src/sim/player.ts";
import { trace, makeTraceHit, HIT_ACTOR, HIT_WORLD } from "../src/combat/trace.ts";

const PI = Math.PI;
function coverGame(x = 0, z = -3.4, extra: ReturnType<typeof boxNode>[] = []) {
  return new Game(coverArena([markerNode("spawn", "spawn", [x, 0, z], {}, PI), ...extra]), { seed: 3, ai: false });
}
function run(g: Game, s: number, set: (f: InputFrame, i: number) => void = () => undefined, log?: InputFrame[]): GameEvent[] {
  const out: GameEvent[] = [];
  const f = emptyInput();
  for (let i = 0; i < Math.round(s / DT); i++) {
    const k = { ...f, yaw: g.player.yaw, pitch: g.player.pitch };
    set(k, i);
    log?.push({ ...k });
    g.step(k);
    out.push(...g.drain());
  }
  return out;
}
const press = (key: "cover" | "jump") => (f: InputFrame, i: number) => { if (i === 0) f[key] = true; };
const covers = (ev: GameEvent[]) => ev.filter(e => e.type === "cover").map(e => (e as Extract<GameEvent, { type: "cover" }>).what);

test("his cover: C takes the crate in front (a short run), he tucks down behind it: shots from the front stop at it, the flank gets through", () => {
  const g = coverGame();
  run(g, 0.05);
  assert.ok(g.coverTarget, "the crate is marked");
  const ev = run(g, 0.8, press("cover"));
  assert.deepEqual(covers(ev), ["dash", "in"]);
  const p = g.player, s = g.cover[p.cover];
  assert.ok(s && !s.high && s.nz > 0.9, "behind the crate's south side");
  assert.equal(p.hit.pose.stance, "cover");
  assert.ok(Math.abs(p.z - (-5 + 0.4 + 0.45)) < 0.02, `on its standing line (z ${p.z})`);
  const caps = makeCapsules(), head = { x: 0, y: 0, z: 0 }, body = { x: 0, y: 0, z: 0 };
  aimPoint("radbro", p.hit.pose, HB_HEAD, head, caps);
  aimPoint("radbro", p.hit.pose, HB_TORSO, body, caps);
  assert.ok(head.y + 0.27 < 1.06, `his head is down behind it (${head.y})`);
  const th = makeTraceHit();
  for (const t of [head, body]) {
    const ox = p.x, oy = 1.4, oz = -16;
    const d = Math.hypot(t.x - ox, t.y - oy, t.z - oz);
    const h = trace(g.world, g.actors, 1, ox, oy, oz, (t.x - ox) / d, (t.y - oy) / d, (t.z - oz) / d, 40, th);
    assert.equal(h.kind, HIT_WORLD, "from the front: the crate");
    const fx = p.x + 9, fz = p.z + 0.3;
    const d2 = Math.hypot(t.x - fx, t.y - 1.2, t.z - fz);
    const h2 = trace(g.world, g.actors, 1, fx, 1.2, fz, (t.x - fx) / d2, (t.y - 1.2) / d2, (t.z - fz) / d2, 40, th);
    assert.equal(h2.kind, HIT_ACTOR, "from the flank: him");
  }
});

test("his cover: slide along it, pop up while aiming and duck on release, blind fire over the top, vault over it, leave by moving away", () => {
  const g = coverGame();
  run(g, 0.05);
  run(g, 0.8, press("cover"));
  const p = g.player, s = g.cover[p.cover];
  const u0 = p.coverU;
  run(g, 0.3, f => { f.moveX = s.tx > 0 ? 1 : -1; });
  assert.ok(p.coverU > u0 + 0.3, `slid along (${u0} -> ${p.coverU})`);
  assert.ok(p.cover >= 0, "still in cover");
  // blind fire: the round leaves over the top of the crate, not from his tucked hands
  let ev = run(g, 0.1, (f, i) => { f.fire = i === 0; f.pitch = 0; });
  const shot = ev.find(e => e.type === "shot") as Extract<GameEvent, { type: "shot" }>;
  assert.ok(shot && Math.abs(shot.oy - (s.y + s.top + 0.12)) < 0.01, `blind: over the top (${shot?.oy})`);
  // up while aiming
  ev = run(g, 0.3, f => { f.aim = true; });
  assert.deepEqual(covers(ev), ["pop"]);
  assert.equal(p.coverPop, 1, `ts ${g.timeScale} mode ${p.mode} ${p.cover}`);
  assert.equal(p.hit.pose.stance, "stand");
  ev = run(g, 0.05, f => { f.aim = true; f.fire = true; });
  const up = ev.find(e => e.type === "shot") as Extract<GameEvent, { type: "shot" }>;
  assert.ok(up && up.oy > 1.15, "popped up: from his hands");
  ev = run(g, 0.3);
  assert.deepEqual(covers(ev), ["duck"]);
  assert.equal(p.hit.pose.stance, "cover");
  // vault
  ev = run(g, 0.7, press("jump"));
  assert.deepEqual(covers(ev), ["out", "vault"]);
  assert.equal(p.mode, "normal");
  assert.ok(p.z < -5.4 - 0.3, `over the crate (${p.z})`);
  assert.ok(Math.abs(p.y) < 1e-6 && p.grounded);
  // back into cover from this side (its north side), then away from it: out
  run(g, 0.05, f => { f.yaw = PI; });
  ev = run(g, 0.8, (f, i) => { f.yaw = PI; f.cover = i === 0; });
  assert.ok(covers(ev).includes("in"), "the north side, facing back south");
  ev = run(g, 0.3, f => { f.yaw = PI; f.moveY = -1; });
  assert.deepEqual(covers(ev), ["out"]);
  assert.equal(p.cover, -1);
});

test("his cover: at a high edge he steps out round the corner to shoot, over the shoulder on that side; the dash runs to the marked spot", () => {
  // behind the wall (x 4.5..7.5, south face z -4.8), near its west end
  const g = coverGame(5.0, -3.6);
  run(g, 0.05);
  run(g, 0.8, press("cover"));
  const p = g.player, s = g.cover[p.cover];
  assert.ok(s.high && s.tall, "high cover, standing");
  assert.notEqual(p.coverEnd, 0, "at an open edge");
  assert.equal(p.hit.pose.stance, "stand");
  const hide = { x: p.x, z: p.z };
  // the west edge is on his left (he looks -z: his right is +x): the shoulder goes left
  run(g, 0.6);
  assert.ok(p.x < 5.1, "the west edge");
  assert.equal(p.shoulder, -1, "over the left shoulder");
  const piv = pivotOf(p, { x: 0, y: 0, z: 0 }, g.world);
  assert.ok(piv.x < p.x - 0.3, "the pivot (aim ray, camera) to his left");
  run(g, 0.3, f => { f.aim = true; });
  assert.ok(p.x < 4.5 - 0.2, `out past the corner (${p.x})`);
  run(g, 0.3);
  assert.ok(Math.hypot(p.x - hide.x, p.z - hide.z) < 1e-6, "back behind it");
  // the dash: look at the crate's east end from here, press C
  run(g, 0.05, f => { f.yaw = Math.atan2(-(1.3 - p.x), -(-4.15 - p.z)); });
  run(g, 0.02, f => { f.yaw = p.yaw; });
  assert.ok(g.coverTarget && g.coverTarget.dash, "the crate is marked");
  const target = g.coverTarget!.seg;
  const ev = run(g, 1.6, (f, i) => { f.yaw = p.yaw; f.cover = i === 0; });
  assert.deepEqual(covers(ev), ["dash", "in"]);
  assert.equal(p.cover, target);
});

test("his cover is deterministic: an input log with cover, pops, blind fire, a dash and a vault replays to the same hash", () => {
  const script = (f: InputFrame, i: number) => {
    const t = i * DT;
    f.cover = i === 6 || i === 200;
    f.aim = t > 1.0 && t < 1.6;
    f.fire = t > 0.8 && t < 2.0 && i % 20 === 0;
    f.moveX = t > 2.0 && t < 2.4 ? 1 : 0;
    f.yaw = t > 1.7 ? 0.9 : 0;
    f.jump = i === 400;
  };
  const log: InputFrame[] = [];
  const a = new Game(coverArena([markerNode("spawn", "spawn", [0, 0, -3.4], {}, PI), markerNode("e", "enemy", [0, 0, -14], { kind: "goon" })]), { seed: 5 });
  const hashes: string[] = [];
  const f0 = emptyInput();
  for (let i = 0; i < 600; i++) { const f = { ...f0 }; script(f, i); log.push(f); a.step(f); a.drain(); hashes.push(a.hash()); }
  const b = new Game(coverArena([markerNode("spawn", "spawn", [0, 0, -3.4], {}, PI), markerNode("e", "enemy", [0, 0, -14], { kind: "goon" })]), { seed: 5 });
  for (let i = 0; i < 600; i++) { b.step({ ...log[i] }); b.drain(); assert.equal(b.hash(), hashes[i], `step ${i}`); }
});

test("his cover: no vault over a crate into a wall behind it (the way over must be clear)", () => {
  // a wall 0.4 m behind the crate's far side: no room to land between them, and no vaulting the wall
  const g = coverGame(0, -3.4, [boxNode("backwall", [0, 1.5, -5.9], [6, 3, 0.2])]);
  run(g, 0.05);
  run(g, 0.8, press("cover"));
  assert.ok(g.player.cover >= 0);
  const ev = run(g, 0.7, press("jump"));
  assert.ok(!covers(ev).includes("vault"), "no vault");
  assert.ok(g.player.z > -5, "still on his side");
});

// ---- the gang against his cover (ai/tactics.ts) ------------------------------------------------------

/** Him behind the crate, three goons out front 14-17 m off with cover of their own and waypoints round
 *  the sides; he holds the cover the whole time. */
export function siege(difficulty: "easy" | "normal" | "hard" | "hardcore", seed = 4) {
  const lv = coverArena([
    markerNode("spawn", "spawn", [0, 0, -3.4], {}, PI),
    markerNode("g1", "enemy", [-3, 0, -19], { kind: "goon", milady: 1 }, 0),
    markerNode("g2", "enemy", [2, 0, -20], { kind: "goon", milady: 2 }, 0),
    markerNode("g3", "enemy", [5, 0, -18], { kind: "goon", milady: 3 }, 0),
    boxNode("far-a", [-3, 0.5, -16], [2.4, 1, 0.6]),
    boxNode("far-b", [3, 0.5, -16.5], [2.4, 1, 0.6]),
    boxNode("side-w", [-9, 0.5, -6], [0.6, 1, 2.4]),
    boxNode("side-e", [10, 0.5, -3], [0.6, 1, 2.4]),
    ...[[-8, -18], [0, -18], [8, -18], [-11, -10], [11, -10], [-11, -3], [12, 0], [-6, -12], [6, -12]].map(([x, z], i) => markerNode(`wp-${i}`, "waypoint", [x, 0, z])),
  ]);
  const g = new Game(lv, { seed, difficulty });
  for (const e of g.enemies) { e.state = "idle"; }
  return g;
}

test("the gang against his cover: on Hard they lay fire on it, send flankers round the side and lob a frag at it; on Chill they wait for a shot", () => {
  const out: Record<string, { sup: number; flank: boolean; frags: number }> = {};
  for (const d of ["easy", "hard"] as const) {
    const g = siege(d);
    // into cover, then wake them with a shot over the crate
    run(g, 0.05);
    run(g, 0.8, press("cover"));
    assert.ok(g.player.cover >= 0);
    let sup = 0, flank = false, frags = 0;
    const ev = run(g, 20, (f, i) => {
      f.fire = i === 5;
      // whatever lands near him: he stays put (the test is about them)
      if (g.player.health < 40) g.player.health = 100;
    });
    for (const e of ev) {
      if (e.type === "shot" && e.shooter >= 0) sup++;
      if (e.type === "throw" && e.by !== undefined) frags++;
    }
    for (const e of g.enemies) if (e.role === "flank" || (e.cover >= 0 && Math.abs(g.graph.covers[e.cover].x) > 6)) flank = true;
    out[d] = { sup, flank, frags };
  }
  assert.ok(out.hard.sup > 0, `hard: suppressing fire (${JSON.stringify(out)})`);
  assert.ok(out.hard.flank, "hard: a flanker");
  assert.ok(out.hard.frags >= 1, "hard: a frag");
  assert.equal(out.easy.frags, 0, "chill: no frags");
  assert.equal(out.easy.sup, 0, "chill: nobody fires at a man they cannot hit");
  assert.ok(!out.easy.flank, "chill: no flankers");
});

test("the gang's tactics replay bit-exactly", () => {
  const hashes = (): string[] => {
    const g = siege("hardcore", 9);
    const hs: string[] = [];
    run(g, 0.05);
    run(g, 0.8, press("cover"));
    run(g, 12, (f, i) => { f.fire = i % 90 === 5; f.aim = (i % 300) > 200; if (i % 60 === 0) hs.push(g.hash()); });
    return hs;
  };
  assert.deepEqual(hashes(), hashes());
});
