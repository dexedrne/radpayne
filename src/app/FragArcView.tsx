// His frag held up (the grenade button held): the aim preview. The arc it will fly is the sim's own
// flight (Game.fragPreview, sim/frag.ts: the loft, every bounce, the fuse; bullet time slows the frag
// along the same path, so the arc holds in slow motion too), drawn as gold dashes that run from his hand
// toward the blast; a small ring where it touches something on the way; and where it goes off, the
// blast's reach (GRENADE.radius) as a ring on the floor (its width grows with the distance, a low rim
// wall stands on it so it reads edge on) with a faint fill and a marker at its centre. The ring turns
// hot red while he stands inside it himself (his share of his own blast).
// Read in every room: unlit, no fog, no tone mapping, a dark keyline under the gold (the rain, the neon,
// the club's dark, the roof's storm and its lightning), and whatever part of it cover hides still shows
// faintly through. It fades in over a beat, so a quick tap (a throw at once) never flashes it. Once he
// lets go, the ring (fainter, without the arc) stays where that frag goes off until it does.
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  type Blending, BufferAttribute, BufferGeometry, CircleGeometry, CylinderGeometry, DataTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, NormalBlending, RingGeometry, Vector3,
} from "three";
import type { Session } from "./session.ts";
import { FRAME } from "./frame.ts";
import { GRENADE } from "../sim/tuning.ts";
import { emptyPath, predictFrag } from "../sim/frag.ts";

/** The look (colours, sizes in metres unless noted). */
export const ARC = {
  gold: "#ffd35a",
  hot: "#ff4a2e",
  ink: "#0b0a0d",
  /** Dash and gap along the arc; how fast the dashes run (m/s, real time). */
  dash: 0.34,
  gap: 0.2,
  flow: 1.6,
  /** Half the line's width: at least `min`, else this share of the distance to the lens (a few px at any range). */
  width: { min: 0.016, perM: 0.0042 },
  /** The keyline's width over the gold's. */
  keyline: 2.1,
  /** The first 0.7 m by his hand is left out (it would cover him from the shoulder camera). */
  skip: 0.7,
  /** Seconds (real) to fade in after it comes up / out after it goes. */
  fadeIn: 0.14,
  fadeOut: 0.08,
  /** What shows through cover (x the full opacity): the arc, and the ring (less: it also crosses him). */
  ghost: 0.3,
  ringGhost: 0.14,
  /** The blast ring's line width and the centre marker's radius. */
  ring: 0.1,
  mark: 0.3,
  /** (blended in linear light: a few percent already shows on a dark floor) */
  fill: 0.022,
  /** The rim wall on the ring: its height and its opacity at the floor (it fades out upward). */
  wall: 0.26,
  wallA: 0.4,
  /** The ring of his frag in the air (x the preview's). */
  inFlight: 0.7,
} as const;

const MAX_DASH = 160;
/** The blast ring's segments. */
const SEG = 96;
const Z = new Vector3(0, 0, 1), NRM = new Vector3(), CAM = new Vector3();
/** Cross-sections per dash (3 segments: the dash follows the curve). */
const SECT = 4;

const own = (m: MeshBasicMaterial) => { m.userData.rpOwn = true; m.fog = false; return m; };
const basic = (color: string, opacity: number, depthTest = true, blending: Blending = NormalBlending) =>
  own(new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest, toneMapped: false, side: DoubleSide, blending }));

/** A flat ring in the xz plane (its radii set per frame: setAnnulus). */
function annulus(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3));
  const idx = new Uint16Array(SEG * 6);
  for (let i = 0, o = 0; i < SEG; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx[o++] = a; idx[o++] = c; idx[o++] = b;
    idx[o++] = b; idx[o++] = c; idx[o++] = d;
  }
  g.setIndex(new BufferAttribute(idx, 1));
  return g;
}
function setAnnulus(g: BufferGeometry, r0: number, r1: number): void {
  const pos = g.getAttribute("position") as BufferAttribute, a = pos.array as Float32Array;
  for (let i = 0; i <= SEG; i++) {
    const t = (i / SEG) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), o = i * 6;
    a[o] = c * r1; a[o + 1] = 0; a[o + 2] = s * r1;
    a[o + 3] = c * r0; a[o + 4] = 0; a[o + 5] = s * r0;
  }
  pos.needsUpdate = true;
}

/** The rim wall's fade: opaque at the floor, gone at its top (an alpha map; three reads its green). */
function fadeUp(): DataTexture {
  const n = 32, d = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) { const k = Math.round(255 * Math.pow(1 - i / (n - 1), 1.6)); d.set([k, k, k, 255], i * 4); }
  const t = new DataTexture(d, 1, n);
  t.needsUpdate = true;
  return t;
}

function dashGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(MAX_DASH * SECT * 2 * 3), 3));
  const idx = new Uint16Array(MAX_DASH * (SECT - 1) * 6);
  let o = 0;
  for (let k = 0; k < MAX_DASH; k++) for (let j = 0; j < SECT - 1; j++) {
    const a = (k * SECT + j) * 2, b = a + 1, c = a + 2, d = a + 3;
    idx[o++] = a; idx[o++] = b; idx[o++] = c;
    idx[o++] = b; idx[o++] = d; idx[o++] = c;
  }
  g.setIndex(new BufferAttribute(idx, 1));
  g.setDrawRange(0, 0);
  return g;
}

export function FragArcView({ s }: { s: Session }) {
  const v = useMemo(() => {
    const group = new Group();
    const core = dashGeometry(), key = dashGeometry();
    const mats = {
      key: basic(ARC.ink, 0.6),
      core: basic(ARC.gold, 1),
      ghost: basic(ARC.gold, ARC.ghost, false),
      ringKey: basic(ARC.ink, 0.55),
      ring: basic(ARC.gold, 1),
      ringGhost: basic(ARC.gold, ARC.ghost, false),
      fill: basic(ARC.gold, ARC.fill),
      wall: Object.assign(basic(ARC.gold, ARC.wallA), { alphaMap: fadeUp() }),
      tick: basic(ARC.gold, 1),
      tickKey: basic(ARC.ink, 0.55),
    };
    const lineKey = new Mesh(key, mats.key), line = new Mesh(core, mats.core), lineGhost = new Mesh(core, mats.ghost);
    lineKey.renderOrder = 20; lineGhost.renderOrder = 21; line.renderOrder = 22;
    // the blast ring (flat on the floor at GRENADE.radius; its width grows with the distance, so it never
    // thins to a hairline at a grazing angle), its keyline, a low rim wall standing on it (it reads edge
    // on), the faint fill and the centre mark
    const R = GRENADE.radius;
    const ringGeo = annulus(), keyGeo = annulus();
    const blast = new Group();
    const ringKey = new Mesh(keyGeo, mats.ringKey), ring = new Mesh(ringGeo, mats.ring), ringGhost = new Mesh(ringGeo, mats.ringGhost);
    const fill = new Mesh(new CircleGeometry(1, 64), mats.fill);
    fill.rotation.x = -Math.PI / 2;
    fill.scale.setScalar(R);
    const wall = new Mesh(new CylinderGeometry(1, 1, 1, SEG, 1, true), mats.wall);
    ringKey.renderOrder = 20; fill.renderOrder = 20; ringGhost.renderOrder = 21; ring.renderOrder = 22; wall.renderOrder = 23;
    const markKey = new Mesh(new RingGeometry(ARC.mark * 0.45, ARC.mark * 1.25, 40), mats.ringKey);
    const mark = new Mesh(new RingGeometry(ARC.mark * 0.62, ARC.mark, 40), mats.ring);
    const dot = new Mesh(new CircleGeometry(ARC.mark * 0.22, 20), mats.ring);
    for (const m of [markKey, mark, dot]) { m.rotation.x = -Math.PI / 2; m.position.y = 0.005; }
    markKey.renderOrder = 20; mark.renderOrder = 22; dot.renderOrder = 22;
    blast.add(fill, ringKey, ringGhost, ring, markKey, mark, dot, wall);
    fill.name = "frag-arc-fill"; ring.name = "frag-arc-ring"; ringKey.name = "frag-arc-ringkey"; ringGhost.name = "frag-arc-ringghost";
    // a small ring where it touches something (oriented to the surface)
    const tickGeo = new RingGeometry(0.07, 0.12, 24), tickKeyGeo = new RingGeometry(0.04, 0.16, 24);
    const ticks: Group[] = [];
    for (let i = 0; i < 8; i++) {
      const t = new Group();
      const k = new Mesh(tickKeyGeo, mats.tickKey), c = new Mesh(tickGeo, mats.tick);
      k.renderOrder = 20; c.renderOrder = 22;
      c.position.z = 0.004;
      t.add(k, c);
      ticks.push(t);
      group.add(t);
    }
    group.add(lineKey, lineGhost, line, blast);
    group.name = "frag-arc"; line.name = "frag-arc-line"; lineKey.name = "frag-arc-linekey"; lineGhost.name = "frag-arc-lineghost";
    group.traverse(o => { o.frustumCulled = false; o.userData.rpWarm = true; });
    group.visible = false;
    return { group, core, key, mats, blast, ticks, ringGeo, keyGeo, wall, fill, marks: [markKey, mark, dot], path: emptyPath(), a: 0, run: -1, cum: [] as number[],
      /** His last frag in the air (its id, -1 none), where it goes off (its own flight from where it is), the ring's weight. */
      thrown: -1, tpath: emptyPath(), b: 0,
      /** What the last preview was made from (his place, his aim, the world's open doors, the run). */
      last: [NaN, 0, 0, 0, 0, 0, 0, 0, 0] };
  }, []);

  // his frag let go: the ring stays where it goes off (its own flight, replayed from where it is now)
  useEffect(() => s.on((e, ss) => {
    if (e.type === "throw" && e.by === undefined) {
      const gr = ss.game.grenadesLive.find(k => k.id === e.id);
      if (!gr) return;
      predictFrag(ss.game.world, gr, v.tpath, 3, gr.fuse);
      v.thrown = e.id;
    } else if (e.type === "explode" && e.id === v.thrown) v.thrown = -1;
  }), [s, v]);

  useFrame(({ camera }, rawDelta) => {
    const g = s.game, p = g.player;
    const dt = Math.min(rawDelta, 0.1);
    if (v.run !== s.run) { v.run = s.run; v.a = 0; v.b = 0; v.thrown = -1; }
    const up = p.nadeUp && p.mode !== "dead" && !s.hold;
    v.a = up ? Math.min(1, v.a + dt / ARC.fadeIn) : Math.max(0, v.a - dt / ARC.fadeOut);
    const flying = v.thrown >= 0 && g.grenadesLive.some(k => k.id === v.thrown);
    if (!flying) v.thrown = -1;
    v.b = flying ? Math.min(1, v.b + dt / ARC.fadeIn) : Math.max(0, v.b - dt / ARC.fadeOut);
    // (the first beat of a hold stays hidden: a tap throws before it shows)
    const a = Math.max(0, Math.min(1, v.a * 1.35 - 0.35));
    // the aim preview, else the ring of the one in the air (fainter, no arc)
    const aim = a > 0.01;
    const b = aim ? 0 : v.b * ARC.inFlight;
    v.group.visible = aim || b > 0.01;
    if (!v.group.visible) { v.core.setDrawRange(0, 0); v.key.setDrawRange(0, 0); return; }
    // (the same throw as last frame: the same flight; a door opening or a crate breaking changes the world)
    if (up) {
      const ap = g.aimPoint, k = v.last;
      const same = k[0] === p.x && k[1] === p.y && k[2] === p.z && k[3] === p.yaw && k[4] === ap.x && k[5] === ap.y && k[6] === ap.z && k[7] === g.world.off.size && k[8] === s.run;
      if (!same) { g.fragPreview(v.path); k[0] = p.x; k[1] = p.y; k[2] = p.z; k[3] = p.yaw; k[4] = ap.x; k[5] = ap.y; k[6] = ap.z; k[7] = g.world.off.size; k[8] = s.run; }
    }
    const path = aim ? v.path : v.tpath;
    v.fill.visible = v.wall.visible = aim;
    const ringA = aim ? a : b;
    const pts = path.pts;
    // arc length along the path
    const cum = v.cum;
    cum[0] = 0;
    for (let i = 1; i < path.n; i++) {
      const j = i * 3, h = j - 3;
      cum[i] = cum[i - 1] + Math.hypot(pts[j] - pts[h], pts[j + 1] - pts[h + 1], pts[j + 2] - pts[h + 2]);
    }
    const total = cum[path.n - 1] ?? 0;
    // the dashes run toward the blast (real time: the flow keeps going in bullet time and when paused)
    const period = ARC.dash + ARC.gap;
    const phase = (performance.now() / 1000) * ARC.flow % period;
    // (the lens sits under the camera node: its world position)
    const cp = CAM.setFromMatrixPosition(camera.matrixWorld);
    const posC = v.core.getAttribute("position") as BufferAttribute, posK = v.key.getAttribute("position") as BufferAttribute;
    const ac = posC.array as Float32Array, ak = posK.array as Float32Array;
    let nd = 0, seg = 1;
    const at = (sArc: number, out: number[]) => {
      while (seg < path.n - 1 && cum[seg] < sArc) seg++;
      while (seg > 1 && cum[seg - 1] > sArc) seg--;
      const s0 = cum[seg - 1], s1 = cum[seg], k = s1 > s0 ? Math.max(0, Math.min(1, (sArc - s0) / (s1 - s0))) : 0;
      const i0 = (seg - 1) * 3, i1 = seg * 3;
      out[0] = pts[i0] + (pts[i1] - pts[i0]) * k; out[1] = pts[i0 + 1] + (pts[i1 + 1] - pts[i0 + 1]) * k; out[2] = pts[i0 + 2] + (pts[i1 + 2] - pts[i0 + 2]) * k;
      out[3] = pts[i1] - pts[i0]; out[4] = pts[i1 + 1] - pts[i0 + 1]; out[5] = pts[i1 + 2] - pts[i0 + 2];
    };
    const q = [0, 0, 0, 0, 0, 0];
    for (let s0 = phase - period; aim && s0 < total && nd < MAX_DASH; s0 += period) {
      const a0 = Math.max(s0, ARC.skip), a1 = Math.min(s0 + ARC.dash, total);
      if (a1 - a0 < 0.03) continue;
      seg = 1;
      for (let j = 0; j < SECT; j++) {
        at(a0 + ((a1 - a0) * j) / (SECT - 1), q);
        // across the line, facing the lens
        const tx = q[3], ty = q[4], tz = q[5];
        const vx = q[0] - cp.x, vy = q[1] - cp.y, vz = q[2] - cp.z;
        let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
        const sl = Math.hypot(sx, sy, sz) || 1;
        const w = Math.max(ARC.width.min, ARC.width.perM * Math.hypot(vx, vy, vz));
        sx /= sl; sy /= sl; sz /= sl;
        const o = ((nd * SECT + j) * 2) * 3;
        ac[o] = q[0] + sx * w; ac[o + 1] = q[1] + sy * w; ac[o + 2] = q[2] + sz * w;
        ac[o + 3] = q[0] - sx * w; ac[o + 4] = q[1] - sy * w; ac[o + 5] = q[2] - sz * w;
        const wk = w * ARC.keyline;
        ak[o] = q[0] + sx * wk; ak[o + 1] = q[1] + sy * wk; ak[o + 2] = q[2] + sz * wk;
        ak[o + 3] = q[0] - sx * wk; ak[o + 4] = q[1] - sy * wk; ak[o + 5] = q[2] - sz * wk;
      }
      nd++;
    }
    posC.needsUpdate = true;
    posK.needsUpdate = true;
    v.core.setDrawRange(0, nd * (SECT - 1) * 6);
    v.key.setDrawRange(0, nd * (SECT - 1) * 6);
    // the bounces on the way (not the last settle: those are under the blast marker)
    let nt = 0;
    for (let i = 0; aim && i < path.nb && nt < v.ticks.length; i++) {
      const b = path.bounces[i];
      if (b.speed < 1 || Math.hypot(b.x - path.end.x, b.z - path.end.z) < 0.6) continue;
      const t = v.ticks[nt++];
      t.visible = true;
      t.position.set(b.x + b.nx * 0.03, b.y + b.ny * 0.03, b.z + b.nz * 0.03);
      t.quaternion.setFromUnitVectors(Z, NRM.set(b.nx, b.ny, b.nz));
      const d = Math.hypot(b.x - cp.x, b.y - cp.y, b.z - cp.z);
      t.scale.setScalar(Math.max(1, d / 9));
    }
    for (let i = nt; i < v.ticks.length; i++) v.ticks[i].visible = false;
    // the blast: on the floor under where it goes off
    const e = path.end;
    const gy = g.world.groundBelow(e.x, e.z, 0.1, e.y + 0.3);
    v.blast.position.set(e.x, (Number.isFinite(gy) ? gy : e.y) + 0.03, e.z);
    const dm = Math.hypot(e.x - cp.x, e.y - cp.y, e.z - cp.z);
    const far = Math.max(1, dm / 7);
    const R = GRENADE.radius, tw = ARC.ring * far;
    setAnnulus(v.ringGeo, R - tw, R);
    setAnnulus(v.keyGeo, R - tw * 2.2, R + tw * 0.7);
    for (const m of v.marks) m.scale.setScalar(far);
    const wh = ARC.wall * Math.max(1, dm / 12);
    v.wall.scale.set(R, wh, R);
    v.wall.position.y = wh / 2;
    // red while he stands inside his own blast; it breathes on its own clock
    const inside = Math.hypot(p.x - e.x, p.z - e.z) < GRENADE.radius && Math.abs(p.y - e.y) < 3;
    const col = inside ? ARC.hot : ARC.gold;
    const t = performance.now() / 1000;
    const breathe = inside ? 0.75 + 0.25 * Math.sin(t * 14) : 0.9 + 0.1 * Math.sin(t * 5);
    v.mats.ring.color.set(col); v.mats.ringGhost.color.set(col); v.mats.fill.color.set(col); v.mats.wall.color.set(col);
    // opacities: the fade, the ghost share
    v.mats.core.opacity = a;
    v.mats.ghost.opacity = a * ARC.ghost;
    v.mats.key.opacity = a * 0.6;
    v.mats.tick.opacity = a;
    v.mats.tickKey.opacity = a * 0.55;
    v.mats.ring.opacity = ringA * breathe;
    v.mats.ringGhost.opacity = ringA * ARC.ringGhost * breathe;
    v.mats.ringKey.opacity = ringA * 0.55;
    v.mats.fill.opacity = a * ARC.fill * (inside ? 1.6 : 1);
    v.mats.wall.opacity = a * ARC.wallA * breathe;
  }, FRAME.fx);

  return <primitive object={v.group} />;
}
