// Combat readability for the street look: the mood stays, but the fight must read at the range it is
// fought at (23-46 m, where a goon is 20-30 px tall and mostly a head over cover).
//
//  - Goon outline: an enemy mask pass (goons + the level as occluders, one flat override material)
//    feeds the post chain, which draws a warm edge around every live goon that is actually visible.
//    Thin up close, thicker from ~12 m out. It is told apart from the neon tubes by its FORM, not its
//    colour: a dark keyline hugs the bright edge (a neon tube only glows), and from range the body is a
//    solid warm silhouette that breathes slowly (the club's neon pulses on the beat, twice as fast).
//    It also shows through the player's own body, so the Radbro never hides who is behind him.
//  - Neon near a goon dims (neonDim: the "glow" materials within a few body widths of a live goon on
//    screen), and everything past the far edge of the fight (~46 m) is dimmer: the far signs, lit
//    windows and steam stop competing with the girls at 23-46 m.
//  - Shooter flash: a goon that fires lights up red (outline + fill) for ~0.45 s; a goon you hit
//    flashes white for a moment.
//  - Range assist for gunfire: tracer lines and glows with a minimum on-screen size (they grow with
//    distance and fade in past ~8 m, so close-up gunfire is left to the regular effects). One colour
//    code: the gang's fire is red (muzzle glows, tracers from the shooter, their bullets), the
//    player's is gold / white (his tracer from the muzzle to the hit, the sparks and hit bursts where
//    his shots land, his bullet-time bullets). The gang's misses get no glow at all.
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Layers, Mesh, Sphere, Vector3, Vector4,
  type Camera, type Material, type Object3D, type PerspectiveCamera, type Scene,
} from "three";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, type PassNode, type WebGPURenderer } from "three/webgpu";
import {
  abs, attribute, cameraPosition, cross, dot, float, length, max, mix, normalize, pass, positionWorld, pow, saturate, sin, smoothstep, uniform,
  uniformArray, userData, uv, vec2, vec3, vec4,
} from "three/tsl";
import type { Session } from "../session.ts";
import type { GameEvent } from "../../sim/types.ts";
import { enemyMuzzles } from "../EnemiesView.tsx";
import { playerMuzzles } from "../PlayerView.tsx";
import { FRAME } from "../frame.ts";
import { useUi } from "../../ui/store.ts";
import { lookOwns } from "./fx.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** Tuning (sRGB-ish linear colours; > 1 = HDR, blooms a little). */
export const COMBAT = {
  /** Goon edge colour (warm coral: apart from the blue night, the magenta neon and the sodium lamps). */
  edge: [1.0, 0.34, 0.16] as const,
  /** Metres from the camera where the outline goes from its thin close-up form to the full range form. */
  far: [12, 28] as const,
  /** Outline radius in 720p pixels: the bright edge / the dark keyline around it (lifts the edge off
   *  bright shop windows and lamps). */
  radius: [1.6, 3.4] as const,
  /** How much a far goon's own colour is lifted (x its albedo) + a warm floor. */
  fill: 0.9,
  floor: 0.1,
  fireSecs: 0.45,
  hitSecs: 0.22,
  enemy: [1.0, 0.16, 0.1] as const,
  player: [1.0, 0.76, 0.36] as const,
  /** Where the player's shots land (impact sparks, hit bursts): white-gold, never red / orange. */
  playerHit: [2.4, 2.1, 1.55] as const,
  /** Dark keyline strength (close, far): the ring outside the bright edge. */
  keyline: [0.55, 0.85] as const,
  /** Far silhouette: how much of a far goon is painted flat in the edge colour, and its slow breathing. */
  silhouette: 0.4,
  breathHz: 0.9,
  /** Neon near a goon on screen: dimmed by this much within near[0] x her angular radius, fading out
   *  by near[1] x. */
  neonNear: { dim: 0.65, near: [1.4, 4.2] as const },
  /** Past the fight band: "glow" / "lit" materials and steam dim over these camera distances (m). */
  beyond: { from: 46, to: 74, glow: 0.55, lit: 0.4 },
};

/** Hostiles the neon dim looks at (room 1 has 8, the rave 11). */
const MAX_GOONS = 12;

/** Layer the enemy mask pass renders (goons + level occluders also stay on layer 0). */
export const MASK_LAYER = 7;
const OCCLUDER = new Vector4(0, 0, 0, 0);

/** Shared state (one street scene at a time). */
export const readFx = {
  /** 0 on the title / cutscene / kill cam, 1 in play. */
  strength: uniform(0),
  aspect: uniform(16 / 9),
  /** Real seconds (the silhouette's breathing). */
  time: uniform(0),
  /** Per live goon: xyz = unit direction from the camera to her chest, w = her angular radius (0 = none). */
  goons: uniformArray(Array.from({ length: MAX_GOONS }, () => new Vector4()), "vec4"),
  /** Per goon: x = visible (1 + hit flash), y = firing flash. userData.rpMask on its meshes. */
  masks: [] as Vector4[],
  fire: [] as number[],
  hit: [] as number[],
};

// ------------------------------------------------------------------ enemy mask + outline (post)
const isLevelMat = (m: Material): boolean =>
  (m.constructor === (MeshStandardNodeMaterial as unknown) || m.constructor === (MeshBasicNodeMaterial as unknown)) && !m.userData.rpOwn && !m.transparent;

/** Goon roots seen by the last full walk: re-tagged every few frames, so a Milady model that just
 *  finished loading is outlined at once. */
const goonRoots = new Set<Object3D>();

/** Tags goon meshes (their per-goon mask vector) and opaque level meshes (occluders) for the mask pass. */
function tag(o: Object3D, goon: Vector4 | null, actor: boolean): void {
  let g = goon, a = actor;
  if (o.name.startsWith("goon-")) {
    const i = Number(o.name.slice(5));
    g = readFx.masks[i] ??= new Vector4();
    goonRoots.add(o);
  } else if (o.name.startsWith("radbro-") || o.name.startsWith("crowd-")) a = true;
  const mesh = o as Mesh & { isSkinnedMesh?: boolean };
  if (mesh.isMesh) {
    if (g) {
      o.layers.enable(MASK_LAYER);
      o.userData.rpMask = g;
    } else if (!a && !mesh.isSkinnedMesh) { // level boxes are batched into InstancedMeshes by the engine
      const mm = mesh.material;
      const ok = Array.isArray(mm) ? mm.every(isLevelMat) : !!mm && isLevelMat(mm);
      if (ok) { o.layers.enable(MASK_LAYER); o.userData.rpMask = OCCLUDER; }
    }
  }
  for (const c of o.children) tag(c, g, a);
}

/** The enemy mask pass: r = goon coverage (+ hit flash), g = firing flash, b = distance (m). */
export function enemyMaskPass(scene: Scene, camera: Camera, gl: WebGPURenderer): PassNode {
  const mat = new MeshBasicNodeMaterial();
  mat.fog = false;
  const m: N = userData("rpMask", "vec4");
  const d: N = length(positionWorld.sub(cameraPosition));
  mat.colorNode = vec4(m.x, m.y, d.mul(m.x.greaterThan(0.5).select(float(1), float(0))), 1);
  const layers = new Layers();
  layers.set(MASK_LAYER);
  const p = pass(scene, camera, { samples: 0 }) as N as PassNode;
  p.setLayers(layers);
  p.overrideMaterial = mat;
  p.setResolutionScale(0.5);
  // no sky in the mask: clear to zero
  const base = p.updateBefore.bind(p);
  const cc = new Color();
  p.updateBefore = (frame: N) => {
    const bg = scene.background, bgn = (scene as N).backgroundNode;
    const ca = gl.getClearAlpha();
    gl.getClearColor(cc);
    scene.background = null;
    (scene as N).backgroundNode = null;
    gl.setClearColor(0x000000, 0);
    try { return base(frame); } finally {
      scene.background = bg;
      (scene as N).backgroundNode = bgn;
      gl.setClearColor(cc, ca);
    }
  };
  return p;
}

/** Composites the goon outline / fill / flashes onto the HDR image (before tone mapping). `edge` swaps
 *  the outline colour (the club's pink-red rim instead of the street's coral), `silhouette` the far fill. */
export function enemyOutline(hdr: N, maskPass: PassNode, edgeColour: readonly [number, number, number] = COMBAT.edge, silhouette: number = COMBAT.silhouette): N {
  const tex: N = (maskPass as N).getTextureNode("output");
  const at = uv();
  const c: N = tex.sample(at);
  const r0 = COMBAT.radius[0] / 720, r1 = COMBAT.radius[1] / 720;
  let in1: N = float(0), in2: N = float(0), dist: N = c.b, fire: N = c.g;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.71, 0.71], [-0.71, 0.71], [0.71, -0.71], [-0.71, -0.71]];
  for (const [x, y] of DIRS) {
    const o1 = tex.sample(at.add(vec2(float(x * r0).div(readFx.aspect), y * r0)));
    const o2 = tex.sample(at.add(vec2(float(x * r1).div(readFx.aspect), y * r1)));
    in1 = max(in1, saturate(o1.r));
    in2 = max(in2, saturate(o2.r));
    dist = max(dist, max(o1.b, o2.b));
    fire = max(fire, max(o1.g, o2.g));
  }
  const cov = saturate(c.r);
  const hit = saturate(c.r.sub(1));
  const far = smoothstep(COMBAT.far[0], COMBAT.far[1], dist);
  const edge = saturate(in1.sub(cov));
  const key = saturate(in2.sub(max(in1, cov)));
  const S: N = readFx.strength;
  const a = edge.mul(mix(0.45, 1.0, far)).mul(S);
  const E = vec3(...edgeColour);
  const R = vec3(...COMBAT.enemy);
  const edgeCol = mix(E.mul(1.6), R.mul(2.4), saturate(fire));
  // the dark keyline first (a solid ring, the thing a neon tube never has), then the bright edge over it
  let out: N = hdr.mul(float(1).sub(key.mul(mix(COMBAT.keyline[0], COMBAT.keyline[1], far)).mul(S)));
  out = mix(out, edgeCol, saturate(a).mul(0.92));
  // fill: a far goon's own colours lifted plus a warm floor; firing = red glow, hit = white flash
  const lift = hdr.mul(far.mul(COMBAT.fill)).add(E.mul(far.mul(COMBAT.floor))).add(R.mul(c.g.mul(0.6)));
  out = out.add(lift.mul(cov).mul(S));
  // from range the body is a solid, slowly breathing silhouette in the edge colour (a figure, not a line)
  const breath = sin(readFx.time.mul(Math.PI * 2 * COMBAT.breathHz)).mul(0.5).add(0.5);
  const sil = cov.mul(far).mul(silhouette).mul(mix(0.7, 1.0, breath)).mul(S);
  out = mix(out, mix(E.mul(0.9), R.mul(1.6), saturate(fire)), saturate(sil));
  out = mix(out, vec3(1.3, 1.2, 1.15), hit.mul(0.6).mul(S));
  return out;
}

/**
 * Multiplier for the street's emitters (street.tsx gain()): 1 = untouched. "glow" (neon, lamps) dims
 * near a live goon on screen and past the fight band; "lit" (facade windows) only past the band.
 * Only in play (readFx.strength): the title and the cutscenes keep the full neon.
 */
export function neonDim(kind: "glow" | "lit"): N {
  const toFrag: N = positionWorld.sub(cameraPosition);
  const d: N = length(toFrag);
  const F = COMBAT.beyond;
  let k: N = smoothstep(F.from, F.to, d).mul(kind === "glow" ? F.glow : F.lit);
  if (kind === "glow") {
    const fd: N = normalize(toFrag);
    let near: N = float(0);
    for (let i = 0; i < MAX_GOONS; i++) {
      const g: N = readFx.goons.element(i);
      const r: N = max(g.w, 1e-4);
      const off: N = length(cross(fd, g.xyz)); // ~ the angle between the fragment and her, seen from the lens
      const on: N = g.w.greaterThan(0).and(dot(fd, g.xyz).greaterThan(0)).select(float(1), float(0));
      near = max(near, float(1).sub(smoothstep(r.mul(COMBAT.neonNear.near[0]), r.mul(COMBAT.neonNear.near[1]), off)).mul(on));
    }
    k = max(k, near.mul(COMBAT.neonNear.dim));
  }
  return float(1).sub(k.mul(readFx.strength));
}

// ------------------------------------------------------------------ range-assist gunfire overlay
class Quads {
  readonly mesh: Mesh;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private n = 0;
  readonly cap: number;
  constructor(cap: number, radial: boolean) {
    this.cap = cap;
    const g = new BufferGeometry();
    this.pos = new Float32Array(cap * 12);
    this.col = new Float32Array(cap * 12);
    const uvs = new Float32Array(cap * 8), idx: number[] = [];
    for (let i = 0; i < cap; i++) {
      uvs.set([0, 0, 0, 1, 1, 1, 1, 0], i * 8);
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    }
    g.setAttribute("position", new BufferAttribute(this.pos, 3));
    g.setAttribute("rpCol", new BufferAttribute(this.col, 3));
    g.setAttribute("uv", new BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.boundingSphere = new Sphere(new Vector3(), 1e6);
    g.setDrawRange(0, 0);
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
    m.fog = false;
    m.userData.rpOwn = true;
    const q: N = uv();
    // radial: a hot core in a soft glow; line: soft across its width (v), full along it
    const prof: N = radial
      ? pow(saturate(float(1).sub(length(q.sub(0.5).mul(2)))), 2.2)
      : smoothstep(1, 0.15, abs(q.y.mul(2).sub(1)));
    m.colorNode = vec4((attribute("rpCol", "vec3") as N).mul(prof), 1);
    this.mesh = new Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }
  begin(): void { this.n = 0; }
  /** Four corners (a0 a1 at the start, b1 b0 at the end) with a colour at each end. */
  quad(a0: Vector3, a1: Vector3, b1: Vector3, b0: Vector3, ca: readonly number[], cb: readonly number[]): void {
    if (this.n >= this.cap) return;
    const o = this.n * 12;
    this.pos.set([a0.x, a0.y, a0.z, a1.x, a1.y, a1.z, b1.x, b1.y, b1.z, b0.x, b0.y, b0.z], o);
    this.col.set([ca[0], ca[1], ca[2], ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cb[0], cb[1], cb[2]], o);
    this.n++;
  }
  end(): void {
    const g = this.mesh.geometry;
    g.setDrawRange(0, this.n * 6);
    (g.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (g.getAttribute("rpCol") as BufferAttribute).needsUpdate = true;
  }
  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as Material).dispose(); }
}

type Fx = { kind: "tracer" | "glow"; a: Vector3; b: Vector3; life: number; max: number; world: boolean; col: readonly number[]; px: number; minD: number; enemy: boolean };

const V = { cam: new Vector3(), fwd: new Vector3(), right: new Vector3(), up: new Vector3(), d: new Vector3(), s: new Vector3(), t: new Vector3(), c0: new Vector3(), c1: new Vector3(), c2: new Vector3(), c3: new Vector3(), h: new Vector3(), tl: new Vector3() };
const scaled = (c: readonly number[], k: number) => [c[0] * k, c[1] * k, c[2] * k];

/** Combat readability: tags the goons for the mask pass, drives their flashes and draws the range assist. */
export function CombatRead({ s }: { s: Session }) {
  const scene = useThree(st => st.scene);
  const o = useMemo(() => ({ lines: new Quads(96, false), glows: new Quads(96, true), fx: [] as Fx[], n: 0, run: -1 }), []);
  useEffect(() => {
    lookOwns.tracers = true;
    return () => { lookOwns.tracers = false; o.lines.dispose(); o.glows.dispose(); };
  }, [o]);

  useEffect(() => {
    const push = (f: Omit<Fx, "life">) => { if (o.fx.length < 80) o.fx.push({ ...f, life: 0 }); };
    const off = s.on((e: GameEvent) => {
      switch (e.type) {
        case "shot": {
          const me = e.shooter === -1;
          const mz = me ? playerMuzzles[e.hand] : enemyMuzzles[e.shooter];
          const from = mz && mz.lengthSq() > 0 ? mz.clone() : new Vector3(e.ox, e.oy, e.oz);
          if (!me && e.pellet === 0) {
            readFx.fire[e.shooter] = 1;
            push({ kind: "glow", a: from.clone(), b: from, max: 0.14, world: true, col: scaled(COMBAT.enemy, 3.6), px: 26, minD: 6, enemy: true });
          }
          if (!e.projectile) {
            const to = new Vector3(e.ex, e.ey, e.ez);
            if (to.distanceTo(from) > 60) to.sub(from).setLength(60).add(from);
            // shotgun pellets: hairline tracers at half the strength (8 at once must not cover the screen)
            const k = e.weapon === "shotgun" ? 0.45 : 1;
            push({ kind: "tracer", a: from, b: to, max: me ? 0.14 : 0.2, world: false, col: scaled(me ? COMBAT.player : COMBAT.enemy, (me ? 1.8 : 2.4) * k), px: (me ? 1.5 : 2.2) * (k < 1 ? 0.6 : 1), minD: 0, enemy: !me });
          }
          break;
        }
        case "impact":
          // only his shots get a glow where they land (the gang's misses must not read as his hits)
          if (e.shooter === -1) push({ kind: "glow", a: new Vector3(e.x + e.nx * 0.05, e.y + e.ny * 0.05, e.z + e.nz * 0.05), b: V.t, max: 0.13, world: true, col: COMBAT.playerHit, px: 11, minD: 9, enemy: false });
          break;
        case "blood":
          if (e.target >= 0) {
            readFx.hit[e.target] = 1;
            push({ kind: "glow", a: new Vector3(e.x, e.y, e.z), b: V.t, max: 0.14, world: true, col: scaled(COMBAT.playerHit, 1.1), px: 16, minD: 7, enemy: false });
          }
          break;
      }
    });
    return off;
  }, [s, o]);

  useFrame((st, raw) => {
    const g = s.game;
    const dt = Math.min(raw, 0.1);
    const ts = s.paused ? 0 : g.timeScale;
    if (o.run !== s.run) { o.run = s.run; o.fx.length = 0; readFx.fire.length = 0; readFx.hit.length = 0; }
    // strength: only in play (not on the title, in the cutscene or the kill cam)
    const scr = useUi.getState().screen;
    const want = (scr === "play" || scr === "paused" || scr === "results") && g.phase !== "killcam" ? 1 : 0;
    readFx.strength.value += (want - readFx.strength.value) * Math.min(1, dt * 6);
    const size = st.gl.domElement;
    readFx.aspect.value = size.clientWidth / Math.max(1, size.clientHeight);
    readFx.time.value = performance.now() / 1000;
    // tag new meshes (models load late): the whole scene every 30 frames, the goons every 3
    if (o.n++ % 30 === 0) { goonRoots.clear(); tag(scene, null, false); }
    else if (o.n % 3 === 0) for (const r of goonRoots) tag(r, null, false);
    // per-goon mask values
    for (let i = 0; i < g.enemies.length; i++) {
      const e = g.enemies[i];
      const m = readFx.masks[i] ??= new Vector4();
      readFx.fire[i] = Math.max(0, (readFx.fire[i] ?? 0) - dt / COMBAT.fireSecs);
      readFx.hit[i] = Math.max(0, (readFx.hit[i] ?? 0) - dt / COMBAT.hitSecs);
      const live = e.state !== "dead" && e.state !== "inactive";
      m.set(live ? 1 + readFx.hit[i] : 0, live ? readFx.fire[i] : 0, 0, 0);
    }
    // where the live goons are, seen from the lens (the neon near them dims)
    {
      const cam = st.camera;
      cam.getWorldPosition(V.cam);
      const arr = readFx.goons.array as Vector4[];
      for (let i = 0; i < MAX_GOONS; i++) {
        const e = g.enemies[i];
        const p = s.renderE[i] ?? e;
        if (!e || !p || e.state === "dead" || e.state === "inactive") { arr[i].set(0, 0, 0, 0); continue; }
        V.d.set(p.x, p.y + (e.crouch ? 0.7 : 1.05), p.z).sub(V.cam);
        const dist = V.d.length();
        if (dist < 3 || dist > 90) { arr[i].set(0, 0, 0, 0); continue; }
        V.d.divideScalar(dist);
        arr[i].set(V.d.x, V.d.y, V.d.z, Math.max(0.012, 0.85 / dist));
      }
    }

    // range assist
    const cam = st.camera as PerspectiveCamera;
    cam.updateMatrixWorld();
    V.cam.setFromMatrixPosition(cam.matrixWorld);
    V.right.setFromMatrixColumn(cam.matrixWorld, 0);
    V.up.setFromMatrixColumn(cam.matrixWorld, 1);
    V.fwd.setFromMatrixColumn(cam.matrixWorld, 2).negate();
    const pxW = (2 * Math.tan(((cam.fov ?? 68) * Math.PI) / 360)) / 720; // world size of one 720p pixel at 1 m
    const L = o.lines, G = o.glows;
    L.begin(); G.begin();
    const glow = (p: Vector3, px: number, col: readonly number[], minD: number, k: number) => {
      const d = p.distanceTo(V.cam);
      const fade = minD > 0 ? Math.min(1, Math.max(0, (d - minD) / (minD * 0.8))) : 1;
      if (fade * k <= 0.01) return;
      const h = (px * d * pxW) / 2;
      V.h.subVectors(V.cam, p).setLength(Math.min(0.5, h * 0.6)).add(p); // pulled toward the lens: never half inside cover
      const c = scaled(col, fade * k);
      V.c0.copy(V.h).addScaledVector(V.right, -h).addScaledVector(V.up, -h);
      V.c1.copy(V.h).addScaledVector(V.right, -h).addScaledVector(V.up, h);
      V.c2.copy(V.h).addScaledVector(V.right, h).addScaledVector(V.up, h);
      V.c3.copy(V.h).addScaledVector(V.right, h).addScaledVector(V.up, -h);
      G.quad(V.c0, V.c1, V.c2, V.c3, c, c);
    };
    const depth = (p: Vector3) => V.d.subVectors(p, V.cam).dot(V.fwd);
    const line = (a0: Vector3, b0: Vector3, px: number, minW: number, ca: readonly number[], cb: readonly number[], near = 0.6) => {
      // clip to the part in front of the lens (a goon's miss runs on past the camera)
      const da = depth(a0), db = depth(b0);
      if (da < near && db < near) return;
      let a = a0, b = b0;
      if (da < near) a = V.c0.lerpVectors(a0, b0, (near - da) / (db - da)).clone();
      if (db < near) b = V.c1.lerpVectors(a0, b0, (da - near) / (da - db)).clone();
      V.d.subVectors(b, a);
      if (V.d.lengthSq() < 1e-6) return;
      const wa = Math.max(minW, px * a.distanceTo(V.cam) * pxW) / 2, wb = Math.max(minW, px * b.distanceTo(V.cam) * pxW) / 2;
      V.s.subVectors(a, V.cam).cross(V.d).normalize();
      V.t.subVectors(b, V.cam).cross(V.d).normalize();
      V.c0.copy(a).addScaledVector(V.s, -wa);
      V.c1.copy(a).addScaledVector(V.s, wa);
      V.c2.copy(b).addScaledVector(V.t, wb);
      V.c3.copy(b).addScaledVector(V.t, -wb);
      L.quad(V.c0, V.c1, V.c2, V.c3, ca, cb);
    };
    for (let i = o.fx.length - 1; i >= 0; i--) {
      const f = o.fx[i];
      f.life += f.world ? dt * Math.max(ts, s.paused ? 0 : 0.2) : s.paused ? 0 : dt;
      const u = f.life / f.max;
      if (u >= 1) { o.fx.splice(i, 1); continue; }
      if (f.kind === "glow") {
        glow(f.a, f.px * (1 + 0.3 * u), f.col, f.minD, u < 0.4 ? 1 : 1 - (u - 0.4) / 0.6);
      } else {
        // hitscan: the whole line from the muzzle to the hit shows at once and fades. The player's
        // tail runs out to the hit (hot at the hit end: where the shot landed); a goon's shot stays
        // anchored and hot at the shooter, cooler toward the player (it points at who fired)
        const k = u < 0.35 ? 1 : 1 - (u - 0.35) / 0.65;
        if (f.enemy) {
          line(f.a, f.b, f.px, 0.008, scaled(f.col, k), scaled(f.col, 0.3 * k), 2.5);
        } else {
          const len = f.a.distanceTo(f.b);
          const tail = len * Math.max(0, (u - 0.2) / 0.8) ** 1.5;
          V.h.subVectors(f.b, f.a).normalize();
          const tp = V.tl.copy(f.a).addScaledVector(V.h, tail).clone();
          line(tp, f.b, f.px, 0.008, scaled(f.col, 0.35 * k), scaled(f.col, k));
        }
      }
    }
    // bullet-time bullets: a glowing head + a short trail that keep a minimum size downrange
    for (const b of g.projectiles) {
      if (!b.alive) continue;
      const col = b.shooter === -1 ? scaled(COMBAT.player, 2) : scaled(COMBAT.enemy, 2.4);
      V.h.set(b.x, b.y, b.z);
      const back = Math.min(4, Math.hypot(b.x - b.sx, b.y - b.sy, b.z - b.sz));
      V.tl.set(b.x - b.dx * back, b.y - b.dy * back, b.z - b.dz * back);
      const d = V.h.distanceTo(V.cam);
      const fade = Math.min(1, Math.max(0, (d - 5) / 5));
      if (fade <= 0) continue;
      line(V.tl.clone(), V.h.clone(), 1.6, 0.006, [0, 0, 0], scaled(col, 0.8 * fade));
      glow(V.h.clone(), 8, col, 5, 1);
    }
    L.end(); G.end();
  }, FRAME.fx);

  return (
    <>
      <primitive object={o.lines.mesh} />
      <primitive object={o.glows.mesh} />
    </>
  );
}
