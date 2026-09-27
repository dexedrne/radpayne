// Room warm-up (round-2 playtest: room 2 opened on grey stand-ins for ~20 s at 24-38 fps while its
// girls were built in the middle of the fight). The models a room needs are built ahead of it and handed
// to its views ready:
//   - the gang's Pockit girls (per session: each goon is her own VRM, EnemiesView mounts it),
//   - the rave crowd's templates (per model number, shared: CrowdView clones one per girl),
//   - the rival heavies' files (HeavyView builds its rigs from them),
//   - the level's texture files (into the HTTP cache).
// One build at a time (a serial queue, so there is never more than one parse or retarget in flight), in
// slices of a few milliseconds per frame: 3 ms while a fight runs, 12 ms on menus, 30 ms under a
// cutscene and 60 ms behind the loading card (the room does not render under either: frame.ts renderGate). Retargeted clips are shared between models with the same rig (see
// vrm/retarget.ts), so most girls after the first cost a parse and little else.
// PlayPage starts the next room's warm-up once the room before it is clear (the walk to the door, the
// ending panels or cutscene 2 run while it builds), swaps the next room in behind those panels so its
// shaders compile there too, and holds a room's start behind a short loading card only for whatever is
// still building (capped: a model that never comes keeps its stand-in).
// The load audit: a room's start waits only for the goons that are there from the start (and the crowd,
// the heavies' files, the textures); the ones a spawn trigger brings in later keep building during the
// fight (their downloads come after the others, at low priority). The Pockit downloads themselves start
// as soon as the level is read (prefetchGoons), not when the Radbro clip sources are in.
import type { Object3D } from "three";
import type { Session } from "./session.ts";
import { MILADY_CLIPS, MILADY_R2, RETARGET_SOURCE, assetsRef, clipsPath, gunClipsPath, loadOptional, modelPath, r2ClipsPath, rivalBase, rivalPath } from "./characters.ts";
import { buildGoon, fetchPockit, type LoadedGoon } from "../vrm/pockit.ts";
import { CROWD_ALWAYS, CROWD_CLIPS, buildCrowdModel, type CrowdModel } from "../vrm/crowdModel.ts";
import { useUi } from "../ui/store.ts";

/** Build work per frame (ms of main thread) by what is on screen. */
const BUDGET_MS = { play: 3, idle: 12, cutscene: 30, loading: 60 };
/** A build that has not finished after this long no longer holds up the queue (it may still land). */
const JOB_CAP_MS = 30_000;

const DEBUG = new URLSearchParams(location.search).has("warmlog");
let sliceAt = 0;
const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => setTimeout(r, 0)));
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function budget(): number {
  const sc = useUi.getState().screen;
  return sc === "loading" ? BUDGET_MS.loading : sc === "cutscene" ? BUDGET_MS.cutscene : sc === "play" ? BUDGET_MS.play : BUDGET_MS.idle;
}

/** Awaited between build steps: returns at once while this frame's slice lasts, else after the next frame. */
export async function breathe(): Promise<void> {
  if (performance.now() - sliceAt < budget()) return;
  await nextFrame();
  sliceAt = performance.now();
}

let tail: Promise<unknown> = Promise.resolve();
/** The serial build queue (FIFO; a job over JOB_CAP_MS stops holding it up). */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = tail.then(async () => { await breathe(); return job(); });
  tail = Promise.race([run, wait(JOB_CAP_MS)]).catch(() => undefined);
  return run;
}

// ---- the gang -----------------------------------------------------------------------------------------

const goonJobs = new WeakMap<Session, Map<number, Promise<LoadedGoon | null>>>();

/** Start the room's Pockit downloads (once the level is read): the goons there from the start first,
 *  then the ones a trigger brings in, at low priority. Resolves when the first ones are in. */
export function prefetchGoons(s: Session): Promise<unknown> {
  if (new URLSearchParams(location.search).get("milady") === "0") return Promise.resolve();
  const goons = s.game.enemies.filter(e => e.kind !== "heavy");
  const start = goons.filter(e => e.state !== "inactive").map(e => e.milady);
  const later = goons.filter(e => e.state === "inactive").map(e => e.milady);
  const first = Promise.allSettled(start.map(n => fetchPockit(n)));
  void first.then(() => { for (const n of later) void fetchPockit(n, "low"); });
  return first;
}

/** The rave's clip pack (rooms 2+: the crowd, the DJ's and the dancers' idles), loaded once. */
function r2Clips(): Promise<boolean> {
  return loadOptional(MILADY_R2);
}

/** The Radbro rigs carrying the Miladys' clips (null until the Radbro assets are in). */
function goonSources(): Object3D[] | null {
  const a = assetsRef.current;
  if (!a || !a.getModel(modelPath(RETARGET_SOURCE)) || !a.getModel(clipsPath(RETARGET_SOURCE))) return null;
  return [a.getModel(MILADY_CLIPS), a.getModel(modelPath(RETARGET_SOURCE)), a.getModel(clipsPath(RETARGET_SOURCE)), a.getModel(MILADY_R2)].filter(Boolean) as Object3D[];
}

/** A goon's idle clip before the alert (level marker data idleClip: the DJ's DJ_Idle, a dance). */
export function idleClipOf(s: Session, idx: number): string {
  const e = s.game.enemies[idx];
  const v = e ? s.level.markers.find(m => m.kind === "enemy" && m.id === e.id)?.data.idleClip : undefined;
  return typeof v === "string" ? v : "";
}

/** Goon `idx`'s model for session `s` (built once; a failure is forgotten so a later call retries).
 *  Null when she is not a Milady or the clip sources are not loaded yet. */
export function goonModel(s: Session, idx: number): Promise<LoadedGoon | null> | null {
  const e = s.game.enemies[idx];
  if (!e || e.kind === "heavy") return null;
  let jobs = goonJobs.get(s);
  if (!jobs) { jobs = new Map(); goonJobs.set(s, jobs); }
  const had = jobs.get(idx);
  if (had) return had;
  const sources = goonSources();
  if (!sources) return null;
  const idle = idleClipOf(s, idx);
  const n = e.milady;
  const t0 = performance.now();
  let dl = 0, b0 = 0;
  // an idle clip (the DJ, a dancer) comes from the rave's pack: that goon waits for it
  const job = Promise.all([fetchPockit(n, e.state === "inactive" ? "low" : "auto"), idle ? r2Clips() : true])
    .then(([got]) => { dl = performance.now() - t0; return got ? enqueue(() => { b0 = performance.now(); return buildGoon(n, goonSources() ?? sources, idle ? [idle] : [], breathe); }) : null; })
    .then(
      m => {
        if (!m) jobs.delete(idx);
        else console.info(`[warm] goon ${idx}: #${n} ready ${Math.round(performance.now() - t0)} ms after the ask (download ${Math.round(dl)} ms, build ${Math.round(performance.now() - b0)} ms)`);
        return m;
      },
      err => { jobs.delete(idx); console.info(`[milady] goon ${idx}: #${n} failed: ${String(err)}`); return null; },
    );
  jobs.set(idx, job);
  return job;
}

// ---- the crowd ----------------------------------------------------------------------------------------

const crowdJobs = new Map<string, Promise<CrowdModel | null>>();

/** The clips the girls wearing model `n` use (their own, plus the shooting's startle / flee / cower). */
export function crowdClipsFor(s: Session, n: number): string[] {
  const want = new Set(CROWD_ALWAYS);
  for (const p of s.game.crowd.people) if (p.milady === n) want.add(p.clip);
  return CROWD_CLIPS.filter(c => want.has(c));
}

/** The crowd template for model `n` with clips `want` (built once per page; failures retry later). */
export function crowdModel(n: number, want: readonly string[]): Promise<CrowdModel | null> | null {
  if (!assetsRef.current) return null;
  const key = `${n}|${want.join(",")}`;
  const had = crowdJobs.get(key);
  if (had) return had;
  const t0 = performance.now();
  let dl = 0, b0 = 0;
  const job = Promise.all([fetchPockit(n), r2Clips()])
    .then(([got]) => {
      dl = performance.now() - t0;
      const source = assetsRef.current?.getModel(MILADY_R2) ?? null;
      return got && source ? enqueue(() => { b0 = performance.now(); return buildCrowdModel(n, source, want, breathe); }) : null;
    })
    .then(
      m => {
        if (!m) crowdJobs.delete(key);
        else console.info(`[warm] crowd #${n} ready ${Math.round(performance.now() - t0)} ms after the ask (download ${Math.round(dl)} ms, build ${Math.round(performance.now() - b0)} ms, ${m.clips.length} clips)`);
        return m;
      },
      err => { crowdJobs.delete(key); console.info(`[crowd] #${n} failed: ${String(err)}`); return null; },
    );
  crowdJobs.set(key, job);
  return job;
}

/** The crowd's model numbers for a session, most-worn first (the bouncer's #42 too). */
export function crowdNumbers(s: Session): number[] {
  const count = new Map<number, number>();
  for (const p of s.game.crowd.people) count.set(p.milady, (count.get(p.milady) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

// ---- the room -----------------------------------------------------------------------------------------

/** total / done / promise: what the room's start waits for (the goons there from the start, the crowd,
 *  the files); `later`: the goons a spawn trigger brings in (they build on during the fight). */
export type Warm = { total: number; done: number; promise: Promise<void>; later: Promise<void> };
const warms = new WeakMap<Session, Warm>();

/** The rival heavies' files and the level's textures (network and the asset runtime's own parse). */
function warmFiles(s: Session): Promise<unknown>[] {
  const a = assetsRef.current;
  const out: Promise<unknown>[] = [];
  const models = new Set(s.game.enemies.filter(e => e.kind === "heavy").map(e => e.model));
  for (const m of models) {
    const base = rivalBase(m);
    if (a) out.push(a.loadModel(rivalPath(m)).catch(() => undefined), a.loadModel(clipsPath(base)).catch(() => undefined));
    out.push(loadOptional(gunClipsPath(base)), loadOptional(r2ClipsPath(base)));
  }
  const mats = (s.prefab as { materials?: Record<string, { texture?: unknown }> }).materials ?? {};
  const urls = new Set(Object.values(mats).map(m => m.texture).filter((t): t is string => typeof t === "string"));
  for (const u of urls) out.push(fetch(u).then(r => r.blob()).catch(() => undefined));
  return out;
}

/** Start (once per session) building everything the room needs; the promise settles when it is all
 *  built or has failed. Returns null while the Radbro assets (the clip sources) are not loaded yet. */
export function warmRoom(s: Session): Warm | null {
  const had = warms.get(s);
  if (had) return had;
  if (!goonSources()) return null;
  const jobs: Promise<unknown>[] = [];
  const later: Promise<unknown>[] = [];
  const noMilady = new URLSearchParams(location.search).get("milady") === "0";
  // the gang first (they fight: the ones there from the start, then the later ones), then the crowd
  // (most-worn model first), then the files
  const goons = s.game.enemies.filter(e => e.kind !== "heavy");
  if (!noMilady) {
    for (const e of goons) if (e.state !== "inactive") { const j = goonModel(s, e.idx); if (j) jobs.push(j); }
    for (const e of goons) if (e.state === "inactive") { const j = goonModel(s, e.idx); if (j) later.push(j); }
    for (const n of crowdNumbers(s)) { const j = crowdModel(n, crowdClipsFor(s, n)); if (j) jobs.push(j); }
  }
  jobs.push(...warmFiles(s));
  const w: Warm = { total: jobs.length, done: 0, promise: Promise.resolve(), later: Promise.allSettled(later).then(() => undefined) };
  const t0 = performance.now();
  w.promise = Promise.all(jobs.map((j, k) => j.then(() => { w.done++; if (DEBUG) console.info(`[warm] ${s.roomId}: job ${k} done at ${Math.round(performance.now() - t0)} ms`); }, () => { w.done++; }))).then(() => undefined);
  warms.set(s, w);
  return w;
}

/** Everything for the room is built (or given up on). */
export function roomWarm(s: Session): boolean {
  const w = warms.get(s);
  return !!w && w.done >= w.total;
}

/** Resolves after `n` rendered frames. */
export async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await nextFrame();
}
