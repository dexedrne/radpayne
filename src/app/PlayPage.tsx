// The game page: TITLE (the room idles behind it) -> LOADING (the picked Radbro) -> CUTSCENE 1 (first
// play only) -> PLAY -> RESULTS (room clear or rugged) -> retry / title. One canvas, mounted once;
// retries swap the Game inside the session. Pointer lock lost = pause.
// Dev / test builds: ?bot plays the room by itself (smoke test), ?room=<id> picks a level file,
// ?seed=N fixes the seed, ?skip skips the title and the cutscene.
import { useCallback, useEffect, useRef, useState } from "react";
import { Session } from "./session.ts";
import { Scene } from "./Scene.tsx";
import { assetsRef, loadManifest, manifestFor, loadOptional, gunClipsPath, MILADY_CLIPS } from "./characters.ts";
import { readLevel } from "../world/level.ts";
import { useUi } from "../ui/store.ts";
import { Hud, canvasFx } from "../ui/Hud.tsx";
import { UiEffects } from "../ui/hud/UiEffects.tsx";
import { Loading, Pause, ResultsScreen, Title, btn, layer } from "../ui/screens.tsx";
import { Cutscene, loadCutscene, type CutsceneData } from "../ui/Cutscene.tsx";
import { attachDom } from "../input/input.ts";
import { setMuted, unlockAudio } from "../audio/engine.ts";
import { loadSamples, setFootsteps, setHeartbeat, setMusic, stopNarration, stopRoomAudio } from "../audio/sfx.ts";
import { Bot } from "../sim/bot.ts";

const DEV = import.meta.env.MODE !== "production";
const params = new URLSearchParams(location.search);
const BOT = DEV && params.has("bot");
/** ?bot=demo: the bot shows off bullet time, a shootdodge and the full kill cam (browser check). */
const BOT_DEMO = params.get("bot") === "demo";
const SKIP = DEV && (params.has("skip") || BOT);
const ROOM = params.get("room") ?? "room1";
/** ?q=low: low quality for this page load only (headless smoke runs). */
if (params.get("q") === "low") useUi.setState({ quality: "low" });
const SEED = params.has("seed") ? Number(params.get("seed")) >>> 0 : (Math.random() * 2 ** 31) >>> 0;

const canvasEl = () => document.querySelector("canvas");

/** The room's prefab: public/levels/<room>.json, falling back to the greybox until the real scene exists. */
async function fetchRoom(id: string): Promise<{ id: string; prefab: unknown }> {
  for (const f of [id, "greybox"]) {
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
  const [cut, setCut] = useState<CutsceneData | null>(null);
  const seenCutscene = useRef(false);
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
    fetchRoom(ROOM).then(({ id, prefab }) => {
      const level = readLevel(prefab as Parameters<typeof readLevel>[0]);
      for (const w of level.warnings) console.info(`[level] ${w}`);
      const s = new Session(level, prefab, id, { seed: SEED, difficulty: useUi.getState().difficulty });
      console.info(`[radpayne] room ${id} ("${level.room.name}"): ${level.boxes.length} colliders, ${level.markers.length} markers, seed ${SEED}`);
      setSession(s);
      (window as unknown as { __session?: Session }).__session = s;
    }, e => useUi.setState({ load: { progress: 0, label: "", error: String(e) } }));
  }, []);

  // models for the picked Radbro (+ the Milady retarget source), in the background from the title
  useEffect(() => {
    if (!canvasReady) return;
    let live = true;
    const tryLoad = async () => {
      for (let i = 0; i < 50 && !assetsRef.current; i++) await new Promise(r => setTimeout(r, 50));
      const failed = await loadManifest(manifestFor(radbro), f => { if (useUi.getState().screen === "loading") useUi.setState({ load: { progress: f, label: "radbro", error: null } }); });
      await Promise.all([loadOptional(gunClipsPath(radbro)), loadOptional(MILADY_CLIPS)]);
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
    session.restart({ difficulty: useUi.getState().difficulty });
    session.bot = BOT ? new Bot(3.5, 0.3, BOT_DEMO) : null;
    session.paused = true;
    if (!seenCutscene.current && !SKIP) {
      seenCutscene.current = true;
      const c = await loadCutscene("c1");
      if (c) { setCut(c); useUi.setState({ screen: "cutscene" }); void loadSamples().then(() => setMusic("calm")); return; }
    }
    startPlay();
  }, [session, modelsReady, startPlay]);

  // ?skip / ?bot: straight in once the models are there
  const autoStarted = useRef(false);
  useEffect(() => {
    if (SKIP && modelsReady && session && !autoStarted.current) { autoStarted.current = true; void play(); }
  }, [modelsReady, session, play]);

  const onPhase = useCallback((phase: string) => {
    if (!session) return;
    if (phase === "done" || phase === "dead") {
      session.paused = true;
      if (document.pointerLockElement) document.exitPointerLock();
      setHeartbeat(false);
      setFootsteps(0);
      const g = session.game;
      useUi.setState({ screen: "results", results: { cleared: phase === "done", stats: { ...g.stats }, room: session.roomId, difficulty: g.difficulty, radbro: useUi.getState().radbro } });
    }
  }, [session]);

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
    session.restart({ difficulty: useUi.getState().difficulty });
    session.bot = BOT ? new Bot(3.5, 0.3, BOT_DEMO) : null;
    startPlay();
  };
  const toTitle = () => {
    if (!session) return;
    session.paused = true;
    session.restart();
    stopNarration();
    stopRoomAudio(true);
    useUi.setState({ screen: "title" });
  };

  return (
    <>
      <div ref={filterRef} style={{ position: "fixed", inset: 0, transition: "filter 0.15s" }}>
        {session && <Scene s={session} onPhase={onPhase} lowQuality={quality === "low"} bootRef={setCanvasReady} />}
      </div>
      {screen === "title" && <Title onPlay={() => void play()} ready={!!session && modelsReady} />}
      {screen === "loading" && <Loading />}
      {screen === "cutscene" && cut && <Cutscene data={cut} onDone={() => { setCut(null); startPlay(); }} />}
      {screen === "play" && <Hud />}
      {screen === "play" && !locked && !BOT && (
        <div style={{ ...layer, background: "rgba(5,6,12,0.35)", cursor: "pointer" }} onClick={() => { session?.input.flush(); lock(); }}>
          <div style={btn(true)}>CLICK TO FIGHT</div>
        </div>
      )}
      {screen === "paused" && <Pause onResume={() => { useUi.setState({ screen: "play" }); if (session) { session.input.flush(); session.paused = !BOT && !document.pointerLockElement; } lock(); }} onRestart={retry} onQuit={toTitle} />}
      {screen === "results" && <ResultsScreen onRetry={retry} onTitle={toTitle} />}
      {!session && <div style={{ ...layer, background: "#05060c" }}>{useUi.getState().load.error ?? "loading…"}</div>}
      <UiEffects />
    </>
  );
}
