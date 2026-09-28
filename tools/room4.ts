// Writes public/levels/room4.json: room 4, the service elevator (round-3 plan section 2). Like the other
// room tools it is the starting point for hand-tuning in the editor (/?editor=room4); re-running it
// OVERWRITES the file.   node tools/room4.ts && npm run check-level room4
//
// The car never moves: it is a static 6 x 6 m freight car at the origin (ceiling 3.4 m, a roof hatch
// at (-0.5, 0)) with doors on three sides, and the ride is a script in the room settings (sim/ride.ts)
// the view plays as a shaft scrolling past the closed gates. Each stop opens one side's doors onto its
// landing; the three landings lie on three sides of the car and never overlap:
// Round 4 (the spawns): no stop brings its gang in through one door. Each landing has two or three
// entries the car cannot see into (a service passage, a fire-escape door, a linen room; the stairwell, a
// back office, a coat corridor; the stairs, a side room, a service door, the car's own roof hatch), and
// after the first group the rest come in small staggered waves (the stop's `waves`: by the clock or by
// the stop's losses, whichever is first), some straight to cover, some round to the car's blind angles.
// The landings' far ends hold the frags, shells and cans that make him step out of the car.
//   R1  going up (12 s): the muzak, the narrator.
//   S1  EAST, the laundry floor   x 3.2..13.2, z -4.6..2.8: 4 goons (two chatting, backs half turned;
//       one behind the linen cage, one down by the washers); the doors' opening is the door beat (1 s of
//       free slow motion). Then 2 rushers out of the service passage (north-east, it runs on south
//       behind the east wall), 2 goons out of the linen room (south-east), 1 in off the fire escape
//       (north). Carts (low), the linen cage and a pillar (high), the washers (low). The shotgun on the
//       folding table, frags by the linen room's door.
//   R2  a heavy on the roof: the thud, the hatch's 2 s tell, he drops into the car.
//   S2  WEST, the gallery floor   x -17.2..-3.2, z -6..2.8: 3 goons + 2 rushers who know he is coming
//       (two already behind the plinths and the desk). Then 2 rushers up the stairwell (far west), 2
//       goons out of the back office (north), 1 goon out of the coat corridor (south). Marble, plinths
//       (high), a bench and the reception desk (low). The dual SMGs on the bench.
//   R3  the cables: the snap, the fall, the brakes.
//   S3  SOUTH, the dead floor     x -9..9, z 3.2..17.2: goons pry the doors open (2 s): 3 goons (one
//       already back behind the bags) + a heavy. Then a rusher up the stairs (south-east, walled so
//       the car cannot see up them) and 2 goons out of the side room (west) together; a rusher drops
//       through the car's roof hatch (the car is no place to stay); last, the hand-cannon heavy out of
//       the service door (south) and a rusher up the stairs. The stairs are the way out. Columns and
//       scaffolding (high), cement bags (low).
// Hostiles 30 (goons 18, rushers 9, heavies 3), 3 checkpoints (one per stop, saved as the car arrives).
// `npm run check-level room4` checks every wave starts out of the car's sight, and from how many places.
// Material tokens (the elevator look, src/app/look/tower.tsx): "glow <g>" (+ "flicker"). No lettering.
import { FACE_E, FACE_N, FACE_S, FACE_W, box, boxMM, glow, marker, prim, tex, writeLevel, type Node, type V3 } from "./levelKit.ts";

const solid: Node[] = [];
const decor: Node[] = [];
const CAR_H = 3.4;

// ---------------------------------------------------------------- floor
solid.push(boxMM("floor", [-22, -0.5, -11], [16, 0, 21], "concrete"));

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
// the north wall with the fire-escape door (x 9.0..10.4) and the fire escape's cage behind it
solid.push(boxMM("l1-wall-n", [3.0, 0, -4.8], [9.0, L1_H, -4.6], "block"));
solid.push(boxMM("l1-wall-n2", [10.4, 0, -4.8], [13.4, L1_H, -4.6], "block"));
solid.push(boxMM("l1-wall-n-head", [9.0, 2.3, -4.8], [10.4, L1_H, -4.6], "block"));
decor.push(boxMM("l1-fe-floor", [8.0, 0, -7.0], [11.8, 0.012, -4.8], "stairEdge"));
solid.push(boxMM("l1-fe-w", [7.8, 0, -7.2], [8.0, L1_H, -4.8], "concreteDark"));
solid.push(boxMM("l1-fe-e", [11.8, 0, -7.2], [12.0, L1_H, -4.8], "concreteDark"));
solid.push(boxMM("l1-fe-n", [7.8, 0, -7.2], [12.0, L1_H, -7.0], "concreteDark"));
solid.push(boxMM("l1-fe-ceil", [7.8, L1_H, -7.2], [12.0, L1_H + 0.2, -4.6], "concreteDark"));
decor.push(boxMM("l1-fe-exit", [9.5, 2.4, -4.62], [9.9, 2.54, -4.6], "exitRed"));
// the south wall with the linen room's door (x 10.6..12.0) and the linen room (x 9.6..13.2, z 3..6.4)
solid.push(boxMM("l1-wall-s", [3.0, 0, 2.8], [10.6, L1_H, 3.0], "block"));
solid.push(boxMM("l1-wall-s2", [12.0, 0, 2.8], [13.4, L1_H, 3.0], "block"));
solid.push(boxMM("l1-wall-s-head", [10.6, 2.3, 2.8], [12.0, L1_H, 3.0], "block"));
decor.push(boxMM("l1-linen-floor", [9.6, 0, 3.0], [13.2, 0.012, 6.4], "vinyl"));
solid.push(boxMM("l1-linen-w", [9.4, 0, 3.0], [9.6, L1_H, 6.6], "block"));
solid.push(boxMM("l1-linen-e", [13.2, 0, 3.0], [13.4, L1_H, 6.6], "block"));
solid.push(boxMM("l1-linen-s", [9.4, 0, 6.4], [13.4, L1_H, 6.6], "block"));
solid.push(boxMM("l1-linen-ceil", [9.4, L1_H, 3.0], [13.4, L1_H + 0.2, 6.6], "ceilTile"));
solid.push(boxMM("l1-linen-shelf", [9.6, 0, 5.8], [11.4, 1.9, 6.4], "cage", { data: { surface: "metal" } }));
decor.push(boxMM("l1-linen-stack", [9.7, 0.3, 5.9], [11.3, 1.7, 6.3], "linen"));
// the east wall with the service passage's doorway (z -4.6..-2.8) and the passage behind it
solid.push(boxMM("l1-wall-e", [13.2, 0, -2.8], [13.4, L1_H, 2.8], "block"));
solid.push(boxMM("l1-wall-e-head", [13.2, 2.4, -4.6], [13.4, L1_H, -2.8], "block"));
// (the passage runs on south behind the east wall: whoever waits in it is out of the car's sight)
decor.push(boxMM("l1-back-floor", [13.4, 0, -4.6], [15.0, 0.012, 0.4], "vinyl"));
solid.push(boxMM("l1-back-n", [13.4, 0, -4.8], [15.0, L1_H, -4.6], "concreteDark"));
solid.push(boxMM("l1-back-s", [13.4, 0, 0.4], [15.0, L1_H, 0.6], "concreteDark"));
solid.push(boxMM("l1-back-e", [15.0, 0, -4.8], [15.2, L1_H, 0.6], "concreteDark"));
solid.push(boxMM("l1-back-ceil", [13.2, L1_H, -4.8], [15.2, L1_H + 0.2, 0.6], "ceilTile"));
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
decor.push(boxMM("l1-exit", [13.18, 2.6, -3.9], [13.2, 2.74, -3.5], "exitRed"));

// ---------------------------------------------------------------- S2: the gallery floor (west)
const L2_H = 3.6;
decor.push(boxMM("l2-floor", [-17.2, 0, -6], [-3.2, 0.012, 2.8], "marble"));
solid.push(boxMM("l2-ceil", [-17.4, L2_H, -6.2], [-3.0, L2_H + 0.2, 3.0], "ceilDark"));
// the north wall with the back office's door (x -11.4..-10.0) and the office (x -13.4..-8.0, z -9.6..-6.2)
solid.push(boxMM("l2-wall-n", [-17.4, 0, -6.2], [-11.4, L2_H, -6.0], "damask"));
solid.push(boxMM("l2-wall-n2", [-10.0, 0, -6.2], [-3.0, L2_H, -6.0], "damask"));
solid.push(boxMM("l2-wall-n-head", [-11.4, 2.4, -6.2], [-10.0, L2_H, -6.0], "damask"));
decor.push(boxMM("l2-office-floor", [-13.4, 0, -9.6], [-8.0, 0.012, -6.2], "marble"));
solid.push(boxMM("l2-office-w", [-13.6, 0, -9.8], [-13.4, L2_H, -6.2], "damask"));
solid.push(boxMM("l2-office-e", [-8.0, 0, -9.8], [-7.8, L2_H, -6.2], "damask"));
solid.push(boxMM("l2-office-n", [-13.6, 0, -9.8], [-7.8, L2_H, -9.6], "damask"));
solid.push(boxMM("l2-office-ceil", [-13.6, L2_H, -9.8], [-7.8, L2_H + 0.2, -6.0], "ceilDark"));
solid.push(boxMM("l2-office-desk", [-9.6, 0, -9.4], [-8.2, 0.8, -8.4], "desk", { data: { surface: "wood" } }));
// the south wall with the coat corridor's door (x -15.2..-13.8) and the corridor (x -17.2..-12.0, z 3..5.6)
solid.push(boxMM("l2-wall-s", [-17.4, 0, 2.8], [-15.2, L2_H, 3.0], "damask"));
solid.push(boxMM("l2-wall-s2", [-13.8, 0, 2.8], [-3.0, L2_H, 3.0], "damask"));
solid.push(boxMM("l2-wall-s-head", [-15.2, 2.4, 2.8], [-13.8, L2_H, 3.0], "damask"));
decor.push(boxMM("l2-coat-floor", [-17.2, 0, 3.0], [-12.0, 0.012, 5.6], "marble"));
solid.push(boxMM("l2-coat-w", [-17.4, 0, 3.0], [-17.2, L2_H, 5.8], "damask"));
solid.push(boxMM("l2-coat-e", [-12.0, 0, 3.0], [-11.8, L2_H, 5.8], "damask"));
solid.push(boxMM("l2-coat-s", [-17.4, 0, 5.6], [-11.8, L2_H, 5.8], "damask"));
solid.push(boxMM("l2-coat-ceil", [-17.4, L2_H, 3.0], [-11.8, L2_H + 0.2, 5.8], "ceilDark"));
decor.push(boxMM("l2-coat-rail", [-16.8, 1.7, 5.3], [-12.4, 1.74, 5.36], "chrome"));
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
// the west wall with the side room's gap (z 13.0..14.4, clear of the scaffold) and the side room (x
// -13.4..-9.2, z 9.6..15)
solid.push(boxMM("l3-wall-w", [-9.2, 0, 3.2], [-9.0, L3_H, 13.0], "concreteDark"));
solid.push(boxMM("l3-wall-w2", [-9.2, 0, 14.4], [-9.0, L3_H, 17.4], "concreteDark"));
solid.push(boxMM("l3-wall-w-head", [-9.2, 2.5, 13.0], [-9.0, L3_H, 14.4], "concreteDark"));
decor.push(boxMM("l3-side-floor", [-13.4, 0, 9.6], [-9.2, 0.012, 15.0], "concreteBare"));
solid.push(boxMM("l3-side-w", [-13.6, 0, 9.4], [-13.4, L3_H, 15.2], "concreteDark"));
solid.push(boxMM("l3-side-n", [-13.6, 0, 9.4], [-9.2, L3_H, 9.6], "concreteDark"));
solid.push(boxMM("l3-side-s", [-13.6, 0, 15.0], [-9.2, L3_H, 15.2], "concreteDark"));
solid.push(boxMM("l3-side-ceil", [-13.6, L3_H, 9.4], [-9.0, L3_H + 0.2, 15.2], "concreteDark"));
solid.push(boxMM("l3-side-bags", [-12.8, 0, 10.4], [-11.2, 0.9, 11.2], "bags", { data: { surface: "drywall" } }));
solid.push(boxMM("l3-wall-e", [9.0, 0, 3.2], [9.2, L3_H, 17.4], "concreteDark"));
// the south wall with the service door (x -4.4..-3.0) and the service corridor behind (z 17.4..20)
solid.push(boxMM("l3-wall-s", [-9.2, 0, 17.2], [-4.4, L3_H, 17.4], "concreteDark"));
solid.push(boxMM("l3-wall-s2", [-3.0, 0, 17.2], [9.2, L3_H, 17.4], "concreteDark"));
solid.push(boxMM("l3-wall-s-head", [-4.4, 2.4, 17.2], [-3.0, L3_H, 17.4], "concreteDark"));
decor.push(boxMM("l3-svc-floor", [-7.0, 0, 17.4], [-1.0, 0.012, 20.0], "concreteBare"));
solid.push(boxMM("l3-svc-w", [-7.2, 0, 17.4], [-7.0, L3_H, 20.2], "concreteDark"));
solid.push(boxMM("l3-svc-e", [-1.0, 0, 17.4], [-0.8, L3_H, 20.2], "concreteDark"));
solid.push(boxMM("l3-svc-s", [-7.2, 0, 20.0], [-0.8, L3_H, 20.2], "concreteDark"));
solid.push(boxMM("l3-svc-ceil", [-7.2, L3_H, 17.4], [-0.8, L3_H + 0.2, 20.2], "concreteDark"));
decor.push(boxMM("l3-svc-exit", [-3.9, 2.5, 17.18], [-3.5, 2.64, 17.2], "exitRed"));
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
// the stairwell's walls: a wall to the north and a return on the west with the way in (z 15.6..17.2), so
// what comes up the stairs is out of the car's sight until it steps out
solid.push(boxMM("l3-stair-wall-n", [5.0, 0, 14.6], [9.0, L3_H, 14.8], "concreteDark"));
solid.push(boxMM("l3-stair-wall-w", [5.0, 0, 14.8], [5.2, L3_H, 15.6], "concreteDark"));
solid.push(boxMM("l3-stair-head", [5.0, 2.5, 15.6], [5.2, L3_H, 17.2], "concreteDark"));
// hanging work lamps
for (const [x, z] of [[-4, 6], [3, 6.5], [-3, 11.5], [4, 12.5], [0, 15.5]]) {
  decor.push(prim(`l3-cord-${x}-${z}`, "cylinder", [x, L3_H - 0.4, z], [0.01, 0.01, 0.8, 4], "metalDark"));
  decor.push(prim(`l3-lamp-${x}-${z}`, "sphere", [x, L3_H - 0.85, z], [0.12, 10, 8], "workLamp"));
}

// ---------------------------------------------------------------- markers
const markers: Node[] = [
  // (he stands where the over-the-shoulder view is square on the doors that open next, the lens a good
  // way off the back wall)
  marker("spawn", "spawn", [-0.4, 0, -0.6], {}, FACE_E),
  marker("cp-s1", "checkpoint", [-0.4, 0, -0.6], {}, FACE_E),
  marker("cp-s2", "checkpoint", [0.5, 0, 0.6], {}, FACE_W),
  marker("cp-s3", "checkpoint", [0.9, 0, -0.6], {}, FACE_S),
  // S1: chatting, backs half turned to the doors (idle: the door beat is his); one already behind the
  // linen cage, one down by the washers
  marker("l1-goon-1", "enemy", [10.2, 0, 0.1], { kind: "goon", group: "L1" }, FACE_N + 0.5),
  marker("l1-goon-2", "enemy", [11.0, 0, -0.9], { kind: "goon", group: "L1" }, FACE_E + 0.9),
  marker("l1-goon-3", "enemy", [11.65, 0, -2.0], { kind: "goon", group: "L1" }, FACE_W),
  marker("l1-goon-4", "enemy", [5.5, 0, -3.5], { kind: "goon", group: "L1" }, FACE_S),
  // S1 waves: the service passage (north-east), the linen room (south-east), the fire escape (north)
  marker("l1b-rusher-1", "enemy", [14.2, 0, -1.2], { kind: "rusher", group: "L1b" }, FACE_N),
  marker("l1b-rusher-2", "enemy", [14.3, 0, -0.3], { kind: "rusher", group: "L1b" }, FACE_N),
  marker("l1c-goon-1", "enemy", [12.6, 0, 4.9], { kind: "goon", group: "L1c" }, FACE_N),
  marker("l1c-goon-2", "enemy", [10.2, 0, 4.2], { kind: "goon", group: "L1c" }, FACE_N),
  marker("l1d-goon-1", "enemy", [8.5, 0, -6.5], { kind: "goon", group: "L1d" }, FACE_S),
  // R2: the heavy on the roof (placed by the hatch when he drops)
  marker("roof-heavy", "enemy", [-0.5, 0, 0], { kind: "heavy", model: "rival652", group: "roof" }, FACE_E),
  // S2: they know he is coming: two already behind the plinths and the desk, the rest out in the gallery
  marker("l2-goon-1", "enemy", [-9.6, 0, -2.8], { kind: "goon", group: "L2" }, FACE_E),
  marker("l2-goon-2", "enemy", [-12.6, 0, 1.1], { kind: "goon", group: "L2" }, FACE_E),
  marker("l2-goon-3", "enemy", [-15.9, 0, 0.2], { kind: "goon", group: "L2" }, FACE_E),
  marker("l2-rusher-1", "enemy", [-7.8, 0, 1.9], { kind: "rusher", group: "L2" }, FACE_E),
  marker("l2-rusher-2", "enemy", [-11.2, 0, -2.6], { kind: "rusher", group: "L2" }, FACE_E),
  // S2 waves: the stairwell (far west), the back office (north), the coat corridor (south)
  marker("l2b-rusher-1", "enemy", [-20.5, 0, -2.8], { kind: "rusher", group: "L2b" }, FACE_E),
  marker("l2b-rusher-2", "enemy", [-19.6, 0, -2.6], { kind: "rusher", group: "L2b" }, FACE_E),
  marker("l2c-goon-1", "enemy", [-12.6, 0, -8.8], { kind: "goon", group: "L2c" }, FACE_S),
  marker("l2c-goon-2", "enemy", [-9.0, 0, -7.4], { kind: "goon", group: "L2c" }, FACE_S),
  marker("l2d-goon-1", "enemy", [-16.4, 0, 4.6], { kind: "goon", group: "L2d" }, FACE_N),
  // S3: W1 at the doors (they pry them), one of them already back behind the bags
  marker("l3-goon-1", "enemy", [-1.0, 0, 4.4], { kind: "goon", group: "L3" }, FACE_N),
  marker("l3-goon-2", "enemy", [1.1, 0, 4.5], { kind: "goon", group: "L3" }, FACE_N),
  marker("l3-goon-3", "enemy", [-1.6, 0, 7.65], { kind: "goon", group: "L3" }, FACE_N),
  marker("l3-heavy-1", "enemy", [0, 0, 6.2], { kind: "heavy", model: "rival723", group: "L3" }, FACE_N),
  // S3 waves: up the stairs (south-east) and out of the side room (west) together; a rusher through the
  // car's roof hatch; last, the hand-cannon heavy out of the service door (south) with a rusher up the
  // stairs
  marker("l3b-rusher-1", "enemy", [6.2, 0, 16.2], { kind: "rusher", group: "L3b" }, FACE_W),
  marker("l3w-goon-1", "enemy", [-12.4, 0, 12.0], { kind: "goon", group: "L3w" }, FACE_E),
  marker("l3w-goon-2", "enemy", [-12.6, 0, 9.9], { kind: "goon", group: "L3w" }, FACE_E),
  marker("l3h-rusher", "enemy", [-0.5, 0, 0], { kind: "rusher", group: "L3h" }, FACE_S),
  marker("l3c-heavy", "enemy", [-6.2, 0, 19.2], { kind: "heavy", model: "rival652", group: "L3c", weapon: "handcannon" }, FACE_E),
  marker("l3c-rusher-1", "enemy", [7.4, 0, 15.6], { kind: "rusher", group: "L3c" }, FACE_W),
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
    ["l1-a", 5.8, -1.6], ["l1-b", 6.4, 1.9], ["l1-c", 9.2, -3.6], ["l1-d", 9.8, 0.5], ["l1-e", 12.2, -3.4], ["l1-f", 12.5, 2.3], ["l1-g", 12.2, -0.4], ["l1-back", 14.2, -3.7], ["l1-back-s", 14.2, -0.6],
    ["l2-a", -6.0, -4.9], ["l2-b", -6.2, 1.9], ["l2-c", -9.6, 1.9], ["l2-d", -10.2, -3.0], ["l2-e", -13.0, -2.2], ["l2-f", -16.2, -4.6], ["l2-g", -16.2, 1.9], ["l2-h", -13.4, -5.3],
    ["l3-a", -2.6, 5.0], ["l3-b", 3.0, 7.0], ["l3-c", -6.8, 5.4], ["l3-d", -7.4, 8.4], ["l3-e", 0.2, 9.0], ["l3-f", -2.6, 11.2], ["l3-g", 7.4, 9.2], ["l3-h", 4.2, 15.6], ["l3-i", -6.2, 15.8], ["l3-j", 0.6, 13.2], ["l3-k", 7.6, 13.6],
  ] as Array<[string, number, number]>).map(([id, x, z]) => marker(`wp-${id}`, "waypoint", [x, 0, z])),
  // (a node with explicit links still gets the auto-links of the nodes around it)
  // ({door}: the link through it is walkable only while those doors are open)
  marker("wp-l1-in", "waypoint", [4.2, 0, 0], { links: ["wp-c-e"], door: "door-e" }),
  marker("wp-l2-in", "waypoint", [-4.2, 0, 0], { links: ["wp-c-w"], door: "door-w" }),
  marker("wp-l3-in", "waypoint", [0, 0, 4.2], { links: ["wp-c-s"], door: "door-s" }),
  marker("wp-l2-stair", "waypoint", [-19.2, 0, -4.2]),
  // the new entries: the fire escape and the linen room (S1), the back office and the coat corridor (S2),
  // the side room and the service corridor (S3), each with a node in its doorway
  ...([
    ["l1-fe", 10.4, -6.0], ["l1-fe-door", 9.7, -4.0], ["l1-linen", 11.4, 4.4], ["l1-linen-door", 11.3, 2.2],
    ["l2-office", -10.7, -8.2], ["l2-office-door", -10.7, -5.4], ["l2-coat", -14.5, 4.3], ["l2-coat-door", -14.5, 2.2],
    ["l3-side", -11.3, 13.0], ["l3-side-door", -8.2, 13.7], ["l3-svc", -3.7, 18.7], ["l3-svc-door", -3.7, 16.4],
  ] as Array<[string, number, number]>).map(([id, x, z]) => marker(`wp-${id}`, "waypoint", [x, 0, z])),
  marker("wp-l3-stair", "waypoint", [6.8, 0, 16.3]),
  marker("wp-l3-stair-door", "waypoint", [4.4, 0, 16.4]),
  marker("wp-l3-mouth", "waypoint", [6.3, 0, 13.9]),
  // pickups: copium (the car, S2, S3 x2), the shotgun (S1), the SMGs (S2), ammo on S3
  marker("copium-car", "pickup", [-2.2, 0, -1.2], { item: "copium", amount: 1 }),
  marker("shotgun-l1", "pickup", [12.2, 0, 0.1], { item: "shotgun" }),
  marker("copium-l2", "pickup", [-16.4, 0, 2.2], { item: "copium", amount: 1 }),
  marker("smgs-l2", "pickup", [-9.5, 0, -1.9], { item: "smgs" }),
  // the arsenal: two frags on the gallery floor, the rifle on the unfinished floor
  marker("grenades-l2", "pickup", [-10.4, 0, -1.3], { item: "grenade", amount: 2 }),
  marker("rifle-l3", "pickup", [-6.8, 0, 9.2], { item: "rifle" }),
  marker("copium-l3-a", "pickup", [-8.3, 0, 16.5], { item: "copium", amount: 1 }),
  marker("copium-l3-b", "pickup", [8.3, 0, 3.9], { item: "copium", amount: 1 }),
  marker("shells-l3", "pickup", [-7.6, 0, 8.6], { item: "shotgun_ammo" }),
  // out at the landings' far ends (reasons to leave the car): frags by the linen room, shells in the
  // back office's doorway, frags in the side room
  marker("grenades-l1", "pickup", [12.5, 0, 1.9], { item: "grenade", amount: 2 }),
  marker("shells-l2", "pickup", [-10.7, 0, -6.6], { item: "shotgun_ammo" }),
  marker("grenades-l3", "pickup", [-10.2, 0, 14.4], { item: "grenade", amount: 1 }),
  marker("smg-ammo-l3", "pickup", [3.6, 0, 12.0], { item: "smgs_ammo" }),
  // the way out: the S3 stairwell
  marker("exit-stairs", "exit", [7.2, 0, 16.6], {}, FACE_S),
  marker("trigger-exit", "trigger", [7.0, 1, 16.0], { action: "exit" }, 0, [3.2, 3, 2.0]),
  // lights: the car's caged bulb and a cool fill; sodium over the laundry, cool gallery spots, work lamps
  ...([
    ["car-fill", -1.2, 2.8, -0.6, "#cfd8ea", 4, 6], // (the caged bulb's light is RideView's: it dies with the cables)
    ["l1-a", 6.2, 2.5, -1.2, "#ffb266", 12, 9], ["l1-b", 10.6, 2.5, 0.6, "#ffb266", 12, 9],
    ["l2-a", -6, 3.0, -1.5, "#e4ecff", 11, 9], ["l2-b", -10, 3.0, -1.5, "#e4ecff", 11, 9], ["l2-c", -14, 3.0, -1.5, "#e4ecff", 11, 9], ["l2-stair", -19.2, 2.8, -4.2, "#ff2a1a", 3, 4],
    ["l1-fe", 9.9, 2.6, -6.0, "#ffb266", 5, 5], ["l1-linen", 11.4, 2.6, 4.6, "#ffb266", 6, 6],
    ["l2-office", -10.7, 3.0, -8.0, "#e4ecff", 6, 6], ["l2-coat", -14.5, 3.0, 4.3, "#e4ecff", 5, 6],
    ["l3-side", -11.3, 2.6, 12.6, "#ffd9a8", 8, 8], ["l3-svc", -3.7, 2.6, 18.7, "#ff2a1a", 3, 5],
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
  // (matte enough that the bulb and the camera's key light never blow out a wall next to the lens)
  carWall: tex(`${E}car_wall_steel.webp`, 2, { roughness: 0.78, metalness: 0.22 }),
  carCeil: tex(`${E}car_wall_steel.webp`, 2, { roughness: 0.85, metalness: 0.15 }),
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
  enterLine: "r4_enter", enterDelay: 1.5, clearLine: "r4_clear", tutorial: false,
  later: ["L1", "L1b", "L1c", "L1d", "roof", "L2", "L2b", "L2c", "L2d", "L3", "L3b", "L3w", "L3h", "L3c"],
  ride: {
    car: [-3, -3, 3, 3],
    hatch: [-0.5, 0],
    steps: [
      { t: 12 },
      { stop: "S1", side: "e", doors: ["door-e"], groups: ["L1", "L1b", "L1c", "L1d"], slow: true, checkpoint: "cp-s1",
        waves: [{ group: "L1b", down: 2, after: 9 }, { group: "L1c", down: 4, after: 16 }, { group: "L1d", down: 5, after: 21 }] },
      { t: 24, roof: 5, group: "roof" },
      { stop: "S2", side: "w", doors: ["door-w"], groups: ["L2", "L2b", "L2c", "L2d"], alert: true, checkpoint: "cp-s2",
        waves: [{ group: "L2b", down: 3, after: 10 }, { group: "L2c", down: 5, after: 16 }, { group: "L2d", down: 6, after: 23 }] },
      { t: 11, cables: 3.5 },
      { stop: "S3", side: "s", doors: ["door-s"], groups: ["L3", "L3b", "L3w", "L3h", "L3c"], pry: 2.0, alert: true, checkpoint: "cp-s3", last: true,
        waves: [{ group: "L3b", down: 3, after: 12 }, { group: "L3w", down: 3, after: 12 }, { group: "L3h", down: 6, after: 24, hatch: true }, { group: "L3c", down: 7, after: 32 }] },
    ],
  },
}, materials, solid, decor, markers);
