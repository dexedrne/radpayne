// Headless aim-preview check (his frag held up): opens each room with frags in the pouch, aims where the
// arc shows the most (bounces, a blast 6-18 m out), holds G (the frag comes up: the arc, its bounces and
// the blast ring), shoots it, the same in bullet time, lets go and shoots the frag on its way along the
// arc (the blast ring stays where it goes off); then checks that the frag went off where the preview said
// it would. The gang holds still (the AI off).
//   RADPAYNE_CHROME_PROFILE=<throwaway dir> RADPAYNE_GPU=1 node tools/arcshot.ts <base url> <outDir> [rooms]
//   e.g. node tools/arcshot.ts "http://localhost:4880/" .local/shots/arc room1,room6
// Always a THROWAWAY --user-data-dir; the browser is killed by its PID at the end.
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";

const profile = process.env.RADPAYNE_CHROME_PROFILE;
if (!profile) { console.error("set RADPAYNE_CHROME_PROFILE to a throwaway Chromium profile directory"); process.exit(2); }
const base = process.argv[2];
const outDir = path.resolve(process.argv[3] ?? ".local/shots/arc");
const rooms = (process.argv[4] ?? "room1,room2,room3,room4,room5,room6,room7,room8,room9,room10").split(",");
if (!base) { console.error("usage: node tools/arcshot.ts <base url> [outDir] [rooms]"); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(profile, { recursive: true });
const gpu = process.env.RADPAYNE_GPU === "1";
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
  headless: false,
  userDataDir: profile,
  args: ["--headless=new", `--user-data-dir=${profile}`, ...(gpu ? ["--use-angle=gl", "--use-gl=angle", "--enable-gpu", "--ignore-gpu-blocklist"] : []), "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  defaultViewport: { width: 1280, height: 720 },
});
const pid = browser.process()?.pid;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const log: string[] = [];
let bad = 0;

type Probe = { ok: boolean; up: boolean; n: number; nb: number; far: number; end: number[]; grenades: number; phase: string; frames: number };
const probe = (page: Page) => page.evaluate(() => {
  const s = (window as unknown as { __rp?: { frames: number; session: { game: { player: { nadeUp: boolean; grenades: number; x: number; z: number }; phase: string; fragPreview(): { n: number; nb: number; end: { x: number; y: number; z: number }; bounces: { speed: number }[] } } } } }).__rp;
  if (!s) return { ok: false } as Probe;
  const g = s.session.game, p = g.player, f = g.fragPreview();
  return { ok: true, up: p.nadeUp, n: f.n, nb: f.bounces.slice(0, f.nb).filter(b => b.speed > 1).length, far: Math.hypot(f.end.x - p.x, f.end.z - p.z), end: [f.end.x, f.end.y, f.end.z], grenades: p.grenades, phase: g.phase, frames: s.frames } as Probe;
}) as Promise<Probe>;

try {
  for (const room of rooms) {
    const page = await browser.newPage();
    page.on("console", m => { if (m.type() === "error") log.push(`${room} console.error: ${m.text()}`); });
    page.on("pageerror", e => log.push(`${room} pageerror: ${(e as Error).message ?? String(e)}`));
    const t0 = Date.now();
    await page.goto(`${base}?skip&room=${room}&seed=1&webgl2&grenades=3&still`, { waitUntil: "load" });
    // the room is up (its loading card gone, the HUD on)
    for (let i = 0; i < 600; i++) {
      const up = await page.evaluate(() => !!document.querySelector("[data-testid=hud]") && !!(window as unknown as { __rp?: unknown }).__rp);
      if (up) break;
      await sleep(250);
    }
    await sleep(1500);
    // run the sim (no pointer lock headless) with the gang holding still (the AI off: every room gets its
    // shots, however hot its opening), and settle him
    await page.evaluate(() => { const s = (window as unknown as { __rp: { session: { paused: boolean; game: { aiOn: boolean } } } }).__rp.session; s.game.aiOn = false; s.paused = false; });
    await sleep(800);
    // aim where the preview shows the most: bounces, a blast 6-18 m out
    const yaw0 = await page.evaluate(() => (window as unknown as { __rp: { session: { input: { yaw: number } } } }).__rp.session.input.yaw);
    let best = { score: -1, yaw: yaw0, pitch: -0.1 };
    for (const dy of [-0.5, -0.25, 0, 0.25, 0.5]) for (const pitch of [-0.2, -0.1, 0, 0.1]) {
      await page.evaluate((y, pt) => { const i = (window as unknown as { __rp: { session: { input: { yaw: number; pitch: number } } } }).__rp.session.input; i.yaw = y; i.pitch = pt; }, yaw0 + dy, pitch);
      await sleep(120);
      const pr = await probe(page);
      const score = (pr.far >= 6 && pr.far <= 18 ? 10 : 0) + Math.min(4, pr.nb) * 3 - Math.abs(dy) * 2;
      if (score > best.score) best = { score, yaw: yaw0 + dy, pitch };
    }
    await page.evaluate((y, pt) => { const i = (window as unknown as { __rp: { session: { input: { yaw: number; pitch: number } } } }).__rp.session.input; i.yaw = y; i.pitch = pt; }, best.yaw, best.pitch);
    await sleep(400);
    // hold G: the frag comes up, the arc shows
    await page.keyboard.down("KeyG");
    await sleep(700);
    const held = await probe(page);
    await page.screenshot({ path: path.join(outDir, `${room}-a-held.png`) });
    // bullet time on (Q), still held
    await page.keyboard.press("KeyQ");
    await sleep(900);
    await page.screenshot({ path: path.join(outDir, `${room}-b-held-bt.png`) });
    const pred = await probe(page);
    // let go: it flies the arc (in bullet time: slow, so the shot catches it on the way)
    const before = pred.grenades;
    await page.keyboard.up("KeyG");
    await page.evaluate(() => {
      const w = window as unknown as { __rp: { session: { on(f: (e: { type: string; x: number; y: number; z: number }) => void): () => void } }; __arcBoom?: number[] };
      w.__arcBoom = undefined;
      const off = w.__rp.session.on(e => { if (e.type === "explode") { w.__arcBoom = [e.x, e.y, e.z]; off(); } });
    });
    await sleep(900);
    await page.screenshot({ path: path.join(outDir, `${room}-c-flight.png`) });
    let boom: number[] | undefined;
    for (let i = 0; i < 60 && !boom; i++) { await sleep(250); boom = await page.evaluate(() => (window as unknown as { __arcBoom?: number[] }).__arcBoom); }
    const after = await probe(page);
    const miss = boom ? Math.hypot(boom[0] - pred.end[0], boom[1] - pred.end[1], boom[2] - pred.end[2]) : NaN;
    const ok = held.up && before - after.grenades === 1 && !!boom && miss < 0.05;
    if (!ok) bad++;
    console.log(`${room}: ${ok ? "ok" : "FAIL"} held=${held.up} arc ${held.n} pts, ${held.nb} bounces, blast ${held.far.toFixed(1)} m out; thrown ${before - after.grenades}; went off ${boom ? `${miss.toFixed(3)} m from the preview` : "never"}; ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    await page.close();
  }
} finally {
  for (const l of log) console.log(l);
  await browser.close().catch(() => undefined);
  if (pid) try { process.kill(pid, "SIGKILL"); } catch { /* gone */ }
}
process.exit(bad ? 1 : 0);
