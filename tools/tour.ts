// Headless arsenal tour (the arsenal's browser check): opens the dev build with ?bot&tour for one room,
// lets the bot fight it on the new guns (src/app/dev/tour.ts keeps it on each in turn), then walks the
// room's secrets and eggs once it is clear, and shoots every moment the page queues (the first shot with
// each gun, a melee, a grenade, the scope, a drop picked up, each secret / door / egg), the start and the
// results. Prints console errors.
//   RADPAYNE_CHROME_PROFILE=<throwaway dir> node tools/tour.ts <url> <outDir>   (RADPAYNE_ONE_ROOM=1: the first room only)
//   e.g. node tools/tour.ts "http://localhost:4880/?bot&tour&seed=1&webgl2&room=room1&loadout=handcannon,sawedoff,rifle&grenades=3" .local/shots/tour1
// Always a THROWAWAY --user-data-dir; the browser is killed by its PID at the end. GPU through ANGLE/GL.
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const profile = process.env.RADPAYNE_CHROME_PROFILE;
if (!profile) { console.error("set RADPAYNE_CHROME_PROFILE to a throwaway Chromium profile directory"); process.exit(2); }
const url = process.argv[2];
const outDir = path.resolve(process.argv[3] ?? ".local/shots/tour");
if (!url) { console.error("usage: node tools/tour.ts <url> [outDir]"); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(profile, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
  headless: true,
  userDataDir: profile,
  args: [`--user-data-dir=${profile}`, "--use-angle=gl", "--use-gl=angle", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
const pid = browser.process()?.pid;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const log: string[] = [];
let code = 1;
try {
  const page = await browser.newPage();
  page.on("console", m => { if (m.type() === "error" || m.type() === "warn") log.push(`console.${m.type()}: ${m.text()}`); });
  page.on("pageerror", e => log.push(`pageerror: ${(e as Error).message ?? String(e)}`));
  page.on("response", r => { if (r.status() >= 400) log.push(`http ${r.status()}: ${r.url()}`); });
  const t0 = Date.now();
  const shot = async (name: string) => {
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
    log.push(`SHOT ${name} at ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  };
  await page.goto(url, { waitUntil: "load" });
  let started = false, lastLog = 0, firstRoom = "";
  const maxMs = Number(process.env.RADPAYNE_MAX_S ?? 420) * 1000;
  while (Date.now() - t0 < maxMs) {
    const st = (await page.evaluate(() => {
      const w = window as unknown as { __rp?: { session: { game: { phase: string; realTime: number; alive: number; player: { health: number; weapon: { id: string }; grenades: number }; found: string[]; stats: { kills: number } } } }; __tour?: { queue: Array<{ name: string; at: number }>; step: number; done: boolean } };
      const g = w.__rp?.session.game;
      const now = performance.now();
      const q = w.__tour?.queue ?? [];
      const due = q.filter(x => x.at <= now).map(x => x.name);
      if (w.__tour) w.__tour.queue = q.filter(x => x.at > now);
      const room = (w.__rp?.session as unknown as { roomId?: string } | undefined)?.roomId ?? "";
      return g ? { room, phase: g.phase, t: g.realTime, alive: g.alive, hp: g.player.health, gun: g.player.weapon.id, nades: g.player.grenades, found: g.found.length, kills: g.stats.kills, step: w.__tour?.step ?? -1, done: !!w.__tour?.done, due, results: !!document.querySelector("[data-testid=results]") } : null;
    })) as { room: string; phase: string; t: number; alive: number; hp: number; gun: string; nades: number; found: number; kills: number; step: number; done: boolean; due: string[]; results: boolean } | null;
    if (!st) { await sleep(300); continue; }
    if (!started && st.t > 1.5) { started = true; await shot("0-start"); }
    for (const n of st.due) await shot(n);
    if (Date.now() - lastLog > 10_000) { lastLog = Date.now(); console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)} s: ${JSON.stringify({ ...st, due: undefined })}`); }
    if (st.results) { await sleep(500); await shot("9-results"); code = 0; break; }
    // RADPAYNE_ONE_ROOM=1: stop when the chain moves on to the next room
    firstRoom ||= st.room;
    if (process.env.RADPAYNE_ONE_ROOM === "1" && st.room && st.room !== firstRoom) { code = 0; break; }
    if (st.phase === "dead") { await sleep(1200); await shot("9-dead"); break; }
    await sleep(100);
  }
  const tl = (await page.evaluate(() => (window as unknown as { __tour?: { log: string[] } }).__tour?.log ?? [])) as string[];
  log.push(`TOUR ${tl.length}: ${tl.join(", ")}`);
} finally {
  await browser.close().catch(() => undefined);
  if (pid) try { process.kill(pid, "SIGKILL"); } catch { /* gone */ }
}
const errors = log.filter(l => l.startsWith("pageerror") || l.startsWith("console.error"));
for (const l of log) console.log(l);
console.log(`${errors.length} error line(s); ${code === 0 ? "RESULTS" : "NO RESULTS"}`);
process.exit(code);
