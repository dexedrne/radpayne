// Writes public/levels/room4.json: room 4, the service elevator (round-3 plan section 2). Like the other
// room tools it is the starting point for hand-tuning in the editor (/?editor=room4); re-running it
// OVERWRITES the file.   node tools/room4.ts && npm run check-level room4
//
// The car never moves: it is a static 6 x 6 m freight car at the origin (ceiling 3.4 m, a roof hatch
// at (-0.5, 0)) with doors on three sides, and the ride is a script in the room settings (sim/ride.ts)
// the view plays as a shaft scrolling past the closed gates. Each stop opens one side's doors onto its
// landing; the three landings lie on three sides of the car and never overlap:
//   R1  going up (12 s): the muzak, the narrator.
//   S1  EAST, the laundry floor   x 3.2..13.2, z -4.6..2.8: 4 goons chatting, backs half turned; the
//       doors' opening is the door beat (1 s of free slow motion). Carts (low), a linen cage and a
//       pillar (high), the washers (low). The shotgun on the folding table.
//   R2  a heavy on the roof: the thud, the hatch's 2 s tell, he drops into the car.
//   S2  WEST, the gallery floor   x -17.2..-3.2, z -6..2.8: 3 goons + 2 rushers who know he is coming;
//       2 more rushers up the stairwell (far west) once 3 of them are down. Marble, plinths (high),
//       a bench and the reception desk (low). The dual SMGs on the bench.
//   R3  the cables: the snap, the fall, the brakes.
//   S3  SOUTH, the dead floor     x -9..9, z 3.2..17.2: goons pry the doors open (2 s); three waves (3
//       goons + a heavy at the doors, then 2 rushers + 2 goons up the stairs, then a heavy + 2
//       rushers); the stairs (the open south-east corner) are the way out. Columns and scaffolding
//       (high), cement bags (low).
// Hostiles 23 (goons 12, rushers 8, heavies 3), 3 checkpoints (one per stop, saved as the car arrives).
// Material tokens (the elevator look, src/app/look/tower.tsx): "glow <g>" (+ "flicker"). No lettering.
import { FACE_E, FACE_N, FACE_S, FACE_W, box, boxMM, glow, marker, prim, tex, writeLevel, type Node, type V3 } from "./levelKit.ts";

const solid: Node[] = [];
const decor: Node[] = [];
const CAR_H = 3.4;

// ---------------------------------------------------------------- floor
solid.push(boxMM("floor", [-22, -0.5, -8], [15, 0, 19], "concrete"));

// ---------------------------------------------------------------- the car
decor.push(boxMM("car-floor", [-3, 0, -3], [3, 0.012, 3], "carFloor"));
// the ceiling, around the hatch's hole (x -1.1..0.1, z -0.6..0.6); the roof above it
const ceil: Array<[string, V3, V3]> = [
  ["car-ceil-n", [-3.2, CAR_H, -3.2], [3.2, CAR_H + 0.2, -0.6]],
  ["car-ceil-s", [-3.2, CAR_H, 0.6], [3.2, CAR_H + 0.2, 3.2]],
  ["car-ceil-w", [-3.2, CAR_H, -0.6], [-1.1, CAR_H + 0.2, 0.6]],
  ["car-ceil-e", [0.1, CAR_H, -0.6], [3.2, CAR_H + 0.2, 0.6]],
];
for (const [id, a, b] of ceil) solid.push(boxMM(id, a, b, "carCeil"));
decor.push(boxMM("car-roof", [-1.3, CAR_H + 0.9, -0.8], [0.3, CAR_H + 1.0, 0.8], "metalDark"));
decor.push(boxMM("hatch-rim-n", [-1.16, CAR_H - 0.03, -0.66], [0.16, CAR_H, -0.6], "hazard"), boxMM("hatch-rim-s", [-1.16, CAR_H - 0.03, 0.6], [0.16, CAR_H, 0.66], "hazard"));
decor.push(boxMM("hatch-rim-w", [-1.16, CAR_H - 0.03, -0.6], [-1.1, CAR_H, 0.6], "hazard"), boxMM("hatch-rim-e", [0.1, CAR_H - 0.03, -0.6], [0.16, CAR_H, 0.6], "hazard"));
// the walls: north solid; east, west and south with a 3.2 m opening (the doors are colliders the ride
// takes out: door-e / door-w / door-s, drawn by the view)
solid.push(boxMM("car-wall-n", [-3.2, 0, -3.2], [3.2, CAR_H, -3.0], "carWall", { data: { surface: "metal" } }));
for (const [side, x0, x1] of [["e", 3.0, 3.2], ["w", -3.2, -3.0]] as const) {
  solid.push(boxMM(`car-wall-${side}1`, [x0, 0, -3.2], [x1, CAR_H, -1.6], "carWall", { data: { surface: "metal" } }));
  solid.push(boxMM(`car-wall-${side}2`, [x0, 0, 1.6], [x1, CAR_H, 3.2], "carWall", { data: { surface: "metal" } }));
  solid.push(boxMM(`car-lintel-${side}`, [x0, 3.0, -1.6], [x1, CAR_H, 1.6], "carWall", { data: { surface: "metal" } }));
  solid.push(boxMM(`door-${side}`, [(x0 + x1) / 2 - 0.05, 0, -1.6], [(x0 + x1) / 2 + 0.05, 3.0, 1.6], "metalDark", { hidden: true, data: { surface: "metal", camera: true } }));
  decor.push(boxMM(`sill-${side}`, [x0 - 0.1, 0, -1.6], [x1 + 0.1, 0.02, 1.6], "hazardX"));
}
solid.push(boxMM("car-wall-s1", [-3.2, 0, 3.0], [-1.6, CAR_H, 3.2], "carWall", { data: { surface: "metal" } }));
solid.push(boxMM("car-wall-s2", [1.6, 0, 3.0], [3.2, CAR_H, 3.2], "carWall", { data: { surface: "metal" } }));
solid.push(boxMM("car-lintel-s", [-1.6, 3.0, 3.0], [1.6, CAR_H, 3.2], "carWall", { data: { surface: "metal" } }));
solid.push(boxMM("door-s", [-1.6, 0, 3.05], [1.6, 3.0, 3.15], "metalDark", { hidden: true, data: { surface: "metal", camera: true } }));
decor.push(boxMM("sill-s", [-1.6, 0, 2.9], [1.6, 0.02, 3.3], "hazard"));
// crates (low cover) in three corners, a waist rail on the north wall, the button panel, the dial over
// the east doors, the caged bulb
solid.push(boxMM("crate-a", [-2.7, 0, -2.8], [-1.7, 1.0, -1.9], "crate", { data: { surface: "wood" } }));
solid.push(boxMM("crate-b", [1.8, 0, 1.95], [2.8, 1.0, 2.85], "crate", { data: { surface: "wood" } }));
solid.push(boxMM("crate-c", [-2.8, 0, 2.0], [-2.0, 0.9, 2.8], "crate", { data: { surface: "wood" } }));
decor.push(box("crate-c-top", [-2.4, 1.07, 2.35], [0.5, 0.34, 0.44], "crate", { rot: [0, 0.35, 0] }));
decor.push(boxMM("rail-n", [-2.9, 0.95, -2.99], [2.9, 1.0, -2.93], "chrome"));
decor.push(boxMM("car-panel", [2.1, 0.95, -2.995], [2.5, 1.75, -2.985], "carPanel"));
decor.push(boxMM("floor-dial", [2.985, 3.02, -0.4], [2.995, 3.34, 0.4], "dial"));
decor.push(boxMM("car-bulb-cage", [1.1, CAR_H - 0.22, -0.2], [1.5, CAR_H, 0.2], "metalDark"));
decor.push(boxMM("car-bulb", [1.18, CAR_H - 0.2, -0.12], [1.42, CAR_H - 0.02, 0.12], "bulb"));

// ---------------------------------------------------------------- S1: the laundry floor (east)
const L1_H = 3.2;
decor.push(boxMM("l1-floor", [3.2, 0, -4.6], [13.2, 0.012, 2.8], "vinyl"));
solid.push(boxMM("l1-ceil", [3.0, L1_H, -4.8], [13.4, L1_H + 0.2, 3.0], "ceilTile"));
solid.push(boxMM("l1-wall-n", [3.0, 0, -4.8], [13.4, L1_H, -4.6], "block"));
solid.push(boxMM("l1-wall-s", [3.0, 0, 2.8], [13.4, L1_H, 3.0], "block"));
solid.push(boxMM("l1-wall-e", [13.2, 0, -4.6], [13.4, L1_H, 2.8], "block"));
solid.push(boxMM("l1-wall-w", [3.0, 0, -4.6], [3.2, L1_H, -3.2], "block"));
solid.push(boxMM("l1-cart-1", [6.0, 0.1, -3.4], [7.2, 1.0, -2.6], "cart", { data: { surface: "metal" } }));
solid.push(boxMM("l1-cart-2", [8.0, 0.1, 1.2], [9.2, 1.0, 2.0], "cart", { data: { surface: "metal" } }));
decor.push(boxMM("l1-linen-1", [6.1, 1.0, -3.3], [7.1, 1.25, -2.7], "linen"), boxMM("l1-linen-2", [8.1, 1.0, 1.3], [9.1, 1.2, 1.9], "linen"));
solid.push(boxMM("l1-cage", [10.0, 0, -2.6], [11.2, 2.0, -1.4], "cage", { data: { surface: "metal" } }));
decor.push(boxMM("l1-cage-linen", [10.1, 0.2, -2.5], [11.1, 1.6, -1.5], "linen"));
solid.push(boxMM("l1-pillar", [7.6, 0, -0.8], [8.4, L1_H, 0.0], "concrete"));
for (let i = 0; i < 3; i++) solid.push(boxMM(`l1-washer-${i}`, [4.2 + i * 0.95, 0, -4.6], [5.05 + i * 0.95, 1.0, -3.85], "washer", { data: { surface: "metal" } }));
solid.push(boxMM("l1-table", [11.6, 0, 0.6], [12.8, 0.8, 1.8], "table", { data: { surface: "wood" } }));
decor.push(boxMM("l1-table-linen", [11.7, 0.8, 0.8], [12.3, 0.95, 1.5], "linen"));
decor.push(boxMM("l1-lamp-1", [5.6, L1_H - 0.06, -1.4], [6.8, L1_H - 0.01, -1.0], "sodium"), boxMM("l1-lamp-2", [10.0, L1_H - 0.06, 0.4], [11.2, L1_H - 0.01, 0.8], "sodium"));
decor.push(boxMM("l1-exit", [13.18, 2.3, -3.6], [13.2, 2.44, -3.24], "exitRed"));

// ---------------------------------------------------------------- S2: the gallery floor (west)
const L2_H = 3.6;
decor.push(boxMM("l2-floor", [-17.2, 0, -6], [-3.2, 0.012, 2.8], "marble"));
solid.push(boxMM("l2-ceil", [-17.4, L2_H, -6.2], [-3.0, L2_H + 0.2, 3.0], "ceilDark"));
solid.push(boxMM("l2-wall-n", [-17.4, 0, -6.2], [-3.0, L2_H, -6.0], "damask"));
solid.push(boxMM("l2-wall-s", [-17.4, 0, 2.8], [-3.0, L2_H, 3.0], "damask"));
solid.push(boxMM("l2-wall-e1", [-3.2, 0, -6.0], [-3.0, L2_H, -3.2], "damask"));
// the far wall with the stairwell's doorway (z -5.6..-3.6) and the stairwell behind it
solid.push(boxMM("l2-wall-w1", [-17.4, 0, -3.6], [-17.2, L2_H, 2.8], "damask"));
solid.push(boxMM("l2-wall-w-head", [-17.4, 2.4, -5.6], [-17.2, L2_H, -3.6], "damask"));
solid.push(boxMM("l2-wall-w0", [-17.4, 0, -6.0], [-17.2, L2_H, -5.6], "damask"));
solid.push(boxMM("l2-stair-n", [-21.2, 0, -6.2], [-17.2, L2_H, -6.0], "concreteDark"));
solid.push(boxMM("l2-stair-s", [-21.2, 0, -2.2], [-17.2, L2_H, -2.0], "concreteDark"));
solid.push(boxMM("l2-stair-w", [-21.4, 0, -6.2], [-21.2, L2_H, -2.0], "concreteDark"));
solid.push(boxMM("l2-stair-ceil", [-21.4, L2_H, -6.2], [-17.2, L2_H + 0.2, -2.0], "ceilDark"));
for (let i = 0; i < 5; i++) decor.push(boxMM(`l2-step-${i}`, [-21.2, 0, -6.0 + i * 0.5], [-19.4 + i * 0.1, 0.02 + (4 - i) * 0.001, -5.6 + i * 0.5], "stairEdge"));
decor.push(boxMM("l2-stair-exit", [-17.25, 2.5, -4.8], [-17.2, 2.64, -4.44], "exitRed"));
// plinths (high), a bench and the reception desk (low); frames on the walls
for (const [id, x, z] of [["l2-plinth-1", -7.6, -3.8], ["l2-plinth-2", -11.8, 1.1], ["l2-plinth-3", -13.6, -4.0]] as Array<[string, number, number]>) {
  solid.push(boxMM(id, [x - 0.4, 0, z - 0.4], [x + 0.4, 1.6, z + 0.4], "marbleWhite", { data: { surface: "concrete" } }));
  decor.push(prim(`${id}-vase`, "cylinder", [x, 1.85, z], [0.14, 0.2, 0.5, 14], "vase"));
}
solid.push(boxMM("l2-bench", [-10.4, 0, -1.3], [-8.6, 0.95, -0.6], "bench", { data: { surface: "wood" } }));
solid.push(boxMM("l2-desk", [-15.4, 0, -1.2], [-14.2, 1.1, 1.4], "desk", { data: { surface: "wood" } }));
decor.push(boxMM("l2-desk-top", [-15.45, 1.1, -1.25], [-14.15, 1.14, 1.45], "marbleWhite"), boxMM("l2-desk-lamp", [-14.9, 1.14, 0.9], [-14.75, 1.5, 1.05], "lampWarm"));
for (const [id, x, z, w] of [["l2-frame-1", -6.5, -5.98, 1.6], ["l2-frame-2", -10.5, -5.98, 2.0], ["l2-frame-3", -8.8, 2.78, 1.8], ["l2-frame-4", -13.4, 2.78, 1.4]] as Array<[string, number, number, number]>) {
  decor.push(boxMM(id, [x - w / 2, 1.2, z - 0.02], [x + w / 2, 2.5, z + 0.02], "frame"));
  decor.push(boxMM(`${id}-art`, [x - w / 2 + 0.1, 1.3, z - 0.03], [x + w / 2 - 0.1, 2.4, z + 0.03], z < 0 ? "artA" : "artB"));
}
for (const x of [-6, -10, -14]) decor.push(boxMM(`l2-spot-${x}`, [x - 0.3, L2_H - 0.04, -1.8], [x + 0.3, L2_H - 0.01, -1.2], "spot"));

// ---------------------------------------------------------------- S3: the dead floor (south)
const L3_H = 3.6;
decor.push(boxMM("l3-floor", [-9, 0, 3.2], [9, 0.012, 17.2], "concreteBare"));
solid.push(boxMM("l3-ceil", [-9.2, L3_H, 3.0], [9.2, L3_H + 0.2, 17.4], "concreteDark"));
solid.push(boxMM("l3-wall-n1", [-9.2, 0, 3.0], [-3.2, L3_H, 3.2], "concreteDark"));
solid.push(boxMM("l3-wall-n2", [3.2, 0, 3.0], [9.2, L3_H, 3.2], "concreteDark"));
solid.push(boxMM("l3-wall-w", [-9.2, 0, 3.2], [-9.0, L3_H, 17.4], "concreteDark"));
solid.push(boxMM("l3-wall-e", [9.0, 0, 3.2], [9.2, L3_H, 17.4], "concreteDark"));
solid.push(boxMM("l3-wall-s", [-9.2, 0, 17.2], [9.2, L3_H, 17.4], "concreteDark"));
for (const [x, z] of [[-5, 8], [5, 8], [-5, 13.4], [2.6, 13.2]]) solid.push(boxMM(`l3-col-${x}-${z}`, [x - 0.35, 0, z - 0.35], [x + 0.35, L3_H, z + 0.35], "concrete"));
// scaffolding: an invisible collider (high cover) the camera knows, poles and boards
function scaffold(id: string, x0: number, z0: number, x1: number, z1: number): void {
  solid.push(boxMM(id, [x0, 0, z0], [x1, 2.2, z1], "scaffold", { hidden: true, data: { surface: "metal", camera: true } }));
  for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) decor.push(prim(`${id}-pole-${px}-${pz}`, "cylinder", [px, 1.1, pz], [0.04, 0.04, 2.2, 8], "scaffold"));
  for (const y of [1.0, 2.1]) decor.push(boxMM(`${id}-board-${y}`, [x0, y, z0], [x1, y + 0.06, z1], "plywood"));
  decor.push(prim(`${id}-brace`, "cylinder", [(x0 + x1) / 2, 1.1, z0], [0.025, 0.025, Math.hypot(x1 - x0, 2.2), 6], "scaffold", [0, 0, Math.atan2(x1 - x0, 2.2)]));
}
scaffold("l3-scaffold-1", -8.4, 9.6, -6.8, 12.4);
scaffold("l3-scaffold-2", 6.4, 5.0, 8.4, 6.6);
for (const [id, x0, z0, x1, z1] of [["l3-bags-1", -2.4, 6.4, -0.8, 7.2], ["l3-bags-2", 1.6, 10.2, 3.2, 11.0], ["l3-bags-3", -3.8, 13.8, -2.2, 14.6], ["l3-bags-4", 6.0, 11.4, 7.0, 12.8]] as Array<[string, number, number, number, number]>) {
  solid.push(boxMM(id, [x0, 0, z0], [x1, 0.9, z1], "bags", { data: { surface: "drywall" } }));
}
decor.push(boxMM("l3-plywood", [-8.95, 0, 5.0], [-8.85, 2.4, 7.4], "plywood"), boxMM("l3-rebar", [-1.0, 0.02, 15.6], [2.4, 0.14, 16.0], "rebar"));
// the stairs (the way out, and where the second and third waves come up): an open corner, x 5.2..9,
// z 15..17.2 (open: a kill cam there never has a wall at its lens), a guard rail and the exit light
decor.push(boxMM("l3-stair-exit", [7.0, 2.5, 17.16], [7.4, 2.64, 17.2], "exitRed"));
for (let i = 0; i < 6; i++) decor.push(boxMM(`l3-step-${i}`, [5.3 + i * 0.6, 0, 16.2], [5.9 + i * 0.6, 0.02, 17.1], "stairEdge"));
decor.push(boxMM("l3-stair-rail", [5.2, 1.0, 15.9], [9.0, 1.05, 15.95], "scaffold"));
for (const x of [5.2, 7.1, 9.0]) decor.push(prim(`l3-stair-post-${x}`, "cylinder", [x, 0.5, 15.92], [0.025, 0.025, 1.0, 6], "scaffold"));
// hanging work lamps
for (const [x, z] of [[-4, 6], [3, 6.5], [-3, 11.5], [4, 12.5], [0, 15.5]]) {
  decor.push(prim(`l3-cord-${x}-${z}`, "cylinder", [x, L3_H - 0.4, z], [0.01, 0.01, 0.8, 4], "metalDark"));
  decor.push(prim(`l3-lamp-${x}-${z}`, "sphere", [x, L3_H - 0.85, z], [0.12, 10, 8], "workLamp"));
}

// ---------------------------------------------------------------- markers
const markers: Node[] = [
  marker("spawn", "spawn", [-1.2, 0, 0.6], {}, FACE_E),
  marker("cp-s1", "checkpoint", [-1.2, 0, 0.6], {}, FACE_E),
  marker("cp-s2", "checkpoint", [1.2, 0, -0.4], {}, FACE_W),
  marker("cp-s3", "checkpoint", [0.4, 0, -1.6], {}, FACE_S),
  // S1: chatting, backs half turned to the doors (idle: the door beat is his)
  marker("l1-goon-1", "enemy", [10.2, 0, 0.1], { kind: "goon", group: "L1" }, FACE_N + 0.5),
  marker("l1-goon-2", "enemy", [11.0, 0, -0.9], { kind: "goon", group: "L1" }, FACE_E + 0.9),
  marker("l1-goon-3", "enemy", [9.3, 0, -3.8], { kind: "goon", group: "L1" }, FACE_E),
  marker("l1-goon-4", "enemy", [12.3, 0, 2.2], { kind: "goon", group: "L1" }, FACE_W + 0.6),
  // R2: the heavy on the roof (placed by the hatch when he drops)
  marker("roof-heavy", "enemy", [-0.5, 0, 0], { kind: "heavy", model: "rival652", group: "roof" }, FACE_E),
  // S2: they know he is coming; two more up the stairwell once three are down
  marker("l2-goon-1", "enemy", [-9.4, 0, -4.8], { kind: "goon", group: "L2" }, FACE_E),
  marker("l2-goon-2", "enemy", [-12.8, 0, 2.0], { kind: "goon", group: "L2" }, FACE_E),
  marker("l2-goon-3", "enemy", [-15.9, 0, 0.2], { kind: "goon", group: "L2" }, FACE_E),
  marker("l2-rusher-1", "enemy", [-7.8, 0, 1.9], { kind: "rusher", group: "L2" }, FACE_E),
  marker("l2-rusher-2", "enemy", [-11.2, 0, -2.6], { kind: "rusher", group: "L2" }, FACE_E),
  marker("l2b-rusher-1", "enemy", [-19.0, 0, -4.8], { kind: "rusher", group: "L2b" }, FACE_E),
  marker("l2b-rusher-2", "enemy", [-19.8, 0, -3.6], { kind: "rusher", group: "L2b" }, FACE_E),
  // S3: W1 at the doors (they pry them), W2 and W3 up the stairwell
  marker("l3-goon-1", "enemy", [-1.0, 0, 4.4], { kind: "goon", group: "L3" }, FACE_N),
  marker("l3-goon-2", "enemy", [1.1, 0, 4.5], { kind: "goon", group: "L3" }, FACE_N),
  marker("l3-goon-3", "enemy", [3.4, 0, 5.4], { kind: "goon", group: "L3" }, FACE_N),
  marker("l3-heavy-1", "enemy", [0, 0, 6.2], { kind: "heavy", model: "rival723", group: "L3" }, FACE_N),
  marker("l3b-rusher-1", "enemy", [6.0, 0, 16.0], { kind: "rusher", group: "L3b" }, FACE_N),
  marker("l3b-rusher-2", "enemy", [7.4, 0, 16.2], { kind: "rusher", group: "L3b" }, FACE_N),
  marker("l3b-goon-1", "enemy", [8.3, 0, 15.3], { kind: "goon", group: "L3b" }, FACE_N),
  marker("l3b-goon-2", "enemy", [6.6, 0, 15.2], { kind: "goon", group: "L3b" }, FACE_N),
  marker("l3c-heavy", "enemy", [7.0, 0, 16.3], { kind: "heavy", model: "rival652", group: "L3c" }, FACE_N),
  marker("l3c-rusher-1", "enemy", [5.8, 0, 15.4], { kind: "rusher", group: "L3c" }, FACE_N),
  marker("l3c-rusher-2", "enemy", [8.4, 0, 16.4], { kind: "rusher", group: "L3c" }, FACE_N),
  // cover points (facing = the direction they protect toward: the car)
  marker("cv-car-a", "cover", [-1.3, 0, -2.35], { height: "low" }, FACE_E),
  marker("cv-car-b", "cover", [1.4, 0, 2.4], { height: "low" }, FACE_W),
  marker("cv-l1-cart-1", "cover", [7.65, 0, -3.0], { height: "low" }, FACE_W),
  marker("cv-l1-cart-2", "cover", [9.65, 0, 1.6], { height: "low" }, FACE_W),
  marker("cv-l1-cage", "cover", [11.65, 0, -2.0], { height: "high", side: "left" }, FACE_W),
  marker("cv-l1-pillar", "cover", [8.85, 0, -0.4], { height: "high", side: "right" }, FACE_W),
  marker("cv-l1-table", "cover", [13.0 - 0.05, 0, 1.2], { height: "low" }, FACE_W),
  marker("cv-l2-plinth-1", "cover", [-8.4, 0, -3.8], { height: "high", side: "left" }, FACE_E),
  marker("cv-l2-plinth-2", "cover", [-12.6, 0, 1.1], { height: "high", side: "right" }, FACE_E),
  marker("cv-l2-plinth-3", "cover", [-14.4, 0, -4.0], { height: "high", side: "left" }, FACE_E),
  marker("cv-l2-bench", "cover", [-10.85, 0, -0.95], { height: "low" }, FACE_E),
  marker("cv-l2-desk", "cover", [-15.85, 0, 0.1], { height: "low" }, FACE_E),
  marker("cv-l3-bags-1", "cover", [-1.6, 0, 7.65], { height: "low" }, FACE_N),
  marker("cv-l3-bags-2", "cover", [2.4, 0, 11.45], { height: "low" }, FACE_N),
  marker("cv-l3-bags-3", "cover", [-3.0, 0, 15.05], { height: "low" }, FACE_N),
  marker("cv-l3-bags-4", "cover", [6.5, 0, 13.25], { height: "low" }, FACE_N),
  marker("cv-l3-col-1", "cover", [-5, 0, 8.8], { height: "high", side: "right" }, FACE_N),
  marker("cv-l3-col-2", "cover", [5, 0, 8.8], { height: "high", side: "left" }, FACE_N),
  marker("cv-l3-col-3", "cover", [-5, 0, 14.2], { height: "high", side: "left" }, FACE_N),
  marker("cv-l3-col-4", "cover", [2.6, 0, 14.0], { height: "high", side: "right" }, FACE_N),
  marker("cv-l3-scaffold", "cover", [-7.6, 0, 12.85], { height: "high", side: "left" }, FACE_N),
  // waypoints: the car, then each landing (the doorway nodes link across explicitly: the doors are shut
  // when the graph is built)
  ...([
    ["c0", 0, 0], ["c-n", 0.2, -2.1], ["c-e", 2.1, 0], ["c-w", -2.1, 0], ["c-s", 0, 2.1],
    ["l1-a", 5.8, -1.6], ["l1-b", 6.4, 1.9], ["l1-c", 9.2, -3.6], ["l1-d", 9.8, 0.5], ["l1-e", 12.2, -3.4], ["l1-f", 12.5, 2.3], ["l1-g", 12.2, -0.4],
    ["l2-a", -6.0, -4.9], ["l2-b", -6.2, 1.9], ["l2-c", -9.6, 1.9], ["l2-d", -10.2, -3.0], ["l2-e", -13.0, -2.2], ["l2-f", -16.2, -4.6], ["l2-g", -16.2, 1.9], ["l2-h", -13.4, -5.3],
    ["l3-a", -2.6, 5.0], ["l3-b", 3.0, 7.0], ["l3-c", -6.8, 5.4], ["l3-d", -7.4, 8.4], ["l3-e", 0.2, 9.0], ["l3-f", -2.6, 11.2], ["l3-g", 7.4, 9.2], ["l3-h", 4.2, 15.6], ["l3-i", -6.2, 15.8], ["l3-j", 0.6, 13.2], ["l3-k", 7.6, 13.6],
  ] as Array<[string, number, number]>).map(([id, x, z]) => marker(`wp-${id}`, "waypoint", [x, 0, z])),
  // (a node with explicit links still gets the auto-links of the nodes around it)
  // ({door}: the link through it is walkable only while those doors are open)
  marker("wp-l1-in", "waypoint", [4.2, 0, 0], { links: ["wp-c-e"], door: "door-e" }),
  marker("wp-l2-in", "waypoint", [-4.2, 0, 0], { links: ["wp-c-w"], door: "door-w" }),
  marker("wp-l3-in", "waypoint", [0, 0, 4.2], { links: ["wp-c-s"], door: "door-s" }),
  marker("wp-l2-stair", "waypoint", [-19.2, 0, -4.2]),
  marker("wp-l3-stair", "waypoint", [6.6, 0, 15.8]),
  marker("wp-l3-mouth", "waypoint", [6.3, 0, 13.9]),
  // pickups: copium (the car, S2, S3 x2), the shotgun (S1), the SMGs (S2), ammo on S3
  marker("copium-car", "pickup", [-2.2, 0, -1.2], { item: "copium", amount: 1 }),
  marker("shotgun-l1", "pickup", [12.2, 0, 0.1], { item: "shotgun" }),
  marker("copium-l2", "pickup", [-16.4, 0, 2.2], { item: "copium", amount: 1 }),
  marker("smgs-l2", "pickup", [-9.5, 0, -1.9], { item: "smgs" }),
  marker("copium-l3-a", "pickup", [-8.3, 0, 16.5], { item: "copium", amount: 1 }),
  marker("copium-l3-b", "pickup", [8.3, 0, 3.9], { item: "copium", amount: 1 }),
  marker("shells-l3", "pickup", [-7.6, 0, 8.6], { item: "shotgun_ammo" }),
  marker("smg-ammo-l3", "pickup", [3.6, 0, 12.0], { item: "smgs_ammo" }),
  // the stairwell reinforcements (S2) and S3's waves 2 and 3
  marker("trigger-l2b", "trigger", [0, -40, 0], { action: "spawn", group: "L2b", afterKills: 8 }, 0, [0.2, 0.2, 0.2]),
  marker("trigger-l3b", "trigger", [0, -40, 0], { action: "spawn", group: "L3b", whenClear: "L3" }, 0, [0.2, 0.2, 0.2]),
  marker("trigger-l3c", "trigger", [0, -40, 0], { action: "spawn", group: "L3c", whenClear: "L3b" }, 0, [0.2, 0.2, 0.2]),
  // the way out: the S3 stairwell
  marker("exit-stairs", "exit", [7.2, 0, 16.6], {}, FACE_S),
  marker("trigger-exit", "trigger", [7.0, 1, 16.0], { action: "exit" }, 0, [3.2, 3, 2.0]),
  // lights: the car's caged bulb and a cool fill; sodium over the laundry, cool gallery spots, work lamps
  ...([
    ["car-fill", -1.2, 2.8, -0.6, "#cfd8ea", 4, 6], // (the caged bulb's light is RideView's: it dies with the cables)
    ["l1-a", 6.2, 2.5, -1.2, "#ffb266", 12, 9], ["l1-b", 10.6, 2.5, 0.6, "#ffb266", 12, 9],
    ["l2-a", -6, 3.0, -1.5, "#e4ecff", 11, 9], ["l2-b", -10, 3.0, -1.5, "#e4ecff", 11, 9], ["l2-c", -14, 3.0, -1.5, "#e4ecff", 11, 9], ["l2-stair", -19.2, 2.8, -4.2, "#ff2a1a", 3, 4],
    ["l3-a", -4, 2.6, 6, "#ffd9a8", 16, 11], ["l3-b", 3, 2.6, 6.5, "#ffd9a8", 16, 11], ["l3-c", -3, 2.6, 11.5, "#ffd9a8", 16, 11], ["l3-d", 4, 2.6, 12.5, "#ffd9a8", 16, 11], ["l3-e", 0, 2.6, 15.5, "#ffd9a8", 13, 10],
  ] as Array<[string, number, number, number, string, number, number]>).map(([id, x, y, z, color, intensity, distance]) => marker(`light-${id}`, "light", [x, y, z], { color, intensity, distance })),
  // camera shots (?cam=<id> in dev builds)
  marker("cam-car", "camera", [-2.4, 1.7, 2.2], { at: [3, 1.2, -0.5] }),
  marker("cam-l1", "camera", [2.0, 1.7, 1.0], { at: [10, 1.0, -0.5] }),
  marker("cam-l2", "camera", [-2.0, 1.7, -1.0], { at: [-11, 1.0, -1] }),
  marker("cam-l3", "camera", [0.5, 1.8, 2.0], { at: [1, 1.0, 12] }),
];

// ---------------------------------------------------------------- materials
const E = "/textures/elevator/";
const B = "/textures/backrooms/";
const P = "/textures/penthouse/";
const materials: Record<string, Record<string, unknown>> = {
  concrete: tex(`${E}concrete_bare.webp`, 4, { roughness: 0.9 }),
  concreteBare: tex(`${E}concrete_bare.webp`, 4, { roughness: 0.85 }),
  concreteDark: tex(`${E}shaft_concrete.webp`, 4, { roughness: 0.92 }),
  carFloor: tex(`${E}car_floor_diamond.webp`, 1, { roughness: 0.45, metalness: 0.5 }),
  carWall: tex(`${E}car_wall_steel.webp`, 2, { roughness: 0.4, metalness: 0.55 }),
  carCeil: tex(`${E}car_wall_steel.webp`, 2, { roughness: 0.5, metalness: 0.4 }),
  carPanel: glow("#ffffff", 0.5, "", `${E}car_panel.webp`),
  dial: glow("#ffffff", 0.4, "", `${E}floor_dial.webp`),
  bulb: glow("#ffd29a", 0.9, "flicker"),
  hazard: tex(`${E}hazard_sill.webp`, [0.5, 0.06], { roughness: 0.7 }),
  hazardX: tex(`${E}hazard_sill.webp`, [0.5, 0.06], { roughness: 0.7 }),
  crate: tex(`${B}boxes_cardboard.webp`, 0.6, { roughness: 0.9 }),
  vinyl: tex(`${B}floor_vinyl.webp`, 1.5, { roughness: 0.55 }),
  ceilTile: tex(`${B}ceiling_tiles.webp`, 1.2, { roughness: 0.95 }),
  block: tex(`${B}wall_cinderblock.webp`, 2, { roughness: 0.92 }),
  marble: tex(`${E}marble_grey.webp`, 2, { roughness: 0.3 }),
  damask: tex(`${P}wall_damask.webp`, 1, { roughness: 0.8 }),
  ceilDark: tex(`${P}ceiling_coffered.webp`, 3, { roughness: 0.9 }),
  cart: { color: "#3a4a5e", roughness: 0.5, metalness: 0.3 },
  linen: { color: "#b9b3a6", roughness: 0.95 },
  cage: { color: "#50555e", roughness: 0.45, metalness: 0.6 },
  washer: { color: "#8d9096", roughness: 0.35, metalness: 0.4 },
  table: { color: "#4a3a2a", roughness: 0.6 },
  marbleWhite: { color: "#cfcac2", roughness: 0.3 },
  vase: { color: "#2b3f5a", roughness: 0.25, metalness: 0.2 },
  bench: { color: "#3b2a22", roughness: 0.5 },
  desk: { color: "#2e2622", roughness: 0.45 },
  frame: { color: "#6a5230", roughness: 0.4, metalness: 0.6 },
  artA: { color: "#3b2f4a", roughness: 0.9 },
  artB: { color: "#4a3326", roughness: 0.9 },
  stairEdge: { color: "#3a3a3c", roughness: 0.8 },
  scaffold: { color: "#6b6f75", roughness: 0.45, metalness: 0.6 },
  plywood: { color: "#8a6a44", roughness: 0.85 },
  bags: { color: "#8c8577", roughness: 0.95 },
  rebar: { color: "#5a3a2a", roughness: 0.7, metalness: 0.5 },
  metalDark: { color: "#25272c", roughness: 0.45, metalness: 0.6 },
  chrome: { color: "#b9bcc4", roughness: 0.2, metalness: 0.9 },
  // lit (the look keeps these under the bloom's reach)
  sodium: glow("#ffb266", 1.0),
  spot: glow("#eef2ff", 1.0),
  workLamp: glow("#ffd9a8", 1.2),
  exitRed: glow("#ff2a1a", 1.0),
  lampWarm: glow("#ffc98a", 1.2),
};

writeLevel("room4", "Room 4: the elevator", {
  name: "The Elevator", number: 4, next: "room5", cutsceneAfter: "c3", music: "elevator", look: "elevator", footsteps: "hard",
  enterLine: "r4_enter", enterDelay: 1.5, clearLine: "r4_clear", tutorial: false, drops: { rusher: "smgs" },
  later: ["L1", "roof", "L2", "L3"],
  ride: {
    car: [-3, -3, 3, 3],
    hatch: [-0.5, 0],
    steps: [
      { t: 12 },
      { stop: "S1", side: "e", doors: ["door-e"], groups: ["L1"], slow: true, checkpoint: "cp-s1" },
      { t: 24, roof: 5, group: "roof" },
      { stop: "S2", side: "w", doors: ["door-w"], groups: ["L2", "L2b"], alert: true, checkpoint: "cp-s2" },
      { t: 11, cables: 3.5 },
      { stop: "S3", side: "s", doors: ["door-s"], groups: ["L3", "L3b", "L3c"], pry: 2.0, alert: true, checkpoint: "cp-s3", last: true },
    ],
  },
}, materials, solid, decor, markers);
