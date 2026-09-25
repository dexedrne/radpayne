// The game page: TITLE (the room idles behind it) -> LOADING (the picked Radbro) -> CUTSCENE 1 (first
// play only) -> PLAY -> the ENDING cutscene (e1: the first time the room is cleared, after the kill cam
// and the walk to the club door) -> RESULTS (room clear or rugged) -> retry / title. One canvas, mounted once;
// retries swap the Game inside the session. Pointer lock lost = pause. The fight starts from the
// "click to fight" prompt: a click, Enter or Space takes the pointer lock (mouse play); gamepad A or
// Start plays without it (the right stick aims), and a later click on the game switches to the mouse.
// Round 2: a cleared room with a `next` room goes on: its cutscene (room.cutsceneAfter; room 1's is the
// e1 ending panels), then the next room's session replaces this one in the same canvas (the room is a
// checkpoint: dying there retries that room). The results come at the end of the chain, or when the
// next room's level file does not exist yet ("to be continued").
// Dev / test builds: ?bot plays the room by itself (smoke test), ?room=<id> picks a level file,
// ?seed=N fixes the seed, ?skip skips the title and the cutscene.
import { useCallback, useEffect, useRef, useState } from "react";
import { Session } from "./session.ts";
import { Scene } from "./Scene.tsx";
import { assetsRef, loadManifest, manifestFor, loadOptional, gunClipsPath, r2ClipsPath, MILADY_CLIPS, MILADY_R2 } from "./characters.ts";
import { readLevel } from "../world/level.ts";
import { useUi } from "../ui/store.ts";
import { Hud, canvasFx } from "../ui/Hud.tsx";
import { UiEffects } from "../ui/hud/UiEffects.tsx";
import { FightPrompt, Loading, Pause, ResultsScreen, Title, layer } from "../ui/screens.tsx";
import { Cutscene, loadCutscene, type CutsceneData } from "../ui/Cutscene.tsx";
import { attachDom } from "../input/input.ts";
import { setMuted, unlockAudio } from "../audio/engine.ts";
import { loadSamples, samplesReady, setFootsteps, setHeartbeat, setMusic, stopNarration, stopRoomAudio } from "../audio/sfx.ts";
import { Bot } from "../sim/bot.ts";
import type { WeaponId } from "../combat/weapons.ts";
import { awaitRoom, frames, roomWarm, warmRoom } from "./warmup.ts";
import { renderGate } from "./frame.ts";
import { roomText } from "../ui/rooms.ts";

const DEV = import.meta.env.MODE !== "production";
const params = new URLSearchParams(location.search);
const BOT = DEV && params.has("bot");
/** ?bot=demo: the bot shows off bullet time, a shootdodge and the full kill cam (browser check). */
const BOT_DEMO = params.get("bot") === "demo";
const SKIP = DEV && (params.has("skip") || BOT);
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
/** Dev: ?loadout=shotgun,smgs owns those weapons from the start (the last one in hand). */
const LOADOUT = (DEV ? params.get("loadout") ?? "" : "").split(",").filter((w): w is WeaponId => w === "shotgun" || w === "smgs");
/** ?q=low: low quality for this page load only (headless smoke runs). */
if (params.get("q") === "low") useUi.setState({ quality: "low" });
const SEED = params.has("seed") ? Number(params.get("seed")) >>> 0 : (Math.random() * 2 ** 31) >>> 0;
/** The longest a room's start waits for its models (then it goes on: a model still missing is a stand-in girl). */
const HOLD_CAP_MS = 20_000;
/** The room renders behind the loading card for its last frames (the new materials compile there). */
let compiling = false;
const gate = (screen: string) => { renderGate.skip = screen === "cutscene" || (screen === "loading" && !compiling); };

const canvasEl = () => document.querySelector("canvas");

/** A room's session (`exact`: null when its level file does not exist). */
async function loadRoom(id: string, exact = false, current = true): Promise<Session> {
  const { id: got, prefab } = await fetchRoom(id, exact);
  const level = readLevel(prefab as Parameters<typeof readLevel>[0]);
  for (const w of level.warnings) console.info(`[level] ${w}`);
  if (EXTRA.includes("heavy")) {
    const m = { hx: 0, hy: 0, hz: 0 };
    level.markers.push({ kind: "enemy", id: "dev-heavy", x: 12, y: 0, z: -12.6, yaw: 0, ...m, data: { kind: "heavy", model: EXTRA.includes("723") ? "rival723" : "rival652" } });
    level.markers.push({ kind: "camera", id: "cam-heavy", x: 11.2, y: 1.7, z: -6.2, yaw: 0, ...m, data: { at: [12, 1.1, -12.6] } });
  }
  const s = new Session(level, prefab, got, { seed: SEED, difficulty: useUi.getState().difficulty, ...(LOADOUT.length ? { loadout: LOADOUT } : {}) });
  console.info(`[radpayne] room ${got} ("${level.room.name}"): ${level.boxes.length} colliders, ${level.markers.length} markers, seed ${SEED}`);
  if (current) (window as unknown as { __session?: Session }).__session = s;
  return s;
}

/** The room's prefab: public/levels/<room>.json, falling back to the greybox until the real scene exists
 *  (`exact`: no fallback, null when the file is not there: the next room is not built yet). */
async function fetchRoom(id: string, exact = false): Promise<{ id: string; prefab: unknown }> {
  for (const f of exact ? [id] : [id, "greybox"]) {
    try {
      const r = await fetch(`/levels/${f}.json?v=${Date.now()}`);
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
  const quality = useUi(s => s.quality);
  const muted = useUi(s => s.muted);
  const sensitivity = useUi(s => s.sensitivity);
  const invertY = useUi(s => s.invertY);
  const locked = useUi(s => s.locked);
  const filterRef = useRef<HTMLDivElement>(null);
  /** Sessions whose room has been on screen (their materials compiled behind the loading card). */
  const shown = useRef(new WeakSet<Session>());
  /** The next room, loaded and warming up while this one finishes (from its clear). */
  const nextRoom = useRef<{ from: Session; ready: Promise<Session | null> } | null>(null);
  /** Playing on a gamepad without the pointer lock (started from the prompt with A / Start). */
  const [padFight, setPadFightState] = useState(false);
  const padFightRef = useRef(false);
  const setPadFight = (on: boolean) => { padFightRef.current = on; setPadFightState(on); };
  /** The "click to fight" prompt is up: playing, no pointer lock, not on the pad. */
  const awaitingFight = () => useUi.getState().screen === "play" && !useUi.getState().locked && !padFightRef.current && !BOT;

  // boot: the room
  useEffect(() => {
    loadRoom(ROOM).then(s => setSession(s), e => useUi.setState({ load: { progress: 0, label: "", error: String(e) } }));
  }, []);

  // models for the picked Radbro (+ the Milady retarget source), in the background from the title
  useEffect(() => {
    if (!canvasReady) return;
    let live = true;
    const tryLoad = async () => {
      for (let i = 0; i < 50 && !assetsRef.current; i++) await new Promise(r => setTimeout(r, 50));
      const failed = await loadManifest(manifestFor(radbro), f => { if (useUi.getState().screen === "loading") useUi.setState({ load: { progress: f, label: "radbro", error: null } }); });
      await Promise.all([loadOptional(gunClipsPath(radbro)), loadOptional(r2ClipsPath(radbro)), loadOptional(MILADY_CLIPS), loadOptional(MILADY_R2)]);
      if (!live) return;
      if (failed) { useUi.setState({ load: { progress: 0, label: "", error: failed } }); return; }
      useUi.setState(s => ({ assetsVersion: s.assetsVersion + 1 }));
      setModelsReady(true);
    };
    setModelsReady(false);
    void tryLoad();
    return () => { live = false; };
  }, [canvasReady, radbro]);

  useEffect(() => { setMuted(muted); }, [muted]);
  useEffect(() => { if (session) { session.input.sensitivity = sensitivity; session.input.invertY = invertY; } }, [session, sensitivity, invertY]);

  // input + pointer lock
  useEffect(() => {
    if (!session) return;
    return attachDom(session.input, () => canvasEl(), l => {
      useUi.setState({ locked: l });
      if (useUi.getState().screen !== "play" || BOT) return;
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

  const lock = () => { if (!BOT) void (canvasEl()?.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => undefined); };

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
    setPadFight(false);
    session.input.flush();
    session.stepper.reset();
    // the sim runs once the pointer is locked (the lock handler unpauses); the bot needs no lock
    session.paused = !BOT && !document.pointerLockElement;
    lock();
  }, [session]);

  /** A room's start waits behind the loading card for its models (built ahead by the warm-up, usually
   *  already done), then a few frames render behind the card so the new materials compile there. */
  async function holdRoom(s: Session): Promise<void> {
    if (roomWarm(s) && shown.current.has(s)) return;
    const t0 = performance.now();
    const label = roomText(s.roomId, s.level.room).label.toLowerCase();
    if (!roomWarm(s)) {
      useUi.setState({ screen: "loading", load: { progress: 0, label, error: null } });
      await awaitRoom(s, HOLD_CAP_MS, f => useUi.setState({ load: { progress: f, label, error: null } }));
    }
    if (!shown.current.has(s)) {
      shown.current.add(s);
      if (useUi.getState().screen !== "loading") useUi.setState({ screen: "loading", load: { progress: 1, label, error: null } });
      // the models mount and pose (a few frames), then the room renders a few frames behind the card:
      // its shaders compile there, not in the fight
      await frames(3);
      const tf = performance.now();
      compiling = true;
      gate("loading");
      await frames(8);
      compiling = false;
      console.info(`[radpayne] ${s.roomId}: first frames ${Math.round(performance.now() - tf)} ms`);
    }
    console.info(`[radpayne] ${s.roomId}: held ${Math.round(performance.now() - t0)} ms for its models`);
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
    useUi.setState({ screen: "loading", load: { progress: modelsReady ? 1 : 0, label: "radbro", error: null } });
    for (let i = 0; i < 400 && !useUi.getState().assetsVersion; i++) await new Promise(r => setTimeout(r, 50));
    await samplesReady(4000); // the first barks and the room's opening line need their files
    session.restart({ difficulty: useUi.getState().difficulty });
    session.bot = BOT ? new Bot(3.5, 0.3, BOT_DEMO) : null;
    session.paused = true;
    if (!seenCutscene.current && (!SKIP || CUTSCENE)) {
      seenCutscene.current = true;
      const c = await loadCutscene("c1");
      if (c) { setCut({ data: c, then: () => void startPlay() }); useUi.setState({ screen: "cutscene" }); void loadSamples().then(() => setMusic("calm")); return; }
    }
    void startPlay();
  }, [session, modelsReady, startPlay]);

  // ?skip / ?bot: straight in once the models are there
  const autoStarted = useRef(false);
  useEffect(() => {
    if (SKIP && modelsReady && session && !autoStarted.current) { autoStarted.current = true; void play(); }
  }, [modelsReady, session, play]);

  /** The next room's session takes over the canvas and play goes straight on (the bot too). */
  const enterRoom = useCallback(async (ns: Session) => {
    stopRoomAudio(false);
    ns.bot = BOT ? new Bot(3.5, 0.3, BOT_DEMO) : null;
    ns.paused = true;
    (window as unknown as { __session?: Session }).__session = ns;
    setSession(ns);
    await holdRoom(ns);
    useUi.setState({ screen: "play" });
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
      session.paused = true;
      if (document.pointerLockElement) document.exitPointerLock();
      setHeartbeat(false);
      setFootsteps(0);
      const g = session.game;
      const results = { cleared: phase === "done", stats: { ...g.stats }, room: session.roomId, difficulty: g.difficulty, radbro: useUi.getState().radbro };
      // room 3 holds the last frame while the elevator opens (room.exitHold seconds)
      const hold = phase === "done" && typeof session.level.room.exitHold === "number" ? session.level.room.exitHold * 1000 : 0;
      const show = () => { if (hold) setTimeout(() => useUi.setState({ screen: "results", results }), hold); else useUi.setState({ screen: "results", results }); };
      if (!results.cleared) { show(); return; }
      // the next room (when its level exists), else the results: "to be continued"
      const room = session.level.room;
      const next = typeof room.next === "string" ? room.next : "";
      const goOn = () => {
        if (!next) { show(); return; }
        void prepareNext(session).then(ns => {
          nextRoom.current = null;
          if (ns) void enterRoom(ns);
          else { console.info(`[radpayne] ${next} is not built yet`); show(); }
        });
      };
      // the cutscene after the room: its own (c2), or room 1's ending panels (captions only), once per page load
      const after = typeof room.cutsceneAfter === "string" ? room.cutsceneAfter : session.roomId === "room1" ? "e1" : "";
      if (after && !seenAfter.current.has(after) && (!SKIP || BOT_DEMO || ENDING)) {
        seenAfter.current.add(after);
        void loadCutscene(after).then(c => {
          if (!c) { goOn(); return; }
          setCut({ data: c, then: goOn });
          useUi.setState({ screen: "cutscene" });
          // the next room's music under the panels (c2: the back of the house)
          if (typeof c.music === "string") void loadSamples().then(() => setMusic("calm", c.music));
        });
        return;
      }
      goOn();
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
    session.bot = BOT ? new Bot(3.5, 0.3, BOT_DEMO) : null;
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
    // the title idles in the first room
    if (session.roomId !== ROOM) void loadRoom(ROOM).then(s => setSession(s));
    else session.restart({ resume: undefined });
  };

  return (
    <>
      <div ref={filterRef} style={{ position: "fixed", inset: 0, transition: "filter 0.15s" }} onMouseDown={() => { if (padFight && screen === "play" && !locked) lock(); }}>
        {session && <Scene s={session} onPhase={onPhase} lowQuality={quality === "low"} bootRef={setCanvasReady} />}
      </div>
      {screen === "title" && <Title onPlay={() => void play()} ready={!!session && modelsReady} />}
      {screen === "loading" && <Loading />}
      {screen === "cutscene" && cut && <Cutscene key={cut.data.id} data={cut.data} onDone={() => { const then = cut.then; setCut(null); then(); }} />}
      {screen === "play" && <Hud />}
      {screen === "play" && !locked && !padFight && !BOT && !STILL && <FightPrompt onLock={() => { session?.input.flush(); lock(); }} />}
      {screen === "paused" && <Pause onResume={() => { useUi.setState({ screen: "play" }); if (session) { session.input.flush(); session.paused = !BOT && !document.pointerLockElement && !padFightRef.current; } lock(); }} onRestart={retry} onQuit={toTitle} />}
      {screen === "results" && <ResultsScreen onRetry={retry} onTitle={toTitle} />}
      {!session && <div style={{ ...layer, background: "#05060c" }}>{useUi.getState().load.error ?? "loading…"}</div>}
      <UiEffects />
    </>
  );
}
