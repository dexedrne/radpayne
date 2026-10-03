// Writes public/levels/room9.json: room 9, the counting floor on the crown of the tallest tower (chapter
// 2). The starting point for hand-tuning in the editor (/?editor=room9); re-running it OVERWRITES the file.
//   node tools/room9.ts && npm run check-level room9
//
// Layout (metres; the floor is x -26..26, z -18..18, 7 m high; he comes in off the airship's gangway from
// the west, facing east):
//   the trading floor   x -24..16: five rows of trading desks (low) with aisles across them, pillars
//   the offices         south-west: two glass offices; in the first, a filing wall slides (E) on the safe
//                       room (a secret: a pin); the second has a door in its back wall on the back stair
//   the partition       x 16: a low wall with armoured glass over it, three openings; the shutters drop
//                       into them at 8 down (sim/ch2/counting.ts) and the way east is the catwalk
//   the catwalk         along the north wall at y 3.6, over the partition, a stair at each end
//   the board room      x 16..26: the scoreboard over the east wall (its maintenance panel breaks: a
//                       secret), the boardroom table, the money counters; the vault corridor's door (out)
//   the blackout        at 7 down (Hard 10) the lights go for 14 s (the screens and every girl's rim stay lit)
// Cover: the desk rows, pillars, server cabinets (by the dock where he comes in, in the board room, either
// side of the vault corridor's door), the boardroom table, the money counters.
// Hostiles 17 on Normal, 28 on Hard, 36 on Hardcore; a checkpoint at 9 down (Hard 12). The waves come
// in by the arrivals' rule (sim/arrive.ts) through the vault corridor, the back stair (through the
// offices) and the gangway behind him, each with the others to fall back on (room.arrive).
import { FACE_E, FACE_N, FACE_S, FACE_W, glow, marker, tex, writeLevel, type V3 } from "./levelKit.ts";
import { RoomKit } from "./levels/kit2.ts";

const k = new RoomKit();
const H = 7, CY = 3.6;

// ---------------------------------------------------------------- the shell
k.box("floor", [-34, -0.5, -18], [30, 0, 18], "carpet");
k.box("ceil", [-26, H, -18.2], [26.2, H + 0.3, 18.2], "ceilTile");
k.box("wall-n", [-26, 0, -18.2], [26.2, H, -18], "wallDark");
k.box("wall-s1", [-26, 0, 18], [-18.8, H, 18.2], "wallDark");
k.box("wall-s2", [-17.2, 0, 18], [26.2, H, 18.2], "wallDark");
k.box("wall-s-door", [-18.8, 2.4, 18], [-17.2, H, 18.2], "wallDark");
// the back stair behind the second office (a way in)
k.box("bs-floor", [-20, -0.5, 18.2], [-16, 0, 22.2], "carpet");
k.box("bs-w", [-20, 0, 18.2], [-19.8, 3, 22], "steel");
k.box("bs-e", [-16.2, 0, 18.2], [-16, 3, 22], "steel");
k.box("bs-back", [-20, 0, 22], [-16, 3, 22.2], "steel");
k.box("bs-roof", [-20, 3, 18.2], [-16, 3.2, 22.2], "steel");
k.deco("bs-stairs", [-19.6, 0, 21], [-16.4, 1.2, 21.9], "grate");
k.box("wall-w1", [-26.2, 0, -18.2], [-26, H, -1.6], "wallDark");
k.box("wall-w2", [-26.2, 0, 1.6], [-26, H, 18.2], "wallDark");
k.box("wall-w-top", [-26.2, 2.8, -1.6], [-26, H, 1.6], "wallDark");
k.box("wall-e1", [26, 0, -18.2], [26.2, H, -1.4], "wallDark");
k.box("wall-e2", [26, 0, 1.4], [26.2, H, 18.2], "wallDark");
k.box("wall-e-top", [26, 2.8, -1.4], [26.2, H, 1.4], "wallDark");
// the scoreboard over the east wall (decor: the look scrolls nothing; its screens glow), the ticker
k.deco("board", [25.8, 3.2, -16], [25.95, 6.8, 16], "board");
k.deco("ticker", [25.8, 2.6, -16], [25.95, 3.1, 16], "ticker");
for (const [id, z] of [["n", -18], ["s", 18]] as const) k.deco(`window-${id}`, [-26, 4, z === -18 ? -18.02 : 17.95], [26, 6.6, z === -18 ? -17.95 : 18.02], "windowSky");
// the gangway dock (west) and the vault corridor (east, the way out)
k.box("dock-n", [-34, 0, -3.2], [-26.2, 3, -3], "steel");
k.box("dock-s", [-34, 0, 3], [-26.2, 3, 3.2], "steel");
k.box("dock-w", [-34.2, 0, -3.2], [-34, 3, 3.2], "steel");
k.box("dock-roof", [-34.2, 3, -3.2], [-26.2, 3.2, 3.2], "steel");
k.box("vc-n", [26.2, 0, -1.6], [30, 3, -1.4], "steel");
k.box("vc-s", [26.2, 0, 1.4], [30, 3, 1.6], "steel");
k.box("vc-e", [30, 0, -1.6], [30.2, 3, 1.6], "vaultGlow");
k.box("vc-roof", [26.2, 3, -1.6], [30.2, 3.2, 1.6], "steel");

// ---------------------------------------------------------------- the trading desks (five rows along Z)
for (const x of [-18, -12, -6, 0, 6]) {
  for (const [z0, z1] of [[-15, -9.6], [-6.8, -1.3], [1.3, 6.8], [9.6, 15]] as const) {
    if (x === -18 && z0 > 9) continue; // (the offices)
    k.cover(`desk-${x}-${z0}`, [x - 0.7, 0, z0], [x + 0.7, 1.0, z1], "desk", { data: { surface: "wood" } }, { faces: ["e", "w"] });
    for (let z = z0 + 0.7; z < z1; z += 1.4) k.deco(`mon-${x}-${z.toFixed(1)}`, [x - 0.08, 1.0, z - 0.45], [x + 0.08, 1.55, z + 0.45], "monitor");
  }
}
for (const [x, z] of [[-15, -8.1], [-15, 8.1], [-3, -8.1], [-3, 8.1], [9, -8.1], [9, 8.1], [-9, 0], [3, 0]]) k.cover(`pillar-${x}-${z}`, [x - 0.45, 0, z - 0.45], [x + 0.45, H, z + 0.45], "pillar");
// server cabinets (high): by the dock where he comes in
// (each long face a rack front, its status LEDs lit: they read in the dark and in the blackout)
const racks = (id: string, x0: number, z0: number) => {
  k.deco(`${id}-rack-w`, [x0 - 0.02, 0.04, z0 + 0.06], [x0, 1.96, z0 + 1.94], "rack");
  k.deco(`${id}-rack-e`, [x0 + 0.8, 0.04, z0 + 0.06], [x0 + 0.82, 1.96, z0 + 1.94], "rack");
};
for (const [id, z0] of [["srv-dock-n", -6], ["srv-dock-s", 4]] as const) {
  k.cover(id, [-23.5, 0, z0], [-22.7, 2.0, z0 + 2], "counter", { data: { surface: "metal" } });
  racks(id, -23.5, z0);
}

// ---------------------------------------------------------------- the offices (south-west, glass)
k.box("of-n1", [-24, 0, 9.8], [-21.4, 3, 10], "glassWall", { data: { surface: "glass" } });
k.box("of-n2", [-19.8, 0, 9.8], [-16, 3, 10], "glassWall", { data: { surface: "glass" } });
k.box("of-e", [-16.2, 0, 9.8], [-16, 3, 18], "glassWall", { data: { surface: "glass" } });
k.box("of-mid", [-20.1, 0, 14], [-19.9, 3, 18], "glassWall", { data: { surface: "glass" } });
k.box("of-roof", [-26, 3, 9.8], [-16, 3.2, 18], "ceilTile");
k.box("of-n-top", [-21.4, 2.3, 9.8], [-19.8, 3, 10], "glassWall", { data: { surface: "glass" } });
k.cover("of-desk-1", [-24.5, 0, 12.6], [-22.4, 0.8, 13.6], "desk", { data: { surface: "wood" } });
k.cover("of-desk-2", [-18.8, 0, 12.6], [-16.8, 0.8, 13.6], "desk", { data: { surface: "wood" } });
// the first office's filing wall slides on the safe room behind (west wall)
k.box("safe-n", [-29, 0, 13.8], [-26.2, 3, 14], "wallDark");
k.box("safe-s", [-29, 0, 17.8], [-26.2, 3, 18], "wallDark");
k.box("safe-w", [-29.2, 0, 13.8], [-29, 3, 18], "wallDark");
k.box("safe-roof", [-29.2, 3, 13.8], [-26.2, 3.2, 18], "wallDark");
k.solid.splice(k.solid.findIndex(n => n.id === "wall-w2"), 1);
k.boxes.splice(k.boxes.findIndex(b => b.id === "wall-w2"), 1);
k.box("wall-w2", [-26.2, 0, 1.6], [-26, H, 14.4], "wallDark");
k.box("wall-w3", [-26.2, 0, 17.4], [-26, H, 18.2], "wallDark");
k.box("wall-w-safe-top", [-26.2, 2.4, 14.4], [-26, H, 17.4], "wallDark");
k.box("filing", [-26.18, 0, 14.4], [-26.02, 2.4, 17.4], "filing", { data: { secretDoor: "safe", open: "slide", slide: [0, -3], surface: "metal" } });

// ---------------------------------------------------------------- the partition, the shutters
const PX = 16;
const gaps: Array<[number, number]> = [[-12, -9], [-1.5, 1.5], [9, 12]];
const edges = [-18, ...gaps.flat(), 18];
for (let i = 0; i < edges.length; i += 2) {
  k.cover(`part-${i / 2}`, [PX - 0.15, 0, edges[i]], [PX + 0.15, 1.1, edges[i + 1]], "wallDark", {}, { faces: ["w", "e"] });
  k.box(`part-glass-${i / 2}`, [PX - 0.05, 1.1, edges[i]], [PX + 0.05, 3.3, edges[i + 1]], "armorGlass", { data: { surface: "glass" } });
}
gaps.forEach(([z0, z1], i) => {
  k.box(`shutter-${i + 1}`, [PX - 0.1, 0, z0], [PX + 0.1, 3.3, z1], "shutter", { data: { surface: "metal" } });
  k.deco(`shutter-box-${i + 1}`, [PX - 0.3, 3.3, z0 - 0.1], [PX + 0.3, 3.7, z1 + 0.1], "steel");
});

// ---------------------------------------------------------------- the catwalk (north, y 3.6) and its stairs
k.box("cw-deck", [-24, CY - 0.2, -18], [24.4, CY, -15.4], "grate", { data: { surface: "metal" } });
k.box("cw-rail", [-18.4, CY, -15.5], [22.6, CY + 1.0, -15.4], "rail", { data: { shootThrough: true, surface: "metal" } });
for (const x of [-12, -4, 4, 12, 20]) k.box(`cw-leg-${x}`, [x - 0.15, 0, -15.7], [x + 0.15, CY - 0.2, -15.4], "steel", { data: { surface: "metal" } });
k.stairs("cw-st-w", -19.2, -15.4, "s", 12, 0.3, 0.8, 1.6, CY, "grate");
k.stairs("cw-st-e", 23.4, -15.4, "s", 12, 0.3, 0.8, 1.6, CY, "grate");
k.box("cw-st-w-rail", [-20.15, 0, -15.4], [-20, CY + 1, -6], "rail", { data: { shootThrough: true } });
k.box("cw-st-e-rail", [22.45, 0, -15.4], [22.6, CY + 1, -6], "rail", { data: { shootThrough: true } });
k.box("cw-st-w-rail2", [-18.4, 0, -15.4], [-18.25, CY + 1, -6], "rail", { data: { shootThrough: true } });
k.box("cw-st-e-rail2", [24.2, 0, -15.4], [24.35, CY + 1, -6], "rail", { data: { shootThrough: true } });
// (a roof hatch's corner at the catwalk's west end: a secret)
k.cover("cw-crates", [-23.6, CY, -17.8], [-22.2, CY + 1.0, -16.6], "crate", { data: { surface: "wood" } }, { faces: ["e"] });

// ---------------------------------------------------------------- the board room
k.cover("table", [19, 0, -3], [22.6, 0.95, 3], "tableDark", { data: { surface: "wood" } });
// server cabinets in the board room, and either side of the vault corridor's door
for (const [id, x0, z0] of [["srv-br-n", 17.2, -6.4], ["srv-br-s", 17.2, 4.4], ["srv-vc-n", 24.6, -5.2], ["srv-vc-s", 24.6, 3.2]] as const) {
  k.cover(id, [x0, 0, z0], [x0 + 0.8, 2.0, z0 + 2], "counter", { data: { surface: "metal" } });
  racks(id, x0, z0);
}
for (const [id, x, z] of [["m1", 19.5, -10], ["m2", 22.5, -10], ["m3", 19.5, 10], ["m4", 22.5, 10]] as const) k.cover(`counter-${id}`, [x - 0.9, 0, z - 0.6], [x + 0.9, 1.1, z + 0.6], "counter", { data: { surface: "metal" } });
k.cover("bin-n", [24.4, 0, -14.4], [25.6, 1.6, -12.8], "steel", { data: { surface: "metal" } }, { faces: ["n", "s", "w"] });
k.box("board-panel", [25.6, 0, 6], [25.9, 1.4, 8], "steel", { data: { breakable: 30, surface: "metal", secret: "secret-panel", drop: "grenade", amount: 3 } });

// ---------------------------------------------------------------- secrets, waypoints
k.volume("secret-safe", "secret", [-29, 0, 14], [-26.2, 2.4, 17.8], { name: "the safe room" });
k.volume("secret-panel", "secret", [25.6, 0, 6], [25.9, 1.4, 8], { name: "behind the ticker", via: "break" });
k.volume("secret-hatch", "secret", [-24, CY, -18], [-21.6, CY + 2, -15.4], { name: "the roof hatch" });
k.grid("floor", -24, 24.5, -16, 16, 3, 0, (x, z) => Math.abs(x - PX) < 0.8 || (x < -15.5 && z > 9.5));
// (the offices' doorway, x -21.4..-19.8 in their glass front: through its middle, clear of both panes;
// in each office round the east / west end of its desk to the back: the back stair's way in)
k.wp("of-1", [-22.4, 0, 11.6], ["of-door", "of-1e"]);
k.wp("of-1-out", [-20.6, 0, 8.6], ["of-door"]);
k.wp("of-door", [-20.6, 0, 9.9], ["of-1-out", "of-1", "of-2"]);
k.wp("of-1e", [-21.5, 0, 12.2], ["of-1", "of-1s"]);
k.wp("of-1s", [-21.5, 0, 14.3], ["of-1e", "of-1b"]);
k.wp("of-1b", [-24, 0, 16], ["of-1s", "safe-in"]);
k.wp("of-2", [-18, 0, 11.6], ["of-door", "of-2w"]);
k.wp("of-2w", [-19.35, 0, 12.2], ["of-2", "of-2s"]);
k.wp("of-2s", [-19.35, 0, 14.3], ["of-2w", "of-2b"]);
k.wp("of-2b", [-18, 0, 16], ["of-2s", "bs-in"]);
k.wp("bs-in", [-18, 0, 19.6], ["of-2b", "bs-back"]);
k.wp("bs-back", [-18, 0, 21], ["bs-in"]);
k.wp("safe-in", [-27.6, 0, 15.9], ["of-1b"], { door: "filing" });
gaps.forEach(([z0, z1], i) => {
  k.wp(`gap-${i}-w`, [PX - 1.4, 0, (z0 + z1) / 2], [`gap-${i}-e`]);
  k.wp(`gap-${i}-e`, [PX + 1.4, 0, (z0 + z1) / 2], [`gap-${i}-w`], { door: `shutter-${i + 1}` });
});
k.wp("dock-1", [-28.4, 0, 0], ["dock-2", "dock-3"]);
k.wp("dock-2", [-24.6, 0, 0], ["dock-1"]);
k.wp("dock-3", [-32.6, 0, 0], ["dock-1"]);
k.wp("vc-in", [28, 0, 0], ["vc-out"]);
k.wp("vc-out", [24.6, 0, 0], ["vc-in"]);
k.wp("cw-w-bot", [-19.2, 0, -5], ["cw-w-mid"]);
k.wp("cw-w-mid", [-19.2, 1.8, -9.8], ["cw-w-bot", "cw-w-top"]);
k.wp("cw-w-top", [-19.4, CY, -16.8], ["cw-w-mid", "cw-1", "cw-hatch"]);
k.wp("cw-hatch", [-22.8, CY, -16], ["cw-w-top"]);
k.wp("cw-1", [-8, CY, -16.8], ["cw-w-top", "cw-2"]);
k.wp("cw-2", [8, CY, -16.8], ["cw-1", "cw-3"]);
k.wp("cw-3", [23.4, CY, -16.8], ["cw-2", "cw-e-mid"]);
k.wp("cw-e-mid", [23.4, 1.8, -9.8], ["cw-3", "cw-e-bot"]);
k.wp("cw-e-bot", [23.4, 0, -5], ["cw-e-mid"]);

// ---------------------------------------------------------------- the gang (Normal 17, Hard 28, Hardcore 36)
const E = (id: string, x: number, y: number, z: number, yaw: number, d: Record<string, unknown> = {}) => marker(id, "enemy", [x, y, z], { kind: "goon", ...d }, yaw);
k.m(
  // at the desks
  E("t-1", -15, 0, -4, FACE_W), E("t-2", -15, 0, 4, FACE_W), E("t-3", -9, 0, -11, FACE_W, { minDiff: "hard" }), E("t-4", -9, 0, 11.5, FACE_W, { minDiff: "hard" }),
  E("t-5", -3, 0, -3, FACE_W), E("t-6", -3, 0, 4.5, FACE_W, { kind: "rusher" }), E("t-7", 3, 0, -12, FACE_W, { minDiff: "hardcore" }), E("t-8", 3, 0, 12, FACE_W, { minDiff: "hardcore" }),
  E("t-9", -2, CY, -16.6, FACE_S, { perch: true, weapon: "sniper" }), E("t-10", 10, CY, -16.6, FACE_S, { minDiff: "hard" }),
  // the board room from the start (behind the partition)
  E("r-1", 20.4, 0, -6, FACE_W, { minDiff: "hard" }), E("r-2", 20.4, 0, 6, FACE_W, { minDiff: "hardcore" }), E("r-3", 24, 0, 0, FACE_W, { kind: "heavy", model: "rival652" }),
  // wave A (3 down): up the back stair, through the offices
  E("a-1", -18.8, 0, 19.6, FACE_N, { group: "waveA" }), E("a-2", -17.2, 0, 19.6, FACE_N, { group: "waveA", kind: "rusher" }), E("a-3", -18.8, 0, 21.2, FACE_N, { group: "waveA", minDiff: "hard" }), E("a-4", -17.2, 0, 21.2, FACE_N, { group: "waveA", minDiff: "hard" }),
  // wave B (5 down, Hard 7): the vault corridor into the board room
  E("b-1", 28.4, 0, -0.6, FACE_W, { group: "waveB" }), E("b-2", 29.4, 0, 0.6, FACE_W, { group: "waveB", kind: "rusher" }), E("b-3", 27.6, 0, -0.6, FACE_W, { group: "waveB", minDiff: "hard" }),
  E("b-4", 29.4, 0, -0.6, FACE_W, { group: "waveB", weapon: "sniper", minDiff: "hard" }), E("b-5", 27.6, 0, 0.6, FACE_W, { group: "waveB", minDiff: "hardcore" }),
  // wave C (9 down, Hard 12): off the gangway behind him
  E("c-1", -31, 0, -1.4, FACE_E, { group: "waveC", kind: "rusher" }), E("c-2", -31, 0, 1.4, FACE_E, { group: "waveC", kind: "rusher" }), E("c-3", -33, 0, 0, FACE_E, { group: "waveC", kind: "rusher", minDiff: "hardcore" }), E("c-4", -29.4, 0, 0, FACE_E, { group: "waveC" }),
  // wave D (11 down, Hard 16): the vault corridor
  E("d-1", 28.2, 0, 0, FACE_W, { group: "waveD", kind: "heavy", model: "rival723", weapon: "handcannon" }), E("d-2", 29.4, 0, -0.8, FACE_W, { group: "waveD" }), E("d-3", 29.4, 0, 0.8, FACE_W, { group: "waveD", minDiff: "hard" }),
  E("d-4", 27, 0, -0.8, FACE_W, { group: "waveD", kind: "rusher", minDiff: "hard" }), E("d-5", 27, 0, 0.8, FACE_W, { group: "waveD", kind: "rusher", minDiff: "hardcore" }),
  // wave E (14 down, Hard 21): the back stair and the vault corridor
  E("e-1", -18.8, 0, 20.4, FACE_N, { group: "waveE", minDiff: "hardcore" }), E("e-2", 27, 0, 0, FACE_W, { group: "waveE", kind: "rusher", minDiff: "hard" }), E("e-3", -17.2, 0, 20.4, FACE_N, { group: "waveE", kind: "rusher", minDiff: "hardcore" }),
  E("e-4", -18, 0, 21.2, FACE_N, { group: "waveE" }), E("e-5", 28.4, 0, 0, FACE_W, { group: "waveE", kind: "heavy", model: "rival652" }),
);

// ---------------------------------------------------------------- triggers, pickups, eggs, lights
const T = (id: string, pos: V3, data: Record<string, unknown>, scale: V3 = [1, 1, 1]) => marker(id, "trigger", pos, data, 0, scale);
k.m(
  marker("spawn", "spawn", [-27.4, 0, 0], {}, FACE_E),
  marker("cp-mid", "checkpoint", [-20.4, 0, -3], {}, FACE_E),
  T("t-alert", [-24, 1, 0], { action: "alert" }, [3, 3, 34]),
  T("t-shutters", [0, 1, 0], { action: "setpiece", cue: "shutters", afterKills: { normal: 5, hard: 7 } }),
  T("t-dark", [0, 1, 0], { action: "setpiece", cue: "dark", afterKills: { normal: 7, hard: 10 } }),
  T("t-waveA", [0, 1, 0], { action: "spawn", group: "waveA", afterKills: { normal: 3, hard: 3 } }),
  T("t-waveB", [0, 1, 0], { action: "spawn", group: "waveB", afterKills: { normal: 5, hard: 7 } }),
  T("t-cp", [0, 1, 0], { action: "checkpoint", at: "cp-mid", afterKills: { normal: 9, hard: 12 } }),
  T("t-waveC", [0, 1, 0], { action: "spawn", group: "waveC", afterKills: { normal: 9, hard: 12 } }),
  T("t-waveD", [0, 1, 0], { action: "spawn", group: "waveD", afterKills: { normal: 11, hard: 16 } }),
  T("t-waveE", [0, 1, 0], { action: "spawn", group: "waveE", afterKills: { normal: 14, hard: 21 } }),
  T("t-exit", [28.6, 1, 0], { action: "exit" }, [2.6, 3, 2.8]),
  marker("exit", "exit", [26.6, 0, 0]),
  marker("cop-1", "pickup", [-24.5, 0, -6], { item: "copium" }), marker("cop-2", "pickup", [-9, 0, 8.1], { item: "copium" }),
  marker("cop-3", "pickup", [3, 0, -8.1], { item: "copium" }), marker("cop-4", "pickup", [18.4, 0, 15], { item: "copium" }), marker("cop-5", "pickup", [0, CY, -17.2], { item: "copium" }),
  marker("sniper", "pickup", [-14, CY, -17.4], { item: "sniper" }),
  marker("rifle", "pickup", [-18, 0.8, 13.1], { item: "rifle" }),
  marker("smgs", "pickup", [9, 0, 0], { item: "smgs" }),
  marker("nades", "pickup", [-24.6, 0, 7.6], { item: "grenade", amount: 2 }),
  marker("pin-g3171", "pickup", [-27.6, 0, 16.8], { item: "pin", pin: "g3171", behind: "filing" }),
  marker("safe-copium", "pickup", [-27.6, 0, 14.8], { item: "copium", amount: 2, behind: "filing" }),
  marker("hatch-cannon", "pickup", [-23, CY, -15.9], { item: "handcannon" }),
  marker("hatch-ammo", "pickup", [-21.9, CY, -17.4], { item: "handcannon_ammo", amount: 14 }),
  marker("egg-sticker", "egg", [-6, 1.0, 3.5], { egg: "sticker" }, FACE_E),
  marker("egg-duck", "egg", [-22.9, 0.8, 13.1], { egg: "duck", interact: true }, FACE_N),
  ...([
    ["f-1", -16, 6, -8, "#dfe8ff", 8, 16], ["f-2", -16, 6, 8, "#dfe8ff", 8, 16], ["f-3", -2, 6, -8, "#dfe8ff", 8, 16], ["f-4", -2, 6, 8, "#dfe8ff", 8, 16],
    ["f-5", 10, 6, 0, "#dfe8ff", 8, 16], ["board", 22, 4.5, 0, "#7fd4ff", 10, 14], ["of", -20, 2.7, 14, "#ffe0b0", 4, 8], ["cw", 0, CY + 2, -16.6, "#dfe8ff", 5, 14],
    ["dock", -30, 2.6, 0, "#8fc0ff", 4, 7], ["vc", 28.4, 2.6, 0, "#ffc860", 5, 7], ["safe", -27.6, 2.6, 15.9, "#ffc07a", 2, 4], ["bs", -18, 2.6, 20, "#ffe0b0", 3, 6],
  ] as Array<[string, number, number, number, string, number, number]>).map(([id, x, y, z, color, intensity, distance]) => marker(`light-${id}`, "light", [x, y, z], { color, intensity, distance, dim: true })),
  marker("cam-floor", "camera", [-24, 3, 8], { at: [4, 1, -2] }),
  marker("cam-board", "camera", [14, 3, 12], { at: [25, 4.5, 0] }),
  marker("cam-catwalk", "camera", [-10, 5, -12], { at: [10, CY, -16.6] }),
  // the cover (screenshot shots: ?cam=cam-cover-dock etc.)
  marker("cam-cover-dock", "camera", [-25.4, 2.6, -9], { at: [-20, 0.8, 2] }),
  marker("cam-cover-desks", "camera", [7.5, 3.4, -16], { at: [12, 0.6, -2] }),
  marker("cam-cover-board", "camera", [17, 3.2, 14], { at: [22, 0.8, -1] }),
  marker("cam-cover-back", "camera", [-12, 2.6, 7], { at: [-18, 1.2, 18] }),
);

// ---------------------------------------------------------------- materials
const E2 = "/textures/elevator/", B = "/textures/backrooms/", P = "/textures/penthouse/", C = "/textures/club/", S = "/textures/";
const materials: Record<string, Record<string, unknown>> = {
  carpet: tex(`${B}carpet_office.webp`, 2, { roughness: 0.95, color: "#8890a0" }),
  ceilTile: tex(`${B}ceiling_tiles.webp`, 1.2, { roughness: 0.95 }),
  wallDark: tex(`${P}wall_ebony_slats.webp`, 2, { roughness: 0.55, color: "#8a8f9a" }),
  steel: { color: "#2e3238", roughness: 0.45, metalness: 0.6 },
  pillar: { color: "#23262c", roughness: 0.35, metalness: 0.2 },
  desk: tex(`${B}wood_desk.webp`, 1.2, { roughness: 0.5, color: "#6a6058" }),
  monitor: glow("#ffffff", 0.5, "", `${B}cctv_monitors.webp`),
  board: glow("#ffffff", 0.55, "", `${C}ledwall_atlas.webp`),
  ticker: glow("#ff5a4a", 0.9, "blink"),
  windowSky: glow("#9fb4d8", 0.35, "", `${P}window_skyline.webp`),
  glassWall: { color: "#a8c0d8", roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.18 },
  armorGlass: { color: "#90b8d8", roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.24 },
  shutter: tex(`${S}shutter.webp`, [2, 1], { roughness: 0.6, metalness: 0.4 }),
  grate: tex(`${E2}car_floor_diamond.webp`, 1, { roughness: 0.5, metalness: 0.5 }),
  rail: { color: "#6a6f78", roughness: 0.4, metalness: 0.6 },
  crate: tex(`${B}boxes_cardboard.webp`, 0.8, { roughness: 0.9 }),
  filing: tex(`${B}gun_locker.webp`, [3, 2.4], { roughness: 0.5, metalness: 0.4, color: "#9aa0a8" }),
  tableDark: { color: "#1c1714", roughness: 0.3 },
  counter: tex(`${B}console_panel.webp`, 1.2, { roughness: 0.5, metalness: 0.3 }),
  rack: { ...glow("#ffffff", 1.8, "", `${S}server_rack.webp`), repeat: true, repeatCount: [1 / 0.6, 1 / 1.2] },
  vaultGlow: glow("#ffc860", 0.9),
};

writeLevel("room9", "Room 9: the counting floor", {
  name: "The Counting Floor", next: "room10", cutsceneAfter: "ch2e", music: "counting", look: "counting", footsteps: "hard", tutorial: false, chapter: 2, maxRise: 1.2,
  enterLine: "r9_enter", clearLine: "r9_clear",
  stage: { kind: "counting", shutters: ["shutter-1", "shutter-2", "shutter-3"], cue: "shutters", dark: "dark" },
  // the ways in (sim/arrive.ts): slots inside the vault corridor, the back stair, the gangway dock
  arrive: {
    ways: {
      vault: [[27, 0, -0.7], [27, 0, 0.7], [28.4, 0, 0], [29.4, 0, -0.7], [29.4, 0, 0.7]],
      backstair: [[-18.8, 0, 19.6], [-17.2, 0, 19.6], [-18, 0, 21]],
      gangway: [[-31, 0, -1.4], [-31, 0, 1.4], [-33, 0, 0], [-29.4, 0, 0]],
    },
    groups: {
      waveA: ["self", "vault", "gangway"], waveB: ["self", "backstair", "gangway"], waveC: ["self", "backstair", "vault"],
      waveD: ["self", "backstair", "gangway"], waveE: ["self", "gangway", "backstair", "vault"],
    },
  },
}, materials, k.solid, k.decor, k.clean().markers);
void FACE_S;
