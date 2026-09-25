// Writes public/levels/room1.json: room 1, the rainy Manhattan street outside the Milady rave
// (spec section 3). It is the starting point for hand-tuning in the editor (npm run dev ->
// /?editor=room1); re-running this OVERWRITES the file, so once the level has been tuned by hand,
// edit the JSON in the editor instead.
//   node tools/room1.ts && npm run check-level room1
//
// Layout (x runs along the street, west -> east; the player starts at the west end facing east):
//   street z -7..7 (eastbound, a lane line at z 0), sidewalks z +-7..+-12 (0.15 high), facades at
//   z +-12. The play block is x -28..28 (invisible walls at x +-27 behind police barricades); the
//   avenues (x -42..-28, 28..48) and the next blocks continue into the fog as decor.
//   CLUB MILADY is the dark brick building on the north side, door at x 15.2 (the exit).
// Gameplay markers keep the greybox layout (6 goons, 15 covers, 17 waypoints, 2 copium, alert /
// door-spawn / exit triggers) and add two goons perched on fire escapes (data {perch: true}).
// Everything under the "decor" group is visual only (Data {collider: false} on the group).
//
// Material name tokens (read by the street look, src/app/look/street.tsx):
//   "wet <k>"   ground: puddle-masked planar reflection x k (asphalt 1, sidewalk less)
//   "lit <g>"   textured facades: bright texels (the lit windows) glow x g ("pulse": with the bass)
//   "glow <g>"  basic (unlit) neon / lamps / windows: colour x g, so bloom picks it up
//               ("pulse" = the club's kick, "flicker" = a failing tube, "blink" = a barricade flasher)
import fs from "node:fs";
import path from "node:path";

type Node = { id: string; components?: Record<string, unknown>; children?: Node[] };
type V3 = [number, number, number];

const PI = Math.PI;
const R90 = PI / 2;
const FACE_W = -R90; // looks toward -X
const FACE_E = R90;
const FACE_N = PI; // toward -Z
const FACE_S = 0;

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const rv = (v: number[]) => v.map(r3);

const xf = (position: number[], rotation?: number[], scale?: number[]) => ({
  type: "Transform",
  properties: { position: rv(position), ...(rotation && rotation.some(a => a) ? { rotation: rv(rotation) } : {}), ...(scale ? { scale: rv(scale) } : {}) },
});

type BoxOpts = { rot?: number[]; data?: Record<string, unknown>; hidden?: boolean };
function box(id: string, pos: number[], size: number[], mat: string, o: BoxOpts = {}): Node {
  const comps: Record<string, unknown> = {
    transform: xf(pos, o.rot, size),
    geometry: { type: "Geometry", properties: { geometryType: "box", args: [1, 1, 1] } },
    material: { type: "Material", properties: { materialId: mat } },
    mesh: { type: "Mesh", properties: { castShadow: false, receiveShadow: false, ...(o.hidden ? { visible: false } : {}) } },
  };
  if (o.data) comps.data = { type: "Data", properties: { data: o.data } };
  return { id, components: comps };
}
/** Box from min / max corners. */
function boxMM(id: string, a: V3, b: V3, mat: string, o: BoxOpts = {}): Node {
  return box(id, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])], mat, o);
}
function cyl(id: string, pos: number[], rBottom: number, h: number, mat: string, rTop = rBottom, seg = 14): Node {
  return {
    id,
    components: {
      transform: xf(pos),
      geometry: { type: "Geometry", properties: { geometryType: "cylinder", args: [r3(rTop), r3(rBottom), r3(h), seg] } },
      material: { type: "Material", properties: { materialId: mat } },
      mesh: { type: "Mesh", properties: { castShadow: false, receiveShadow: false } },
    },
  };
}
function group(id: string, pos: number[], yaw: number, children: Node[], data?: Record<string, unknown>): Node {
  const comps: Record<string, unknown> = { transform: xf(pos, yaw ? [0, yaw, 0] : undefined) };
  if (data) comps.data = { type: "Data", properties: { data } };
  return { id, components: comps, children };
}
function marker(id: string, kind: string, pos: number[], data: Record<string, unknown> = {}, yaw = 0, scale?: number[]): Node {
  return {
    id,
    components: {
      transform: xf(pos, yaw ? [0, yaw, 0] : undefined, scale),
      data: { type: "Data", properties: { data: { marker: kind, ...data } } },
    },
  };
}

// ---------------------------------------------------------------- neon stroke font (3 x 5 grid)
const FONT: Record<string, number[][][]> = {
  A: [[[0, 0], [0, 3.5], [1.5, 5], [3, 3.5], [3, 0]], [[0, 2.2], [3, 2.2]]],
  B: [[[0, 0], [0, 5], [2.3, 5], [3, 4.3], [3, 3.2], [2.3, 2.5], [0, 2.5]], [[2.3, 2.5], [3, 1.8], [3, 0.7], [2.3, 0], [0, 0]]],
  C: [[[3, 5], [0, 5], [0, 0], [3, 0]]],
  D: [[[0, 0], [0, 5], [2, 5], [3, 4], [3, 1], [2, 0], [0, 0]]],
  E: [[[3, 5], [0, 5], [0, 0], [3, 0]], [[0, 2.5], [2.2, 2.5]]],
  F: [[[0, 0], [0, 5], [3, 5]], [[0, 2.5], [2.2, 2.5]]],
  G: [[[3, 5], [0, 5], [0, 0], [3, 0], [3, 2.3], [1.6, 2.3]]],
  H: [[[0, 0], [0, 5]], [[3, 0], [3, 5]], [[0, 2.5], [3, 2.5]]],
  I: [[[1.5, 0], [1.5, 5]], [[0.6, 5], [2.4, 5]], [[0.6, 0], [2.4, 0]]],
  K: [[[0, 0], [0, 5]], [[3, 5], [0, 2.2]], [[0.9, 2.9], [3, 0]]],
  L: [[[0, 5], [0, 0], [3, 0]]],
  M: [[[0, 0], [0, 5], [1.5, 2.6], [3, 5], [3, 0]]],
  N: [[[0, 0], [0, 5], [3, 0], [3, 5]]],
  O: [[[0, 0], [0, 5], [3, 5], [3, 0], [0, 0]]],
  P: [[[0, 0], [0, 5], [3, 5], [3, 2.5], [0, 2.5]]],
  Q: [[[0, 0], [0, 5], [3, 5], [3, 0], [0, 0]], [[1.8, 1.2], [3.1, -0.3]]],
  R: [[[0, 0], [0, 5], [3, 5], [3, 2.5], [0, 2.5]], [[1.2, 2.5], [3, 0]]],
  S: [[[3, 5], [0, 5], [0, 2.5], [3, 2.5], [3, 0], [0, 0]]],
  T: [[[0, 5], [3, 5]], [[1.5, 5], [1.5, 0]]],
  U: [[[0, 5], [0, 0], [3, 0], [3, 5]]],
  V: [[[0, 5], [1.5, 0], [3, 5]]],
  W: [[[0, 5], [0, 0], [1.5, 2.4], [3, 0], [3, 5]]],
  Y: [[[0, 5], [1.5, 2.6], [3, 5]], [[1.5, 2.6], [1.5, 0]]],
  Z: [[[0, 5], [3, 5], [0, 0], [3, 0]]],
  "2": [[[0, 5], [3, 5], [3, 2.5], [0, 2.5], [0, 0], [3, 0]]],
  "4": [[[0, 5], [0, 2.5], [3, 2.5]], [[2.2, 3.8], [2.2, 0]]],
  "+": [[[1.5, 1], [1.5, 4]], [[0, 2.5], [3, 2.5]]],
};

type TextOpts = { u: number; thick?: number; mat: string | ((i: number) => string); gap?: number; vertical?: boolean };
/** Neon text as tube strokes in the group's local XY plane (reads from local +Z), centred on the origin. */
function neonText(id: string, str: string, o: TextOpts): Node[] {
  const t = o.thick ?? Math.max(0.045, o.u * 0.3);
  const gap = o.gap ?? o.u * 1.3;
  const lw = 3 * o.u, lh = 5 * o.u;
  const out: Node[] = [];
  const n = str.length;
  const W = o.vertical ? lw : n * lw + (n - 1) * gap;
  const H = o.vertical ? n * lh + (n - 1) * gap : lh;
  [...str].forEach((ch, i) => {
    const strokes = FONT[ch];
    if (!strokes) return;
    const ox = o.vertical ? -W / 2 : -W / 2 + i * (lw + gap);
    const oy = o.vertical ? H / 2 - lh - i * (lh + gap) : -H / 2;
    const mat = typeof o.mat === "string" ? o.mat : o.mat(i);
    let seg = 0;
    for (const line of strokes)
      for (let k = 0; k + 1 < line.length; k++) {
        const [x1, y1] = line[k], [x2, y2] = line[k + 1];
        const dx = (x2 - x1) * o.u, dy = (y2 - y1) * o.u;
        const len = Math.sqrt(dx * dx + dy * dy);
        out.push(box(`${id}-${i}${ch}-${seg++}`, [ox + ((x1 + x2) / 2) * o.u, oy + ((y1 + y2) / 2) * o.u, 0], [len + t, t, t], mat, { rot: [0, 0, Math.atan2(dy, dx)] }));
      }
  });
  return out;
}
function textSize(str: string, u: number, vertical = false, gap = u * 1.3): [number, number] {
  const n = str.length;
  return vertical ? [3 * u, n * 5 * u + (n - 1) * gap] : [n * 3 * u + (n - 1) * gap, 5 * u];
}
/** Rectangle outline of neon tube in local XY. */
function neonFrame(id: string, w: number, h: number, t: number, mat: string): Node[] {
  return [
    box(`${id}-t`, [0, h / 2, 0], [w + t, t, t], mat),
    box(`${id}-b`, [0, -h / 2, 0], [w + t, t, t], mat),
    box(`${id}-l`, [-w / 2, 0, 0], [t, h, t], mat),
    box(`${id}-r`, [w / 2, 0, 0], [t, h, t], mat),
  ];
}

// ---------------------------------------------------------------- street furniture
/** Side of the street: north facades face +z at z -12, south ones face -z at z 12. */
type Side = "n" | "s";
const faceZ = (s: Side) => (s === "n" ? -12 : 12);
const out = (s: Side) => (s === "n" ? 1 : -1);
const signYaw = (s: Side) => (s === "n" ? 0 : PI);

/** A vertical blade sign sticking out of a facade, readable from the west (and from the east when both). */
function bladeSign(id: string, x: number, s: Side, y0: number, str: string, mat: string | ((i: number) => string), frameMat: string, u = 0.2, both = false): Node {
  const [, th] = textSize(str, u, true);
  const h = th + 0.9, d = 3 * u + 0.8;
  const zc = faceZ(s) + out(s) * (d / 2 + 0.1);
  const yc = y0 + h / 2;
  const kids: Node[] = [
    box(`${id}-board`, [x, yc, zc], [0.16, h, d], "signBoard"),
    box(`${id}-arm1`, [x, yc + h / 2 - 0.3, faceZ(s) + out(s) * 0.05], [0.08, 0.08, 0.2], "metalDark"),
  ];
  const face = (sgn: number) => group(`${id}-${sgn < 0 ? "w" : "e"}`, [x + sgn * 0.1, yc, zc], sgn < 0 ? FACE_W : FACE_E, [
    ...neonText(`${id}-${sgn < 0 ? "w" : "e"}`, str, { u, mat, vertical: true }),
    ...neonFrame(`${id}-${sgn < 0 ? "w" : "e"}-fr`, d - 0.25, h - 0.25, 0.05, frameMat),
  ]);
  kids.push(face(-1));
  if (both) kids.push(face(1));
  return group(id, [0, 0, 0], 0, kids);
}

/** Flat sign on a facade: dark board + neon letters (+ an optional frame). */
function wallSign(id: string, x: number, s: Side, y: number, str: string, mat: string | ((i: number) => string), u: number, frame?: string, board = true): Node {
  const [tw, th] = textSize(str, u);
  const z = faceZ(s) + out(s) * 0.12;
  const kids: Node[] = [...neonText(id, str, { u, mat })];
  if (frame) kids.push(...neonFrame(`${id}-fr`, tw + 0.5, th + 0.45, 0.045, frame));
  const g = group(`${id}-g`, [x, y, z], signYaw(s), kids);
  return board ? group(id, [0, 0, 0], 0, [box(`${id}-board`, [x, y, faceZ(s) + out(s) * 0.05], [tw + 0.8, th + 0.7, 0.1], "signBoard"), g]) : g;
}

/** Ground-floor storefront between x0 and x1: shop window (lit or shuttered), door, fascia, awning. */
function storefront(id: string, x0: number, x1: number, s: Side, kind: "shop" | "cool" | "shutter", awning?: string): Node[] {
  const z = faceZ(s), o = out(s);
  const w = x1 - x0, xc = (x0 + x1) / 2;
  const kids: Node[] = [];
  const doorX = x1 - 1.3;
  const winW = w - 3.2;
  const winX = x0 + 0.6 + winW / 2;
  if (kind === "shutter") {
    kids.push(box(`${id}-shut`, [xc, 1.75, z + o * 0.06], [w - 1.0, 3.2, 0.1], "shutter"));
  } else {
    kids.push(box(`${id}-win`, [winX, 1.65, z + o * 0.04], [winW, 2.3, 0.06], kind === "cool" ? "shopCool" : "shopGlow"));
    kids.push(box(`${id}-mull`, [winX, 1.65, z + o * 0.09], [0.08, 2.3, 0.06], "metalDark"));
    kids.push(box(`${id}-sill`, [winX, 0.42, z + o * 0.1], [winW + 0.2, 0.26, 0.16], "metalDark"));
    kids.push(box(`${id}-door`, [doorX, 1.35, z + o * 0.05], [1.1, 2.5, 0.08], "doorGlass"));
  }
  kids.push(box(`${id}-fascia`, [xc, 3.35, z + o * 0.09], [w - 0.4, 0.75, 0.16], "signBoard"));
  if (awning) {
    const aw = Math.min(w - 0.8, 7.5);
    const ax = kind === "shutter" ? xc : winX;
    kids.push(box(`${id}-awn`, [ax, 3.62, z + o * 0.72], [aw, 0.05, 1.5], awning, { rot: [o * 0.33, 0, 0] }));
    kids.push(box(`${id}-awnv`, [ax, 3.3, z + o * 1.43], [aw, 0.3, 0.03], awning));
    kids.push(marker(`${id}-drip`, "fx", [ax, 3.18, z + o * 1.45], { fx: "drip", to: 0.15 }, 0, [aw, 1, 1]));
  }
  return kids;
}

function building(id: string, x0: number, x1: number, s: Side, h: number, mat: string, depth = 58, cornice = true): Node[] {
  const z0 = faceZ(s), z1 = z0 - out(s) * depth;
  const kids: Node[] = [boxMM(id, [x0, 0, Math.min(z0, z1)], [x1, h, Math.max(z0, z1)], mat)];
  if (cornice) kids.push(box(`${id}-cor`, [(x0 + x1) / 2, h + 0.2, z0 + out(s) * 0.15], [x1 - x0 + 0.1, 0.55, 0.7], "cornice"));
  return kids;
}

function waterTower(id: string, x: number, y: number, z: number): Node[] {
  const kids: Node[] = [];
  for (const [dx, dz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) kids.push(box(`${id}-leg${dx}${dz}`, [x + dx, y + 1.4, z + dz], [0.16, 2.8, 0.16], "metalDark"));
  kids.push(cyl(`${id}-tank`, [x, y + 4.4, z], 1.7, 3.2, "wood"));
  kids.push(cyl(`${id}-roof`, [x, y + 6.55, z], 1.85, 1.1, "wood", 0.06));
  return kids;
}

/** Yellow cab: collider body + cabin (surface metal), decor wheels, lights, roof sign. yaw 0 = nose +x. */
function cab(id: string, x: number, z: number, yaw: number, lightsOn: boolean): { solid: Node; decor: Node } {
  const metal = { data: { surface: "metal" } };
  const solid = group(id, [x, 0, z], yaw, [
    box(`${id}-body`, [0, 0.6, 0], [4.6, 0.95, 1.9], "cab", metal),
    box(`${id}-cabin`, [-0.25, 1.3, 0], [2.5, 0.5, 1.72], "glassDark", metal),
  ]);
  const hl = lightsOn ? "headlight" : "glassDark", tl = lightsOn ? "taillight" : "glassDark";
  const d: Node[] = [box(`${id}-roof`, [-0.25, 1.575, 0], [2.3, 0.06, 1.62], "cab"), box(`${id}-sign`, [-0.2, 1.74, 0], [0.9, 0.26, 0.22], lightsOn ? "cabSign" : "cab")];
  for (const [wx, wz] of [[-1.45, -0.86], [1.45, -0.86], [-1.45, 0.86], [1.45, 0.86]]) d.push(box(`${id}-w${wx}${wz}`, [wx, 0.34, wz], [0.66, 0.66, 0.26], "tire"));
  d.push(box(`${id}-bf`, [2.33, 0.42, 0], [0.12, 0.26, 1.92], "tire"), box(`${id}-bb`, [-2.33, 0.42, 0], [0.12, 0.26, 1.92], "tire"));
  d.push(box(`${id}-grille`, [2.31, 0.75, 0], [0.04, 0.2, 0.8], "metalDark"));
  for (const sz of [-0.64, 0.64]) {
    d.push(box(`${id}-hl${sz}`, [2.32, 0.78, sz], [0.04, 0.16, 0.34], hl));
    d.push(box(`${id}-tl${sz}`, [-2.32, 0.8, sz], [0.04, 0.2, 0.26], tl));
  }
  d.push(box(`${id}-stripe`, [0, 0.72, 0], [4.62, 0.08, 1.92], "checker"));
  return { solid, decor: group(`${id}-dec`, [x, 0, z], yaw, d) };
}

/** A parked dark sedan (decor, for the far blocks). */
function sedan(id: string, x: number, z: number, yaw: number, paint: string): Node {
  return group(id, [x, 0, z], yaw, [
    box(`${id}-b`, [0, 0.58, 0], [4.5, 0.8, 1.85], paint),
    box(`${id}-c`, [-0.2, 1.22, 0], [2.4, 0.5, 1.66], "glassDark"),
    box(`${id}-t`, [0, 0.3, 0], [4.2, 0.4, 1.95], "tire"),
  ]);
}

/** NYC cobra-head street lamp on the curb; the arm reaches over the street. */
function lamp(id: string, x: number, s: Side): { solid: Node; decor: Node; light: Node } {
  const z = s === "n" ? -7.6 : 7.6, o = out(s);
  return {
    solid: box(`${id}-pole`, [x, 3.6, z], [0.2, 7.2, 0.2], "lampPole", { data: { surface: "metal" } }),
    decor: group(id, [0, 0, 0], 0, [
      box(`${id}-base`, [x, 0.55, z], [0.38, 0.9, 0.38], "lampPole"),
      box(`${id}-arm`, [x, 7.1, z + o * 1.05], [0.12, 0.12, 2.2], "lampPole"),
      box(`${id}-head`, [x, 6.98, z + o * 2.2], [0.36, 0.2, 0.8], "lampPole"),
      box(`${id}-lens`, [x, 6.87, z + o * 2.2], [0.28, 0.05, 0.62], "sodium"),
    ]),
    light: marker(`${id}-light`, "light", [x, 6.6, z + o * 2.2], { color: "#ff9a40", intensity: 85, distance: 21 }),
  };
}

/** Fire escape on a facade: platforms every floor, rails, zig-zag stairs, a drop ladder. */
function fireEscape(id: string, x0: number, x1: number, s: Side, floors: number): Node[] {
  const z = faceZ(s), o = out(s), dep = 1.3;
  const zc = z + o * dep / 2, zf = z + o * (dep - 0.03);
  const w = x1 - x0, xc = (x0 + x1) / 2;
  const kids: Node[] = [];
  for (let f = 1; f <= floors; f++) {
    const y = f * 3.3;
    if (f > 1) kids.push(box(`${id}-p${f}`, [xc, y - 0.05, zc], [w, 0.08, dep], "fireEscape"));
    // railing: a top rail over a dark bar panel (reads as balusters at night), panels at the ends
    kids.push(box(`${id}-r${f}`, [xc, y + 1.0, zf], [w, 0.06, 0.06], "fireEscape"));
    kids.push(box(`${id}-m${f}`, [xc, y + 0.5, zf], [w, 0.95, 0.015], "railPanel"));
    kids.push(box(`${id}-e${f}a`, [x0, y + 0.5, zc], [0.015, 0.95, dep], "railPanel"));
    kids.push(box(`${id}-e${f}b`, [x1, y + 0.5, zc], [0.015, 0.95, dep], "railPanel"));
    if (f < floors) {
      // stairs up to the next platform, alternating direction
      const up = f % 2 ? 1 : -1;
      const sx0 = up > 0 ? x0 + 1.2 : x1 - 1.2, sx1 = up > 0 ? x1 - 1.6 : x0 + 1.6;
      const dx = sx1 - sx0, dy = 3.3;
      const len = Math.sqrt(dx * dx + dy * dy);
      kids.push(box(`${id}-s${f}`, [(sx0 + sx1) / 2, y + dy / 2, z + o * 0.42], [len, 0.06, 0.62], "fireEscape", { rot: [0, 0, Math.atan2(dy, dx)] }));
    }
  }
  // drop ladder under the first platform
  const lx = x1 - 0.8;
  kids.push(box(`${id}-la`, [lx - 0.25, 2.3, zf], [0.04, 2.0, 0.04], "fireEscape"), box(`${id}-lb`, [lx + 0.25, 2.3, zf], [0.04, 2.0, 0.04], "fireEscape"));
  kids.push(box(`${id}-lr`, [lx, 2.3, zf], [0.5, 1.9, 0.012], "railPanel"));
  // drips off the first platform's front edge
  kids.push(marker(`${id}-drip`, "fx", [xc, 3.2, z + o * dep], { fx: "drip", to: 0.15 }, 0, [w, 1, 1]));
  return kids;
}

/** Police sawhorse (decor) with an amber flasher. */
function sawhorse(id: string, x: number, z: number, yaw: number, flasher: boolean): Node {
  const k: Node[] = [
    box(`${id}-top`, [0, 1.0, 0], [0.06, 0.26, 2.2], "policeBlue"),
    box(`${id}-low`, [0, 0.55, 0], [0.06, 0.18, 2.2], "policeWhite"),
    box(`${id}-l1`, [0, 0.5, -0.95], [0.5, 1.0, 0.07], "policeWhite"),
    box(`${id}-l2`, [0, 0.5, 0.95], [0.5, 1.0, 0.07], "policeWhite"),
  ];
  if (flasher) k.push(box(`${id}-amber`, [0, 1.22, 0.8], [0.14, 0.18, 0.14], "amberBlink"));
  return group(id, [x, 0, z], yaw, k);
}
function barrel(id: string, x: number, z: number): Node[] {
  return [
    cyl(`${id}-b`, [x, 0.5, z], 0.32, 1.0, "barrelOrange", 0.28),
    cyl(`${id}-s1`, [x, 0.72, z], 0.315, 0.12, "policeWhite", 0.305),
    cyl(`${id}-s2`, [x, 0.42, z], 0.33, 0.12, "policeWhite", 0.32),
  ];
}

/** Traffic signal on a corner pole: the lit lens faces `faceYaw`. */
function signal(id: string, x: number, z: number, faceYaw: number, lit: "red" | "green"): Node {
  const k: Node[] = [
    box(`${id}-pole`, [0, 2.9, 0], [0.16, 5.8, 0.16], "lampPole"),
    box(`${id}-head`, [0, 5.1, 0.25], [0.36, 1.05, 0.3], "signalBox"),
    box(`${id}-r`, [0, 5.45, 0.41], [0.2, 0.2, 0.04], lit === "red" ? "signalRed" : "glassDark"),
    box(`${id}-y`, [0, 5.12, 0.41], [0.2, 0.2, 0.04], "glassDark"),
    box(`${id}-g`, [0, 4.78, 0.41], [0.2, 0.2, 0.04], lit === "green" ? "signalGreen" : "glassDark"),
    box(`${id}-ped`, [0, 2.9, 0.14], [0.3, 0.3, 0.1], "signalBox"),
    box(`${id}-hand`, [0, 2.9, 0.2], [0.18, 0.18, 0.03], "signalHand"),
  ];
  return group(id, [x, 0, z], faceYaw, k);
}

// ---------------------------------------------------------------- the room
const solid: Node[] = []; // colliders
const decor: Node[] = []; // Data {collider: false} group
const lights: Node[] = [];

// ground: invisible play-area floor collider + the visible street to the horizon
solid.push(box("floor", [0, -0.5, 0], [80, 1, 40], "asphalt", { hidden: true }));
decor.push(box("ground", [120, -0.5, 0], [760, 1, 420], "asphalt"));
// sidewalks (play block: colliders; beyond: decor)
solid.push(box("sidewalk-n", [0, 0.075, -9.5], [56, 0.15, 5], "sidewalk"), box("sidewalk-s", [0, 0.075, 9.5], [56, 0.15, 5], "sidewalk"));
decor.push(box("curb-n", [0, 0.085, -7.08], [56, 0.17, 0.2], "curb"), box("curb-s", [0, 0.085, 7.08], [56, 0.17, 0.2], "curb"));
for (const [x0, x1] of [[48, 260], [-260, -42]])
  for (const s of ["n", "s"] as Side[]) decor.push(box(`sw-${x0}-${s}`, [(x0 + x1) / 2, 0.075, s === "n" ? -9.5 : 9.5], [x1 - x0, 0.15, 5], "sidewalk"));
// avenue sidewalks along the corner buildings
for (const [x, s] of [[29.5, 1], [46.5, 1], [-29.5, 1], [-40.5, 1], [29.5, -1], [46.5, -1], [-29.5, -1], [-40.5, -1]] as Array<[number, number]>)
  decor.push(box(`asw-${x}-${s}`, [x, 0.075, s * 41], [3, 0.15, 58], "sidewalk"));

// invisible end walls (the barricades sell them)
solid.push(box("end-w", [-27, 4, 0], [2, 8, 24], "invisible", { hidden: true }), box("end-e", [27, 4, 0], [2, 8, 24], "invisible", { hidden: true }));

// ---- play-block buildings (colliders): north
solid.push(...building("nw1", -28, -19, "n", 20.5, "brick"));
solid.push(...building("nw2", -19, -11, "n", 15.2, "brownstone"));
solid.push(...building("nw3", -11, 0, "n", 22.2, "brickDark"));
solid.push(...building("nw4", 0, 8, "n", 16.5, "brownstone"));
// the club: door recess at x 14..16.4 (the greybox gap), the door 1.6 m back
solid.push(boxMM("club-l", [8, 0, -70], [14, 26.4, -12], "club"), boxMM("club-r", [16.4, 0, -70], [24, 26.4, -12], "club"));
solid.push(boxMM("club-lintel", [14, 3, -70], [16.4, 26.4, -12], "club"));
solid.push(boxMM("club-door", [14, 0, -16], [16.4, 3, -13.4], "door", { data: { surface: "metal" } }));
solid.push(box("club-cor", [16, 26.6, -11.85], [16.1, 0.6, 0.7], "cornice"));
solid.push(...building("ne", 24, 28, "n", 30.5, "brick"));
// south
solid.push(...building("sw1", -28, -20, "s", 15, "brownstone"));
solid.push(...building("sw2", -20, -13, "s", 13.8, "brownstoneLight"));
solid.push(...building("sw3", -13, -2, "s", 18.2, "brick"));
solid.push(...building("sw4", -2, 14, "s", 21.6, "brickDark"));
solid.push(...building("sw5", 14, 28, "s", 27.2, "brickTan"));

// ---- gameplay obstacles (greybox positions): cabs, barriers, queue, planter, mailbox, dumpster, kiosk, pillar
for (const [id, x, z, yaw, on] of [["cab-1", -14, 6.4, 0, false], ["cab-2", 2.5, 6.4, 0, true], ["cab-3", 10.5, 0.2, 0.35, true]] as Array<[string, number, number, number, boolean]>) {
  const c = cab(id, x, z, yaw, on);
  solid.push(c.solid);
  decor.push(c.decor);
}
for (const [id, x, z] of [["barrier-a", -4, 1.5], ["barrier-b", 5, -2.5]] as Array<[string, number, number]>) {
  solid.push(box(id, [x, 0.5, z], [0.6, 1, 3.2], "concrete"));
  decor.push(box(`${id}-base`, [x, 0.12, z], [0.8, 0.24, 3.2], "concrete"), box(`${id}-str1`, [x - 0.31, 0.7, z], [0.02, 0.12, 3.0], "barrelOrange"), box(`${id}-str2`, [x + 0.31, 0.7, z], [0.02, 0.12, 3.0], "barrelOrange"));
}
// the queue line: crowd barricades wrapped in pink CLUB banners
solid.push(box("queue-line", [9, 0.55, -6.6], [4.4, 1, 0.25], "bannerPink", { data: { surface: "wood" } }));
solid.push(box("queue-line-2", [12, 0.55, -5.2], [0.25, 1, 3], "bannerPink", { data: { surface: "wood" } }));
decor.push(box("queue-rail", [9, 1.08, -6.6], [4.5, 0.05, 0.3], "chrome"), box("queue-rail-2", [12, 1.08, -5.2], [0.3, 0.05, 3.1], "chrome"));
for (const x of [7, 9, 11]) decor.push(box(`queue-foot-${x}`, [x, 0.03, -6.6], [0.08, 0.06, 0.9], "chrome"));
for (const z of [-6.4, -4.0]) decor.push(box(`queue2-foot-${z}`, [12, 0.03, z], [0.9, 0.06, 0.08], "chrome"));
decor.push(group("queue-logo", [9, 0.62, -6.46], 0, neonText("queue-logo", "MILADY", { u: 0.07, mat: "neonCyan2", thick: 0.025 })));
decor.push(group("queue-logo-2", [12.14, 0.62, -5.2], FACE_E, neonText("queue-logo-2", "MILADY", { u: 0.06, mat: "neonCyan2", thick: 0.025 })));
// velvet rope from the queue to the door + the bouncer's podium
for (const x of [11.4, 12.6, 13.7]) decor.push(box(`stanchion-${x}`, [x, 0.65, -10.4], [0.07, 1.0, 0.07], "brass"), box(`stanchion-b-${x}`, [x, 0.17, -10.4], [0.3, 0.04, 0.3], "brass"));
decor.push(box("rope-1", [12.0, 0.98, -10.4], [1.2, 0.06, 0.06], "velvet"), box("rope-2", [13.15, 0.98, -10.4], [1.1, 0.06, 0.06], "velvet"));
solid.push(box("podium", [17.25, 0.7, -11.3], [0.55, 1.1, 0.45], "podium"));
decor.push(box("podium-lamp", [17.25, 1.27, -11.35], [0.3, 0.04, 0.2], "neonPink2"));
solid.push(box("planter", [18.5, 0.45, -7.4], [1.8, 0.9, 1.2], "planter"));
decor.push(box("planter-green", [18.5, 1.05, -7.4], [1.6, 0.35, 1.0], "shrub"), box("planter-tree", [18.5, 2.2, -7.4], [0.12, 2.2, 0.12], "wood"), box("planter-crown", [18.5, 3.6, -7.4], [1.4, 1.2, 1.2], "shrub"));
solid.push(box("mailbox", [-10, 0.65, -7.4], [0.7, 1.3, 0.7], "mailbox", { data: { surface: "metal" } }));
decor.push(box("mailbox-top", [-10, 1.33, -7.4], [0.72, 0.1, 0.72], "mailbox"));
solid.push(box("dumpster", [-6, 0.75, -10.2], [2.4, 1.5, 1.3], "dumpster", { data: { surface: "metal" } }));
decor.push(box("dumpster-lid", [-6, 1.55, -10.35], [2.44, 0.08, 1.4], "dumpster", { rot: [-0.12, 0, 0] }), box("trashbag-1", [-4.3, 0.45, -10.6], [0.7, 0.6, 0.6], "trashBag"), box("trashbag-2", [-4.1, 0.38, -9.9], [0.6, 0.45, 0.55], "trashBag"));
solid.push(box("kiosk", [-18, 1.2, -8.2], [2.6, 2.4, 1.8], "kiosk", { data: { surface: "metal" } }));
decor.push(box("kiosk-roof", [-18, 2.5, -8.0], [3.0, 0.15, 2.4], "kiosk"), box("kiosk-rack", [-18, 1.25, -7.28], [2.2, 1.1, 0.06], "shopGlow"));
decor.push(group("kiosk-news", [-18, 2.95, -7.18], 0, neonText("kiosk-news", "NEWS", { u: 0.09, mat: "neonCyan2", thick: 0.035 })));
solid.push(box("pillar-e", [21, 1.6, 7.6], [1.2, 3.2, 1.2], "brickPlain"));
// the brownstone stoop near the start (low cover)
for (let i = 0; i < 5; i++) solid.push(boxMM(`stoop-${i}`, [-25.5, 0, 9.5 + i * 0.5], [-23.5, 0.3 * (i + 1), 12], "brownstoneStep"));
solid.push(boxMM("stoop-cheek-w", [-25.75, 0, 9.4], [-25.45, 1.6, 12], "brownstoneStep"), boxMM("stoop-cheek-e", [-23.55, 0, 9.4], [-23.25, 1.6, 12], "brownstoneStep"));
decor.push(boxMM("stoop-door", [-25.1, 1.5, 11.9], [-23.9, 4.2, 12.02], "door"), box("stoop-lamp", [-24.5, 4.45, 11.85], [0.3, 0.25, 0.2], "shopGlow"));

// ---- fire escapes (decor) + the perch platforms (colliders, bullets pass the grating)
decor.push(...fireEscape("fe-n", -9.5, -1.5, "n", 5));
solid.push(box("fe-n-perch", [-5.5, 3.25, -11.35], [8, 0.1, 1.3], "fireEscape", { data: { shootThrough: true, surface: "metal" } }));
decor.push(...fireEscape("fe-s", 4.5, 12.5, "s", 5));
solid.push(box("fe-s-perch", [8.5, 3.25, 11.35], [8, 0.1, 1.3], "fireEscape", { data: { shootThrough: true, surface: "metal" } }));

// ---- storefronts
decor.push(...storefront("sf-nw1", -28, -19, "n", "shop", "awningRed"));
decor.push(wallSign("sign-bar-nw1", -23.5, "n", 3.35, "BAR", "neonCyan2", 0.11, undefined, false));
decor.push(...storefront("sf-nw2", -19, -11, "n", "shutter"));
decor.push(...storefront("sf-nw3", -11, 0, "n", "shop", "awningBlack"));
decor.push(wallSign("sign-pawn", -5.5, "n", 3.35, "PAWN", "neonAmber", 0.11, undefined, false));
decor.push(...storefront("sf-nw4", 0, 8, "n", "shutter", "awningGreen"));
decor.push(...storefront("sf-ne", 24, 28, "n", "cool"));
decor.push(...storefront("sf-sw3", -13, -2, "s", "cool", "awningGreen"));
decor.push(wallSign("sign-deli", -6.5, "s", 3.35, "DELI", "neonGreen", 0.11, undefined, false));
decor.push(group("sign-24h", [-10.8, 2.2, 11.9], PI, [...neonText("sign-24h", "24H", { u: 0.08, mat: "neonPink2" }), ...neonFrame("sign-24h-fr", 1.3, 0.75, 0.035, "neonCyan2")]));
decor.push(group("sign-open", [-4.4, 2.0, 11.9], PI, [...neonText("sign-open", "OPEN", { u: 0.07, mat: "neonRed" }), ...neonFrame("sign-open-fr", 1.35, 0.6, 0.03, "neonCyan2")]));
decor.push(...storefront("sf-sw4", -2, 6, "s", "shutter"));
decor.push(...storefront("sf-sw4b", 6, 14, "s", "shop", "awningRed"));
decor.push(wallSign("sign-cafe", 9.2, "s", 3.35, "CAFE", "neonPink2", 0.1, undefined, false));
decor.push(...storefront("sf-sw1", -20, -13, "s", "shutter"));

// ---- CLUB MILADY: marquee canopy, the sign over the door, a blade sign on the corner
decor.push(box("club-canopy", [15.2, 3.45, -11.1], [6.2, 0.25, 1.8], "signBoard"));
decor.push(box("club-canopy-neon", [15.2, 3.45, -10.19], [6.25, 0.06, 0.06], "neonPink"), box("club-canopy-bulbs", [15.2, 3.31, -10.35], [5.8, 0.03, 0.08], "bulbs"));
decor.push(marker("club-canopy-drip", "fx", [15.2, 3.3, -10.2], { fx: "drip", to: 0.15 }, 0, [6, 1, 1]));
{
  const board = box("club-sign-board", [15.2, 5.25, -11.93], [8.8, 3.1, 0.12], "signBoard");
  const club = group("club-sign-club", [15.2, 6.2, -11.8], 0, neonText("club-sign-club", "CLUB", { u: 0.13, mat: "neonCyan", thick: 0.06 }));
  const milady = group("club-sign-milady", [15.2, 4.65, -11.8], 0, neonText("club-sign-milady", "MILADY", { u: 0.27, mat: "neonPink", thick: 0.085, gap: 0.3 }));
  const frame = group("club-sign-frame", [15.2, 5.25, -11.84], 0, neonFrame("club-sign-frame", 8.4, 2.75, 0.05, "neonCyan"));
  decor.push(board, club, milady, frame);
  decor.push(box("club-door-neon-l", [13.95, 1.6, -12.02], [0.06, 3.1, 0.06], "neonCyan"), box("club-door-neon-r", [16.45, 1.6, -12.02], [0.06, 3.1, 0.06], "neonCyan"));
  decor.push(box("club-door-lamp", [15.2, 2.85, -13.3], [1.2, 0.05, 0.15], "neonPink"));
}
decor.push(bladeSign("club-blade", 23.4, "n", 5.2, "MILADY", "neonPink", "neonCyan", 0.22, true));
// posters on the club wall
for (const [i, x] of [[0, 9.2], [1, 10.4], [2, 11.6], [3, 19.0], [4, 20.2]] as Array<[number, number]>) decor.push(box(`poster-${i}`, [x, 1.7, -11.96], [0.95, 1.35, 0.03], i % 2 ? "posterCyan" : "posterPink"));

// hotel on the south-east: canopy on the pillar + a blade sign
decor.push(boxMM("hotel-canopy", [19.6, 3.2, 7.1], [22.4, 3.45, 12], "signBoard"), box("hotel-canopy-bulbs", [21, 3.18, 7.3], [2.6, 0.03, 0.1], "bulbs"));
decor.push(boxMM("hotel-door", [20.2, 0.15, 11.94], [21.8, 3.0, 12.02], "shopGlow"));
decor.push(bladeSign("hotel-blade", 17.2, "s", 5.6, "HOTEL", i => (i === 3 ? "neonRedFlicker" : "neonRed"), "neonAmber", 0.2, true));
decor.push(bladeSign("bar-blade", 26.8, "n", 3.9, "BAR", "neonCyan2", "neonPink2", 0.16));

// water towers on the lower roofs
decor.push(...waterTower("wt-1", -15, 15.2, -24), ...waterTower("wt-2", -6, 18.2, 26), ...waterTower("wt-3", 4, 16.5, -30));
// rooftop billboard over the brownstone (lit panel)
decor.push(box("billboard-frame", [-23, 24, -20], [9, 4.2, 0.3], "metalDark"), box("billboard", [-23, 24, -19.8], [8.6, 3.8, 0.1], "billboardGlow"));
decor.push(group("billboard-text", [-23, 24, -19.7], 0, neonText("billboard-text", "DINER", { u: 0.34, mat: "neonPink", thick: 0.12, gap: 0.45 })));
for (const x of [-26, -20]) decor.push(box(`billboard-leg-${x}`, [x, 21.2, -20.4], [0.2, 2.4, 0.2], "metalDark"));

// ---- street paint: lane dashes, crosswalks, stop lines
for (let x = -58; x < 160; x += 9) if (Math.abs(x) > 30 || (x > -21 && x < 21)) decor.push(box(`lane-${x}`, [x, 0.006, 0], [3, 0.012, 0.14], "paint"));
for (const xc of [24, -24.6, 50.5, -44.5]) {
  for (let i = 0; i < 11; i++) decor.push(box(`xwalk-${xc}-${i}`, [xc, 0.006, -6.1 + i * 1.22], [2.6, 0.012, 0.6], "paint"));
}
decor.push(box("stop-e", [22.2, 0.006, -3.5], [0.4, 0.012, 7], "paint"), box("stop-w", [-26.9, 0.006, 3.5], [0.4, 0.012, 7], "paint"));
// manholes (+ steam)
decor.push(cyl("manhole-a", [-8.5, 0.01, -2.2], 0.42, 0.02, "metalDark", 0.42, 18), cyl("manhole-b", [13, 0.01, 3.8], 0.42, 0.02, "metalDark", 0.42, 18));
// Con Ed steam stack out on the avenue
decor.push(...barrel("coned", 36, -3), cyl("coned-stack", [36, 1.9, -3], 0.36, 3.8, "barrelOrange", 0.34), cyl("coned-band", [36, 2.6, -3], 0.37, 0.3, "policeWhite", 0.35), cyl("coned-band2", [36, 3.4, -3], 0.36, 0.3, "policeWhite", 0.345));

// ---- barricades at both ends (in front of the invisible walls) + corner signals
for (const [x, yaw] of [[25.9, 0], [-25.9, 0]] as Array<[number, number]>) {
  for (const [i, z] of [[0, -5.6], [1, -2.2], [2, 1.4], [3, 4.8]] as Array<[number, number]>) decor.push(sawhorse(`saw-${x}-${i}`, x, z, yaw, i % 2 === 0));
  for (const z of [-3.9, 3.1, 6.3]) decor.push(...barrel(`barrel-${x}-${z}`, x + (x > 0 ? 0.9 : -0.9), z));
}
decor.push(signal("sig-ne", 27.3, -7.5, FACE_W, "red"), signal("sig-se", 27.3, 7.5, FACE_W, "red"), signal("sig-nw", -27.3, -7.5, FACE_E, "green"), signal("sig-sw", -27.3, 7.5, FACE_E, "green"));

// ---- street lamps
for (const [id, x, s] of [["lamp-n1", -22, "n"], ["lamp-n2", 2, "n"], ["lamp-s1", -10, "s"], ["lamp-s2", 14, "s"], ["lamp-e1", 60, "n"], ["lamp-e2", 84, "s"], ["lamp-w1", -60, "s"]] as Array<[string, number, Side]>) {
  const l = lamp(id, x, s);
  if (Math.abs(x) < 28) { solid.push(l.solid); lights.push(l.light); } else decor.push(l.solid);
  decor.push(l.decor);
}

// ---- the blocks beyond the avenues (decor) and the skyline
{
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const mats = ["brick", "brownstone", "brickDark", "brickTan", "brownstoneLight", "club"];
  const shops: Array<"shop" | "cool" | "shutter"> = ["shop", "cool", "shutter", "shop", "shutter"];
  const awnings: Array<string | undefined> = ["awningRed", "awningGreen", "awningBlack", undefined, undefined];
  for (const s of ["n", "s"] as Side[])
    for (const [a, b] of [[48, 250], [-250, -42]] as Array<[number, number]>) {
      let x = a;
      while (x < b) {
        const w = Math.min(b - x, 9 + Math.floor(rnd() * 14));
        const h = 16 + Math.floor(rnd() * 26);
        const id = `blk-${s}-${x}`;
        decor.push(...building(id, x, x + w, s, h, mats[Math.floor(rnd() * mats.length)], 50));
        if (Math.abs(x) < 170) { // one lit (or shuttered) shop band per building + a fascia
          const k = Math.floor(rnd() * shops.length);
          const z = faceZ(s) + out(s) * 0.05;
          decor.push(box(`${id}-sf`, [x + w / 2, 1.7, z], [w - 1.4, 2.6, 0.08], shops[k] === "shop" ? "shopGlow" : shops[k] === "cool" ? "shopCool" : "shutter"));
          decor.push(box(`${id}-fa`, [x + w / 2, 3.4, z + out(s) * 0.05], [w - 0.4, 0.7, 0.14], "signBoard"));
          const aw = awnings[k];
          if (aw && Math.abs(x) < 120) decor.push(box(`${id}-aw`, [x + w / 2, 3.62, faceZ(s) + out(s) * 0.72], [w - 1.2, 0.05, 1.5], aw, { rot: [out(s) * 0.33, 0, 0] }));
        }
        if (rnd() < 0.3 && h > 22 && Math.abs(x) < 200) decor.push(...waterTower(`${id}-wt`, x + w / 2, h, faceZ(s) - out(s) * 14));
        x += w;
      }
    }
  const blades: Array<[number, Side, number, string, string, string]> = [
    [58, "n", 5, "LIQUOR", "neonPink", "neonCyan2"],
    [66, "s", 6, "BAR", "neonCyan2", "neonPink2"],
    [83, "n", 4.5, "DINER", "neonCyan2", "neonAmber"],
    [97, "s", 5.5, "HOTEL", "neonAmber", "neonRed"],
    [112, "n", 6, "PIZZA", "neonRed", "neonGreen"],
    [131, "s", 4.5, "PAWN", "neonPink2", "neonCyan2"],
    [-56, "n", 5, "CAFE", "neonPink2", "neonCyan2"],
  ];
  for (const [x, s, y, str, m, f] of blades) decor.push(bladeSign(`blade-${x}`, x, s, y, str, m, f, 0.24));
  // parked cars along the far curbs
  const paints = ["carBlack", "carRed", "carBlue", "cab"];
  for (const [i, x] of [52, 59, 71, 88, 104, 126, -48, -63, -80].entries()) {
    if (paints[i % 4] === "cab") {
      const c = cab(`fcab-${i}`, x, i % 2 ? -6.3 : 6.3, 0, i % 3 === 0);
      decor.push(c.solid, c.decor);
    } else decor.push(sedan(`car-${i}`, x, i % 2 ? -6.3 : 6.3, 0, paints[i % 4]));
  }
  // buildings up and down the avenues
  for (const [x0, x1] of [[8, 28], [48, 70], [-62, -42], [-28, -8]])
    for (const zs of [-1, 1]) {
      const h = 30 + Math.floor(rnd() * 40);
      decor.push(boxMM(`ave-${x0}-${zs}`, [x0, 0, zs < 0 ? -160 : 84], [x1, h, zs < 0 ? -84 : 160], mats[Math.floor(rnd() * 4)]));
    }
  // towers behind the blocks
  const towers: Array<[number, number, number, number, number]> = [];
  for (let x = -170; x < 260; x += 26 + Math.floor(rnd() * 18)) {
    for (const zs of [-1, 1]) {
      const w = 16 + Math.floor(rnd() * 14), d = 16 + Math.floor(rnd() * 14);
      const h = 45 + Math.floor(rnd() * 90);
      const z = zs * (80 + Math.floor(rnd() * 30));
      towers.push([x, z, w, d, h]);
    }
  }
  // the far skyline at the end of the street
  for (let i = 0; i < 14; i++) {
    const x = 280 + Math.floor(rnd() * 140), z = -140 + Math.floor(rnd() * 280);
    if (Math.abs(z) < 30 && x < 380) continue;
    towers.push([x, z, 20 + Math.floor(rnd() * 20), 20 + Math.floor(rnd() * 20), 80 + Math.floor(rnd() * 150)]);
  }
  for (let i = 0; i < 6; i++) towers.push([-300 - Math.floor(rnd() * 100), -120 + Math.floor(rnd() * 240), 24, 24, 70 + Math.floor(rnd() * 120)]);
  towers.forEach(([x, z, w, d, h], i) => {
    decor.push(box(`tower-${i}`, [x, h / 2, z], [w, h, d], "tower"));
    decor.push(box(`tower-${i}-top`, [x, h + 1.5, z], [w * 0.7, 3, d * 0.7], "roofDark"));
    if (h > 110) decor.push(box(`tower-${i}-avi`, [x, h + 3.3, z], [0.5, 0.5, 0.5], "aviation"));
    else if (i % 5 === 0) decor.push(box(`tower-${i}-crown`, [x, h + 0.3, z], [w + 0.3, 0.4, d + 0.3], "crownWarm"));
  });
  // the Art Deco spire at the end of the street
  const sx = 420, sz = -12;
  decor.push(box("spire-0", [sx, 60, sz], [48, 120, 40], "tower"), box("spire-1", [sx, 145, sz], [32, 50, 28], "tower"), box("spire-2", [sx, 190, sz], [22, 40, 20], "tower"));
  decor.push(box("spire-3", [sx, 222, sz], [13, 24, 12], "crownWarm"), box("spire-4", [sx, 242, sz], [7, 16, 7], "crownWarm"), box("spire-5", [sx, 266, sz], [1.6, 32, 1.6], "roofDark"), box("spire-avi", [sx, 283, sz], [1.2, 1.2, 1.2], "aviation"));
  for (const [y, w] of [[120.5, 48.6], [170.5, 32.6], [210.5, 22.6]] as Array<[number, number]>) decor.push(box(`spire-band-${y}`, [sx, y, sz], [w, 0.8, w * 0.85], "crownWarm"));
}

// ---------------------------------------------------------------- markers (greybox layout + perches)
const markers: Node[] = [
  marker("spawn", "spawn", [-22, 0, 3], {}, FACE_E),
  marker("checkpoint-0", "checkpoint", [-22, 0, 3], {}, FACE_E),
  // goons
  marker("goon-queue", "enemy", [8, 0.15, -8.2], { kind: "goon" }, FACE_W),
  marker("goon-bouncer", "enemy", [13.4, 0.15, -9.6], { kind: "goon" }, FACE_W),
  marker("goon-cab", "enemy", [5.4, 0, 4.8], { kind: "goon" }, FACE_W),
  marker("goon-street", "enemy", [14.5, 0, 2.5], { kind: "goon" }, FACE_W),
  marker("goon-fire-escape-n", "enemy", [-4.5, 3.3, -11.35], { kind: "goon", perch: true }, FACE_S),
  marker("goon-fire-escape-s", "enemy", [9.5, 3.3, 11.35], { kind: "goon", perch: true }, FACE_N),
  marker("goon-late-1", "enemy", [15.2, 0.15, -11.2], { kind: "goon", group: "door" }, FACE_S),
  marker("goon-late-2", "enemy", [22, 0, 5.2], { kind: "goon", group: "door" }, FACE_W),
  // cover points (facing = the direction they protect toward)
  marker("cover-cab1-e", "cover", [-11.3, 0, 6.4], { height: "low" }, FACE_W),
  marker("cover-cab2-e", "cover", [5.2, 0, 6.4], { height: "low" }, FACE_W),
  marker("cover-cab2-w", "cover", [-0.2, 0, 6.4], { height: "low" }, FACE_E),
  marker("cover-cab3-e", "cover", [13.2, 0, 1.2], { height: "low" }, FACE_W),
  marker("cover-cab3-n", "cover", [10.2, 0, -1.4], { height: "low" }, FACE_S),
  marker("cover-barrier-a-e", "cover", [-3.3, 0, 1.5], { height: "low" }, FACE_W),
  marker("cover-barrier-a-w", "cover", [-4.7, 0, 1.5], { height: "low" }, FACE_E),
  marker("cover-barrier-b-e", "cover", [5.7, 0, -2.5], { height: "low" }, FACE_W),
  marker("cover-queue", "cover", [9, 0.15, -7.3], { height: "low" }, FACE_S),
  marker("cover-queue-2", "cover", [12.7, 0.15, -5.2], { height: "low" }, FACE_W),
  marker("cover-planter", "cover", [19.8, 0.15, -7.4], { height: "low" }, FACE_W),
  marker("cover-mailbox", "cover", [-9.2, 0.15, -7.4], { height: "low" }, FACE_W),
  marker("cover-dumpster", "cover", [-4.4, 0.15, -10.2], { height: "low" }, FACE_W),
  marker("cover-kiosk", "cover", [-16.3, 0.15, -8.6], { height: "high", side: "left" }, FACE_W),
  marker("cover-pillar", "cover", [22, 0.15, 7.4], { height: "high", side: "right" }, FACE_W),
  // AI waypoints (auto-linked in line of sight within 14 m)
  ...[
    [-20, -5.5], [-12, -5.5], [-2, -6], [6, -5.2], [14.5, -8.6], [20, -5],
    [-20, 1], [-10, 0], [0, -0.5], [7.5, 2.8], [16, -1.5], [22.5, 1],
    [-20, 9.6], [-8, 9.6], [2.5, 9.4], [12, 7], [19, 9.4],
  ].map(([x, z], i) => marker(`wp-${i}`, "waypoint", [x, 0, z])),
  // pickups
  marker("copium-1", "pickup", [-8, 0.15, 9.8], { item: "copium", amount: 1 }),
  marker("copium-2", "pickup", [4, 0.15, -9.8], { item: "copium", amount: 1 }),
  // triggers: alert the street, the door opens (late goons), the exit at the door
  marker("trigger-alert", "trigger", [-12, 1, 0], { action: "alert" }, 0, [2, 3, 24]),
  marker("trigger-door", "trigger", [3, 1, 0], { action: "spawn", group: "door" }, 0, [2, 3, 24]),
  marker("exit-door", "exit", [15.2, 0.15, -11.4], {}, FACE_N),
  marker("trigger-exit", "trigger", [15.2, 1, -11.2], { action: "exit" }, 0, [2.6, 3, 2]),
  // look effects: steam from the manholes and the Con Ed stack (drips come with the awnings / fire escapes)
  marker("steam-a", "fx", [-8.5, 0.03, -2.2], { fx: "steam" }),
  marker("steam-b", "fx", [13, 0.03, 3.8], { fx: "steam" }),
  marker("steam-coned", "fx", [36, 3.8, -3], { fx: "steam", size: 1.6 }),
  // the neon's light on the street
  marker("light-club-door", "light", [15.2, 2.9, -10.1], { color: "#ff3fa8", intensity: 30, distance: 12 }),
  marker("light-club-sign", "light", [15.2, 5.2, -10.6], { color: "#ff5ec8", intensity: 45, distance: 16 }),
  marker("light-club-blade", "light", [22.6, 9, -9.6], { color: "#ff4fb8", intensity: 70, distance: 22 }),
  marker("light-hotel", "light", [17.2, 8, 9.6], { color: "#ff4a30", intensity: 50, distance: 18 }),
  marker("light-deli", "light", [-7.5, 2.4, 10.3], { color: "#b8f4ff", intensity: 18, distance: 9 }),
  ...lights,
  // dev camera shots (?cam=<id> in dev builds): data.at = the look-at point
  marker("cam-wide", "camera", [-31, 8.5, 4.5], { at: [10, 2.5, -5] }),
  marker("cam-club", "camera", [5, 1.9, 3.5], { at: [15.2, 4.2, -12] }),
  marker("cam-canyon", "camera", [-24, 1.6, -1], { at: [60, 6, -1.5] }),
];

// ---------------------------------------------------------------- materials
const T = "/textures/";
const facade = (tex: string, color = "#ffffff", name = "lit 1.8") => ({ color, texture: `${T}${tex}.webp`, repeat: true, repeatCount: [1 / 13.2, 1 / 13.2], roughness: 0.92, name });
const glow = (color: string, g: number, extra = "") => ({ materialType: "basic", color, toneMapped: false, name: `glow ${g}${extra ? ` ${extra}` : ""}` });
const materials: Record<string, Record<string, unknown>> = {
  asphalt: { color: "#ffffff", texture: `${T}asphalt.webp`, repeat: true, repeatCount: [0.25, 0.25], roughness: 0.42, name: "wet 1" },
  sidewalk: { color: "#ffffff", texture: `${T}sidewalk.webp`, repeat: true, repeatCount: [1 / 3, 1 / 3], roughness: 0.55, name: "wet 0.35" },
  curb: { color: "#8a8680", roughness: 0.45, name: "wet 0.3" },
  paint: { color: "#cfcdc4", roughness: 0.4, name: "wet 0.55" },
  brick: facade("facade-brick"),
  brickDark: facade("facade-brick", "#b8aaa6"),
  brickTan: facade("facade-brick", "#e8cfa8"),
  brickPlain: { color: "#5a2e26", roughness: 0.9 },
  brownstone: facade("facade-brownstone"),
  brownstoneLight: facade("facade-brownstone", "#e0cbb8"),
  brownstoneStep: { color: "#4a3024", roughness: 0.85 },
  club: facade("facade-club", "#ffffff", "lit 3 pulse"),
  cornice: { color: "#2e2c30", roughness: 0.8 },
  tower: { materialType: "basic", color: "#ffffff", texture: `${T}tower.webp`, repeat: true, repeatCount: [1 / 25.6, 1 / 51.2], toneMapped: false, name: "glow 1.5" },
  roofDark: { materialType: "basic", color: "#07080d" },
  crownWarm: glow("#ffcf8a", 2.2),
  aviation: glow("#ff2a1a", 6, "blink"),
  door: { color: "#101014", roughness: 0.4, metalness: 0.6 },
  doorGlass: { color: "#1a2230", roughness: 0.15, metalness: 0.3 },
  cab: { color: "#f2b518", roughness: 0.3, metalness: 0.35 },
  checker: { color: "#1b1b1d", roughness: 0.5 },
  glassDark: { color: "#0b0d13", roughness: 0.08, metalness: 0.4 },
  tire: { color: "#111113", roughness: 0.8 },
  headlight: glow("#fff1cc", 5),
  taillight: glow("#ff1a14", 3.5),
  cabSign: glow("#ffe7a8", 2.4),
  carBlack: { color: "#16171b", roughness: 0.3, metalness: 0.5 },
  carRed: { color: "#4a0f14", roughness: 0.3, metalness: 0.5 },
  carBlue: { color: "#14223e", roughness: 0.3, metalness: 0.5 },
  concrete: { color: "#8c8b86", roughness: 0.9 },
  bannerPink: { color: "#b3155f", roughness: 0.75 },
  chrome: { color: "#b9bcc4", roughness: 0.2, metalness: 0.9 },
  brass: { color: "#b38b3c", roughness: 0.3, metalness: 0.9 },
  velvet: { color: "#6a0c28", roughness: 0.85 },
  podium: { color: "#15151b", roughness: 0.4, metalness: 0.5 },
  planter: { color: "#3a3d36", roughness: 0.9 },
  shrub: { color: "#16261a", roughness: 0.95 },
  wood: { color: "#3b2a1f", roughness: 0.9 },
  mailbox: { color: "#1d3b86", roughness: 0.5, metalness: 0.4 },
  dumpster: { color: "#1f4a33", roughness: 0.6, metalness: 0.3 },
  trashBag: { color: "#0d0d10", roughness: 0.25 },
  kiosk: { color: "#27303f", roughness: 0.5, metalness: 0.5 },
  metalDark: { color: "#16171b", roughness: 0.45, metalness: 0.6 },
  fireEscape: { color: "#101114", roughness: 0.55, metalness: 0.6 },
  railPanel: { color: "#0c0d10", roughness: 0.7, metalness: 0.4 },
  lampPole: { color: "#262d2a", roughness: 0.5, metalness: 0.5 },
  signalBox: { color: "#1c1f16", roughness: 0.6, metalness: 0.3 },
  policeBlue: { color: "#1f3f8f", roughness: 0.6 },
  policeWhite: { color: "#d8d8d4", roughness: 0.6 },
  barrelOrange: { color: "#e2561a", roughness: 0.6 },
  shutter: { color: "#ffffff", texture: `${T}shutter.webp`, repeat: true, repeatCount: [1 / 1.28, 1 / 1.28], roughness: 0.5, metalness: 0.35 },
  signBoard: { color: "#0a0a0f", roughness: 0.6 },
  awningRed: { color: "#5e1119", roughness: 0.75 },
  awningGreen: { color: "#123524", roughness: 0.75 },
  awningBlack: { color: "#121216", roughness: 0.75 },
  posterPink: { color: "#b01a6c", roughness: 0.7 },
  posterCyan: { color: "#127c8a", roughness: 0.7 },
  invisible: { color: "#000000" },
  // unlit / glowing
  sodium: glow("#ffa24a", 6),
  bulbs: glow("#ffd9a0", 3),
  shopGlow: glow("#ffcf8f", 0.3), // shop windows stay under the bloom threshold: the neon in front must win
  shopCool: glow("#d9f2ff", 0.24),
  billboardGlow: glow("#1b1030", 1),
  neonPink: glow("#ff2f9e", 4, "pulse"),
  neonCyan: glow("#2ff0ff", 3.6, "pulse"),
  neonPink2: glow("#ff3aa8", 3.4),
  neonCyan2: glow("#36eaff", 3.2),
  neonRed: glow("#ff2a2a", 3.6),
  neonRedFlicker: glow("#ff2a2a", 3.6, "flicker"),
  neonAmber: glow("#ffa31f", 3.4),
  neonGreen: glow("#2cff6e", 3),
  amberBlink: glow("#ffab22", 5, "blink"),
  signalRed: glow("#ff2214", 4.5),
  signalGreen: glow("#20ff9a", 4),
  signalHand: glow("#ff7a1a", 2.6),
};

const prefab = {
  id: "room1",
  name: "Room 1: outside the Milady rave",
  materials,
  root: {
    id: "room",
    components: { data: { type: "Data", properties: { data: { room: { name: "Outside the Milady rave", next: "room2", music: "street", look: "street" } } } } },
    children: [
      { id: "geometry", children: solid },
      { id: "decor", components: { data: { type: "Data", properties: { data: { collider: false } } } }, children: decor },
      { id: "markers", children: markers },
    ],
  },
};

// node ids must be unique (the engine refuses duplicates)
const seen = new Set<string>();
const dupes: string[] = [];
const visit = (n: { id: string; children?: Array<{ id: string }> }) => { if (seen.has(n.id)) dupes.push(n.id); seen.add(n.id); for (const c of n.children ?? []) visit(c); };
visit(prefab.root);
if (dupes.length) throw new Error(`duplicate node ids: ${dupes.slice(0, 10).join(", ")}`);

const outFile = path.resolve(import.meta.dirname, "..", "public", "levels", "room1.json");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
// the editor's layout (indent 1), with number arrays kept on one line
const json = JSON.stringify(prefab, null, 1).replace(/\[\s*(-?[\d.e+-]+(?:,\s*-?[\d.e+-]+)*)\s*\]/g, (_m, inner: string) => `[${inner.split(/,\s*/).join(", ")}]`);
fs.writeFileSync(outFile, json + "\n");
const count = (ns: Node[]): number => ns.reduce((s, n) => s + 1 + count(n.children ?? []), 0);
console.log(`wrote ${path.relative(process.cwd(), outFile)}: ${count(solid)} solid nodes, ${count(decor)} decor nodes, ${markers.length} markers, ${Object.keys(materials).length} materials, ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB`);
