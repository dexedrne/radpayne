// Headless smoke run (spec section 9): opens the dev / test build with ?bot, lets the bot clear the
// room in real time, saves screenshots (start, fight, bullet time with bullets in flight, kill cam,
// results) and prints console errors. Optional extras: the title -> cutscene 1 path (a comic panel
// shot) and a wide shot of the street.
//   RADPAYNE_CHROME_PROFILE=<throwaway dir> node tools/smoke.ts [url] [outDir]
//   RADPAYNE_GPU=1       use the machine's GPU through ANGLE/GL (add &webgl2 to the url); default SwiftShader
//   RADPAYNE_CUTSCENE=1  first play the title -> cutscene path and shoot a panel
//   RADPAYNE_WIDE=<cam>  finally hold the camera on a level camera marker and shoot the street
// Always launches Chromium with a THROWAWAY --user-data-dir (required; never a real profile).
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const profile = process.env.RADPAYNE_CHROME_PROFILE;
if (!profile) {
  console.error("set RADPAYNE_CHROME_PROFILE to a throwaway Chromium profile directory");
  process.exit(2);
}
const url = process.argv[2] ?? "http://localhost:4880/?bot&seed=1&q=low";
const outDir = path.resolve(process.argv[3] ?? ".local/shots/smoke");
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(profile, { recursive: true });
const gpu = process.env.RADPAYNE_GPU === "1";
const gfx = gpu
  ? ["--use-angle=gl", "--use-gl=angle", "--enable-gpu", "--ignore-gpu-blocklist"]
  : ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader"];

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
  headless: true,
  userDataDir: profile,
  args: [`--user-data-dir=${profile}`, ...gfx, "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
const log: string[] = [];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
type State = { phase: string; t: number; hp: number; kills: number; alive: number; ts: number; mode: string; fps: number; screen: string; proj: number; dodges: number; bt: number } | null;
let code = 1;
try {
  const page = await browser.newPage();
  page.on("console", m => log.push(`console.${m.type()}: ${m.text()}`));
  page.on("pageerror", e => log.push(`pageerror: ${(e as Error).message ?? String(e)}`));
  page.on("response", r => { if (r.status() >= 400) log.push(`http ${r.status()}: ${r.url()}`); });
  const t0 = Date.now();
  const shots = new Set<string>();
  const shot = async (name: string) => {
    if (shots.has(name)) return;
    shots.add(name);
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
    log.push(`SHOT ${name} at ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  };

  if (process.env.RADPAYNE_CUTSCENE === "1") {
    const u = new URL(url);
    const title = `${u.origin}/?seed=1${u.searchParams.has("webgl2") ? "&webgl2" : ""}${u.searchParams.has("q") ? `&q=${u.searchParams.get("q")}` : ""}`;
    await page.goto(title, { waitUntil: "load" });
    await page.waitForSelector("[data-testid=play]:not([disabled])", { timeout: 120_000 });
    await shot("0-title");
    await page.click("[data-testid=play]");
    await page.waitForSelector("[data-testid=cutscene]", { timeout: 60_000 });
    await sleep(4500);
    await shot("0-cutscene-1");
    await page.keyboard.press("Space");
    await sleep(3000);
    await shot("0-cutscene-2");
    await page.keyboard.press("Escape");
    await sleep(1500);
    await shot("0-after-cutscene");
  }

  await page.goto(url, { waitUntil: "load" });
  let last: State = null;
  let fightAt = 0;
  let lastLog = 0;
  let slowShots = 0;
  while (Date.now() - t0 < 300_000) {
    last = (await page.evaluate(() => {
      type G = { phase: string; realTime: number; player: { health: number; mode: string }; stats: { kills: number; dodges: number; btTime: number }; alive: number; timeScale: number; projectiles: unknown[] };
      const rp = (window as unknown as { __rp?: { session: { game: G }; fps: number } }).__rp;
      const g = rp?.session.game;
      const scr = document.querySelector("[data-testid=results]") ? "results" : "";
      return g ? { phase: g.phase, t: g.realTime, hp: g.player.health, kills: g.stats.kills, alive: g.alive, ts: g.timeScale, mode: g.player.mode, fps: rp!.fps, screen: scr, proj: g.projectiles.length, dodges: g.stats.dodges, bt: g.stats.btTime } : null;
    })) as State;
    if (last && Date.now() - lastLog > 10_000) { lastLog = Date.now(); console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)} s: ${JSON.stringify(last)}`); }
    if (last) {
      if (last.t > 0.5) await shot("1-start");
      if (last.kills >= 1 && !fightAt) fightAt = Date.now();
      if (fightAt && Date.now() - fightAt > 1500) await shot("2-fight");
      if (last.ts < 0.99 && last.phase === "play" && last.proj >= 1 && slowShots < 3) { const n = `3-slowmo-${slowShots + 1}`; if (!shots.has(n)) { await shot(n); slowShots++; await sleep(700); } }
      if (last.mode === "dive") await shot("3-dive");
      if (last.phase === "killcam") { await sleep(150); await shot("4-killcam"); }
      if (last.phase === "clear") { await sleep(800); await shot("4b-clear"); }
      if (last.screen === "results") { await sleep(400); await shot("5-results"); code = 0; break; }
      if (last.phase === "dead") { await sleep(1500); await shot("5-dead"); break; }
    }
    await sleep(100);
  }
  log.push(`STATE ${JSON.stringify(last)} after ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const wide = process.env.RADPAYNE_WIDE;
  if (wide) {
    const u = new URL(url);
    await page.goto(`${u.origin}/?skip&seed=1&cam=${wide}${u.searchParams.has("webgl2") ? "&webgl2" : ""}`, { waitUntil: "load" });
    await sleep(12_000);
    await shot(`6-wide-${wide}`);
  }
} finally {
  await browser.close();
}
const errors = log.filter(l => l.startsWith("pageerror") || l.startsWith("console.error"));
for (const l of log) if (!l.startsWith("console.debug")) console.log(l);
console.log(`${errors.length} error line(s); result ${code === 0 ? "ROOM CLEAR" : "NOT CLEARED"}`);
process.exit(code);
