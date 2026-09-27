// Shared shaders for per-object buffers. three r186 names the uniform buffer of an InstancedMesh's
// matrices and of a SkinnedMesh's bones after the buffer node's global id (NodeBuffer_18992 /
// buffer18992), and every object, in every render context, gets its own buffer node: so the generated
// vertex shader text is different for every instanced or skinned object even when the material is the
// same, and the renderer (which shares a program / pipeline only between identical shader texts) links a
// new one each time. The load audit counted ~300 WebGL programs / ~320 WebGPU pipelines for room 1 with
// 311 distinct vertex shaders and 40 distinct fragment shaders.
// Here each built shader has those buffers renamed by what they hold (element type and length:
// NodeBuffer_mat4_24), the same name for the same layout, and the matching binding renamed with it
// (WebGL2 looks uniform blocks up by name; WebGPU binds by index; the buffer node keeps its own name,
// which other builds read). Identical materials on identical
// layouts then share one program / pipeline; each object keeps its own buffer and uploads its own data.
// The instance buffer's length is part of the shader too (an array of that many matrices), so an
// InstancedMesh's matrix buffer is padded to the next power of two (padInstances: it still draws only
// its own instances), and meshes with the same material share even when their counts differ a bit.
// And a material's shader key holds the id of the render context it is drawn in, so the puddle mirror
// (a second render of the street into its own target, one call level deeper) rebuilt every node graph
// of the street in JS, ~35 % of the warm-up, for the same shader text. Render-target contexts that
// cannot differ in code (same attachment count, format, type, no MRT) now share one key: the node
// graphs are built once (each render context still gets its own pipeline where the backend needs one:
// the MSAA sample count is part of the pipeline). Only on the three revision this was checked against.
import { InstancedBufferAttribute, REVISION, type InstancedMesh, type Object3D } from "three";
import type { WebGPURenderer } from "three/webgpu";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const clean = (t: string) => t.replace(/[^A-Za-z0-9]+/g, "").slice(0, 24);

/** Rename the per-object buffers in `codes` (the stages of one build); returns old -> new block names. */
export function shareBufferNames(codes: string[]): { codes: string[]; names: Map<string, string> } {
  const names = new Map<string, string>();
  const members = new Map<string, string>();
  const seen = new Map<string, number>();
  const all = codes.join("\n");
  const add = (id: string, type: string, count: string) => {
    if (names.has(`NodeBuffer_${id}`)) return;
    const base = `${clean(type)}_${count}`;
    const k = seen.get(base) ?? 0;
    seen.set(base, k + 1);
    const tag = k ? `${base}_${k}` : base;
    names.set(`NodeBuffer_${id}`, `NodeBuffer_${tag}`);
    members.set(`buffer${id}`, `nodeBuffer_${tag}`);
  };
  // GLSL: uniform NodeBuffer_<id> { <type> buffer<id>[<n>]; };
  for (const m of all.matchAll(/uniform\s+NodeBuffer_(\d+)\s*\{\s*(?:\w+\s+)?(\w+)\s+buffer\1\s*\[\s*(\d+)\s*\]\s*;/g)) add(m[1], m[2], m[3]);
  // WGSL: struct NodeBuffer_<id>Struct { value : array< <type>, <n> > };
  for (const m of all.matchAll(/struct\s+NodeBuffer_(\d+)Struct\s*\{\s*value\s*:\s*array<\s*(.+?)\s*,\s*(\d+)\s*>\s*,?\s*\}/g)) add(m[1], m[2], m[3]);
  if (!names.size) return { codes, names };
  const re = /NodeBuffer_(\d+)(?!\d)|\bbuffer(\d+)(?!\d)/g;
  const out = codes.map(c => c && c.replace(re, (s, a, b) => (a !== undefined ? names.get(`NodeBuffer_${a}`) : members.get(`buffer${b}`)) ?? s));
  return { codes: out, names };
}

const installed = new WeakSet<object>();

/** The key a render-target context contributes to a material's shader key: what can change the code. */
const ctxKeys = new Map<string, number>();
function sharedContextId(ctx: Any): number {
  const t = ctx.textures as Any[] | null | undefined;
  if (!t || !t.length) return ctx.id; // the canvas: output transforms differ, keep it apart
  const sig = `${t.length}|${t.map(x => `${x.format}:${x.type}`).join(",")}|${ctx.mrt ? ctx.mrt.id : "-"}|${ctx.depthTexture ? 1 : 0}`;
  let id = ctxKeys.get(sig);
  if (id === undefined) { id = -1 - ctxKeys.size; ctxKeys.set(sig, id); }
  return id;
}

let protoShared = false;
function shareContexts(gl: WebGPURenderer): void {
  if (REVISION !== "186") return;
  const objs = (gl as Any)._objects;
  if (!objs || typeof objs.createRenderObject !== "function") return;
  const create = objs.createRenderObject.bind(objs);
  objs.createRenderObject = (...a: Any[]) => {
    const ro = create(...a);
    if (!protoShared) {
      protoShared = true;
      const proto = Object.getPrototypeOf(ro);
      const key = proto.getMaterialCacheKey;
      if (typeof key === "function") {
        proto.getMaterialCacheKey = function (this: Any) {
          const ctx = this.context;
          const id = ctx ? sharedContextId(ctx) : undefined;
          if (!ctx || id === ctx.id) return key.call(this);
          this.context = { id }; // the key reads only context.id
          try { return key.call(this); } finally { this.context = ctx; }
        };
        ro.initialCacheKey = ro.getCacheKey();
      }
    }
    return ro;
  };
}

/** Install on a renderer (once): every node build's shaders and bindings get the shared names, and
 *  render-target contexts share node graphs. */
export function shareShaders(gl: WebGPURenderer): void {
  const nodes = (gl as Any)._nodes;
  if (!nodes || installed.has(nodes) || typeof nodes._createNodeBuilderState !== "function") return;
  installed.add(nodes);
  shareContexts(gl);
  const create = nodes._createNodeBuilderState.bind(nodes);
  nodes._createNodeBuilderState = (b: Any) => {
    try {
      const { codes, names } = shareBufferNames([b.vertexShader ?? "", b.fragmentShader ?? "", b.computeShader ?? ""]);
      if (names.size) {
        if (b.vertexShader) b.vertexShader = codes[0];
        if (b.fragmentShader) b.fragmentShader = codes[1];
        if (b.computeShader) b.computeShader = codes[2];
        // only this build's binding objects: never the buffer node's own name. A node like the neon
        // dim's goon array is shared by many materials, and its name is read again when a later build
        // writes its GLSL declaration; with builds interleaved (compileAsync yields), a renamed node
        // name reached another build's shader after its binding was made, so that binding kept the
        // numbered name, found no block in the linked program (WebGL2: "uniformBlockBinding: invalid
        // uniform block index") and left the program's buffers on binding 0
        for (const group of b.getBindings()) for (const binding of group.bindings ?? []) {
          const n = names.get(binding.name);
          if (n) binding.name = n;
        }
      }
    } catch (e) {
      console.info(`[warm] shader sharing skipped: ${String(e)}`);
    }
    return create(b);
  };
}

/** Pad every InstancedMesh's matrix (and colour) buffer under `root` to the next power of two, once:
 *  the draw count stays, the shaders' buffer length becomes one of a few. Call before compiling. */
export function padInstances(root: Object3D): void {
  root.traverse(o => {
    const m = o as InstancedMesh;
    if (!m.isInstancedMesh || m.userData.rpPad) return;
    const n = m.instanceMatrix.count;
    const cap = Math.max(4, 2 ** Math.ceil(Math.log2(Math.max(1, n))));
    m.userData.rpPad = cap;
    if (cap === n || n > 1024) return;
    const grow = (a: InstancedBufferAttribute, size: number) => {
      const b = new InstancedBufferAttribute(new Float32Array(cap * size), size);
      (b.array as Float32Array).set(a.array as Float32Array);
      b.setUsage(a.usage);
      return b;
    };
    m.instanceMatrix = grow(m.instanceMatrix, 16);
    if (m.instanceColor) m.instanceColor = grow(m.instanceColor, 3);
  });
}
