// Writes public/levels/room2.json: room 2, the rave inside CLUB MILADY (round-2 plan section 2). Like
// tools/room1.ts it is the starting point for hand-tuning in the editor (npm run dev -> /?editor=room2);
// re-running it OVERWRITES the file.
//   node tools/room2.ts && npm run check-level room2
//
// Layout (metres; x runs west -> east, the player comes in from the west facing +X; north = -Z):
//   hall x -20..20, z -14..14, ceiling 8 m (11.5 m over the stage, where the glass office looks down);
//   entrance vestibule x -20..-15 (z -5..5) behind a black velvet curtain with a 3 m gap at x -15;
//   LED dance floor x -8..8, z -7..7 under a lighting truss (y 6.5) with the mirror ball;
//   4 pillars at (+-5, +-7.5); speaker stacks at (-9.5, +-8.5) and beside the stage at (13.5, +-6.8);
//   DJ stage x 11..19.4, z -6..6, 1 m high, stairs at its north / south ends (x 11..12.5), the DJ
//   desk on it, the LED wall behind (x 19.3, y 1.5..7.5) and the lit office glass above (y 8.4..10.8);
//   the bar along the north wall (counter z -11.5..-10.7, x -9..7, back bar at z -13.4..-14);
//   the VIP platform along the south wall (z 9..14, x -10..8, 0.34 high) with 4 U-shaped booths;
//   the staff door (the exit) in the north wall at x 16 behind the stage's north stairs; a fire exit
//   (crowd only) in the south wall at x 7.5. No signs with text: neon geometry only.
// Gameplay: 7 goons (2 behind the bar, 2 in VIP booths, the DJ, one at the stage edge, one on the
// dance floor among the dancers), 4 rushers (group "backup": 2 from the staff door, 2 through the
// curtain behind the player) that come when he crosses the middle of the floor or once 4 hostiles are
// down; 21 cover points, ~36 waypoints, 3 copium; the crowd (18 dancers, 4 at the bar, 4 seated in
// the booths, the bouncer #42 by the staff door) and three crowd exits.
// Material name tokens (read by the club look, src/app/look/club.tsx, and the shared rules in
// look/tokens.ts): "glow <g>" (+ pulse / flicker / blink), "ledfloor <g>" (the LED tiles), "ledwall <g>"
// (the LED wall's frames), "worklight <g>" (fixtures that light up in the fight), "party <g>" (neon
// that goes dark in the fight).
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
function boxMM(id: string, a: V3, b: V3, mat: string, o: BoxOpts = {}): Node {
  return box(id, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])], mat, o);
}
function prim(id: string, type: "cylinder" | "sphere", pos: number[], args: number[], mat: string, rot?: number[]): Node {
  return {
    id,
    components: {
      transform: xf(pos, rot),
      geometry: { type: "Geometry", properties: { geometryType: type, args: args.map(r3) } },
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
/** A neon tube polyline (closed when `loop`) in the vertical plane x = const (points are [z, y]). */
function neonX(id: string, x: number, pts: Array<[number, number]>, mat: string, t = 0.06, loop = true): Node[] {
  const out: Node[] = [];
  const n = loop ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const [z1, y1] = pts[i], [z2, y2] = pts[(i + 1) % pts.length];
    const dz = z2 - z1, dy = y2 - y1;
    out.push(box(`${id}-${i}`, [x, (y1 + y2) / 2, (z1 + z2) / 2], [t, t, Math.hypot(dz, dy) + t * 0.6], mat, { rot: [-Math.atan2(dy, dz), 0, 0] }));
  }
  return out;
}
/** Same in the plane z = const (points are [x, y]). */
function neonZ(id: string, z: number, pts: Array<[number, number]>, mat: string, t = 0.06, loop = true): Node[] {
  const out: Node[] = [];
  const n = loop ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    const dx = x2 - x1, dy = y2 - y1;
    out.push(box(`${id}-${i}`, [(x1 + x2) / 2, (y1 + y2) / 2, z], [Math.hypot(dx, dy) + t * 0.6, t, t], mat, { rot: [0, 0, Math.atan2(dy, dx)] }));
  }
  return out;
}
/** Heart outline points (width ~2w, height ~2w) centred at (u, v). */
function heart(u: number, v: number, w: number, n = 22): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * PI * 2;
    const x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out.push([u + (x / 16) * w, v + (y / 16) * w]);
  }
  return out;
}

const solid: Node[] = [];
const decor: Node[] = [];

// ---------------------------------------------------------------- the hall
solid.push(boxMM("floor", [-20.5, -0.5, -14.5], [20.5, 0, 14.5], "floorConcrete"));
solid.push(boxMM("wall-n", [-20.5, 0, -14.5], [20.5, 11.8, -14], "padded"));
solid.push(boxMM("wall-s", [-20.5, 0, 14], [20.5, 11.8, 14.5], "padded"));
solid.push(boxMM("wall-w", [-20.5, 0, -14], [-20, 8, 14], "padded"));
solid.push(boxMM("wall-e", [20, 0, -14], [20.5, 11.8, 14], "padded"));
solid.push(boxMM("ceiling", [-20, 8, -14], [10, 8.3, 14], "ceiling"));
solid.push(boxMM("ceiling-high", [10, 11.5, -14], [20, 11.8, 14], "ceiling"));
decor.push(boxMM("soffit", [9.8, 8.3, -14], [10, 11.5, 14], "padded"));

// entrance vestibule and the curtain
solid.push(boxMM("vest-fill-n", [-20, 0, -14], [-15.25, 8, -5], "padded"));
solid.push(boxMM("vest-fill-s", [-20, 0, 5], [-15.25, 8, 14], "padded"));
solid.push(boxMM("part-n", [-15.25, 0, -5], [-15, 8, -1.5], "padded"));
solid.push(boxMM("part-s", [-15.25, 0, 1.5], [-15, 8, 5], "padded"));
solid.push(boxMM("part-lintel", [-15.25, 3.2, -1.5], [-15, 8, 1.5], "padded"));
solid.push(boxMM("vest-ceiling", [-20, 3.2, -5], [-15.25, 3.4, 5], "ceiling"));
decor.push(boxMM("curtain-n", [-15.12, 0, -2.3], [-14.88, 3.2, -1.5], "curtain"), boxMM("curtain-s", [-15.12, 0, 1.5], [-14.88, 3.2, 2.3], "curtain"));
decor.push(boxMM("curtain-valance", [-15.12, 2.9, -2.3], [-14.85, 3.25, 2.3], "curtain"));
decor.push(boxMM("street-door", [-19.99, 0, -1], [-19.94, 2.3, 1], "doorMetal"));
decor.push(boxMM("vest-light", [-17.6, 3.14, -0.2], [-17.4, 3.19, 0.2], "vestLamp"));
// coat check (low cover) just inside
solid.push(boxMM("coat-counter", [-14.4, 0, 6], [-13.6, 1.1, 10], "barFront"));
decor.push(boxMM("coat-top", [-14.5, 1.1, 5.9], [-13.5, 1.15, 10.1], "barTop"));
for (let i = 0; i < 5; i++) decor.push(boxMM(`coat-${i}`, [-14.9, 1.1, 6.3 + i * 0.8], [-14.6, 1.9, 6.6 + i * 0.8], i % 2 ? "curtain" : "boothLeather"));

// dance floor (LED tiles, a thin skin over the concrete) and the lighting truss with the mirror ball
decor.push(boxMM("led-floor", [-8, 0, -7], [8, 0.02, 7], "ledFloor"));
decor.push(boxMM("led-rim-n", [-8.05, 0, -7.05], [8.05, 0.03, -6.98], "neonCyanSoft"), boxMM("led-rim-s", [-8.05, 0, 6.98], [8.05, 0.03, 7.05], "neonCyanSoft"));
for (const [id, a, b] of [["n", [-8.2, 6.35, -7.2], [8.2, 6.65, -6.9]], ["s", [-8.2, 6.35, 6.9], [8.2, 6.65, 7.2]], ["w", [-8.2, 6.35, -6.9], [-7.9, 6.65, 6.9]], ["e", [7.9, 6.35, -6.9], [8.2, 6.65, 6.9]]] as Array<[string, V3, V3]>) decor.push(boxMM(`truss-${id}`, a, b, "truss"));
for (const [x, z] of [[-8, -7], [8, -7], [-8, 7], [8, 7]]) decor.push(boxMM(`truss-rod-${x}${z}`, [x - 0.03, 6.65, z - 0.03], [x + 0.03, 8, z + 0.03], "metalDark"));
// the mirror ball itself is the look's (it turns): an fx marker below
decor.push(boxMM("mirror-rod", [-0.02, 6.4, -0.02], [0.02, 8, 0.02], "metalDark"));
// laser heads on the truss and on top of the LED wall
const lasers: Node[] = [];
[[-6, -7.05], [-2, -7.05], [2, -7.05], [6, -7.05], [-6, 7.05], [-2, 7.05], [2, 7.05], [6, 7.05]].forEach(([x, z], i) => {
  decor.push(boxMM(`laser-head-${i}`, [x - 0.12, 6.18, z - 0.1], [x + 0.12, 6.35, z + 0.1], "laserHead"));
  lasers.push(marker(`laser-${i}`, "fx", [x, 6.2, z], { fx: "laser", color: i % 2 ? "#3ff0ff" : "#ff3fa8" }));
});
[-6, -2, 2, 6].forEach((z, i) => {
  decor.push(boxMM(`laser-head-w${i}`, [19.0, 7.55, z - 0.12], [19.3, 7.72, z + 0.12], "laserHead"));
  lasers.push(marker(`laser-w${i}`, "fx", [19.1, 7.6, z], { fx: "laser", color: i % 2 ? "#ff3fa8" : "#3ff0ff" }));
});

// pillars (high cover) with thin neon edges
for (const [x, z] of [[-5, -7.5], [5, -7.5], [-5, 7.5], [5, 7.5]]) {
  solid.push(box(`pillar-${x}${z}`, [x, 4, z], [0.9, 8, 0.9], "pillar"));
  for (const [dx, dz] of [[-0.46, -0.46], [0.46, -0.46], [-0.46, 0.46], [0.46, 0.46]]) decor.push(box(`pillar-${x}${z}-n${dx}${dz}`, [x + dx, 4, z + dz], [0.04, 7.9, 0.04], "partyPink"));
}

// speaker stacks (high cover): a dark cabinet, the grille face toward the floor
function speaker(id: string, x: number, z: number, faceX: 1 | -1): void {
  solid.push(box(id, [x, 1.6, z], [1.4, 3.2, 1.4], "speakerBox", { data: { surface: "speaker" } }));
  decor.push(box(`${id}-face`, [x + faceX * 0.71, 1.6, z], [0.02, 3.2, 1.4], "speakerFront", { rot: [0, faceX > 0 ? 0 : PI, 0] }));
}
speaker("speaker-w-n", -9.5, -8.5, 1);
speaker("speaker-w-s", -9.5, 8.5, 1);
speaker("speaker-st-n", 13.5, -6.8, -1);
speaker("speaker-st-s", 13.5, 6.8, -1);

// DJ stage, its stairs, the desk, the LED wall and the office glass above
solid.push(boxMM("stage", [11, 0, -6], [19.4, 1.0, 6], "stage"));
decor.push(boxMM("stage-edge", [10.97, 0.92, -6], [11.0, 0.98, 6], "neonCyanSoft"));
for (const s of [-1, 1]) {
  for (let k = 0; k < 3; k++) {
    const z0 = s * (7.2 - k * 0.4), z1 = s * (6.8 - k * 0.4);
    solid.push(boxMM(`stair-${s > 0 ? "s" : "n"}-${k}`, [11, 0, Math.min(z0, z1)], [12.5, (k + 1) / 3, Math.max(z0, z1)], "stage"));
  }
}
solid.push(boxMM("dj-desk", [12, 1.0, -2.5], [13, 2.1, 2.5], "djDesk", { data: { surface: "wood" } }));
decor.push(boxMM("dj-front", [11.98, 1.0, -2.5], [12.0, 2.1, 2.5], "djFront"));
decor.push(prim("deck-l", "cylinder", [12.5, 2.13, -1.1], [0.32, 0.32, 0.05, 20], "vinyl"), prim("deck-r", "cylinder", [12.5, 2.13, 1.1], [0.32, 0.32, 0.05, 20], "vinyl"));
decor.push(boxMM("mixer", [12.25, 2.1, -0.4], [12.75, 2.16, 0.4], "metalDark"), boxMM("dj-lamp", [12.8, 2.1, 2.1], [12.9, 2.5, 2.2], "warmLamp"));
decor.push(boxMM("led-wall", [19.3, 1.5, -8], [19.4, 7.5, 8], "ledWall"), boxMM("led-wall-frame", [19.4, 1.35, -8.2], [19.6, 7.65, 8.2], "metalDark"));
decor.push(boxMM("office-glass", [19.62, 8.4, -3.5], [19.9, 10.8, 3.5], "officeWindow"));
decor.push(boxMM("office-sill", [18.6, 8.15, -3.9], [19.95, 8.4, 3.9], "metalDark"), boxMM("office-head", [19.5, 10.8, -3.9], [19.95, 11.1, 3.9], "metalDark"));
for (const z of [-3.6, -1.2, 1.2, 3.6]) decor.push(boxMM(`office-mull-${z}`, [19.55, 8.4, z - 0.05], [19.62, 10.8, z + 0.05], "metalDark"));

// the bar (north): counter (low cover), the lit back bar, stools
solid.push(boxMM("bar-counter", [-9, 0, -11.5], [7, 1.1, -10.7], "barFront", { data: { surface: "wood" } }));
solid.push(boxMM("bar-top", [-9.1, 1.1, -11.6], [7.1, 1.16, -10.6], "barTop"));
decor.push(boxMM("bar-glow", [-9, 0.06, -10.69], [7, 0.1, -10.66], "partyPink"));
solid.push(boxMM("back-bar", [-9, 0, -14], [7, 2.8, -13.4], "backbar", { data: { surface: "bottle" } }));
decor.push(boxMM("back-bar-top", [-9.1, 2.8, -14], [7.1, 3.4, -13.3], "metalDark"));
for (let i = 0; i < 11; i++) {
  const x = -8.2 + i * 1.45;
  decor.push(prim(`stool-${i}`, "cylinder", [x, 0.78, -10.1], [0.19, 0.19, 0.07, 16], "boothLeather"), prim(`stool-${i}-pole`, "cylinder", [x, 0.38, -10.1], [0.035, 0.035, 0.76, 8], "chrome"));
}

// VIP platform (south) with four U-shaped booths (1 m backs: low cover) and velvet ropes
const Y0 = 0.34;
solid.push(boxMM("vip-platform", [-10, 0, 9], [8, Y0, 14], "carpetVip"));
decor.push(boxMM("vip-edge", [-10, Y0 - 0.05, 8.97], [8, Y0, 9.0], "neonCyanSoft"));
const BOOTHS = [-8.2, -3.7, 0.8, 5.3];
const vipLights: Node[] = [];
BOOTHS.forEach((cx, i) => {
  const id = `booth-${i + 1}`;
  solid.push(boxMM(`${id}-back`, [cx - 1.6, Y0, 13.0], [cx + 1.6, Y0 + 1.0, 13.4], "booth"));
  solid.push(boxMM(`${id}-side-l`, [cx - 1.6, Y0, 10.6], [cx - 1.2, Y0 + 1.0, 13.0], "booth"));
  solid.push(boxMM(`${id}-side-r`, [cx + 1.2, Y0, 10.6], [cx + 1.6, Y0 + 1.0, 13.0], "booth"));
  solid.push(boxMM(`${id}-seat-l`, [cx - 1.2, Y0, 10.8], [cx - 0.7, Y0 + 0.55, 12.9], "boothSeat"));
  solid.push(boxMM(`${id}-seat-r`, [cx + 0.7, Y0, 10.8], [cx + 1.2, Y0 + 0.55, 12.9], "boothSeat"));
  solid.push(boxMM(`${id}-table`, [cx - 0.45, Y0, 11.3], [cx + 0.45, Y0 + 0.75, 12.1], "table", { data: { surface: "wood" } }));
  decor.push(prim(`${id}-lamp`, "cylinder", [cx, Y0 + 0.86, 11.75], [0.07, 0.09, 0.2, 12], "warmLamp"));
  decor.push(boxMM(`${id}-back-trim`, [cx - 1.6, Y0 + 1.0, 13.0], [cx + 1.6, Y0 + 1.05, 13.4], "partyPink"));
  vipLights.push(marker(`light-${id}`, "light", [cx, Y0 + 1.5, 11.8], { color: "#ffb070", intensity: 9, distance: 5.5 }));
});
for (let i = 0; i < 5; i++) {
  const x = -10 + i * 4.5;
  decor.push(prim(`rope-post-${i}`, "cylinder", [x, Y0 + 0.5, 8.85], [0.05, 0.07, 1.0, 10], "brass"));
  if (i < 4) decor.push(box(`rope-${i}`, [x + 2.25, Y0 + 0.82, 8.85], [4.4, 0.05, 0.05], "velvetRope"));
}

// the staff door (the exit, NE) with its red light, and the fire exit (crowd only, SE)
decor.push(boxMM("staff-door", [15.4, 0, -14.0], [16.6, 2.2, -13.94], "doorMetal"), boxMM("staff-frame", [15.3, 2.2, -14.0], [16.7, 2.32, -13.92], "metalDark"));
decor.push(boxMM("staff-light", [15.8, 2.45, -13.99], [16.2, 2.6, -13.9], "exitRed"));
decor.push(boxMM("fire-door", [6.9, Y0, 13.94], [8.1, Y0 + 2.2, 14.0], "doorMetal"), boxMM("fire-light", [7.3, Y0 + 2.45, 13.9], [7.7, Y0 + 2.6, 13.99], "exitRed"));

// neon hearts (geometry, no lettering) and posters
decor.push(...neonZ("heart-bar", -13.35, heart(-1, 5.2, 0.9), "partyPink", 0.07));
decor.push(...neonX("heart-stage-n", 19.25, heart(-10.5, 5.5, 0.7), "neonCyan", 0.06), ...neonX("heart-stage-s", 19.25, heart(10.5, 5.5, 0.7), "neonPink", 0.06));
decor.push(box("poster-1", [-14.99, 1.7, -3.4], [0.02, 0.9, 0.6], "poster1"), box("poster-2", [-14.99, 1.7, 3.4], [0.02, 0.9, 0.6], "poster2"));
decor.push(box("poster-3", [9.2, 1.7, -13.99], [0.6, 0.9, 0.02], "poster3"), box("poster-4", [-17.5, 1.6, 4.99], [0.6, 0.9, 0.02], "poster1"));

// work lights (off in the party, up in the fight): ceiling fixtures; the look lights the 5 marked
// ones (4 soft overheads over the hall + one over the stage), the rest are fixtures only
const workLights: Node[] = [marker("mirror-ball", "fx", [0, 6, 0], { fx: "mirrorball", r: 0.45 })];
[[-11, 0, true], [-3, -8, true], [-3, 8, true], [5.5, 0, true], [-11, -9, false], [-11, 9, false], [5.5, -9, false], [5.5, 9, false]].forEach(([x, z, lit], i) => {
  decor.push(boxMM(`work-fix-${i}`, [(x as number) - 0.7, 7.85, (z as number) - 0.25], [(x as number) + 0.7, 7.98, (z as number) + 0.25], "workLight"));
  if (lit) workLights.push(marker(`work-${i}`, "fx", [x as number, 7.5, z as number], { fx: "worklight" }));
});
decor.push(boxMM("work-fix-st", [14.8, 11.35, -0.7], [15.3, 11.48, 0.7], "workLight"));
workLights.push(marker("work-st", "fx", [15, 10.8, 0], { fx: "worklight", intensity: 1.6 }));

// ---------------------------------------------------------------- markers
const markers: Node[] = [
  marker("spawn", "spawn", [-18, 0, 0], {}, FACE_E),
  marker("checkpoint-0", "checkpoint", [-18, 0, 0], {}, FACE_E),
  // goons (7): behind the bar, in two VIP booths (they hold the booth: perched), the DJ, the stage
  // edge, and one on the east half of the dance floor among the dancers
  marker("goon-bar-1", "enemy", [-5.5, 0, -12.4], { kind: "goon" }, FACE_S),
  marker("goon-bar-2", "enemy", [2.5, 0, -12.4], { kind: "goon" }, FACE_S),
  marker("goon-vip-1", "enemy", [-8.2, Y0, 12.55], { kind: "goon", perch: true }, FACE_N),
  marker("goon-vip-3", "enemy", [0.8, Y0, 12.55], { kind: "goon", perch: true }, FACE_N),
  marker("goon-dj", "enemy", [13.55, 1.0, 0], { kind: "goon", perch: true, dj: true, idleClip: "DJ_Idle" }, FACE_W),
  marker("goon-stage", "enemy", [11.6, 1.0, 4.2], { kind: "goon" }, FACE_W),
  marker("goon-floor", "enemy", [5.4, 0, -2.2], { kind: "goon", idleClip: "Dance_3" }, FACE_W),
  // rushers (4): the backup, from the staff door and through the curtain behind him
  marker("rusher-staff-1", "enemy", [15.6, 0, -12.9], { kind: "rusher", group: "backup" }, FACE_S),
  marker("rusher-staff-2", "enemy", [16.6, 0, -12.7], { kind: "rusher", group: "backup" }, FACE_S),
  marker("rusher-front-1", "enemy", [-18.6, 0, -1.2], { kind: "rusher", group: "backup" }, FACE_E),
  marker("rusher-front-2", "enemy", [-18.6, 0, 1.2], { kind: "rusher", group: "backup" }, FACE_E),
  // cover points (facing = the direction they protect toward)
  marker("cover-bar-1", "cover", [-7, 0, -12.1], { height: "low" }, FACE_S),
  marker("cover-bar-2", "cover", [-2, 0, -12.1], { height: "low" }, FACE_S),
  marker("cover-bar-3", "cover", [3.5, 0, -12.1], { height: "low" }, FACE_S),
  marker("cover-bar-e", "cover", [7.6, 0, -11.1], { height: "low" }, FACE_W),
  marker("cover-bar-w", "cover", [-9.6, 0, -11.1], { height: "low" }, FACE_E),
  marker("cover-pillar-ne", "cover", [5.75, 0, -7.5], { height: "high", side: "left" }, FACE_W),
  marker("cover-pillar-se", "cover", [5.75, 0, 7.5], { height: "high", side: "right" }, FACE_W),
  marker("cover-pillar-nw", "cover", [-4.25, 0, -7.5], { height: "high", side: "left" }, FACE_W),
  marker("cover-pillar-sw", "cover", [-4.25, 0, 7.5], { height: "high", side: "right" }, FACE_W),
  marker("cover-pillar-se-w", "cover", [4.25, 0, 7.5], { height: "high", side: "left" }, FACE_E),
  marker("cover-pillar-nw-w", "cover", [-5.75, 0, -7.5], { height: "high", side: "right" }, FACE_E),
  marker("cover-speaker-wn", "cover", [-8.35, 0, -8.5], { height: "high", side: "left" }, FACE_W),
  marker("cover-speaker-ws", "cover", [-8.35, 0, 8.5], { height: "high", side: "right" }, FACE_W),
  marker("cover-speaker-sn", "cover", [14.75, 0, -6.8], { height: "high", side: "left" }, FACE_W),
  marker("cover-speaker-ss", "cover", [14.75, 0, 6.8], { height: "high", side: "right" }, FACE_W),
  marker("cover-dj-n", "cover", [13.5, 1.0, -1.6], { height: "low" }, FACE_W),
  marker("cover-dj-s", "cover", [13.5, 1.0, 1.6], { height: "low" }, FACE_W),
  marker("cover-vip-12", "cover", [-5.95, Y0, 11.8], { height: "low" }, FACE_W),
  marker("cover-vip-23", "cover", [-1.45, Y0, 11.8], { height: "low" }, FACE_W),
  marker("cover-vip-34", "cover", [3.05, Y0, 11.8], { height: "low" }, FACE_W),
  marker("cover-coat", "cover", [-13.05, 0, 8], { height: "low" }, FACE_W),
  // waypoints (auto-linked in knee-height line of sight; the stage links explicitly over its stairs)
  ...([
    ["vest", -17.5, 0, 0], ["curtain", -13, 0, 0], ["coat", -12, 0, 4.6], ["nw", -12, 0, -8.5], ["w", -11, 0, 0], ["sw", -12, 0, 9],
    ["bar-w", -10.4, 0, -12.4], ["bar-1", -4.5, 0, -12.45], ["bar-2", 1, 0, -12.45], ["bar-e", 8.3, 0, -12.45],
    ["n1", -6.5, 0, -9.3], ["n2", 0, 0, -9.3], ["n3", 6.5, 0, -9.3],
    ["f0", 0, 0, 0], ["f1", -4, 0, -3.6], ["f2", 4, 0, -3.6], ["f3", -4, 0, 3.6], ["f4", 4, 0, 3.6],
    ["s1", -6.5, 0, 8.3], ["s2", 0, 0, 8.3], ["s3", 6.5, 0, 8.3], ["se", 9.9, 0, 8.4], ["e", 9.6, 0, 0],
    ["ne1", 10.2, 0, -9.6], ["ne2", 15, 0, -10], ["se2", 15.5, 0, 9.6], ["staff", 16, 0, -12.6], ["stair-n", 11.75, 0, -7.6], ["stair-s", 11.75, 0, 7.6],
    ["v1", -8.2, Y0, 9.9], ["v12", -5.95, Y0, 9.9], ["v2", -3.7, Y0, 9.9], ["v23", -1.45, Y0, 9.9], ["v3", 0.8, Y0, 9.9], ["v34", 3.05, Y0, 9.9], ["v4", 5.3, Y0, 9.9], ["fire", 7.5, Y0, 11.4],
  ] as Array<[string, number, number, number]>).map(([id, x, y, z]) => marker(`wp-${id}`, "waypoint", [x, y, z])),
  marker("wp-stage-n", "waypoint", [11.75, 1.0, -5.5], { links: ["wp-stair-n", "wp-stage-fn", "wp-stage-bn"] }),
  marker("wp-stage-s", "waypoint", [11.75, 1.0, 5.5], { links: ["wp-stair-s", "wp-stage-fs", "wp-stage-bs"] }),
  marker("wp-stage-fn", "waypoint", [11.5, 1.0, -3.2], { links: ["wp-stage-n", "wp-stage-fs"] }),
  marker("wp-stage-fs", "waypoint", [11.5, 1.0, 3.2], { links: ["wp-stage-s", "wp-stage-fn"] }),
  marker("wp-stage-bn", "waypoint", [15.5, 1.0, -3.2], { links: ["wp-stage-n", "wp-stage-bs"] }),
  marker("wp-stage-bs", "waypoint", [15.5, 1.0, 3.2], { links: ["wp-stage-s", "wp-stage-bn"] }),
  // copium: behind the bar, on the table in the second VIP booth, on the DJ stage
  marker("copium-bar", "pickup", [-0.5, 0, -12.6], { item: "copium", amount: 1 }),
  marker("copium-vip", "pickup", [-3.7, Y0 + 0.75, 11.4], { item: "copium", amount: 1 }),
  marker("copium-stage", "pickup", [16, 1.0, -3.6], { item: "copium", amount: 1 }),
  // triggers: the backup comes when he crosses the middle of the floor, or once 4 are down; the exit
  marker("trigger-backup", "trigger", [0, 1, 0], { action: "spawn", group: "backup" }, 0, [4, 3, 28]),
  marker("trigger-backup-late", "trigger", [0, -40, 0], { action: "spawn", group: "backup", afterKills: 4 }, 0, [0.2, 0.2, 0.2]),
  marker("exit-door", "exit", [16, 0, -13.6], {}, FACE_N),
  marker("trigger-exit", "trigger", [16, 1, -12.9], { action: "exit" }, 0, [2.4, 3, 1.6]),
  // the crowd: 18 dancers facing the DJ, 4 at the bar ends, 4 seated in booths 2 and 4, the bouncer
  marker("crowd-floor", "crowd", [0, 0, 0], { count: 18, clips: ["Dance_1", "Dance_2", "Dance_3", "Dance_4", "Dance_5", "Dance_6"] }, FACE_E, [14.5, 1, 12.5]),
  marker("crowd-bar-w", "crowd", [-10.7, 0, -9.7], { count: 2, clips: ["Drink_Idle"] }, FACE_E, [1.4, 1, 1.6]),
  marker("crowd-bar-e", "crowd", [8.6, 0, -9.7], { count: 2, clips: ["Drink_Idle"] }, FACE_W, [1.4, 1, 1.6]),
  ...[BOOTHS[1], BOOTHS[3]].flatMap((cx, b) => [-1, 1].map(s => marker(`crowd-vip-${b}${s > 0 ? "r" : "l"}`, "crowd", [cx + s * 0.95, Y0, 11.9], { count: 1, clips: ["Sit_Idle"], seated: true, stand: [cx, 10.2] }, s > 0 ? FACE_W : FACE_E))),
  marker("crowd-bouncer", "crowd", [14.2, 0, -11.9], { count: 1, milady: 42, role: "bouncer", flee: "exit-staff", clips: ["Drink_Idle"] }, FACE_W),
  marker("exit-front", "crowdExit", [-19.2, 0, 0]),
  marker("exit-staff", "crowdExit", [16, 0, -13.4]),
  marker("exit-fire", "crowdExit", [7.5, Y0, 13.5]),
  // lights: the bar's under-glow and back bar, the VIP lamps, the DJ booth, the staff door's red light
  marker("light-bar", "light", [-1, 0.5, -10.1], { color: "#ff3fa8", intensity: 16, distance: 9 }),
  marker("light-backbar", "light", [-1, 2.3, -12.8], { color: "#ffb35c", intensity: 14, distance: 8 }),
  marker("light-dj", "light", [12.4, 2.7, 0], { color: "#ff4fd0", intensity: 16, distance: 7 }),
  marker("light-staff", "light", [16, 2.4, -13.2], { color: "#ff2020", intensity: 9, distance: 5 }),
  marker("light-vest", "light", [-17.5, 2.8, 0], { color: "#ffcf9a", intensity: 10, distance: 7 }),
  ...vipLights,
  ...lasers,
  ...workLights,
  // camera shots (?cam=<id> in dev builds)
  marker("cam-floor", "camera", [-14.2, 2.6, 0.5], { at: [8, 1.6, 0] }),
  marker("cam-dj", "camera", [16.8, 3.4, 0.3], { at: [-6, 1, 0] }),
];

// ---------------------------------------------------------------- materials
const T = "/textures/club/";
const tex = (file: string, metres: number | [number, number], extra: Record<string, unknown> = {}) => {
  const [mx, my] = Array.isArray(metres) ? metres : [metres, metres];
  return { color: "#ffffff", texture: `${T}${file}.webp`, repeat: true, repeatCount: [1 / mx, 1 / my], roughness: 0.8, ...extra };
};
const glow = (color: string, g: number, extra = "", kind = "glow") => ({ materialType: "basic", color, toneMapped: false, name: `${kind} ${g}${extra ? ` ${extra}` : ""}` });
const materials: Record<string, Record<string, unknown>> = {
  floorConcrete: tex("floor_polished_concrete", 4, { roughness: 0.32 }),
  padded: tex("club_wall_padded", 2, { roughness: 0.9 }),
  ceiling: { color: "#08080b", roughness: 0.95 },
  curtain: tex("curtain_velvet", 1.5, { roughness: 0.95 }),
  barFront: tex("bar_front", [2, 1.1], { roughness: 0.35 }),
  barTop: tex("bar_top_marble", 1.5, { roughness: 0.2, metalness: 0.1 }),
  backbar: { ...tex("backbar_shelves", [8, 2.8], { roughness: 0.6 }), materialType: "basic", toneMapped: false, name: "glow 0.45" },
  boothLeather: tex("booth_leather", 1, { roughness: 0.55 }),
  booth: tex("booth_leather", 1, { roughness: 0.55 }),
  boothSeat: tex("booth_leather", 1, { roughness: 0.5, color: "#e8d0e0" }),
  carpetVip: tex("carpet_vip", 2, { roughness: 0.95 }),
  speakerBox: { color: "#0c0c10", roughness: 0.7 },
  speakerFront: { color: "#ffffff", texture: `${T}speaker_front.webp`, roughness: 0.8 },
  stage: { color: "#101016", roughness: 0.45, metalness: 0.2 },
  djDesk: { color: "#0e0e14", roughness: 0.3, metalness: 0.3 },
  djFront: { materialType: "basic", color: "#ffffff", texture: `${T}dj_booth_front.webp`, toneMapped: false, name: "glow 0.6" },
  ledFloor: { materialType: "basic", color: "#ffffff", texture: `${T}dancefloor_led.webp`, repeat: true, repeatCount: [0.5, 0.5], toneMapped: false, name: "ledfloor 0.5" },
  ledWall: { materialType: "basic", color: "#ffffff", texture: `${T}ledwall_atlas.webp`, toneMapped: false, name: "ledwall 0.6" },
  officeWindow: { materialType: "basic", color: "#ffffff", texture: `${T}office_window_lit.webp`, toneMapped: false, name: "glow 0.5" },
  truss: { color: "#ffffff", texture: `${T}truss_alpha.webp`, repeat: true, repeatCount: [1, 1], transparent: false, alphaTest: 0.5, side: "DoubleSide", roughness: 0.4, metalness: 0.7 },
  table: { color: "#141016", roughness: 0.25, metalness: 0.2 },
  pillar: { color: "#121016", roughness: 0.3, metalness: 0.35 },
  doorMetal: { color: "#ffffff", texture: "/textures/backrooms/door_metal.webp", roughness: 0.55, metalness: 0.4 },
  poster1: { color: "#ffffff", texture: `${T}poster_1.webp`, roughness: 0.7 },
  poster2: { color: "#ffffff", texture: `${T}poster_2.webp`, roughness: 0.7 },
  poster3: { color: "#ffffff", texture: `${T}poster_3.webp`, roughness: 0.7 },
  metalDark: { color: "#16171b", roughness: 0.45, metalness: 0.6 },
  chrome: { color: "#b9bcc4", roughness: 0.2, metalness: 0.9 },
  brass: { color: "#b38b3c", roughness: 0.3, metalness: 0.9 },
  vinyl: { color: "#0a0a0c", roughness: 0.25 },
  velvetRope: { color: "#6a0c28", roughness: 0.85 },
  laserHead: { color: "#1a1a20", roughness: 0.5, metalness: 0.5 },
  // unlit / glowing (the club look keeps these under the bloom's reach: bloom is <= 0.35 indoors)
  warmLamp: glow("#ffc98a", 1.6),
  vestLamp: glow("#ffc98a", 0.8),
  exitRed: glow("#ff2a1a", 2.2),
  neonCyan: glow("#2ff0ff", 1.8, "pulse"),
  neonPink: glow("#ff2f9e", 1.8, "pulse"),
  neonCyanSoft: glow("#36eaff", 1.1),
  partyPink: glow("#ff3aa8", 1.4, "pulse", "party"),
  workLight: glow("#fff1dc", 2.4, "", "worklight"),
};

const prefab = {
  id: "room2",
  name: "Room 2: the rave",
  materials,
  root: {
    id: "room",
    components: {
      data: {
        type: "Data",
        properties: {
          data: {
            room: {
              name: "The Rave", next: "room3", cutsceneAfter: "c2", music: "rave", look: "club", footsteps: "hard", alertOnShot: true, alertAll: true,
              enterLine: "r2_enter", clearLine: "r2_clear", tutorial: false, prompt: "the bag went up. the staff door, behind the stage.",
            },
          },
        },
      },
    },
    children: [
      { id: "geometry", children: solid },
      { id: "decor", components: { data: { type: "Data", properties: { data: { collider: false } } } }, children: decor },
      { id: "markers", children: markers },
    ],
  },
};

const seen = new Set<string>();
const dupes: string[] = [];
const visit = (n: { id: string; children?: Array<{ id: string }> }) => { if (seen.has(n.id)) dupes.push(n.id); seen.add(n.id); for (const c of n.children ?? []) visit(c); };
visit(prefab.root);
if (dupes.length) throw new Error(`duplicate node ids: ${dupes.slice(0, 10).join(", ")}`);

const outFile = path.resolve(import.meta.dirname, "..", "public", "levels", "room2.json");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const json = JSON.stringify(prefab, null, 1).replace(/\[\s*(-?[\d.e+-]+(?:,\s*-?[\d.e+-]+)*)\s*\]/g, (_m, inner: string) => `[${inner.split(/,\s*/).join(", ")}]`);
fs.writeFileSync(outFile, json + "\n");
const count = (ns: Node[]): number => ns.reduce((s, n) => s + 1 + count(n.children ?? []), 0);
console.log(`wrote ${path.relative(process.cwd(), outFile)}: ${count(solid)} solid nodes, ${count(decor)} decor nodes, ${markers.length} markers, ${Object.keys(materials).length} materials, ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB`);
