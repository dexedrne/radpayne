// How fast the game loads and runs on a tablet or a weak machine, measured in headless Chromium: a cold first
// visit through the title (PLAY, cutscene 1 skipped at once, the room's "click to fight" prompt: the first
// playable moment), what was downloaded before each step (by kind), then the frame times of the bot playing
// the rave (room 2: the dancing crowd, the lasers, then the fight and the crowd running) on the same page.
// The profile is new each run: a first visit's empty cache. The load wants a production build (vite preview); the frames want a test build (npm run build:test: ?bot
// and ?room are dev / test only), so a run is usually two invocations, --load-only on the one and
// --fps-only on the other.
//   npm run build && npx vite preview --port <p> --strictPort &
//   RADPAYNE_CHROME_PROFILE=<throwaway dir> RADPAYNE_GPU=webgpu node tools/perf.ts <baseUrl> --ipad --load-only
//   npm run build:test && npx vite preview --port <p> --strictPort &
//   RADPAYNE_CHROME_PROFILE=<throwaway dir> RADPAYNE_GPU=webgpu node tools/perf.ts <baseUrl> --ipad --fps-only
//   --ipad            an iPad (10th generation) as near as Chromium gets: a 1080x810 screen at 2 pixels a
//                     point, touch (5 points), the iPad's own user agent (--ua=mac: the Mac one an iPad sends
//                     when it asks for the desktop site, which only the touch points tell from a Mac), the
//                     WebGL renderer "Apple GPU", the CPU throttled 4x unless --cpu says. What it cannot
//                     emulate: WebKit itself and the A14's GPU (this machine's draws the frames: the draws,
//                     triangles and canvas pixels are printed instead)
//   --cpu=4 --mbit=30 --rtt=40   the throttles (--cpu=1 --mbit=0: none)
//   --gfx=low|medium|high|cinematic   the graphics preset saved before the visit (default: none saved, what
//                     a new player gets)
//   --fps=20          seconds of the rave's frames (0: none)
//   --room=room2      the room the frames are taken in
//   --game=retardiopayne   RetardioPayne (a test build's ?game=; a production build is whichever it was built as)
//   --size=1920x1080  the window (CSS pixels; --ipad: 1080x810)
//   --files           every file downloaded before the prompt, the biggest first
//   --profile         the frames' main-thread time by function (self and inclusive; readable on a build made
//                     with --minify false)
// RADPAYNE_GPU=webgpu: the GPU through WebGPU (the default renderer); 1: WebGL2 (add --webgl2); none:
// SwiftShader (very slow). Always a THROWAWAY --user-data-dir (required; never a real profile).
// The Radbro models are Draco-compressed and the engine fetches its decoder from a CDN; those requests are
// answered with three.js's own copy of the decoder (no network, not throttled). The Pockit models come from
// their CDN through the throttled network.
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type CDPSession, type Page } from "puppeteer-core";

const profile = process.env.RADPAYNE_CHROME_PROFILE;
if (!profile) {
  console.error("set RADPAYNE_CHROME_PROFILE to a throwaway Chromium profile directory");
  process.exit(2);
}
const argv = process.argv.slice(2);
const base = (argv.find(a => !a.startsWith("--")) ?? "http://localhost:4881/").replace(/\/?$/, "/");
const flag = (k: string, d = ""): string => argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? (argv.includes(`--${k}`) ? "1" : d);
const ipad = flag("ipad") === "1";
const cpu = Number(flag("cpu", ipad ? "4" : "1"));
const mbit = Number(flag("mbit", "30"));
const rtt = Number(flag("rtt", "40"));
const gfx = flag("gfx");
const fpsSecs = Number(flag("fps", "20"));
const fpsOnly = flag("fps-only") === "1";
const loadOnly = flag("load-only") === "1";
const webgl2 = flag("webgl2") === "1";
const room = flag("room", "room2");
const game = flag("game");
const [winW, winH] = flag("size", ipad ? "1080x810" : "1920x1080").split("x").map(Number);
const IPAD_UA = flag("ua") === "mac"
  ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15"
  : "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.122 Mobile/15E148 Safari/604.1";
const draco = path.resolve(import.meta.dirname, "..", "node_modules", "three", "examples", "jsm", "libs", "draco");
const gpuMode = process.env.RADPAYNE_GPU;
const gpuFlags = gpuMode === "webgpu"
  ? ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-vulkan=native", "--use-angle=vulkan", "--enable-gpu", "--ignore-gpu-blocklist"]
  : gpuMode === "1"
  ? ["--use-angle=gl", "--use-gl=angle", "--enable-gpu", "--ignore-gpu-blocklist"]
  : ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader"];

fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(profile, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
  headless: true,
  userDataDir: profile,
  args: ["--headless=new", `--user-data-dir=${profile}`, ...gpuFlags, `--window-size=${winW},${winH}`, "--autoplay-policy=no-user-gesture-required", ...(process.env.RADPAYNE_NO_SANDBOX === "1" ? ["--no-sandbox"] : [])],
  defaultViewport: ipad ? { width: winW, height: winH, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: winW, height: winH, deviceScaleFactor: 1 },
  protocolTimeout: 600_000,
});

/** Saved before the visit (the preset), what WebKit on an iPad shows the page, and the frame clock. */
function pageSetup(o: { gfx: string; ipad: boolean }): void {
  const w = window as unknown as Record<string, unknown>;
  const perf = { marks: {} as Record<string, number>, frames: null as number[] | null, lt: [] as Array<[number, number]> };
  w.__perf = perf;
  const PRESET: Record<string, unknown> = {
    low: { bloom: "off", reflections: "off", rain: "light", res: 75, msaa: true, lite: true },
    medium: { bloom: "subtle", reflections: "off", rain: "thin", res: 100, msaa: true, lite: false },
    high: { bloom: "subtle", reflections: "soft", rain: "thin", res: 100, msaa: true, lite: false },
    cinematic: { bloom: "original", reflections: "sharp", rain: "thin", res: 100, msaa: true, lite: false },
  };
  try {
    if (!sessionStorage.getItem("perf.init")) {
      sessionStorage.setItem("perf.init", "1");
      if (o.gfx && PRESET[o.gfx]) localStorage.setItem("radpayne.gfx", JSON.stringify(PRESET[o.gfx]));
      // no tutorial voice lines in the way, no first-run hints
      localStorage.setItem("radpayne.tutHeard", "1");
    }
  } catch { /* none */ }
  if (o.ipad) {
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const get = C.prototype.getParameter;
      C.prototype.getParameter = function (this: WebGLRenderingContext, p: number) {
        if (p === 0x9246) return "Apple GPU";
        if (p === 0x9245) return "Apple Inc.";
        return get.call(this, p);
      } as typeof get;
    }
  }
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) perf.lt.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true }); } catch { /* none */ }
  let last = 0;
  const tick = (now: number) => {
    if (perf.frames && last) perf.frames.push(now - last);
    last = now;
    const m = perf.marks;
    if (m.title === undefined) {
      const b = document.querySelector<HTMLButtonElement>("[data-testid=play]");
      if (b && !b.disabled) m.title = performance.now();
    }
    if (m.play !== undefined && m.playable === undefined && document.querySelector("[data-testid=click-to-fight]") && !document.querySelector(".rp-loading")) m.playable = performance.now();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

type Req = { url: string; t1: number; bytes: number; done: boolean };
const kindOf = (u: string): string => {
  const p = new URL(u).pathname.toLowerCase();
  if (/\.(m?js)$/.test(p)) return "js";
  if (p.endsWith(".wasm")) return "wasm";
  if (/\.(glb|gltf|bin)$/.test(p)) return "glb";
  if (p.endsWith(".vrm")) return "pockit";
  if (/\.(webp|png|jpe?g|ktx2|avif)$/.test(p)) return "images";
  if (/\.(mp3|ogg|wav|m4a|opus)$/.test(p)) return "audio";
  if (/\.(woff2?|ttf|otf)$/.test(p)) return "fonts";
  if (p.endsWith(".json")) return "json";
  return "doc";
};

async function throttle(cdp: CDPSession, net: boolean): Promise<void> {
  // (a first visit is a fresh profile: an empty cache, but a cache: the page's own preloads fill it for the
  // asset runtime's later asks)
  await cdp.send("Network.emulateNetworkConditions", net && mbit > 0
    ? { offline: false, latency: rtt, downloadThroughput: (mbit * 1e6) / 8, uploadThroughput: (10 * 1e6) / 8 }
    : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: Math.max(1, cpu) });
  if (ipad) {
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await cdp.send("Emulation.setUserAgentOverride", { userAgent: IPAD_UA, platform: flag("ua") === "mac" ? "MacIntel" : "iPad" });
  }
}

async function answerDraco(cdp: CDPSession): Promise<void> {
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*gstatic.com/draco/*" }] });
  cdp.on("Fetch.requestPaused", (e: { requestId: string; request: { url: string } }) => {
    const name = e.request.url.split("/").pop() ?? "";
    const f = path.join(draco, name);
    if (!fs.existsSync(f)) { void cdp.send("Fetch.failRequest", { requestId: e.requestId, errorReason: "Failed" }); return; }
    void cdp.send("Fetch.fulfillRequest", {
      requestId: e.requestId, responseCode: 200, body: fs.readFileSync(f).toString("base64"),
      responseHeaders: [{ name: "content-type", value: name.endsWith(".wasm") ? "application/wasm" : "text/javascript" }, { name: "access-control-allow-origin", value: "*" }],
    });
  });
}

const until = async (page: Page, js: string, ms: number): Promise<boolean> => {
  try { await page.waitForFunction(js, { timeout: ms, polling: 250 }); return true; } catch { return false; }
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const r1 = (x: number) => Math.round(x * 10) / 10;

const page = await browser.newPage();
const cdp = await page.createCDPSession();
const errors: string[] = [];
const info: string[] = [];
page.on("pageerror", e => errors.push(`pageerror: ${(e as Error).message ?? String(e)}`));
page.on("console", m => {
  const t = m.text();
  if (m.type() === "error") errors.push(`console.error: ${t.slice(0, 200)}`);
  else if (/\[radpayne\] (renderer|room1: ready|room1: held|room2: ready)|\[warm\] shaders room|\[gfx\]/.test(t)) info.push(t.slice(0, 200));
});
await cdp.send("Network.enable");
await answerDraco(cdp);
await throttle(cdp, true);
const reqs = new Map<string, Req>();
let docT = 0;
cdp.on("Network.requestWillBeSent", (e: { requestId: string; request: { url: string }; timestamp: number; type?: string }) => {
  if (!docT && e.type === "Document") docT = e.timestamp;
  if (!e.request.url.startsWith("http")) return;
  reqs.set(e.requestId, { url: e.request.url, t1: 0, bytes: 0, done: false });
});
cdp.on("Network.loadingFinished", (e: { requestId: string; timestamp: number; encodedDataLength: number }) => {
  const r = reqs.get(e.requestId);
  if (r) { r.t1 = e.timestamp; r.bytes = e.encodedDataLength; r.done = true; }
});
cdp.on("Network.loadingFailed", (e: { requestId: string; timestamp: number }) => {
  const r = reqs.get(e.requestId);
  if (r) { r.t1 = e.timestamp; r.done = true; }
});
await page.evaluateOnNewDocument(pageSetup, { gfx, ipad });

const q = (extra: string[]) => {
  const p = [...(webgl2 ? ["webgl2"] : []), ...(game ? [`game=${game}`] : []), ...extra];
  return p.length ? `?${p.join("&")}` : "";
};

/** The first visit (throttles on, the cache off): the title, PLAY, cutscene 1 skipped, the prompt. */
async function measureLoad(): Promise<Record<string, unknown>> {
  const prof = flag("profile") === "1";
  if (prof) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 1000 }); await cdp.send("Profiler.start"); }
  // (seed 1: the same gang every run, so the same Pockit models to download)
  await page.goto(`${base}${q(["seed=1"])}`, { waitUntil: "domcontentloaded" });
  if (!(await until(page, "window.__perf.marks.title !== undefined", 120_000))) errors.push("the title's PLAY never came on");
  await page.evaluate("window.__perf.marks.play = performance.now()");
  await page.click("[data-testid=play]");
  if (await until(page, "!!document.querySelector('[data-testid=cutscene]') || !!document.querySelector('[data-testid=click-to-fight]')", 120_000)) {
    if (await page.$("[data-testid=cutscene]")) { await sleep(300); await page.keyboard.press("Escape"); }
  } else errors.push("no cutscene and no prompt after PLAY");
  if (!(await until(page, "window.__perf.marks.playable !== undefined", 240_000))) errors.push("no fight prompt in 240 s");
  // the rest of what the page asks for meanwhile (until nothing is in flight for 3 s, at most 30 s more)
  const t0 = Date.now();
  let quiet = 0;
  while (Date.now() - t0 < 30_000 && quiet < 3000) {
    await sleep(250);
    quiet = [...reqs.values()].some(r => !r.done) ? 0 : quiet + 250;
  }
  const profile = prof ? summarize(((await cdp.send("Profiler.stop")) as unknown as { profile: Profile }).profile) : undefined;
  const perf = (await page.evaluate("window.__perf")) as { marks: Record<string, number>; lt: Array<[number, number]> };
  const canvas = await page.evaluate("(() => { const c = document.querySelector('canvas'); return c ? [c.width, c.height] : null; })()");
  const origin = docT * 1000;
  const at = (r: Req) => (r.t1 ? r.t1 * 1000 - origin : Infinity);
  const bytes = (to: number) => {
    const out: Record<string, number> = {};
    let n = 0;
    for (const r of reqs.values()) {
      if (!r.done || at(r) > to) continue;
      const k = kindOf(r.url);
      out[k] = (out[k] ?? 0) + r.bytes;
      n += r.bytes;
    }
    return { total: n, ...Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1])) };
  };
  const mb = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v / 1e4) / 100]));
  const m = perf.marks;
  const lts = perf.lt.filter(([s]) => s >= (m.play ?? 0) && s <= (m.playable ?? Infinity));
  return {
    titleMs: Math.round(m.title ?? -1),
    playableMs: Math.round(m.playable ?? -1),
    playToPlayableMs: Math.round((m.playable ?? NaN) - (m.play ?? NaN)),
    mbToTitle: mb(bytes(m.title ?? 0)),
    mbToPlayable: mb(bytes(m.playable ?? 0)),
    mbByIdle: mb(bytes(Infinity)),
    requestsToPlayable: [...reqs.values()].filter(r => at(r) <= (m.playable ?? 0)).length,
    longTasksPlayToPlayable: { ms: Math.round(lts.reduce((a, [, d]) => a + d, 0)), count: lts.length, max: Math.round(Math.max(0, ...lts.map(([, d]) => d))) },
    canvas,
    ...(profile ? { profile } : {}),
    ...(flag("files") === "1" ? { files: [...reqs.values()].filter(r => r.done && at(r) <= (m.playable ?? 0)).sort((a, b) => b.bytes - a.bytes).slice(0, 60).map(r => `${Math.round(r.bytes / 1024)} kB ${Math.round(at(r))} ms ${new URL(r.url).pathname}`) } : {}),
  };
}

/** The bot in the rave (a test build): its frames once the room is in and settled. */
async function measureFps(): Promise<Record<string, unknown>> {
  await throttle(cdp, false);
  await page.goto(`${base}${q(["bot", `room=${room}`, "seed=1"])}`, { waitUntil: "domcontentloaded" });
  const ok = await until(page, "window.__rp && window.__rp.session && window.__rp.session.roomId === " + JSON.stringify(room) + " && window.__rp.session.game.realTime > 0.5", 300_000);
  if (!ok) { errors.push(`the bot never started ${room}`); return {}; }
  await page.evaluate("window.__perf.frames = []; window.__perf.lt = []");
  const prof = flag("profile") === "1";
  if (prof) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); await cdp.send("Profiler.start"); }
  const gs: Array<{ calls: number; triangles: number; crowd: number; skinned: number }> = [];
  for (let t = 0; t < fpsSecs * 1000; t += 500) {
    await sleep(500);
    const g = (await page.evaluate(`(() => {
      const gl = window.__gl, sc = window.__scene;
      const r = gl && gl.info && gl.info.render;
      let crowd = 0, skinned = 0;
      if (sc) sc.traverse(o => { if (o.isSkinnedMesh) { let v = true; for (let p = o; p; p = p.parent) if (!p.visible) { v = false; break; } if (v) { skinned++; for (let p = o; p; p = p.parent) if (/^crowd-/.test(p.name)) { crowd++; break; } } } });
      return { calls: r ? (r.drawCalls ?? r.calls ?? 0) : 0, triangles: r ? r.triangles ?? 0 : 0, crowd, skinned };
    })()`)) as { calls: number; triangles: number; crowd: number; skinned: number };
    gs.push(g);
  }
  const profile = prof ? summarize(((await cdp.send("Profiler.stop")) as unknown as { profile: Profile }).profile) : undefined;
  const r = (await page.evaluate("({ f: window.__perf.frames, lt: window.__perf.lt, phase: window.__rp.session.game.phase, t: window.__rp.session.game.realTime, gfx: window.__rp.gfx, canvas: (() => { const c = document.querySelector('canvas'); return c ? [c.width, c.height] : null; })() })")) as { f: number[]; lt: Array<[number, number]>; phase: string; t: number; gfx: string; canvas: [number, number] | null };
  const f = [...r.f].sort((a, b) => a - b);
  const pct = (p: number) => r1(f[Math.min(f.length - 1, Math.floor(p * f.length))] ?? NaN);
  const sum = r.f.reduce((a, b) => a + b, 0);
  const avg = (k: "calls" | "triangles" | "crowd" | "skinned") => Math.round(gs.reduce((a, g) => a + g[k], 0) / Math.max(1, gs.length));
  return {
    gfx: r.gfx, canvas: r.canvas, phase: r.phase, simT: r1(r.t),
    fps: r1((r.f.length * 1000) / Math.max(1, sum)), frameMs: { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: r1(f[f.length - 1] ?? NaN) },
    fpsP50: r1(1000 / pct(0.5)), fpsP95: r1(1000 / pct(0.95)),
    over50ms: r.f.filter(x => x > 50).length, longTaskMs: Math.round(r.lt.reduce((a, [, d]) => a + d, 0)),
    drawn: { calls: avg("calls"), triangles: avg("triangles"), skinnedShown: avg("skinned"), crowdShown: avg("crowd") },
    ...(profile ? { profile } : {}),
  };
}

type PNode = { id: number; callFrame: { functionName: string; url: string; lineNumber?: number }; children?: number[] };
type Profile = { nodes: PNode[]; startTime: number; endTime: number; samples: number[]; timeDeltas: number[] };
/** Self and inclusive time per function (ms), the top of each, and the share the page was busy. */
function summarize(p: Profile): Record<string, unknown> {
  const byId = new Map(p.nodes.map(n => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const self = new Map<string, number>(), incl = new Map<string, number>();
  const key = (n: PNode) => `${n.callFrame.functionName || "(anon)"} ${(n.callFrame.url.split("/").pop() ?? "").replace(/\?.*$/, "")}:${(n.callFrame.lineNumber ?? 0) + 1}`;
  let idle = 0, total = 0;
  for (let i = 0; i < p.samples.length; i++) {
    const dt = (p.timeDeltas[i + 1] ?? 0) / 1000;
    total += dt;
    const leaf = byId.get(p.samples[i])!;
    if (leaf.callFrame.functionName === "(idle)") { idle += dt; continue; }
    self.set(key(leaf), (self.get(key(leaf)) ?? 0) + dt);
    const seen = new Set<string>();
    for (let id: number | undefined = p.samples[i]; id !== undefined; id = parent.get(id)) {
      const n = byId.get(id)!;
      if (!n.callFrame.functionName || n.callFrame.functionName.startsWith("(")) continue;
      const k = key(n);
      if (seen.has(k)) continue;
      seen.add(k);
      incl.set(k, (incl.get(k) ?? 0) + dt);
    }
  }
  const top = (m: Map<string, number>, n: number) => Object.fromEntries([...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, Math.round(v)]));
  return { busyPct: Math.round(100 - (100 * idle) / Math.max(1, total)), self: top(self, 30), inclusive: top(incl, 45) };
}

const load = fpsOnly ? null : await measureLoad();
const fps = loadOnly || fpsSecs <= 0 ? null : await measureFps();
const out = { base, size: `${winW}x${winH}`, ipad: ipad ? (flag("ua") === "mac" ? "mac ua + touch" : "ipad ua") : false, cpu, mbit, rtt, gfx: gfx || "(new player)", gpu: gpuMode ?? "swiftshader", webgl2, load, fps, info: info.slice(0, 12), errors: errors.slice(0, 12) };
console.log(JSON.stringify(out, null, 1));
await browser.close();
