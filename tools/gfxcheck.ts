// Graphics-switch check: in a running room, switch the graphics preset through every level and back
// (LOW -> MEDIUM -> HIGH -> CINEMATIC -> HIGH -> MEDIUM -> LOW) from the pause menu, then all of them in
// one burst, and from the title (room 1: QUIT TO TITLE, pick the preset there, PLAY), and after each
// switch assert that the characters are still drawn and posed: every actor (him, the gang, the heavies
// and bosses, the rave's crowd) drawn before is drawn after and not as her stand-in, each of its visible
// skinned meshes has a bone matrix per bone (finite, and not every bone on the bind pose), the room
// renders again (the render gate opens, frames go on) and the page logs no error (nor a WebGL / WebGPU
// complaint). Low's lighter scene shows every other crowd girl (12 at most): the crowd only has to keep
// that many. A skinned mesh out of the camera's view is culled (src/app/cull.ts): its bone matrices are
// not computed, so it counts as drawn and posed (the dev probe's window.__inView). Saves a shot after each switch and prints how long the picture held.
//   RADPAYNE_CHROME_PROFILE=<throwaway dir> RADPAYNE_GPU=1|webgpu node tools/gfxcheck.ts [url] [outDir] [rooms]
//   url    the dev server (default http://localhost:4880/?seed=1); ?game=retardiopayne for RetardioPayne,
//          &webgl2 with RADPAYNE_GPU=1
//   rooms  room ids, comma separated (default room1)
// Exits 1 when a switch broke a model (each failure is printed).
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const profile = process.env.RADPAYNE_CHROME_PROFILE;
if (!profile) {
  console.error("set RADPAYNE_CHROME_PROFILE to a throwaway Chromium profile directory");
  process.exit(2);
}
const base = new URL(process.argv[2] ?? "http://localhost:4880/?seed=1");
const outDir = path.resolve(process.argv[3] ?? ".local/shots/gfx");
const rooms = (process.argv[4] ?? "room1").split(",").filter(Boolean);
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(profile, { recursive: true });
const gpu = process.env.RADPAYNE_GPU === "1";
const webgpu = process.env.RADPAYNE_GPU === "webgpu";
const flags = webgpu
  ? ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-vulkan=native", "--use-angle=vulkan", "--enable-gpu", "--ignore-gpu-blocklist"]
  : gpu
  ? ["--use-angle=gl", "--use-gl=angle", "--enable-gpu", "--ignore-gpu-blocklist"]
  : ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader"];

/** The presets as the pause menu and the title name them, every level up and back down. */
const LEVELS = [["low", "LOW", "LOW"], ["medium", "MEDIUM", "MED"], ["high", "HIGH", "HIGH"], ["cinematic", "CINEMATIC", "CINEMA"]] as const;
const CYCLE = [0, 1, 2, 3, 2, 1, 0].map(i => LEVELS[i]);

/** Low's crowd: every other girl, 12 at most (CrowdView). */
const LOW_CROWD = 12;

/** Per actor: skinned meshes (all, drawn, posed, without usable bone matrices) and whether its stand-in
 *  (standIn.ts: the plain figure a model replaces) is what is drawn. */
type Actor = { meshes: number; drawn: number; posed: number; bad: number; standIn: boolean; culled: number };
type Probe = { actors: Record<string, Actor>; frames: number; gate: boolean; gfx: string; phase: string; room: string; screen: string };

/** In the page: the actors and their skinned meshes (dev probes: window.__scene, window.__rp). It also
 *  keeps the fight still (the sim paused, the room still drawn): a resume can take the pointer lock, and
 *  a boss does not wait for the check. */
function probe(): Probe | null {
  const w = window as unknown as { __inView?: (o: unknown) => boolean; __scene?: { traverse(f: (o: never) => void): void }; __rp?: { frames: number; gate?: boolean; gfx?: string; session: { roomId: string; paused: boolean; game: { phase: string } } } };
  if (!w.__scene || !w.__rp) return null;
  type O = { name: string; visible: boolean; parent: O | null; isMesh?: boolean; isSkinnedMesh?: boolean; skeleton?: { bones: unknown[]; boneMatrices: Float32Array | null } };
  const actors: Record<string, Actor> = {};
  const shown = (o: O) => { for (let p: O | null = o; p; p = p.parent) if (!p.visible) return false; return true; };
  w.__scene.traverse((o: O) => {
    if (!o.isMesh) return;
    let a: O | null = o;
    while (a && !/^(radbro|goon|crowd)-/.test(a.name)) a = a.parent;
    if (!a) return;
    const e = (actors[a.name] ??= { meshes: 0, drawn: 0, posed: 0, bad: 0, standIn: false, culled: 0 });
    if (!o.isSkinnedMesh) { if (o.name === "head" && shown(o)) e.standIn = true; return; }
    e.meshes++;
    if (!shown(o)) return;
    e.drawn++;
    // out of the camera's view the renderer culls her (cull.ts): never drawn, her skin's bone matrices are
    // not computed; she counts as drawn and posed (her pose is checked once she is in view)
    if (w.__inView && !w.__inView(o)) { e.culled++; e.posed++; return; }
    const bm = o.skeleton?.boneMatrices;
    if (!bm || bm.length !== (o.skeleton?.bones.length ?? 0) * 16) { e.bad++; return; }
    let finite = true, moved = false;
    for (let i = 0; i < bm.length; i++) {
      if (!Number.isFinite(bm[i])) { finite = false; break; }
      if (i >= 16 && Math.abs(bm[i] - bm[i % 16]) > 1e-3) moved = true; // every bone on the bind pose: one matrix
    }
    if (!finite) e.bad++;
    else if (moved) e.posed++;
  });
  const screen = document.querySelector("[data-testid=pause]") ? "paused" : document.querySelector("[data-testid=cutscene]") ? "cutscene"
    : document.querySelector("[data-testid=title-graphics]") ? "title" : document.querySelector("[data-testid=hud]") ? "play" : "other";
  const rp = w.__rp;
  rp.session.paused = true;
  return { actors, frames: rp.frames, gate: !!rp.gate, gfx: rp.gfx ?? "", phase: rp.session.game.phase, room: rp.session.roomId, screen };
}

const kind = (name: string) => name.split("-")[0];
const summary = (p: Probe) => {
  const by: Record<string, { n: number; drawn: number; posed: number; culled: number }> = {};
  for (const [name, a] of Object.entries(p.actors)) {
    const k = (by[kind(name)] ??= { n: 0, drawn: 0, posed: 0, culled: 0 });
    if (!a.drawn) continue;
    k.n++;
    k.drawn += a.drawn;
    k.posed += a.posed;
    k.culled += a.culled;
  }
  return Object.entries(by).map(([k, v]) => `${k} ${v.n} (${v.posed}/${v.drawn} posed${v.culled ? `, ${v.culled} out of view` : ""})`).join(", ");
};

/** What broke between the baseline and now (lite: Low's every-other crowd girl). */
function compare(before: Probe, now: Probe, lite: boolean): string[] {
  const out: string[] = [];
  let crowd0 = 0, crowd1 = 0;
  for (const [name, a] of Object.entries(before.actors)) {
    if (!a.drawn) continue;
    const b = now.actors[name];
    if (kind(name) === "crowd") { crowd0++; if (b?.drawn && b.posed === b.drawn && !b.bad) crowd1++; continue; }
    if (!b) out.push(`${name}: gone from the scene`);
    else if (b.standIn) out.push(`${name}: her stand-in is drawn instead of her model`);
    else if (!b.drawn) out.push(`${name}: not drawn (${b.meshes} skinned meshes, all hidden)`);
    else if (b.drawn < a.drawn) out.push(`${name}: ${b.drawn} of its ${a.drawn} skinned meshes drawn`);
    else if (b.bad) out.push(`${name}: ${b.bad} skinned meshes without bone matrices`);
    else if (b.posed < b.drawn) out.push(`${name}: ${b.drawn - b.posed} skinned meshes in the bind pose`);
  }
  for (const [name, b] of Object.entries(now.actors)) if (b.drawn && (b.bad || b.posed < b.drawn) && !before.actors[name]?.drawn) out.push(`${name}: drawn unposed`);
  if (crowd0 && crowd1 < (lite ? Math.min(LOW_CROWD, Math.floor(crowd0 / 2)) : crowd0)) out.push(`crowd: ${crowd1} of ${crowd0} girls drawn and posed`);
  if (now.gate) out.push("the room's render is still held");
  if (now.frames <= before.frames) out.push("no frames since the switch");
  return out;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
  headless: true,
  userDataDir: profile,
  args: [`--user-data-dir=${profile}`, ...flags, "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required", ...(process.env.RADPAYNE_NO_SANDBOX === "1" ? ["--no-sandbox"] : [])],
  defaultViewport: { width: 1280, height: 720 },
});
const failures: string[] = [];
const errors: string[] = [];
try {
  const page = await browser.newPage();
  // errors, and the GPU's own complaints (WebGL / WebGPU validation come as warnings; an empty draw is not one)
  page.on("console", m => {
    const t = m.text();
    if (m.type() === "error" || (m.type() === "warn" && /WebGL|GL_INVALID|WebGPU|Invalid|uniformBlock/i.test(t) && !/index count of 0/.test(t))) errors.push(`console.${m.type()}: ${t}`);
  });
  page.on("pageerror", e => errors.push(`pageerror: ${(e as Error).message ?? String(e)}`));
  const look = () => page.evaluate(probe) as Promise<Probe | null>;
  const waitFor = async (ok: (p: Probe) => boolean, ms: number, what: string) => {
    const t = Date.now();
    for (;;) {
      const p = await look();
      if (p && ok(p)) return p;
      if (process.env.RADPAYNE_GFX_LOG) console.log(`    ${what}: ${p ? `${p.screen} ${p.phase} gate ${p.gate} ${p.gfx} · ${summary(p)}` : "no probe"}`);
      if (Date.now() - t > ms) throw new Error(`timed out waiting for ${what} (${JSON.stringify(p && { ...p, actors: summary(p) })})`);
      if (p?.screen === "cutscene") await page.keyboard.press("Escape");
      await sleep(250);
    }
  };
  /** The room on screen, its render open, its gang mounted (the counts hold for a second). */
  const settle = async (what: string) => {
    let p = await waitFor(q => q.screen === "play" && q.phase === "play" && !q.gate, 180_000, what);
    const t = Date.now();
    for (let last = "", same = 0; same < 4 && Date.now() - t < 20_000;) {
      await sleep(500);
      p = (await look())!;
      const s = summary(p);
      same = s === last ? same + 1 : 0;
      last = s;
      if (process.env.RADPAYNE_GFX_LOG) console.log(`    ${what}: ${s} (${p.screen} ${p.phase} gate ${p.gate})`);
    }
    return p;
  };
  /** Seconds from the last switch (resumed) until the room was drawn again; -1: not measured. */
  let held = -1;
  /** After a switch: the warm-up it started (if any) done and some frames drawn. */
  const after = async (from: Probe, preset: string, what: string) => {
    const t = Date.now();
    const p = await waitFor(q => q.gfx === preset && !q.gate && q.frames > from.frames + 30, 60_000, what).catch(e => { failures.push(`${what}: ${(e as Error).message}`); return null; });
    held = (Date.now() - t) / 1000;
    await sleep(600);
    return p ? (await look())! : null;
  };
  const clickText = (scope: string, text: string) => page.evaluate((scope, text) => {
    const b = [...document.querySelectorAll<HTMLButtonElement>(`${scope} button`)].find(x => x.textContent?.trim() === text);
    b?.click();
    return !!b;
  }, scope, text);
  const check = async (before: Probe, now: Probe | null, preset: string, what: string, shot: string) => {
    await page.screenshot({ path: path.join(outDir, `${shot}.png`) });
    if (!now) return;
    const bad = compare(before, now, preset === "low");
    console.log(`  ${what}: ${bad.length ? "FAIL" : "ok"} · ${summary(now)}${held >= 0 ? ` · drawn again after ${held.toFixed(1)} s` : ""}`);
    held = -1;
    for (const b of bad) failures.push(`${what}: ${b}`);
  };
  const game = base.searchParams.get("game") ?? "radpayne";

  for (const room of rooms) {
    const u = new URL(base);
    u.searchParams.set("room", room);
    u.searchParams.set("skip", "");
    u.searchParams.set("still", "");
    u.searchParams.set("gfx", "high"); // the baseline (a pick in the menus is saved and wins after this load)
    await page.goto(u.toString().replace(/=(?=&|$)/g, ""), { waitUntil: "load" });
    const t0 = Date.now();
    const start = await settle(`${room} to start`);
    console.log(`${game} ${room}: ready in ${((Date.now() - t0) / 1000).toFixed(1)} s · ${summary(start)}`);
    await page.screenshot({ path: path.join(outDir, `${game}-${room}-0-start.png`) });
    let n = 1;
    // the pause menu (P), every level and back; resume after each (the probe keeps the sim paused, so
    // the room holds still between the switches)
    for (const [preset, label] of CYCLE) {
      await page.keyboard.press("KeyP");
      await page.waitForSelector("[data-testid=settings]", { timeout: 10_000 });
      const from = (await look())!;
      if (!(await clickText("[data-testid=settings]", label))) failures.push(`${room} pause ${label}: no such button`);
      await sleep(300);
      await page.click("[data-testid=resume]");
      const what = `${room} pause -> ${preset}`;
      await check(start, await after(from, preset, what), preset, what, `${game}-${room}-${n++}-pause-${preset}`);
    }
    // clicked through in one go (comparing them), then back to the game at once
    {
      await page.keyboard.press("KeyP");
      await page.waitForSelector("[data-testid=settings]", { timeout: 10_000 });
      const from = (await look())!;
      for (const [, label] of [...CYCLE, ...CYCLE]) { await clickText("[data-testid=settings]", label); await sleep(120); }
      await clickText("[data-testid=settings]", "CINEMATIC");
      await page.click("[data-testid=resume]");
      const what = `${room} pause -> every level in a burst -> cinematic`;
      await check(start, await after(from, "cinematic", what), "cinematic", what, `${game}-${room}-${n++}-burst-cinematic`);
    }
    // the title (room 1 idles behind it): QUIT TO TITLE, the preset on the title, PLAY
    if (room === "room1") {
      for (const [preset, , short] of CYCLE) {
        await page.keyboard.press("KeyP");
        await page.click("[data-testid=pause-quit]");
        await sleep(150);
        await page.click("[data-testid=pause-quit]");
        await page.waitForSelector("[data-testid=title-graphics]", { timeout: 30_000 });
        if (!(await clickText("[data-testid=title-graphics]", short))) failures.push(`title ${short}: no such button`);
        await sleep(400);
        await page.waitForSelector("[data-testid=play]:not([disabled])", { timeout: 120_000 });
        await page.click("[data-testid=play]");
        const what = `${room} title -> ${preset}`;
        const now = await settle(what).catch(e => { failures.push(`${what}: ${(e as Error).message}`); return null; });
        await check(start, now, preset, what, `${game}-${room}-${n++}-title-${preset}`);
      }
    }
  }
} catch (e) {
  failures.push(`check stopped: ${(e as Error).message ?? String(e)}`);
} finally {
  await browser.close();
}
// the GPU complaints, each once (a failed warm-up logs one per pipeline)
const seen = new Map<string, number>();
for (const e of errors) { const k = e.replace(/\([^)]*\)/g, "(...)").slice(0, 240); seen.set(k, (seen.get(k) ?? 0) + 1); }
for (const [e, n] of seen) failures.push(n > 1 ? `${e} (x${n})` : e);
const code = failures.length ? 1 : 0;
for (const f of failures) console.log(`FAIL ${f}`);
console.log(code ? `${failures.length} failure(s)` : "every switch kept the models");
process.exit(code);
