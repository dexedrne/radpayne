// The two games from one code (src/brands.ts, src/product.ts): RadPayne stays exactly RadPayne (its
// tuning, its roster, its page head), and RetardioPayne is the Retardios only on its one harder,
// deterministic difficulty (src/sim/cut.ts) with its own head and share image.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { BRANDS, brandHtml, otherGameHref, resolveGame } from "../src/brands.ts";
import { GAME, IS_CUT } from "../src/product.ts";
import { DIFFICULTY, MADAME, RADPAYNE_DIFFICULTIES, type Difficulty } from "../src/sim/tuning.ts";
import { ARRIVE, BEAM, CH2_DIFF, COUNTESS, ROOF, SNIPER2, killsFor, perDiff } from "../src/sim/tuning2.ts";
import { CUT } from "../src/sim/cut.ts";
import { HEROES, RADBROS, RETARDIOS, defaultHeroOf, fixedDifficultyOf, pickFor, rosterOf } from "../src/ui/store.ts";
import { CUT_TEXT, textFor } from "../src/ui/cutText.ts";
import { NARRATION } from "../src/app/director.ts";
import { GAME_INFO, RADPAYNE, RETARDIOPAYNE } from "../src/radbro/bridge.ts";
import { Game } from "../src/sim/game.ts";
import { Bot } from "../src/sim/bot.ts";
import { readLevel, type LevelData } from "../src/world/level.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const level = (id: string): LevelData => readLevel(JSON.parse(read(`public/levels/${id}.json`)));
const RAD4: Difficulty[] = ["easy", "normal", "hard", "hardcore"];

test("RadPayne's tuning: its four difficulties, Madame Pockit's and chapter 2's tables as they were; chapter 2's arrivals and its new, lighter Normal rosters", () => {
  assert.deepEqual([...RADPAYNE_DIFFICULTIES], RAD4);
  assert.deepEqual(DIFFICULTY.easy, { speedK: 0.55, label: "Chill", damage: 0.5, reaction: 0.9, accuracy: 0.8, wake: 0.9, shooters: 1, far: 32, farFloor: 0.12, hp: 1, boss: 0.5, copium: 2, keep: 1, startCopium: 2, heal: 35, checkpoint: 60, btDrain: 1, killRefill: 1, suppress: 0, flank: 0, grenade: 0, camp: 0, rush: 0 });
  assert.deepEqual(DIFFICULTY.normal, { speedK: 0.45, label: "Normal", damage: 1.15, reaction: 0.45, accuracy: 1.1, wake: 0.35, shooters: 2, far: 40, farFloor: 0.2, hp: 1, boss: 0.85, copium: 1, keep: 0.8, startCopium: 1, heal: 30, checkpoint: 60, btDrain: 1.25, killRefill: 1.2, suppress: 0.5, flank: 1, grenade: 14, camp: 6, rush: 9 });
  assert.deepEqual(DIFFICULTY.hard, { speedK: 0.32, label: "Hard", damage: 1.6, reaction: 0.35, accuracy: 1.3, wake: 0.25, shooters: 3, far: 45, farFloor: 0.28, hp: 1.1, boss: 1.15, copium: 1, keep: 0.55, startCopium: 1, heal: 25, checkpoint: 50, btDrain: 1.5, killRefill: 1.3, suppress: 0.8, flank: 2, grenade: 9, camp: 4.5, rush: 6 });
  assert.deepEqual(DIFFICULTY.hardcore, { speedK: 0.22, label: "Hardcore", damage: 2.1, reaction: 0.28, accuracy: 1.45, wake: 0.18, shooters: 4, far: 50, farFloor: 0.35, hp: 1.2, boss: 1.2, copium: 1, keep: 0.45, startCopium: 1, heal: 25, checkpoint: 45, btDrain: 1.8, killRefill: 1.4, suppress: 1, flank: 3, grenade: 7, camp: 3.5, rush: 4.5 });
  const four = (t: Record<string, number>) => RAD4.map(d => t[d]);
  assert.deepEqual(four(MADAME.hp), [2000, 2300, 2600, 2800]);
  assert.deepEqual(four(MADAME.pace), [1.5, 1.3, 1, 0.9]);
  assert.deepEqual(four(MADAME.maxLive), [2, 2, 3, 3]);
  assert.deepEqual({ ...CH2_DIFF.normal }, { keep: 1, checkpoint: 70, grenade: 16, camp: 7, rush: 10, suppress: 0.45 });
  assert.equal(CH2_DIFF.easy, undefined);
  assert.equal(CH2_DIFF.hard, undefined);
  assert.equal(CH2_DIFF.hardcore, undefined);
  const per = (t: Parameters<typeof perDiff>[0]) => RAD4.map(d => perDiff(t, d));
  assert.deepEqual(per(COUNTESS.hp), [1800, 2300, 2800, 2800]);
  assert.deepEqual(per(COUNTESS.tell), [1.25, 1.0, 0.8, 0.8]);
  assert.deepEqual(per(COUNTESS.tell3), [0.9, 0.8, 0.5, 0.5]);
  assert.deepEqual(per(COUNTESS.damage), [18, 12, 18, 18]);
  assert.deepEqual(per(COUNTESS.doorFirst), [2, 2, 3, 3]);
  assert.deepEqual(per(COUNTESS.doorPace), [1.5, 1.3, 1, 0.9]);
  assert.deepEqual(per(COUNTESS.doorLive), [2, 2, 4, 4]);
  assert.deepEqual(per(SNIPER2.tell), [1.3, 1.25, 0.8, 0.8]);
  assert.deepEqual(per(SNIPER2.damage), [14, 16, 22, 22]);
  assert.deepEqual(per(ROOF.track), [2.6, 3.3, 3.9, 3.9]);
  assert.deepEqual(per(ROOF.accuracy), [1.1, 1.15, 1.5, 1.5]);
  assert.deepEqual(per(BEAM.tell), [1.5, 1.35, 0.85, 0.85]);
  assert.deepEqual(per(BEAM.dur), [3.8, 3.6, 2.8, 2.8]);
  assert.deepEqual(per(BEAM.pace), [1.4, 1.25, 1, 1]);
  assert.deepEqual(per(BEAM.damage), [10, 10, 16, 16]);
  // chapter 2's arrivals (2026-10-03, the owner: "too many enemies, they even spawn in places where you
  // hide"): the most standing at once and the gap between two, per difficulty
  assert.deepEqual(per(ARRIVE.maxUp), [4, 6, 8, 9]);
  assert.deepEqual(per(ARRIVE.gap), [2.2, 1.6, 1.1, 0.9]);
  assert.deepEqual([ARRIVE.minDist, ARRIVE.backDist, ARRIVE.step, ARRIVE.zone], [12, 20, 1.5, 2.5]);
  // a chapter 2 room on RadPayne's difficulties (since 2026-10-03): Normal about a third under what it had,
  // Hard about a fifth (some of its girls are Hardcore's only now), Hardcore every girl, as before
  const rosters: Record<string, number[]> = { room6: [16, 16, 26, 32], room7: [15, 15, 28, 34], room8: [18, 18, 33, 40], room9: [17, 17, 28, 36], room10: [9, 9, 15, 18] };
  for (const [id, want] of Object.entries(rosters)) assert.deepEqual(RAD4.map(d => new Game(level(id), { seed: 1, difficulty: d }).enemies.length), want, id);
});

test("RadPayne's characters are unchanged: the six Radbros and the two Retardios, #4764 first pick", () => {
  assert.deepEqual(RADBROS.map(h => [h.id, h.kind, h.name, h.color, h.weapon ?? "", (h.start ?? []).join()]), [
    ["652", "RADBRO", "#652", "#ff3d7f", "", ""],
    ["4764", "RADBRO", "#4764", "#3ff0ff", "", ""],
    ["2564", "RADBRO", "#2564", "#b8c4ff", "", ""],
    ["723", "RADBRO", "#723", "#ffb03f", "", "shotgun"],
    ["3171", "RADBRO", "#3171", "#ffdc4a", "", ""],
    ["250", "RADBRO", "#250", "#ff5a3c", "ak", ""],
  ]);
  assert.deepEqual(RETARDIOS.map(h => [h.id, h.kind, h.name]), [["retardio555", "RETARDIO", "#555"], ["retardio85", "RETARDIO", "#85"]]);
  assert.deepEqual(rosterOf("radpayne").map(h => h.id), HEROES.map(h => h.id));
  assert.deepEqual(HEROES.map(h => h.id), ["652", "4764", "2564", "723", "3171", "250", "retardio555", "retardio85"]);
  assert.equal(defaultHeroOf("radpayne"), "4764");
  assert.equal(pickFor("radpayne", "652"), "652");
  assert.equal(pickFor("radpayne", "retardio85"), "retardio85");
  assert.equal(pickFor("radpayne", "nobody"), "4764");
  assert.equal(fixedDifficultyOf("radpayne"), null);
});

test("one build-time switch: VITE_GAME picks the game; only dev and test builds take ?game=", () => {
  assert.equal(GAME, "radpayne", "outside a page (node) it is RadPayne");
  assert.equal(IS_CUT, false);
  assert.equal(resolveGame(undefined, "production", ""), "radpayne");
  assert.equal(resolveGame(undefined, "production", "?game=retardiopayne"), "radpayne", "a production build ignores ?game");
  assert.equal(resolveGame("retardiopayne", "production", ""), "retardiopayne");
  assert.equal(resolveGame("retardiopayne", "production", "?game=radpayne"), "retardiopayne");
  assert.equal(resolveGame(undefined, "development", "?game=retardiopayne"), "retardiopayne");
  assert.equal(resolveGame(undefined, "test", "?seed=1&game=retardiopayne"), "retardiopayne");
  assert.equal(resolveGame("retardiopayne", "development", "?game=radpayne"), "radpayne");
  assert.equal(resolveGame("bogus", "development", "?game=bogus"), "radpayne");
  // the titles link each other: the live sites, or ?game= in a dev / test build
  assert.equal(otherGameHref("radpayne", "production"), "https://retardiopayne.vyvanse.beer/");
  assert.equal(otherGameHref("retardiopayne", "production"), "https://radpayne.vyvanse.beer/");
  assert.equal(otherGameHref("radpayne", "development"), "?game=retardiopayne");
  assert.equal(otherGameHref("retardiopayne", "test"), "?game=radpayne");
});

test("the page head: RadPayne's index.html as it is; RetardioPayne's own title, description and share tags", () => {
  const html = read("index.html");
  assert.equal(brandHtml(html, "radpayne"), html);
  const rp = brandHtml(html, "retardiopayne");
  const og = "https://retardiopayne.vyvanse.beer/og.jpg";
  assert.match(rp, /<title>RetardioPayne<\/title>/);
  assert.match(rp, new RegExp(`<meta name="description" content="${BRANDS.retardiopayne.description.replace(/[.()]/g, "\\$&")}"`));
  assert.match(rp, /<link rel="canonical" href="https:\/\/retardiopayne\.vyvanse\.beer\/"/);
  for (const k of ["og:image", "og:image:secure_url"]) assert.ok(rp.includes(`<meta property="${k}" content="${og}"`), k);
  assert.ok(rp.includes(`<meta name="twitter:image" content="${og}"`));
  for (const k of ['property="og:title"', 'property="og:site_name"', 'name="twitter:title"']) assert.ok(rp.includes(`<meta ${k} content="RetardioPayne"`), k);
  assert.ok(rp.includes('<meta property="og:url" content="https://retardiopayne.vyvanse.beer/"'));
  // nothing of RadPayne's left in the head's text or tags (the fonts, the icon path and the rest stay)
  const head = rp.slice(0, rp.indexOf("</head>"));
  assert.ok(!/radpayne\.vyvanse|og3\.jpg|>RadPayne<|"RadPayne"/.test(head), "a RadPayne tag left in RetardioPayne's head");
  assert.ok(!/Radbros #4764/.test(head));
  // its favicon and its placeholder share image (a 1200 x 630 JPEG), put over public's at the build
  assert.match(read("brand/retardiopayne/favicon.svg"), /^<svg /);
  const jpg = fs.readFileSync(path.join(ROOT, "brand/retardiopayne/og.jpg"));
  assert.equal(jpg.readUInt16BE(0), 0xffd8);
  let i = 2, size: [number, number] | null = null;
  while (i < jpg.length && !size) {
    const marker = jpg.readUInt16BE(i), len = jpg.readUInt16BE(i + 2);
    if (marker >= 0xffc0 && marker <= 0xffc2) size = [jpg.readUInt16BE(i + 7), jpg.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  assert.deepEqual(size, [1200, 630]);
  assert.ok(jpg.length < 400_000, `og.jpg is ${jpg.length} bytes`);
  // a missing tag is an error, never RadPayne's tags shipped silently
  assert.throws(() => brandHtml(html.replace(/<meta property="og:image" [^>]*>/, ""), "retardiopayne"));
});

test("RetardioPayne plays only the Retardios on its one fixed difficulty", () => {
  assert.deepEqual(rosterOf("retardiopayne").map(h => h.id), ["retardio555", "retardio85"]);
  assert.ok(rosterOf("retardiopayne").every(h => h.kind === "RETARDIO"));
  assert.equal(defaultHeroOf("retardiopayne"), "retardio555");
  for (const r of RADBROS) assert.equal(pickFor("retardiopayne", r.id), "retardio555", `#${r.id} is no pick in RetardioPayne`);
  assert.equal(pickFor("retardiopayne", "retardio85"), "retardio85");
  assert.equal(fixedDifficultyOf("retardiopayne"), "retardio");
  assert.ok(!RADPAYNE_DIFFICULTIES.includes("retardio"), "RadPayne never offers it");
  assert.equal(DIFFICULTY.retardio, CUT.diff);
});

test("the harder cut against RadPayne's Normal: better aim, faster, pushing, more damage, slower bullet time, fewer cans, tougher bosses; chapter 2 on Normal's rosters with two shooting at once", () => {
  const n = DIFFICULTY.normal, c = DIFFICULTY.retardio;
  assert.ok(c.accuracy > n.accuracy && c.far >= n.far && c.farFloor > n.farFloor && c.speedK < n.speedK, "aim");
  assert.ok(c.reaction < n.reaction && c.wake < n.wake, "reaction");
  assert.ok(c.shooters > n.shooters && c.suppress > n.suppress && c.flank > n.flank && c.grenade < n.grenade && c.camp < n.camp && c.rush < n.rush, "push");
  assert.ok(c.damage > n.damage && c.hp > n.hp && c.boss > n.boss, "damage");
  assert.ok(c.killRefill < n.killRefill && c.killRefill < DIFFICULTY.hard.killRefill, "bullet time refills slower than Normal's and Hard's");
  assert.ok(c.keep < n.keep && c.copium <= n.copium && c.startCopium <= n.startCopium, "cans");
  assert.ok(MADAME.hp.retardio > MADAME.hp.normal && perDiff(COUNTESS.hp, "retardio") > perDiff(COUNTESS.hp, "normal"), "bosses over Normal's");
  // Madame Pockit's doors keep three up (Normal two); the Countess's lifts open on Normal's numbers (two,
  // two standing: chapter 2 plays Normal's rosters) at a quicker pace
  assert.ok(MADAME.maxLive.retardio > MADAME.maxLive.normal, "Madame Pockit's doors");
  assert.equal(perDiff(COUNTESS.doorFirst, "retardio"), perDiff(COUNTESS.doorFirst, "normal"));
  assert.equal(perDiff(COUNTESS.doorLive, "retardio"), perDiff(COUNTESS.doorLive, "normal"));
  assert.ok(perDiff(COUNTESS.doorPace, "retardio") < perDiff(COUNTESS.doorPace, "normal"), "the Countess's lifts, quicker");
  // chapter 2 (2026-10-03: the owner found it too hard): Normal's rosters, none of the girls a level marks
  // for Hard, each wave still comes in; at most two of them shooting at once, as many standing as on
  // Normal, coming in a little quicker; harder than Normal through the rest (aim, reaction, damage, health,
  // bullet time)
  for (const id of ["room6", "room7", "room8", "room9", "room10"]) {
    const lv = level(id);
    const g = new Game(lv, { seed: 1, difficulty: "retardio" });
    const normal = new Game(lv, { seed: 1, difficulty: "normal" });
    assert.deepEqual(g.enemies.map(e => e.id), normal.enemies.map(e => e.id), `${id}: Normal's roster`);
    for (const t of g.triggers) {
      const k = killsFor(t.data.afterKills, "retardio");
      if (k !== undefined) assert.ok(k <= g.enemies.length && k === killsFor(t.data.afterKills, "normal"), `${id} ${t.id}: waits for ${k} of ${g.enemies.length}`);
    }
    // its own chapter 2 ease, over the cut's row
    assert.equal(g.diff.damage, CUT.ch2.damage);
    assert.ok(g.diff.damage > normal.diff.damage && g.diff.accuracy > normal.diff.accuracy && g.diff.reaction < normal.diff.reaction && g.diff.hp > normal.diff.hp);
    assert.equal(g.diff.accuracy, c.accuracy);
    assert.equal(g.diff.shooters, 2);
    assert.equal(normal.diff.shooters, 2);
  }
  assert.equal(perDiff(ARRIVE.maxUp, "retardio"), perDiff(ARRIVE.maxUp, "normal"));
  assert.ok(perDiff(ARRIVE.gap, "retardio") < perDiff(ARRIVE.gap, "normal"));
  const ch1 = new Game(level("room1"), { seed: 1, difficulty: "retardio" });
  assert.deepEqual(ch1.diff, c, "chapter 1 takes the cut's row as it is");
});

test("the harder cut is deterministic and room 1 can be cleared", () => {
  const run = () => {
    const g = new Game(level("room1"), { seed: 3, difficulty: "retardio" });
    const bot = new Bot();
    for (let i = 0; i < 120 * 120 && g.phase !== "done" && g.phase !== "dead"; i++) { g.step(bot.next(g)); g.drain(); }
    return g;
  };
  const a = run(), b = run();
  assert.equal(a.hash(), b.hash());
  assert.equal(a.phase, "done", `room 1 on the cut: ${a.phase}, ${a.alive} left`);
});

test("on-screen words: RetardioPayne's lines never call him a Radbro; RadPayne's and the voices stay as they are", () => {
  const texts = [
    ...Object.values(NARRATION),
    ...fs.readdirSync(path.join(ROOT, "public/cutscenes")).filter(f => f.endsWith(".json")).flatMap(f => {
      const cs = JSON.parse(read(`public/cutscenes/${f}`)) as { panels?: Array<{ lines?: Array<{ text?: string }> }> };
      return (cs.panels ?? []).flatMap(p => (p.lines ?? []).map(l => l.text ?? ""));
    }),
  ];
  for (const [from] of CUT_TEXT) assert.ok(texts.some(t => t.includes(from)), `"${from}" is in RadPayne's lines`);
  for (const t of texts) {
    assert.equal(textFor(t, false), t);
    const shown = textFor(t, true);
    assert.ok(!/other radbros|my own kind/i.test(shown), shown);
  }
  // the portal hears RetardioPayne as its own game, with no #4764 in its controls
  assert.equal(GAME_INFO, RADPAYNE);
  assert.equal(RETARDIOPAYNE.game, "retardiopayne");
  assert.ok(!RETARDIOPAYNE.controls.some(c => c.includes("#4764")));
});
