// Headless pad check: the game played with a fake gamepad only (navigator.getGamepads replaced in the
// page before it loads; no key press, no click until the last step). A DualSense walks the title (the
// difficulty row, PLAY), cutscene 1 (Cross next, Circle skip), the fight prompt (Cross), then plays room
// 1: the test bot's intent (sim/bot.ts, imported from the dev server) is turned into sticks and buttons
// (the aim is the right stick through the dead zone and the curve, with the aim assist; R2 fires, R1
// dives, R3 bullet time, ...) and the game reads only the pad. Mid-fight it pauses with Options, opens
// Controls, steps Aim assist with the d-pad, backs out and resumes. After the room (or a death) it quits
// to the title with the pad, swaps in an Xbox pad (the glyphs change), and finally presses one key (the
// keys come back). Screens are shot into outDir; the pad's frames, the kills and the rumbles are printed.
//   RADPAYNE_CHROME_PROFILE=<throwaway dir> RADPAYNE_GPU=1 node tools/padsmoke.ts [url] [outDir]
//   RADPAYNE_MAX_S   the fight's time limit (default 150 s)
// Always launches Chromium with a THROWAWAY --user-data-dir (required; never a real profile).
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";

const profile = process.env.RADPAYNE_CHROME_PROFILE;
if (!profile) {
  console.error("set RADPAYNE_CHROME_PROFILE to a throwaway Chromium profile directory");
  process.exit(2);
}
const url = process.argv[2] ?? "http://localhost:4880/?seed=1&webgl2";
const outDir = path.resolve(process.argv[3] ?? ".local/shots/pad");
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(profile, { recursive: true });
const gpu = process.env.RADPAYNE_GPU === "1";
const gfx = gpu
  ? ["--use-angle=gl", "--use-gl=angle", "--enable-gpu", "--ignore-gpu-blocklist"]
  : ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader"];
const MAX_MS = Number(process.env.RADPAYNE_MAX_S ?? 150) * 1000;

/** Runs in the page before anything else: the fake pad, its rumble log and the pilot. */
const SHIM = () => {
  type B = { pressed: boolean; touched: boolean; value: number };
  const w = window as unknown as Record<string, unknown>;
  const buttons: B[] = Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 }));
  const rumbles: Array<Record<string, number>> = [];
  const state = { id: "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)", axes: [0, 0, 0, 0], ts: 0 };
  const pad = {
    get id() { return state.id; }, index: 0, connected: true, mapping: "standard",
    get axes() { return state.axes.slice(); }, get buttons() { return buttons.map(b => ({ ...b })); }, get timestamp() { return state.ts; },
    vibrationActuator: { type: "dual-rumble", playEffect: (_t: string, p: Record<string, number>) => { rumbles.push(p); return Promise.resolve("complete"); }, reset: () => Promise.resolve("complete") },
  };
  Object.defineProperty(Navigator.prototype, "getGamepads", { value: () => [pad, null, null, null], configurable: true });
  // a pad press is no user gesture: a real browser refuses the pointer lock without a click (headless
  // Chromium hands it out anyway), so the page must play on without it, as it does for a pad player
  Element.prototype.requestPointerLock = function () { return Promise.reject(new DOMException("no user gesture", "NotAllowedError")); } as typeof Element.prototype.requestPointerLock;
  const releaseAt: number[] = [];
  const set = (i: number, on: boolean, v = on ? 1 : 0) => { buttons[i].pressed = on; buttons[i].touched = on; buttons[i].value = v; state.ts = performance.now(); };
  /** A press held for `ms` (a new press of a held button waits for its release). The game polls once
   *  a rendered frame and a headless GPU can run at 20 fps: a press lasts a few of those. */
  const tap = (i: number, ms = 160) => { if (buttons[i].pressed) return false; set(i, true); releaseAt[i] = performance.now() + ms; return true; };
  const tick = () => {
    requestAnimationFrame(tick);
    const now = performance.now();
    for (let i = 0; i < buttons.length; i++) if (releaseAt[i] && now >= releaseAt[i]) { releaseAt[i] = 0; set(i, false); }
  };
  requestAnimationFrame(tick);
  w.__pad = { state, buttons, rumbles, tap, set, axes: (a: number[]) => { state.axes = a.slice(); state.ts = performance.now(); } };
  addEventListener("DOMContentLoaded", () => { const e = new Event("gamepadconnected") as Event & { gamepad?: unknown }; e.gamepad = pad; dispatchEvent(e); });

  // the pilot: the test bot's intent -> the pad (the game reads only the pad)
  const pilot = { on: false, frames: 0, assisted: 0, lastSlot: 0, bot: null as null | { next(g: unknown): Record<string, number | boolean>; turnRate: number }, slotOf: null as null | ((w: string) => number) };
  w.__pilot = pilot;
  const invCurve = (c: number) => { let m = Math.min(1, c); for (let k = 0; k < 8; k++) { const f = 0.2 * m + 0.8 * m * m * m - c, d = 0.2 + 2.4 * m * m; m = Math.max(0, Math.min(1, m - f / d)); } return m; };
  const stick = (c: number, dz: number) => (Math.abs(c) < 1e-4 ? 0 : Math.sign(c) * (dz + 0.005 + invCurve(Math.min(1, Math.abs(c))) * (0.95 - dz - 0.005)));
  let last = performance.now();
  const fly = () => {
    requestAnimationFrame(fly);
    const now = performance.now(), dt = Math.max(0.008, Math.min(0.1, (now - last) / 1000));
    last = now;
    if (!pilot.on) return;
    const s = w.__session as { game: { phase: string; player: { yaw: number; pitch: number; weapon: { id: string } } }; paused: boolean; hold: boolean; input: { deadZone: number; padSens: number; assistOn: unknown } } | undefined;
    const g = s?.game;
    if (!s || !g || !pilot.bot || s.paused || s.hold || (g.phase !== "play" && g.phase !== "clear")) { state.axes = [0, 0, 0, 0]; set(7, false); return; }
    pilot.frames++;
    if (s.input.assistOn) pilot.assisted++;
    const f = pilot.bot.next(g) as Record<string, number | boolean>;
    // the bot turns at most `max` a step toward its target: a full turn is its turn rate, the last bit of
    // one is closed at half gain a frame (whatever the frame rate); the look rate -> the stick through the
    // curve and the dead zone
    const max = pilot.bot.turnRate / 120;
    const rate = (d: number) => Math.sign(d) * (Math.abs(d) >= max * 0.999 ? pilot.bot!.turnRate : Math.min(pilot.bot!.turnRate, (0.5 * Math.abs(d)) / dt));
    const sens = s.input.padSens, dz = s.input.deadZone;
    state.axes = [f.moveX as number, -(f.moveY as number), -stick(rate((f.yaw as number) - g.player.yaw) / (4 * sens), dz), -stick(rate((f.pitch as number) - g.player.pitch) / (2.75 * sens), dz)];
    state.ts = performance.now();
    set(7, !!f.fire, f.fire ? 0.9 : 0);
    set(6, !!f.zoom, f.zoom ? 1 : 0);
    if (f.dodge) tap(5);
    if (f.bt) tap(11);
    if (f.jump) tap(0);
    if (f.reload) tap(2);
    if (f.copium) tap(12);
    if (f.melee) tap(1);
    if (f.throw) tap(3);
    if (f.interact) tap(13);
    // a slot the bot wants: L1 (next) until it is in hand, at most every 0.4 s
    const want = f.slot as number;
    if (want >= 1 && want <= 5 && pilot.slotOf && pilot.slotOf(g.player.weapon.id) !== want && performance.now() - pilot.lastSlot > 400) { if (tap(4)) pilot.lastSlot = performance.now(); }
  };
  requestAnimationFrame(fly);
};

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
  headless: true,
  userDataDir: profile,
  args: [`--user-data-dir=${profile}`, ...gfx, "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
const log: string[] = [];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let code = 1;
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
const shot = async (page: Page, name: string) => { await page.screenshot({ path: path.join(outDir, `${name}.png`) }); log.push(`SHOT ${name} at ${at()}`); };
const tap = (page: Page, i: number, wait = 250) => page.evaluate(b => (window as unknown as { __pad: { tap(i: number): void } }).__pad.tap(b), i).then(() => sleep(wait));
const ui = (page: Page) => page.evaluate(() => {
  const q = (s: string) => !!document.querySelector(s);
  return q("[data-testid=results]") ? "results" : q("[data-testid=pause]") ? "paused" : q("[data-testid=cutscene]") ? "cutscene" : q("[data-testid=click-to-fight]") ? "prompt" : q("[data-testid=play]") ? "title" : q("[data-testid=tbc]") ? "tbc" : q(".rp-loading") ? "loading" : "play";
});
const until = async (page: Page, ok: () => Promise<boolean>, ms: number, what: string) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await ok()) return; await sleep(250); }
  await shot(page, "x-timeout");
  const load = await page.evaluate(() => document.querySelector(".rp-loading")?.textContent ?? "");
  throw new Error(`timed out: ${what} (screen ${await ui(page)}${load ? `: ${load}` : ""})`);
};
const glyphs = (page: Page) => page.evaluate(() => [...new Set([...document.querySelectorAll(".rp-padg")].map(e => e.getAttribute("title")))].join(", "));

try {
  const page = await browser.newPage();
  page.on("console", m => { if (m.type() === "error" || m.type() === "warn") log.push(`console.${m.type()}: ${m.text()}`); });
  page.on("pageerror", e => log.push(`pageerror: ${(e as Error).message ?? String(e)}`));
  await page.evaluateOnNewDocument(SHIM);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector("[data-testid=play]:not([disabled])", { timeout: 180_000 });
  const pilotReady = page.evaluate(async () => {
    const [{ Bot }, { slotOf }] = await Promise.all([import("/src/sim/bot.ts" as string), import("/src/combat/weapons.ts" as string)]);
    const p = (window as unknown as { __pilot: { bot: unknown; slotOf: unknown } }).__pilot;
    p.bot = new Bot(3.5, 0.3, false);
    p.slotOf = slotOf;
  });
  // the title: d-pad down to DIFFICULTY (the first press: the glyphs switch to the pad's), left to Chill
  await tap(page, 13);
  await tap(page, 14);
  await sleep(400);
  const diff = await page.evaluate(() => localStorage.getItem("radpayne.difficulty"));
  log.push(`TITLE difficulty ${diff}; glyphs: ${await glyphs(page)}`);
  await shot(page, "1-title-ps");
  await pilotReady;
  await tap(page, 0); // Cross: PLAY from any row
  await until(page, async () => (await ui(page)) === "cutscene", 90_000, "cutscene 1");
  await sleep(3500);
  await shot(page, "2-cutscene");
  const p0 = await page.evaluate(() => (document.querySelector("[data-testid=cutscene]") as HTMLElement).dataset.panel);
  await tap(page, 0, 800); // Cross: the next panel
  const p1 = await page.evaluate(() => (document.querySelector("[data-testid=cutscene]") as HTMLElement | null)?.dataset.panel);
  log.push(`CUTSCENE panel ${p0} -> ${p1} on Cross`);
  await tap(page, 1, 500); // Circle: skip the rest
  await until(page, async () => (await ui(page)) === "prompt", 120_000, "the fight prompt");
  await sleep(800);
  await shot(page, "3-prompt");
  await tap(page, 0, 400); // Cross: fight on the pad (no pointer lock)
  const started = await page.evaluate(() => { const s = (window as unknown as { __session: { paused: boolean; bot: unknown } }).__session; return { paused: s.paused, bot: !!s.bot }; });
  log.push(`FIGHT started on Cross: paused ${started.paused}, bot driver ${started.bot}`);
  await page.evaluate(() => { (window as unknown as { __pilot: { on: boolean } }).__pilot.on = true; });

  type St = { phase: string; kills: number; alive: number; hp: number; shots: number; dodges: number; bt: number; ts: number; room: string; paused: boolean };
  const st = () => page.evaluate(() => {
    const s = (window as unknown as { __session?: { game: { phase: string; stats: { kills: number; shots: number; dodges: number; btTime: number }; alive: number; player: { health: number }; timeScale: number }; roomId: string; paused: boolean } }).__session;
    const g = s?.game;
    return g ? { phase: g.phase, kills: g.stats.kills, alive: g.alive, hp: Math.round(g.player.health), shots: g.stats.shots, dodges: g.stats.dodges, bt: Math.round(g.stats.btTime * 10) / 10, ts: g.timeScale, room: s!.roomId, paused: s!.paused } : null;
  }) as Promise<St | null>;
  const fightT0 = Date.now();
  let paused = false, shotHint = false, shotBt = false, shotKc = false, lastLog = 0;
  let end: St | null = null;
  while (Date.now() - fightT0 < MAX_MS) {
    const s = await st();
    const screen = await ui(page);
    if (!s) { await sleep(300); continue; }
    // the next room mounts behind the ending panels: the room's result is its last state
    if (s.room !== "room1") break;
    end = s;
    if (Date.now() - lastLog > 8000) { lastLog = Date.now(); log.push(`FIGHT ${at()} ${JSON.stringify(s)} screen ${screen}`); }
    if (!shotHint && Date.now() - fightT0 > 6000 && await page.evaluate(() => !!document.querySelector(".rp-sub .rp-hint .rp-padg"))) { shotHint = true; await shot(page, "4-hint"); log.push(`HINT glyphs: ${await glyphs(page)}`); }
    if (!shotBt && s.ts < 0.6 && s.phase === "play") { shotBt = true; await shot(page, "5-slowmo"); }
    if (!shotKc && await page.evaluate(() => !!document.querySelector(".rp-kc"))) { shotKc = true; await sleep(300); await shot(page, "6-killcam"); }
    // mid-fight: Options -> the pause menu -> CONTROLS -> Aim assist down and up -> back -> resume
    if (!paused && Date.now() - fightT0 > 22_000 && s.phase === "play" && screen === "play") {
      paused = true;
      await tap(page, 9, 600);
      await until(page, async () => (await ui(page)) === "paused", 5000, "the pause menu on Options");
      await shot(page, "7-pause");
      for (let i = 0; i < 3; i++) await tap(page, 13, 200);
      await tap(page, 0, 500); // CONTROLS
      await shot(page, "8-controls");
      for (let i = 0; i < 4; i++) await tap(page, 13, 200); // to Aim assist
      await tap(page, 14, 300);
      const low = await page.evaluate(() => localStorage.getItem("radpayne.aimAssist"));
      await tap(page, 15, 300);
      const back = await page.evaluate(() => localStorage.getItem("radpayne.aimAssist"));
      log.push(`SETTINGS aim assist on the d-pad: ${low} -> ${back}; list: ${await page.evaluate(() => document.querySelector("[data-testid=pad-controls]")?.textContent?.slice(0, 120) ?? "(none)")}`);
      await tap(page, 1, 300); // Circle: back to the menu column
      await tap(page, 9, 800); // Options: resume
      const after = await st();
      log.push(`RESUME on Options: screen ${await ui(page)}, paused ${after?.paused}`);
      if ((await ui(page)) !== "play" || after?.paused) throw new Error("Options did not resume the fight");
    }
    if (s.phase === "done" || s.phase === "dead" || screen === "results" || screen === "cutscene") break;
    await sleep(300);
  }
  end ??= await st();
  const pilot = await page.evaluate(() => { const p = (window as unknown as { __pilot: { frames: number; assisted: number; on: boolean } }).__pilot; p.on = false; return { frames: p.frames, assisted: p.assisted }; });
  const rumbles = await page.evaluate(() => (window as unknown as { __pad: { rumbles: unknown[] } }).__pad.rumbles.length);
  log.push(`ROOM END ${at()} ${JSON.stringify(end)} screen ${await ui(page)}; pad frames ${pilot.frames}, aim assist on target in ${pilot.assisted}; rumbles ${rumbles}`);
  // the room's end: a skip of the ending panels (Circle), or the results (Circle: title)
  await sleep(1500);
  let screen = await ui(page);
  if (screen === "cutscene") {
    await shot(page, "9-ending");
    await tap(page, 1, 1500);
  }
  await until(page, async () => ["results", "prompt", "play", "title"].includes(await ui(page)), 90_000, "after the room");
  screen = await ui(page);
  if (screen === "results") {
    await shot(page, "9-results");
    await tap(page, 1, 1500); // Circle: title
  } else {
    // the next room: Options (pause) -> QUIT TO TITLE -> Cross -> Cross (yes)
    if (screen === "prompt") { await tap(page, 0, 800); }
    await tap(page, 9, 800);
    await until(page, async () => (await ui(page)) === "paused", 5000, "pause in the next room");
    for (let i = 0; i < 4; i++) await tap(page, 13, 200);
    await tap(page, 0, 400);
    await shot(page, "10-quit-confirm");
    await tap(page, 0, 1500);
  }
  await until(page, async () => (await ui(page)) === "title", 30_000, "back on the title");
  await page.waitForSelector("[data-testid=play]:not([disabled])", { timeout: 60_000 });
  // an Xbox pad: the same title in A / B / X / Y
  await page.evaluate(() => { (window as unknown as { __pad: { state: { id: string } } }).__pad.state.id = "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)"; });
  await tap(page, 13, 300);
  await tap(page, 12, 500);
  log.push(`XBOX glyphs: ${await glyphs(page)}`);
  await shot(page, "11-title-xbox");
  // one key: the keys' prompts are back
  await page.keyboard.press("ArrowDown");
  await sleep(400);
  const keysBack = await page.evaluate(() => document.querySelectorAll(".rp-padg").length === 0 && document.querySelectorAll(".rp-key").length > 0);
  log.push(`KEYS back after a key press: ${keysBack}`);
  await shot(page, "12-title-keys");
  const errors = log.filter(l => l.startsWith("pageerror") || l.startsWith("console.error"));
  code = errors.length || !keysBack || (end?.kills ?? 0) === 0 ? 1 : 0;
} catch (e) {
  log.push(`FAILED: ${(e as Error).stack ?? String(e)}`);
} finally {
  await browser.close();
  console.log(log.join("\n"));
  console.log(code === 0 ? "PAD SMOKE OK" : "PAD SMOKE FAILED");
  process.exit(code);
}
