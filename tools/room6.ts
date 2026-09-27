// Writes public/levels/room6.json: chapter 2's first room, the tower's roof in the storm. The starting
// point for hand-tuning in the editor (/?editor=room6); re-running it OVERWRITES the file.
//   node tools/room6.ts && npm run check-level room6
//
// Layout (metres; north = -Z; the roof is x -30..30, z -22..22 behind a 1.1 m parapet with a tall
// invisible fence on it; he comes out of the west stairwell facing east):
//   the west stairwell   x -29.6..-24, z -3..3 (hollow: the last wave comes up it behind him)
//   the helipad          x -7..7, z -20..-8, 1 m up, steps on its south and east sides: the helicopter
//                        lowers two squads onto it on ropes (the stage's drops)
//   the water tower      SW, a walkway at y 4 around the tank, a stair up its north-east corner: two
//                        snipers on it (and the sniper rifle for whoever climbs it)
//   the billboard        E, a catwalk at y 3 along x 25.5..28 (a stair at its south end): a sniper; its
//                        north end is a secret (the hand cannon, a pin)
//   the machine room     NE, hollow, its door on the south wall: waves A and C; a steel panel inside
//                        (E) opens on a closet (a secret: a pin, copium)
//   the south-east stair x 20..27, z 13..21.6, hollow, its door on the west wall: wave B
//   cover                HVAC units (high), vents, ducts, a skylight (low), the antenna mast
//   the exit             the glass bridge through the east parapet at z 0
// Hostiles 32 over six waves from five places (the helicopter's two drops among them); a checkpoint at
// 14 down. The searchlight patrols until the gang is awake, then follows him (sim/ch2/roof.ts).
import { FACE_E, FACE_N, FACE_S, FACE_W, glow, marker, prim, tex, writeLevel } from "./levelKit.ts";
import { RoomKit } from "./levels/kit2.ts";

const k = new RoomKit();
const PH = 1.1;

// ---------------------------------------------------------------- the roof, the parapet, the void
k.box("floor", [-30, -0.5, -22], [30, 0, 22], "roof");
k.box("parapet-n", [-30, 0, -22], [30, PH, -21.6], "parapet");
k.box("parapet-s", [-30, 0, 21.6], [30, PH, 22], "parapet");
k.box("parapet-w", [-30, 0, -21.6], [-29.6, PH, 21.6], "parapet");
k.box("parapet-e1", [29.6, 0, -21.6], [30, PH, -1.6], "parapet");
k.box("parapet-e2", [29.6, 0, 1.6], [30, PH, 21.6], "parapet");
for (const [id, a, b] of [["fence-n", [-30, PH, -22], [30, 4, -21.6]], ["fence-s", [-30, PH, 21.6], [30, 4, 22]], ["fence-w", [-30, PH, -21.6], [-29.6, 4, 21.6]], ["fence-e1", [29.6, PH, -21.6], [30, 4, -1.6]], ["fence-e2", [29.6, PH, 1.6], [30, 4, 21.6]]] as const) {
  k.box(id, a as never, b as never, "roof", { hidden: true, data: { shootThrough: true } });
}
for (let i = 0; i < 10; i++) k.decor.push(box2(`cap-n-${i}`, [-30 + i * 6, PH, -22.05], [-24 + i * 6, PH + 0.08, -21.55], "capstone"), box2(`cap-s-${i}`, [-30 + i * 6, PH, 21.55], [-24 + i * 6, PH + 0.08, 22.05], "capstone"));
// the city far below and the towers around (decor)
k.decor.push(box2("void", [-200, -120, -200], [200, -119, 200], "cityGlow"));
for (const [id, x, z, w, h] of [["tw1", -70, -60, 24, 30], ["tw2", 60, -70, 30, 50], ["tw3", 80, 20, 26, 12], ["tw4", -80, 40, 30, 22], ["tw5", 10, 90, 40, 40], ["tw6", -40, -110, 30, 60]] as const) {
  k.decor.push(box2(`tower-${id}`, [x - w / 2, -120, z - w / 2], [x + w / 2, h, z + w / 2], "towerFar"));
}
// the next tower (the garden's), east, and the glass bridge to it
k.decor.push(box2("tower-next", [52, -120, -16], [84, 12, 16], "towerNext"));
k.decor.push(box2("garden-glow", [54, 12, -14], [82, 22, 14], "gardenGlass"));
k.box("bridge-floor", [30, -0.5, -1.6], [52, 0, 1.6], "bridgeGlass", { data: { surface: "glass" } });
k.box("bridge-wall-n", [30, 0, -1.8], [52, 3, -1.6], "bridgeGlass", { hidden: true, data: { surface: "glass", camera: true } });
k.box("bridge-wall-s", [30, 0, 1.6], [52, 3, 1.8], "bridgeGlass", { hidden: true, data: { surface: "glass", camera: true } });
for (let i = 0; i <= 11; i++) k.decor.push(box2(`bridge-rib-${i}`, [30.2 + i * 2, 0, -1.8], [30.35 + i * 2, 3.1, 1.8], "steelDark"));
k.decor.push(box2("bridge-roof", [30, 3.0, -1.8], [52, 3.1, 1.8], "bridgeGlass"), box2("bridge-strip", [30, 0.01, -0.1], [52, 0.02, 0.1], "stripBlue"));

// ---------------------------------------------------------------- the west stairwell (hollow)
k.box("sw-w", [-29.6, 0, -3.2], [-29.4, 3.4, 3.2], "block");
k.box("sw-n", [-29.6, 0, -3.2], [-24, 3.4, -3], "block");
k.box("sw-s", [-29.6, 0, 3], [-24, 3.4, 3.2], "block");
k.box("sw-e1", [-24.2, 0, -3.2], [-24, 3.4, -1.2], "block");
k.box("sw-e2", [-24.2, 0, 1.2], [-24, 3.4, 3.2], "block");
k.box("sw-lintel", [-24.2, 2.4, -1.2], [-24, 3.4, 1.2], "block");
k.box("sw-roof", [-29.8, 3.4, -3.4], [-23.8, 3.6, 3.4], "roofDark");
k.decor.push(box2("sw-stairs", [-29.3, 0, -2.8], [-27, 1.4, 2.8], "stairEdge"), box2("sw-lamp", [-24.3, 2.55, -0.25], [-24.1, 2.75, 0.25], "lampCage"));

// ---------------------------------------------------------------- the helipad (1 m up)
k.cover("pad", [-7, 0, -20], [7, 1.0, -8], "pad", {}, { faces: ["s", "e", "w"] });
k.stairs("pad-steps-s", 0, -8, "s", 3, 0.33, 0.6, 4, 1.0, "padEdge");
k.stairs("pad-steps-e", 7, -14, "e", 3, 0.33, 0.6, 4, 1.0, "padEdge");
k.decor.push(prim("pad-ring", "cylinder", [0, 1.004, -14], [4.6, 4.6, 0.01, 40], "padRing"), prim("pad-ring-in", "cylinder", [0, 1.006, -14], [4.2, 4.2, 0.01, 40], "pad"));
k.decor.push(box2("pad-h1", [-1.8, 1.008, -16.2], [-1.2, 1.012, -11.8], "padMark"), box2("pad-h2", [1.2, 1.008, -16.2], [1.8, 1.012, -11.8], "padMark"), box2("pad-h3", [-1.2, 1.008, -14.3], [1.2, 1.012, -13.7], "padMark"));
for (const [x, z] of [[-6.8, -19.8], [6.8, -19.8], [-6.8, -8.2], [6.8, -8.2], [0, -19.8], [-6.8, -14], [6.8, -14]]) k.decor.push(prim(`pad-light-${x}-${z}`, "sphere", [x, 1.08, z], [0.09, 8, 6], "padLamp"));
// a low wind screen on the pad's north edge (cover up there)
k.cover("pad-screen", [-5, 1.0, -20], [5, 2.0, -19.5], "steelDark", {}, { faces: ["s"] });

// ---------------------------------------------------------------- the water tower (SW)
k.box("wt-deck", [-18, 3.7, 9], [-10, 4.0, 17], "grate", { data: { surface: "metal" } });
for (const [x, z] of [[-18, 9], [-10.5, 9], [-18, 16.5], [-10.5, 16.5]]) k.box(`wt-leg-${x}-${z}`, [x, 0, z], [x + 0.5, 3.7, z + 0.5], "steelDark", { data: { surface: "metal" } });
k.cover("wt-tank", [-16.5, 4.0, 10.5], [-11.5, 8.5, 15.5], "tank", { hidden: true, data: { surface: "wood", camera: true } }, { faces: ["n", "e"] });
k.decor.push(prim("wt-tank-v", "cylinder", [-14, 6.3, 13], [2.9, 2.9, 4.6, 24], "tankWood"), prim("wt-roof", "cylinder", [-14, 9.2, 13], [0.2, 3.1, 1.4, 24], "roofDark"));
k.box("wt-rail-e", [-10.1, 4.0, 10.6], [-10, 5.0, 17], "steelDark", { data: { shootThrough: true, surface: "metal" } });
k.box("wt-rail-s", [-18, 4.0, 16.9], [-10, 5.0, 17], "steelDark", { data: { shootThrough: true, surface: "metal" } });
k.box("wt-rail-w", [-18, 4.0, 9], [-17.9, 5.0, 17], "steelDark", { data: { shootThrough: true, surface: "metal" } });
k.stairs("wt-stair", -10, 9.8, "e", 12, 0.31, 0.45, 1.6, 4.0, "grate");

// ---------------------------------------------------------------- the billboard catwalk (E)
k.box("bb-deck", [25.5, 2.8, -10], [28, 3.0, 6], "grate", { data: { surface: "metal" } });
for (const z of [-10, -4, 2, 5.5]) k.box(`bb-leg-${z}`, [27.4, 0, z], [27.9, 2.8, z + 0.5], "steelDark", { data: { surface: "metal" } });
k.box("bb-rail", [25.5, 3.0, -10], [25.6, 4.0, 6], "steelDark", { data: { shootThrough: true, surface: "metal" } });
k.stairs("bb-stair", 26.5, 6, "s", 10, 0.3, 0.45, 2, 3.0, "grate");
k.decor.push(box2("bb-panel", [28.4, 3.0, -10.5], [28.6, 9.5, 6.5], "billboard"), box2("bb-frame-top", [28.3, 9.5, -10.6], [28.7, 9.7, 6.6], "steelDark"));
for (const z of [-8, -2, 4]) k.decor.push(box2(`bb-lamp-${z}`, [27.9, 3.6, z - 0.3], [28.2, 3.8, z + 0.3], "lampWarm"));

// ---------------------------------------------------------------- the machine room (NE, hollow) + the closet
k.box("mr-n", [14, 0, -21.6], [26, 4.2, -21.4], "block");
k.box("mr-e", [25.8, 0, -21.6], [26, 4.2, -13], "block");
k.box("mr-w", [14, 0, -21.6], [14.2, 4.2, -13], "block");
k.box("mr-s1", [14, 0, -13.2], [18, 4.2, -13], "block");
k.box("mr-s2", [20.4, 0, -13.2], [26, 4.2, -13], "block");
k.box("mr-lintel", [18, 2.6, -13.2], [20.4, 4.2, -13], "block");
k.box("mr-roof", [13.8, 4.2, -21.8], [26.2, 4.4, -12.8], "roofDark");
k.cover("mr-motor-1", [16, 0, -20.5], [19, 1.6, -18.5], "machine", { data: { surface: "metal" } }, { faces: ["s"] });
k.cover("mr-motor-2", [21.5, 0, -20.5], [24.5, 1.6, -18.5], "machine", { data: { surface: "metal" } }, { faces: ["s"] });
k.decor.push(box2("mr-lamp", [18.9, 2.7, -12.99], [19.5, 2.9, -12.9], "lampCage"));
// the closet west of it, through a steel panel in its west wall (E opens it)
k.box("mr-w-top", [14, 2.4, -18], [14.2, 4.2, -16.2], "block");
k.box("cl-n", [11.2, 0, -18.2], [14, 2.6, -18], "block");
k.box("cl-s", [11.2, 0, -16.2], [14, 2.6, -16], "block");
k.box("cl-w", [11, 0, -18.2], [11.2, 2.6, -16], "block");
k.box("cl-roof", [11, 2.6, -18.2], [14, 2.8, -16], "roofDark");
k.box("cl-panel", [14.02, 0, -18], [14.18, 2.4, -16.2], "steelPanel", { data: { secretDoor: "closet", open: "swing", hinge: "left", surface: "metal" } });
// (the machine room's west wall has the panel's gap: mr-w split)
k.solid.splice(k.solid.findIndex(n => n.id === "mr-w"), 1);
k.boxes.splice(k.boxes.findIndex(b => b.id === "mr-w"), 1);
k.box("mr-w1", [14, 0, -21.6], [14.2, 4.2, -18], "block");
k.box("mr-w2", [14, 0, -16.2], [14.2, 4.2, -13], "block");

// ---------------------------------------------------------------- the south-east stair (hollow)
k.box("se-e", [26.8, 0, 13], [27, 3.6, 21.6], "block");
k.box("se-n", [20, 0, 13], [27, 3.6, 13.2], "block");
k.box("se-w1", [20, 0, 13], [20.2, 3.6, 15.5], "block");
k.box("se-w2", [20, 0, 17.9], [20.2, 3.6, 21.6], "block");
k.box("se-lintel", [20, 2.5, 15.5], [20.2, 3.6, 17.9], "block");
k.box("se-roof", [19.8, 3.6, 12.8], [27.2, 3.8, 21.6], "roofDark");
k.decor.push(box2("se-stairs", [23.5, 0, 18.5], [26.6, 1.4, 21.4], "stairEdge"), box2("se-lamp", [19.9, 2.6, 16.4], [19.99, 2.8, 17.0], "lampCage"));

// ---------------------------------------------------------------- cover over the roof
k.cover("hvac-1", [-14, 0, -6], [-10.5, 2.3, -3.6], "hvac", { data: { surface: "metal" } });
k.cover("hvac-2", [2, 0, 2], [5.5, 2.3, 4.4], "hvac", { data: { surface: "metal" } });
k.cover("hvac-3", [12, 0, -6], [15.5, 2.3, -3.6], "hvac", { data: { surface: "metal" } });
k.cover("hvac-4", [8, 0, 13], [11.5, 2.3, 15.4], "hvac", { data: { surface: "metal" } });
for (const [id, x, z, w, d] of [["v1", -18, -11, 1.4, 1.4], ["v2", -6, 6, 1.6, 1.2], ["v3", 8, -1, 1.2, 1.6], ["v4", 18, 5, 1.4, 1.4], ["v5", -3, -3, 1.4, 1.2], ["v6", -8, 15, 1.4, 1.4], ["v7", 17, -8, 1.4, 1.2], ["v8", -21, 8, 1.2, 1.6], ["v9", 22, -1, 1.2, 1.2], ["v10", 14, 18, 1.4, 1.2]] as const) {
  k.cover(`vent-${id}`, [x - w / 2, 0, z - d / 2], [x + w / 2, 1.05, z + d / 2], "vent", { data: { surface: "metal" } });
}
k.cover("duct-1", [-21, 0, 4.2], [-15, 0.9, 5.0], "duct", { data: { surface: "metal" } }, { faces: ["n", "s"] });
k.cover("duct-2", [5, 0, 8.2], [13, 0.9, 9.0], "duct", { data: { surface: "metal" } }, { faces: ["n", "s"] });
k.cover("duct-3", [-3, 0, -6.2], [4, 0.9, -5.6], "duct", { data: { surface: "metal" } }, { faces: ["n", "s"] });
k.cover("duct-4", [17.5, 0, -3.6], [23.5, 0.9, -3.0], "duct", { data: { surface: "metal" } }, { faces: ["n", "s"] });
k.cover("skylight", [-4, 0, 10], [0, 0.8, 14], "skylight", { data: { surface: "glass" } });
k.cover("mast", [21.7, 0, 7.7], [22.3, 9, 8.3], "steelDark", { data: { surface: "metal" } });
k.cover("gen", [-24, 0, -14], [-20, 1.9, -11.5], "machine", { data: { surface: "metal" } });
k.decor.push(prim("mast-light", "sphere", [22, 9.2, 8], [0.18, 10, 8], "redBlink"));

// ---------------------------------------------------------------- secrets: the closet, the billboard, the pigeon coop
k.volume("secret-closet", "secret", [11.2, 0, -18], [14, 2.4, -16.2], { name: "the closet" });
k.volume("secret-billboard", "secret", [25.5, 3.0, -10], [28, 5, -7.4], { name: "the billboard" });
k.box("coop", [-26, 0, -21.4], [-23, 1.3, -19.6], "plywood", { data: { breakable: 40, surface: "wood", drop: "grenade", amount: 3, secret: "secret-coop" } });
k.volume("secret-coop", "secret", [-25.8, 0, -21.3], [-23.2, 1.2, -19.7], { name: "the pigeon coop", via: "break" });

// ---------------------------------------------------------------- waypoints
k.grid("roof", -26, 27, -19, 19, 4.5, 0, (x, z) => (x > -8 && x < 8 && z > -21 && z < -7) || (x > 13 && z < -12.5) || (x > 19.5 && z > 12.5) || (x < -23.5 && Math.abs(z) < 3.6));
k.wp("pad-a", [-3, 1, -11], ["pad-steps-s-b", "pad-b", "pad-c", "pad-d"]);
k.wp("pad-b", [3, 1, -17], ["pad-a", "pad-c", "pad-d"]);
k.wp("pad-c", [-4, 1, -17], ["pad-a", "pad-b", "pad-d"]);
k.wp("pad-d", [4, 1, -11], ["pad-steps-e-b", "pad-a", "pad-b", "pad-c"]);
k.wp("pad-steps-s-b", [0, 0, -5.8], ["pad-a"]);
k.wp("pad-steps-e-b", [9.4, 0, -14], ["pad-d"]);
k.wp("wt-bottom", [-4, 0, 9.8], ["wt-mid"]);
k.wp("wt-mid", [-7.3, 1.85, 9.8], ["wt-bottom", "wt-top"]);
k.wp("wt-top", [-10.9, 4, 9.8], ["wt-mid", "wt-e"]);
k.wp("wt-e", [-10.8, 4, 16.3], ["wt-top"]);
k.wp("bb-bottom", [26.5, 0, 11.2], ["bb-mid"]);
k.wp("bb-mid", [26.5, 1.5, 8.2], ["bb-bottom", "bb-top"]);
k.wp("bb-top", [26.6, 3, 4.5], ["bb-mid", "bb-n"]);
k.wp("bb-n", [26.6, 3, -8.5], ["bb-top"]);
k.wp("mr-in", [19.2, 0, -14.5], ["mr-out", "mr-mid"]);
k.wp("mr-out", [19.2, 0, -11.2], ["mr-in"]);
k.wp("mr-mid", [20, 0, -16.8], ["mr-in", "mr-w", "mr-e"]);
k.wp("mr-w", [15.6, 0, -16.8], ["mr-mid", "cl-in"]);
k.wp("cl-in", [12.6, 0, -17.1], ["mr-w"], { door: "cl-panel" });
k.wp("mr-e", [24.6, 0, -16.8], ["mr-mid"]);
k.wp("se-in", [21.8, 0, 16.7], ["se-out", "se-mid"]);
k.wp("se-out", [18.4, 0, 16.7], ["se-in"]);
k.wp("se-mid", [24.2, 0, 15.6], ["se-in"]);
k.wp("sw-in", [-25.6, 0, 0], ["sw-out"]);
k.wp("sw-out", [-22.4, 0, 0], ["sw-in"]);
k.wp("bridge", [34, 0, 0]);

// ---------------------------------------------------------------- the gang (32)
const E = (id: string, x: number, y: number, z: number, yaw: number, d: Record<string, unknown> = {}) => marker(id, "enemy", [x, y, z], { kind: "goon", ...d }, yaw);
k.m(
  // on the roof when he comes out (the light's patrol has not seen him yet)
  E("g-1", -9, 0, -2, FACE_W), E("g-2", -7.5, 0, 8, FACE_W), E("g-3", 1, 0, -3.8, FACE_W), E("g-4", 6.5, 0, 6.6, FACE_W),
  E("g-5", 12, 0, 0, FACE_W, { kind: "rusher" }), E("g-6", 0, 1, -12, FACE_S),
  E("sn-1", -11, 4, 12.4, FACE_E, { perch: true, weapon: "sniper" }), E("sn-2", -14.2, 4, 9.6, FACE_N, { perch: true, weapon: "sniper" }),
  E("sn-3", 26.7, 3, -2, FACE_W, { perch: true, weapon: "sniper" }),
  // wave A (5 down): out of the machine room
  E("a-1", 16.4, 0, -15.2, FACE_S, { group: "waveA" }), E("a-2", 21.6, 0, -15.2, FACE_S, { group: "waveA" }), E("a-3", 19, 0, -17.2, FACE_S, { group: "waveA", kind: "rusher" }),
  E("a-4", 17, 0, -17.4, FACE_S, { group: "waveA" }), E("a-5", 23.4, 0, -17.4, FACE_S, { group: "waveA", kind: "rusher" }),
  // drop 1 (9 down): on ropes onto the pad
  E("d1-1", -2.5, 1, -15, FACE_S, { group: "drop1", kind: "rusher" }), E("d1-2", 2.5, 1, -15, FACE_S, { group: "drop1" }), E("d1-3", -2.5, 1, -12, FACE_S, { group: "drop1" }), E("d1-4", 2.5, 1, -12, FACE_S, { group: "drop1", kind: "rusher" }),
  // wave B (14 down): up the south-east stair
  E("b-1", 23, 0, 15, FACE_W, { group: "waveB" }), E("b-2", 25, 0, 16, FACE_W, { group: "waveB", kind: "rusher" }), E("b-3", 23, 0, 18, FACE_W, { group: "waveB" }),
  E("b-4", 25.2, 0, 14.4, FACE_W, { group: "waveB", kind: "rusher" }), E("b-5", 22.4, 0, 20, FACE_W, { group: "waveB", kind: "heavy", model: "rival652" }),
  // drop 2 (18 down)
  E("d2-1", -3, 1, -16, FACE_S, { group: "drop2" }), E("d2-2", 3, 1, -16, FACE_S, { group: "drop2", kind: "rusher" }), E("d2-3", 0, 1, -11, FACE_S, { group: "drop2", kind: "rusher" }), E("d2-4", 0, 1, -18, FACE_S, { group: "drop2" }),
  // wave C (22 down): the machine room again, and up the west stairwell behind him
  E("c-1", 19, 0, -18.6, FACE_S, { group: "waveC", kind: "heavy", model: "rival723", weapon: "handcannon" }), E("c-2", 16.4, 0, -15, FACE_S, { group: "waveC" }), E("c-3", 22, 0, -15, FACE_S, { group: "waveC" }),
  E("c-4", -26.4, 0, -1.6, FACE_E, { group: "waveC2", kind: "rusher" }), E("c-5", -26.4, 0, 1.6, FACE_E, { group: "waveC2", kind: "rusher" }),
);

// ---------------------------------------------------------------- triggers, checkpoints, pickups, eggs
const T = (id: string, pos: [number, number, number], data: Record<string, unknown>, scale: [number, number, number] = [1, 1, 1]) => marker(id, "trigger", pos, data, 0, scale);
k.m(
  marker("spawn", "spawn", [-22.4, 0, 0], {}, FACE_E),
  marker("cp-start", "checkpoint", [-22.4, 0, 0], {}, FACE_E),
  marker("cp-mid", "checkpoint", [-12, 0, 1], {}, FACE_E),
  T("t-alert", [-19, 1, 0], { action: "alert" }, [4, 3, 30]),
  T("t-waveA", [0, 1, 0], { action: "spawn", group: "waveA", afterKills: 5 }),
  T("t-drop1", [0, 1, 0], { action: "spawn", group: "drop1", afterKills: 9 }),
  T("t-cp", [0, 1, 0], { action: "checkpoint", at: "cp-mid", afterKills: 14 }),
  T("t-waveB", [0, 1, 0], { action: "spawn", group: "waveB", afterKills: 14 }),
  T("t-drop2", [0, 1, 0], { action: "spawn", group: "drop2", afterKills: 18 }),
  T("t-waveC", [0, 1, 0], { action: "spawn", group: "waveC", afterKills: 22 }),
  T("t-waveC2", [0, 1, 0], { action: "spawn", group: "waveC2", afterKills: 24 }),
  T("t-exit", [33, 1, 0], { action: "exit" }, [3, 3, 3.2]),
  marker("exit", "exit", [31, 0, 0]),
  // pickups: copium, the rifle on hvac-2's lee, the shotgun by the south-east stair, the sniper up the tower
  marker("cop-1", "pickup", [-23, 0, 5.5], { item: "copium" }), marker("cop-2", "pickup", [-5, 0, 16.5], { item: "copium" }),
  marker("cop-3", "pickup", [10, 0, -9.5], { item: "copium" }), marker("cop-4", "pickup", [16, 0, 11], { item: "copium" }),
  marker("rifle", "pickup", [3.7, 0, 5.2], { item: "rifle" }),
  marker("shotgun", "pickup", [18.5, 0, 20], { item: "shotgun" }),
  marker("sniper", "pickup", [-17.3, 4, 13], { item: "sniper" }),
  marker("nades", "pickup", [-12.2, 0, -7], { item: "grenade", amount: 2 }),
  // the secrets' stash
  marker("pin-g723", "pickup", [12, 0, -17.6], { item: "pin", pin: "g723", behind: "cl-panel" }),
  marker("cl-copium", "pickup", [13, 0, -16.7], { item: "copium", amount: 2, behind: "cl-panel" }),
  marker("bb-cannon", "pickup", [26.8, 3, -9.2], { item: "handcannon" }),
  marker("pin-g652", "pickup", [26.2, 3, -8.2], { item: "pin", pin: "g652" }),
  // eggs: a rubber duck on the tank's roof edge (E: it squeaks); the RadRun poster on the billboard's back
  marker("egg-duck", "egg", [-11.2, 4, 15.8], { egg: "duck", interact: true }, FACE_W),
  marker("egg-poster", "egg", [28.34, 1.8, 0], { egg: "poster-radrun" }, FACE_W),
);

// ---------------------------------------------------------------- lights, cameras
k.m(
  ...([
    ["sw-door", -23.4, 2.6, 0, "#ffd29a", 5, 7], ["mr-door", 19.2, 2.8, -12.4, "#ffb870", 5, 8], ["se-door", 19.4, 2.7, 16.7, "#ffb870", 5, 8],
    ["pad-1", -6, 1.4, -9, "#9fc4ff", 3, 7], ["pad-2", 6, 1.4, -19, "#9fc4ff", 3, 7], ["bb", 27, 4.2, -2, "#ffe0a0", 8, 12],
    ["wt", -13, 5, 9.5, "#ffd29a", 3, 7], ["mast", 22, 9, 8, "#ff3030", 3, 9], ["bridge", 32, 1.5, 0, "#8fc0ff", 6, 10],
    ["mr-in", 20, 3.4, -17, "#ffcf90", 5, 9], ["se-in", 23.5, 3, 17, "#ffcf90", 4, 8], ["sw-in", -26.5, 3, 0, "#ffcf90", 4, 7],
  ] as Array<[string, number, number, number, string, number, number]>).map(([id, x, y, z, color, intensity, distance]) => marker(`light-${id}`, "light", [x, y, z], { color, intensity, distance })),
  marker("cam-roof", "camera", [-22, 3, 4], { at: [10, 1, -6] }),
  marker("cam-pad", "camera", [0, 3, 2], { at: [0, 1.5, -14] }),
  marker("cam-tower", "camera", [-2, 2.5, 4], { at: [-14, 5, 13] }),
);

// ---------------------------------------------------------------- materials
const S = "/textures/", E2 = "/textures/elevator/", B = "/textures/backrooms/", P = "/textures/penthouse/";
const materials: Record<string, Record<string, unknown>> = {
  roof: tex(`${S}asphalt.webp`, 5, { roughness: 0.55, name: "wet 0.5" }),
  roofDark: tex(`${E2}shaft_concrete.webp`, 4, { roughness: 0.9 }),
  parapet: tex(`${E2}concrete_bare.webp`, 3, { roughness: 0.85 }),
  capstone: { color: "#6e6e6e", roughness: 0.6 },
  block: tex(`${B}wall_cinderblock.webp`, 2, { roughness: 0.9 }),
  pad: tex(`${S}asphalt.webp`, 4, { roughness: 0.45, color: "#8a8f98" }),
  padEdge: tex(`${E2}hazard_sill.webp`, [0.5, 0.06], { roughness: 0.7 }),
  padRing: { color: "#e6c84a", roughness: 0.6 },
  padMark: { color: "#f2f2ee", roughness: 0.6 },
  grate: tex(`${E2}car_floor_diamond.webp`, 1, { roughness: 0.5, metalness: 0.5 }),
  steelDark: { color: "#2a2d33", roughness: 0.45, metalness: 0.6 },
  steelPanel: tex(`${B}steel_panel.webp`, 1.5, { roughness: 0.5, metalness: 0.4 }),
  hvac: tex(`${B}steel_panel.webp`, 1.2, { roughness: 0.55, metalness: 0.4, color: "#9aa3ad" }),
  vent: { color: "#6f757d", roughness: 0.5, metalness: 0.5 },
  duct: { color: "#8c9299", roughness: 0.4, metalness: 0.6 },
  machine: { color: "#3e4a55", roughness: 0.5, metalness: 0.5 },
  tank: { color: "#4a3a2a", roughness: 0.9 },
  tankWood: { color: "#5a4632", roughness: 0.9 },
  skylight: { color: "#9fc0d8", roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.55 },
  plywood: { color: "#8a6a44", roughness: 0.85 },
  stairEdge: { color: "#3a3a3c", roughness: 0.8 },
  billboard: glow("#ffffff", 0.45, "", `${P}window_skyline.webp`),
  towerFar: glow("#ffffff", 0.22, "", `${S}tower.webp`),
  towerNext: glow("#ffffff", 0.3, "", `${S}tower.webp`),
  cityGlow: glow("#1a2340", 0.6),
  gardenGlass: { color: "#5fae88", roughness: 0.2, transparent: true, opacity: 0.35 },
  bridgeGlass: { color: "#8fb6d8", roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.35 },
  stripBlue: glow("#7fb8ff", 0.9),
  lampCage: glow("#ffd29a", 1.2),
  lampWarm: glow("#ffe0a0", 1.1),
  padLamp: glow("#9fc4ff", 1.4, "blink"),
  redBlink: glow("#ff3030", 2.0, "blink"),
};

writeLevel("room6", "Room 6: the roof", {
  name: "The Roof", next: "room7", cutsceneAfter: "ch2b", music: "roof", look: "roof", footsteps: "wet", ambience: "storm", tutorial: false, chapter: 2, maxRise: 1.2,
  enterLine: "r6_enter", clearLine: "r6_clear",
  stage: {
    kind: "roof", heli: [2, 15, -34], pad: [0, 1, -14],
    path: [[-12, 4], [4, 10], [16, -2], [6, -8], [-6, -6]],
    drops: [{ group: "drop1", ropes: [[-2.5, -15.5], [2.5, -15.5], [-2.5, -12.5], [2.5, -12.5]] }, { group: "drop2", ropes: [[-3, -16], [3, -16], [0, -11.5], [0, -18]] }],
  },
}, materials, k.solid, k.decor, k.clean().markers);

function box2(id: string, a: [number, number, number], b: [number, number, number], mat: string) {
  return { id, components: { transform: { type: "Transform", properties: { position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2].map(v => Math.round(v * 1000) / 1000), scale: [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])].map(v => Math.round(v * 1000) / 1000) } }, geometry: { type: "Geometry", properties: { geometryType: "box", args: [1, 1, 1] } }, material: { type: "Material", properties: { materialId: mat } }, mesh: { type: "Mesh", properties: { castShadow: false, receiveShadow: false } } } };
}
void FACE_N;
