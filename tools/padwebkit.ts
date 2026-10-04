// The triggers as WebKit gives them (Safari, and every browser on an iPad, Chrome there too), at an iPad's
// screen: a scripted DualSense whose L2 and R2 report their pull in their value while `pressed` comes on
// only at the bottom of the travel, and the same pad as WebKit's / Firefox's HID path on a Mac lists it
// (no standard mapping: Cross on button 1, the triggers' pull on axes 3 and 4 from -1, the d-pad a hat on
// axis 9). For each game (RadPayne, RetardioPayne: ?game=) and each layout it plays, on the pad alone:
// the title (the d-pad, Cross: PLAY), cutscene 1 (Circle: skip), the fight prompt (Cross), then in room 1
// every gun in hand in turn (RadPayne's HID run as #250, whose own gun is the AK) (the d-pad's right) with L2 a third down: the view zooms in (the lens narrower,
// the crosshair kept), and with the sniper the scope comes up; L2 let go, back out; R2 a third down fires;
// Options pauses, the d-pad walks the menu, Options resumes. Fails on any of them.
//   RADPAYNE_CHROME_PROFILE=<throwaway dir> RADPAYNE_GPU=webgpu node tools/padwebkit.ts [url] [outDir]
//   url  a dev server or a test build (default http://localhost:4880/; ?loadout and the probes are dev/test only)
// Always launches Chromium with a THROWAWAY --user-data-dir (required; never a real profile).
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";

const profile = process.env.RADPAYNE_CHROME_PROFILE;
if (!profile) {
  console.error("set RADPAYNE_CHROME_PROFILE to a throwaway Chromium profile directory");
  process.exit(2);
}
const base = new URL(process.argv[2] ?? "http://localhost:4880/");
const outDir = path.resolve(process.argv[3] ?? ".local/shots/padwebkit");
fs.mkdirSync(outDir, { recursive: true });
// (a throwaway profile, emptied: the Pockit models' Cache Storage of a run that was cut short can hold up
// the next page's start)
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(profile, { recursive: true });
const gpuMode = process.env.RADPAYNE_GPU;
const flags = gpuMode === "webgpu"
  ? ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-vulkan=native", "--use-angle=vulkan", "--enable-gpu", "--ignore-gpu-blocklist"]
  : gpuMode === "1"
  ? ["--use-angle=gl", "--use-gl=angle", "--enable-gpu", "--ignore-gpu-blocklist"]
  : ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader"];
const IPAD_UA = "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.122 Mobile/15E148 Safari/604.1";
/** Every gun the check holds (the loadout's last is in hand first; the d-pad's right walks the rest). */
const LOADOUT = ["shotgun", "sawedoff", "smgs", "handcannon", "rifle", "sniper"];
/** RadPayne's HID run plays #250, whose own gun is the AK (the dual pistols' slot): every gun is held. */
const gunsOf = (ak: boolean) => [ak ? "ak" : "pistols", ...LOADOUT];
/** The camera's lens without the aim (CameraView FOV) and the most it may be with it (FOV_AIM 50, eased). */
const FOV = 68, AIMED_MAX = 54, SCOPE_MAX = 25;

/** In the page before anything: the fake pad (`layout`: "webkit" or "hid") and its controls. */
const SHIM = (layout: "webkit" | "hid") => {
  type B = { pressed: boolean; touched: boolean; value: number };
  const w = window as unknown as Record<string, unknown>;
  const hid = layout === "hid";
  const buttons: B[] = Array.from({ length: hid ? 14 : 18 }, () => ({ pressed: false, touched: false, value: 0 }));
  // HID: the sticks on 0, 1, 2, 5; the triggers' pull on 3, 4 from -1; the hat on 9 (over 1: let go)
  const axes = hid ? [0, 0, 0, -1, -1, 0, 0, 0, 0, 1.2857] : [0, 0, 0, 0];
  const state = { ts: 0 };
  const pad = {
    id: hid ? "054c-0ce6-DualSense Wireless Controller" : "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)",
    index: 0, connected: true, mapping: hid ? "" : "standard",
    get axes() { return axes.slice(); }, get buttons() { return buttons.map(b => ({ ...b })); }, get timestamp() { return state.ts; },
    vibrationActuator: { type: "dual-rumble", playEffect: () => Promise.resolve("complete"), reset: () => Promise.resolve("complete") },
  };
  Object.defineProperty(Navigator.prototype, "getGamepads", { value: () => [pad, null, null, null], configurable: true });
  Element.prototype.requestPointerLock = function () { return Promise.reject(new DOMException("no user gesture", "NotAllowedError")); } as typeof Element.prototype.requestPointerLock;
  // standard index -> the HID's button (-1: the hat)
  const RAW = hid ? [1, 2, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11, -1, -1, -1, -1, 12, 13] : Array.from({ length: 18 }, (_, i) => i);
  const HAT: Record<number, number> = { 12: -1, 15: -1 + 4 / 7, 13: -1 + 8 / 7, 14: -1 + 12 / 7 };
  const set = (i: number, on: boolean) => {
    if (hid && HAT[i] !== undefined) axes[9] = on ? HAT[i] : 1.2857;
    else { const b = buttons[RAW[i]]; b.pressed = on; b.touched = on; b.value = on ? 1 : 0; }
    state.ts = performance.now();
  };
  /** A trigger (6 L2, 7 R2) `v` of the way down: its value (or its HID axis) only; `pressed` at the bottom. */
  const trigger = (i: 6 | 7, v: number) => {
    if (hid) axes[i === 6 ? 3 : 4] = v > 0 ? -1 + 2 * v : -1;
    const b = buttons[RAW[i]];
    b.value = hid ? (v >= 1 ? 1 : 0) : v;
    b.pressed = v >= 1;
    b.touched = v > 0;
    state.ts = performance.now();
  };
  const tap = (i: number, ms = 160) => { set(i, true); setTimeout(() => set(i, false), ms); };
  w.__pad = { tap, set, trigger };
  addEventListener("DOMContentLoaded", () => { const e = new Event("gamepadconnected") as Event & { gamepad?: unknown }; e.gamepad = pad; dispatchEvent(e); });
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
  headless: true,
  userDataDir: profile,
  args: ["--headless=new", `--user-data-dir=${profile}`, ...flags, "--window-size=1080,810", "--autoplay-policy=no-user-gesture-required", ...(process.env.RADPAYNE_NO_SANDBOX === "1" ? ["--no-sandbox"] : [])],
  defaultViewport: { width: 1080, height: 810, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  protocolTimeout: 300_000,
});
const failures: string[] = [];
const lines: string[] = [];
const say = (s: string) => { lines.push(s); console.log(s); };
const tap = (page: Page, i: number, wait = 300) => page.evaluate(b => (window as unknown as { __pad: { tap(i: number): void } }).__pad.tap(b), i).then(() => sleep(wait));
const trigger = (page: Page, i: 6 | 7, v: number) => page.evaluate((b, x) => (window as unknown as { __pad: { trigger(i: number, v: number): void } }).__pad.trigger(b, x), i, v);
const ui = (page: Page) => page.evaluate(() => {
  const q = (s: string) => !!document.querySelector(s);
  return q("[data-testid=results]") ? "results" : q("[data-testid=pause]") ? "paused" : q("[data-testid=cutscene]") ? "cutscene" : q("[data-testid=click-to-fight]") ? "prompt" : q("[data-testid=play]") ? "title" : q(".rp-loading") ? "loading" : "play";
});
const until = async (page: Page, want: string[], ms: number, what: string): Promise<boolean> => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (want.includes(await ui(page))) return true; await sleep(250); }
  failures.push(`${what}: timed out (screen ${await ui(page)})`);
  return false;
};
type Lens = { gun: string; fov: number; aim: number; zoom: boolean; scope: boolean; shots: number; ts: number; paused: boolean };
const lens = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __rp?: { cam?: { fov: number; aim: number }; session: { paused: boolean; game: { timeScale: number; stats: { shots: number }; player: { zoom: boolean; weapon: { id: string } } } } } };
  const rp = w.__rp!;
  const p = rp.session.game.player;
  return { gun: p.weapon.id, fov: Math.round((rp.cam?.fov ?? 0) * 10) / 10, aim: Math.round((rp.cam?.aim ?? 0) * 100) / 100, zoom: p.zoom, scope: !!document.querySelector("[data-testid=scope]"), shots: rp.session.game.stats.shots, ts: rp.session.game.timeScale, paused: rp.session.paused };
}) as Promise<Lens>;

try {
  for (const game of ["radpayne", "retardiopayne"]) {
    for (const layout of ["webkit", "hid"] as const) {
      const ak = game === "radpayne" && layout === "hid";
      const GUNS = gunsOf(ak);
      const tag = `${game} ${layout}${ak ? " #250" : ""}`;
      const page = await browser.newPage();
      const cdp = await page.createCDPSession();
      await cdp.send("Emulation.setUserAgentOverride", { userAgent: IPAD_UA, platform: "iPad" });
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      page.on("pageerror", e => failures.push(`${tag}: pageerror ${(e as Error).message ?? String(e)}`));
      page.on("console", m => { if (m.type() === "error") failures.push(`${tag}: console.error ${m.text().slice(0, 200)}`); });
      await page.evaluateOnNewDocument(SHIM, layout);
      await page.evaluateOnNewDocument(() => { try { localStorage.setItem("radpayne.difficulty", "easy"); localStorage.setItem("radpayne.tutHeard", "1"); } catch { /* none */ } });
      const u = new URL(base);
      u.searchParams.set("seed", "1");
      u.searchParams.set("game", game);
      u.searchParams.set("loadout", LOADOUT.join(","));
      if (ak) u.searchParams.set("radbro", "250");
      await page.goto(u.toString(), { waitUntil: "load" });
      await page.waitForSelector("[data-testid=play]:not([disabled])", { timeout: 180_000 });
      // the title on the pad: the d-pad (the glyphs switch to the pad's), Cross plays from any row
      await tap(page, 13);
      await tap(page, 12);
      const glyphs = await page.evaluate(() => document.querySelectorAll(".rp-padg").length);
      await tap(page, 0, 600);
      const cut = await until(page, ["cutscene", "prompt"], 120_000, `${tag}: Cross on the title`);
      if (cut && (await ui(page)) === "cutscene") await tap(page, 1, 600); // Circle: skip
      if (!(await until(page, ["prompt"], 180_000, `${tag}: the fight prompt`))) { await page.close(); continue; }
      await sleep(600);
      await tap(page, 0, 800); // Cross: fight on the pad
      const started = await lens(page);
      say(`${tag}: title (pad glyphs ${glyphs}), cutscene, prompt on the pad; fighting: ${!started.paused}`);
      if (started.paused) failures.push(`${tag}: Cross on the prompt did not start the fight`);
      await sleep(800);
      // every gun: L2 a third down
      const seen = new Set<string>();
      for (let k = 0; k < GUNS.length + 2 && seen.size < GUNS.length; k++) {
        const before = await lens(page);
        if (seen.has(before.gun)) { await tap(page, 15, 700); continue; }
        seen.add(before.gun);
        await trigger(page, 6, 0.33);
        await sleep(700);
        const on = await lens(page);
        await trigger(page, 6, 0);
        await sleep(700);
        const off = await lens(page);
        const bt = on.ts < 0.99 ? " (bullet time)" : "";
        let ok: boolean;
        if (on.gun === "sniper") ok = on.zoom && on.scope && on.fov <= SCOPE_MAX && !off.zoom && !off.scope;
        else ok = on.aim > 0.9 && on.fov <= AIMED_MAX * (on.ts < 0.99 ? 60 / FOV : 1) + 0.5 && off.aim < 0.1 && !on.zoom;
        say(`${tag}: ${on.gun}: L2 at a third -> lens ${on.fov} deg${on.gun === "sniper" ? `, scope ${on.scope}` : `, aim ${on.aim}`}${bt}; let go -> ${off.fov} deg ${ok ? "ok" : "FAIL"}`);
        if (!ok) failures.push(`${tag}: ${on.gun}: L2 at a third did not ${on.gun === "sniper" ? "scope" : "zoom the view"} (${JSON.stringify({ on, off })})`);
        if (on.gun === "pistols" || on.gun === "ak" || on.gun === "sniper") await page.screenshot({ path: path.join(outDir, `${game}-${layout}-${on.gun}-aim.png`) }).catch(() => undefined);
        await tap(page, 15, 700); // the d-pad's right: the next gun
      }
      const missing = GUNS.filter(g => !seen.has(g));
      if (missing.length) failures.push(`${tag}: never held ${missing.join(", ")}`);
      // R2 a third down fires
      const s0 = (await lens(page)).shots;
      await trigger(page, 7, 0.33);
      await sleep(600);
      await trigger(page, 7, 0);
      const s1 = (await lens(page)).shots;
      say(`${tag}: R2 at a third: ${s1 - s0} shots`);
      if (s1 <= s0) failures.push(`${tag}: R2 at a third did not fire`);
      // the pause menu on the pad
      await tap(page, 9, 800);
      const paused = (await ui(page)) === "paused";
      await tap(page, 13, 250); // the d-pad down the menu
      await tap(page, 12, 250);
      await tap(page, 9, 900); // Options: resume
      const resumed = (await ui(page)) === "play";
      say(`${tag}: Options paused ${paused}, resumed ${resumed}`);
      if (!paused || !resumed) failures.push(`${tag}: the pause menu on the pad (paused ${paused}, resumed ${resumed})`);
      await page.close();
    }
  }
} catch (e) {
  failures.push(`crashed: ${(e as Error).stack ?? String(e)}`);
} finally {
  await browser.close();
  for (const f of failures) console.log(`FAIL ${f}`);
  console.log(failures.length ? "PAD WEBKIT FAILED" : "PAD WEBKIT OK");
  process.exit(failures.length ? 1 : 0);
}
