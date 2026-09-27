// The gun sounds: every sample the code names ships (and the set stays small), a variant never repeats
// back to back, the room picks its tail, and the gang's fire fades with distance but never vanishes.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { GUN_FILES, fresh, gunAtt, gunLowpass, setSpace, tailKey } from "../src/audio/sfx.ts";

const SFX = path.join(import.meta.dirname, "..", "public", "audio");

test("every gun sample ships, and the whole gun set stays under 600 KB", () => {
  let bytes = 0;
  for (const k of GUN_FILES) {
    const f = path.join(SFX, `${k}.mp3`);
    assert.ok(fs.existsSync(f), `${k}.mp3 is missing`);
    bytes += fs.statSync(f).size;
  }
  for (const k of ["sfx/shotgun_pump", "sfx/smg_bolt"]) bytes += fs.statSync(path.join(SFX, `${k}.mp3`)).size;
  assert.ok(GUN_FILES.some(k => k.startsWith("sfx/ak_shot")), "the AK has its own shots");
  assert.ok(GUN_FILES.some(k => k.startsWith("sfx/enemy_")), "the gang has its own shots");
  assert.ok(bytes < 600 * 1024, `${Math.round(bytes / 1024)} KB`);
});

test("variants: never the same one twice running, never one of the last two from a set of four or more", () => {
  const three = ["a", "b", "c"], five = ["p1", "p2", "p3", "p4", "p5"];
  let prev = "";
  const last: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 400; i++) {
    const k = fresh(three);
    assert.notEqual(k, prev);
    prev = k;
    const f = fresh(five);
    assert.ok(!last.includes(f), `${f} after ${last.join(", ")}`);
    last.push(f);
    if (last.length > 2) last.shift();
    seen.add(f);
  }
  assert.equal(seen.size, 5, "every variant plays");
});

test("the room picks the tail: the street outside, the club, the back rooms", () => {
  setSpace("street", false);
  assert.equal(tailKey("pistols"), "sfx/pistol_tail_street");
  assert.equal(tailKey("smgs"), "sfx/smg_tail_street");
  setSpace("club", true);
  assert.equal(tailKey("pistols"), "sfx/pistol_tail_club");
  assert.equal(tailKey("shotgun"), "sfx/shotgun_tail_club");
  assert.equal(tailKey("ak"), "sfx/ak_tail_room");
  setSpace("backrooms", true);
  assert.equal(tailKey("pistols"), "sfx/pistol_tail_backrooms");
  assert.equal(tailKey("smgs"), "sfx/smg_tail_room");
  // a room without a look: indoor floors -> a room, otherwise the street
  setSpace(undefined, true);
  assert.equal(tailKey("shotgun"), "sfx/shotgun_tail_club");
  setSpace(undefined, false);
  assert.equal(tailKey("shotgun"), "sfx/shotgun_tail_street");
});

test("the gang's fire: full level up close, quieter and duller with distance, never gone", () => {
  assert.equal(gunAtt(3), 1);
  assert.equal(gunAtt(7), 1);
  let prev = 1;
  for (let d = 8; d < 120; d += 4) {
    const a = gunAtt(d);
    assert.ok(a <= prev && a >= 0.22, `${d} m: ${a}`);
    prev = a;
  }
  assert.ok(gunAtt(20) > 0.45, "a goon across the street still reads");
  assert.equal(gunLowpass(20), 0);
  assert.ok(gunLowpass(30) > 8000 && gunLowpass(46) < gunLowpass(30) && gunLowpass(200) >= 2500);
});
