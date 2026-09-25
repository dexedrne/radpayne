// Writes public/levels/room3.json: room 3, the back of the house behind CLUB MILADY (round-2 plan
// section 3). Like tools/room1.ts / room2.ts it is the starting point for hand-tuning in the editor
// (npm run dev -> /?editor=room3); re-running it OVERWRITES the file.
//   node tools/room3.ts && npm run check-level room3
//
// Layout (metres; north = -Z; ceilings 3.0 m; every corridor 2.6 m wide, every door 1.6 m or more, so
// the right-shoulder camera never pins to a wall; the route turns right at every corner):
//   A  service corridor  x -4.3..-1.7, z 2..-19, north from the staff door; two door alcoves (0.8 deep),
//      a cleaning cart; at the far end it turns right (east) along z -19..-16.4 to the storage room.
//      Heavy #1 (group "hall") comes round that corner when the player is 5 m in.
//   B  storage room      x 7..17, z -22..-14: steel shelving, stacked boxes (1 m and 2 m), the spare
//      shotgun on its rack by the door; 2 goons and a rusher (asleep behind the walls until they see him
//      or he reaches the door).
//   C  office hallway    x 12.7..15.3, z -14..-4, south from the storage room, ending at the LOCKED
//      office door (door-office, 1.6 m double door). The last 4 m are the breach trigger: a shootdodge
//      through it takes the door out (slow motion, no meter), else the heavy inside kicks it open after
//      25 s.
//   D  security office   x 9.5..18.5, z -4..3: the CCTV console along the south wall (the heavy and a
//      goon watching it, backs half turned to the door), a monitor rack, 2 desks, the open gun locker
//      with the dual SMGs. Its west wall is glass from z -0.6 (the manager's office behind it) with a
//      doorway at z -2.2..-0.6. Clearing it is a checkpoint.
//   E  manager's office  x -1..9.3, z -4..5: the big desk (the manager, a heavy who holds his spot),
//      bookshelves, a sofa; 2 rushers come in through the side door (south) once the security office is
//      clear.
//   F  elevator lobby    x 0.4..6.4, z -10..-4.2, north of the manager's office: the service elevator
//      (the exit) and its keycard reader.
// Hostiles 9 (goons 3, rushers 3, heavies 3), 13 cover points, 27 waypoints, 3 copium, 2 weapon pickups.
// Material name tokens (the back-rooms look, src/app/look/backrooms.tsx, and look/tokens.ts): "glow <g>"
// (+ flicker). No lettering anywhere: exit lights are plain red boxes.
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
function marker(id: string, kind: string, pos: number[], data: Record<string, unknown> = {}, yaw = 0, scale?: number[]): Node {
  return {
    id,
    components: {
      transform: xf(pos, yaw ? [0, yaw, 0] : undefined, scale),
      data: { type: "Data", properties: { data: { marker: kind, ...data } } },
    },
  };
}

const solid: Node[] = [];
const decor: Node[] = [];
const H = 3.0; // ceiling height

/** A cinderblock wall (x0..x1, z0..z1): the dado course up to 2 m, the cream upper band above it (the
 *  texture's cream half, offset), so the green never shows under the ceiling. */
function blockWall(id: string, x0: number, z0: number, x1: number, z1: number, surface = "concrete"): void {
  solid.push(boxMM(`${id}`, [x0, 0, z0], [x1, 2, z1], "block", { data: { surface } }));
  solid.push(boxMM(`${id}-up`, [x0, 2, z0], [x1, H, z1], "blockUp", { data: { surface } }));
}
function woodWall(id: string, x0: number, z0: number, x1: number, z1: number): void {
  solid.push(boxMM(id, [x0, 0, z0], [x1, H, z1], "wood", { data: { surface: "wood" } }));
}
/** A fluorescent troffer in the ceiling (0.6 x 1.2 m, long side along `alongX`). */
function troffer(id: string, x: number, z: number, alongX: boolean, flicker = false): void {
  const [sx, sz] = alongX ? [1.2, 0.6] : [0.6, 1.2];
  decor.push(box(id, [x, H - 0.012, z], [sx, 0.02, sz], flicker ? "trofferFlicker" : "troffer"));
}
/** A red exit light over a doorway (a plain lit box, no lettering) on a wall facing `n` (+-1 along axis). */
function exitLight(id: string, x: number, y: number, z: number, alongX: boolean): void {
  decor.push(box(id, [x, y, z], alongX ? [0.36, 0.14, 0.07] : [0.07, 0.14, 0.36], "exitRed"));
}
/** A steel door in a wall (decor: a door that stays shut), `alongX` = the wall runs along x. */
function shutDoor(id: string, x: number, z: number, alongX: boolean, w = 1.0): void {
  decor.push(box(id, [x, 1.05, z], alongX ? [w, 2.1, 0.05] : [0.05, 2.1, w], "doorMetal"));
  decor.push(box(`${id}-frame`, [x, 2.16, z], alongX ? [w + 0.16, 0.12, 0.07] : [0.07, 0.12, w + 0.16], "metalDark"));
}
/** Steel shelving (high cover): an invisible collider the camera also knows, posts, 4 shelves, boxes. */
function shelving(id: string, x0: number, z0: number, x1: number, z1: number, h = 2.2): void {
  solid.push(boxMM(id, [x0, 0, z0], [x1, h, z1], "shelf", { hidden: true, data: { surface: "metal", camera: true } }));
  const alongX = x1 - x0 > z1 - z0;
  const len = alongX ? x1 - x0 : z1 - z0;
  const posts = Math.max(2, Math.round(len / 1.2) + 1);
  for (let i = 0; i < posts; i++) {
    const t = i / (posts - 1);
    for (const side of [0, 1]) {
      const px = alongX ? x0 + 0.03 + t * (len - 0.06) : side ? x1 - 0.03 : x0 + 0.03;
      const pz = alongX ? (side ? z1 - 0.03 : z0 + 0.03) : z0 + 0.03 + t * (len - 0.06);
      decor.push(box(`${id}-post-${i}${side}`, [px, h / 2, pz], [0.05, h, 0.05], "shelf"));
    }
  }
  [0.12, 0.72, 1.32, 1.92].forEach((y, k) => {
    decor.push(boxMM(`${id}-board-${k}`, [x0, y, z0], [x1, y + 0.04, z1], "shelf"));
    // cardboard on every shelf but the top one, with gaps
    if (k < 3) for (let j = 0; j < Math.floor(len / 0.7); j++) {
      if ((j * 7 + k * 3) % 5 === 0) continue;
      const u = 0.35 + j * 0.7, bw = 0.5 - ((j + k) % 3) * 0.06, bh = 0.34 + ((j * 3 + k) % 3) * 0.06;
      const cx = alongX ? x0 + u : (x0 + x1) / 2, cz = alongX ? (z0 + z1) / 2 : z0 + u;
      decor.push(box(`${id}-box-${k}-${j}`, [cx, y + 0.04 + bh / 2, cz], alongX ? [bw, bh, Math.min(0.5, z1 - z0 - 0.08)] : [Math.min(0.5, x1 - x0 - 0.08), bh, bw], "boxes"));
    }
  });
}
/** A stack of cardboard boxes (a collider: 1 m low cover or 2 m high cover). */
function boxStack(id: string, x0: number, z0: number, x1: number, z1: number, h: number): void {
  solid.push(boxMM(id, [x0, 0, z0], [x1, h, z1], "boxes", { data: { surface: "drywall" } }));
  // a loose box on top, a little turned
  decor.push(box(`${id}-top`, [(x0 + x1) / 2 + 0.12, h + 0.17, (z0 + z1) / 2 - 0.08], [0.5, 0.34, 0.44], "boxes", { rot: [0, 0.3, 0] }));
}

// ---------------------------------------------------------------- floor, ceilings
solid.push(boxMM("floor", [-6, -0.5, -23], [20, 0, 9], "floorVinyl"));
decor.push(boxMM("floor-b", [7, 0, -22], [17, 0.01, -14], "floorConcrete"));
decor.push(boxMM("floor-e", [-1, 0, -4], [9.3, 0.01, 5], "carpet"));
const ceilings: Array<[string, V3, V3]> = [
  ["ceil-a", [-4.5, H, -19.2], [-1.5, H + 0.2, 2.2]],
  ["ceil-leg", [-1.5, H, -19.2], [7, H + 0.2, -16.2]],
  ["ceil-b", [6.8, H, -22.2], [17.2, H + 0.2, -13.8]],
  ["ceil-c", [12.5, H, -13.8], [15.5, H + 0.2, -4]],
  ["ceil-d", [9.3, H, -4.2], [18.7, H + 0.2, 3.2]],
  ["ceil-e", [-1.2, H, -4.2], [9.3, H + 0.2, 5.2]],
  ["ceil-f", [0.2, H, -10.2], [6.6, H + 0.2, -4.2]],
  ["ceil-stub", [2.8, H, 5.2], [5.2, H + 0.2, 7.8]],
];
for (const [id, a, b] of ceilings) solid.push(boxMM(id, a, b, "ceiling"));

// ---------------------------------------------------------------- A: the service corridor
blockWall("a-wall-s", -4.5, 2, -1.5, 2.2);
blockWall("a-wall-w1", -4.5, -5.3, -4.3, 2);
blockWall("a-wall-w2", -4.5, -19.2, -4.3, -6.7);
blockWall("a-wall-e1", -1.7, -10.8, -1.5, 2);
blockWall("a-wall-e2", -1.7, -16.4, -1.5, -12.2);
blockWall("a-wall-n", -4.5, -19.2, 7, -19);
blockWall("a-leg-s", -1.5, -16.4, 7, -16.2);
// the staff door behind him (from the club), its red light
decor.push(boxMM("staff-door", [-3.6, 0, 1.94], [-2.4, 2.2, 2.0], "doorMetal"), boxMM("staff-door-bar", [-3.4, 1.0, 1.9], [-2.6, 1.06, 1.94], "chrome"));
exitLight("staff-exit", -3, 2.45, 1.95, true);
// two door alcoves (high cover): 1.4 m wide, 0.8 m deep, a shut steel door at the back
blockWall("alc-w-back", -5.3, -6.9, -5.1, -5.1);
blockWall("alc-w-n", -5.3, -6.9, -4.3, -6.7);
blockWall("alc-w-s", -5.3, -5.3, -4.3, -5.1);
shutDoor("alc-w-door", -5.08, -6, false);
blockWall("alc-e-back", -0.9, -12.4, -0.7, -10.6);
blockWall("alc-e-n", -1.7, -12.4, -0.7, -12.2);
blockWall("alc-e-s", -1.7, -10.8, -0.7, -10.6);
shutDoor("alc-e-door", -0.92, -11.5, false);
solid.push(boxMM("alc-w-ceil", [-5.3, H, -6.9], [-4.3, H + 0.2, -5.1], "ceiling"), boxMM("alc-e-ceil", [-1.7, H, -12.4], [-0.7, H + 0.2, -10.6], "ceiling"));
// the cleaning cart (low cover) against the east wall
solid.push(boxMM("cart", [-2.4, 0.12, -9.6], [-1.75, 1.0, -8.6], "cart", { data: { surface: "metal" } }));
decor.push(prim("cart-bucket", "cylinder", [-2.08, 1.13, -9.3], [0.16, 0.13, 0.26, 12], "bucket"));
for (const [x, z] of [[-2.33, -9.52], [-1.82, -9.52], [-2.33, -8.68], [-1.82, -8.68]]) decor.push(prim(`cart-wheel-${x}${z}`, "cylinder", [x, 0.06, z], [0.05, 0.05, 0.03, 8], "metalDark", [0, 0, R90]));
decor.push(boxMM("cart-handle", [-2.42, 1.0, -8.62], [-1.73, 1.04, -8.58], "chrome"));
// pipes and a cable tray along the corridor ceiling; a fire hose cabinet; troffers (one flickers)
decor.push(prim("a-pipe-1", "cylinder", [-4.05, 2.72, -8.5], [0.06, 0.06, 21, 10], "pipe", [R90, 0, 0]), prim("a-pipe-2", "cylinder", [-3.8, 2.8, -8.5], [0.04, 0.04, 21, 8], "pipe", [R90, 0, 0]));
decor.push(boxMM("a-tray", [-2.3, 2.84, -18.8], [-1.9, 2.88, 1.8], "metalDark"));
decor.push(prim("leg-pipe", "cylinder", [2.7, 2.72, -18.75], [0.06, 0.06, 8.6, 10], "pipe", [0, 0, R90]));
decor.push(boxMM("a-hose", [-4.3, 1.1, -14.2], [-4.2, 1.9, -13.4], "exitRed"));
troffer("a-tr-1", -3, -1, false);
troffer("a-tr-2", -3, -6.5, false);
troffer("a-tr-3", -3, -12, false, true);
troffer("a-tr-4", -3, -17.7, true);
troffer("leg-tr-1", 3, -17.7, true);

// ---------------------------------------------------------------- B: the storage room
blockWall("b-wall-n", 6.8, -22.2, 17.2, -22);
blockWall("b-wall-e", 17, -22, 17.2, -13.8);
blockWall("b-wall-s1", 6.8, -14, 12.7, -13.8);
blockWall("b-wall-s2", 15.3, -14, 17.2, -13.8);
blockWall("b-wall-w1", 6.8, -22, 7, -19.2);
blockWall("b-wall-w2", 6.8, -16.2, 7, -14);
exitLight("b-exit-c", 14, 2.6, -13.95, true);
// the gun rack by the door (the spare shotgun lies on it)
decor.push(boxMM("rack-back", [8.2, 0.9, -22], [9.8, 1.9, -21.93], "metalDark"));
for (const x of [8.4, 9.0, 9.6]) decor.push(boxMM(`rack-peg-${x}`, [x - 0.02, 1.2, -21.95], [x + 0.02, 1.26, -21.75], "chrome"));
// steel shelving (high) and box stacks (1 m low / 2 m high)
shelving("shelf-n", 9.5, -20.3, 12.5, -19.7);
shelving("shelf-e", 14.8, -21.4, 15.4, -18.4);
boxStack("stack-l1", 10, -17.6, 11.2, -16.6, 1.0);
boxStack("stack-h1", 12.6, -16.8, 13.6, -15.6, 2.0);
boxStack("stack-l2", 15, -17.4, 16.2, -16.4, 1.0);
boxStack("stack-l3", 8.4, -15.2, 9.4, -14.4, 1.0);
decor.push(box("pallet-1", [16.3, 0.07, -21.2], [1.2, 0.14, 1.0], "pallet"));
troffer("b-tr-1", 9.5, -18, true);
troffer("b-tr-2", 14, -18, true);
troffer("b-tr-3", 11.5, -15.2, true);

// ---------------------------------------------------------------- C: the office hallway
blockWall("c-wall-w", 12.5, -13.8, 12.7, -4.2);
blockWall("c-wall-e", 15.3, -13.8, 15.5, -4.2);
troffer("c-tr-1", 14, -11, false);
troffer("c-tr-2", 14, -6.6, false, true);
decor.push(prim("c-pipe", "cylinder", [12.95, 2.74, -9], [0.05, 0.05, 9.8, 8], "pipe", [R90, 0, 0]));
shutDoor("c-door-w", 12.72, -9.5, false);
// the locked office door (the breach): an invisible collider the camera knows (the leaves are drawn and
// swung off by the view, src/app/PropsView.tsx), a lintel above it, a red light over it
solid.push(boxMM("door-office", [13.2, 0, -4.15], [14.8, 2.2, -4.05], "doorOffice", { hidden: true, data: { surface: "wood", camera: true } }));
solid.push(boxMM("door-lintel", [13.2, 2.2, -4.2], [14.8, H, -4], "blockUp"));
decor.push(boxMM("door-frame-l", [13.12, 0, -4.22], [13.2, 2.26, -3.98], "doorFrame"), boxMM("door-frame-r", [14.8, 0, -4.22], [14.88, 2.26, -3.98], "doorFrame"), boxMM("door-frame-t", [13.12, 2.2, -4.22], [14.88, 2.28, -3.98], "doorFrame"));
exitLight("c-exit-door", 14, 2.62, -4.25, true);

// ---------------------------------------------------------------- D: the security office
blockWall("d-wall-n1", 9.3, -4.2, 13.2, -4);
blockWall("d-wall-n2", 14.8, -4.2, 18.7, -4);
blockWall("d-wall-e", 18.5, -4, 18.7, 3.2);
blockWall("d-wall-s", 9.5, 3, 18.7, 3.2);
// the dividing wall to the manager's office: solid, a doorway (z -2.2..-0.6), then glass on a sill
blockWall("de-wall-n", 9.3, -4.2, 9.5, -2.2);
solid.push(boxMM("de-sill", [9.3, 0, -0.6], [9.5, 0.9, 3.2], "wood", { data: { surface: "wood" } }));
solid.push(boxMM("de-head", [9.3, 2.7, -0.6], [9.5, H, 3.2], "wood", { data: { surface: "wood" } }));
solid.push(boxMM("de-head-door", [9.3, 2.3, -2.2], [9.5, H, -0.6], "blockUp"));
// the glass (a collider bullets pass: drawn and shattered by the view)
solid.push(boxMM("glass-pane-de", [9.36, 0.9, -0.6], [9.44, 2.7, 3.0], "glass", { hidden: true, data: { surface: "glass", shootThrough: true, camera: true } }));
for (const z of [-0.6, 1.2, 3.0]) decor.push(boxMM(`de-mull-${z}`, [9.3, 0.9, z - 0.04], [9.5, 2.7, z + 0.04], "metalDark"));
decor.push(boxMM("de-frame-l", [9.28, 0, -2.26], [9.52, 2.34, -2.2], "doorFrame"), boxMM("de-frame-r", [9.28, 0, -0.6], [9.52, 2.34, -0.54], "doorFrame"));
// the CCTV console and its monitors (south wall)
solid.push(boxMM("console", [11.8, 0, 2.2], [17.2, 0.95, 3], "console", { data: { surface: "metal" } }));
decor.push(boxMM("console-top", [11.75, 0.95, 2.15], [17.25, 0.99, 3], "metalDark"));
decor.push(boxMM("cctv-1", [12.2, 1.1, 2.93], [14.6, 2.3, 3.0], "cctv", { data: { surface: "screen" } }), boxMM("cctv-2", [14.8, 1.1, 2.93], [17.2, 2.3, 3.0], "cctv"));
decor.push(boxMM("console-keys", [13.0, 0.99, 2.3], [13.9, 1.02, 2.6], "metalDark"), boxMM("console-keys-2", [15.4, 0.99, 2.3], [16.3, 1.02, 2.6], "metalDark"));
decor.push(boxMM("d-lamp", [12.25, 0.99, 2.4], [12.4, 1.35, 2.55], "lampWarm"));
// the monitor rack (high cover), two desks (low), chairs
solid.push(boxMM("monitor-rack", [16.8, 0, -1.6], [17.6, 2.0, 0.4], "console", { data: { surface: "screen" } }));
decor.push(boxMM("rack-screens", [16.77, 0.9, -1.45], [16.8, 1.85, 0.25], "cctv"));
solid.push(boxMM("desk-d1", [11, 0, 0.2], [12.8, 0.78, 1.0], "desk", { data: { surface: "wood" } }));
solid.push(boxMM("desk-d2", [15.4, 0, -2.9], [16.8, 0.78, -2.1], "desk", { data: { surface: "wood" } }));
decor.push(boxMM("d1-lamp", [12.4, 0.78, 0.35], [12.52, 1.1, 0.47], "lampWarm"), boxMM("d2-files", [15.6, 0.78, -2.8], [16.1, 0.86, -2.3], "paper"));
decor.push(boxMM("chair-d1", [13.1, 0, 1.5], [13.6, 0.5, 2.0], "chair"), boxMM("chair-d2", [15.4, 0, 1.4], [15.9, 0.5, 1.9], "chair"));
// the open gun locker (east wall): the dual SMGs lie in front of it
solid.push(boxMM("gun-locker", [18.0, 0, 1.0], [18.5, 2.0, 2.2], "locker", { data: { surface: "metal" } }));
troffer("d-tr-1", 12, -1.6, true);
troffer("d-tr-2", 16, 0.8, true);

// ---------------------------------------------------------------- E: the manager's office
woodWall("e-wall-w", -1.2, -4.2, -1, 5.2);
woodWall("e-wall-n1", -1.2, -4.2, 2.4, -4);
woodWall("e-wall-n2", 4.4, -4.2, 9.3, -4);
woodWall("e-wall-s1", -1.2, 5, 3.2, 5.2);
woodWall("e-wall-s2", 4.8, 5, 9.5, 5.2);
woodWall("e-wall-e", 9.3, 3.2, 9.5, 5.2);
solid.push(boxMM("e-head-n", [2.4, 2.4, -4.2], [4.4, H, -4], "wood"), boxMM("e-head-s", [3.2, 2.3, 5], [4.8, H, 5.2], "wood"));
// the big desk (low), the manager's chair, bookshelves (high), the sofa (low)
solid.push(boxMM("e-desk", [1.2, 0, -0.2], [3.6, 0.8, 1.2], "desk", { data: { surface: "wood" } }));
decor.push(boxMM("e-desk-top", [1.15, 0.8, -0.25], [3.65, 0.84, 1.25], "deskTop"), boxMM("e-lamp", [3.2, 0.84, 0.95], [3.34, 1.24, 1.09], "lampWarm"));
decor.push(boxMM("e-chair", [0.0, 0, 0.2], [0.6, 0.55, 0.8], "sofa"), boxMM("e-chair-back", [-0.1, 0.55, 0.2], [0.05, 1.3, 0.8], "sofa"));
function bookshelf(id: string, x0: number, z0: number, x1: number, z1: number): void {
  solid.push(boxMM(id, [x0, 0, z0], [x1, 2.2, z1], "wood", { data: { surface: "wood" } }));
  const alongX = x1 - x0 > z1 - z0;
  const len = alongX ? x1 - x0 : z1 - z0;
  // book rows on both faces (muted spines, no lettering)
  const cols = ["bookA", "bookB", "bookC"];
  for (const y of [0.35, 0.85, 1.35, 1.85]) for (let j = 0; j < Math.floor(len / 0.45); j++) {
    const u = 0.25 + j * 0.45;
    const m = cols[(j + Math.round(y * 3)) % 3];
    if (alongX) for (const zf of [z0 - 0.01, z1 + 0.01]) decor.push(boxMM(`${id}-bk-${y}-${j}-${zf}`, [x0 + u - 0.18, y, zf - 0.005], [x0 + u + 0.18, y + 0.3, zf + 0.005], m));
    else for (const xf2 of [x0 - 0.01, x1 + 0.01]) decor.push(boxMM(`${id}-bk-${y}-${j}-${xf2}`, [xf2 - 0.005, y, z0 + u - 0.18], [xf2 + 0.005, y + 0.3, z0 + u + 0.18], m));
  }
}
bookshelf("shelf-e1", 5.6, 1.6, 6.1, 4.2);
bookshelf("shelf-e2", 5.2, -4.0, 8.6, -3.55);
bookshelf("shelf-e3", -1.0, 1.4, -0.55, 4.6);
solid.push(boxMM("sofa", [6.4, 0, -3.2], [7.2, 0.55, -1.6], "sofa", { data: { surface: "wood" } }));
solid.push(boxMM("sofa-back", [7.0, 0.55, -3.2], [7.2, 0.95, -1.6], "sofa", { data: { surface: "wood" } }));
decor.push(boxMM("e-side-table", [-0.9, 0, -3.8], [-0.2, 0.6, -3.1], "deskTop"));
decor.push(box("e-rug", [2.4, 0.015, 0.5], [4.2, 0.01, 3.0], "rug"));
troffer("e-tr-1", 2.4, -1.8, true);
troffer("e-tr-2", 6.6, 1.2, true);
troffer("e-tr-3", 2.4, 3.2, true);
// the side door (south) and the stub hall behind it where the backup waits
blockWall("stub-w", 2.8, 5.2, 3.0, 7.8);
blockWall("stub-e", 5.0, 5.2, 5.2, 7.8);
blockWall("stub-s", 2.8, 7.6, 5.2, 7.8);
exitLight("e-exit-side", 4, 2.55, 4.95, true);

// ---------------------------------------------------------------- F: the elevator lobby
blockWall("f-wall-w", 0.2, -10.2, 0.4, -4.2);
blockWall("f-wall-e", 6.4, -10.2, 6.6, -4.2);
blockWall("f-wall-n1", 0.2, -10.2, 2.4, -10);
blockWall("f-wall-n2", 4.4, -10.2, 6.6, -10);
solid.push(boxMM("elevator-back", [2.4, 0, -10.6], [4.4, H, -10.4], "metalDark", { data: { surface: "metal" } }));
solid.push(boxMM("elevator-doors", [2.4, 0, -10.2], [4.4, 2.2, -10.1], "metalDark", { hidden: true, data: { surface: "metal", camera: true } }));
solid.push(boxMM("elevator-lintel", [2.4, 2.2, -10.2], [4.4, H, -10], "metalDark"));
decor.push(boxMM("elevator-frame-l", [2.3, 0, -10.05], [2.4, 2.3, -9.95], "chrome"), boxMM("elevator-frame-r", [4.4, 0, -10.05], [4.5, 2.3, -9.95], "chrome"), boxMM("elevator-frame-t", [2.3, 2.2, -10.05], [4.5, 2.3, -9.95], "chrome"));
decor.push(boxMM("elevator-light", [3.25, 2.42, -10.0], [3.55, 2.5, -9.96], "lampWarm"));
decor.push(boxMM("keycard", [4.7, 1.12, -9.99], [4.82, 1.36, -9.96], "keycard"));
troffer("f-tr-1", 3.4, -7, true);
exitLight("f-exit-e", 3.4, 2.6, -4.25, true);

// ---------------------------------------------------------------- markers
const markers: Node[] = [
  marker("spawn", "spawn", [-3, 0, 0.8], {}, FACE_N),
  marker("checkpoint-0", "checkpoint", [-3, 0, 0.8], {}, FACE_N),
  marker("checkpoint-d", "checkpoint", [14, 0, -0.8], {}, FACE_W),
  // heavy #1 comes round the far corner when he is 5 m in; he drops the shotgun
  marker("heavy-hall", "enemy", [1.5, 0, -17.7], { kind: "heavy", model: "rival723", group: "hall" }, FACE_W),
  // the storage room (asleep behind the walls: deaf until they see him or he reaches the door)
  marker("goon-store-1", "enemy", [16.1, 0, -20.2], { kind: "goon", group: "storage", deaf: true }, FACE_W),
  marker("goon-store-2", "enemy", [14.4, 0, -14.7], { kind: "goon", group: "storage", deaf: true }, FACE_W),
  marker("rusher-store", "enemy", [16.4, 0, -15.1], { kind: "rusher", group: "storage", deaf: true }, FACE_W),
  // the security office: watching the monitors, backs half turned to the door
  marker("heavy-office", "enemy", [13.4, 0, 1.3], { kind: "heavy", model: "rival652", group: "office", deaf: true }, 0.45),
  marker("goon-office", "enemy", [15.9, 0, 1.2], { kind: "goon", group: "office", deaf: true }, -0.35),
  // the manager (holds his desk) and the backup behind the side door
  marker("heavy-manager", "enemy", [0.5, 0, 0.5], { kind: "heavy", model: "rival723", hold: true }, FACE_E),
  marker("rusher-side-1", "enemy", [3.6, 0, 6.6], { kind: "rusher", group: "manager" }, FACE_N),
  marker("rusher-side-2", "enemy", [4.4, 0, 6.9], { kind: "rusher", group: "manager" }, FACE_N),
  // cover points (facing = the direction they protect toward)
  marker("cover-shelf-e-1", "cover", [15.9, 0, -20.7], { height: "high", side: "right" }, FACE_W),
  marker("cover-shelf-e-2", "cover", [15.9, 0, -18.95], { height: "high", side: "left" }, FACE_W),
  marker("cover-stack-h1", "cover", [14.1, 0, -16.2], { height: "high", side: "left" }, FACE_W),
  marker("cover-stack-l1", "cover", [11.75, 0, -17.1], { height: "low" }, FACE_W),
  marker("cover-stack-l2", "cover", [16.6, 0, -16.9], { height: "low" }, FACE_W),
  marker("cover-shelf-n", "cover", [11, 0, -19.1], { height: "high", side: "left" }, FACE_N),
  marker("cover-rack", "cover", [18.05, 0, -0.6], { height: "high", side: "left" }, FACE_W),
  marker("cover-desk-d1", "cover", [11.9, 0, 1.55], { height: "low" }, FACE_N),
  marker("cover-desk-d2", "cover", [16.1, 0, -1.55], { height: "low" }, FACE_N),
  marker("cover-sofa", "cover", [5.9, 0, -2.4], { height: "low" }, FACE_E),
  marker("cover-shelf-e1-w", "cover", [5.1, 0, 2.3], { height: "high", side: "right" }, FACE_E),
  marker("cover-shelf-e1-e", "cover", [6.6, 0, 3.3], { height: "high", side: "left" }, FACE_W),
  marker("cover-desk-e", "cover", [4.1, 0, 0.5], { height: "low" }, FACE_W),
  // waypoints (auto-linked in knee-height line of sight; the office door links C and D explicitly: the
  // way is open only once the door is down, and nothing paths it before that but the bot, which dives)
  ...([
    ["a0", -3, 0], ["a1", -3, -6], ["a2", -3, -11.5], ["a3", -3, -17.7], ["l1", 1.5, -17.7], ["l2", 5.5, -17.7],
    ["b-in", 8, -17.7], ["b-nw", 8.2, -20.9], ["b-n", 13.7, -21.2], ["b-mid", 12, -18.6], ["b-e", 16.3, -18.0], ["b-s", 11.5, -15.0], ["b-c", 14, -14.8],
    ["c1", 14, -11],
    ["d-door", 14, -2.8], ["d-w", 10.8, -1.4], ["d-mid", 14.4, 0.6], ["d-e", 18, -2.6], ["d-se", 17.6, 1.6],
    ["e-door", 8.4, -1.1], ["e-n", 5, -2.6], ["e-mid", 4.6, 0.5], ["e-s", 4, 3.8], ["e-w", 0, -2.5], ["e-sw", 0.4, 3.4],
    ["stub", 4, 6.4],
    ["f-s", 3.4, -5.2], ["f-n", 3.4, -8.6],
  ] as Array<[string, number, number]>).map(([id, x, z]) => marker(`wp-${id}`, "waypoint", [x, 0, z])),
  marker("wp-c-door", "waypoint", [14, 0, -5.4], { links: ["wp-c1", "wp-d-door"] }),
  // copium: behind the shelving in the storage room, on the manager's side table, in the lobby
  marker("copium-store", "pickup", [11, 0, -21.2], { item: "copium", amount: 1 }),
  marker("copium-manager", "pickup", [-0.55, 0.6, -3.45], { item: "copium", amount: 1 }),
  marker("copium-lobby", "pickup", [5.8, 0, -4.9], { item: "copium", amount: 1 }),
  // weapons: the spare shotgun on its rack, the dual SMGs in the gun locker
  marker("shotgun-rack", "pickup", [9, 0.9, -21.4], { item: "shotgun" }),
  marker("smgs-locker", "pickup", [17.6, 0, 1.6], { item: "smgs" }),
  // triggers
  marker("trigger-hall", "trigger", [-3, 1, -4], { action: "spawn", group: "hall" }, 0, [2.6, 3, 2]),
  marker("trigger-storage", "trigger", [5, 1, -17.7], { action: "alert", group: "storage" }, 0, [4, 3, 2.6]),
  marker("trigger-breach", "trigger", [14, 1, -6], { action: "breach", door: "door-office", group: "office" }, 0, [2.6, 3, 4]),
  marker("trigger-backup", "trigger", [0, -40, 0], { action: "spawn", group: "manager", whenClear: "office" }, 0, [0.2, 0.2, 0.2]),
  marker("trigger-checkpoint", "trigger", [0, -40, 0], { action: "checkpoint", whenClear: "office", at: "checkpoint-d" }, 0, [0.2, 0.2, 0.2]),
  marker("trigger-manager", "trigger", [4.2, 1, 0.5], { action: "spawn", group: "manager" }, 0, [10, 3, 9]),
  marker("exit-elevator", "exit", [3.4, 0, -9.7], {}, FACE_N),
  marker("trigger-exit", "trigger", [3.4, 1, -8.9], { action: "exit" }, 0, [2.4, 3, 1.8]),
  // the elevator doors (the view slides them open at the exit)
  marker("fx-elevator", "fx", [3.4, 0, -10.08], { fx: "elevator", w: 2.0, h: 2.2 }, FACE_S),
  // lights: under every troffer a cool fill, warm desk lamps, the red exit lights
  ...([
    ["a1", -3, 2.6, -2, "#dfe6ff", 7, 7], ["a2", -3, 2.6, -8.5, "#dfe6ff", 7, 7], ["a3", -3, 2.6, -15.5, "#dfe6ff", 7, 7], ["leg", 3, 2.6, -17.7, "#dfe6ff", 6, 6],
    ["b1", 9.5, 2.6, -18, "#e6ecff", 9, 8], ["b2", 14.5, 2.6, -17.5, "#e6ecff", 9, 8], ["c", 14, 2.6, -8.5, "#dfe6ff", 7, 7],
    ["d1", 12.5, 2.6, -1.2, "#e8eeff", 9, 8], ["d2", 16, 2.6, 1, "#e8eeff", 8, 7], ["d-lamp", 12.35, 1.5, 2.2, "#ffc98a", 4, 4],
    ["e1", 2.4, 2.6, -1.2, "#fff0dc", 9, 8], ["e2", 6.6, 2.6, 1.8, "#fff0dc", 8, 7], ["e-lamp", 3.2, 1.4, 1.0, "#ffc98a", 5, 4.5],
    ["f", 3.4, 2.6, -7, "#dfe6ff", 8, 7], ["staff-red", -3, 2.3, 1.6, "#ff2a1a", 3, 3.5], ["door-red", 14, 2.4, -4.6, "#ff2a1a", 3, 3.5],
  ] as Array<[string, number, number, number, string, number, number]>).map(([id, x, y, z, color, intensity, distance]) => marker(`light-${id}`, "light", [x, y, z], { color, intensity, distance })),
  // camera shots (?cam=<id> in dev builds)
  marker("cam-hall", "camera", [-3.2, 1.7, 1.4], { at: [-3, 1.2, -16] }),
  marker("cam-store", "camera", [7.6, 1.8, -17.4], { at: [16, 1.0, -18] }),
  marker("cam-door", "camera", [14.3, 1.6, -11.5], { at: [14, 1.1, -4] }),
  marker("cam-office", "camera", [14.2, 1.7, -3.2], { at: [14.5, 1.0, 2] }),
  marker("cam-manager", "camera", [16.5, 1.7, -0.2], { at: [0.5, 1.2, 0.8] }),
  marker("cam-lobby", "camera", [3.4, 1.7, -4.8], { at: [3.4, 1.2, -10] }),
];

// ---------------------------------------------------------------- materials
const T = "/textures/backrooms/";
const tex = (file: string, metres: number | [number, number], extra: Record<string, unknown> = {}) => {
  const [mx, my] = Array.isArray(metres) ? metres : [metres, metres];
  return { color: "#ffffff", texture: file.startsWith("/") ? file : `${T}${file}.webp`, repeat: true, repeatCount: [1 / mx, 1 / my], roughness: 0.8, ...extra };
};
const glow = (color: string, g: number, extra = "") => ({ materialType: "basic", color, toneMapped: false, name: `glow ${g}${extra ? ` ${extra}` : ""}` });
const materials: Record<string, Record<string, unknown>> = {
  floorVinyl: tex("floor_vinyl", 1.5, { roughness: 0.55 }),
  floorConcrete: tex("/textures/club/floor_polished_concrete.webp", 4, { roughness: 0.5 }),
  carpet: tex("carpet_office", 2, { roughness: 0.95 }),
  block: tex("wall_cinderblock", 2, { roughness: 0.92 }),
  // the upper band: the texture's cream half (offset by half a tile), so the green dado stays below 1 m
  blockUp: tex("wall_cinderblock", 2, { roughness: 0.92, offset: [0, 0.5] }),
  wood: tex("wall_wood_panel", 2, { roughness: 0.6 }),
  ceiling: tex("ceiling_tiles", 1.2, { roughness: 0.95 }),
  troffer: { materialType: "basic", color: "#ffffff", texture: `${T}ceiling_light_panel.webp`, toneMapped: false, name: "glow 0.8" },
  trofferFlicker: { materialType: "basic", color: "#ffffff", texture: `${T}ceiling_light_panel.webp`, toneMapped: false, name: "glow 0.8 flicker" },
  cctv: { materialType: "basic", color: "#ffffff", texture: `${T}cctv_monitors.webp`, toneMapped: false, name: "glow 0.5" },
  keycard: { materialType: "basic", color: "#ffffff", texture: `${T}keycard_reader.webp`, toneMapped: false, name: "glow 0.8" },
  locker: { color: "#ffffff", texture: `${T}gun_locker.webp`, roughness: 0.5, metalness: 0.4 },
  doorMetal: { color: "#ffffff", texture: `${T}door_metal.webp`, roughness: 0.55, metalness: 0.4 },
  doorOffice: { color: "#ffffff", texture: `${T}door_office.webp`, roughness: 0.5 },
  boxes: tex("boxes_cardboard", 0.6, { roughness: 0.9 }),
  glass: { color: "#9fb4c8", roughness: 0.1, metalness: 0.2 },
  shelf: { color: "#4a4f58", roughness: 0.45, metalness: 0.6 },
  cart: { color: "#27496e", roughness: 0.5 },
  bucket: { color: "#c9a13a", roughness: 0.5 },
  pallet: { color: "#6e5234", roughness: 0.85 },
  pipe: { color: "#51555c", roughness: 0.4, metalness: 0.7 },
  metalDark: { color: "#25272c", roughness: 0.45, metalness: 0.6 },
  chrome: { color: "#b9bcc4", roughness: 0.2, metalness: 0.9 },
  doorFrame: { color: "#2e2a26", roughness: 0.5 },
  console: { color: "#1f2227", roughness: 0.5, metalness: 0.3 },
  desk: { color: "#4a3322", roughness: 0.5 },
  deskTop: { color: "#5a3e28", roughness: 0.35 },
  chair: { color: "#1d1e22", roughness: 0.6 },
  sofa: { color: "#5a2227", roughness: 0.6 },
  rug: { color: "#3a3040", roughness: 0.95 },
  paper: { color: "#cfc8b8", roughness: 0.9 },
  bookA: { color: "#5a2a2a", roughness: 0.8 },
  bookB: { color: "#2a3a4a", roughness: 0.8 },
  bookC: { color: "#4a4430", roughness: 0.8 },
  // lit (the look keeps these under the bloom's reach: bloom is <= 0.35 indoors)
  exitRed: glow("#ff2a1a", 1.0),
  lampWarm: glow("#ffc98a", 1.2),
};

const prefab = {
  id: "room3",
  name: "Room 3: the back of the house",
  materials,
  root: {
    id: "room",
    components: {
      data: {
        type: "Data",
        properties: {
          data: {
            room: {
              name: "The Back of the House", next: "room4", music: "backrooms", look: "backrooms", footsteps: "hard",
              enterLine: "r3_enter", enterDelay: 1.0, clearLine: "r3_clear", tutorial: false, drops: { rusher: "smgs_ammo" },
              prompt: "the service elevator. the key.", exitHold: 2.6,
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

const outFile = path.resolve(import.meta.dirname, "..", "public", "levels", "room3.json");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const json = JSON.stringify(prefab, null, 1).replace(/\[\s*(-?[\d.e+-]+(?:,\s*-?[\d.e+-]+)*)\s*\]/g, (_m, inner: string) => `[${inner.split(/,\s*/).join(", ")}]`);
fs.writeFileSync(outFile, json + "\n");
const count = (ns: Node[]): number => ns.reduce((s, n) => s + 1 + count(n.children ?? []), 0);
console.log(`wrote ${path.relative(process.cwd(), outFile)}: ${count(solid)} solid nodes, ${count(decor)} decor nodes, ${markers.length} markers, ${Object.keys(materials).length} materials, ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB`);
