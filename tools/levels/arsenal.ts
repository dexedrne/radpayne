// The arsenal's per-room additions (arsenal spec sections 2.3, 3.6, 4, 5): placed weapons, the gang's new
// guns, three secrets per room (volumes, secret doors, breakables, their little rooms and their tells),
// the pins and the easter-egg markers. Every added node's id starts with "ars-"; applying it again first
// drops those, and the edits to existing nodes set absolute values, so it is idempotent. The room tools
// (tools/room1-3.ts) call it before they write, and tools/arsenal-levels.ts applies it to the JSONs.
type Node = { id: string; components?: Record<string, unknown>; children?: Node[] };
type Prefab = { root: Node; materials?: Record<string, unknown> };
type V3 = [number, number, number];

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const xf = (position: number[], rotation?: number[], scale?: number[]) => ({
  type: "Transform",
  properties: { position: position.map(r3), ...(rotation && rotation.some(a => a) ? { rotation: rotation.map(r3) } : {}), ...(scale ? { scale: scale.map(r3) } : {}) },
});
type BoxOpts = { data?: Record<string, unknown>; hidden?: boolean; rot?: number[] };
function box(id: string, a: V3, b: V3, mat: string, o: BoxOpts = {}): Node {
  const pos = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const size = [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])];
  const c: Record<string, unknown> = {
    transform: xf(pos, o.rot, size),
    geometry: { type: "Geometry", properties: { geometryType: "box", args: [1, 1, 1] } },
    material: { type: "Material", properties: { materialId: mat } },
    mesh: { type: "Mesh", properties: { castShadow: false, receiveShadow: false, ...(o.hidden ? { visible: false } : {}) } },
  };
  if (o.data) c.data = { type: "Data", properties: { data: o.data } };
  return { id, components: c };
}
function marker(id: string, kind: string, pos: number[], data: Record<string, unknown> = {}, yaw = 0, scale?: number[]): Node {
  return { id, components: { transform: xf(pos, yaw ? [0, yaw, 0] : undefined, scale), data: { type: "Data", properties: { data: { marker: kind, ...data } } } } };
}
/** A volume marker from its min / max corners. */
function volume(id: string, kind: string, a: V3, b: V3, data: Record<string, unknown>): Node {
  return marker(id, kind, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], data, 0, [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])]);
}

function find(n: Node, id: string): Node | null {
  if (n.id === id) return n;
  for (const c of n.children ?? []) { const f = find(c, id); if (f) return f; }
  return null;
}
function need(p: Prefab, id: string): Node {
  const n = find(p.root, id);
  if (!n) throw new Error(`arsenal: no node "${id}"`);
  return n;
}
/** Set a box node (its parent has no transform offset in these rooms) to min / max corners. */
function setBox(p: Prefab, id: string, a: V3, b: V3): void {
  const n = need(p, id);
  const t = (n.components!.transform as { properties: Record<string, unknown> }).properties;
  t.position = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2].map(r3);
  t.scale = [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])].map(r3);
}
/** Merge Data into a node (creating the component). */
function setData(p: Prefab, id: string, data: Record<string, unknown>): void {
  const n = need(p, id);
  const c = n.components ?? (n.components = {});
  const d = (c.data as { properties?: { data?: Record<string, unknown> } } | undefined)?.properties?.data ?? {};
  c.data = { type: "Data", properties: { data: { ...d, ...data } } };
}
function dropAdded(n: Node): void {
  if (!n.children) return;
  n.children = n.children.filter(c => !c.id.startsWith("ars-"));
  for (const c of n.children) dropAdded(c);
}

type Adds = { solid: Node[]; decor: Node[]; markers: Node[] };

// ------------------------------------------------------------------------------------------ room 1
function room1(p: Prefab, a: Adds): void {
  // placed: the shotgun behind barrier-a on his side; the SMGs up on the fire escape (the nest below);
  // the south perch goon carries the sniper rifle (she drops it into the street)
  a.markers.push(marker("ars-shotgun-barrier", "pickup", [-4.9, 0, 1.5], { item: "shotgun" }));
  setData(p, "goon-fire-escape-s", { weapon: "sniper" });

  // 1. the alley (and George): a 2.6 m cut between sw1 and sw2, a gate standing ajar at the mouth, a
  //    chain-link fence at z 18.5; George loafs on a crate, pin #723 behind a bin, copium x2
  setBox(p, "sw1", [-28, 0, 12], [-21.3, 15, 70]);
  setBox(p, "sw1-cor", [-28.05, 14.925, 11.5], [-21.25, 15.475, 12.2]);
  setBox(p, "sw2", [-18.7, 0, 12], [-13, 13.8, 70]);
  setBox(p, "sw2-cor", [-18.75, 13.725, 11.5], [-12.95, 14.275, 12.2]);
  setBox(p, "sf-sw1-shut", [-18.6, 0.15, 11.89], [-13.5, 3.35, 11.99]);
  setBox(p, "sf-sw1-fascia", [-18.65, 2.975, 11.83], [-13.2, 3.725, 11.99]);
  a.solid.push(
    box("ars-alley-floor", [-21.3, 0, 12], [-18.7, 0.15, 26], "sidewalk"),
    box("ars-alley-fence", [-21.3, 0.15, 18.45], [-18.7, 3.2, 18.55], "invisible", { hidden: true, data: { shootThrough: true, surface: "metal" } }),
    box("ars-alley-back", [-21.3, 0, 26], [-18.7, 12, 26.5], "brickDark"),
    box("ars-alley-crate", [-19.8, 0.15, 16.4], [-19.0, 0.55, 17.2], "wood", { data: { surface: "wood" } }),
    box("ars-alley-bin", [-20.95, 0.15, 16.6], [-20.25, 1.05, 17.25], "dumpster", { data: { surface: "metal" } }),
  );
  // the fence as chain-link posts and wires; the gate ajar at the mouth (hinged at the west side)
  for (let i = 0; i <= 6; i++) a.decor.push(box(`ars-alley-post-${i}`, [-21.28 + i * 0.43 - 0.02, 0.15, 18.47], [-21.28 + i * 0.43 + 0.02, 3.2, 18.53], "fireEscape"));
  for (let i = 0; i < 8; i++) a.decor.push(box(`ars-alley-wire-${i}`, [-21.3, 0.35 + i * 0.38, 18.49], [-18.7, 0.37 + i * 0.38, 18.51], "fireEscape"));
  a.decor.push(
    box("ars-alley-gate", [-21.3, 0.2, 12.05], [-20.0, 2.2, 12.09], "fireEscape", { rot: [0, -0.6, 0] }),
    box("ars-alley-drain", [-20.3, 0.151, 14.6], [-19.7, 0.16, 15.0], "metalDark"),
    box("ars-alley-door", [-21.32, 0.15, 14.4], [-21.28, 2.35, 15.4], "door"),
    box("ars-alley-door-lamp", [-21.29, 2.5, 14.8], [-21.2, 2.62, 15.0], "bulbs"),
  );
  a.markers.push(
    marker("ars-alley-light", "light", [-19.9, 2.6, 14.9], { color: "#ffb56b", intensity: 3, distance: 7 }),
    volume("ars-secret-alley", "secret", [-21.3, 0, 14], [-18.7, 3, 18.5], { name: "the alley" }),
    marker("ars-george", "egg", [-19.4, 0.55, 16.8], { egg: "george", interact: true }, Math.PI),
    marker("ars-pin-723", "pickup", [-20.6, 0.15, 17.8], { item: "pin", pin: "723" }),
    marker("ars-alley-copium", "pickup", [-19.9, 0.15, 13.6], { item: "copium", amount: 2 }),
  );

  // 2. behind the news kiosk: the back hatch hangs open with a warm light; the vendor's stash
  a.decor.push(
    box("ars-kiosk-hatch", [-18.8, 0.6, -9.25], [-17.4, 1.9, -9.19], "kiosk", { rot: [0.9, 0, 0] }),
    box("ars-kiosk-glow", [-18.6, 0.9, -9.12], [-17.6, 1.7, -9.1], "shopGlow"),
  );
  a.markers.push(
    marker("ars-kiosk-light", "light", [-18, 1.4, -9.6], { color: "#ffc07a", intensity: 2.2, distance: 4 }),
    volume("ars-secret-kiosk", "secret", [-19.6, 0, -11.9], [-16.4, 3, -9.4], { name: "behind the kiosk" }),
    marker("ars-kiosk-grenades", "pickup", [-18.4, 0.15, -10.6], { item: "grenade", amount: 2 }),
    marker("ars-kiosk-copium", "pickup", [-17.3, 0.15, -10.9], { item: "copium", amount: 1 }),
  );

  // 3. the fire escape: a stack of crates and pallets up to platform 1 (steps of 0.315 m, he walks up),
  //    the nest at its east end, under the flight to platform 2: pin #652, the SMGs, sniper rounds, copium
  for (let i = 0; i < 10; i++) {
    const x1 = 1.5 - 0.3 * i, x0 = x1 - 0.3;
    a.solid.push(box(`ars-fe-step-${i}`, [x0, 0.15, -12], [x1, 0.15 + 0.315 * (i + 1), -10.9], i % 3 === 2 ? "dumpster" : "wood", { data: { surface: i % 3 === 2 ? "metal" : "wood" } }));
  }
  a.markers.push(
    volume("ars-secret-nest", "secret", [-4.3, 3.3, -12], [-1.5, 5.3, -10.7], { name: "the fire escape" }),
    marker("ars-pin-652", "pickup", [-3.4, 3.3, -11.6], { item: "pin", pin: "652" }),
    marker("ars-nest-smgs", "pickup", [-2.7, 3.3, -11.25], { item: "smgs" }),
    marker("ars-nest-sniper-ammo", "pickup", [-4.0, 3.3, -11.3], { item: "sniper_ammo", amount: 10 }),
    marker("ars-nest-copium", "pickup", [-2.0, 3.3, -11.6], { item: "copium", amount: 2 }),
  );

  // eggs: the Solscape poster wheat-pasted over poster-3 by the queue, a RadRun one-sheet over poster-1
  a.markers.push(
    marker("ars-poster-solscape", "egg", [19, 1.7, -11.93], { egg: "poster-solscape" }),
    marker("ars-poster-radrun", "egg", [10.4, 1.7, -11.93], { egg: "poster-radrun" }),
  );
}

// ------------------------------------------------------------------------------------------ room 2
function room2(p: Prefab, a: Adds): void {
  // placed: the sawed-off behind the bar (west end of the lane), the rifle on the DJ stage, two grenades
  // on the coat-check counter
  a.markers.push(
    marker("ars-sawedoff-bar", "pickup", [-8.4, 0, -12.5], { item: "sawedoff" }),
    marker("ars-rifle-stage", "pickup", [15.4, 1.0, -1.2], { item: "rifle" }),
    marker("ars-coat-grenades", "pickup", [-14.0, 1.15, 7.0], { item: "grenade", amount: 2 }),
  );

  // 1. the mirror ball: one shot drops it; two grenades roll out of it (the club look lets it fall)
  a.solid.push(box("ars-mirror-ball", [-0.4, 5.6, -0.4], [0.4, 6.4, 0.4], "chrome", { hidden: true, data: { breakable: 1, surface: "glass", drop: "grenade", amount: 2, secret: "ars-secret-ball", camera: false } }));
  a.markers.push(volume("ars-secret-ball", "secret", [-0.2, 5.8, -0.2], [0.2, 6.2, 0.2], { name: "the mirror ball", via: "break" }));

  // 2. the fire exit: a real door in wall-s now (the crowd leaves it ajar); a stair landing behind it
  setBox(p, "wall-s", [-20.5, 0, 14], [6.9, 11.8, 14.5]);
  a.solid.push(
    box("ars-wall-s-e", [8.1, 0, 14], [20.5, 11.8, 14.5], "padded"),
    box("ars-wall-s-top", [6.9, 2.54, 14], [8.1, 11.8, 14.5], "padded"),
    box("ars-fire-door", [6.9, 0.34, 14.0], [8.1, 2.54, 14.5], "doorMetal", { hidden: true, data: { secretDoor: "fire-exit", open: "swing", hinge: "left", mesh: "fire-door", camera: true, surface: "metal" } }),
    box("ars-landing-floor", [6.1, -0.5, 14.5], [8.9, 0.34, 17.2], "floorConcrete"),
    box("ars-landing-w", [5.9, 0, 14.5], [6.1, 3.6, 17.2], "padded"),
    box("ars-landing-e", [8.9, 0, 14.5], [9.1, 3.6, 17.2], "padded"),
    box("ars-landing-s", [5.9, 0, 17.2], [9.1, 3.6, 17.4], "padded"),
    box("ars-landing-ceil", [5.9, 3.4, 14.5], [9.1, 3.6, 17.4], "ceiling"),
    box("ars-landing-chain", [6.3, 0.34, 16.45], [8.7, 1.1, 16.5], "padded", { hidden: true }),
    box("ars-fire-sill", [6.9, 0, 14.0], [8.1, 0.34, 14.5], "floorConcrete"),
  );
  a.decor.push(
    box("ars-landing-chain-v", [6.3, 0.95, 16.46], [8.7, 0.98, 16.49], "chrome"),
    box("ars-landing-stair", [6.3, 0.0, 16.5], [8.7, 0.3, 17.2], "metalDark"),
    box("ars-landing-exit", [7.3, 2.9, 17.18], [7.7, 3.05, 17.2], "exitRed"),
  );
  a.markers.push(
    marker("ars-landing-light", "light", [7.5, 3.0, 15.8], { color: "#ff5040", intensity: 1.2, distance: 4 }),
    volume("ars-secret-fire", "secret", [6.3, 0.34, 14.6], [8.7, 3.34, 16.45], { name: "the fire exit" }),
    marker("ars-pin-2564", "pickup", [6.9, 0.34, 16.0], { item: "pin", pin: "2564", behind: "ars-fire-door" }),
    marker("ars-fire-copium", "pickup", [8.1, 0.34, 15.9], { item: "copium", amount: 2, behind: "ars-fire-door" }),
  );

  // 3. the coat room behind the vestibule's north wall: a sliding door, light under it; the hand cannon
  //    on a flight case, pin #4764, the react-three-game sticker; the RadRun cabinet out in the vestibule
  setBox(p, "vest-fill-n", [-20.2, 0, -14.2], [-15.0, 8, -8.6]);
  a.solid.push(
    box("ars-coat-e", [-15.2, 0, -8.6], [-15.0, 8, -5.0], "padded"),
    box("ars-coat-s-w", [-20.2, 0, -5.2], [-18.2, 8, -5.0], "padded"),
    box("ars-coat-s-e", [-17.0, 0, -5.2], [-15.0, 8, -5.0], "padded"),
    box("ars-coat-lintel", [-18.2, 2.2, -5.2], [-17.0, 8, -5.0], "padded"),
    box("ars-coat-door", [-18.2, 0, -5.18], [-17.0, 2.2, -5.02], "doorMetal", { data: { secretDoor: "coat-room", open: "slide", slide: [1.15, 0], surface: "metal" } }),
    box("ars-coat-ceil", [-20.2, 3.3, -8.6], [-15.0, 3.5, -5.0], "ceiling"),
    box("ars-coat-case", [-16.8, 0, -8.4], [-15.4, 0.8, -7.4], "speakerBox", { data: { surface: "wood" } }),
    box("ars-cabinet", [-19.85, 0, -4.3], [-19.05, 1.8, -3.5], "speakerBox", { hidden: true, data: { surface: "wood", camera: true } }),
  );
  a.decor.push(
    box("ars-coat-underlight", [-18.15, 0.005, -4.99], [-17.05, 0.03, -4.9], "vestLamp"),
    box("ars-coat-rail", [-19.8, 1.8, -8.3], [-17.5, 1.84, -8.26], "chrome"),
  );
  a.markers.push(
    marker("ars-coat-light", "light", [-17.6, 2.8, -6.8], { color: "#ffc98a", intensity: 1.5, distance: 5 }),
    volume("ars-secret-coat", "secret", [-20.0, 0, -8.6], [-15.2, 3, -5.3], { name: "the coat room" }),
    marker("ars-coat-handcannon", "pickup", [-16.1, 0.8, -7.9], { item: "handcannon", behind: "ars-coat-door" }),
    marker("ars-pin-4764", "pickup", [-19.3, 0, -7.7], { item: "pin", pin: "4764", behind: "ars-coat-door" }),
    marker("ars-sticker-case", "egg", [-16.1, 0.45, -7.39], { egg: "sticker" }),
    marker("ars-cabinet-egg", "egg", [-19.45, 0, -3.9], { egg: "cabinet", interact: true }, Math.PI / 2),
  );
}

// ------------------------------------------------------------------------------------------ room 3
function room3(p: Prefab, a: Adds): void {
  // the rusher's SMG drop is the default now (the room's per-kind override goes)
  const root = p.root;
  const rd = (root.components?.data as { properties?: { data?: { room?: Record<string, unknown> } } } | undefined)?.properties?.data?.room;
  if (rd) delete rd.drops;
  // placed: two grenades on the security office desk; the manager carries the hand cannon
  a.markers.push(marker("ars-sec-grenades", "pickup", [15.9, 0.78, -2.5], { item: "grenade", amount: 2 }));
  setData(p, "heavy-manager", { weapon: "handcannon" });

  // 1. the false wall: a plywood panel in the storage room's east wall (80 hp); the dev photo wall behind
  setBox(p, "b-wall-e", [17.0, 0, -22.0], [17.2, 2, -20.4]);
  a.solid.push(
    box("ars-b-wall-e-ply", [17.0, 0, -20.4], [17.2, 2, -18.8], "pallet", { data: { breakable: 80, surface: "wood", secret: "ars-secret-wall" } }),
    box("ars-b-wall-e-s", [17.0, 0, -18.8], [17.2, 2, -13.8], "block", { data: { surface: "concrete" } }),
    box("ars-den-floor", [19.9, -0.5, -22.1], [20.9, 0, -17.2], "floorConcrete"),
    box("ars-den-n", [17.2, 0, -22.2], [20.9, 3, -22.0], "block"),
    box("ars-den-e", [20.6, 0, -22.1], [20.9, 3, -17.2], "block"),
    box("ars-den-s", [17.2, 0, -17.4], [20.9, 3, -17.2], "block"),
    box("ars-den-ceil", [17.2, 3.0, -22.2], [20.9, 3.2, -17.2], "ceiling"),
    box("ars-den-desk", [18.6, 0, -21.8], [20.0, 0.78, -21.0], "desk", { data: { surface: "wood" } }),
  );
  a.decor.push(
    // the tells: splinters where the rest of the wall is plaster, a line of light at the seam
    box("ars-ply-splinter-0", [16.94, 0.9, -19.6], [17.0, 0.93, -19.4], "pallet", { rot: [0.4, 0, 0] }),
    box("ars-ply-splinter-1", [16.93, 1.3, -19.1], [17.0, 1.32, -18.95], "pallet", { rot: [-0.3, 0, 0] }),
    box("ars-ply-seam", [16.98, 0.05, -18.83], [17.0, 1.95, -18.8], "lampWarm"),
    box("ars-den-lamp", [19.5, 0.78, -21.5], [19.6, 1.2, -21.4], "lampWarm"),
  );
  a.markers.push(
    marker("ars-den-light", "light", [18.9, 2.4, -19.6], { color: "#ffc98a", intensity: 1.6, distance: 5 }),
    volume("ars-secret-wall", "secret", [18.8, 0, -20.2], [19.2, 1, -19.8], { name: "the false wall", via: "break" }),
    marker("ars-photo-wall", "egg", [20.55, 1.55, -19.6], { egg: "photowall" }, -Math.PI / 2),
    marker("ars-pin-3171", "pickup", [19.2, 0.78, -21.4], { item: "pin", pin: "3171", behind: "ars-b-wall-e-ply" }),
    marker("ars-den-grenades", "pickup", [18.0, 0, -18.1], { item: "grenade", amount: 2, behind: "ars-b-wall-e-ply" }),
    marker("ars-den-copium", "pickup", [19.9, 0, -18.0], { item: "copium", amount: 1, behind: "ars-b-wall-e-ply" }),
  );

  // 2. the west alcove's door slides open: a janitor's closet behind it (light under the door)
  setData(p, "alc-w-back", { secretDoor: "janitor", open: "slide", slide: [0, 1.7], mesh: "alc-w-door" });
  a.solid.push(
    box("ars-jan-floor", [-9.0, -0.5, -7.2], [-5.9, 0, -4.8], "floorConcrete"),
    box("ars-jan-w", [-9.0, 0, -7.2], [-8.7, 3, -4.8], "block"),
    box("ars-jan-n", [-9.0, 0, -7.2], [-5.2, 3, -7.0], "block"),
    box("ars-jan-s", [-9.0, 0, -5.0], [-5.2, 3, -4.8], "block"),
    box("ars-jan-ceil", [-9.0, 3.0, -7.2], [-5.2, 3.2, -4.8], "ceiling"),
    box("ars-jan-shelf", [-8.3, 0, -7.0], [-6.9, 1.8, -6.6], "shelf", { data: { surface: "metal" } }),
  );
  a.decor.push(
    box("ars-jan-underlight", [-5.05, 0.005, -6.45], [-4.95, 0.03, -5.55], "lampWarm"),
    box("ars-jan-bucket", [-5.95, 0, -6.75], [-5.6, 0.35, -6.4], "bucket"),
    box("ars-jan-radio", [-7.8, 1.8, -6.95], [-7.4, 1.98, -6.7], "chair"),
    box("ars-jan-lamp", [-7.2, 2.9, -6.2], [-6.8, 3.0, -5.8], "lampWarm"),
  );
  a.markers.push(
    marker("ars-jan-light", "light", [-7.0, 2.5, -6], { color: "#ffc98a", intensity: 1.2, distance: 4.5 }),
    volume("ars-secret-janitor", "secret", [-8.7, 0, -7.0], [-5.35, 3, -5.0], { name: "the janitor's closet" }),
    marker("ars-pin-250", "pickup", [-8.0, 0, -5.6], { item: "pin", pin: "250", behind: "alc-w-back" }),
    marker("ars-jan-copium", "pickup", [-7.2, 0, -5.4], { item: "copium", amount: 2, behind: "alc-w-back" }),
  );

  // 3. the manager's bookshelf slides 1.2 m north on E: a wall safe with the hand cannon's rounds
  setData(p, "shelf-e3", { secretDoor: "bookshelf", open: "slide", slide: [0, -1.2] });
  a.solid.push(box("ars-shelf-slid", [-1.0, 0, 0.2], [-0.56, 2.2, 1.39], "wood", { hidden: true, data: { surface: "wood" } }));
  a.decor.push(
    box("ars-safe", [-1.0, 0.8, 3.65], [-0.93, 1.5, 4.35], "metalDark"),
    box("ars-safe-door", [-0.95, 0.85, 4.3], [-0.6, 1.45, 4.34], "chrome", { rot: [0, -1.1, 0] }),
    box("ars-scrape-0", [-0.5, 0.001, 3.5], [-0.3, 0.006, 4.5], "rug"),
    box("ars-scrape-1", [-0.95, 0.001, 0.25], [-0.6, 0.006, 1.35], "rug"),
  );
  a.markers.push(
    volume("ars-secret-shelf", "secret", [-1.0, 0, 3.45], [-0.45, 3, 4.6], { name: "the bookshelf" }),
    marker("ars-safe-rounds", "pickup", [-0.8, 0, 3.8], { item: "handcannon_ammo", amount: 14, behind: "shelf-e3" }),
    marker("ars-safe-copium", "pickup", [-0.8, 0, 4.35], { item: "copium", amount: 1, behind: "shelf-e3" }),
  );
}

const ROOMS: Record<string, (p: Prefab, a: Adds) => void> = { room1, room2, room3 };

/** Apply the room's additions to a level prefab in place (idempotent). */
export function applyArsenal(prefab: unknown, room: string): void {
  const p = prefab as Prefab;
  const f = ROOMS[room];
  if (!f) return;
  dropAdded(p.root);
  const a: Adds = { solid: [], decor: [], markers: [] };
  f(p, a);
  need(p, "geometry").children!.push(...a.solid);
  need(p, "decor").children!.push(...a.decor);
  need(p, "markers").children!.push(...a.markers);
  // the materials the additions use must exist
  const mats = p.materials ?? {};
  const want = new Set<string>();
  const walk = (n: Node) => { const m = (n.components?.material as { properties?: { materialId?: string } } | undefined)?.properties?.materialId; if (m && n.id.startsWith("ars-")) want.add(m); for (const c of n.children ?? []) walk(c); };
  walk(p.root);
  const missing = [...want].filter(m => !(m in mats));
  if (missing.length) throw new Error(`arsenal ${room}: missing materials ${missing.join(", ")}`);
}
