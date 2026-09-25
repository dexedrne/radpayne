// The game page: TITLE (the room idles behind it) -> LOADING (the picked Radbro) -> CUTSCENE 1 (first
// play only) -> PLAY -> the ENDING cutscene (e1: the first time the room is cleared, after the kill cam
// and the walk to the club door) -> RESULTS (room clear or rugged) -> retry / title. One canvas, mounted once;
// retries swap the Game inside the session. Pointer lock lost = pause.
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
import { Hud, gradeFilter } from "../ui/Hud.tsx";
import { Loading, Pause, ResultsScreen, Title, btn, layer } from "../ui/screens.tsx";
import { Cutscene, loadCutscene, type CutsceneData } from "../ui/Cutscene.tsx";
import { attachDom } from "../input/input.ts";
import { setMuted, unlockAudio } from "../audio/engine.ts";
import { loadSamples, samplesReady, setFootsteps, setHeartbeat, setMusic, stopNarration, stopRoomAudio } from "../audio/sfx.ts";
import { Bot } from "../sim/bot.ts";
import type { WeaponId } from "../combat/weapons.ts";

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

const canvasEl = () => document.querySelector("canvas");

/** A room's session (`exact`: null when its level file does not exist). */
async function loadRoom(id: string, exact = false): Promise<Session> {
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
  (window as unknown as { __session?: Session }).__session = s;
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
      if (l) { session.input.flush(); session.paused = false; }
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
    if (session) session.onPadStart = () => { if (useUi.getState().screen === "play") pause(); };
    return () => {
      removeEventListener("keydown", kd);
      if (session) session.onPadStart = null;
    };
  });

  const lock = () => { if (!BOT) void (canvasEl()?.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => undefined); };

  const startPlay = useCallback(() => {
    if (!session) return;
    useUi.setState({ screen: "play" });
    session.input.flush();
    session.stepper.reset();
    // the sim runs once the pointer is locked (the lock handler unpauses); the bot needs no lock
    session.paused = !BOT && !document.pointerLockElement;
    lock();
  }, [session]);

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
      if (c) { setCut({ data: c, then: startPlay }); useUi.setState({ screen: "cutscene" }); void loadSamples().then(() => setMusic("calm")); return; }
    }
    startPlay();
  }, [session, modelsReady, startPlay]);

  // ?skip / ?bot: straight in once the models are there
  const autoStarted = useRef(false);
  useEffect(() => {
    if (SKIP && modelsReady && session && !autoStarted.current) { autoStarted.current = true; void play(); }
  }, [modelsReady, session, play]);

  /** The next room's session takes over the canvas and play goes straight on (the bot too). */
  const enterRoom = useCallback((ns: Session) => {
    stopRoomAudio(false);
    ns.bot = BOT ? new Bot(3.5, 0.3, BOT_DEMO) : null;
    setSession(ns);
    useUi.setState({ screen: "play" });
    ns.input.flush();
    ns.stepper.reset();
    ns.paused = !BOT && !document.pointerLockElement;
    if (!BOT) void (canvasEl()?.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => undefined);
  }, []);

  const onPhase = useCallback((phase: string) => {
    if (!session) return;
    if (phase === "done" || phase === "dead") {
      session.paused = true;
      if (document.pointerLockElement) document.exitPointerLock();
      setHeartbeat(false);
      setFootsteps(0);
      const g = session.game;
      const results = { cleared: phase === "done", stats: { ...g.stats }, room: session.roomId, difficulty: g.difficulty, radbro: useUi.getState().radbro };
      const show = () => useUi.setState({ screen: "results", results });
      if (!results.cleared) { show(); return; }
      // the next room (when its level exists), else the results: "to be continued"
      const room = session.level.room;
      const next = typeof room.next === "string" ? room.next : "";
      const goOn = () => {
        if (!next) { show(); return; }
        void loadRoom(next, true).then(enterRoom, () => { console.info(`[radpayne] ${next} is not built yet`); show(); });
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
  }, [session, enterRoom]);

  // the bullet-time grade on the canvas layer (15 Hz via the HUD store)
  useEffect(() => useUi.subscribe(s => {
    const el = filterRef.current;
    if (el) el.style.filter = gradeFilter(s.screen === "play" || s.screen === "paused" ? s.hud.timeScale : 1);
  }), []);

  const retry = () => {
    if (!session) return;
    session.restart({ difficulty: useUi.getState().difficulty });
    session.bot = BOT ? new Bot(3.5, 0.3, BOT_DEMO) : null;
    startPlay();
  };
  const toTitle = () => {
    if (!session) return;
    session.paused = true;
    stopNarration();
    stopRoomAudio(true);
    useUi.setState({ screen: "title" });
    // the title idles in the first room
    if (session.roomId !== ROOM) void loadRoom(ROOM).then(s => setSession(s));
    else session.restart();
  };

  return (
    <>
      <div ref={filterRef} style={{ position: "fixed", inset: 0, transition: "filter 0.15s" }}>
        {session && <Scene s={session} onPhase={onPhase} lowQuality={quality === "low"} bootRef={setCanvasReady} />}
      </div>
      {screen === "title" && <Title onPlay={() => void play()} ready={!!session && modelsReady} />}
      {screen === "loading" && <Loading />}
      {screen === "cutscene" && cut && <Cutscene key={cut.data.id} data={cut.data} onDone={() => { const then = cut.then; setCut(null); then(); }} />}
      {screen === "play" && <Hud />}
      {screen === "play" && !locked && !BOT && !STILL && (
        <div style={{ ...layer, background: "rgba(5,6,12,0.35)", cursor: "pointer" }} onClick={() => { session?.input.flush(); lock(); }}>
          <div style={{ ...btn(true), fontSize: 18, padding: "14px 34px" }}>CLICK TO FIGHT</div>
        </div>
      )}
      {screen === "paused" && <Pause onResume={() => { useUi.setState({ screen: "play" }); if (session) { session.input.flush(); session.paused = !BOT && !document.pointerLockElement; } lock(); }} onRestart={retry} onQuit={toTitle} />}
      {screen === "results" && <ResultsScreen onRetry={retry} onTitle={toTitle} />}
      {!session && <div style={{ ...layer, background: "#05060c" }}>{useUi.getState().load.error ?? "loading…"}</div>}
    </>
  );
}
