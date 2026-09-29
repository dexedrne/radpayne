// Writes public/levels/room7.json: room 7, the sky garden on top of the next tower (chapter 2). The
// starting point for hand-tuning in the editor (/?editor=room7); re-running it OVERWRITES the file.
//   node tools/room7.ts && npm run check-level room7
//
// Layout (metres; the greenhouse is x -24..24, z -18..18 under glass; he comes in off the bridge from the
// west, facing east):
//   the lawn            the main level (y 0): planters and benches (low), hedges and the tool shed (high),
//                       palm trunks, a gazebo in the south-east
//   the koi pit         x -8..8, z -6..6, 4 m down (the pond, stepping stones); a stair up each side (east:
//                       to the north edge, west: to the south edge); the pump corridor under the south lawn
//   the glass walkway   x -8..8, z -1.6..1.6 over the pit: it cracks when he steps onto its middle (or at
//                       16 down) and gives way 2.6 s later (sim/ch2/garden.ts)
//   the gallery         a walkway at y 3.2 along the north glass, stairs at both ends; a door at its middle
//                       to the service landing (wave B)
//   the service room    east (wave A and D); the bridge corridor west (wave E comes up behind him); the
//                       mast stair south (the way out, and wave D's heavy)
// Hostiles 34; a checkpoint at 15 down. Secrets: the tool shed (E; pin, copium), a loose panel behind the
// pond's waterfall (it breaks: the sawed-off, sniper rounds), the orchid shelf at the gallery's east end.
import { FACE_E, FACE_N, FACE_S, FACE_W, glow, marker, prim, tex, writeLevel, type V3 } from "./levelKit.ts";
import { RoomKit } from "./levels/kit2.ts";

const k = new RoomKit();
const PIT = -4;

// ---------------------------------------------------------------- floors (the lawn around the pit; the pit)
k.box("lawn-n", [-24, -4.5, -18], [24, 0, -6], "lawn");
k.box("lawn-w", [-24, -4.5, -6], [-8, 0, 6], "lawn");
k.box("lawn-e", [8, -4.5, -6], [24, 0, 6], "lawn");
k.box("lawn-s", [-24, -0.5, 6], [24, 0, 18], "lawn");
k.box("below-s-w", [-24, -4.5, 6], [-2, -0.5, 18], "stone");
k.box("below-s-e", [2, -4.5, 6], [24, -0.5, 18], "stone");
k.box("below-s-back", [-2, -4.5, 10.2], [2, -0.5, 18], "stone");
k.box("pit-floor", [-8, PIT - 0.5, -6], [8, PIT, 10.2], "pebbles");
// the waterfall's loose panel (north pit wall): a niche carved behind it
k.solid.splice(k.solid.findIndex(n => n.id === "lawn-n"), 1);
k.boxes.splice(k.boxes.findIndex(b => b.id === "lawn-n"), 1);
k.box("lawn-n", [-24, -0.5, -18], [24, 0, -6], "lawn");
k.box("below-n-w", [-24, -4.5, -18], [-3.4, -0.5, -6], "stone");
k.box("below-n-e", [-0.6, -4.5, -18], [24, -0.5, -6], "stone");
k.box("below-n-back", [-3.4, -4.5, -18], [-0.6, -0.5, -7.6], "stone");
k.box("below-n-top", [-3.4, -2, -7.6], [-0.6, -0.5, -6], "stone");
k.box("niche-panel", [-3.3, PIT, -6.1], [-0.7, -2, -5.95], "slate", { data: { breakable: 30, surface: "wood", secret: "secret-niche" } });
// the glass walkway (the stage takes it out)
for (let i = 0; i < 4; i++) k.box(`glass-${i + 1}`, [-8 + i * 4, -0.2, -1.6], [-4 + i * 4, 0, 1.6], "glassFloor", { data: { surface: "glass" } });
for (let i = 0; i <= 4; i++) k.deco(`glass-rib-${i}`, [-8.05 + i * 4, -0.25, -1.6], [-7.95 + i * 4, -0.02, 1.6], "brass");
k.deco("glass-edge-n", [-8, -0.25, -1.65], [8, 0.02, -1.55], "brass");
k.deco("glass-edge-s", [-8, -0.25, 1.55], [8, 0.02, 1.65], "brass");
// the rails round the pit (low; openings at the walkway and the stair tops)
k.box("rail-n", [-8, 0, -6.15], [6.1, 1.0, -6], "rail", { data: { shootThrough: true, surface: "metal" } });
k.box("rail-s", [-6.1, 0, 6], [8, 1.0, 6.15], "rail", { data: { shootThrough: true, surface: "metal" } });
k.box("rail-w1", [-8.15, 0, -6], [-8, 1.0, -1.6], "rail", { data: { shootThrough: true, surface: "metal" } });
k.box("rail-w2", [-8.15, 0, 1.6], [-8, 1.0, 6], "rail", { data: { shootThrough: true, surface: "metal" } });
k.box("rail-e1", [8, 0, -6], [8.15, 1.0, -1.6], "rail", { data: { shootThrough: true, surface: "metal" } });
k.box("rail-e2", [8, 0, 1.6], [8.15, 1.0, 6], "rail", { data: { shootThrough: true, surface: "metal" } });
k.stairs("st-e", 7.05, -6, "s", 13, 0.31, 0.75, 1.7, 0, "stone", PIT);
k.stairs("st-w", -7.05, 6, "n", 13, 0.31, 0.75, 1.7, 0, "stone", PIT);
// (rails on their open sides: into the pit only from the bottom step; lower under the walkway)
for (const [id, x0, x1, z0, z1, top] of [["st-e-r1", 6.05, 6.2, -6, -1.6, 1], ["st-e-r2", 6.05, 6.2, -1.6, 1.6, -0.3], ["st-e-r3", 6.05, 6.2, 1.6, 3.8, 1], ["st-w-r1", -6.2, -6.05, 1.6, 6, 1], ["st-w-r2", -6.2, -6.05, -1.6, 1.6, -0.3], ["st-w-r3", -6.2, -6.05, -3.8, -1.6, 1]] as const) {
  k.box(id, [x0, PIT, z0], [x1, top, z1], "rail", { data: { shootThrough: true, surface: "metal" } });
}
// the pond, the stones, the waterfall
k.deco("pond", [-5.5, PIT + 0.01, -4], [5.5, PIT + 0.05, 4.5], "pond");
for (const [x, z] of [[-3, -2], [-0.6, -0.4], [1.8, 1.4], [3.6, 3.2], [-4.2, 2.6]]) k.cover(`stone-${x}-${z}`, [x - 0.6, PIT, z - 0.5], [x + 0.6, PIT + 0.9, z + 0.5], "stoneBig");
k.deco("fall", [-5, PIT, -5.98], [5, -0.4, -5.9], "waterfall");
// the pump corridor under the south lawn (wave C comes out of it)
k.box("pump-ceil", [-2, -0.9, 6], [2, -0.5, 10.2], "stone");

// ---------------------------------------------------------------- the glass house
const GH = 9;
for (const [id, a, b] of [["wall-n", [-24, 0, -18.2], [24, GH, -18]], ["wall-s1", [-24, 0, 18], [-1.6, GH, 18.2]], ["wall-s2", [1.6, 0, 18], [24, GH, 18.2]], ["wall-w1", [-24.2, 0, -18], [-24, GH, -1.6]], ["wall-w2", [-24.2, 0, 1.6], [-24, GH, 18]], ["wall-e1", [24, 0, -18], [24.2, GH, 6]], ["wall-e2", [24, 0, 8.4], [24.2, GH, 18]]] as Array<[string, V3, V3]>) {
  k.box(id, a, b, "glassWall", { data: { surface: "glass" } });
}
k.box("wall-s-top", [-1.6, 2.8, 18], [1.6, GH, 18.2], "glassWall", { data: { surface: "glass" } });
k.box("wall-w-top", [-24.2, 3, -1.6], [-24, GH, 1.6], "glassWall", { data: { surface: "glass" } });
k.box("wall-e-top", [24, 2.8, 6], [24.2, GH, 8.4], "glassWall", { data: { surface: "glass" } });
for (let x = -24; x <= 24; x += 4) { k.deco(`mul-n-${x}`, [x - 0.06, 0, -18.25], [x + 0.06, GH, -17.95], "brass"); k.deco(`mul-s-${x}`, [x - 0.06, 0, 17.95], [x + 0.06, GH, 18.25], "brass"); }
for (let z = -18; z <= 18; z += 4) { k.deco(`mul-w-${z}`, [-24.25, 0, z - 0.06], [-23.95, GH, z + 0.06], "brass"); k.deco(`mul-e-${z}`, [23.95, 0, z - 0.06], [24.25, GH, z + 0.06], "brass"); }
k.deco("roof-glass", [-24, GH, -18], [24, GH + 0.05, 18], "glassRoof");
for (let x = -20; x <= 20; x += 8) k.deco(`roof-beam-${x}`, [x - 0.1, GH - 0.25, -18], [x + 0.1, GH, 18], "brass");
// the clouds outside (decor) and the ship above
k.deco("clouds", [-300, -60, -300], [300, -59, 300], "cloudSea");
k.deco("ship-hull", [-26, 20, 22], [26, 30, 40], "shipHull");

// ---------------------------------------------------------------- the gallery (north, y 3.2)
const GY = 3.2;
k.box("gal-deck", [-20, GY - 0.2, -17.9], [20, GY, -13.2], "wood", { data: { surface: "wood" } });
for (let x = -16; x <= 16; x += 8) k.box(`gal-post-${x}`, [x - 0.25, 0, -13.5], [x + 0.25, GY - 0.2, -13], "brass", { data: { surface: "metal" } });
k.box("gal-rail", [-20, GY, -13.3], [20, GY + 1.0, -13.15], "rail", { data: { shootThrough: true, surface: "metal" } });
k.stairs("gal-st-w", -20.8, -13.2, "s", 11, 0.29, 0.75, 1.6, GY, "wood");
k.stairs("gal-st-e", 20.8, -13.2, "s", 11, 0.29, 0.75, 1.6, GY, "wood");
// (the stairs' own rails)
k.box("gal-st-w-rail", [-21.75, 0, -13.2], [-21.6, 1.0 + GY, -5], "rail", { data: { shootThrough: true } });
k.box("gal-st-e-rail", [21.6, 0, -13.2], [21.75, 1.0 + GY, -5], "rail", { data: { shootThrough: true } });
k.box("gal-st-w-rail2", [-20, 0, -13.2], [-19.85, 1.0 + GY, -5], "rail", { data: { shootThrough: true } });
k.box("gal-st-e-rail2", [19.85, 0, -13.2], [20, 1.0 + GY, -5], "rail", { data: { shootThrough: true } });
// the service landing behind the north glass at gallery height (wave B)
k.box("sl-floor", [-2.5, GY - 0.2, -22], [2.5, GY, -18.2], "wood");
k.box("sl-w", [-2.7, GY, -22], [-2.5, GY + 3, -18.2], "stone");
k.box("sl-e", [2.5, GY, -22], [2.7, GY + 3, -18.2], "stone");
k.box("sl-back", [-2.7, GY, -22.2], [2.7, GY + 3, -22], "stone");
k.box("sl-roof", [-2.7, GY + 3, -22.2], [2.7, GY + 3.2, -18.2], "stone");
// its door through the north glass (open: a gap in wall-n)
k.solid.splice(k.solid.findIndex(n => n.id === "wall-n"), 1);
k.boxes.splice(k.boxes.findIndex(b => b.id === "wall-n"), 1);
k.box("wall-n1", [-24, 0, -18.2], [-1.2, GH, -18], "glassWall", { data: { surface: "glass" } });
k.box("wall-n2", [1.2, 0, -18.2], [24, GH, -18], "glassWall", { data: { surface: "glass" } });
k.box("wall-n-low", [-1.2, 0, -18.2], [1.2, GY, -18], "glassWall", { data: { surface: "glass" } });
k.box("wall-n-top", [-1.2, GY + 2.5, -18.2], [1.2, GH, -18], "glassWall", { data: { surface: "glass" } });
// the orchid shelf (a secret at the gallery's east end)
k.cover("orchids", [16, GY, -15.6], [19.6, GY + 0.95, -15], "planter", {}, { faces: ["s"] });

// ---------------------------------------------------------------- the service room (east), the bridge (west), the mast stair (south)
k.box("sr-floor", [24.2, -0.5, 2], [30, 0, 12], "stone");
k.box("sr-n", [24.2, 0, 2], [30, 3.2, 2.2], "stone");
k.box("sr-s", [24.2, 0, 11.8], [30, 3.2, 12], "stone");
k.box("sr-e", [29.8, 0, 2], [30, 3.2, 12], "stone");
k.box("sr-roof", [24.2, 3.2, 2], [30, 3.4, 12], "stone");
k.cover("sr-crates", [27.4, 0, 3], [29.4, 1.2, 5], "crate", { data: { surface: "wood" } }, { faces: ["w"] });
k.box("br-floor", [-36, -0.5, -1.6], [-24.2, 0, 1.6], "bridgeGlass", { data: { surface: "glass" } });
k.box("br-n", [-36, 0, -1.8], [-24.2, 3, -1.6], "bridgeGlass", { hidden: true, data: { surface: "glass", camera: true } });
k.box("br-s", [-36, 0, 1.6], [-24.2, 3, 1.8], "bridgeGlass", { hidden: true, data: { surface: "glass", camera: true } });
k.box("br-end", [-36.2, 0, -1.8], [-36, 3, 1.8], "stone");
k.deco("br-roof", [-36, 3, -1.8], [-24.2, 3.1, 1.8], "bridgeGlass");
k.box("ms-floor", [-3, -0.5, 18.2], [3, 0, 26], "stone");
k.box("ms-w", [-3.2, 0, 18.2], [-3, 4, 26], "stone");
k.box("ms-e", [3, 0, 18.2], [3.2, 4, 26], "stone");
k.box("ms-back", [-3.2, 0, 26], [3.2, 4, 26.2], "stone");
k.deco("ms-spiral", [-1, 0, 23.5], [1, 4, 25.5], "brass");

// ---------------------------------------------------------------- the garden's cover
for (const [id, x, z, w, d] of [["p1", -16, -9, 4, 1.2], ["p2", -16, 9.5, 4, 1.2], ["p3", 14, -9, 4, 1.2], ["p4", 12.2, 9, 1.2, 3], ["p5", -13.5, 3.8, 1.2, 2.4], ["p6", -13.5, -3.8, 1.2, 2.4], ["p7", 13, 3.8, 1.2, 2.4], ["p8", 13, -3.8, 1.2, 2.4], ["p9", -4, 12.5, 3.2, 1.2], ["p10", 4.5, -10, 3.2, 1.2], ["p11", 20, 0, 1.2, 3.2], ["p12", -20, -4, 1.2, 2.4]] as const) {
  k.cover(`planter-${id}`, [x - w / 2, 0, z - d / 2], [x + w / 2, 0.9, z + d / 2], "planter");
  k.deco(`plants-${id}`, [x - w / 2 + 0.1, 0.9, z - d / 2 + 0.1], [x + w / 2 - 0.1, 1.5, z + d / 2 - 0.1], "leaves");
}
k.cover("hedge-1", [-12, 0, -15.5], [-8, 1.9, -14.5], "hedge");
k.cover("hedge-2", [19.5, 0, 12], [20.5, 1.9, 16], "hedge");
k.cover("hedge-3", [3, 0, 12.5], [7, 1.9, 13.5], "hedge");
k.cover("hedge-4", [-8, 0, -11.5], [-4, 1.9, -10.5], "hedge");
for (const [x, z] of [[-10, -10], [10, 11], [-18, 14.5], [18, -8], [-2.5, 14.5], [10.5, -14.5], [-11, 11]]) {
  k.cover(`palm-${x}-${z}`, [x - 0.25, 0, z - 0.25], [x + 0.25, 6, z + 0.25], "trunk", { data: { surface: "wood" } });
  k.decor.push(prim(`frond-${x}-${z}`, "sphere", [x, 6.4, z], [1.8, 10, 6], "leaves"));
}
for (const [id, x, z] of [["b1", -10.5, 15.5], ["b2", 10.5, -16.5], ["b3", 0, 9]] as const) k.cover(`bench-${id}`, [x - 1.1, 0, z - 0.35], [x + 1.1, 0.6, z + 0.35], "wood", { data: { surface: "wood" } });
// the gazebo (SE): four posts, a roof, a table
for (const [x, z] of [[14, 11.5], [18.5, 11.5], [14, 16], [18.5, 16]]) k.box(`gz-post-${x}-${z}`, [x - 0.15, 0, z - 0.15], [x + 0.15, 3, z + 0.15], "whiteWood", { data: { surface: "wood" } });
k.deco("gz-roof", [13.4, 3, 11], [19.1, 3.3, 16.5], "whiteWood");
k.cover("gz-table", [15.4, 0, 13], [17.1, 0.8, 14.5], "whiteWood", { data: { surface: "wood" } });
// the tool shed (SW, hollow; a secret door on its east face)
k.box("sh-w", [-22, 0, 11], [-21.85, 2.6, 15], "shed");
k.box("sh-n", [-22, 0, 11], [-18, 2.6, 11.15], "shed");
k.box("sh-s", [-22, 0, 14.85], [-18, 2.6, 15], "shed");
k.box("sh-e1", [-18.15, 0, 11], [-18, 2.6, 12.2], "shed");
k.box("sh-e2", [-18.15, 0, 13.8], [-18, 2.6, 15], "shed");
k.box("sh-e-top", [-18.15, 2.2, 12.2], [-18, 2.6, 13.8], "shed");
k.box("sh-roof", [-22.1, 2.6, 10.9], [-17.9, 2.8, 15.1], "shedRoof");
k.box("sh-door", [-18.12, 0, 12.2], [-18.03, 2.2, 13.8], "shedDoor", { data: { secretDoor: "shed", open: "swing", hinge: "left", surface: "wood" } });

// ---------------------------------------------------------------- secrets, waypoints
k.volume("secret-shed", "secret", [-21.85, 0, 11.15], [-18.15, 2.2, 14.85], { name: "the tool shed" });
k.volume("secret-niche", "secret", [-3.3, PIT, -7.5], [-0.7, -2, -6], { name: "behind the waterfall", via: "break" });
k.volume("secret-orchids", "secret", [16, GY, -17.8], [20, GY + 2, -15.6], { name: "the orchid shelf" });
const inPit = (x: number, z: number) => x > -8.4 && x < 8.4 && z > -6.4 && z < 6.4;
k.grid("lawn", -22, 22, -16, 16, 4, 0, (x, z) => inPit(x, z) || (x < -17.5 && x > -22.5 && z > 10.5 && z < 15.5));
k.grid("pit", -6.5, 5.5, -4.5, 4.5, 3, PIT);
k.wp("pump-in", [0, PIT, 8.6], ["pump-out"]);
k.wp("pump-out", [0, PIT, 5.4], ["pump-in"]);
k.wp("wk-w", [-6, 0, 0]);
k.wp("wk-c", [0, 0, 0]);
k.wp("wk-e", [6, 0, 0]);
k.wp("st-e-top", [7.05, 0, -7.2], ["st-e-mid"]);
k.wp("st-e-mid", [7.05, -2.1, -0.8], ["st-e-top", "st-e-bot"], { solo: true });
k.wp("st-e-bot", [7.05, PIT, 4.6], ["st-e-mid"]);
k.wp("st-w-top", [-7.05, 0, 7.2], ["st-w-mid"]);
k.wp("st-w-mid", [-7.05, -2.1, 0.8], ["st-w-top", "st-w-bot"], { solo: true });
k.wp("st-w-bot", [-7.05, PIT, -4.6], ["st-w-mid"]);
k.wp("gal-w-bot", [-20.8, 0, -4], ["gal-w-mid"]);
k.wp("gal-w-mid", [-20.8, 1.7, -9.2], ["gal-w-bot", "gal-w"]);
k.wp("gal-w", [-18.5, GY, -15.5], ["gal-w-mid", "gal-c"]);
k.wp("gal-c", [0, GY, -15.5], ["gal-w", "gal-e", "sl-in"]);
k.wp("gal-e", [15, GY, -14.2], ["gal-c", "gal-e-mid"]);
k.wp("gal-e-mid", [20.8, 1.7, -9.2], ["gal-e", "gal-e-bot"]);
k.wp("gal-e-bot", [20.8, 0, -4], ["gal-e-mid"]);
k.wp("sl-in", [0, GY, -20], ["gal-c"]);
k.wp("sr-in", [26, 0, 7.2], ["sr-out", "sr-mid"]);
k.wp("sr-out", [22.4, 0, 7.2], ["sr-in"]);
k.wp("sr-mid", [28, 0, 9.6], ["sr-in"]);
k.wp("br-1", [-26, 0, 0], ["br-2", "br-3"]);
k.wp("br-2", [-22, 0, 0], ["br-1"]);
k.wp("br-3", [-33, 0, 0], ["br-1"]);
k.wp("ms-in", [0, 0, 20.5], ["ms-out"]);
k.wp("ms-out", [0, 0, 16.2], ["ms-in"]);
k.wp("sh-in", [-20, 0, 13], ["sh-out"], { door: "sh-door" });
k.wp("sh-out", [-16.6, 0, 13], ["sh-in"]);

// ---------------------------------------------------------------- the gang (34)
const E = (id: string, x: number, y: number, z: number, yaw: number, d: Record<string, unknown> = {}) => marker(id, "enemy", [x, y, z], { kind: "goon", ...d }, yaw);
k.m(
  // at the garden party
  E("g-1", -11, 0, -7, FACE_W), E("g-2", -11, 0, 8, FACE_W), E("g-3", 11, 0, -6.5, FACE_W), E("g-4", 16, 0, 5, FACE_W, { minDiff: "hard" }),
  E("g-5", 2, 0, 0, FACE_W), E("g-6", -3, 0, 0.5, FACE_W, { kind: "rusher" }),
  E("g-7", -8, GY, -15, FACE_S, { perch: true, weapon: "sniper" }), E("g-8", 8, GY, -15, FACE_S, { minDiff: "hard" }),
  E("pond-1", -2, PIT, 5, FACE_N), E("pond-2", 4, PIT, -2.6, FACE_W, { minDiff: "hard" }),
  // wave A (5 down): the service room, east
  E("a-1", 26, 0, 5, FACE_W, { group: "waveA" }), E("a-2", 26, 0, 9.6, FACE_W, { group: "waveA" }), E("a-3", 28.4, 0, 7, FACE_W, { group: "waveA", kind: "rusher" }),
  E("a-4", 25.6, 0, 11, FACE_W, { group: "waveA", minDiff: "hard" }), E("a-5", 28.6, 0, 10.6, FACE_W, { group: "waveA", kind: "rusher", minDiff: "hard" }),
  // wave B (10 down): the service landing, onto the gallery
  E("b-1", -1.2, GY, -19.4, FACE_S, { group: "waveB", weapon: "sniper", minDiff: "hard" }), E("b-2", 1.2, GY, -19.4, FACE_S, { group: "waveB" }), E("b-3", -1.2, GY, -21, FACE_S, { group: "waveB", kind: "rusher" }), E("b-4", 1.2, GY, -21, FACE_S, { group: "waveB", minDiff: "hard" }),
  // wave C (15 down): out of the pump corridor into the pit
  E("c-1", -1, PIT, 8.4, FACE_N, { group: "waveC", kind: "rusher" }), E("c-2", 1, PIT, 8.4, FACE_N, { group: "waveC", kind: "rusher", minDiff: "hard" }), E("c-3", -1, PIT, 9.6, FACE_N, { group: "waveC" }),
  E("c-4", 1, PIT, 9.6, FACE_N, { group: "waveC", kind: "rusher", minDiff: "hard" }), E("c-5", 0, PIT, 7.2, FACE_N, { group: "waveC" }),
  // wave D (20 down): the mast stair (the heavy) and the service room
  E("d-1", 0, 0, 22, FACE_N, { group: "waveD", kind: "heavy", model: "rival723" }), E("d-2", -1.6, 0, 24, FACE_N, { group: "waveD" }), E("d-3", 1.6, 0, 24, FACE_N, { group: "waveD", minDiff: "hard" }),
  E("d-4", 27.6, 0, 6, FACE_W, { group: "waveD", kind: "rusher" }), E("d-5", 27.6, 0, 8.6, FACE_W, { group: "waveD", minDiff: "hard" }),
  // wave E (25 down): up the bridge behind him, and the gallery
  E("e-1", -32, 0, -0.6, FACE_E, { group: "waveE", kind: "rusher" }), E("e-2", -33.5, 0, 0.6, FACE_E, { group: "waveE", kind: "rusher", minDiff: "hard" }), E("e-3", -30.5, 0, 0.6, FACE_E, { group: "waveE" }),
  E("e-4", -1.2, GY, -20.4, FACE_S, { group: "waveE2", kind: "heavy", model: "rival652" }), E("e-5", 1.2, GY, -20.4, FACE_S, { group: "waveE2" }),
);

// ---------------------------------------------------------------- triggers, pickups, eggs, lights
const T = (id: string, pos: V3, data: Record<string, unknown>, scale: V3 = [1, 1, 1]) => marker(id, "trigger", pos, data, 0, scale);
k.m(
  marker("spawn", "spawn", [-22, 0, 0], {}, FACE_E),
  marker("cp-mid", "checkpoint", [-17, 0, 0], {}, FACE_E),
  T("t-alert", [-20, 1, 0], { action: "alert" }, [3, 3, 34]),
  T("t-crack-step", [0, 1, 0], { action: "setpiece", cue: "crack" }, [4, 3, 3.2]),
  T("t-crack-kills", [0, 1, 0], { action: "setpiece", cue: "crack", afterKills: { normal: 12, hard: 16 } }),
  T("t-waveA", [0, 1, 0], { action: "spawn", group: "waveA", afterKills: { normal: 4, hard: 5 } }),
  T("t-waveB", [0, 1, 0], { action: "spawn", group: "waveB", afterKills: { normal: 7, hard: 10 } }),
  T("t-cp", [0, 1, 0], { action: "checkpoint", at: "cp-mid", afterKills: { normal: 10, hard: 15 } }),
  T("t-waveC", [0, 1, 0], { action: "spawn", group: "waveC", afterKills: { normal: 10, hard: 15 } }),
  T("t-waveD", [0, 1, 0], { action: "spawn", group: "waveD", afterKills: { normal: 13, hard: 20 } }),
  T("t-waveE", [0, 1, 0], { action: "spawn", group: "waveE", afterKills: { normal: 16, hard: 25 } }),
  T("t-waveE2", [0, 1, 0], { action: "spawn", group: "waveE2", afterKills: { normal: 18, hard: 27 } }),
  T("t-exit", [0, 1, 22.5], { action: "exit" }, [5, 3, 5]),
  marker("exit", "exit", [0, 0, 19]),
  marker("cop-1", "pickup", [-22.5, 0, -8], { item: "copium" }), marker("cop-2", "pickup", [0, PIT, 3], { item: "copium" }),
  marker("cop-3", "pickup", [16.2, 0, 15], { item: "copium" }), marker("cop-4", "pickup", [11, 0, -12.5], { item: "copium" }),
  marker("cop-5", "pickup", [-17, 0, -2], { item: "copium" }), marker("cop-6", "pickup", [4, 0, 15], { item: "copium" }),
  marker("smgs", "pickup", [0, 0, 10.2], { item: "smgs" }),
  marker("rifle", "pickup", [-14, GY, -16.5], { item: "rifle" }),
  marker("nades", "pickup", [22.5, 0, -2], { item: "grenade", amount: 2 }),
  marker("pin-g4764", "pickup", [-21, 0, 12.2], { item: "pin", pin: "g4764", behind: "sh-door" }),
  marker("sh-copium", "pickup", [-20.2, 0, 14], { item: "copium", amount: 2, behind: "sh-door" }),
  marker("niche-sawed", "pickup", [-2.4, PIT, -6.8], { item: "sawedoff", behind: "niche-panel" }),
  marker("niche-ammo", "pickup", [-1.4, PIT, -6.9], { item: "sniper_ammo", amount: 10, behind: "niche-panel" }),
  marker("orchid-copium", "pickup", [18, GY, -16.8], { item: "copium", amount: 2 }),
  marker("orchid-ammo", "pickup", [19.2, GY, -17.2], { item: "rifle_ammo", amount: 30 }),
  marker("egg-koi", "egg", [2.2, PIT + 0.1, -2.2], { egg: "koi", interact: true }),
  marker("egg-poster", "egg", [29.78, 1.7, 7], { egg: "poster-solscape" }, FACE_W),
  ...([
    ["sun-1", -12, 7, -8, "#ffd9a8", 8, 20], ["sun-2", 12, 7, 8, "#ffd9a8", 8, 20], ["pit", 0, PIT + 3, 0, "#7fe0c0", 6, 12], ["fall", 0, PIT + 1.5, -5, "#8ff0e0", 4, 7],
    ["gal", 0, GY + 2, -15.5, "#ffcf90", 6, 14], ["gz", 16.2, 2.8, 13.7, "#ffcf90", 4, 7], ["sr", 27, 2.8, 7, "#ffb870", 4, 8], ["ms", 0, 3.4, 22, "#ffb870", 4, 8],
    ["br", -28, 2.4, 0, "#8fc0ff", 4, 9], ["pump", 0, PIT + 2.5, 8, "#ffcf90", 3, 6], ["shed", -20, 2, 13, "#ffc07a", 2, 4],
  ] as Array<[string, number, number, number, string, number, number]>).map(([id, x, y, z, color, intensity, distance]) => marker(`light-${id}`, "light", [x, y, z], { color, intensity, distance })),
  marker("cam-garden", "camera", [-20, 3, 6], { at: [6, 1, -4] }),
  marker("cam-pit", "camera", [-10, 2.5, 4], { at: [0, PIT, 0] }),
  marker("cam-gallery", "camera", [4, 2, 4], { at: [0, GY + 1, -15] }),
);

// ---------------------------------------------------------------- materials
const S = "/textures/", E2 = "/textures/elevator/", B = "/textures/backrooms/", C = "/textures/club/";
const materials: Record<string, Record<string, unknown>> = {
  lawn: tex(`${C}carpet_vip.webp`, 3, { roughness: 0.95, color: "#5f8a5a" }),
  stone: tex(`${E2}marble_grey.webp`, 3, { roughness: 0.6 }),
  stoneBig: tex(`${E2}concrete_bare.webp`, 1.5, { roughness: 0.8, color: "#8a8f86" }),
  pebbles: tex(`${E2}concrete_bare.webp`, 2, { roughness: 0.9, color: "#6d7270" }),
  slate: tex(`${E2}shaft_concrete.webp`, 1.5, { roughness: 0.8, color: "#6a7a7a" }),
  glassFloor: { color: "#bfe6f0", roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35 },
  glassWall: { color: "#a8d0d8", roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.16 },
  glassRoof: { color: "#a8d0d8", roughness: 0.05, transparent: true, opacity: 0.12 },
  bridgeGlass: { color: "#8fb6d8", roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.3 },
  brass: { color: "#b08a4a", roughness: 0.3, metalness: 0.85 },
  rail: { color: "#8a6a3a", roughness: 0.35, metalness: 0.7 },
  pond: glow("#1f6f6a", 0.7),
  waterfall: glow("#9ff0ff", 0.55, "flicker"),
  wood: tex(`${B}wood_desk.webp`, 1.5, { roughness: 0.6 }),
  whiteWood: { color: "#e9e4da", roughness: 0.7 },
  planter: tex(`${E2}concrete_bare.webp`, 1.2, { roughness: 0.8, color: "#b8b2a4" }),
  leaves: { color: "#2f6a3a", roughness: 0.9 },
  hedge: { color: "#2a5a30", roughness: 0.95 },
  trunk: { color: "#6a5238", roughness: 0.9 },
  shed: tex(`${B}wood_desk.webp`, 1, { roughness: 0.8, color: "#9a8a70" }),
  shedRoof: { color: "#3a4a3a", roughness: 0.8 },
  shedDoor: tex(`${B}wood_desk.webp`, 1, { roughness: 0.8, color: "#7a6a50" }),
  crate: tex(`${B}boxes_cardboard.webp`, 0.6, { roughness: 0.9 }),
  cloudSea: glow("#c8d4e8", 0.55, "", `${S}puddles.webp`),
  shipHull: { color: "#3a3f4a", roughness: 0.6, metalness: 0.3 },
};

writeLevel("room7", "Room 7: the sky garden", {
  name: "The Sky Garden", next: "room8", cutsceneAfter: "ch2c", music: "garden", look: "garden", footsteps: "hard", tutorial: false, chapter: 2, maxRise: 1.2,
  enterLine: "r7_enter", clearLine: "r7_clear",
  floorY: 4,
  stage: { kind: "garden", glass: ["glass-1", "glass-2", "glass-3", "glass-4"], cue: "crack", area: [-8, -1.6, 8, 1.6] },
}, materials, k.solid, k.decor, k.clean().shift(4).markers);
void FACE_N;
