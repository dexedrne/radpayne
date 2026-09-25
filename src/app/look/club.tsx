// Room 2's look (round-2 plan section 8): the rave inside CLUB MILADY. Readability first: no rain, no
// planar reflector, thin haze, bloom <= 0.35 with a high threshold, every hostile rim-lit.
//
// Two light states (clubFx.fight 0..1, crossfaded over 1.2 s):
//   party (the room start, and again for the final-kill cam and the clear): dim, lasers sweeping, the
//     LED floor and the LED wall animated at 128 BPM, the mirror ball turning, two coloured moving
//     lights over the dancers;
//   fight (from the first shot, the Max Payne "the music stops" beat): the lasers stutter twice (never
//     faster than 3 Hz) and go out, the LED floor drops to a dim static deep red, the LED wall to a
//     slow 40 % pulse on its dark / cyan frames only (the pink frames sat right behind the stage
//     goons' pink-red rim: REVIEW F11), and warm work lights come up (ambient x1.6 + the overheads),
//     so every hostile reads clearly for the whole fight. No strobes, ever.
// Level materials follow the shared name tokens (tokens.ts): glow / party / worklight / ledfloor /
// ledwall, repeat textures in world space. Hostiles ("goon-" roots, the heavies too) get their lift
// (0.32) and the pink-red fresnel rim; the post pass outlines them in the same colour. The crowd keeps
// its own look (CrowdView: desaturated, 0.12 lift, cyan glow sticks, no rim).
// Lasers: at most 12 additive hairline beams (6 on Low), opacity <= 0.2, faded out within ~12 % of the
// screen width around the crosshair, so a beam never crosses the aim point at full strength.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshStandardMaterial, PointLight, RepeatWrapping, SphereGeometry, Sphere, TextureLoader, Vector3,
  type Material, type Object3D, type Texture,
} from "three";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, RenderPipeline, type WebGPURenderer } from "three/webgpu";
import {
  abs, attribute, color, densityFogFactor, float, floor, fog, fract, hash, length, materialColor, mix, neutralToneMapping, pass, positionWorld,
  screenUV, smoothstep, texture, uniform, uv, vec2, vec3, vec4,
} from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import type { LevelData } from "../../world/level.ts";
import type { Session } from "../session.ts";
import { FRAME } from "../frame.ts";
import { clubPulse } from "../../audio/sfx.ts";
import { useUi } from "../../ui/store.ts";
import { MarkerLights } from "./lights.tsx";
import { CombatRead, enemyMaskPass, enemyOutline, neonDim, readFx } from "./read.tsx";
import { CameraKey, HOSTILE_RIM, WORLD_UV, hostileEmissive, isActor, readTokens, type Tokens } from "./tokens.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** Readability numbers (plan section 8). */
export const CLUB = {
  exposure: 1.3,
  bloom: { strength: 0.3, radius: 0.25, threshold: 0.85 },
  fog: { color: "#1a1420", density: 0.008 },
  background: "#050407",
  hemi: { party: { sky: "#3b2c58", ground: "#150d1a", intensity: 0.7 }, fight: { sky: "#8a8290", ground: "#2e2628", intensity: 1.12 } },
  key: { party: 0.75, fight: 1.05 },
  /** Work lights (warm white point lights at the "worklight" fx markers) at full fight. */
  work: { color: "#ffe6c8", intensity: 60, distance: 20 },
  /** Hostiles: their own texture lifted by this (the heavies get a flat lift in HeavyView). */
  hostileLift: 0.32,
  /** The LED floor's peak gain (capped at 0.6 of the neon's ~1.4-1.8); the fight's deep red. */
  ledFloor: { party: 0.7, fight: 0.14 },
  ledWall: { party: 0.72, fight: 0.4 * 0.72 },
  lasers: { high: 12, low: 6, opacity: 0.2, width: 0.018, clear: [0.035, 0.12] as const },
  vignette: 0.16,
};
const BPM = 128;
/** Dev: ?look=fight holds the fight state (the readability check frames). */
const FORCE_FIGHT = import.meta.env.MODE !== "production" && new URLSearchParams(location.search).get("look") === "fight";
const FIGHT_FADE = 1.2;
/** The LED wall atlas: 4 x 2 frames (row 0 on top): 0 heart, 1 heart burst, 2 bow, 3 wink, 4 cyan
 *  tunnel, 5 stars, 6 kiss, 7 glitter. The fight plays only the dark / cyan ones. */
const FIGHT_FRAMES = [4, 5, 7];
/** The hostile rim colour for the post outline (the same pink-red as the material rim). */
const RIM_EDGE: readonly [number, number, number] = [1.0, 0.22, 0.36];

/** Shared clocks (one club at a time). */
export const clubFx = {
  time: uniform(0),
  /** Beats since the room started (128 BPM on the club's clock). */
  beat: uniform(0),
  pulse: uniform(0),
  /** 0 = party, 1 = fight. */
  fight: uniform(0),
  flicker: uniform(1),
  blink: uniform(1),
  /** The LED wall's frame (party) and its fight frame. */
  frame: uniform(0),
  fightFrame: uniform(4),
  wallPulse: uniform(1),
};

// ------------------------------------------------------------------ level material rules
function gain(t: Tokens): N {
  let g: N = float(t.k);
  if (t.pulse) g = g.mul(mix(0.78, 1.3, clubFx.pulse));
  if (t.flicker) g = g.mul(clubFx.flicker);
  if (t.blink) g = g.mul(clubFx.blink);
  return g;
}

/** The atlas frame `f` (0..7) sampled at uv in a 4 x 2 grid (row 0 at the top of the image). */
function frameUV(q: N, f: N): N {
  const col = f.mod(4), row = floor(f.div(4));
  return vec2(col.add(q.x).div(4), float(1).sub(row.add(float(1).sub(q.y)).div(2)));
}

function ledWallColor(map: Texture): N {
  // square tiles across the wall (16 x 6 m face): u repeats ~2.7 times
  const q = vec2(fract(uv().x.mul(16 / 6)), uv().y);
  const party: N = texture(map, frameUV(q, clubFx.frame)).rgb;
  const fight: N = texture(map, frameUV(q, clubFx.fightFrame)).rgb;
  // the LED dot mask: round diodes on a ~5 cm pitch
  const d = length(fract(vec2(uv().x.mul(16), uv().y.mul(6)).mul(20)).sub(0.5));
  const dots = smoothstep(0.5, 0.28, d).mul(0.75).add(0.25);
  const k = mix(float(CLUB.ledWall.party), float(CLUB.ledWall.fight).mul(clubFx.wallPulse), clubFx.fight);
  return mix(party, fight, clubFx.fight).mul(dots).mul(k);
}

function ledFloorColor(map: Texture): N {
  const p: N = positionWorld.xz;
  const cell: N = floor(p.div(0.5));
  const seed = cell.x.add(64).mul(131).add(cell.y.add(64));
  const h = hash(seed);
  // party: waves out from the middle on the beat, each cell its own hue among pink / cyan / violet / white
  const ring = fract(clubFx.beat.mul(0.5).sub(length(p).mul(0.12)).add(h.mul(0.35)));
  const on = smoothstep(0.55, 0.95, ring).mul(0.8).add(0.2);
  const hue = floor(h.mul(4));
  const pink = vec3(1.0, 0.16, 0.6), cyan = vec3(0.15, 0.95, 1.0), violet = vec3(0.55, 0.25, 1.0), white = vec3(0.9, 0.85, 1.0);
  const tint: N = mix(mix(pink, cyan, hue.equal(1).select(float(1), float(0))), mix(violet, white, hue.equal(3).select(float(1), float(0))), hue.greaterThan(1.5).select(float(1), float(0)));
  const mask: N = texture(map, p.mul(0.5)).r; // the frosted cell with its grout
  const party = tint.mul(on).mul(CLUB.ledFloor.party);
  const fight = vec3(0.9, 0.04, 0.05).mul(CLUB.ledFloor.fight);
  return mix(party, fight, clubFx.fight).mul(mask.mul(1.3));
}

function isLevelMaterial(m: Material): m is MeshStandardNodeMaterial | MeshBasicNodeMaterial {
  return m.constructor === MeshStandardNodeMaterial || m.constructor === MeshBasicNodeMaterial;
}

function applyClubRules(m: Material): void {
  if (!isLevelMaterial(m) || m.userData.rpOwn) return;
  const map = (m as { map?: Texture | null }).map ?? null;
  const repeat = !!map && map.wrapS === RepeatWrapping;
  const t = readTokens(m.name ?? "");
  if (!repeat && !t.kind && m.userData.rpLook === undefined) return;
  const sig = `club|${m.name}|${map ? map.uuid : ""}`;
  if (m.userData.rpLook === sig) return;
  m.userData.rpLook = sig;
  m.contextNode = repeat && t.kind !== "ledfloor" ? WORLD_UV : null;
  m.colorNode = null;
  const std = m.constructor === MeshStandardNodeMaterial ? (m as MeshStandardNodeMaterial) : null;
  if (std) { std.emissiveNode = null; std.roughnessNode = null; }
  if (t.kind === "glow") m.colorNode = materialColor.mul(gain(t)).mul(neonDim("glow"));
  else if (t.kind === "party") m.colorNode = materialColor.mul(gain(t)).mul(neonDim("glow")).mul(mix(1, 0.1, clubFx.fight));
  else if (t.kind === "worklight") m.colorNode = materialColor.mul(mix(0.05, t.k, clubFx.fight));
  else if (t.kind === "ledwall" && map) m.colorNode = ledWallColor(map);
  else if (t.kind === "ledfloor" && map) m.colorNode = ledFloorColor(map);
  m.needsUpdate = true;
}

/** Hostile materials (under a "goon-" root): the Pockit ones take the lift of their own texture plus
 *  the rim; the heavies already carry theirs (HeavyView). */
function applyHostile(m: Material): void {
  if ((m.constructor as unknown) !== MeshStandardNodeMaterial || !m.userData.rpOwn || m.userData.rpHeavy) return;
  hostileEmissive(m as MeshStandardNodeMaterial, CLUB.hostileLift);
}

function walk(o: Object3D, hostile: boolean, actor: boolean): void {
  const h = hostile || o.name.startsWith("goon-");
  const a = actor || isActor(o);
  const mm = (o as Mesh).material;
  if (mm) for (const m of Array.isArray(mm) ? mm : [mm]) {
    if (h) applyHostile(m);
    else if (!a) applyClubRules(m);
  }
  for (const c of o.children) walk(c, h, a);
}

function ClubMaterials() {
  const scene = useThree(s => s.scene);
  const n = useRef(0);
  useFrame(() => {
    if (n.current++ % 10) return;
    walk(scene, false, false);
  });
  return null;
}

// ------------------------------------------------------------------ lasers
type Laser = { x: number; y: number; z: number; col: Color; ph: number; sp: number };

function makeLaserMesh(n: number): { mesh: Mesh; pos: Float32Array; col: Float32Array } {
  const g = new BufferGeometry();
  const pos = new Float32Array(n * 12), col = new Float32Array(n * 12), uvs = new Float32Array(n * 8);
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    uvs.set([0, 0, 0, 1, 1, 1, 1, 0], i * 8);
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("rpCol", new BufferAttribute(col, 3));
  g.setAttribute("uv", new BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.boundingSphere = new Sphere(new Vector3(), 1e6);
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
  m.fog = false;
  m.userData.rpOwn = true;
  const q: N = uv();
  const across = smoothstep(1, 0.1, abs(q.y.mul(2).sub(1)));
  const along = mix(1, 0.35, q.x); // brighter at the emitter
  // never full strength on the aim point: faded within ~12 % of the screen width of the crosshair
  const d = length(vec2(screenUV.x.sub(0.5), screenUV.y.sub(0.5).div(readFx.aspect)));
  const clear = smoothstep(CLUB.lasers.clear[0], CLUB.lasers.clear[1], d);
  // additive: "opacity" is the share of the beam colour added (<= 0.2 at the core, x4 for the HDR colour)
  m.colorNode = vec4((attribute("rpCol", "vec3") as N).mul(across).mul(along).mul(clear).mul(CLUB.lasers.opacity * 4), 1);
  const mesh = new Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return { mesh, pos, col };
}

const LV = { a: new Vector3(), b: new Vector3(), cam: new Vector3(), d: new Vector3(), s: new Vector3() };

function Lasers({ level, low }: { level: LevelData; low: boolean }) {
  const lasers = useMemo<Laser[]>(() => level.markers.filter(m => m.kind === "fx" && m.data.fx === "laser").slice(0, CLUB.lasers.high).map((m, i) => ({
    x: m.x, y: m.y, z: m.z, col: new Color(String(m.data.color ?? "#ff3fa8")).multiplyScalar(1.6), ph: i * 1.7, sp: 0.35 + (i % 3) * 0.13,
  })), [level]);
  const L = useMemo(() => makeLaserMesh(Math.max(1, lasers.length)), [lasers]);
  useEffect(() => () => { L.mesh.geometry.dispose(); (L.mesh.material as Material).dispose(); }, [L]);
  const st = useRef({ stutterT: -1, lastFight: 0 });
  useFrame((state, raw) => {
    const cam = state.camera;
    cam.getWorldPosition(LV.cam);
    const fight = clubFx.fight.value;
    const t = clubFx.time.value;
    // the stutter when the fight starts: off-on-off-on-off at <= 3 Hz over 0.8 s, then dark
    const c = st.current;
    if (fight > 0.02 && c.lastFight <= 0.02) c.stutterT = 0;
    c.lastFight = fight;
    let k = 1 - fight;
    if (c.stutterT >= 0) {
      c.stutterT += Math.min(0.1, raw);
      const phase = Math.floor(c.stutterT / 0.17);
      k = c.stutterT < 0.85 ? (phase % 2 === 0 ? 0.9 : 0) : 0;
      if (c.stutterT >= 0.85) c.stutterT = -1;
    }
    const n = low ? CLUB.lasers.low : CLUB.lasers.high;
    let drawn = 0;
    if (k > 0.01) {
      lasers.forEach((l, i) => {
        if (i >= n) return;
        // sweep a point over the dance floor (a slow lissajous), the beam from the head to it
        const u = t * l.sp + l.ph;
        LV.a.set(l.x, l.y, l.z);
        LV.b.set(Math.sin(u) * 7.5, 0.05 + 1.2 * (0.5 + 0.5 * Math.sin(u * 1.7)), Math.cos(u * 0.8 + i) * 6.5);
        LV.d.subVectors(LV.b, LV.a);
        const len = LV.d.length();
        LV.d.divideScalar(len);
        LV.b.copy(LV.a).addScaledVector(LV.d, Math.min(len * 1.4, 28));
        LV.s.subVectors(LV.a, LV.cam).cross(LV.d).normalize().multiplyScalar(CLUB.lasers.width / 2);
        const o = drawn * 12;
        L.pos.set([LV.a.x - LV.s.x, LV.a.y - LV.s.y, LV.a.z - LV.s.z, LV.a.x + LV.s.x, LV.a.y + LV.s.y, LV.a.z + LV.s.z, LV.b.x + LV.s.x, LV.b.y + LV.s.y, LV.b.z + LV.s.z, LV.b.x - LV.s.x, LV.b.y - LV.s.y, LV.b.z - LV.s.z], o);
        const r = l.col.r * k, g = l.col.g * k, b = l.col.b * k;
        L.col.set([r, g, b, r, g, b, r, g, b, r, g, b], o);
        drawn++;
      });
    }
    const g = L.mesh.geometry;
    g.setDrawRange(0, drawn * 6);
    (g.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (g.getAttribute("rpCol") as BufferAttribute).needsUpdate = true;
  }, FRAME.fx);
  return <primitive object={L.mesh} />;
}

// ------------------------------------------------------------------ lights that change with the state
function StateLights({ level, low }: { level: LevelData; low: boolean }) {
  const scene = useThree(s => s.scene);
  const work = useMemo(() => level.markers.filter(m => m.kind === "fx" && m.data.fx === "worklight").map(m => {
    const l = new PointLight(CLUB.work.color, 0, CLUB.work.distance, 2);
    l.position.set(m.x, m.y, m.z);
    l.userData.k = typeof m.data.intensity === "number" ? m.data.intensity : 1;
    return l;
  }), [level]);
  const party = useMemo(() => [new PointLight("#ff3fb0", 0, 16, 2), new PointLight("#3feaff", 0, 16, 2)], []);
  const hemi = useRef<{ color: Color; groundColor: Color; intensity: number } | null>(null);
  const keyI = useMemo(() => ({ value: CLUB.key.party }), []);
  const P = CLUB.hemi.party, F = CLUB.hemi.fight;
  const cP = useMemo(() => ({ s: new Color(P.sky), g: new Color(P.ground), fs: new Color(F.sky), fg: new Color(F.ground) }), [P, F]);
  useEffect(() => {
    for (const l of [...work, ...party]) scene.add(l);
    return () => { for (const l of [...work, ...party]) scene.remove(l); };
  }, [scene, work, party]);
  useFrame(() => {
    const f = clubFx.fight.value;
    for (const l of work) l.intensity = CLUB.work.intensity * f * (l.userData.k as number);
    const t = clubFx.time.value;
    party.forEach((l, i) => {
      l.intensity = (1 - f) * (low ? 26 : 34);
      const u = t * 0.45 + i * Math.PI;
      l.position.set(Math.sin(u) * 6, 4.5, Math.cos(u * 0.8) * 5);
    });
    const h = hemi.current;
    if (h) {
      h.color.copy(cP.s).lerp(cP.fs, f);
      h.groundColor.copy(cP.g).lerp(cP.fg, f);
      h.intensity = P.intensity + (F.intensity - P.intensity) * f;
    }
    keyI.value = CLUB.key.party + (CLUB.key.fight - CLUB.key.party) * f;
  }, FRAME.fx);
  return (
    <>
      <hemisphereLight ref={hemi as never} args={[P.sky, P.ground, P.intensity]} />
      <CameraKey color="#e8e4ff" intensity={keyI} />
    </>
  );
}

// ------------------------------------------------------------------ the mirror ball (it turns)
function MirrorBall({ level, s }: { level: LevelData; s: Session }) {
  const m = level.markers.find(k => k.kind === "fx" && k.data.fx === "mirrorball");
  const ball = useMemo(() => {
    if (!m) return null;
    const tex = new TextureLoader().load("/textures/club/mirrorball_tiles.webp");
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.repeat.set(6, 3);
    const mat = new MeshStandardMaterial({ map: tex, roughness: 0.12, metalness: 0.8, emissive: new Color(0.12, 0.1, 0.14), emissiveMap: tex });
    mat.userData.rpOwn = true;
    const mesh = new Mesh(new SphereGeometry(typeof m.data.r === "number" ? m.data.r : 0.45, 28, 18), mat);
    mesh.position.set(m.x, m.y, m.z);
    return mesh;
  }, [m]);
  useEffect(() => () => { if (ball) { ball.geometry.dispose(); (ball.material as MeshStandardMaterial).map?.dispose(); (ball.material as Material).dispose(); } }, [ball]);
  useFrame((_, raw) => { if (ball) ball.rotation.y += Math.min(raw, 0.1) * 0.5 * (s.paused ? 1 : s.game.timeScale); }, FRAME.fx);
  return ball ? <primitive object={ball} /> : null;
}

// ------------------------------------------------------------------ render pipeline
function ClubPost({ low }: { low: boolean }) {
  const gl = useThree(s => s.gl) as unknown as WebGPURenderer;
  const scene = useThree(s => s.scene);
  const camera = useThree(s => s.camera);
  const p = useMemo(() => {
    const pipeline = new RenderPipeline(gl);
    const scenePass: N = pass(scene, camera, { samples: low ? 0 : 4 });
    const maskPass: N = enemyMaskPass(scene, camera, gl);
    const col: N = scenePass.getTextureNode("output");
    const B = CLUB.bloom;
    // only the HDR emitters bloom (threshold 0.85), gently: halos stay small, no body hides in one
    const b: N = bloom(col, low ? B.strength * 0.7 : B.strength, B.radius, B.threshold);
    b.setResolutionScale(low ? 0.25 : 0.5);
    let c: N = col.rgb.add(b.rgb);
    c = enemyOutline(c, maskPass, RIM_EDGE, 0.22);
    c = neutralToneMapping(c, float(CLUB.exposure));
    const v = smoothstep(0.5, 1.05, length(uv().sub(0.5).mul(vec2(1.0, 0.8))));
    c = c.mul(float(1).sub(v.mul(CLUB.vignette)));
    pipeline.outputNode = vec4(c, 1);
    return { pipeline, scenePass, maskPass };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, low]);
  useEffect(() => () => p.pipeline.dispose(), [p]);
  useFrame(st => {
    p.scenePass.camera = st.camera;
    p.maskPass.camera = st.camera;
    p.pipeline.render();
  }, 1);
  return null;
}

// ------------------------------------------------------------------ the look
export function ClubLook({ level, s, lowQuality }: { level: LevelData; s?: Session; lowQuality?: boolean }) {
  const scene = useThree(st => st.scene);
  const low = !!lowQuality;
  useEffect(() => {
    const prevBg = scene.backgroundNode, prevFog = scene.fogNode;
    scene.backgroundNode = color(CLUB.background);
    // a thin haze (density <= 0.010), a little thinner up in the truss
    scene.fogNode = fog(color(CLUB.fog.color), (densityFogFactor as N)(float(CLUB.fog.density)).mul(mix(float(1), float(0.6), smoothstep(3, 9, positionWorld.y)))) as N;
    return () => { scene.backgroundNode = prevBg; scene.fogNode = prevFog; };
  }, [scene]);

  // clocks + the state
  const st = useRef({ flickT: 0, flick: 1, wallT: 0, fightIdx: 0 });
  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.1);
    const g = s?.game;
    const ts = !s || s.paused ? 1 : g!.timeScale;
    const fx = clubFx;
    fx.time.value += dt * ts;
    fx.beat.value += dt * ts * (BPM / 60);
    let p = clubPulse();
    if (p < 0) p = Math.exp(-(fx.beat.value % 1) * 4);
    fx.pulse.value = p;
    // party -> fight at the first shot; back to the party for the final-kill cam and the clear
    const scr = useUi.getState().screen;
    const want = FORCE_FIGHT || (g && g.firstShotAt >= 0 && g.phase === "play" && (scr === "play" || scr === "paused")) ? 1 : 0;
    const f = fx.fight.value;
    fx.fight.value = want > f ? Math.min(1, f + dt / FIGHT_FADE) : Math.max(0, f - dt / FIGHT_FADE);
    // the LED wall: a new party frame every 4 beats; in the fight one dark / cyan frame every ~3 s, a slow 40 % pulse
    fx.frame.value = Math.floor(fx.beat.value / 4) % 8;
    const c = st.current;
    c.wallT += dt * ts;
    if (c.wallT > 3.2) { c.wallT = 0; c.fightIdx = (c.fightIdx + 1) % FIGHT_FRAMES.length; }
    fx.fightFrame.value = FIGHT_FRAMES[c.fightIdx];
    fx.wallPulse.value = 0.75 + 0.25 * Math.sin(fx.time.value * Math.PI * 0.5);
    c.flickT -= dt * ts;
    if (c.flickT <= 0) {
      c.flick = c.flick === 1 && Math.random() < 0.4 ? 0.1 + Math.random() * 0.3 : 1;
      c.flickT = c.flick < 1 ? 0.06 + Math.random() * 0.12 : 0.4 + Math.random() * 2.5;
    }
    fx.flicker.value = c.flick;
    fx.blink.value = Math.sin(fx.time.value * Math.PI * 1.25) > 0 ? 1 : 0.06;
  }, FRAME.fx);

  return (
    <>
      <StateLights level={level} low={low} />
      <MarkerLights level={level} />
      <ClubMaterials />
      <MirrorBall level={level} s={s!} />
      <Lasers level={level} low={low} />
      {s && <CombatRead s={s} />}
      <ClubPost low={low} />
    </>
  );
}

/** The hostile rim colour the HUD / other views can match. */
export const HOSTILE_RIM_COLOR = HOSTILE_RIM.color;
