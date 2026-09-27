// Headless check of #4764's katana guard: the blade bot (?bot&blade) plays room 1 as #4764, holds the
// guard in bullet time and sends the rounds back. Shots: the guard held ("guard-<n>"), rounds off the
// blade ("deflect-<n>", "return-<n>"), the RETURN TO SENDER kill cam's ride and X-ray ("rts-ride",
// "rts-xray"), the clear. Prints the guard's events and any console errors.
//   RADPAYNE_CHROME_PROFILE=<throwaway dir> node tools/katanasmoke.ts [url] [outDir]
//   RADPAYNE_GPU=1   the machine's GPU through ANGLE/GL (add &webgl2 to the url); default SwiftShader
// Always a THROWAWAY --user-data-dir (required; never a real profile).
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const profile = process.env.RADPAYNE_CHROME_PROFILE;
if (!profile) {
  console.error("set RADPAYNE_CHROME_PROFILE to a throwaway Chromium profile directory");
  process.exit(2);
}
const url = process.argv[2] ?? "http://localhost:4880/?bot&blade&radbro=4764&seed=1&q=low";
const outDir = path.resolve(process.argv[3] ?? ".local/shots/katana");
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
type Probe = { room: string; phase: string; t: number; hp: number; guard: boolean; guardT: number; meter: number; bt: boolean; kills: number; alive: number;
  ev: Array<{ type: string; what?: string; returned?: boolean; perfect?: boolean; first?: boolean; weapon?: string }>; cine: { phase: string; kind: string; tag: string; t: number; flight: number } } | null;
let code = 1;
try {
  const page = await browser.newPage();
  page.on("console", m => log.push(`console.${m.type()}: ${m.text()}`));
  page.on("pageerror", e => log.push(`pageerror: ${(e as Error).message ?? String(e)}`));
  page.on("response", r => { if (r.status() >= 400) log.push(`http ${r.status()}: ${r.url()}`); });
  const t0 = Date.now();
  const shot = async (name: string) => { await page.screenshot({ path: path.join(outDir, `${name}.png`) }); log.push(`SHOT ${name} at ${((Date.now() - t0) / 1000).toFixed(1)} s`); };
  await page.goto(url, { waitUntil: "load" });
  const counts: Record<string, number> = {};
  let room = "", guardShots = 0, deflectShots = 0, returnShots = 0, lastGuardShot = 0, lastLog = 0;
  const done = new Set<string>();
  const maxMs = Number(process.env.RADPAYNE_MAX_S ?? 240) * 1000;
  while (Date.now() - t0 < maxMs) {
    const s = (await page.evaluate(() => {
      type G = { phase: string; realTime: number; player: { health: number; guard: boolean; guardT: number; guardMeter: number }; bulletTime: boolean; stats: { kills: number }; alive: number };
      type S = { game: G; roomId: string; on(fn: (e: { type: string }) => void): () => void };
      const w = window as unknown as { __rp?: { session: S; cine: { phase: string; kind: string; tag: string; t: number; flight: number } }; __kev?: unknown[]; __kfor?: S };
      const rp = w.__rp;
      if (!rp) return null;
      // this session's guard events into a list (a new room's session gets its own listener)
      if (w.__kfor !== rp.session) {
        w.__kfor = rp.session;
        w.__kev = w.__kev ?? [];
        rp.session.on(e => { if (e.type === "deflect" || e.type === "guard" || (e.type === "kill")) w.__kev!.push({ ...e }); });
      }
      const ev = (w.__kev ?? []).splice(0) as never[];
      const g = rp.session.game, p = g.player;
      return { room: rp.session.roomId, phase: g.phase, t: g.realTime, hp: p.health, guard: p.guard, guardT: p.guardT, meter: p.guardMeter, bt: g.bulletTime, kills: g.stats.kills, alive: g.alive, ev, cine: rp.cine };
    })) as Probe;
    if (!s) { await sleep(200); continue; }
    if (!room) room = s.room;
    if (s.room !== room) { log.push(`ROOM ${s.room}: stop`); break; }
    for (const e of s.ev) {
      const k = e.type === "deflect" ? (e.returned ? "returned" : "glanced") + (e.perfect ? "+parry" : "") : e.type === "guard" ? `guard-${e.what}` : `kill-${e.weapon ?? "?"}`;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    const nd = s.ev.filter(e => e.type === "deflect" && e.first !== false);
    if (nd.length) {
      const back = nd.some(e => e.returned);
      if (back && returnShots < 3) { await shot(`return-${++returnShots}`); await sleep(250); await shot(`return-${returnShots}b`); }
      else if (!back && deflectShots < 3) await shot(`deflect-${++deflectShots}`);
    }
    if (s.guard && s.guardT > 0.2 && guardShots < 4 && Date.now() - lastGuardShot > 2500) { lastGuardShot = Date.now(); await shot(`guard-${++guardShots}`); }
    const c = s.cine;
    if (c.kind === "return" || c.tag === "RETURN TO SENDER") {
      if (c.phase === "flight" && c.t > c.flight * 0.45 && !done.has("ride")) { done.add("ride"); await shot("rts-ride"); }
      if (c.phase === "xray" && c.t > c.flight + 0.2 && !done.has("xray")) { done.add("xray"); await shot("rts-xray"); }
    }
    if (Date.now() - lastLog > 10_000) { lastLog = Date.now(); console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)} s: t ${s.t.toFixed(1)} ${s.phase} hp ${s.hp.toFixed(0)} kills ${s.kills} alive ${s.alive} bt ${s.bt} guard ${s.guard} meter ${s.meter.toFixed(0)} ${JSON.stringify(counts)}`); }
    if (s.phase === "clear" || s.phase === "done") { await sleep(1500); await shot("clear"); code = 0; break; }
    if (s.phase === "dead") { await shot("dead"); break; }
    await sleep(80);
  }
  log.push(`GUARD ${JSON.stringify(counts)}`);
  if (!counts.returned) { log.push("no round went back"); code = 1; }
} finally {
  await browser.close();
}
const errors = log.filter(l => l.startsWith("pageerror") || l.startsWith("console.error"));
for (const l of log) if (!l.startsWith("console.debug") && !l.startsWith("console.log") && !l.startsWith("console.info")) console.log(l);
console.log(`${errors.length} error line(s); ${code === 0 ? "ROOM CLEAR" : "NOT CLEARED"}`);
process.exit(code);
