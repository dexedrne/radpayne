// The long-gun hold check (arsenal spec 1.7): for every Radbro and long gun, open the dev build with
// ?holdcheck=<gun>&radbro=<id>, walk the scripted player through each state, freeze it, and
//   - read the per-frame measures (grip error, left palm to the rail, hand bend, elbow flips),
//   - count the gun's visible pixels from the gameplay camera (the gun drawn flat magenta inside its
//     screen box; the Radbro still covers it) and whether the muzzle end shows,
//   - save a gameplay-camera shot and a close-up from his left side per state:
//     .local/shots/hold/<rig>-<gun>-<state>-<view>.png
// then print a pass / fail table. Needs the dev server up.
//   RADPAYNE_CHROME_PROFILE=<throwaway dir> node tools/holdcheck.ts [baseUrl] [rigs] [guns] [states]
//   e.g. node tools/holdcheck.ts http://localhost:4880 652,250 shotgun idle,walk,dive
//   #4764's katana guard and cut (named, not in the default list): ... 4764 pistols guard,slash
// Always a THROWAWAY --user-data-dir; the browser is killed by its PID at the end. GPU through ANGLE/GL
// (RADPAYNE_GPU=0 for SwiftShader).
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";

const profile = process.env.RADPAYNE_CHROME_PROFILE;
if (!profile) {
  console.error("set RADPAYNE_CHROME_PROFILE to a throwaway Chromium profile directory");
  process.exit(2);
}
const base = process.argv[2] ?? "http://localhost:4880";
const RIGS = (process.argv[3] ?? "652,4764,2564,723,3171,250").split(",");
const GUNS = (process.argv[4] ?? "shotgun,ak").split(",");
const ALL_STATES = ["idle", "aim-up", "aim-down", "turn", "walk", "back", "strafe-l", "strafe-r", "run", "fire", "bt", "reload", "reload-2", "jump", "dive", "prone", "getup", "roll", "swap"];
const STATES = process.argv[5] ? process.argv[5].split(",") : ALL_STATES;
const VIEWS = (process.env.RADPAYNE_HOLD_VIEWS ?? "game,side").split(",");
const outDir = path.resolve(".local/shots/hold");
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(profile, { recursive: true });
const gpu = process.env.RADPAYNE_GPU !== "0";
const gfx = gpu
  ? ["--use-angle=gl", "--use-gl=angle", "--enable-gpu", "--ignore-gpu-blocklist"]
  : ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader"];

/** Seconds into a state when it freezes for the shots (the script's own clock, 120 Hz steps). */
const FREEZE: Record<string, number> = {
  idle: 1.2, "aim-up": 1.0, "aim-down": 1.0, turn: 1.0, walk: 1.3, back: 1.3, "strafe-l": 1.1, "strafe-r": 1.1, run: 1.2,
  fire: 0.12, bt: 0.5, reload: 0.55, "reload-2": 1.25, jump: 0.3, dive: 0.42, prone: 1.7, getup: 0.35, roll: 1.35, swap: 1.25,
  guard: 0.6, slash: 0.2,
};
/** The script state each check state runs. */
const SCRIPT: Record<string, string> = { "reload-2": "reload" };
/** Acceptance (spec 1.7): grip < 0.3 cm, left palm < 1.5 cm, bend < 60 deg, no flips; pixels at rest (a
 *  one-handed gun: 600 with the arm out). */
const AIMED = new Set(["fire", "bt", "dive", "prone"]);
const LIMIT = { grip: 0.003, left: 0.015, bend: (60 * Math.PI) / 180, aimedPx: 1200, readyPx: 2000, oneHandPx: 600 };
/** The one-handed guns' states with the arm out (the reload lowers the gun on purpose). */
const ONE_HAND_OUT = new Set(["idle", "walk", "fire", "bt"]);

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
  headless: true,
  userDataDir: profile,
  args: [`--user-data-dir=${profile}`, ...gfx, "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1280, height: 720 },
});
const pid = browser.process()?.pid;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
type Stats = { frames: number; grip: number; left: number; bend: number; flips: number; reach: number; slide: number; shift: number };
type Row = { rig: string; gun: string; state: string; stats: Stats | null; px: number; muzzle: boolean; ready: number };
const rows: Row[] = [];
const errors: string[] = [];

async function hc<T>(page: Page, fn: string): Promise<T> {
  return (await page.evaluate(`(() => { const h = window.__holdcheck; return ${fn}; })()`)) as T;
}

/** Magenta pixels inside the gun's screen box, and whether the muzzle's 9x9 window has any. */
async function countMask(page: Page): Promise<{ px: number; muzzle: boolean }> {
  const b64 = (await page.screenshot({ encoding: "base64" })) as string;
  return (await page.evaluate(async (data: string) => {
    const h = (window as unknown as { __holdcheck: { box: number[]; muzzle: number[]; muzzleOnScreen: boolean } }).__holdcheck;
    const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const [x0, y0, x1, y1] = h.box.map((v, i) => Math.max(0, Math.min(i % 2 ? bmp.height - 1 : bmp.width - 1, v)));
    const w = x1 - x0 + 1, hh = y1 - y0 + 1;
    if (w < 2 || hh < 2) return { px: 0, muzzle: false };
    const d = ctx.getImageData(x0, y0, w, hh).data;
    const mag = (i: number) => d[i] > 140 && d[i + 2] > 140 && d[i + 1] < 0.45 * Math.min(d[i], d[i + 2]);
    let px = 0;
    for (let i = 0; i < d.length; i += 4) if (mag(i)) px++;
    let muzzle = false;
    if (h.muzzleOnScreen) {
      const [mx, my] = h.muzzle;
      for (let y = my - 4; y <= my + 4 && !muzzle; y++) for (let x = mx - 4; x <= mx + 4; x++) {
        if (x < x0 || y < y0 || x > x1 || y > y1) continue;
        if (mag(((y - y0) * w + (x - x0)) * 4)) { muzzle = true; break; }
      }
    }
    return { px, muzzle };
  }, b64)) as { px: number; muzzle: boolean };
}

try {
  const page = await browser.newPage();
  page.on("pageerror", e => errors.push(`pageerror: ${(e as Error).message ?? String(e)}`));
  page.on("console", m => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });
  for (const rig of RIGS) {
    for (const gun of GUNS) {
      const url = `${base}/?holdcheck=${gun}&radbro=${rig}&seed=1&milady=0${gpu ? "&webgl2" : ""}`;
      await page.goto(url, { waitUntil: "load" });
      await page.addStyleTag({ content: ".rp-hc-mask * { filter: none !important; } .rp-hc-mask .rp-fxl { display: none !important; }" });
      // in play, the Radbro built, a few frames rendered
      let ready = false;
      for (let i = 0; i < 240 && !ready; i++) {
        await sleep(500);
        ready = (await page.evaluate(() => {
          const w = window as unknown as { __rp?: { session: { game: { phase: string } }; frames: number }; __holdcheck?: { session: unknown } };
          return !!w.__holdcheck?.session && w.__rp?.session.game.phase === "play" && !document.querySelector("[data-testid=play]") && document.body.innerText.indexOf("LOADING") < 0;
        })) as boolean;
      }
      if (!ready) { errors.push(`${rig} ${gun}: never reached play`); continue; }
      await sleep(2500);
      for (const state of STATES) {
        const script = SCRIPT[state] ?? state;
        // every state starts on his feet, except the get-up (from prone)
        const mode = () => page.evaluate(`window.__rp.session.game.player.mode`) as Promise<string>;
        await page.evaluate(`window.__holdcheck.set("idle", -1)`);
        for (let i = 0; i < 60 && (await mode()) !== "normal"; i++) await sleep(100);
        await page.evaluate(`window.__holdcheck.home()`);
        await sleep(800);
        if (state === "getup") {
          await page.evaluate(`window.__holdcheck.set("prone", -1)`);
          for (let i = 0; i < 60 && (await mode()) !== "prone"; i++) await sleep(100);
          await sleep(500);
        }
        await page.evaluate(`window.__holdcheck.reset(); window.__holdcheck.set(${JSON.stringify(script)}, ${FREEZE[state] ?? 1})`);
        for (let i = 0; i < 100 && !(await hc<boolean>(page, "h.frozen")); i++) await sleep(50);
        await sleep(250);
        const stats = await hc<Stats | null>(page, `h.stats[${JSON.stringify(script)}] ?? null`);
        const readyW = await hc<number>(page, "h.last.ready");
        let px = 0, muzzle = false;
        for (const view of VIEWS) {
          await page.evaluate(`window.__holdcheck.view = ${JSON.stringify(view)}`);
          await sleep(220);
          await page.screenshot({ path: path.join(outDir, `${rig}-${gun}-${state}-${view}.png`) });
          if (view === "game") {
            // the count reads flat magenta: the canvas grade (bullet time's sepia, low-health
            // desaturation) and the screen overlays (grain, speed rays) come off for it
            await page.evaluate(`window.__holdcheck.mask = true; document.body.classList.add("rp-hc-mask")`);
            await sleep(150);
            ({ px, muzzle } = await countMask(page));
            await page.evaluate(`window.__holdcheck.mask = false; document.body.classList.remove("rp-hc-mask")`);
          }
        }
        await page.evaluate(`window.__holdcheck.view = "game"; window.__holdcheck.unfreeze()`);
        rows.push({ rig, gun, state, stats, px, muzzle, ready: readyW });
        const f = (v: number | undefined, k = 100) => (v === undefined ? "  -  " : (v * k).toFixed(2).padStart(6));
        console.log(`${rig.padEnd(5)} ${gun.padEnd(8)} ${state.padEnd(9)} grip ${f(stats?.grip)} cm  left ${f(stats?.left)} cm  bend ${f(stats?.bend, 180 / Math.PI)} deg  flips ${String(stats?.flips ?? "-").padStart(3)}  slide ${f(stats?.slide)} cm  shift ${f(stats?.shift)} cm  px ${String(px).padStart(5)} ${muzzle ? "muzzle" : "      "} ready ${readyW.toFixed(2)}`);
      }
    }
  }
} finally {
  await browser.close().catch(() => undefined);
  if (pid) try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
}

// verdicts
let fails = 0;
for (const r of rows) {
  const s = r.stats;
  const why: string[] = [];
  if (!s) why.push("no frames");
  else {
    if (s.grip > LIMIT.grip) why.push(`grip ${(s.grip * 100).toFixed(2)} cm`);
    if (s.left > LIMIT.left) why.push(`left ${(s.left * 100).toFixed(2)} cm`);
    if (s.bend > LIMIT.bend) why.push(`bend ${((s.bend * 180) / Math.PI).toFixed(0)} deg`);
    if (s.flips > 0) why.push(`${s.flips} elbow flips`);
  }
  // the pixel targets: the long guns' at rest and shouldered; the one-handed guns' with the arm out (they
  // must not read as a pistol-sized speck)
  const long = r.gun === "shotgun" || r.gun === "ak" || r.gun === "rifle" || r.gun === "sniper";
  const oneHand = r.gun === "handcannon" || r.gun === "sawedoff";
  if (oneHand && ONE_HAND_OUT.has(r.state) && r.px < LIMIT.oneHandPx) why.push(`one-handed ${r.px} px`);
  if (long && r.state === "idle" && r.px < LIMIT.readyPx) why.push(`ready ${r.px} px`);
  // shouldered: shooting, in bullet time, in the dive and prone
  if (long && AIMED.has(r.state) && r.px < LIMIT.aimedPx) why.push(`aimed ${r.px} px`);
  if (why.length) { fails++; console.log(`FAIL ${r.rig} ${r.gun} ${r.state}: ${why.join(", ")}`); }
}
const muzzles = rows.filter(r => r.muzzle).length;
console.log(`${rows.length} states, ${fails} failing; muzzle end visible in ${muzzles}/${rows.length} (${rows.length ? Math.round((100 * muzzles) / rows.length) : 0} %)`);
for (const e of errors) console.log(e);
fs.writeFileSync(path.join(outDir, "holdcheck.json"), JSON.stringify(rows, null, 1));
process.exit(fails || errors.length ? 1 : 0);
