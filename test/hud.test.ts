import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Game } from "../src/sim/game.ts";
import { METER } from "../src/sim/tuning.ts";
import { emptyInput } from "../src/sim/types.ts";
import { level, markerNode } from "./helpers.ts";
import {
  BL_H, BR_H, NUDGE_HOLD, STRIP_W, TL_H, TL_W, ammoLow, arrowDir, arrowPx, arrowRing, canvasFx, captionBudget, damageAngle, hudScale, hurtPhase, hurtStrength, markerFades, markerScale, parseHint,
  recordBest, reticleFadePx, ringPin, rowLow, segDist, slashPath, subtitleWidth, threatScale,
} from "../src/ui/hud/logic.ts";
import type { Hud } from "../src/ui/store.ts";
import { roomLabel, roomText } from "../src/ui/rooms.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("hud scale: 720p 0.72, 1080p 1, 1440p 1.25; S equals M at 720p", () => {
  near(hudScale(720), 0.72);
  near(hudScale(1080), 1);
  near(hudScale(1440), 1.25);
  near(hudScale(720, "s"), 0.72);
  near(hudScale(1080, "l"), 1.2);
  near(hudScale(1080, "s"), 0.85);
});

test("damage angle: 0 ahead, 90 right, 180 behind, -90 left (camera looking down -Z)", () => {
  const f = [0, -1] as const;
  near(damageAngle(0, 0, 0, -10, ...f), 0);
  near(damageAngle(0, 0, 10, 0, ...f), 90);
  near(Math.abs(damageAngle(0, 0, 0, 10, ...f)), 180);
  near(damageAngle(0, 0, -10, 0, ...f), -90);
  // turning the camera turns the slash: facing +X, a shooter at -Z is now on the left
  near(damageAngle(0, 0, 0, -10, 1, 0), -90);
});

test("damage slash: 18 points on the ellipse, the teeth point at the centre, the punch pulls it in", () => {
  const nums = (d: string) => d.replace(/[MLZ]/g, " ").trim().split(/\s+/).map(Number);
  const p = nums(slashPath(0, 560, 330));
  assert.equal(p.length, 36);
  const r = (i: number) => Math.hypot(p[2 * i], p[2 * i + 1]);
  // odd points are the teeth (inward, up to 34 px), even points sit on the ring, 9..17 the outer band
  assert.ok(r(3) < Math.min(r(2), r(4)) - 25, `tooth ${r(3)} vs ring ${r(4)}`);
  near(r(4), 330, 0.1);
  near(r(13), 339, 0.1);
  const q = nums(slashPath(0, 560, 330, 34, 9, 6));
  near(Math.hypot(q[0], q[1]), r(0) - 6, 0.2);
  assert.equal(hurtStrength(0), 0.55);
  assert.equal(hurtStrength(40), 1);
  assert.deepEqual(hurtPhase(0), { inset: 0, alpha: 1 });
  assert.deepEqual(hurtPhase(300), { inset: 6, alpha: 1 });
  near(hurtPhase(930)!.alpha, 0.5);
  assert.equal(hurtPhase(1300), null);
});

test("caption budget: one while the gang is awake, two otherwise, nudge > subtitle > objective", () => {
  const all = { nudge: true, subtitle: true, objective: true };
  assert.deepEqual(captionBudget(all, true), { nudge: true, subtitle: false, objective: false });
  assert.deepEqual(captionBudget(all, false), { nudge: true, subtitle: true, objective: false });
  assert.deepEqual(captionBudget({ nudge: false, subtitle: true, objective: true }, false), { nudge: false, subtitle: true, objective: true });
  assert.deepEqual(captionBudget({ nudge: false, subtitle: false, objective: true }, true), { nudge: false, subtitle: false, objective: true });
});

test("key hints become keycaps", () => {
  assert.deepEqual(parseHint("RMB / Q: bullet time"), [{ keys: ["RMB", "Q"], label: "bullet time" }]);
  assert.deepEqual(parseHint("LMB: shoot · WASD: move"), [{ keys: ["LMB"], label: "shoot" }, { keys: ["WASD"], label: "move" }]);
  assert.deepEqual(parseHint(""), []);
});

test("ammo: total low at 25% of capacity, a row low at 3", () => {
  assert.equal(ammoLow(6, 12, 2), true);
  assert.equal(ammoLow(7, 12, 2), false);
  assert.equal(ammoLow(1, 6, 1), true);
  assert.equal(rowLow(3), true);
  assert.equal(rowLow(4), false);
});

test("threat markers shrink with distance", () => {
  assert.equal(threatScale(5), 1);
  assert.equal(threatScale(40), 0.7);
  near(threatScale(23.5), 0.85);
});

test("edge arrows: full size, on the ring round the top and the sides, never the bottom edge or the plates", () => {
  near(arrowPx(0.72), 36); near(arrowPx(1), 40); near(arrowPx(1.25), 50);
  for (const [W, H, s] of [[1280, 720, 0.72], [1920, 1080, 1], [2560, 1440, 1.25]] as const) {
    const a = arrowPx(s), half = a / 2;
    const ring = arrowRing(W, H, s);
    const pin = (deg: number, prev: -1 | 0 | 1 = 0) => ringPin(...arrowDir(false, 0, 0, W, H, deg), W, H, ring, prev);
    let last: { x: number; y: number } | null = null;
    for (let deg = -179.5; deg <= 179.5; deg += 0.5) {
      const p = pin(deg);
      const tag = `${W}x${H} ${deg}: (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`;
      // on the ring: a side edge, the top edge, or the step round the top-left group
      const onSide = Math.abs(p.x - ring.left) < 1e-6 || Math.abs(p.x - ring.right) < 1e-6;
      const onTop = Math.abs(p.y - ring.top) < 1e-6 || Math.abs(p.y - ring.ny) < 1e-6 || Math.abs(p.x - ring.nx) < 1e-6;
      assert.ok(onSide || onTop, `off the ring ${tag}`);
      // inside the screen, clear of the corner plates under it and the top-left group
      assert.ok(p.x - half >= 0 && p.x + half <= W && p.y - half >= 0, tag);
      const plates = p.x < W / 2 ? BL_H : BR_H;
      assert.ok(p.y + half <= H - (28 + plates) * s + 1e-6, `on the plates ${tag}`);
      assert.ok(!(p.x - half < (28 + TL_W) * s && p.y - half < (28 + TL_H) * s), `on the tally ${tag}`);
      // never the bottom-centre block where the Radbro stands (and the crosswalk under him)
      assert.ok(!(p.x > W * 0.2 && p.x < W * 0.8 && p.y > H * 0.4), `on the Radbro ${tag}`);
      // it points along the bearing
      near(((p.rot - deg + 540) % 360) - 180, 0, 1e-6);
      // and slides without jumps (except over the seam straight behind)
      if (last && Math.abs(deg) < 170) assert.ok(Math.hypot(p.x - last.x, p.y - last.y) < 20 * s + 4, `jump ${tag}`);
      last = p;
    }
    // straight behind: low on a side edge, just above the plates, pointing down
    const b = pin(178), bl = pin(-178);
    near(b.x, ring.right); near(b.y, ring.lowR); assert.ok(Math.abs(b.rot) > 170);
    near(bl.x, ring.left); near(bl.y, ring.lowL);
    // level with you: mid height on that side; straight ahead: top centre
    near(pin(90).y, H / 2); near(pin(-90).x, ring.left); near(pin(0).x, W / 2); near(pin(0).y, ring.top);
  }
  // the seam straight behind: an arrow keeps its side for 15 degrees past it (no flicker)
  const W = 1280, H = 720, ring = arrowRing(W, H, 0.72);
  const at = (deg: number, prev: -1 | 0 | 1) => ringPin(...arrowDir(false, 0, 0, W, H, deg), W, H, ring, prev);
  assert.equal(at(-175, 1).side, 1);
  near(at(-175, 1).x, ring.right);
  assert.equal(at(-160, 1).side, -1);
  assert.equal(at(175, -1).side, -1);
  // a nudge caption on the left lifts the left edge's lowest point above it
  const withNudge = arrowRing(W, H, 0.72, { nudgeTop: H - 240 * 0.72 - 40 });
  assert.ok(withNudge.lowL + arrowPx(0.72) / 2 <= H - 240 * 0.72 - 40);
  // a measured top-left group (an objective caption under the tally) pushes the step down
  const tall = arrowRing(W, H, 0.72, { tl: { right: 420, bottom: 150 } });
  const up = ringPin(-1, -0.45, W, H, tall);
  assert.ok(!(up.x - 18 < 420 && up.y - 18 < 150), `(${up.x}, ${up.y})`);
  // the projection wins in front of the lens (off the right edge, a little high)
  const f = ringPin(...arrowDir(true, W + 400, H / 2 - 50, W, H, 60, 55), W, H, ring);
  near(f.x, ring.right); assert.ok(f.y < H / 2);
  // ... and hands over to the bearing toward the camera plane: no jump when she crosses behind
  const cross = (front: boolean, off: number) => ringPin(...arrowDir(front, W + 4000, H / 2 - 900, W, H, 100, off), W, H, ring);
  const before = cross(true, 89.9), after = cross(false, 90.1);
  assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < 3, `(${before.x}, ${before.y}) vs (${after.x}, ${after.y})`);
  // off the bottom edge in front of the lens (below you): the side edge, not the bottom
  const low = ringPin(...arrowDir(true, W * 0.7, H + 300, W, H, 170, 40), W, H, ring);
  near(low.x, ring.right); assert.ok(low.y <= ring.lowR);
  // and the arrow agrees with the damage slash for the same shooter
  const deg = damageAngle(0, 0, 6, 8, 0, -1); // behind-right of a player facing -Z
  const p = at(deg, 0);
  assert.ok(deg > 90 && p.y > H / 2 && p.x > W / 2);
});

test("head markers fade on the Radbro's silhouette and next to the reticle", () => {
  const W = 1280, H = 720;
  near(reticleFadePx(0.72), 30); near(reticleFadePx(1.25), 37.5);
  near(segDist(5, 5, 0, 0, 10, 0), 5); near(segDist(-3, 4, 0, 0, 10, 0), 5); near(segDist(1, 1, 2, 2, 2, 2), Math.SQRT2);
  // on the crosshair
  assert.equal(markerFades(W / 2 + 12, H / 2 - 20, W, H, [], 30), true);
  assert.equal(markerFades(W / 2 + 40, H / 2 - 20, W, H, [], 30), false);
  // on him: his torso on screen (a capsule from the hips to the neck, 60 px round)
  const him = [{ ax: 500, ay: 600, bx: 500, by: 420, r: 60 }];
  assert.equal(markerFades(540, 470, W, H, him, 30), true);
  assert.equal(markerFades(500, 365, W, H, him, 30), true);
  assert.equal(markerFades(580, 470, W, H, him, 30), false);
  assert.equal(markerFades(500, 330, W, H, him, 30), false);
});

test("head markers: never under 20 px across; 1080p keeps the distance scale", () => {
  near(markerScale(40, 0.72) * 32, 20);
  near(markerScale(5, 0.72), 0.72);
  near(markerScale(40, 1), 0.7);
  near(markerScale(23.5, 1), 0.85);
});

test("subtitle: fits between the corner strips at every HUD size; 780 when there is room", () => {
  const strips = (W: number, H: number, size: "s" | "m" | "l") => {
    const s = hudScale(H, size), w = subtitleWidth(W, s, W / H < 1.6) * s;
    return { left: W / 2 - w / 2, right: W / 2 + w / 2, stripEnd: (28 + STRIP_W) * s, w: w / s };
  };
  for (const [W, H] of [[1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440]] as const) {
    for (const size of ["s", "m", "l"] as const) {
      const r = strips(W, H, size);
      assert.ok(r.left >= r.stripEnd, `${W}x${H} ${size}: subtitle from ${r.left.toFixed(0)}, strip to ${r.stripEnd.toFixed(0)}`);
    }
  }
  near(strips(1280, 720, "m").w, 780);
  near(strips(1920, 1080, "m").w, 780);
  assert.ok(strips(1280, 720, "l").w < 640);
  // narrow screens lift it over the strips: only the margins cap it
  near(subtitleWidth(1280, hudScale(1024), true), 780);
});

test("nudges: the heal prompt goes once the can is drunk; out of copium goes once health is back", async () => {
  // the store reads saved settings when it loads: give it a memory store first
  const mem = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) } });
  const { useNudge } = await import("../src/ui/hud/captions.ts");
  const { useUi } = await import("../src/ui/store.ts");
  const base = useUi.getState().hud;
  const h = (o: Partial<Hud>): Hud => ({ ...base, run: 77, health: 100, copium: 2, healing: false, mags: [12, 12], hands: 2, reserve: 50, owned: ["pistols"], ...o });
  assert.equal(useNudge(h({}), 0), null);
  assert.equal(useNudge(h({ health: 20, copium: 1 }), 100)?.text, "one can left. drink it. [H]");
  assert.ok(useNudge(h({ health: 20, copium: 1 }), 1000));
  // H: the can is being drunk (copium 0, still low for a moment): no prompt, and no "out of copium" either
  assert.equal(useNudge(h({ health: 22, copium: 0, healing: true }), 1100), null);
  assert.equal(useNudge(h({ health: 57, copium: 0, healing: false }), 2100), null);
  // hit again with none left: out of copium, until the health is back
  assert.equal(useNudge(h({ health: 20, copium: 0 }), 5000)?.text, "out of copium. don't get hit.");
  assert.equal(useNudge(h({ health: 60, copium: 1 }), 5200), null);
  // a pickup runs its full hold
  const got = useNudge(h({ health: 60, copium: 1, owned: ["pistols", "shotgun"] }), 6000);
  assert.equal(got?.text, "picked up the shotgun. [2]");
  assert.ok(useNudge(h({ health: 60, copium: 1, owned: ["pistols", "shotgun"] }), 6000 + NUDGE_HOLD - 1));
  assert.equal(useNudge(h({ health: 60, copium: 1, owned: ["pistols", "shotgun"] }), 6000 + NUDGE_HOLD), null);
});

test("canvas filter: none at rest; BT grade; low-HP desaturation; pause blur; death greyout; results dim", () => {
  const base = { screen: "play", timeScale: 1, health: 100, deadAt: 0, now: 0 };
  assert.equal(canvasFx(base).filter, "none");
  assert.match(canvasFx({ ...base, timeScale: 0.3 }).filter, /^sepia\(0\.220\) saturate\(0\.850\)/);
  assert.match(canvasFx({ ...base, health: 25 }).filter, /saturate\(0\.600\).*brightness\(0\.950\)/);
  assert.equal(canvasFx({ ...base, health: 35 }).filter, "none");
  assert.equal(canvasFx({ ...base, health: 20, killcam: true }).filter, "none");
  assert.match(canvasFx({ ...base, screen: "paused" }).filter, /grayscale\(0\.750\) brightness\(0\.420\) blur\(3px\)$/);
  const dead = canvasFx({ ...base, deadAt: 5 });
  assert.match(dead.filter, /grayscale\(1\.000\) brightness\(0\.600\)$/);
  assert.match(dead.transition, /1\.2s/);
  assert.match(canvasFx({ ...base, screen: "results" }).filter, /grayscale\(0\.500\) brightness\(0\.380\) blur\(2px\)$/);
  // the function order never changes (CSS interpolates the transitions)
  const order = (f: string) => f.replace(/\([^)]*\)/g, "");
  assert.ok(order(canvasFx({ ...base, screen: "paused" }).filter).startsWith(order(canvasFx({ ...base, timeScale: 0.3 }).filter)));
});

test("personal best: saved per room and difficulty, only when faster", () => {
  const mem = new Map<string, string>();
  const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  assert.deepEqual(recordBest(st, "room1", "normal", 80), { prev: null, isBest: true });
  assert.equal(mem.get("radpayne.best.room1.normal"), "80.000");
  assert.deepEqual(recordBest(st, "room1", "normal", 90), { prev: 80, isBest: false });
  assert.deepEqual(recordBest(st, "room1", "normal", 72.4), { prev: 80, isBest: true });
  assert.deepEqual(recordBest(st, "room1", "hard", 99), { prev: null, isBest: true });
  assert.deepEqual(recordBest(null, "room1", "normal", 50), { prev: null, isBest: true });
});

test("room text: the room tag, objectives, level overrides", () => {
  const t = roomText("room1", { name: "Outside the Milady rave" });
  assert.equal(roomLabel(t), "ROOM 1 · OUTSIDE CLUB MILADY");
  assert.equal(t.objective, "clear the street. my bag is inside the club.");
  assert.equal(t.objectiveClear, "the bag is inside. get to the door.");
  const g = roomText("greybox", { name: "greybox" });
  assert.equal(roomLabel(g), "ROOM 1 · GREYBOX");
  assert.equal(roomText("room1", { name: "x", objective: "find the bag.", number: 2 }).objective, "find the bag.");
  assert.equal(roomLabel(roomText("room1", { name: "x", number: 2 })), "ROOM 2 · OUTSIDE CLUB MILADY");
});

test("room text: rooms 2 and 3 (the level's clearLine is a voice id, its prompt the clear objective)", () => {
  const r2 = roomText("room2", { name: "The Rave", clearLine: "r2_clear", next: "room3", prompt: "the bag went up. the staff door, behind the stage." });
  assert.equal(roomLabel(r2), "ROOM 2 · THE RAVE");
  assert.notEqual(r2.clearLine, "r2_clear");
  assert.equal(r2.next, "THE BACK OF THE HOUSE");
  assert.equal(r2.objectiveClear, "the bag went up. the staff door, behind the stage.");
  const r3 = roomText("room3", { name: "The Back of the House", clearLine: "r3_clear", next: "room4" });
  assert.equal(r3.next, "THE ELEVATOR");
  assert.equal(r3.number, 3);
  assert.equal(roomText("room1").next, "THE RAVE");
  assert.equal(roomText("room3", { name: "x", clearText: "the car went up." }).clearLine, "the car went up.");
});

test("sim: bullet time refused with too little meter emits btRefused; hits carry the shooter's position", () => {
  const lv = level([markerNode("spawn", "spawn", [0, 0, 0], {}, Math.PI), markerNode("e1", "enemy", [3, 0, -12])]);
  const g = new Game(lv, { ai: false });
  g.meter = METER.minToStart / 2;
  const inp = emptyInput();
  inp.yaw = g.player.yaw;
  inp.bt = true;
  g.step(inp);
  assert.equal(g.bulletTime, false);
  assert.ok(g.drain().some(e => e.type === "btRefused"));
  g.hurtPlayer(9, 0);
  const hurt = g.drain().find(e => e.type === "hurt" && e.target === -1);
  assert.ok(hurt && hurt.type === "hurt");
  assert.equal(hurt.shooter, 0);
  near(hurt.fromX!, g.enemies[0].x);
  near(hurt.fromZ!, g.enemies[0].z);
  // a fall has no shooter
  g.hurtPlayer(1, -1);
  const fall = g.drain().find(e => e.type === "hurt" && e.target === -1);
  assert.ok(fall && fall.type === "hurt" && fall.fromX === undefined);
});

test("z-order: the HUD root is its own layer above every screen effect and world marker", () => {
  const css = fs.readFileSync(new URL("../src/ui/hud/tokens.css", import.meta.url), "utf8");
  const z = (sel: string): number => {
    const m = new RegExp(`(^|\\n)${sel.replace(/\./g, "\\.")} \\{[^}]*z-index: (\\d+)`).exec(css);
    assert.ok(m, `${sel} has a z-index`);
    return Number(m[2]);
  };
  const hud = z(".rp-hud");
  // grain / speed lines / low-HP vignette + halftone (5), hurt rims (5), threat markers (8), damage slashes (9)
  for (const sel of [".rp-fxroot", ".rp-rims", ".rp-threats", ".rp-damage"]) assert.ok(z(sel) < hud, `${sel} (${z(sel)}) under .rp-hud (${hud})`);
  assert.ok(z(".rp-threats") < z(".rp-damage"));
  // the kill cam and the menus still cover it
  assert.ok(z(".rp-lb") > hud && z(".rp-kc") > hud && z(".rp-layer") > hud);
});

test("player-facing lines stay plain: no meme slang in the death line, the room text or the Radbro blurbs", async () => {
  const { RUGGED_LINE } = await import("../src/ui/rooms.ts");
  const { RADBROS } = await import("../src/ui/store.ts");
  const slang = /\b(wagmi|ngmi|cop(e|ing)|gm|gn|fren|frens|based|rekt|lfg|degen|hodl|ser|anon|probably nothing)\b/i;
  const t = roomText("room1");
  const lines = [RUGGED_LINE, t.objective, t.objectiveClear, t.killcamLine, t.clearLine, t.pauseLine, ...RADBROS.map(r => r.blurb)];
  for (const l of lines) assert.ok(!slang.test(l), `slang in "${l}"`);
  const readme = fs.readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.ok(!/wagmi/i.test(readme), "README tagline");
});
