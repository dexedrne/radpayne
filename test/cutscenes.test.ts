// The cutscenes' voice lines: every clip exists and is preloaded with the rest of the audio, a line
// with a speaker is quoted, and each panel reads its lines one after another with no overlap and holds
// about a second after the last one (lengths read from the mp3 frames, no decoder needed). A page turn
// shows none of the new panel's captions before its voices, and the long door panels keep their
// caption box inside the frame through the push-in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { FILES } from "../src/audio/sfx.ts";
import { FIRST, GAP, HOLD, lineLen, onScreen, ORIGIN, planPanel, PUSH, pushed, readTime, type Shown, type TimedLine } from "../src/ui/cutsceneTiming.ts";

type Panel = { lines: TimedLine[]; dur?: number; box?: [number, number, number, number]; push?: number };
const root = new URL("../public/", import.meta.url);
const load = (id: string) => JSON.parse(readFileSync(new URL(`cutscenes/${id}.json`, root), "utf8")) as { panels: Panel[] };
const clip = (ln: TimedLine) => `voices/${ln.speaker ?? "narrator"}/${ln.audio}`;

/** Length of an MPEG-1 layer III file in seconds, by walking its frame headers. */
function mp3Seconds(path: URL): number {
  const b = readFileSync(path);
  let i = 0;
  if (b.toString("latin1", 0, 3) === "ID3") i = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]);
  const KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const HZ = [44100, 48000, 32000];
  let frames = 0, sr = 44100;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff || (b[i + 1] & 0xfe) !== 0xfa) { i++; continue; } // MPEG-1, layer III
    const br = KBPS[b[i + 2] >> 4], hz = HZ[(b[i + 2] >> 2) & 3];
    if (!br || !hz) { i++; continue; }
    sr = hz;
    frames++;
    i += Math.floor((144 * br * 1000) / hz) + ((b[i + 2] >> 1) & 1);
  }
  return (frames * 1152) / sr;
}

const CUTS = ["c1", "e1", "c2", "c3", "c4"];

test("every cutscene clip is on disk and in the preload list", () => {
  const pre = new Set<string>(FILES);
  for (const id of CUTS) for (const p of load(id).panels) for (const ln of p.lines) {
    if (!ln.audio) continue;
    assert.ok(existsSync(new URL(`audio/${clip(ln)}.mp3`, root)), `${id}: ${clip(ln)}.mp3 missing`);
    assert.ok(pre.has(clip(ln)), `${id}: ${clip(ln)} is not preloaded (it would be silent)`);
  }
});

test("the door cutscenes are voiced: c1 panel 3 and every e1 line", () => {
  const c1 = load("c1").panels[2].lines.map(l => `${l.speaker ?? "narrator"}/${l.audio}`);
  assert.deepEqual(c1, ["narrator/cs1_03", "goon_b/cs1_bag", "goon_a/cs1_list"]);
  const e1 = load("e1").panels.map(p => p.lines.map(l => `${l.speaker ?? "narrator"}/${l.audio}`));
  assert.deepEqual(e1, [["narrator/e1_01"], ["narrator/e1_02", "pa/e1_pa"], ["narrator/e1_03", "goon_b/e1_whisper", "goon_b/e1_dance"]]);
});

test("someone else's line is quoted, the narrator's is not", () => {
  for (const id of CUTS) for (const p of load(id).panels) for (const ln of p.lines) {
    const quoted = /^".+"$/.test(ln.text);
    assert.equal(quoted, !!ln.speaker, `${id}: ${ln.text}`);
  }
});

test("each panel reads its lines in turn and holds ~1 s after the last", () => {
  for (const id of CUTS) for (const [k, p] of load(id).panels.entries()) {
    if (!p.lines.every(l => l.audio)) continue;
    const len = (ln: TimedLine) => mp3Seconds(new URL(`audio/${clip(ln)}.mp3`, root));
    const { start, end, turn } = planPanel(p.lines, p.dur, len);
    assert.equal(start[0], FIRST);
    for (let j = 1; j < start.length; j++) assert.ok(start[j] >= end[j - 1] + GAP - 1e-9, `${id} panel ${k + 1}: line ${j + 1} overlaps`);
    const hold = turn - end[end.length - 1];
    assert.ok(hold >= GAP + HOLD - 1e-9 && hold <= 1.6, `${id} panel ${k + 1}: holds ${hold.toFixed(2)} s after its last line (dur ${p.dur})`);
  }
});

test("a line lasts the clip narrate() started, else its decoded clip, else a reading time", () => {
  const ln = { audio: "x", text: "the door gave. the bass came through it like a heartbeat that wasn't mine." };
  assert.equal(lineLen(ln, 4.9, 4.8), 4.9);
  assert.equal(lineLen(ln, 0, 4.8), 4.8); // muted: the caption stays for the clip's length
  assert.equal(lineLen(ln, 0, 0), readTime(ln.text)); // not decoded
  assert.equal(lineLen({ text: "\"it's him.\"" }, 0, 0), 2.8);
  // a panel with no lines still turns
  assert.ok(planPanel([], 6, () => 0).turn === 6);
  // dur shorter than the lines: the page waits for them
  const plan = planPanel([ln, { audio: "y", text: "\"keep dancing.\"" }], 3, l => (l.audio === "x" ? 4.9 : 1.6));
  assert.ok(Math.abs(plan.start[1] - (FIRST + 4.9 + GAP)) < 1e-9);
  assert.ok(Math.abs(plan.turn - (plan.end[1] + GAP + HOLD)) < 1e-9);
});

test("a page turn shows none of the new panel's lines until its own clock starts them", () => {
  const [p2, p3] = load("e1").panels.slice(1, 3);
  const left: Shown<Panel> = { panel: p2, n: 2 }; // panel 2's two lines are up when the page turns
  assert.equal(onScreen(left, p3), 0); // the first render of panel 3: no "it's him." before its voice
  assert.equal(onScreen(left, p2), 2);
  assert.equal(onScreen({ panel: p3, n: 1 }, p3), 1);
  assert.equal(onScreen({ panel: null, n: 0 }, p3), 0);
});

test("the long door panels keep their caption box in the frame through the whole push", () => {
  const c1 = load("c1").panels[2], e1 = load("e1").panels[2];
  for (const p of [c1, e1]) assert.ok(p.push && p.push < PUSH, "c1 p3 / e1 p3 push in less than the default");
  for (const id of CUTS) for (const [k, p] of load(id).panels.entries()) {
    if (p.push === undefined || !p.box) continue;
    // at the full push (later than any hold reaches) the box's top-left corner is still inside
    assert.ok(pushed(p.box[0], ORIGIN[0], p.push) >= 0.004, `${id} panel ${k + 1}: the box's left edge leaves the frame`);
    assert.ok(pushed(p.box[1], ORIGIN[1], p.push) >= 0.004, `${id} panel ${k + 1}: the box's top edge leaves the frame`);
  }
});
