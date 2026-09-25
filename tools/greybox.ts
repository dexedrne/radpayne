// Writes public/levels/greybox.json: a greybox of room 1 (the street outside the Milady rave) so the
// core is playable before the real street scene exists. Every box is a collider; the Data-only nodes
// are markers (see src/world/level.ts). Hand-tune it in the editor (npm run dev -> /?editor=greybox).
//   node tools/greybox.ts
import fs from "node:fs";
import path from "node:path";

type Node = { id: string; components?: Record<string, unknown>; children?: Node[] };

const R90 = Math.PI / 2;

const xf = (position: number[], rotation?: number[], scale?: number[]) => ({
  type: "Transform",
  properties: { position, ...(rotation ? { rotation } : {}), ...(scale ? { scale } : {}) },
});

function box(id: string, pos: number[], size: number[], mat: string, extra: Record<string, unknown> = {}, yaw = 0): Node {
  const comps: Record<string, unknown> = {
    transform: xf(pos, yaw ? [0, yaw, 0] : undefined, size),
    geometry: { type: "Geometry", properties: { geometryType: "box", args: [1, 1, 1] } },
    material: { type: "Material", properties: { materialId: mat } },
    mesh: { type: "Mesh", properties: { castShadow: false, receiveShadow: false } },
  };
  if (Object.keys(extra).length) comps.data = { type: "Data", properties: { data: extra } };
  return { id, components: comps };
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

// facing yaws (rotation.y of a +Z-facing thing)
const FACE_W = -R90; // looks toward -X
const FACE_E = R90;
const FACE_N = Math.PI; // toward -Z
const FACE_S = 0;

const geometry: Node[] = [
  box("floor", [0, -0.5, 0], [70, 1, 34], "asphalt"),
  box("sidewalk-n", [0, 0.075, -9.5], [56, 0.15, 5], "sidewalk"),
  box("sidewalk-s", [0, 0.075, 9.5], [56, 0.15, 5], "sidewalk"),
  // club facade with the door gap at x 14..16.4
  box("facade-n-west", [-7, 6, -13], [42, 12, 2], "brick"),
  box("facade-n-east", [21.2, 6, -13], [9.6, 12, 2], "brick"),
  box("facade-n-lintel", [15.2, 8.5, -13], [2.4, 7, 2], "brick"),
  box("club-door", [15.2, 1.5, -13.6], [2.4, 3, 0.4], "door", { surface: "metal" }),
  box("facade-s", [0, 6, 13], [56, 12, 2], "brownstone"),
  box("end-w", [-27, 3, 0], [2, 6, 24], "construction"),
  box("end-e", [27, 3, 0], [2, 6, 24], "construction"),
  // parked cabs (low cover: 1.5 m)
  box("cab-1", [-14, 0.75, 6.4], [4.6, 1.5, 1.9], "cab", { surface: "metal" }),
  box("cab-2", [2.5, 0.75, 6.4], [4.6, 1.5, 1.9], "cab", { surface: "metal" }),
  box("cab-3", [10.5, 0.75, 0.2], [4.6, 1.5, 1.9], "cab", { surface: "metal" }, 0.35),
  // jersey barriers + the queue line + planters (low cover: ~1 m)
  box("barrier-a", [-4, 0.5, 1.5], [0.6, 1, 3.2], "barrier"),
  box("barrier-b", [5, 0.5, -2.5], [0.6, 1, 3.2], "barrier"),
  box("queue-line", [9, 0.55, -6.6], [4.4, 1, 0.25], "velvet", { surface: "wood" }),
  box("queue-line-2", [12, 0.55, -5.2], [0.25, 1, 3], "velvet", { surface: "wood" }),
  box("planter", [18.5, 0.45, -7.4], [1.8, 0.9, 1.2], "planter"),
  box("mailbox", [-10, 0.65, -7.4], [0.7, 1.3, 0.7], "mailbox", { surface: "metal" }),
  box("dumpster", [-6, 0.75, -10.2], [2.4, 1.5, 1.3], "dumpster", { surface: "metal" }),
  // high cover (2.4 m)
  box("kiosk", [-18, 1.2, -8.2], [2.6, 2.4, 1.8], "kiosk", { surface: "metal" }),
  box("pillar-e", [21, 1.6, 7.6], [1.2, 3.2, 1.2], "brick"),
  // neon over the door (no collider)
  box("neon-club", [15.2, 4.6, -11.85], [6.5, 1.1, 0.15], "neonPink", { collider: false }),
  box("neon-bar", [15.2, 3.75, -11.85], [5.5, 0.12, 0.12], "neonCyan", { collider: false }),
  box("neon-bar-2", [-12, 3.4, -11.9], [3, 0.5, 0.1], "neonCyan", { collider: false }),
];

const markers: Node[] = [
  marker("spawn", "spawn", [-22, 0, 3], {}, FACE_E),
  marker("checkpoint-0", "checkpoint", [-22, 0, 3], {}, FACE_E),
  // goons
  marker("goon-queue", "enemy", [8, 0.15, -8.2], { kind: "goon" }, FACE_W),
  marker("goon-door", "enemy", [13.4, 0.15, -9.6], { kind: "goon" }, FACE_W),
  marker("goon-cab", "enemy", [5.4, 0, 4.8], { kind: "goon" }, FACE_W),
  marker("goon-street", "enemy", [14.5, 0, 2.5], { kind: "goon" }, FACE_W),
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
];

const prefab = {
  id: "greybox",
  name: "Room 1 greybox: outside the Milady rave",
  materials: {
    asphalt: { color: "#1b1d24", roughness: 0.35 },
    sidewalk: { color: "#4a4c55", roughness: 0.8 },
    brick: { color: "#5a2f2a", roughness: 0.9 },
    brownstone: { color: "#4a3328", roughness: 0.9 },
    door: { color: "#101014", roughness: 0.4, metalness: 0.6 },
    construction: { color: "#b8622a", roughness: 0.8 },
    cab: { color: "#e2b21c", roughness: 0.35, metalness: 0.3 },
    barrier: { color: "#8d8f96", roughness: 0.9 },
    velvet: { color: "#7a1030", roughness: 0.8 },
    planter: { color: "#3d4a34", roughness: 0.9 },
    mailbox: { color: "#1f3f8a", roughness: 0.5, metalness: 0.4 },
    dumpster: { color: "#2d5a3a", roughness: 0.6, metalness: 0.3 },
    kiosk: { color: "#6b6f78", roughness: 0.5, metalness: 0.5 },
    neonPink: { materialType: "basic", color: "#ff3fa8", toneMapped: false },
    neonCyan: { materialType: "basic", color: "#3ff0ff", toneMapped: false },
  },
  root: {
    id: "room",
    components: { data: { type: "Data", properties: { data: { room: { name: "Outside the Milady rave", next: "room2", music: "street" } } } } },
    children: [
      { id: "geometry", children: geometry },
      { id: "markers", children: markers },
    ],
  },
};

const out = path.resolve(import.meta.dirname, "..", "public", "levels", "greybox.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(prefab, null, 1) + "\n");
console.log(`wrote ${path.relative(process.cwd(), out)}: ${geometry.length} boxes, ${markers.length} markers`);
