// The load audit's fixes that have logic of their own: the graphics settings (presets, saved values,
// the URL and old-setting mappings), the gang picks that reuse cached Pockit models, the sound groups
// that decide what loads when, and the goon slots the picks are made for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLEAN, DEFAULT_PRESET, DEFAULT_WEBGL2, PRESETS, PRESET_ORDER, RAIN, dprFor, fromPreset, initialGfx, parseGfx, presetOf } from "../src/app/look/gfx.ts";
import { shareShaders } from "../src/app/look/shaderShare.ts";
import { readTokens } from "../src/app/look/tokens.ts";
import fs from "node:fs";
import { FRESH_MIN, pickPockits } from "../src/vrm/picks.ts";
import { FILES, sampleGroup } from "../src/audio/sfx.ts";
import { Game, goonSlots } from "../src/sim/game.ts";
import { room1 } from "./helpers.ts";

const store = (o: Record<string, string>) => ({ getItem: (k: string) => o[k] ?? null });

test("graphics presets: cinematic is the original bloom + sharp mirror with thin rain; nothing rains denser than thin", () => {
  assert.deepEqual(PRESETS.cinematic, { bloom: "original", reflections: "sharp", rain: "thin", res: 100, msaa: true, lite: false });
  // MSAA in every preset (the thin neon letters break up without it); Low is lighter another way
  for (const p of PRESET_ORDER) assert.equal(PRESETS[p].msaa, true, p);
  assert.equal(PRESETS.low.lite, true);
  assert.ok(PRESET_ORDER.every(p => p === "low" || !PRESETS[p].lite));
  assert.equal(PRESETS.high.reflections, "soft");
  assert.equal(PRESETS.low.reflections, "off");
  for (const p of PRESET_ORDER) assert.notEqual(PRESETS[p].rain, undefined);
  assert.ok(RAIN.thin <= 2600 && RAIN.light < RAIN.thin && RAIN.max === RAIN.thin, "never the first preview's 7,000 streaks");
  for (const p of PRESET_ORDER) assert.equal(presetOf(PRESETS[p]), p);
  assert.equal(presetOf({ ...PRESETS.high, bloom: "original" }), "custom");
});

test("graphics settings: URL overrides, saved values, old Effects / Quality, backend default", () => {
  assert.equal(initialGfx("?q=low", null).preset, "low");
  // the old Effects: Clean was for a clear view, not speed: no bloom / mirror, the drizzle, but full
  // resolution, MSAA (the full crowd and lasers): a custom mix, not Low
  const { preset: cleanPreset, ...clean } = initialGfx("?fx=clean", null);
  assert.deepEqual(clean, CLEAN);
  assert.equal(cleanPreset, "custom");
  assert.deepEqual(CLEAN, { bloom: "off", reflections: "off", rain: "light", res: 100, msaa: true, lite: false });
  assert.equal(initialGfx("?fx=full", null).preset, "high");
  assert.equal(initialGfx("?gfx=cinematic", store({ "radpayne.gfx": JSON.stringify(PRESETS.low) })).preset, "cinematic");
  // saved custom mix survives; junk falls back per field
  const saved = initialGfx("", store({ "radpayne.gfx": JSON.stringify({ bloom: "original", reflections: "soft", rain: "light", res: 75, msaa: true, lite: false }) }));
  assert.equal(saved.preset, "custom");
  assert.equal(saved.bloom, "original");
  assert.equal(parseGfx("{\"bloom\":\"blinding\",\"rain\":\"storm\"}")?.rain, PRESETS[DEFAULT_PRESET].rain);
  assert.equal(parseGfx("not json"), null);
  assert.equal(initialGfx("", store({ "radpayne.fx": "clean" })).msaa, true);
  assert.equal(initialGfx("", store({ "radpayne.fx": "clean" })).bloom, "off");
  assert.equal(initialGfx("", store({ "radpayne.quality": "low" })).preset, "low");
  assert.equal(initialGfx("", store({ "radpayne.quality": "low", "radpayne.fx": "clean" })).preset, "low");
  assert.equal(initialGfx("", store({})).preset, DEFAULT_PRESET);
  assert.equal(initialGfx("", store({}), true).preset, DEFAULT_WEBGL2);
  assert.equal(initialGfx("", { getItem: () => { throw new Error("blocked"); } }).preset, DEFAULT_PRESET);
  assert.deepEqual(fromPreset("medium").preset, "medium");
  assert.equal(dprFor(100, 2), 1.75);
  assert.equal(dprFor(100, 1), 1);
  assert.equal(dprFor(50, 1), 0.5);
  assert.equal(dprFor(50, 2), 0.875);
  // 75 % never under one pixel per screen pixel (the Low preset keeps the thin neon whole on a 1x screen)
  assert.equal(dprFor(75, 1), 1);
  assert.equal(dprFor(75, 2), 1.3125);
  assert.equal(dprFor(75, 1.25), 1);
  assert.equal(dprFor(75, 0.8), 0.8);
  assert.ok(dprFor(50, 1.5) < dprFor(75, 1.5) && dprFor(75, 1.5) < dprFor(100, 1.5));
});

test("Bloom: Original's emitters: room 1's toned-down windows carry the first preview's gain", () => {
  assert.deepEqual(readTokens("glow 0.3 orig 0.95"), { kind: "glow", k: 0.3, pulse: false, flicker: false, blink: false, orig: 0.95 });
  assert.equal(readTokens("lit 3 pulse").orig, null);
  assert.equal(readTokens("glow 2 orig").orig, null);
  assert.equal(readTokens("glow 2 pulse orig 4").pulse, true);
  const mats = JSON.parse(fs.readFileSync(new URL("../public/levels/room1.json", import.meta.url), "utf8")).materials as Record<string, { name?: string }>;
  const t = (k: string) => readTokens(mats[k].name ?? "");
  assert.deepEqual([t("shopGlow").k, t("shopGlow").orig], [0.3, 0.95]);
  assert.deepEqual([t("shopCool").k, t("shopCool").orig], [0.24, 1]);
  for (const k of ["brick", "brickDark", "brickTan", "brownstone", "brownstoneLight"]) assert.deepEqual([t(k).kind, t(k).k, t(k).orig], ["lit", 1.8, 2.4], k);
});

test("shared shaders: a build renames its own buffer bindings, never the buffer node (other builds read its name)", () => {
  const goons = { name: "NodeBuffer_1043" }; // a buffer node many materials share (the neon dim's goon array)
  const inst = { name: "NodeBuffer_2077" };
  const built: unknown[] = [];
  const gl = { _nodes: { _createNodeBuilderState: (b: unknown) => { built.push(b); return b; } } };
  shareShaders(gl as never);
  const vs = "layout(std140) uniform NodeBuffer_2077 { mat4 buffer2077[ 16 ]; };\nlayout(std140) uniform NodeBuffer_1043 { vec4 buffer1043[ 12 ]; };\nvoid main() { buffer2077[0]; buffer1043[1]; }";
  const bindings = [{ bindings: [{ name: "render" }, { name: "NodeBuffer_2077", nodeUniform: inst }, { name: "NodeBuffer_1043", nodeUniform: goons }] }];
  const b = { vertexShader: vs, fragmentShader: "", computeShader: "", getBindings: () => bindings };
  gl._nodes._createNodeBuilderState(b);
  assert.equal(built.length, 1);
  assert.match(b.vertexShader, /uniform NodeBuffer_mat4_16 \{ mat4 nodeBuffer_mat4_16\[ 16 \]; \}/);
  assert.match(b.vertexShader, /uniform NodeBuffer_vec4_12 \{ vec4 nodeBuffer_vec4_12\[ 12 \]; \}/);
  assert.doesNotMatch(b.vertexShader, /NodeBuffer_\d|buffer\d/);
  assert.deepEqual(bindings[0].bindings.map(x => x.name), ["render", "NodeBuffer_mat4_16", "NodeBuffer_vec4_12"]);
  assert.equal(goons.name, "NodeBuffer_1043", "the shared node keeps its own name");
  assert.equal(inst.name, "NodeBuffer_2077");
});

test("gang picks: a first visit is all new faces; a repeat visit reuses cached girls for the start and keeps a couple of new ones", () => {
  const slots = [...Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, later: false })), { id: "l0", later: true }, { id: "l1", later: true }];
  const first = pickPockits(slots, 42, [], new Set());
  const nums = Object.values(first);
  assert.equal(nums.length, 8);
  assert.equal(new Set(nums).size, 8, "no girl twice in a room");
  assert.deepEqual(pickPockits(slots, 42, [], new Set()), first, "deterministic");
  const cached = [11, 22, 33, 44, 55, 66, 77, 88, 99, 111];
  const again = pickPockits(slots, 7, cached, new Set());
  for (let i = 0; i < 6; i++) assert.ok(cached.includes(again[`s${i}`]), "the start goons are cached girls");
  assert.ok(!cached.includes(again.l0) && !cached.includes(again.l1), "the later goons are the new faces");
  const fresh = Object.values(again).filter(n => !cached.includes(n)).length;
  assert.equal(fresh, FRESH_MIN);
  // a later room this visit gets other girls
  const used = new Set(Object.values(again));
  const room2 = pickPockits(slots, 8, cached, used);
  for (const n of Object.values(room2)) assert.ok(!used.has(n));
  // a small cache: the rest are new
  const few = pickPockits(slots, 9, [5, 6, 7], new Set());
  assert.equal(Object.values(few).filter(n => [5, 6, 7].includes(n)).length, 3);
});

test("goon slots and the sim: room 1 has six goons from the start and two the door brings in; picks land on them", () => {
  const lv = room1();
  const slots = goonSlots(lv);
  assert.equal(slots.length, 8);
  assert.deepEqual(slots.filter(s => s.later).map(s => s.id).sort(), ["goon-late-1", "goon-late-2"]);
  const pockit = Object.fromEntries(slots.map((s, i) => [s.id, 1000 + i]));
  const g = new Game(lv, { seed: 3, pockit });
  for (const e of g.enemies) if (e.kind !== "heavy") assert.equal(e.milady, pockit[e.id]);
  const later = g.enemies.filter(e => e.state === "inactive").map(e => e.id).sort();
  assert.deepEqual(later, ["goon-late-1", "goon-late-2"], "the sim's inactive goons are the later slots");
  // without picks the sim still draws its own (tests, replays)
  const g2 = new Game(lv, { seed: 3 });
  assert.ok(g2.enemies.every(e => e.kind === "heavy" || (e.milady >= 1 && e.milady <= 3333)));
});

test("sound groups: cutscene 1's lines first, the fight loop after the room's sounds, rooms 2-3 later", () => {
  for (const k of ["cs1_01", "cs1_02", "cs1_03", "cs1_04"]) assert.equal(sampleGroup(`voices/narrator/${k}`), "cs1");
  assert.equal(sampleGroup("music/fight_tense"), "fight");
  assert.equal(sampleGroup("music/street_calm"), "music");
  for (const k of ["sfx/pistol_shot", "sfx/rain_loop", "voices/goon_a/alert_1", "voices/radbro/hurt_1", "voices/narrator/tut_shoot", "sfx/smg_shot", "sfx/weapon_pickup"]) assert.equal(sampleGroup(k), "room", k);
  for (const k of ["music/rave_club", "music/backrooms_calm", "voices/crowd/scream_1", "voices/pa/pa_1", "voices/heavy/alert_1", "voices/narrator/r2_enter", "voices/narrator/cs2_01", "voices/goon_a/charge_1", "sfx/shotgun_tail_club", "sfx/door_breach", "sfx/footsteps_hard_loop", "sfx/shell_casing_floor"]) assert.equal(sampleGroup(k), "later", k);
  // the arsenal: room 1 has the perch goon's sniper, frags, melee, George and a shotgun at the barrier;
  // the hand cannon, the sawed-off, the secret doors and the plywood wall are rooms 2-3
  for (const k of ["sfx/shotgun_shot", "sfx/shotgun_pump", "sfx/shotgun_tail_street", "sfx/sniper_shot", "sfx/sniper_bolt", "sfx/scope_in", "sfx/grenade_explode", "sfx/katana_slash", "sfx/melee_hit", "sfx/meow_happy"]) assert.equal(sampleGroup(k), "room", k);
  for (const k of ["sfx/handcannon_shot", "sfx/handcannon_mag_in", "sfx/sawedoff_shot", "sfx/sawedoff_close", "sfx/secret_door", "sfx/plywood_break"]) assert.equal(sampleGroup(k), "later", k);
  // every arsenal file is in the preload lists
  for (const k of ["sniper_shot_2", "handcannon_shot_3", "sawedoff_shot_2", "grenade_bounce_2", "katana_hit", "meow_sulky_3", "secret_door", "plywood_break", "scope_out"]) assert.ok((FILES as readonly string[]).includes(`sfx/${k}`), k);
  // a file nobody listed is a room-1 file (never silent in room 1)
  assert.equal(sampleGroup("sfx/brand_new_sound"), "room");
});
