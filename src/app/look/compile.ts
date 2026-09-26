// Shader warm-up off the critical frame. The first frame of a room used to build and compile every
// shader of the street in one synchronous frame (TSL node building + ~300 WebGL program links / WebGPU
// pipelines, the puddle mirror's second render context included): 5-33 s of frozen page behind the
// title. Instead the active look registers its render contexts here (the scene pass, the reflector's
// target, the goon mask pass) and warmLook() compiles everything in the scene for each of them with
// the renderer's async path (compileAsync: node building that yields between shader stages, parallel
// program linking on WebGL2 through KHR_parallel_shader_compile, createRenderPipelineAsync on WebGPU),
// frustum culling off so the parts of the room the camera has not looked at yet are ready too.
// While a warm-up runs the room does not render (frame.ts renderGate.warming): the last frame (or the
// dark title) stays, the page stays responsive.
//
// Two details of three r186 decide whether the real frame finds these shaders:
//  - a material's shader key includes the id of the render context it was built in, and the context
//    depends on how deep the render call is nested (the post chain renders the scene pass one level
//    down, the scene pass renders the puddle mirror two levels down). compileAsync always takes the top
//    level, so each context here says its depth and the lookup is pointed at it while compileAsync
//    collects its render list.
//  - compileAsync handles its objects one after another and waits for each pipeline, so the objects are
//    split into lanes (by material, so no two lanes build the same shader) compiled side by side.
//  - an override material (the goon mask pass) takes a few properties from each object's own material
//    while its render list is collected, but its shaders are built later: each group of objects that
//    sets the same values gets its own copy of the override (same shaders, kept for good: disposing it
//    would free them).
//  - the lights are one node per scene whose content is whatever the last render list put there, and
//    the key it gives is cached until the next draw call: the contexts are compiled one after the other
//    (the mask pass, no lights, it only sees its own layer, last), each on a fresh key (info.calls bumped).
import type { Camera, Material, Mesh, Object3D, RenderTarget, Scene } from "three";
import type { WebGPURenderer } from "three/webgpu";
import { renderGate } from "../frame.ts";
import { padInstances } from "./shaderShare.ts";

/** One render context the look draws with: its target, camera and nesting depth (1: a pass of the post
 *  chain, 2: the puddle mirror inside the scene pass), plus the mask pass's override material and
 *  layers, and materials hidden in it (the puddles in their own mirror). */
export type Ctx = { name: string; target: RenderTarget | null; camera: Camera; depth: number; override?: Material | null; layersMask?: number; hide?: Iterable<Material>; prepare?: () => void };

export type Look = { gl: WebGPURenderer; scene: Scene; contexts: () => Ctx[] };

/** The look on screen (set by its post component). */
export const activeLook: { current: Look | null } = { current: null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PassLike = any;

/** A look's post component registers its passes (the scene pass, the goon mask pass) and any extra
 *  contexts (the street's puddle mirror); returns the effect cleanup. */
export function registerLook(gl: WebGPURenderer, scene: Scene, camera: Camera, passes: { scenePass: PassLike; maskPass: PassLike }, extra?: (cam: Camera) => Ctx[], maskPrepare?: () => void): () => void {
  const look: Look = {
    gl, scene,
    contexts: () => {
      const cam: Camera = passes.scenePass.camera ?? camera;
      const mk = passes.maskPass;
      return [
        { name: "scene", target: passes.scenePass.renderTarget, camera: cam, depth: 1 },
        ...(extra?.(cam) ?? []),
        { name: "mask", target: mk.renderTarget, camera: mk.camera ?? cam, depth: 1, override: mk.overrideMaterial, layersMask: mk._layers?.mask, prepare: maskPrepare },
      ];
    },
  };
  activeLook.current = look;
  return () => { if (activeLook.current === look) activeLook.current = null; };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any; // the renderer's internals (pinned three 0.186)

const DEBUG = typeof location !== "undefined" && new URLSearchParams(location.search).has("warmlog");
/** Lanes per context for a whole-scene warm-up. */
const LANES = 4;

type AnyMat = Material & Record<string, unknown>;
/** The values three's renderer copies from an object's material onto an override (Renderer.renderObject). */
function overrideSig(m: AnyMat): string {
  const node = (v: unknown) => !!(v && (v as { isNode?: boolean }).isNode);
  const tr = m.transparent || (m.transmission as number) > 0 || (m.transmissionNode && node(m.transmissionNode)) || (m.backdropNode && node(m.backdropNode));
  return [String(tr), m.alphaTest ? 1 : 0, m.alphaMap ? 1 : 0, node(m.positionNode) ? 1 : 0, m.displacementMap ? 1 : 0, m.displacementScale ? 1 : 0, m.displacementBias ? 1 : 0].join("|");
}
const overrideCopies = new WeakMap<Material, Map<string, Material>>();
function overrideCopy(o: Material, sig: string): Material {
  let m = overrideCopies.get(o);
  if (!m) { m = new Map(); overrideCopies.set(o, m); }
  let c = m.get(sig);
  if (!c) {
    c = o.clone();
    // clone() leaves out properties a subclass declares (the mask's fog = false): copy every one the
    // shader key reads, so the copy builds exactly the override's shaders
    const src = o as unknown as Record<string, unknown>, dst = c as unknown as Record<string, unknown>;
    for (const k of Object.keys(src)) if (k !== "uuid" && k !== "id" && !k.startsWith("_") && typeof src[k] !== "function") dst[k] = src[k];
    m.set(sig, c);
  }
  return c;
}

let tail: Promise<unknown> = Promise.resolve();

/** onProgress: 0..1. root: one object (default the whole scene; a warm-up of one object does not hold
 *  the room's render). hidden: also the models that are mounted but not shown yet (userData.rpWarm:
 *  a goon until a clip has posed her, a goon a trigger brings in later). Every rpWarm model compiled
 *  (and a root) is marked userData.rpWarmed. */
export type WarmOpts = { onProgress?: (f: number) => void; root?: Object3D; hidden?: boolean };

/** Compile for every render context of the active look. One warm-up at a time. Resolves when done
 *  (errors are logged, never thrown). */
export function warmLook(opts: WarmOpts = {}): Promise<void> {
  const run = tail.then(() => warmNow(opts));
  tail = run.catch(() => undefined);
  return run;
}

/** A goon's model before she is shown (gate-free: the room keeps rendering). */
export function warmObject(root: Object3D): Promise<void> {
  return warmLook({ root });
}

async function warmNow({ onProgress, root, hidden = false }: WarmOpts): Promise<void> {
  const look = activeLook.current;
  if (!look) { onProgress?.(1); return; }
  const { gl, scene } = look;
  const t0 = performance.now();
  const gate = !root; // a whole-scene warm-up holds the room's render; one object (not shown yet) needs no gate
  if (gate) renderGate.warming++;
  try {
    if ((gl as R)._initialized === false) await (gl as R).init();
    const ctxs = look.contexts();
    const target = root ?? scene;
    padInstances(target); // before any shader is built for them (shaderShare.ts)
    const lanes = root ? 1 : LANES;
    const parts: Array<{ loaded: number; total: number }> = [];
    const report = () => { let l = 0, t = 0; for (const p of parts) { l += p.loaded; t += p.total; } onProgress?.(t ? l / t : 0); };
    const done: Object3D[] = [];
    if (root) done.push(root);
    if (hidden) target.traverse(o => { if (o.userData.rpWarm) done.push(o); });
    // one context after the other (its lanes side by side): the puddle mirror's node graphs are the scene
    // pass's (shaderShare.ts), so after the scene pass it only adds pipelines; the mask pass comes last
    for (const c of ctxs) {
      (gl as R).info.calls++;
      const runs: Promise<void>[] = [];
      for (const p of startContext(gl, scene, target, c, hidden, lanes, (k, l, t) => { parts[k] = { loaded: l, total: t }; report(); }, parts.length)) { runs.push(p); parts.push({ loaded: 0, total: 1 }); }
      await Promise.all(runs);
    }
    for (const o of done) o.userData.rpWarmed = true;
    onProgress?.(1);
    if (!root) console.info(`[warm] shaders room: ${ctxs.map(c => c.name).join(" + ")} in ${Math.round(performance.now() - t0)} ms (${parts.reduce((n, p) => n + p.total, 0)} objects)`);
    if (DEBUG) console.info(`[warm] lanes: ${JSON.stringify(parts.map(p => p.total))}`);
  } catch (e) {
    console.info(`[warm] shader warm-up failed: ${String(e)}`);
  } finally {
    if (gate) renderGate.warming--;
  }
}

/** Start compileAsync for one context, in `lanes` lanes. Its synchronous part (the render list) runs
 *  inside each call, so the temporary state (target, depth, override, layers, no frustum culling,
 *  forced visibility, hidden materials, the other lanes' meshes hidden) is put back right after the
 *  calls return, before anything else can render. */
function startContext(gl: WebGPURenderer, scene: Scene, root: Object3D, c: Ctx, hidden: boolean, lanes: number, onPart: (k: number, loaded: number, total: number) => void, k0: number): Promise<void>[] {
  const r = gl as R;
  const prevTarget = gl.getRenderTarget();
  const prevMrt = r.getMRT?.() ?? null;
  const prevOverride = scene.overrideMaterial;
  const prevMask = c.camera.layers.mask;
  const contexts = r._renderContexts;
  const getCtx = contexts.get;
  const culled: Object3D[] = [];
  const shown: Object3D[] = [];
  const hiddenMats: Material[] = [];
  const laneOff: Object3D[] = [];
  const out: Promise<void>[] = [];
  c.prepare?.();
  root.traverse(o => { if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
  // an object about to be shown is still hidden until it is posed: compile it anyway (and its hidden
  // parents: a goon a trigger brings in later)
  const show = (o: Object3D | null) => { for (let p = o; p && p !== scene; p = p.parent) if (!p.visible) { p.visible = true; shown.push(p); } };
  if (root !== scene) show(root);
  if (hidden) root.traverse(o => { if (o.userData.rpWarm) show(o); });
  for (const m of c.hide ?? []) if (m.visible) { m.visible = false; hiddenMats.push(m); }
  // lanes: every mesh by its (first) material, so one shader is never built in two lanes (with an
  // override: by the values it takes from the material, one override copy per lane); a mesh under
  // another mesh goes with it (hiding a parent hides its children)
  const lane = new Map<Object3D, number>();
  const overrides: Material[] = [];
  const first = (m: Mesh) => { const mm = m.material as Material | Material[]; return (Array.isArray(mm) ? mm[0] : mm) as AnyMat | undefined; };
  let pick: ((m: Mesh) => number) | null = null;
  if (c.override) {
    const sigs = new Map<string, number>();
    pick = m => {
      const mat = first(m);
      const sig = mat ? overrideSig(mat) : "";
      let l = sigs.get(sig);
      if (l === undefined) { l = sigs.size; sigs.set(sig, l); overrides.push(overrideCopy(c.override!, sig)); }
      return l;
    };
  } else if (lanes > 1) {
    pick = m => { const id = first(m)?.uuid ?? m.uuid; let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return Math.abs(h) % lanes; };
  }
  if (pick) {
    const walk = (o: Object3D, inherited: number) => {
      let l = inherited;
      if ((o as Mesh).isMesh && l < 0) { l = pick!(o as Mesh); lane.set(o, l); }
      for (const ch of o.children) walk(ch, l);
    };
    walk(root, -1);
  }
  const laneCount = c.override ? Math.max(1, overrides.length) : lanes;
  try {
    gl.setRenderTarget(c.target);
    r.setMRT?.(null);
    scene.overrideMaterial = c.override ?? null;
    if (c.layersMask !== undefined) c.camera.layers.mask = c.layersMask;
    c.camera.updateMatrixWorld();
    // compileAsync asks for the top-level context; the real render is `depth` calls down
    contexts.get = function (rt: unknown, mrt: unknown, depth?: number) { return getCtx.call(this, rt, mrt, depth ?? c.depth); };
    for (let l = 0; l < laneCount; l++) {
      if (laneCount > 1) for (const [o, ol] of lane) if (ol !== l && o.visible) { o.visible = false; laneOff.push(o); }
      if (c.override) scene.overrideMaterial = overrides[l] ?? c.override;
      const k = k0 + l;
      out.push(r.compileAsync(root, c.camera, scene, (e: ProgressEvent) => onPart(k, e.loaded, e.total)));
      for (const o of laneOff) o.visible = true;
      laneOff.length = 0;
    }
  } finally {
    contexts.get = getCtx;
    for (const o of laneOff) o.visible = true;
    for (const o of culled) o.frustumCulled = true;
    for (const o of shown) o.visible = false;
    for (const m of hiddenMats) m.visible = true;
    c.camera.layers.mask = prevMask;
    scene.overrideMaterial = prevOverride;
    gl.setRenderTarget(prevTarget);
    r.setMRT?.(prevMrt);
  }
  return out;
}
