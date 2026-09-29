// Writes public/levels/room8.json: room 8, the private airship above the clouds (chapter 2). The starting
// point for hand-tuning in the editor (/?editor=room8); re-running it OVERWRITES the file.
//   node tools/room8.ts && npm run check-level room8
//
// Layout (metres; the gondola runs along X, bow west; he comes aboard at the bow facing aft (east)):
//   the observation lounge  x -32..-14: the bow windows, sofas, the arcade cabinet; a panel in its north
//                           wall opens (E) on the captain's cabin (a secret)
//   the promenade           x -14..6: dining tables in two rows between the long windows; the galley door
//                           in the north wall (wave A)
//   the lounge bar          x 6..16: the bar, sofas, the wine crates (they break: a secret) and the lifeboat
//                           alcove behind a sliding panel (a secret)
//   the cargo hold          x 16..34, 6.5 m high: crate stacks, a car under a tarp, a catwalk along the
//                           north wall at y 3 (its stair at the east end), the loading door in the south
//                           wall: it blows (sim/ch2/airship.ts) when he walks in or at 22 down; a cargo net
//                           across the opening holds him; the girls go through it
//   the aft stair           x 34..38: waves B and C, and the way out once she has docked
// Hostiles 40; a checkpoint at 16 down. George is aboard.
import { FACE_E, FACE_N, FACE_S, FACE_W, glow, marker, prim, tex, writeLevel, type V3 } from "./levelKit.ts";
import { RoomKit } from "./levels/kit2.ts";

const k = new RoomKit();
const CH = 3.2, HH = 6.5;

// ---------------------------------------------------------------- floor, ceilings, hull walls with windows
k.box("floor", [-32, -0.5, -7], [34, 0, 7], "deck");
k.box("ceil-pass", [-32, CH, -6.2], [16, CH + 0.2, 6.2], "ceilPanel");
k.box("ceil-hold", [16, HH, -7.2], [34, HH + 0.2, 7.2], "hullRib");
// the passenger decks: a wall to 0.9 m, glass above (the windows), frames every 2 m
for (const [side, z0, z1] of [["n", -6.2, -6], ["s", 6, 6.2]] as const) {
  k.box(`sill-${side}`, [-32, 0, z0], [16, 0.9, z1], "panelWood");
  k.box(`glass-${side}`, [-32, 0.9, z0], [16, CH, z1], "window", { data: { surface: "glass", shootThrough: false } });
  for (let x = -32; x <= 16; x += 2) k.deco(`frame-${side}-${x}`, [x - 0.06, 0.9, z0 - 0.02], [x + 0.06, CH, z1 + 0.02], "brass");
}
k.box("bow-sill", [-32.2, 0, -6.2], [-32, 0.9, 6.2], "panelWood");
k.box("bow-glass", [-32.2, 0.9, -6.2], [-32, CH, 6.2], "window", { data: { surface: "glass" } });
// the hold's walls (the loading door's opening in the south wall, x 21..29)
k.box("hold-n", [16, 0, -7.2], [34, HH, -7], "hullRib", { data: { surface: "metal" } });
k.box("hold-s1", [16, 0, 7], [21, HH, 7.2], "hullRib", { data: { surface: "metal" } });
k.box("hold-s2", [29, 0, 7], [34, HH, 7.2], "hullRib", { data: { surface: "metal" } });
k.box("hold-s-top", [21, 4.2, 7], [29, HH, 7.2], "hullRib", { data: { surface: "metal" } });
k.box("cargo-door", [21, 0, 7.02], [29, 4.2, 7.18], "cargoDoor", { data: { surface: "metal" } });
k.box("cargo-net", [21, 0, 7.3], [29, 4.2, 7.36], "net", { hidden: true, data: { shootThrough: true, surface: "metal" } });
k.box("door-sill", [21, -0.5, 7.2], [29, 0, 7.4], "deck");
for (let x = 21.5; x <= 28.6; x += 0.9) k.deco(`net-v-${x}`, [x - 0.02, 0, 7.31], [x + 0.02, 4.2, 7.35], "netRope");
for (let y = 0.4; y <= 4.1; y += 0.6) k.deco(`net-h-${y}`, [21, y - 0.02, 7.31], [29, y + 0.02, 7.35], "netRope");
for (let x = 18; x <= 33; x += 3) k.deco(`rib-${x}`, [x - 0.12, 0, -7], [x + 0.12, HH, -6.8], "steel");
k.box("aft-1", [34, 0, -7.2], [34.2, HH, -1.2], "hullRib");
k.box("aft-2", [34, 0, 1.2], [34.2, HH, 7.2], "hullRib");
k.box("aft-top", [34, 2.6, -1.2], [34.2, HH, 1.2], "hullRib");
// outside: the cloud sea far below, the envelope overhead, a moon
k.deco("clouds", [-400, -70, -400], [400, -69, 400], "cloudSea");
k.deco("envelope", [-40, 9, -14], [44, 26, 14], "envelope");
k.decor.push(prim("moon", "sphere", [-160, 60, -220], [18, 16, 12], "moon"));

// ---------------------------------------------------------------- bulkheads
const bulk = (id: string, x: number, gaps: Array<[number, number]>, z0 = -6, z1 = 6, h = CH) => {
  const edges = [z0, ...gaps.flat(), z1];
  for (let i = 0; i < edges.length; i += 2) if (edges[i + 1] - edges[i] > 0.01) k.box(`${id}-${i / 2}`, [x - 0.1, 0, edges[i]], [x + 0.1, h, edges[i + 1]], "panelWood");
  for (const [a, b] of gaps) k.box(`${id}-top-${a}`, [x - 0.1, 2.4, a], [x + 0.1, h, b], "panelWood");
};
bulk("bh-bow", -14, [[-3.6, -1.2], [1.2, 3.6]]);
bulk("bh-lounge", 6, [[-5.4, -3.4], [-2, 2]]);
bulk("bh-hold", 16, [[-4, -1.6], [1.6, 4]], -7.2, 7.2, HH);

// ---------------------------------------------------------------- the observation lounge (bow)
k.cover("sofa-bow-1", [-29, 0, -4.6], [-26, 0.8, -3.6], "velvet", { data: { surface: "wood" } });
k.cover("sofa-bow-2", [-29, 0, 3.6], [-26, 0.8, 4.6], "velvet", { data: { surface: "wood" } });
k.cover("sofa-bow-3", [-22, 0, -1.5], [-21, 0.8, 1.5], "velvet", { data: { surface: "wood" } });
k.cover("table-bow", [-26.2, 0, -0.7], [-24.8, 0.75, 0.7], "brassTable", { data: { surface: "metal" } });
k.cover("pillar-bow-1", [-18.4, 0, -4.4], [-17.6, CH, -3.6], "brass", { data: { surface: "metal" } });
k.cover("pillar-bow-2", [-18.4, 0, 3.6], [-17.6, CH, 4.4], "brass", { data: { surface: "metal" } });
k.cover("globe", [-17, 0, -0.6], [-15.8, 1.3, 0.6], "brassTable", { data: { surface: "metal" } });
// the captain's cabin (north), through a wood panel (E)
k.box("cab-floor", [-23, -0.5, -9.4], [-19, 0, -6.2], "deck");
k.box("cab-w", [-23.2, 0, -9.4], [-23, CH, -6.2], "panelWood");
k.box("cab-e", [-19, 0, -9.4], [-18.8, CH, -6.2], "panelWood");
k.box("cab-n", [-23.2, 0, -9.6], [-18.8, CH, -9.4], "panelWood");
k.box("cab-ceil", [-23.2, CH, -9.6], [-18.8, CH + 0.2, -6.2], "ceilPanel");
// (the north wall's windows stop either side of it)
k.solid.splice(k.solid.findIndex(n => n.id === "glass-n"), 1);
k.boxes.splice(k.boxes.findIndex(b => b.id === "glass-n"), 1);
k.box("glass-n1", [-32, 0.9, -6.2], [-22.2, CH, -6], "window", { data: { surface: "glass" } });
k.box("glass-n2", [-19.8, 0.9, -6.2], [-4.2, CH, -6], "window", { data: { surface: "glass" } });
k.box("glass-n3", [-1.4, 0.9, -6.2], [16, CH, -6], "window", { data: { surface: "glass" } });
k.box("glass-n-cab", [-22.2, 0.9, -6.2], [-19.8, CH, -6], "panelWood");
k.solid.splice(k.solid.findIndex(n => n.id === "sill-n"), 1);
k.boxes.splice(k.boxes.findIndex(b => b.id === "sill-n"), 1);
k.box("sill-n1", [-32, 0, -6.2], [-22.2, 0.9, -6], "panelWood");
k.box("sill-n2", [-19.8, 0, -6.2], [-4.2, 0.9, -6], "panelWood");
k.box("sill-n3", [-1.4, 0, -6.2], [16, 0.9, -6], "panelWood");
k.box("cab-panel", [-22.2, 0, -6.18], [-19.8, 0.9, -6.02], "panelWood", { data: { secretDoor: "cabin", open: "swing", hinge: "right", surface: "wood" } });
k.box("cab-door-lintel", [-22.2, 2.3, -6.2], [-19.8, CH, -6], "panelWood");
// (the panel is door height: its box spans the sill line; the cabin's glass stand-in above it is gone)
k.solid.splice(k.solid.findIndex(n => n.id === "glass-n-cab"), 1);
k.boxes.splice(k.boxes.findIndex(b => b.id === "glass-n-cab"), 1);
k.solid.splice(k.solid.findIndex(n => n.id === "cab-panel"), 1);
k.boxes.splice(k.boxes.findIndex(b => b.id === "cab-panel"), 1);
k.box("cab-panel", [-22.2, 0, -6.18], [-19.8, 2.3, -6.02], "panelWood", { data: { secretDoor: "cabin", open: "swing", hinge: "right", surface: "wood" } });
k.cover("cab-desk", [-22.6, 0, -9.3], [-20.6, 0.8, -8.5], "wood", {}, { faces: ["s"] });

// ---------------------------------------------------------------- the promenade
for (let i = 0; i < 5; i++) {
  const x = -11 + i * 3.6;
  k.cover(`dine-n-${i}`, [x - 0.6, 0, -3.1], [x + 0.6, 0.75, -1.9], "linen");
  k.cover(`dine-s-${i}`, [x - 0.6, 0, 1.9], [x + 0.6, 0.75, 3.1], "linen");
}
for (const x of [-9.2, -2, 4.4]) { k.cover(`pil-n-${x}`, [x - 0.2, 0, -5.2], [x + 0.2, CH, -4.8], "brass", { data: { surface: "metal" } }, { faces: ["s"] }); k.cover(`pil-s-${x}`, [x - 0.2, 0, 4.8], [x + 0.2, CH, 5.2], "brass", { data: { surface: "metal" } }, { faces: ["n"] }); }
k.cover("trolley", [-5.6, 0, -0.5], [-4.6, 1.0, 0.5], "brassTable", { data: { surface: "metal" } });
// the galley (north, wave A)
k.box("gal-floor", [-6.2, -0.5, -10], [0.6, 0, -6.2], "tiles");
k.box("gal-w", [-6.4, 0, -10], [-6.2, CH, -6.2], "panelWhite");
k.box("gal-e", [0.6, 0, -10], [0.8, CH, -6.2], "panelWhite");
k.box("gal-n", [-6.4, 0, -10.2], [0.8, CH, -10], "panelWhite");
k.box("gal-ceil", [-6.4, CH, -10.2], [0.8, CH + 0.2, -6.2], "ceilPanel");
k.box("gal-w-wall", [-6.2, 0, -6.2], [-4.2, CH, -6], "panelWood");
k.box("gal-e-wall", [-1.4, 0, -6.2], [0.6, CH, -6], "panelWood");
k.box("gal-lintel", [-4.2, 2.4, -6.2], [-1.4, CH, -6], "panelWood");
k.cover("gal-counter", [-5.8, 0, -9.95], [0.2, 1.0, -9.35], "steel", { data: { surface: "metal" } }, { faces: ["s"] });

// ---------------------------------------------------------------- the lounge bar
k.cover("bar", [8, 0, -5.4], [14, 1.1, -4.4], "barFront", { data: { surface: "wood" } }, { faces: ["s", "w", "e"] });
k.deco("bar-top", [7.95, 1.1, -5.45], [14.05, 1.16, -4.35], "brass");
k.deco("bar-shelf", [8.2, 1.3, -5.95], [13.8, 2.6, -5.85], "bottles");
k.cover("sofa-l-1", [8, 0, 1.4], [11, 0.8, 2.4], "velvet", { data: { surface: "wood" } });
k.cover("sofa-l-2", [12.4, 0, -1.6], [13.4, 0.8, 1.6], "velvet", { data: { surface: "wood" } });
k.cover("piano", [9, 0, 3.8], [11.2, 1.2, 5.4], "piano", { data: { surface: "wood" } });
k.box("wine", [14.4, 0, -5.8], [15.8, 1.4, -4.4], "crate", { data: { breakable: 40, surface: "wood", drop: "grenade", amount: 3, secret: "secret-wine" } });
k.volume("secret-wine", "secret", [14.4, 0, -5.8], [15.8, 1.4, -4.4], { name: "the wine crates", via: "break" });
// the lifeboat alcove (south wall, a sliding panel)
k.solid.splice(k.solid.findIndex(n => n.id === "glass-s"), 1);
k.boxes.splice(k.boxes.findIndex(b => b.id === "glass-s"), 1);
k.solid.splice(k.solid.findIndex(n => n.id === "sill-s"), 1);
k.boxes.splice(k.boxes.findIndex(b => b.id === "sill-s"), 1);
k.box("sill-s1", [-32, 0, 6], [12.6, 0.9, 6.2], "panelWood");
k.box("glass-s1", [-32, 0.9, 6], [12.6, CH, 6.2], "window", { data: { surface: "glass" } });
k.box("sill-s2", [15.4, 0, 6], [16, CH, 6.2], "panelWood");
k.box("lb-lintel", [12.6, 2.3, 6], [15.4, CH, 6.2], "panelWood");
k.box("lb-panel", [12.6, 0, 6.02], [15.4, 2.3, 6.18], "panelWood", { data: { secretDoor: "lifeboat", open: "slide", slide: [2.6, 0], surface: "wood" } });
k.box("lb-floor", [12.4, -0.5, 6.2], [15.6, 0, 9], "deck");
k.box("lb-w", [12.4, 0, 6.2], [12.6, CH, 9], "panelWood");
k.box("lb-e", [15.4, 0, 6.2], [15.6, CH, 9], "panelWood");
k.box("lb-s", [12.4, 0, 9], [15.6, CH, 9.2], "window");
k.box("lb-ceil", [12.4, CH, 6.2], [15.6, CH + 0.2, 9.2], "ceilPanel");
k.deco("lb-boat", [12.9, 0.3, 7], [15.1, 1.1, 8.7], "boat");
k.volume("secret-lifeboat", "secret", [12.6, 0, 6.2], [15.4, 2.3, 9], { name: "the lifeboat" });

// ---------------------------------------------------------------- the cargo hold
for (const [id, x, z, w, d, h] of [["c1", 19, -3.8, 2, 2, 1.2], ["c2", 19, 3.8, 2, 2, 2.4], ["c3", 23.5, -1, 2.2, 1.6, 1.2], ["c4", 27, -4.2, 2.4, 2, 2.4], ["c5", 27.4, 1.8, 1.6, 1.6, 1.2], ["c6", 28.4, -0.8, 1.6, 1.4, 2.4], ["c7", 31, 4.2, 2, 1.6, 1.2], ["c8", 22.4, 4.6, 1.6, 1.4, 1.2]] as const) {
  k.cover(`crate-${id}`, [x - w / 2, 0, z - d / 2], [x + w / 2, h, z + d / 2], h > 2 ? "crateBig" : "crate", { data: { surface: "wood" } });
}
k.cover("car", [23, 0, -6.4], [27.6, 1.6, -4.6], "tarp", { data: { surface: "metal" } }, { faces: ["s", "w", "e"] });
// the catwalk (north, y 3) and its stair (east end, down to the south)
k.box("cw-deck", [17, 2.8, -7], [33.6, 3, -5.2], "grate", { data: { surface: "metal" } });
k.box("cw-rail", [17, 3, -5.3], [30, 4, -5.2], "rail", { data: { shootThrough: true, surface: "metal" } });
for (const x of [18, 22, 26, 30]) k.box(`cw-leg-${x}`, [x - 0.15, 0, -5.45], [x + 0.15, 2.8, -5.2], "steel", { data: { surface: "metal" } });
k.stairs("cw-st", 30.9, -5.2, "s", 10, 0.3, 0.75, 1.4, 3, "grate");
k.box("cw-st-rail-w", [30.05, 0, -5.2], [30.2, 4, 2.3], "rail", { data: { shootThrough: true, surface: "metal" } });
k.box("cw-st-rail-e", [31.6, 0, -5.2], [31.75, 4, 2.3], "rail", { data: { shootThrough: true, surface: "metal" } });
// the aft stair room (the way out)
k.box("aft-floor", [34.2, -0.5, -3], [38, 0, 3], "deck");
k.box("aft-n", [34.2, 0, -3.2], [38, CH, -3], "panelWhite");
k.box("aft-s", [34.2, 0, 3], [38, CH, 3.2], "panelWhite");
k.box("aft-e", [38, 0, -3.2], [38.2, CH, 3.2], "panelWhite");
k.box("aft-ceil", [34.2, CH, -3.2], [38.2, CH + 0.2, 3.2], "ceilPanel");
k.deco("aft-stairs", [36, 0, -2.6], [37.8, 1.2, 2.6], "grate");

// ---------------------------------------------------------------- secrets' volumes, waypoints
k.volume("secret-cabin", "secret", [-23, 0, -9.4], [-19, 2.3, -6.3], { name: "the captain's cabin" });
k.grid("bow", -30, -16, -4.5, 4.5, 3, 0);
k.grid("prom", -12.5, 4.5, -4.5, 4.5, 3, 0);
k.grid("lounge", 7.5, 15, -3.5, 5, 2.5, 0);
k.grid("hold", 17.5, 33.5, -6, 6, 3, 0);
k.wp("cab-in", [-21, 0, -7.8], ["cab-out"], { door: "cab-panel" });
k.wp("cab-out", [-21, 0, -4.8], ["cab-in"]);
k.wp("gal-in", [-2.8, 0, -8], ["gal-out"]);
k.wp("gal-out", [-2.8, 0, -4.8], ["gal-in"]);
k.wp("lb-in", [14, 0, 7.6], ["lb-out"], { door: "lb-panel" });
k.wp("lb-out", [14, 0, 4.8], ["lb-in"]);
k.wp("aft-in", [35.6, 0, 0], ["aft-out"]);
k.wp("aft-out", [33, 0, 0], ["aft-in"]);
k.wp("cw-bot", [30.9, 0, 3.2], ["cw-mid"]);
k.wp("cw-mid", [30.9, 1.5, -0.8], ["cw-bot", "cw-top"]);
k.wp("cw-top", [30.9, 3, -6.1], ["cw-mid", "cw-w"]);
k.wp("cw-w", [20, 3, -6.1], ["cw-top"]);

// ---------------------------------------------------------------- the gang (40)
const E = (id: string, x: number, y: number, z: number, yaw: number, d: Record<string, unknown> = {}) => marker(id, "enemy", [x, y, z], { kind: "goon", ...d }, yaw);
k.m(
  // the observation lounge
  E("o-1", -24, 0, -3, FACE_W), E("o-2", -23.5, 0, 3, FACE_W), E("o-3", -19.5, 0, -1.8, FACE_W, { minDiff: "hard" }), E("o-4", -19.5, 0, 2.2, FACE_W, { minDiff: "hard" }), E("o-5", -16.5, 0, -2.6, FACE_W, { kind: "rusher" }), E("o-6", -16, 0, 2.6, FACE_W, { minDiff: "hard" }),
  // the promenade
  E("p-1", -9, 0, -1, FACE_W), E("p-2", -7.4, 0, 1.2, FACE_W, { minDiff: "hard" }), E("p-3", -3.8, 0, -3.8, FACE_W), E("p-4", -0.2, 0, 3.8, FACE_W, { minDiff: "hard" }), E("p-5", 2.6, 0, -1, FACE_W), E("p-6", 3.6, 0, 1.2, FACE_W, { kind: "rusher", minDiff: "hard" }),
  // wave A (5 down): the galley
  E("a-1", -5, 0, -8.5, FACE_S, { group: "waveA" }), E("a-2", -3.8, 0, -7.6, FACE_S, { group: "waveA", kind: "rusher" }), E("a-3", -1.6, 0, -7.6, FACE_S, { group: "waveA", kind: "rusher", minDiff: "hard" }), E("a-4", -0.4, 0, -8.5, FACE_S, { group: "waveA" }),
  // the lounge bar (asleep till they hear it)
  E("l-1", 11, 0, -3.4, FACE_W), E("l-2", 13.6, 0, -2.4, FACE_W), E("l-3", 9.4, 0, 3.2, FACE_W, { minDiff: "hard" }), E("l-4", 14.6, 0, 2.8, FACE_W, { kind: "heavy", model: "rival652" }), E("l-5", 7.8, 0, -0.4, FACE_W, { kind: "rusher" }),
  // the hold (behind the bulkhead: they wake when he walks in)
  E("h-1", 20.6, 0, -1.4, FACE_W, { group: "hold", deaf: true }), E("h-2", 24.5, 0, 2.4, FACE_W, { group: "hold", deaf: true }), E("h-3", 25.4, 0, -2.8, FACE_W, { group: "hold", deaf: true, kind: "rusher" }),
  E("h-4", 29.4, 0, 0.4, FACE_W, { group: "hold", deaf: true }), E("h-5", 29.8, 0, 4.8, FACE_W, { group: "hold", deaf: true, kind: "rusher", minDiff: "hard" }), E("h-6", 24, 3, -6.1, FACE_S, { group: "hold", deaf: true, perch: true, weapon: "sniper" }),
  // wave B (16 down): up the aft stair
  E("b-1", 35.2, 0, -1.8, FACE_W, { group: "waveB" }), E("b-2", 35.2, 0, 1.8, FACE_W, { group: "waveB", kind: "rusher" }), E("b-3", 36.6, 0, 0, FACE_W, { group: "waveB" }), E("b-4", 37.2, 0, -2, FACE_W, { group: "waveB", kind: "rusher", minDiff: "hard" }), E("b-5", 37.2, 0, 2, FACE_W, { group: "waveB", minDiff: "hard" }),
  // wave C (26 down): the aft stair again (the hand cannon) and the catwalk
  E("c-1", 36.4, 0, 0, FACE_W, { group: "waveC", kind: "heavy", model: "rival723", weapon: "handcannon" }), E("c-2", 35.2, 0, -2, FACE_W, { group: "waveC" }), E("c-3", 35.2, 0, 2, FACE_W, { group: "waveC", kind: "rusher" }),
  E("c-4", 30, 3, -6.1, FACE_S, { group: "waveC2", perch: true, weapon: "sniper", minDiff: "hard" }), E("c-5", 21, 3, -6.1, FACE_S, { group: "waveC2" }),
  // wave D (31 down): back from the bow, behind him
  E("d-1", -30, 0, -2, FACE_E, { group: "waveD", kind: "rusher" }), E("d-2", -30, 0, 2, FACE_E, { group: "waveD", kind: "rusher" }), E("d-3", -28, 0, 0, FACE_E, { group: "waveD", kind: "rusher", minDiff: "hard" }),
);

// ---------------------------------------------------------------- triggers, pickups, eggs, lights
const T = (id: string, pos: V3, data: Record<string, unknown>, scale: V3 = [1, 1, 1]) => marker(id, "trigger", pos, data, 0, scale);
k.m(
  marker("spawn", "spawn", [-29.5, 0, 0], {}, FACE_E),
  marker("cp-mid", "checkpoint", [8, 0, 0], {}, FACE_E),
  T("t-alert", [-27, 1, 0], { action: "alert" }, [3, 3, 12]),
  T("t-hold", [17.2, 1, 0], { action: "alert", group: "hold" }, [2, 3, 14]),
  T("t-hold-kills", [0, 1, 0], { action: "alert", group: "hold", afterKills: { normal: 15, hard: 20 } }),
  T("t-blow-step", [19.5, 1, 0], { action: "setpiece", cue: "blow" }, [1.5, 3, 14]),
  T("t-blow-kills", [0, 1, 0], { action: "setpiece", cue: "blow", afterKills: { normal: 17, hard: 22 } }),
  T("t-waveA", [0, 1, 0], { action: "spawn", group: "waveA", afterKills: 5 }),
  T("t-cp", [0, 1, 0], { action: "checkpoint", at: "cp-mid", afterKills: { normal: 12, hard: 16 } }),
  T("t-waveB", [0, 1, 0], { action: "spawn", group: "waveB", afterKills: { normal: 12, hard: 16 } }),
  T("t-waveC", [0, 1, 0], { action: "spawn", group: "waveC", afterKills: { normal: 19, hard: 26 } }),
  T("t-waveC2", [0, 1, 0], { action: "spawn", group: "waveC2", afterKills: { normal: 21, hard: 28 } }),
  T("t-waveD", [0, 1, 0], { action: "spawn", group: "waveD", afterKills: { normal: 23, hard: 31 } }),
  T("t-exit", [36.6, 1, 0], { action: "exit" }, [2.4, 3, 5]),
  marker("exit", "exit", [34.6, 0, 0]),
  marker("cop-1", "pickup", [-30.5, 0, -4.5], { item: "copium" }), marker("cop-2", "pickup", [-13, 0, -5], { item: "copium" }),
  marker("cop-3", "pickup", [7.2, 0, 5], { item: "copium" }), marker("cop-4", "pickup", [17.5, 0, -6.2], { item: "copium" }), marker("cop-5", "pickup", [33, 0, 5.8], { item: "copium" }), marker("cop-6", "pickup", [10.5, 0, -3.2], { item: "copium" }),
  marker("shotgun", "pickup", [-3.6, 1.0, -9.6], { item: "shotgun" }),
  marker("smgs", "pickup", [11, 1.16, -4.9], { item: "smgs" }),
  marker("rifle", "pickup", [26, 3, -6.3], { item: "rifle" }),
  marker("nades", "pickup", [-20, 0, 5.2], { item: "grenade", amount: 2 }),
  marker("pin-g2564", "pickup", [-22, 0.8, -8.9], { item: "pin", pin: "g2564", behind: "cab-panel" }),
  marker("cab-copium", "pickup", [-20, 0, -7], { item: "copium", amount: 2, behind: "cab-panel" }),
  marker("lb-cannon", "pickup", [13.4, 0, 7.8], { item: "handcannon", behind: "lb-panel" }),
  marker("lb-ammo", "pickup", [14.6, 0, 7.8], { item: "handcannon_ammo", amount: 14, behind: "lb-panel" }),
  marker("egg-george", "egg", [31, 1.2, 4.2], { egg: "george", interact: true }, FACE_W),
  marker("egg-cabinet", "egg", [-27.5, 0, -5.55], { egg: "cabinet", interact: true }, FACE_S),
  ...([
    ["bow-1", -26, 2.8, 0, "#ffd9a8", 6, 11], ["bow-2", -18, 2.8, 0, "#ffd9a8", 5, 9], ["prom-1", -10, 2.8, 0, "#ffd9a8", 6, 10], ["prom-2", -1, 2.8, 0, "#ffd9a8", 6, 10],
    ["prom-3", 4, 2.8, 0, "#ffd9a8", 5, 9], ["bar", 11, 2.4, -3.6, "#ffae4a", 7, 9], ["lounge", 11, 2.8, 2, "#ffcf90", 5, 9], ["gal", -2.8, 2.8, -8, "#e8f0ff", 4, 6],
    ["hold-1", 20, 5.8, 0, "#c8d8ff", 7, 13], ["hold-2", 28, 5.8, 0, "#c8d8ff", 7, 13], ["door", 25, 3, 5, "#ff4040", 3, 8], ["aft", 36, 2.8, 0, "#ffcf90", 4, 7],
    ["cab", -21, 2.6, -8, "#ffc07a", 2, 4], ["lb", 14, 2.6, 7.6, "#ffc07a", 2, 4],
  ] as Array<[string, number, number, number, string, number, number]>).map(([id, x, y, z, color, intensity, distance]) => marker(`light-${id}`, "light", [x, y, z], { color, intensity, distance })),
  marker("cam-bow", "camera", [-30, 2, 4], { at: [-16, 1.2, -2] }),
  marker("cam-prom", "camera", [-13, 2, 4.5], { at: [4, 1.2, -1] }),
  marker("cam-hold", "camera", [18, 3.4, 5], { at: [26, 1.5, 6.5] }),
);

// ---------------------------------------------------------------- materials
const E2 = "/textures/elevator/", B = "/textures/backrooms/", P = "/textures/penthouse/", C = "/textures/club/", S = "/textures/";
const materials: Record<string, Record<string, unknown>> = {
  deck: tex(`${B}wood_desk.webp`, 1.4, { roughness: 0.55, color: "#b89a78" }),
  panelWood: tex(`${P}wall_ebony_slats.webp`, 2, { roughness: 0.55, color: "#c8a888" }),
  panelWhite: tex(`${B}steel_panel.webp`, 1.5, { roughness: 0.6, color: "#d8d4cc" }),
  ceilPanel: tex(`${P}ceiling_coffered.webp`, 2, { roughness: 0.9, color: "#c8c0b0" }),
  hullRib: tex(`${E2}car_wall_steel.webp`, 2, { roughness: 0.7, metalness: 0.3 }),
  steel: { color: "#3a3f47", roughness: 0.45, metalness: 0.6 },
  window: { color: "#b8d0e8", roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.14 },
  brass: { color: "#b08a4a", roughness: 0.3, metalness: 0.85 },
  brassTable: { color: "#8a6a3a", roughness: 0.35, metalness: 0.7 },
  velvet: tex(`${C}booth_leather.webp`, 1, { roughness: 0.8, color: "#a84a5a" }),
  linen: { color: "#e8e2d4", roughness: 0.95 },
  tiles: tex(`${B}floor_vinyl.webp`, 1, { roughness: 0.5, color: "#d8d8d8" }),
  wood: tex(`${B}wood_desk.webp`, 1, { roughness: 0.6 }),
  barFront: tex(`${C}bar_front.webp`, 2, { roughness: 0.5 }),
  bottles: glow("#ffffff", 0.45, "", `${C}backbar_shelves.webp`),
  piano: { color: "#141214", roughness: 0.2 },
  crate: tex(`${B}boxes_cardboard.webp`, 0.8, { roughness: 0.9, color: "#b0906a" }),
  crateBig: tex(`${B}boxes_cardboard.webp`, 1.2, { roughness: 0.9, color: "#9a8060" }),
  tarp: { color: "#3a4a3a", roughness: 0.95 },
  grate: tex(`${E2}car_floor_diamond.webp`, 1, { roughness: 0.5, metalness: 0.5 }),
  rail: { color: "#6a6f78", roughness: 0.4, metalness: 0.6 },
  cargoDoor: tex(`${E2}landing_doors.webp`, 3, { roughness: 0.6, metalness: 0.4 }),
  net: { color: "#555", roughness: 1 },
  netRope: { color: "#7a6a50", roughness: 1 },
  boat: { color: "#e8e2d4", roughness: 0.7 },
  cloudSea: glow("#dfe6f4", 0.62, "", `${S}puddles.webp`),
  envelope: { color: "#6a6f7a", roughness: 0.7 },
  moon: glow("#f4f0e0", 1.3),
};

writeLevel("room8", "Room 8: the airship", {
  name: "The Airship", next: "room9", cutsceneAfter: "ch2d", music: "airship", look: "airship", footsteps: "hard", tutorial: false, chapter: 2, maxRise: 1.2,
  enterLine: "r8_enter", clearLine: "r8_clear",
  stage: { kind: "airship", door: "cargo-door", cue: "blow", hold: [16.4, -7, 34, 7], out: [25, 7.4] },
}, materials, k.solid, k.decor, k.clean().markers);
void FACE_N;
