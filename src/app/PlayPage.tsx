// The game page: TITLE (the room idles behind it) -> LOADING (the picked Radbro) -> CUTSCENE 1 (first
// play only) -> PLAY -> the ENDING cutscene (e1: the first time the room is cleared, after the kill cam
// and the walk to the club door) -> RESULTS (room clear or rugged) -> retry / title. One canvas, mounted once;
// retries swap the Game inside the session. Pointer lock lost = pause. The fight starts from the
// "click to fight" prompt: a click, Enter or Space takes the pointer lock (mouse play); gamepad A or
// Start plays without it (the right stick aims), and a later click on the game switches to the mouse.
// Round 2: a cleared room with a `next` room goes on: its cutscene (room.cutsceneAfter; room 1's is the
// e1 ending panels), then the next room's session replaces this one in the same canvas (the room is a
// checkpoint: dying there retries that room, with the guns, rounds and frags he walked in with). The
// swap happens behind the cutscene's panels as soon as the next level is read, so that room gets ready
// there. The results come at the end of the chain, or when the next room's level file does not exist
// yet ("to be continued").
// Dev / test builds: ?bot plays the room by itself (smoke test), ?room=<id> picks a level file,
// ?seed=N fixes the seed, ?skip skips the title and the cutscene, ?radbro=<id> picks the Radbro,
// ?holdcheck=<weapon> runs the long-gun hold check (dev/holdcheck.ts: no gang, a scripted player).
// Loading (the load audit): the title needs only the page and the level; PLAY is live at once.
// The room's shaders are compiled off the critical frame (look/compile.ts) while the title is up: the
// room does not render until they are (the title sits on the dark page, the street fades in). The
// Radbro files load behind the title, the gang's Pockit downloads start as the level is read, the sounds
// load in order (cutscene 1's lines, room 1, the fight loop; rooms 2-3 once room 1 runs) and the rave's
// clip pack after room 1 starts. A room gets ready (readyRoom: the Radbro, the gang that is there from
// the start, their shaders, the sounds) under the cutscene before it when there is one; its start
// (holdRoom) waits behind the loading card, with the progress, only for what is not done by then.
import { useCallback, useEffect, useRef, useState } from "react";
import { Session } from "./session.ts";
import { Scene } from "./Scene.tsx";
import { assetsRef, loadManifest, manifestFor, loadOptional, gunClipsPath, r2ClipsPath, MILADY_CLIPS, MILADY_R2 } from "./characters.ts";
import { assetExists, assetUrl } from "./assets.ts";
import { goonSlots } from "../sim/game.ts";
import { cachedPockits, pickPockits } from "../vrm/pockit.ts";
import { warmLook } from "./look/compile.ts";
import { useGfx } from "./look/gfx.ts";
import { scenePending } from "./Scene.tsx";
import { readLevel } from "../world/level.ts";
import { baseWeaponOf, useUi, type RadbroId } from "../ui/store.ts";
import { WEAPONS } from "../combat/weapons.ts";
import { Hud, canvasFx } from "../ui/Hud.tsx";
import { UiEffects } from "../ui/hud/UiEffects.tsx";
import { FightPrompt, Loading, Pause, ResultsScreen, Title, layer } from "../ui/screens.tsx";
import { Cutscene, loadCutscene, prefetchCutscene, type CutsceneData } from "../ui/Cutscene.tsx";
import { attachDom } from "../input/input.ts";
import { setMuted, unlockAudio } from "../audio/engine.ts";
import { groupReady, loadEndSamples, loadLaterSamples, loadSamples, setFootsteps, setHeartbeat, setMusic, setMusicGate, stopNarration, stopRoomAudio } from "../audio/sfx.ts";
import { Bot } from "../sim/bot.ts";
import type { WeaponId } from "../combat/weapons.ts";
import { frames, prefetchGoons, roomWarm, warmRoom } from "./warmup.ts";
import { renderGate } from "./frame.ts";
import { HOLDCHECK, HoldScript, holdDev } from "./dev/holdcheck.ts";
import { TOUR, TourDriver } from "./dev/tour.ts";
import { RADBROS } from "../ui/store.ts";
import { roomText } from "../ui/rooms.ts";
import { bridge, roomResult } from "../radbro/bridge.ts";
import { BossBar } from "../ui/hud/BossBar.tsx";
import { MADAME } from "../sim/tuning.ts";
import type { Stats } from "../sim/game.ts";

const DEV = import.meta.env.MODE !== "production";
const params = new URLSearchParams(location.search);
const BOT = DEV && params.has("bot");
/** ?bot=demo: the bot shows off bullet time, a shootdodge and the full kill cam (browser check). */
const BOT_DEMO = params.get("bot") === "demo";
const SKIP = DEV && (params.has("skip") || BOT || !!HOLDCHECK);
/** Dev: ?radbro=<id> plays that Radbro for this page load (the hold check loops over them). */
const RADBRO_PARAM = DEV ? RADBROS.find(r => r.id === params.get("radbro"))?.id : undefined;
if (RADBRO_PARAM) useUi.setState({ radbro: RADBRO_PARAM });
/** ?ending: play the ending cutscene even with ?skip / ?bot (it plays anyway with ?bot=demo);
 *  ?cutscene: play cutscene 1 even with ?bot (the headless run: cutscene, fight, ending, results). */
const ENDING = params.has("ending");
const CUTSCENE = params.has("cutscene");
const ROOM = params.get("room") ?? "room1";
/** Dev: ?extra=heavy puts a rival heavy by the north wall near the staff door, with a camera marker on
 *  him (?cam=cam-heavy): the heavies' readability check in a room that has none. */
const EXTRA = DEV ? params.get("extra") ?? "" : "";
/** Dev: ?still hides the "click to fight" veil (camera-marker screenshots without the bot). */
const STILL = DEV && params.has("still");
/** Dev: ?loadout=shotgun,sniper owns those weapons from the start (the last one in hand; any weapon id);
 *  ?grenades=N starts with N frags. */
const LOADOUT = HOLDCHECK && HOLDCHECK !== "pistols" ? [HOLDCHECK] : (DEV ? params.get("loadout") ?? "" : "").split(",").filter((w): w is WeaponId => w in WEAPONS && w !== "pistols" && w !== "ak");
const GRENADES = DEV ? Number(params.get("grenades") ?? 0) || 0 : 0;
/** Dev: ?botgun=shotgun|smgs keeps the bot on that weapon while it has rounds (the gun view checks). */
const BOT_GUN = DEV ? (params.get("botgun") as WeaponId | null) : null;
const newBot = () => { const b = new Bot(3.5, 0.3, BOT_DEMO); b.only = BOT_GUN; return b; };
/** The page's driver: the bot, the hold check's script, or the player. */
const driver = (s: Session) => (HOLDCHECK ? new HoldScript() : BOT && TOUR ? new TourDriver(newBot(), s) : BOT ? newBot() : null);
const AUTO = BOT || !!HOLDCHECK;
const SEED = params.has("seed") ? Number(params.get("seed")) >>> 0 : (Math.random() * 2 ** 31) >>> 0;
/** The longest a room's start waits for its models (then it goes on: a model still missing is a stand-in girl). */
const HOLD_CAP_MS = 20_000;
/** The room renders behind the loading card or a cutscene's panels for its last frames (the post chain
 *  settles there, out of sight). */
let compiling = false;
const gate = (screen: string) => { renderGate.card = (screen === "cutscene" || screen === "loading") && !compiling; };
/** Resolves true once `ok()`, false after `capMs` of it not being so; time under a cutscene's panels does
 *  not count (they last as long as they last, and nothing waits on screen). */
async function until(ok: () => boolean, capMs: number, onTick?: () => void): Promise<boolean> {
  let spent = 0, last = performance.now();
  while (!ok()) {
    const now = performance.now();
    if (useUi.getState().screen !== "cutscene") spent += now - last;
    last = now;
    if (spent >= capMs) return false;
    onTick?.();
    await wait(100);
  }
  return true;
}
/** A room's start preparation (readyRoom), once per session. `show` is the loading card while one is up
 *  for it (under a cutscene nothing shows); `last` is where it is. */
type Prep = { promise: Promise<void>; done: boolean; last: { progress: number; what: string }; show: ((progress: number, what: string) => void) | null };
const preps = new WeakMap<Session, Prep>();
/** Next-room sessions that got the guns he carried out of the last room (once each). */
const carried = new WeakSet<Session>();
/** The first room holds its render until its shaders are compiled (taken when the page mounts, released
 *  by the title's warm-up). */
let bootHold = false;
const takeBoot = () => { if (!bootHold) { bootHold = true; renderGate.warming++; } return true; };
const releaseBoot = () => { if (bootHold) { bootHold = false; renderGate.warming--; } };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Hold the room's render, let what just mounted settle (the look's material rules walk the scene every
 *  10 frames), compile every shader off the frame, let go. */
async function warmScene(onProgress?: (f: number) => void, settle = 3): Promise<void> {
  renderGate.warming++;
  try {
    await frames(settle);
    await warmLook({ onProgress });
  } finally {
    renderGate.warming--;
  }
}

/** The room's level textures, through the asset runtime the scene uses (a texture that lands later
 *  changes its material's shader: the warm-up waits for them, not for the Radbro's files). */
async function levelTextures(s: Session): Promise<void> {
  for (let i = 0; i < 50 && !assetsRef.current; i++) await wait(50);
  const a = assetsRef.current;
  if (!a) return;
  const mats = (s.prefab as { materials?: Record<string, { texture?: unknown; normalMapTexture?: unknown }> }).materials ?? {};
  const urls = new Set<string>();
  for (const m of Object.values(mats)) for (const t of [m.texture, m.normalMapTexture]) if (typeof t === "string") urls.add(t);
  await Promise.race([Promise.allSettled([...urls].map(u => a.loadTexture(u))), wait(10_000)]);
  for (let i = 0; i < 120 && scenePending.n > 0 && [...urls].some(u => !a.getTexture(u)); i++) await frames(1);
}

/** The picked Radbro's files into the HTTP cache from the first moment (versioned URLs, cached for good),
 *  and the Draco decoder they need: the asset runtime only asks once the canvas is up. */
function preloadRadbro(id: RadbroId): void {
  for (const p of [...manifestFor(id), gunClipsPath(id), r2ClipsPath(id), MILADY_CLIPS]) if (p.includes("?v=")) void fetch(p, { priority: "high" }).then(r => r.blob(), () => undefined).catch(() => undefined);
  for (const f of ["draco_wasm_wrapper.js", "draco_decoder.wasm"]) void fetch(`https://www.gstatic.com/draco/v1/decoders/${f}`).then(r => r.blob(), () => undefined).catch(() => undefined);
}
preloadRadbro(useUi.getState().radbro);

/** After room 1 starts: rooms 2-3's sounds, the rave's clip pack, the ending panels (low priority). */
let laterLoads = false;
function loadLater(): void {
  if (laterLoads) return;
  laterLoads = true;
  loadLaterSamples();
  void loadOptional(MILADY_R2);
  prefetchCutscene("e1");
}
/** Model numbers used this visit (a later room's gang gets other girls). Madame Pockit's is never a goon's. */
const usedPockits = new Set<number>([MADAME.pockit]);
/** Round 3: each room cleared this run, its stats (a retry overwrites; the chapter's results add them up). */
const chapterRun = new Map<string, Stats>();
function chapterTotals(): { stats: Stats; rooms: number } {
  const t: Stats = { kills: 0, headshots: 0, shots: 0, hits: 0, damageTaken: 0, copiumUsed: 0, time: 0, btTime: 0, dodges: 0, secrets: 0, secretsTotal: 0 };
  for (const st of chapterRun.values()) for (const k of Object.keys(t) as Array<keyof Stats>) t[k] = (t[k] ?? 0) + (st[k] ?? 0);
  return { stats: t, rooms: chapterRun.size };
}
/** Round 3: the rooms past the back of the house get their sounds (their own load group) and the
 *  cutscene after them ahead of time. */
function aheadOf(roomId: string): void {
  if (roomId === "room3" || roomId === "room4" || roomId === "room5") loadEndSamples();
  if (roomId === "room4") prefetchCutscene("c3", 1);
  if (roomId === "room5") prefetchCutscene("c4", 1);
}
const hashId = (id: string) => { let h = 2166136261; for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

const canvasEl = () => document.querySelector("canvas");

/** A room's session (`exact`: null when its level file does not exist). */
async function loadRoom(id: string, exact = false, current = true): Promise<Session> {
  const { id: got, prefab } = await fetchRoom(id, exact);
  // the level's textures by their versioned URLs (assets.ts: cached for good, a new file a new URL)
  for (const m of Object.values((prefab as { materials?: Record<string, { texture?: unknown }> }).materials ?? {})) if (typeof m.texture === "string") m.texture = assetUrl(m.texture);
  const level = readLevel(prefab as Parameters<typeof readLevel>[0]);
  for (const w of level.warnings) console.info(`[level] ${w}`);
  if (HOLDCHECK) {
    // the hold check: an empty street (no gang, no crowd)
    level.markers = level.markers.filter(m => m.kind !== "enemy" && m.kind !== "crowd");
  }
  if (EXTRA.includes("heavy")) {
    const m = { hx: 0, hy: 0, hz: 0 };
    level.markers.push({ kind: "enemy", id: "dev-heavy", x: 12, y: 0, z: -12.6, yaw: 0, ...m, data: { kind: "heavy", model: EXTRA.includes("723") ? "rival723" : "rival652" } });
    level.markers.push({ kind: "camera", id: "cam-heavy", x: 11.2, y: 1.7, z: -6.2, yaw: 0, ...m, data: { at: [12, 1.1, -12.6] } });
  }
  // the gang: mostly girls already in the browser's cache, a couple of new faces (vrm/pockit.ts)
  const pockit = pickPockits(goonSlots(level), (SEED ^ hashId(got)) >>> 0, await cachedPockits(), usedPockits);
  for (const n of Object.values(pockit)) usedPockits.add(n);
  const s = new Session(level, prefab, got, { seed: SEED, difficulty: useUi.getState().difficulty, base: baseWeaponOf(useUi.getState().radbro), katana: useUi.getState().radbro === "4764", pockit, ...(LOADOUT.length ? { loadout: LOADOUT } : {}), ...(GRENADES ? { grenades: GRENADES } : {}), ...(HOLDCHECK ? { ai: false } : {}) });
  // their downloads start now, not when the Radbro files are in; room 1's music waits for them
  const gang = prefetchGoons(s);
  if (current && got === "room1") setMusicGate(gang);
  console.info(`[radpayne] room ${got} ("${level.room.name}"): ${level.boxes.length} colliders, ${level.markers.length} markers, seed ${SEED}`);
  if (current) (window as unknown as { __session?: Session }).__session = s;
  return s;
}

/** The room's prefab: public/levels/<room>.json, falling back to the greybox until the real scene exists
 *  (`exact`: no fallback, null when the file is not there: the next room is not built yet). */
async function fetchRoom(id: string, exact = false): Promise<{ id: string; prefab: unknown }> {
  for (const f of exact ? [id] : [id, "greybox"]) {
    // a build knows its level files (the dev server does not): one it does not have is never asked for
    // (room 3's next room is not built yet: no 404 in the console)
    if (assetExists(`/levels/${f}.json`) === false) continue;
    try {
      // dev: never cached (the editor saves while the page is open); a build: the versioned URL
      const r = await fetch(DEV ? `/levels/${f}.json?v=${Date.now()}` : assetUrl(`/levels/${f}.json`));
      if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) continue;
      return { id: f, prefab: await r.json() };
    } catch {
      /* next */
    }
  }
  throw new Error(`no level file for ${id}`);
}

export default function PlayPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  /** The cutscene on screen and what follows it (play for c1, the results for the ending). */
  const [cut, setCut] = useState<{ data: CutsceneData; then: () => void } | null>(null);
  const seenCutscene = useRef(false);
  /** Cutscenes after a room seen this page load (e1, c2, ...). */
  const seenAfter = useRef(new Set<string>());
  const screen = useUi(s => s.screen);
  const radbro = useUi(s => s.radbro);
  const muted = useUi(s => s.muted);
  useState(takeBoot);
  /** The room is on screen behind the title (its shaders compiled): the canvas fades in. */
  const [roomLive, setRoomLive] = useState(false);
  const sensitivity = useUi(s => s.sensitivity);
  const invertY = useUi(s => s.invertY);
  const locked = useUi(s => s.locked);
  const filterRef = useRef<HTMLDivElement>(null);
  /** Sessions whose room is ready to start (the gang, every shader, the sounds, its first frames). */
  const shown = useRef(new WeakSet<Session>());
  /** The next room, loaded and warming up while this one finishes (from its clear). */
  const nextRoom = useRef<{ from: Session; ready: Promise<Session | null> } | null>(null);
  /** The session in the canvas (set at once when one is swapped in, before React renders it). */
  const mounted = useRef<Session | null>(null);
  useEffect(() => { mounted.current = session; }, [session]);
  /** Playing on a gamepad without the pointer lock (started from the prompt with A / Start). */
  const [padFight, setPadFightState] = useState(false);
  const padFightRef = useRef(false);
  const setPadFight = (on: boolean) => { padFightRef.current = on; setPadFightState(on); };
  /** The "click to fight" prompt is up: playing, no pointer lock, not on the pad. */
  const awaitingFight = () => useUi.getState().screen === "play" && !useUi.getState().locked && !padFightRef.current && !AUTO;

  // boot: the room
  useEffect(() => {
    loadRoom(ROOM).then(s => setSession(s), e => useUi.setState({ load: { progress: 0, label: "", error: String(e) } }));
  }, []);

  // the room's shaders compile off the frame as soon as its level and textures are in (the Radbro's
  // files and the gang download meanwhile); the room renders once they are (the title's street fades
  // in). Again for every new session (the next room behind its cards, the title's room after a run).
  useEffect(() => {
    if (!canvasReady || !session) return;
    let live = true;
    // back on the title from a later room: the canvas fades out rather than hold that room's last frame
    if (useUi.getState().screen === "title") setRoomLive(false);
    renderGate.warming++;
    void (async () => {
      try {
        await levelTextures(session);
        // a room's start waiting on it (holdRoom's "shaders" step) shows its progress
        await warmScene(f => { const u = useUi.getState(); if (u.screen === "loading" && u.load.label.endsWith("shaders")) useUi.setState({ load: { ...u.load, progress: 0.6 + 0.3 * f } }); }, 12);
      } finally {
        renderGate.warming--;
        releaseBoot();
      }
      if (!live) return;
      setRoomLive(true);
      prefetchCutscene("c1", 1); // the first panel, low priority (the strip loads the rest when it opens)
    })();
    return () => { live = false; };
  }, [canvasReady, session]);

  // models for the picked Radbro (+ the Milady retarget source), in the background from the title; his
  // rig's shaders compile off the frame while the room's render is held
  useEffect(() => {
    if (!canvasReady) return;
    let live = true;
    const tryLoad = async () => {
      for (let i = 0; i < 50 && !assetsRef.current; i++) await wait(50);
      const failed = await loadManifest(manifestFor(radbro), f => { if (useUi.getState().screen === "loading") useUi.setState({ load: { progress: f, label: "radbro", error: null } }); });
      // his pistol clips, the shotgun set (a Radbro whose own gun is a long gun holds it with it) and the
      // Miladys' shooter clips; the rave's pack (rooms 2+) loads once room 1 runs (loadLater)
      await Promise.all([loadOptional(gunClipsPath(radbro)), loadOptional(r2ClipsPath(radbro)), loadOptional(MILADY_CLIPS)]);
      if (!live) return;
      if (failed) { useUi.setState({ load: { progress: 0, label: "", error: failed } }); return; }
      // his rig mounts with the new models: held until it is compiled (the room's own shaders are
      // compiled by then, or are being: one warm-up at a time)
      renderGate.warming++;
      try {
        useUi.setState(s => ({ assetsVersion: s.assetsVersion + 1 }));
        setModelsReady(true);
        await warmScene();
      } finally {
        renderGate.warming--;
      }
    };
    setModelsReady(false);
    void tryLoad();
    return () => { live = false; };
  }, [canvasReady, radbro]);

  useEffect(() => { setMuted(muted); }, [muted]);

  // a graphics change that rebuilds shaders (the puddle mirror on / off, MSAA): the room's render holds
  // (from this very call, before any frame) while they compile off the frame
  useEffect(() => useGfx.subscribe((g, prev) => {
    if ((g.reflections !== "off") === (prev.reflections !== "off") && g.msaa === prev.msaa) return;
    renderGate.warming++;
    void frames(4).then(() => warmLook()).finally(() => { renderGate.warming--; });
  }), []);
  useEffect(() => { if (session) { session.input.sensitivity = sensitivity; session.input.invertY = invertY; } }, [session, sensitivity, invertY]);

  // input + pointer lock
  useEffect(() => {
    if (!session) return;
    return attachDom(session.input, () => canvasEl(), l => {
      useUi.setState({ locked: l });
      if (useUi.getState().screen !== "play" || AUTO) return;
      if (l) { setPadFight(false); session.input.flush(); session.paused = false; }
      else pause();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Esc / P / gamepad Start while playing (the browser eats Esc with the lock and unlocks by itself)
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code !== "Escape" && e.code !== "KeyP") return;
      const sc = useUi.getState().screen;
      if (sc === "play") pause();
    };
    addEventListener("keydown", kd);
    if (session) {
      // on the prompt, Start and A start the fight on the pad; Start pauses once it is on
      session.onPadStart = () => { if (awaitingFight()) fightOnPad(); else if (useUi.getState().screen === "play") pause(); };
      session.onPadA = () => { if (awaitingFight()) fightOnPad(); };
    }
    return () => {
      removeEventListener("keydown", kd);
      if (session) { session.onPadStart = null; session.onPadA = null; }
    };
  });

  const lock = () => { if (!AUTO) void (canvasEl()?.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => undefined); };

  /** Gamepad A / Start on the prompt: play without the pointer lock. Runs inside the session's
   *  frame, after the pad poll and before the steps, so the flush drops the press. */
  function fightOnPad() {
    if (!session) return;
    setPadFight(true);
    session.input.flush();
    session.paused = false;
  }

  const startPlay = useCallback(async () => {
    if (!session) return;
    await holdRoom(session);
    useUi.setState({ screen: "play" });
    loadLater();
    aheadOf(session.roomId);
    bridge().result("run");
    setPadFight(false);
    session.input.flush();
    session.stepper.reset();
    // the sim runs once the pointer is locked (the lock handler unpauses); the bot needs no lock
    session.paused = !AUTO && !document.pointerLockElement;
    lock();
  }, [session]);

  /** Get a room ready to start (once per session; the room must be the one in the canvas): the Radbro,
   *  the gang that is there from the start (built ahead by the warm-up, usually already done: the later
   *  ones keep building in the fight), every shader compiled off the frame (look/compile.ts, the models
   *  not shown yet included), the room's sounds, then a few frames rendered out of sight. It starts under
   *  a cutscene's panels when there is one before the room (cutscene 1, the ending panels, c2: the next
   *  room is swapped in behind them), else behind the loading card (holdRoom), which shows its progress. */
  function readyRoom(s: Session): Prep {
    const had = preps.get(s);
    if (had) return had;
    const prep: Prep = { promise: Promise.resolve(), done: false, last: { progress: 0, what: "" }, show: null };
    preps.set(s, prep);
    const step = (progress: number, what: string) => { prep.last = { progress, what }; prep.show?.(progress, what); };
    prep.promise = (async () => {
      const t0 = performance.now();
      if (!useUi.getState().assetsVersion) {
        step(0, "radbro");
        await until(() => useUi.getState().assetsVersion > 0, HOLD_CAP_MS);
      }
      if (!roomWarm(s)) {
        step(0.1, "the gang");
        const all = await until(() => { warmRoom(s); return roomWarm(s); }, HOLD_CAP_MS, () => { const w = warmRoom(s); step(0.1 + 0.5 * (w?.total ? w.done / w.total : 0), "the gang"); });
        if (!all) console.info(`[warm] ${s.roomId}: the gang is not all in, starting anyway`);
      }
      step(0.6, "shaders");
      // the level's textures in, the models mount (hidden until posed) and the look's material rules
      // reach them, then every shader compiles off the frame
      await levelTextures(s);
      await frames(12);
      const tf = performance.now();
      await warmLook({ hidden: true, onProgress: f => step(0.6 + 0.3 * f, "shaders") });
      step(0.9, "sounds");
      // room 1's own sounds; a later room's (already loading since room 1 started; a dev ?room= start
      // asks for them here)
      if (s.roomId !== "room1") loadLaterSamples();
      // rooms 4-5: their own group too (the ride, the boss, her voice)
      const end = !!(s.game.ride || s.game.boss);
      if (end) loadEndSamples();
      await groupReady(s.roomId === "room1" ? "room" : "later", 6000);
      if (end) await groupReady("end", 8000);
      // a few frames out of sight (the card or the panels cover the canvas): the post chain, anything
      // that changed since
      compiling = true;
      gate(useUi.getState().screen);
      try { await frames(3); } finally { compiling = false; gate(useUi.getState().screen); }
      shown.current.add(s);
      console.info(`[radpayne] ${s.roomId}: ready in ${Math.round(performance.now() - t0)} ms (shaders + first frames ${Math.round(performance.now() - tf)} ms)${useUi.getState().screen === "cutscene" ? ", under the panels" : ""}`);
    })().catch(e => console.info(`[radpayne] ${s.roomId}: getting ready failed: ${String(e)}`)).finally(() => { prep.done = true; prep.show = null; });
    return prep;
  }

  /** A room's start waits behind the loading card (with its progress) for whatever readyRoom has not
   *  done yet (nothing, when it all happened under the cutscene before it). */
  async function holdRoom(s: Session): Promise<void> {
    if (useUi.getState().assetsVersion > 0 && roomWarm(s) && shown.current.has(s)) return;
    const t0 = performance.now();
    const label = roomText(s.roomId, s.level.room).label.toLowerCase();
    const card = (progress: number, what: string) => useUi.setState({ screen: "loading", load: { progress, label: what ? `${label} · ${what}` : label, error: null } });
    const prep = readyRoom(s);
    if (!prep.done) {
      prep.show = card;
      card(prep.last.progress, prep.last.what);
      await prep.promise;
    }
    console.info(`[radpayne] ${s.roomId}: held ${Math.round(performance.now() - t0)} ms`);
  }

  /** The next room into the canvas (its scene mounts; the sim waits paused). */
  function mount(ns: Session): void {
    if (mounted.current === ns) return;
    mounted.current = ns;
    ns.bot = driver(ns);
    ns.paused = true;
    (window as unknown as { __session?: Session }).__session = ns;
    setSession(ns);
  }

  function pause() {
    if (!session) return;
    session.paused = true;
    useUi.setState({ screen: "paused" });
    // free the cursor so Resume can be clicked (P / gamepad Start keep the lock otherwise)
    if (document.pointerLockElement) document.exitPointerLock();
  }

  const play = useCallback(async () => {
    if (!session) return;
    unlockAudio();
    void loadSamples();
    chapterRun.clear();
    // straight to cutscene 1 once its lines are in (the room's files load under the panels; the room's
    // start waits for the rest: holdRoom)
    useUi.setState({ screen: "loading", load: { progress: 0, label: "", error: null } });
    await groupReady("cs1", 4000);
    session.restart({ difficulty: useUi.getState().difficulty, base: baseWeaponOf(useUi.getState().radbro), katana: useUi.getState().radbro === "4764" });
    session.bot = driver(session);
    if (HOLDCHECK) {
      const hp = session.game.player;
      holdDev.session = session;
      holdDev.baseYaw = hp.yaw;
      holdDev.homeAt = { x: hp.x, y: hp.y, z: hp.z };
    }
    session.paused = true;
    if (!seenCutscene.current && (!SKIP || CUTSCENE)) {
      seenCutscene.current = true;
      const c = await loadCutscene("c1");
      if (c) {
        setCut({ data: c, then: () => void startPlay() });
        useUi.setState({ screen: "cutscene" });
        void loadSamples().then(() => setMusic("calm"));
        void readyRoom(session); // room 1 gets ready under the panels
        return;
      }
    }
    void startPlay();
  }, [session, startPlay]);

  // ?skip / ?bot: straight in once the models are there
  const autoStarted = useRef(false);
  useEffect(() => {
    if (SKIP && modelsReady && session && !autoStarted.current) { autoStarted.current = true; void play(); }
  }, [modelsReady, session, play]);

  /** The next room's session takes over the canvas and play goes straight on (the bot too). */
  const enterRoom = useCallback(async (ns: Session) => {
    stopRoomAudio(false);
    mount(ns); // (already there when it got ready under the cutscene before it)
    await holdRoom(ns);
    useUi.setState({ screen: "play" });
    aheadOf(ns.roomId);
    bridge().result("run");
    ns.input.flush();
    ns.stepper.reset();
    // a pad player goes straight on (no lock needed); a mouse player gets the prompt if the lock is gone
    ns.paused = !BOT && !document.pointerLockElement && !padFightRef.current;
    if (!BOT) void (canvasEl()?.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => undefined);
  }, []);

  /** Load the next room's level and start warming its models (once per room, from its clear). */
  const prepareNext = useCallback((from: Session) => {
    if (nextRoom.current?.from === from) return nextRoom.current.ready;
    const next = typeof from.level.room.next === "string" ? from.level.room.next : "";
    const ready = next ? loadRoom(next, true, false).then(ns => { warmRoom(ns); return ns; }, () => null) : Promise.resolve(null);
    nextRoom.current = { from, ready };
    return ready;
  }, []);

  const onPhase = useCallback((phase: string) => {
    if (!session) return;
    // the room is clear: the next room's models build during the walk to the door and the panels after it
    if (phase === "clear" || phase === "done") void prepareNext(session);
    if (phase === "done" || phase === "dead") {
      // radbro.fun (framed only): a cleared room = "clear" with its time, a death = "gameover"
      const end = roomResult(phase, session.game.stats);
      bridge().result(end.status, end.score);
      session.paused = true;
      if (document.pointerLockElement) document.exitPointerLock();
      setHeartbeat(false);
      setFootsteps(0);
      const g = session.game;
      if (phase === "done") chapterRun.set(session.roomId, { ...g.stats });
      // the chapter's last room (room 5): its results are the chapter's (after cutscene 4's card)
      const chapterEnd = phase === "done" && session.level.room.chapterEnd === true;
      const results = { cleared: phase === "done", stats: { ...g.stats }, room: session.roomId, difficulty: g.difficulty, radbro: useUi.getState().radbro, pins: useUi.getState().hud.pins, ...(chapterEnd ? { chapter: chapterTotals() } : {}) };
      // room 3 holds the last frame while the elevator opens (room.exitHold seconds)
      const hold = phase === "done" && typeof session.level.room.exitHold === "number" ? session.level.room.exitHold * 1000 : 0;
      const show = () => { if (hold) setTimeout(() => useUi.setState({ screen: "results", results }), hold); else useUi.setState({ screen: "results", results }); };
      if (!results.cleared) { show(); return; }
      // the next room (when its level exists), else the results: "to be continued"
      const room = session.level.room;
      const next = typeof room.next === "string" ? room.next : "";
      // he keeps what he picked up: the guns, their rounds, the frags (a retry of the room too); handed
      // over once, before the next room mounts (under the panels, or at the swap)
      const carry = g.carryOut();
      const handOver = (ns: Session) => { if (!carried.has(ns)) { carried.add(ns); ns.restart({ carry }); } };
      const goOn = () => {
        if (!next) { show(); return; }
        void prepareNext(session).then(ns => {
          nextRoom.current = null;
          if (ns) handOver(ns);
          if (ns) void enterRoom(ns);
          else { console.info(`[radpayne] ${next} is not built yet`); show(); }
        });
      };
      // the cutscene after the room: its own (c2), or room 1's ending panels (e1), once per page load
      const after = typeof room.cutsceneAfter === "string" ? room.cutsceneAfter : session.roomId === "room1" ? "e1" : "";
      if (after && !seenAfter.current.has(after) && (!SKIP || BOT_DEMO || ENDING)) {
        seenAfter.current.add(after);
        void loadCutscene(after).then(c => {
          if (!c) { goOn(); return; }
          setCut({ data: c, then: goOn });
          useUi.setState({ screen: "cutscene" });
          // the next room's music under the panels (c2: the back of the house)
          if (typeof c.music === "string") void loadSamples().then(() => setMusic("calm", c.music));
          // and the next room itself: its scene mounts behind the panels and gets ready there (the gang,
          // its shaders, its sounds, its first frames), so it starts when they end, not behind a card
          if (next) void prepareNext(session).then(ns => { if (ns && useUi.getState().screen === "cutscene") { handOver(ns); mount(ns); void readyRoom(ns); } });
        });
        return;
      }
      // no cutscene: the last frame holds while the room's exit plays out (room 3's elevator doors)
      if (hold) setTimeout(goOn, hold); else goOn();
    }
  }, [session, enterRoom, prepareNext]);

  // the room stops rendering while a cutscene or the loading card hides it (the warm-up gets the time)
  useEffect(() => useUi.subscribe(st => gate(st.screen)), []);

  // the canvas layer's filter (15 Hz via the HUD store): bullet-time grade, low-health
  // desaturation, pause blur, results dim, death greyout. The HUD is never filtered.
  useEffect(() => useUi.subscribe(s => {
    const el = filterRef.current;
    if (!el) return;
    const fx = canvasFx({ screen: s.screen, timeScale: s.hud.timeScale, health: s.hud.health, deadAt: s.deadAt, now: performance.now(), killcam: s.hud.killcam });
    if (el.style.transition !== fx.transition) el.style.transition = fx.transition;
    if (el.style.filter !== fx.filter) el.style.filter = fx.filter;
  }), []);

  const retry = () => {
    if (!session) return;
    // from the room's last checkpoint when it has one (room 3: after the security office)
    session.restart({ difficulty: useUi.getState().difficulty, resume: session.game.saved ?? undefined });
    session.bot = driver(session);
    void startPlay();
  };
  const toTitle = () => {
    if (!session) return;
    session.paused = true;
    setPadFight(false);
    nextRoom.current = null;
    stopNarration();
    stopRoomAudio(true);
    useUi.setState({ screen: "title" });
    // the title idles in the first room (its level mounts again: the session effect warms it)
    if (session.roomId !== ROOM) void loadRoom(ROOM).then(s => setSession(s));
    else session.restart({ resume: undefined });
  };

  return (
    <>
      <div ref={filterRef} style={{ position: "fixed", inset: 0, transition: "filter 0.15s" }} onMouseDown={() => { if (padFight && screen === "play" && !locked) lock(); }}>
        <div style={{ position: "absolute", inset: 0, opacity: roomLive || screen !== "title" ? 1 : 0, transition: "opacity 0.9s ease-out" }}>
          {session && <Scene s={session} onPhase={onPhase} bootRef={setCanvasReady} />}
        </div>
      </div>
      {screen === "title" && <Title onPlay={() => void play()} ready={!!session} />}
      {screen === "loading" && <Loading />}
      {screen === "cutscene" && cut && <Cutscene key={cut.data.id} data={cut.data} onDone={() => { const then = cut.then; setCut(null); then(); }} />}
      {screen === "play" && <Hud />}
      {screen === "play" && <BossBar />}
      {screen === "play" && !locked && !padFight && !AUTO && !STILL && <FightPrompt onLock={() => { session?.input.flush(); lock(); }} />}
      {screen === "paused" && <Pause onResume={() => { useUi.setState({ screen: "play" }); if (session) { session.input.flush(); session.paused = !BOT && !document.pointerLockElement && !padFightRef.current; } lock(); }} onRestart={retry} onQuit={toTitle} />}
      {screen === "results" && <ResultsScreen onRetry={retry} onTitle={toTitle} />}
      {!session && <div style={{ ...layer, background: "#05060c" }}>{useUi.getState().load.error ?? "loading…"}</div>}
      <UiEffects />
    </>
  );
}
