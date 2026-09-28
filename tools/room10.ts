// Writes public/levels/room10.json: room 10, the vault at the top of it all: the Countess (chapter 2's
// boss). The starting point for hand-tuning in the editor (/?editor=room10); re-running it OVERWRITES it.
//   node tools/room10.ts && npm run check-level room10
//
// Layout (metres; the vault is a 30 m octagon round (0, 0) under a glass dome, sunrise; he comes in through
// the round vault door in the south wall, facing north):
//   the counting desk   x -2.4..2.4, z -2.4..2.4, 1.6 m up, a stair north and south: she starts on it
//                       (phase 1: she walks its edge and fires the rifle down: the white laser tell)
//   the gold            a ring of bullion stacks (low) at ~8 m, four pillars (high) at ~11 m, shelves of
//                       stolen bags along the walls (high); the security beams turn about the desk from
//                       phase 2 (high: dive; low: jump; tall cover keeps them off)
//   the lifts           east and west walls: her girls come through them after a lamp over the door
//                       (sim/ch2/vault.ts waves)
//   secrets             a sliding shelf (E) in the north-west wall (the pin), a case of bearer bonds (it
//                       breaks: frags), the teller's cage off the entry corridor
// Room settings: stage (the vault: the desk, the beams' reach, the door she runs for, the waves), later
// (the lift groups), chapterEnd. No exit: the clear is her.
import { FACE_E, FACE_N, FACE_S, FACE_W, box, glow, marker, prim, tex, writeLevel, type V3 } from "./levelKit.ts";
import { RoomKit } from "./levels/kit2.ts";

const k = new RoomKit();
const H = 9, R = 15, DESK = 1.6;

// ---------------------------------------------------------------- the octagon
k.box("floor", [-20, -0.5, -20], [20, 0, 24], "marbleBlack");
for (const [id, a, b] of [
  ["wall-n", [-6.3, 0, -R - 0.2], [6.3, H, -R]], ["wall-s1", [-6.3, 0, R], [-1.8, H, R + 0.2]], ["wall-s2", [1.8, 0, R], [6.3, H, R + 0.2]],
  ["wall-w1", [-R - 0.2, 0, -6.3], [-R, H, -1.5]], ["wall-w2", [-R - 0.2, 0, 1.5], [-R, H, 6.3]], ["wall-e1", [R, 0, -6.3], [R + 0.2, H, -1.5]], ["wall-e2", [R, 0, 1.5], [R + 0.2, H, 6.3]],
] as Array<[string, V3, V3]>) k.box(id, a, b, "goldWall");
k.box("wall-s-top", [-1.8, 3.4, R], [1.8, H, R + 0.2], "goldWall");
k.box("wall-w-top", [-R - 0.2, 3, -1.5], [-R, H, 1.5], "goldWall");
k.box("wall-e-top", [R, 3, -1.5], [R + 0.2, H, 1.5], "goldWall");
// the diagonals (yawed boxes: 12.4 m long, centred at the octagon's corners' midpoints; yaw turns local +X
// to (cos, -sin) in (x, z))
for (const [id, x, z, yaw] of [["d-ne", 10.65, -10.65, -Math.PI / 4], ["d-nw", -10.65, -10.65, Math.PI / 4], ["d-se", 10.65, 10.65, Math.PI / 4], ["d-sw", -10.65, 10.65, -Math.PI / 4]] as const) {
  k.solid.push(box(`wall-${id}`, [x, H / 2, z], [12.4, H, 0.2], "goldWall", { rot: [0, yaw, 0] }));
}
k.deco("dome", [-R, H, -R], [R, H + 0.1, R], "domeGlass");
for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; k.decor.push(box(`dome-rib-${i}`, [Math.sin(a) * 7.5, H + 0.15, Math.cos(a) * 7.5], [0.2, 0.2, 15], "brass", { rot: [0, a, 0] })); }
k.deco("sky", [-80, 40, -80], [80, 41, 80], "sunrise");
k.decor.push(prim("sun", "sphere", [0, 26, -60], [9, 20, 12], "sun"));
// the vault door (open, swung into the corridor) and the entry corridor with the teller's cage
k.decor.push(prim("vault-door", "cylinder", [-3.4, 1.9, R + 1.6], [1.9, 1.9, 0.5, 32], "brassDark", [Math.PI / 2, 0.6, 0]));
k.deco("vault-frame", [-2.1, 0, R + 0.18], [2.1, 3.6, R + 0.3], "brassDark");
// the gate: out of the world until the fight starts, then shut behind him (the stage's lock; drawn by the view)
k.box("vault-gate", [-1.8, 0, R + 0.02], [1.8, 3.4, R + 0.18], "bars", { hidden: true, data: { surface: "metal", camera: true } });
k.box("cor-w", [-3, 0, R + 0.2], [-2.8, 3.4, 22], "steel");
k.box("cor-e", [2.8, 0, R + 0.2], [3, 3.4, 18.2], "steel");
k.box("cor-e2", [2.8, 0, 20.4], [3, 3.4, 22], "steel");
k.box("cor-n", [-3, 0, 22], [3, 3.4, 22.2], "steel");
k.box("cor-roof", [-3, 3.4, R + 0.2], [3, 3.6, 22.2], "steel");
k.box("cage-floor", [3, -0.5, 18], [6, 0, 21], "marbleBlack");
k.box("cage-e", [6, 0, 18], [6.2, 3, 21], "steel");
k.box("cage-n", [3, 0, 17.8], [6.2, 3, 18], "steel");
k.box("cage-s", [3, 0, 21], [6.2, 3, 21.2], "steel");
k.box("cage-roof", [3, 3, 17.8], [6.2, 3.2, 21.2], "steel");
k.box("cage-bars", [2.8, 0, 18.2], [3, 2.6, 20.4], "bars", { hidden: true, data: { shootThrough: true, collider: true } });
k.solid.splice(k.solid.findIndex(n => n.id === "cage-bars"), 1);
k.boxes.splice(k.boxes.findIndex(b => b.id === "cage-bars"), 1);
for (let z = 18.4; z < 20.4; z += 0.3) k.deco(`bar-${z.toFixed(1)}`, [2.85, 0, z - 0.02], [2.95, 2.6, z + 0.02], "brass");

// ---------------------------------------------------------------- the counting desk (1.6 m up) and its stairs
k.cover("desk-plinth", [-2.4, 0, -2.4], [2.4, DESK, 2.4], "plinth", { data: { surface: "concrete" } }, { faces: ["e", "w"] });
k.box("desk-top", [-0.5, DESK, -0.5], [0.5, DESK + 0.8, 0.5], "ledgerDesk", { data: { surface: "wood" } });
k.deco("ledger", [-0.35, DESK + 0.8, -0.25], [0.35, DESK + 0.84, 0.25], "paper");
k.stairs("desk-st-n", 0, -2.4, "n", 5, 0.32, 0.6, 1.6, DESK, "plinth");
k.stairs("desk-st-s", 0, 2.4, "s", 5, 0.32, 0.6, 1.6, DESK, "plinth");
for (const [x0, x1] of [[-0.95, -0.8], [0.8, 0.95]] as const) {
  k.box(`desk-st-n-r${x0}`, [x0, 0, -5.4], [x1, DESK + 0.9, -2.4], "brass", { data: { shootThrough: true, surface: "metal" } });
  k.box(`desk-st-s-r${x0}`, [x0, 0, 2.4], [x1, DESK + 0.9, 5.4], "brass", { data: { shootThrough: true, surface: "metal" } });
}
k.decor.push(prim("beam-ring", "cylinder", [0, 0.02, 0], [3.5, 3.5, 0.02, 40], "beamRing"));

// ---------------------------------------------------------------- cover: the gold, the pillars, the shelves
for (let i = 0; i < 8; i++) {
  const a = (i + 0.5) * (Math.PI / 4), r = 8;
  const x = Math.sin(a) * r, z = Math.cos(a) * r;
  // (a stack tangent to the ring: along X where it sits north / south of the desk, along Z east / west)
  const along = Math.abs(Math.cos(a)) > 0.7 ? "x" : Math.abs(Math.sin(a)) > 0.7 ? "z" : Math.abs(x) > Math.abs(z) ? "z" : "x";
  const w = along === "x" ? 2 : 1, d = along === "x" ? 1 : 2;
  k.cover(`gold-${i}`, [x - w / 2, 0, z - d / 2], [x + w / 2, 1.0, z + d / 2], "gold", { data: { surface: "metal" } });
}
for (const [x, z] of [[-7.8, -7.8], [7.8, -7.8], [-7.8, 7.8], [7.8, 7.8]]) k.cover(`pillar-${x}-${z}`, [x - 0.6, 0, z - 0.6], [x + 0.6, H, z + 0.6], "pillar");
for (const [id, a, b, face] of [
  ["shelf-n", [-5, 0, -14.8], [5, 2.6, -14], "s"], ["shelf-w", [-14.8, 0, 2.2], [-14, 2.6, 6], "e"], ["shelf-w2", [-14.8, 0, -6], [-14, 2.6, -2.2], "e"], ["shelf-e", [14, 0, -6], [14.8, 2.6, -2.2], "w"], ["shelf-e2", [14, 0, 2.2], [14.8, 2.6, 6], "w"],
] as Array<[string, V3, V3, "n" | "s" | "e" | "w"]>) k.cover(id, a, b, "shelfBags", { data: { surface: "wood" } }, { faces: [face] });
// bullion carts inside the vault door (low): somewhere to duck when the gate shuts behind him
for (const sx of [-1, 1]) k.cover(`cart-${sx > 0 ? "e" : "w"}`, [sx > 0 ? 2.6 : -4.6, 0, 10.8], [sx > 0 ? 4.6 : -2.6, 0.95, 11.6], "gold", { data: { surface: "metal" } });
k.box("bonds", [9.4, 0, 10.4], [10.8, 0.9, 11.4], "case", { data: { breakable: 30, surface: "wood", drop: "grenade", amount: 3, secret: "secret-bonds" } });
// the sliding shelf in the north-west wall, and the room behind
k.solid.splice(k.solid.findIndex(n => n.id === "wall-d-nw"), 1);
k.box("nw-room-floor", [-15.6, -0.5, -15.6], [-11.4, 0, -11.4], "marbleBlack");
k.solid.push(box("wall-d-nw-a", [-13.25, H / 2, -8.05], [4.95, H, 0.2], "goldWall", { rot: [0, Math.PI / 4, 0] }));
k.solid.push(box("wall-d-nw-b", [-8.05, H / 2, -13.25], [4.95, H, 0.2], "goldWall", { rot: [0, Math.PI / 4, 0] }));
k.solid.push(box("wall-d-nw-top", [-10.65, (H + 2.4) / 2, -10.65], [2.4, H - 2.4, 0.2], "goldWall", { rot: [0, Math.PI / 4, 0] }));
k.solid.push(box("nw-shelf", [-10.65, 1.2, -10.65], [2.4, 2.4, 0.3], "shelfBags", { rot: [0, Math.PI / 4, 0], data: { secretDoor: "stash", open: "slide", slide: [-1.7, 1.7], surface: "wood" } }));
k.box("nw-room-w", [-15.6, 0, -15.6], [-15.4, H, -6.3], "goldWall");
k.box("nw-room-n", [-15.6, 0, -15.6], [-6.3, H, -15.4], "goldWall");
k.box("nw-room-roof", [-15.6, 3.2, -15.6], [-9.6, 3.4, -9.6], "goldWall");

// ---------------------------------------------------------------- the lifts (east, west) and their vestibules
for (const [side, sx] of [["e", 1], ["w", -1]] as const) {
  const x0 = sx > 0 ? R + 0.2 : -R - 4.2, x1 = sx > 0 ? R + 4.2 : -R - 0.2;
  k.box(`lift-${side}`, [sx > 0 ? R : -R - 0.2, 0, -1.5], [sx > 0 ? R + 0.2 : -R, 3, 1.5], "liftDoor", { hidden: true, data: { surface: "metal", camera: true } });
  k.box(`vest-${side}-floor`, [x0, -0.5, -2.4], [x1, 0, 2.4], "marbleBlack");
  k.box(`vest-${side}-n`, [x0, 0, -2.6], [x1, 3.2, -2.4], "steel");
  k.box(`vest-${side}-s`, [x0, 0, 2.4], [x1, 3.2, 2.6], "steel");
  k.box(`vest-${side}-back`, [sx > 0 ? R + 4.2 : -R - 4.4, 0, -2.6], [sx > 0 ? R + 4.4 : -R - 4.2, 3.2, 2.6], "steel");
  k.box(`vest-${side}-roof`, [x0, 3.2, -2.6], [x1, 3.4, 2.6], "steel");
  k.deco(`lift-${side}-lamp`, [sx > 0 ? R - 0.06 : -R + 0.02, 3.1, -0.3], [sx > 0 ? R - 0.02 : -R + 0.06, 3.3, 0.3], "lamp");
}

// ---------------------------------------------------------------- secrets' volumes, waypoints
k.volume("secret-stash", "secret", [-15.3, 0, -15.3], [-11.2, 2.6, -11.2], { name: "her own shelf" });
k.volume("secret-bonds", "secret", [9.4, 0, 10.4], [10.8, 0.9, 11.4], { name: "the bearer bonds", via: "break" });
k.volume("secret-cage", "secret", [3, 0, 18], [6, 2.6, 21], { name: "the teller's cage" });
const inOct = (x: number, z: number) => Math.abs(x) + Math.abs(z) < 20 && Math.abs(x) < 14.3 && Math.abs(z) < 14.3;
k.grid("floor", -13.5, 13.5, -13.5, 13.5, 3, 0, (x, z) => !inOct(x, z) || (Math.abs(x) < 3.2 && Math.abs(z) < 6));
k.wp("st-n-bot", [0, 0, -6.4], ["st-n-top"]);
k.wp("st-n-top", [0, DESK, -1.8], ["st-n-bot", "desk-e", "desk-w"]);
k.wp("st-s-bot", [0, 0, 6.4], ["st-s-top"]);
k.wp("st-s-top", [0, DESK, 1.8], ["st-s-bot", "desk-e", "desk-w"]);
k.wp("desk-e", [1.8, DESK, 0], ["st-n-top", "st-s-top"]);
k.wp("desk-w", [-1.8, DESK, 0], ["st-n-top", "st-s-top"]);
k.wp("cor-1", [0, 0, 16.6], ["cor-2", "cor-in"]);
k.wp("cor-2", [0, 0, 20.4], ["cor-1", "cage-in"]);
k.wp("cor-in", [0, 0, 13.2], ["cor-1"], { door: "vault-gate" });
k.wp("cage-in", [4.4, 0, 19.4], ["cor-2"]);
k.wp("nw-in", [-13, 0, -13], ["nw-out"], { door: "nw-shelf" });
k.wp("nw-out", [-9.6, 0, -9.6], ["nw-in"]);
for (const [side, sx] of [["e", 1], ["w", -1]] as const) {
  k.wp(`lift-${side}-in`, [sx * 13.6, 0, 0], [`lift-${side}-out`]);
  k.wp(`lift-${side}-out`, [sx * 16.8, 0, 0], [`lift-${side}-in`, `lift-${side}-back`], { door: `lift-${side}` });
  k.wp(`lift-${side}-back`, [sx * 18.6, 0, 0], [`lift-${side}-out`]);
}

// ---------------------------------------------------------------- the Countess and her girls
const E = (id: string, x: number, y: number, z: number, yaw: number, d: Record<string, unknown> = {}) => marker(id, "enemy", [x, y, z], { kind: "goon", ...d }, yaw);
const adds = (side: "e" | "w", group: string, kinds: string[]) => kinds.map((kd, i) => {
  const sx = side === "e" ? 1 : -1;
  return E(`${group}-${i + 1}`, sx * (16.2 + (i % 2) * 1.4), 0, -1.6 + Math.floor(i / 2) * 1.4, side === "e" ? FACE_W : FACE_E, { kind: kd, group, deaf: true, ...(kd === "heavy" ? { model: side === "e" ? "rival652" : "rival723" } : {}) });
});
k.m(
  E("countess", 0, DESK, -1.7, FACE_N, { kind: "countess", drop: false }),
  E("guard-1", -6.5, 0, 3, FACE_W), E("guard-2", 6, 0, 2.6, FACE_E), E("guard-3", 0, 0, -9.4, FACE_N, { kind: "rusher" }),
  ...adds("e", "liftE", ["goon", "rusher", "goon", "rusher"]),
  ...adds("w", "liftW", ["rusher", "goon", "heavy", "goon"]),
  ...adds("e", "liftE2", ["rusher", "goon", "goon"]).map(n => { const t = (n.components!.transform as { properties: { position: number[] } }).properties; t.position = [t.position[0], t.position[1], t.position[2] + 0.7]; return n; }),
  ...adds("w", "liftW2", ["goon", "rusher", "goon"]).map(n => { const t = (n.components!.transform as { properties: { position: number[] } }).properties; t.position = [t.position[0], t.position[1], t.position[2] + 0.7]; return n; }),
);

// ---------------------------------------------------------------- triggers, pickups, eggs, lights
const T = (id: string, pos: V3, data: Record<string, unknown>, scale: V3 = [1, 1, 1]) => marker(id, "trigger", pos, data, 0, scale);
k.m(
  marker("spawn", "spawn", [0, 0, 18.4], {}, FACE_N),
  marker("checkpoint-0", "checkpoint", [0, 0, 18.4], {}, FACE_N),
  T("t-vault", [0, 1, 12.6], { action: "alert" }, [26, 3, 3]),
  marker("cop-1", "pickup", [-12, 0, 8], { item: "copium" }), marker("cop-2", "pickup", [12, 0, -8], { item: "copium" }),
  marker("cop-3", "pickup", [-11.5, 0, -4], { item: "copium" }), marker("cop-4", "pickup", [11.5, 0, 4.4], { item: "copium" }),
  marker("cop-door", "pickup", [-1.6, 0, 16.2], { item: "copium" }),
  marker("sniper", "pickup", [1.6, 0, 16.2], { item: "sniper" }),
  marker("shotgun", "pickup", [-8.6, 0, -6.2], { item: "shotgun" }),
  marker("nades", "pickup", [8.6, 0, 6.2], { item: "grenade", amount: 2 }),
  marker("pin-g250", "pickup", [-13.4, 0, -13.4], { item: "pin", pin: "g250", behind: "nw-shelf" }),
  marker("stash-copium", "pickup", [-12.2, 0, -14.2], { item: "copium", amount: 2, behind: "nw-shelf" }),
  marker("cage-ammo", "pickup", [4.6, 0, 18.8], { item: "sniper_ammo", amount: 10 }),
  marker("cage-copium", "pickup", [4.6, 0, 20.2], { item: "copium", amount: 2 }),
  marker("egg-photos", "egg", [13.85, 1.6, 4.1], { egg: "photowall" }, FACE_W),
  ...([
    ["sun-1", 0, 8, -6, "#ffc88a", 12, 26], ["sun-2", -8, 7, 6, "#ffb870", 8, 18], ["sun-3", 8, 7, 6, "#ffb870", 8, 18], ["desk", 0, DESK + 2.4, 0, "#ffe0a0", 5, 8],
    ["lift-e", 13.8, 2.6, 0, "#ff9060", 3, 6], ["lift-w", -13.8, 2.6, 0, "#ff9060", 3, 6], ["cor", 0, 3, 19, "#ffcf90", 4, 7], ["nw", -13, 2.8, -13, "#ffc07a", 2, 4], ["cage", 4.5, 2.6, 19.5, "#ffc07a", 2, 4],
  ] as Array<[string, number, number, number, string, number, number]>).map(([id, x, y, z, color, intensity, distance]) => marker(`light-${id}`, "light", [x, y, z], { color, intensity, distance })),
  marker("cam-vault", "camera", [0, 2, 13.5], { at: [0, 2.2, 0] }),
  marker("cam-desk", "camera", [-6, 2.6, 6], { at: [0, DESK + 1.2, -1.7] }),
);

// ---------------------------------------------------------------- materials
const P = "/textures/penthouse/", B = "/textures/backrooms/", E2 = "/textures/elevator/";
const materials: Record<string, Record<string, unknown>> = {
  marbleBlack: tex(`${P}floor_marble_black.webp`, 2, { roughness: 0.25 }),
  goldWall: tex(`${P}wall_ebony_slats.webp`, 2, { roughness: 0.45, metalness: 0.3, color: "#c8a060" }),
  steel: { color: "#2e3238", roughness: 0.45, metalness: 0.6 },
  brass: { color: "#c09050", roughness: 0.3, metalness: 0.85 },
  brassDark: { color: "#6a5230", roughness: 0.35, metalness: 0.8 },
  plinth: tex(`${E2}marble_grey.webp`, 1.5, { roughness: 0.3, color: "#e8e0d0" }),
  ledgerDesk: { color: "#1e1715", roughness: 0.35 },
  paper: glow("#f4ecd8", 0.7),
  gold: glow("#ffc24a", 0.55),
  pillar: tex(`${E2}marble_grey.webp`, 2, { roughness: 0.3, color: "#d8d0c0" }),
  shelfBags: tex(`${B}boxes_cardboard.webp`, 0.8, { roughness: 0.85, color: "#8a6a4a" }),
  case: { color: "#3a2a1a", roughness: 0.5 },
  liftDoor: { color: "#b08a4a", roughness: 0.3, metalness: 0.8 },
  lamp: glow("#ff5040", 1.2),
  bars: { color: "#b08a4a", roughness: 0.3, metalness: 0.8 },
  domeGlass: { color: "#ffd8a8", roughness: 0.05, transparent: true, opacity: 0.18 },
  sunrise: glow("#ffb070", 0.8),
  sun: glow("#fff0c8", 2.4),
  beamRing: glow("#ff3040", 0.35),
};

writeLevel("room10", "Room 10: the vault", {
  name: "The Vault", cutsceneAfter: "ch2f", music: "vault", look: "vault", footsteps: "hard", tutorial: false, chapter: 2, maxRise: 1.2,
  clearLine: "", later: ["liftE", "liftW", "liftE2", "liftW2"], chapterEnd: true,
  stage: {
    kind: "vault", lock: "vault-gate", center: [0, 0], column: 3.5, radius: 14.6, deskR: 1.7, door: [0, 13.4], floorY: 0,
    waves: [{ group: "liftE", door: "lift-e", phase: 1 }, { group: "liftW", door: "lift-w", phase: 2 }, { group: "liftE2", door: "lift-e", phase: 3 }, { group: "liftW2", door: "lift-w", phase: 3 }],
  },
}, materials, k.solid, k.decor, k.clean().markers);
void FACE_E;
