// The vyvanse.beer menu hook (src/vyvanse/menu.ts): framed by vyvanse.beer only (ancestorOrigins or the
// referrer), a localhost parent in dev / test builds only, and the one message, to that origin, never "*".
import { test } from "node:test";
import assert from "node:assert/strict";
import { VYVANSE_ORIGIN, backToVyvanse, launcherOrigin, type HookWindow } from "../src/vyvanse/menu.ts";

function fakeWindow(opts: { framed?: boolean; ancestor?: string; referrer?: string; throws?: boolean } = {}) {
  const sent: Array<{ m: unknown; origin: string }> = [];
  const parent = { postMessage: (m: unknown, origin: string) => { if (opts.throws) throw new Error("gone"); sent.push({ m, origin }); } };
  const w: HookWindow = {
    top: null,
    parent,
    location: { ancestorOrigins: opts.ancestor === undefined ? undefined : [opts.ancestor] },
    document: { referrer: opts.referrer ?? "" },
  };
  w.top = opts.framed === false ? w : parent;
  if (opts.framed === false) w.parent = w;
  return { w, sent };
}

test("vyvanse: framed by vyvanse.beer, by ancestorOrigins or by the referrer", () => {
  assert.equal(launcherOrigin(fakeWindow({ ancestor: VYVANSE_ORIGIN }).w, false), VYVANSE_ORIGIN);
  assert.equal(launcherOrigin(fakeWindow({ referrer: "https://vyvanse.beer/" }).w, false), VYVANSE_ORIGIN);
  assert.equal(launcherOrigin(fakeWindow({ referrer: "https://vyvanse.beer/play/radpayne" }).w, false), VYVANSE_ORIGIN);
  // ancestorOrigins absent (Firefox) or a different first ancestor: the referrer still counts
  assert.equal(launcherOrigin(fakeWindow({ ancestor: "https://other.example", referrer: "https://vyvanse.beer/" }).w, false), VYVANSE_ORIGIN);
});

test("vyvanse: not framed, radbro.fun, look-alikes and http: are not vyvanse.beer", () => {
  assert.equal(launcherOrigin(fakeWindow({ framed: false, ancestor: VYVANSE_ORIGIN, referrer: "https://vyvanse.beer/" }).w, false), null);
  assert.equal(launcherOrigin(fakeWindow().w, false), null);
  assert.equal(launcherOrigin(fakeWindow({ ancestor: "https://radbro.fun", referrer: "https://radbro.fun/play/radpayne" }).w, false), null);
  for (const referrer of ["https://vyvanse.beer.evil.example/", "https://evil.example/https://vyvanse.beer/", "http://vyvanse.beer/", "https://radpayne.vyvanse.beer/", "https://vyvanse.beer"]) {
    assert.equal(launcherOrigin(fakeWindow({ referrer }).w, false), null, referrer);
  }
  for (const ancestor of ["https://vyvanse.beer.evil.example", "http://vyvanse.beer", "https://radpayne.vyvanse.beer"]) {
    assert.equal(launcherOrigin(fakeWindow({ ancestor }).w, false), null, ancestor);
  }
  assert.equal(launcherOrigin(undefined, true), null);
});

test("vyvanse: a localhost / 127.0.0.1 parent only in a dev or test build", () => {
  assert.equal(launcherOrigin(fakeWindow({ ancestor: "http://localhost:4890" }).w, true), "http://localhost:4890");
  assert.equal(launcherOrigin(fakeWindow({ referrer: "http://127.0.0.1:4890/harness.html" }).w, true), "http://127.0.0.1:4890");
  assert.equal(launcherOrigin(fakeWindow({ referrer: "http://localhost/" }).w, true), "http://localhost");
  assert.equal(launcherOrigin(fakeWindow({ ancestor: "http://localhost:4890" }).w, false), null, "production: no localhost");
  assert.equal(launcherOrigin(fakeWindow({ referrer: "http://127.0.0.1:4890/" }).w, false), null, "production: no 127.0.0.1");
  for (const o of ["https://localhost:4890", "http://localhost.evil.example", "http://192.168.1.5:4890", "https://radbro.fun"]) {
    assert.equal(launcherOrigin(fakeWindow({ ancestor: o, referrer: `${o}/` }).w, true), null, o);
  }
  // not framed: nothing, dev or not
  assert.equal(launcherOrigin(fakeWindow({ framed: false, ancestor: "http://localhost:4890" }).w, true), null);
});

test("vyvanse: backToVyvanse posts exactly { type: 'vyvanse:menu' } to the parent's origin", () => {
  const f = fakeWindow({ ancestor: VYVANSE_ORIGIN });
  assert.equal(backToVyvanse(f.w, false), true);
  assert.deepEqual(f.sent, [{ m: { type: "vyvanse:menu" }, origin: VYVANSE_ORIGIN }]);
  const d = fakeWindow({ referrer: "http://localhost:4890/harness.html" });
  assert.equal(backToVyvanse(d.w, true), true);
  assert.deepEqual(d.sent, [{ m: { type: "vyvanse:menu" }, origin: "http://localhost:4890" }]);
});

test("vyvanse: nothing is sent unframed, framed by someone else, or to '*'; a gone parent is no throw", () => {
  for (const f of [fakeWindow({ framed: false, ancestor: VYVANSE_ORIGIN }), fakeWindow({ ancestor: "https://radbro.fun" }), fakeWindow({ referrer: "http://localhost:4890/" })]) {
    assert.equal(backToVyvanse(f.w, false), false);
    assert.equal(f.sent.length, 0);
  }
  assert.equal(backToVyvanse(fakeWindow({ ancestor: VYVANSE_ORIGIN, throws: true }).w, false), false);
  assert.equal(backToVyvanse(undefined, true), false);
});
