// Writes public/levels/room5.json: room 5, the penthouse, Madame Pockit's fight (round-3 plan section
// 3). The starting point for hand-tuning in the editor (/?editor=room5); re-running it OVERWRITES the file.
//   node tools/room5.ts && npm run check-level room5
//
// Layout (metres; he comes in from the west, facing +X; the hall's ceiling is 6 m):
//   the private elevator's doors      in the west wall at z 0: he steps out into the hall (spawn; copium
//                                     x 2 either side); no vestibule to hold out in, the doors lock
//   the hall                          x -16..16, z -11..11: black marble, ebony walls
//   the lounge                        the round white rug at the centre (r 2.4: the chandelier's drop
//                                     zone), two white sofas (low) either side of it
//   the chandelier                    over the rug; its chain (0, 5.3, 0) takes two hits (sim/boss.ts)
//   the grand piano (high-ish)        (-8.5, -6.4); the onyx bar (low) along z 7.6..8.4, x 5..11
//   four pillars (high)               (+-9, +-4)
//   her dais (0.3 m, one step)        x 11..16, z -4..4: her desk (low), the big screen on the wall behind
//   the glass wall                    the east wall either side of the dais, the rainy skyline beyond
//   door A (north) / door B (south)   (0, -11) / (0, 11): the adds wait behind them (8 / 7)
//   her guards                        4 in the hall from the start (the piano, the bar, the lounge)
// Room settings: boss (the chandelier's chain, the rug, the bag on her desk, the terrace door, the two
// add doors: sim/boss.ts), later: the add groups (the boss brings them in). No exit: the clear is her.
import { FACE_E, FACE_N, FACE_S, FACE_W, box, boxMM, glow, marker, prim, tex, writeLevel, type Node } from "./levelKit.ts";

const solid: Node[] = [];
const decor: Node[] = [];
const H = 6;

// ---------------------------------------------------------------- floor, ceiling, walls
solid.push(boxMM("floor", [-21, -0.5, -15], [23, 0, 15], "marbleBlack"));
solid.push(boxMM("ceiling", [-16.2, H, -11.2], [16.2, H + 0.3, 11.2], "coffered"));
// north / south walls with the add doors (x -1.2..1.2, 2.8 m high)
for (const [side, z0, z1] of [["n", -11.2, -11], ["s", 11, 11.2]] as const) {
  solid.push(boxMM(`wall-${side}1`, [-16.2, 0, z0], [-1.2, H, z1], "ebony"));
  solid.push(boxMM(`wall-${side}2`, [1.2, 0, z0], [16.2, H, z1], "ebony"));
  solid.push(boxMM(`wall-${side}-head`, [-1.2, 2.8, z0], [1.2, H, z1], "ebony"));
  // the double door: a collider the boss takes out; the leaves are drawn by the view
  solid.push(boxMM(`door-${side === "n" ? "a" : "b"}`, [-1.2, 0, (z0 + z1) / 2 - 0.05], [1.2, 2.8, (z0 + z1) / 2 + 0.05], "doorDouble", { hidden: true, data: { surface: "wood", camera: true } }));
  decor.push(boxMM(`door-${side}-frame`, [-1.35, 2.8, z0 - 0.04], [1.35, 2.95, z1 + 0.04], "brass"));
  // the vestibule behind it (the adds wait here)
  const zb = side === "n" ? -14.2 : 14.2;
  solid.push(boxMM(`vest-${side}-back`, [-2.4, 0, Math.min(zb, zb + (side === "n" ? 0 : -0.2))], [2.4, H, Math.max(zb, zb + (side === "n" ? 0.2 : 0))], "damask"));
  solid.push(boxMM(`vest-${side}-w`, [-2.6, 0, Math.min(z0, zb)], [-2.4, H, Math.max(z1, zb)], "damask"));
  solid.push(boxMM(`vest-${side}-e`, [2.4, 0, Math.min(z0, zb)], [2.6, H, Math.max(z1, zb)], "damask"));
  solid.push(boxMM(`vest-${side}-ceil`, [-2.6, 3.2, Math.min(z0, zb)], [2.6, 3.4, Math.max(z1, zb)], "coffered"));
}
// west wall with the private elevator's doors (shut behind him: her "the doors are locked")
solid.push(boxMM("wall-w", [-16.2, 0, -11], [-16, H, 11], "ebony"));
decor.push(boxMM("lift-doors", [-16.0, 0, -0.9], [-15.97, 2.3, 0.9], "brass"));
decor.push(boxMM("lift-frame", [-16.0, 2.3, -1.05], [-15.95, 2.45, 1.05], "brassDark"));
decor.push(boxMM("lift-lamp", [-15.99, 2.6, -0.2], [-15.96, 2.72, 0.2], "lampWarm"));
// east: glass either side of the dais, a solid wall behind it (the screen), the skyline far beyond
solid.push(boxMM("wall-e-dais", [16, 0, -4.4], [16.3, H, 4.4], "ebony"));
solid.push(boxMM("glass-e-n", [16.05, 0, -11], [16.15, H, -4.4], "glass", { hidden: true, data: { surface: "glass", camera: true } }));
solid.push(boxMM("glass-e-s", [16.05, 0, 4.4], [16.15, H, 11], "glass", { hidden: true, data: { surface: "glass", camera: true } }));
for (const z of [-11, -8.8, -6.6, -4.4, 4.4, 6.6, 8.8, 11]) decor.push(boxMM(`mullion-${z}`, [16.0, 0, z - 0.05], [16.2, H, z + 0.05], "brassDark"));
decor.push(boxMM("glass-rail", [16.0, 1.0, -11], [16.2, 1.06, 11], "brassDark"));
decor.push(boxMM("skyline", [30, -4, -26], [30.2, 18, 26], "skyline"));
decor.push(boxMM("terrace-floor", [16.2, -0.1, -11], [22, 0, 11], "terrace"));
decor.push(boxMM("terrace-rail", [21.8, 0, -11], [22, 1.1, 11], "brassDark"));
// the terrace door (locked: she runs for it in her last stand) in the south glass
decor.push(boxMM("terrace-door", [16.0, 0, 5.4], [16.2, 2.6, 7.2], "brass"));

// ---------------------------------------------------------------- the lounge, the chandelier
decor.push(prim("rug", "cylinder", [0, 0.012, 0], [2.4, 2.4, 0.02, 40], "rug"));
solid.push(boxMM("sofa-n", [-2.3, 0, -3.8], [2.3, 0.85, -2.9], "sofa", { data: { surface: "wood" } }));
solid.push(boxMM("sofa-s", [-2.3, 0, 2.9], [2.3, 0.85, 3.8], "sofa", { data: { surface: "wood" } }));
decor.push(boxMM("sofa-n-back", [-2.3, 0.85, -3.8], [2.3, 1.15, -3.55], "sofa"), boxMM("sofa-s-back", [-2.3, 0.85, 3.55], [2.3, 1.15, 3.8], "sofa"));
decor.push(prim("chandelier-chain", "cylinder", [0, 5.65, 0], [0.025, 0.025, 0.7, 6], "brass"));
decor.push(boxMM("chandelier-rose", [-0.25, H - 0.05, -0.25], [0.25, H, 0.25], "brass"));

// ---------------------------------------------------------------- cover: the piano, the bar, pillars, armchairs
solid.push(boxMM("piano", [-9.8, 0, -7.4], [-7.4, 1.2, -5.6], "piano", { data: { surface: "wood" } }));
decor.push(box("piano-lid", [-8.5, 1.55, -6.7], [2.2, 0.04, 1.4], "piano", { rot: [0.5, 0, 0] }));
decor.push(boxMM("piano-bench", [-8.9, 0, -5.3], [-8.1, 0.5, -4.9], "piano"));
// (a wide gap behind it: the camera needs room there, the shotgun and a copium lie on that side)
solid.push(boxMM("bar", [5, 0, 7.6], [11, 1.1, 8.4], "onyx", { data: { surface: "concrete" } }));
decor.push(boxMM("bar-top", [4.95, 1.1, 7.55], [11.05, 1.16, 8.45], "marbleBlack"));
decor.push(boxMM("bar-shelf", [5.2, 1.4, 10.9], [10.8, 2.8, 11.0], "barShelf"));
for (let i = 0; i < 5; i++) decor.push(prim(`stool-${i}`, "cylinder", [5.8 + i * 1.2, 0.38, 7.0], [0.2, 0.18, 0.76, 12], "brassDark"));
for (const [x, z] of [[-9, -4], [9, -4], [-9, 4], [9, 4]]) solid.push(boxMM(`pillar-${x}-${z}`, [x - 0.5, 0, z - 0.5], [x + 0.5, H, z + 0.5], "pillar"));
solid.push(boxMM("chair-w", [-5.2, 0, -0.6], [-4.3, 0.9, 0.6], "sofa", { data: { surface: "wood" } }));
solid.push(boxMM("chair-e", [4.3, 0, -0.6], [5.2, 0.9, 0.6], "sofa", { data: { surface: "wood" } }));
solid.push(boxMM("console-n", [-6, 0, -10.9], [-3, 0.9, -10.3], "ebonyDark", { data: { surface: "wood" } }));
solid.push(boxMM("console-s", [-7, 0, 10.3], [-4, 0.9, 10.9], "ebonyDark", { data: { surface: "wood" } }));
decor.push(prim("vase-n", "cylinder", [-4.5, 1.2, -10.6], [0.14, 0.2, 0.6, 14], "vase"), prim("vase-s", "cylinder", [-5.5, 1.2, 10.6], [0.14, 0.2, 0.6, 14], "vase"));

// ---------------------------------------------------------------- her dais
solid.push(boxMM("dais", [11, 0, -4], [16, 0.3, 4], "marbleBlack"));
decor.push(boxMM("dais-edge", [10.98, 0.28, -4], [11.02, 0.3, 4], "brass"));
solid.push(boxMM("desk", [13.0, 0.3, -1.6], [14.2, 1.1, 1.6], "desk", { data: { surface: "wood" } }));
decor.push(boxMM("desk-top", [12.95, 1.1, -1.65], [14.25, 1.14, 1.65], "marbleBlack"), boxMM("desk-lamp", [13.3, 1.14, -1.3], [13.45, 1.55, -1.15], "lampWarm"));
// (the screen itself, her call on it, is BossView's: it goes dark when she steps into the fight)
decor.push(boxMM("screen-frame", [15.97, 1.5, -3.5], [16.0, 5.0, 3.5], "brassDark"));
decor.push(boxMM("chair-boss", [14.6, 0.3, -0.5], [15.4, 1.0, 0.5], "velvet"), boxMM("chair-boss-back", [15.2, 1.0, -0.5], [15.45, 1.9, 0.5], "velvet"));

// ---------------------------------------------------------------- lamps
for (const [x, z] of [[-12, -9], [-12, 9], [4, -10], [12, -9], [12, 9]]) {
  decor.push(prim(`lamp-pole-${x}-${z}`, "cylinder", [x, 0.8, z], [0.03, 0.05, 1.6, 8], "brassDark"));
  decor.push(prim(`lamp-shade-${x}-${z}`, "cylinder", [x, 1.72, z], [0.2, 0.28, 0.3, 14], "lampWarm"));
}
decor.push(boxMM("cove-n", [-16, H - 0.1, -10.98], [16, H - 0.04, -10.9], "cove"), boxMM("cove-s", [-16, H - 0.1, 10.9], [16, H - 0.04, 10.98], "cove"));

// ---------------------------------------------------------------- markers
const doorAdds = (side: "a" | "b", z: number, kinds: string[]): Node[] => kinds.map((k, i) => {
  const x = -1.8 + (i % 4) * 1.2, zz = z + (side === "a" ? -1 : 1) * Math.floor(i / 4) * 1.1;
  return marker(`add-${side}-${i + 1}`, "enemy", [x, 0, zz], { kind: k, group: side === "a" ? "doorA" : "doorB", ...(k === "heavy" ? { model: "rival723" } : {}), deaf: true }, side === "a" ? FACE_S : FACE_N);
});
const markers: Node[] = [
  marker("spawn", "spawn", [-14.8, 0, 0], {}, FACE_E),
  marker("checkpoint-0", "checkpoint", [-14.8, 0, 0], {}, FACE_E),
  // Madame Pockit behind her desk (she keeps the bag there)
  marker("madame", "enemy", [15.0, 0.3, 0.9], { kind: "madame", drop: false }, FACE_W),
  ...doorAdds("a", -12.2, ["goon", "goon", "rusher", "goon", "rusher", "goon", "rusher", "goon"]),
  ...doorAdds("b", 12.2, ["rusher", "rusher", "heavy", "rusher", "goon", "goon", "rusher"]),
  // her guards: in the hall from the start (the fight opens on them while she says her piece)
  marker("guard-1", "enemy", [-6.2, 0, -6.6], { kind: "goon", group: "guards" }, FACE_W),
  marker("guard-2", "enemy", [4.4, 0, 7.0], { kind: "goon", group: "guards" }, FACE_W),
  marker("guard-3", "enemy", [-3.6, 0, 5.6], { kind: "rusher", group: "guards" }, FACE_W),
  marker("guard-4", "enemy", [6.4, 0, -6.4], { kind: "goon", group: "guards" }, FACE_W),
  // the fight starts when he steps away from the lift (or fires first)
  marker("trigger-hall", "trigger", [-12.2, 1, 0], { action: "alert" }, 0, [1.6, 3, 21]),
  // cover points (facing = the direction they protect toward)
  marker("cv-sofa-n", "cover", [0, 0, -4.3], { height: "low" }, FACE_S),
  marker("cv-sofa-n-w", "cover", [-2.8, 0, -3.35], { height: "low" }, FACE_E),
  marker("cv-sofa-s", "cover", [0, 0, 4.3], { height: "low" }, FACE_N),
  marker("cv-sofa-s-e", "cover", [2.8, 0, 3.35], { height: "low" }, FACE_W),
  marker("cv-piano", "cover", [-8.6, 0, -7.95], { height: "low" }, FACE_S),
  marker("cv-piano-w", "cover", [-10.3, 0, -6.5], { height: "low" }, FACE_E),
  marker("cv-bar-w", "cover", [4.5, 0, 8.0], { height: "low" }, FACE_E),
  marker("cv-bar", "cover", [8, 0, 8.95], { height: "low" }, FACE_N),
  marker("cv-desk", "cover", [14.7, 0.3, -0.9], { height: "low" }, FACE_W),
  marker("cv-p1", "cover", [-9, 0, -4.85], { height: "high", side: "right" }, FACE_S),
  marker("cv-p2", "cover", [9.85, 0, -4], { height: "high", side: "left" }, FACE_W),
  marker("cv-p3", "cover", [-9, 0, 4.85], { height: "high", side: "left" }, FACE_N),
  marker("cv-p4", "cover", [9.85, 0, 4], { height: "high", side: "right" }, FACE_W),
  marker("cv-p2-n", "cover", [9, 0, -4.85], { height: "high", side: "left" }, FACE_S),
  marker("cv-p4-s", "cover", [9, 0, 4.85], { height: "high", side: "right" }, FACE_N),
  marker("cv-chair-e", "cover", [5.65, 0, 0], { height: "low" }, FACE_W),
  marker("cv-chair-w", "cover", [-5.65, 0, 0], { height: "low" }, FACE_E),
  marker("cv-console-n", "cover", [-4.5, 0, -9.85], { height: "low" }, FACE_S),
  // (her side of the west half: she works the room toward him from these)
  marker("cv-piano-e", "cover", [-6.9, 0, -6.5], { height: "low" }, FACE_W),
  marker("cv-p1-e", "cover", [-7.95, 0, -4], { height: "high", side: "left" }, FACE_W),
  marker("cv-p3-e", "cover", [-7.95, 0, 4], { height: "high", side: "right" }, FACE_W),
  marker("cv-chair-w-e", "cover", [-3.85, 0, 0], { height: "low" }, FACE_W),
  marker("cv-sofa-n-e", "cover", [2.8, 0, -3.35], { height: "low" }, FACE_W),
  // waypoints (a grid over the hall; the doors link across explicitly: they are shut when the graph is built)
  ...([
    ["v2", -15.0, 0],
    ["a1", -12.5, -6.5], ["a2", -12.5, 0], ["a3", -12.5, 6.5], ["a4", -12.5, -10],
    ["b1", -6.5, -8.8], ["b2", -6.5, -1.8], ["b3", -6.5, 2.2], ["b4", -6.5, 7.6],
    ["c1", 0, -8], ["c2", -3.4, -5.2], ["c3", 3.4, -5.2], ["c4", 0, 0], ["c5", -3.4, 5.2], ["c6", 3.4, 5.2], ["c7", 0, 8],
    ["d1", 6.5, -8.8], ["d2", 6.5, -1.8], ["d3", 6.5, 2.2], ["d4", 3.8, 10], ["d5", 11.6, 10],
    ["e1", 11.8, -7.6], ["e2", 12.2, -2.6], ["e3", 12.2, 2.6], ["e4", 11.8, 7.2], ["e5", 15.0, -2.6], ["e6", 15.0, 2.6], ["e7", 15.2, 6.3],
  ] as Array<[string, number, number]>).map(([id, x, z]) => marker(`wp-${id}`, "waypoint", [x, id.startsWith("e") && Math.abs(z) < 4 && x > 11 ? 0.3 : 0, z])),
  marker("wp-door-a-in", "waypoint", [0, 0, -10.2], { links: ["wp-door-a-out"], door: "door-a" }),
  marker("wp-door-a-out", "waypoint", [0, 0, -12.4], {}),
  marker("wp-door-b-in", "waypoint", [0, 0, 10.2], { links: ["wp-door-b-out"], door: "door-b" }),
  marker("wp-door-b-out", "waypoint", [0, 0, 12.4], {}),
  // pickups: copium (by the lift x 2, behind the piano, behind the bar), the shotgun behind the bar,
  // the SMGs by the piano
  marker("copium-v1", "pickup", [-15.3, 0, -1.8], { item: "copium", amount: 1 }),
  marker("copium-v2", "pickup", [-15.3, 0, 1.8], { item: "copium", amount: 1 }),
  marker("copium-piano", "pickup", [-8.4, 0, -8.6], { item: "copium", amount: 1 }),
  marker("copium-bar", "pickup", [9.6, 0, 9.2], { item: "copium", amount: 1 }),
  marker("shotgun-bar", "pickup", [6.4, 0, 9.2], { item: "shotgun" }),
  marker("smgs-piano", "pickup", [-10.6, 0, -5.4], { item: "smgs" }),
  // the arsenal: two frags behind the bar (her adds drop their own guns)
  marker("grenades-bar", "pickup", [8.0, 0, 9.2], { item: "grenade", amount: 2 }),
  // lights: the chandelier's warm glow, lamps, the bar's amber, the screen, a cool spill from the glass
  ...([
    // (the chandelier's own light is BossView's: it falls with it)
    ["lamp-nw", -12, 2.2, -9, "#ffc98a", 8, 7], ["lamp-sw", -12, 2.2, 9, "#ffc98a", 8, 7],
    ["lamp-n", 4, 2.2, -10, "#ffc98a", 8, 7], ["lamp-ne", 12, 2.2, -9, "#ffc98a", 8, 7], ["lamp-se", 12, 2.2, 9, "#ffc98a", 8, 7],
    ["bar", 8, 1.4, 9.0, "#ffae4a", 10, 7], ["screen", 14.4, 3.2, 0, "#c9a8ff", 12, 9], ["glass-n", 14, 3, -8, "#8fa6d8", 10, 12], ["glass-s", 14, 3, 8, "#8fa6d8", 10, 12],
    ["lift", -15.2, 2.8, 0, "#ffd29a", 6, 6], ["piano", -8, 3.2, -6, "#ffe0b8", 8, 8],
  ] as Array<[string, number, number, number, string, number, number]>).map(([id, x, y, z, color, intensity, distance]) => marker(`light-${id}`, "light", [x, y, z], { color, intensity, distance })),
  // camera shots (?cam=<id> in dev builds)
  marker("cam-hall", "camera", [-14.5, 1.8, 0.6], { at: [12, 1.3, 0] }),
  marker("cam-dais", "camera", [6, 1.7, -2.5], { at: [15, 1.5, 0.5] }),
  marker("cam-rug", "camera", [-6, 2.2, 5], { at: [0, 1.5, 0] }),
  marker("cam-door-a", "camera", [3, 1.7, -3], { at: [0, 1.5, -11] }),
];

// ---------------------------------------------------------------- materials
const P = "/textures/penthouse/";
const materials: Record<string, Record<string, unknown>> = {
  marbleBlack: tex(`${P}floor_marble_black.webp`, 2, { roughness: 0.25 }),
  ebony: tex(`${P}wall_ebony_slats.webp`, 2, { roughness: 0.55 }),
  ebonyDark: tex(`${P}wall_ebony_slats.webp`, 2, { roughness: 0.5, color: "#aaaaaa" }),
  damask: tex(`${P}wall_damask.webp`, 1, { roughness: 0.8 }),
  coffered: tex(`${P}ceiling_coffered.webp`, 3, { roughness: 0.9 }),
  rug: { color: "#ffffff", texture: `${P}rug_fur_white.webp`, roughness: 1.0 },
  onyx: glow("#ffffff", 0.5, "", `${P}bar_onyx.webp`),
  skyline: glow("#ffffff", 0.35, "", `${P}window_skyline.webp`),
  doorDouble: { color: "#ffffff", texture: `${P}door_double.webp`, roughness: 0.4 },
  sofa: { color: "#e6e1d8", roughness: 0.85 },
  piano: { color: "#f1eee8", roughness: 0.2 },
  pillar: { color: "#1c1a1a", roughness: 0.3, metalness: 0.1 },
  brass: { color: "#b08a4a", roughness: 0.3, metalness: 0.85 },
  brassDark: { color: "#5a4a30", roughness: 0.35, metalness: 0.8 },
  barShelf: { color: "#2a2018", roughness: 0.5 },
  desk: { color: "#1e1715", roughness: 0.35 },
  velvet: { color: "#4a1420", roughness: 0.9 },
  vase: { color: "#d6cfc4", roughness: 0.2 },
  terrace: { color: "#2a2c30", roughness: 0.6 },
  glass: { color: "#9fb4c8", roughness: 0.1, metalness: 0.2 },
  // lit
  lampWarm: glow("#ffc98a", 1.1),
  cove: glow("#ffb870", 0.7),
};

writeLevel("room5", "Room 5: the penthouse", {
  name: "The Penthouse", number: 5, cutsceneAfter: "c4", music: "penthouse", look: "penthouse", footsteps: "hard", tutorial: false,
  clearLine: "", later: ["doorA", "doorB"], chapterEnd: true,
  boss: {
    chandelier: [0, 5.3, 0], rug: [0, 0, 2.4], bag: [14.6, -2.4], terrace: [15.3, 6.3],
    doors: [{ door: "door-a", group: "doorA" }, { door: "door-b", group: "doorB" }],
  },
}, materials, solid, decor, markers);
