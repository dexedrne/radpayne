// Headless smoke run (spec section 9): opens the dev / test build with ?bot, lets the bot clear the
// room in real time, saves screenshots (start, fight, kill cam, results) and prints console errors.
//   RADPAYNE_CHROME_PROFILE=<throwaway dir> node tools/smoke.ts [url] [outDir]
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

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
  headless: true,
  userDataDir: profile,
  args: [`--user-data-dir=${profile}`, "--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader", "--window-size=960,540", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 960, height: 540 },
});
const log: string[] = [];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
type State = { phase: string; t: number; hp: number; kills: number; alive: number; ts: number; mode: string; fps: number; screen: string; models: number } | null;
let code = 1;
try {
  const page = await browser.newPage();
  page.on("console", m => log.push(`console.${m.type()}: ${m.text()}`));
  page.on("pageerror", e => log.push(`pageerror: ${(e as Error).message ?? String(e)}`));
  page.on("response", r => { if (r.status() >= 400) log.push(`http ${r.status()}: ${r.url()}`); });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "load" });
  const shots = new Set<string>();
  const shot = async (name: string) => {
    if (shots.has(name)) return;
    shots.add(name);
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
    log.push(`SHOT ${name} at ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  };
  let last: State = null;
  let fightAt = 0;
  let lastLog = 0;
  while (Date.now() - t0 < 180_000) {
    last = (await page.evaluate(() => {
      const rp = (window as unknown as { __rp?: { session: { game: { phase: string; realTime: number; player: { health: number; mode: string }; stats: { kills: number }; alive: number; timeScale: number } }; fps: number } }).__rp;
      const g = rp?.session.game;
      const scr = document.querySelector("[data-testid=results]") ? "results" : "";
      const models = document.querySelectorAll("canvas").length;
      return g ? { frames: (rp as unknown as { frames: number }).frames, phase: g.phase, t: g.realTime, hp: g.player.health, kills: g.stats.kills, alive: g.alive, ts: g.timeScale, mode: g.player.mode, fps: rp!.fps, screen: scr, models } : null;
    })) as State;
    if (last && Date.now() - lastLog > 10_000) { lastLog = Date.now(); console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)} s: ${JSON.stringify(last)}`); }
    if (last) {
      if (last.t > 0.5) await shot("1-start");
      if (last.kills >= 1 && !fightAt) fightAt = Date.now();
      if (fightAt && Date.now() - fightAt > 1500) await shot("2-fight");
      if (last.ts < 0.99 && last.phase === "play") await shot("3-slowmo");
      if (last.phase === "killcam") { await sleep(250); await shot("4-killcam"); }
      if (last.screen === "results") { await sleep(400); await shot("5-results"); code = 0; break; }
      if (last.phase === "dead") { await sleep(1500); await shot("5-dead"); break; }
    }
    await sleep(100);
  }
  log.push(`STATE ${JSON.stringify(last)} after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} finally {
  await browser.close();
}
const errors = log.filter(l => l.startsWith("pageerror") || l.startsWith("console.error"));
for (const l of log) if (!l.startsWith("console.debug")) console.log(l);
console.log(`${errors.length} error line(s); result ${code === 0 ? "ROOM CLEAR" : "NOT CLEARED"}`);
process.exit(code);
