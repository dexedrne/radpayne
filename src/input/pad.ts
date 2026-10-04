// The gamepad's layout, shared by the input (what each button does), the prompts (which glyph a hint
// shows) and the controls lists. The Gamepad API's standard mapping (any pad is read into it: readPad,
// its triggers by their analog value); the layout follows the console shooters of the genre: L2 aims
// (the view zooms in), R2 fires, R1 dives, a stick click is bullet time, L1 takes cover (in
// cover L2 pops out and Cross vaults), the d-pad's left-right change the gun, Square reloads (or uses what is in reach), Triangle throws (held: the arc; the throw on the release), Circle strikes (#4764: a
// tap cuts with the katana, held it is his guard).
// Pure: no DOM, no store (the tests import it).

/** Standard-mapping button indices (the PlayStation names; Xbox: A B X Y, LB RB LT RT, View Menu, LS RS). */
export const BTN = {
  cross: 0, circle: 1, square: 2, triangle: 3, l1: 4, r1: 5, l2: 6, r2: 7, create: 8, options: 9, l3: 10, r3: 11,
  up: 12, down: 13, left: 14, right: 15, home: 16, touchpad: 17,
} as const;

export type PadKind = "ps" | "xbox";

/** PlayStation glyphs for a pad whose id looks like Sony's (DualSense, DualShock), Xbox glyphs otherwise. */
export function padKind(id: string): PadKind {
  return /054c|sony|dualsense|dualshock|playstation|^wireless controller/i.test(id) ? "ps" : "xbox";
}

/** A glyph on a prompt: a button, a stick, or the d-pad (whole, one axis, one arm). */
export type Glyph =
  | "cross" | "circle" | "square" | "triangle" | "l1" | "r1" | "l2" | "r2" | "l3" | "r3" | "options" | "create"
  | "ls" | "rs" | "dpad" | "dpadV" | "dpadH" | "dup" | "ddown" | "dleft" | "dright";

/** What the player does, as the prompts name it. */
export type Act =
  | "move" | "aim" | "fire" | "aimHold" | "scope" | "bt" | "dodge" | "jump" | "reload" | "use" | "copium" | "weapon"
  | "melee" | "grenade" | "pause" | "confirm" | "back" | "navigate" | "change" | "tabs" | "skip" | "mute" | "cover" | "vault";

/** The glyphs each action shows on a pad (empty: no pad button; the key stays). */
export const PAD_GLYPHS: Record<Act, Glyph[]> = {
  move: ["ls"], aim: ["rs"], fire: ["r2"], aimHold: ["l2"], scope: ["l2"], bt: ["r3"], dodge: ["r1"], jump: ["cross"],
  reload: ["square"], use: ["square"], copium: ["dup"], weapon: ["dpadH"], melee: ["circle"], grenade: ["triangle"],
  cover: ["l1"], vault: ["cross"],
  pause: ["options"], confirm: ["cross"], back: ["circle"], navigate: ["dpadV"], change: ["dpadH"], tabs: ["l1", "r1"],
  skip: ["circle"], mute: [],
};

/** A key as the keyboard prompts spell it -> its action (the hint strings and keycaps are written in keys). */
const KEY_ACT: Record<string, Act> = {
  W: "move", A: "move", S: "move", D: "move", WASD: "move", MOUSE: "aim", LMB: "fire", RMB: "bt", Q: "bt", SHIFT: "dodge",
  SPACE: "jump", R: "reload", H: "copium", "1": "weapon", "2": "weapon", "3": "weapon", "4": "weapon", "5": "weapon",
  "1-5": "weapon", WHEEL: "weapon", F: "melee", G: "grenade", E: "use", ESC: "back", P: "pause", ENTER: "confirm",
  CLICK: "confirm", "↑↓": "navigate", "←→": "change", TAB: "tabs", M: "mute", C: "cover",
};
export const keyAct = (k: string): Act | undefined => KEY_ACT[k.trim().toUpperCase()];

/** Short names (the portal's text list, aria labels). */
export const GLYPH_NAME: Record<PadKind, Record<Glyph, string>> = {
  ps: {
    cross: "Cross", circle: "Circle", square: "Square", triangle: "Triangle", l1: "L1", r1: "R1", l2: "L2", r2: "R2", l3: "L3", r3: "R3",
    options: "Options", create: "Create", ls: "Left stick", rs: "Right stick", dpad: "D-pad", dpadV: "D-pad up-down",
    dpadH: "D-pad left-right", dup: "D-pad up", ddown: "D-pad down", dleft: "D-pad left", dright: "D-pad right",
  },
  xbox: {
    cross: "A", circle: "B", square: "X", triangle: "Y", l1: "LB", r1: "RB", l2: "LT", r2: "RT", l3: "LS click", r3: "RS click",
    options: "Menu", create: "View", ls: "Left stick", rs: "Right stick", dpad: "D-pad", dpadV: "D-pad up-down",
    dpadH: "D-pad left-right", dup: "D-pad up", ddown: "D-pad down", dleft: "D-pad left", dright: "D-pad right",
  },
};

/** The pad's controls list (title, pause menu). */
export const PAD_CONTROLS: Array<[Glyph[], string]> = [
  [["ls"], "move"], [["rs"], "aim"], [["r2"], "fire"], [["l2"], "aim: the view zooms in (sniper: scope)"],
  [["r3", "l3"], "bullet time"], [["r1"], "shootdodge"], [["l1"], "cover (again: dash to the marked cover)"], [["l2"], "in cover: hold to pop out and aim"],
  [["cross"], "jump (in cover: vault)"], [["square"], "reload / use"],
  [["dup"], "copium"], [["dpadH"], "weapon"], [["circle"], "melee (#4764: tap cut, hold guard)"], [["triangle"], "grenade (hold: the arc; let go: throw)"], [["ddown"], "use"],
  [["options"], "pause"],
];

/** The pad's controls as text ("R2 / RT: fire"): the radbro.fun portal's list. No commas inside one. */
export function padControlsText(): string[] {
  return PAD_CONTROLS.map(([gs, what]) => {
    const names = (k: PadKind) => gs.map(g => GLYPH_NAME[k][g]).join(" / ");
    const ps = names("ps"), xb = names("xbox");
    return `${ps === xb ? ps : `${ps} (${xb})`}: ${what.replace(/,/g, ";")}`;
  });
}

// ---- sticks and triggers --------------------------------------------------------------------------

/**
 * Radial dead zone: inside `dz` nothing, the rest rescaled to 0..1 along the stick's own direction (no
 * cross-shaped snapping), full tilt from `outer` on (worn sticks never quite reach 1).
 */
export function radial(x: number, y: number, dz: number, outer = 0.95): [number, number] {
  const m = Math.hypot(x, y);
  if (m <= dz || m < 1e-6) return [0, 0];
  const s = Math.min(1, (m - dz) / Math.max(1e-3, outer - dz));
  return [(x / m) * s, (y / m) * s];
}

/** Look response curve: fine near the centre, full speed at full tilt (1 -> 1). */
export const lookCurve = (m: number): number => 0.2 * m + 0.8 * m * m * m;

/** Where a trigger (L2, R2) counts as pulled, by its analog value, and where it lets go again (the
 *  hysteresis: no chatter round the line). Every read of a trigger goes by its value, never its `pressed`
 *  alone: under WebKit (Safari, and every browser on an iPad, Chrome there too) a DualSense's trigger can go
 *  a long way down, or all the way, before `pressed` comes on (the controller's own click point), so a game
 *  that waits for it never sees a light pull. */
export const TRIGGER = { on: 0.2, off: 0.12 } as const;

/** A trigger as a button, with hysteresis (no chatter around the threshold). */
export function triggerDown(value: number, was: boolean, on: number = TRIGGER.on, off: number = TRIGGER.off): boolean {
  return was ? value > off : value >= on;
}

/** An analog trigger's value (a pad without analog triggers reports pressed only: all the way). */
export function triggerValue(b: { pressed: boolean; value?: number } | null | undefined): number {
  if (!b) return 0;
  const v = typeof b.value === "number" && Number.isFinite(b.value) ? b.value : 0;
  return v > 0 ? Math.min(1, v) : b.pressed ? 1 : 0;
}

// ---- any pad as the standard mapping ---------------------------------------------------------------

/** A pad as the browser lists it (the Gamepad API's shape, or a test's). */
export type PadLike = { id: string; mapping: string; buttons: ReadonlyArray<{ pressed: boolean; value?: number } | null | undefined>; axes: readonly number[] };

/** A pad read in the standard mapping's layout (BTN, whatever the browser's own): each button held (a
 *  trigger by its value, with the hysteresis), its value (0..1: the triggers' analog pull), the sticks
 *  (left x, y, right x, y; down and right positive), and how it was read. */
export type PadRead = { pressed: boolean[]; value: number[]; axes: [number, number, number, number]; how: "standard" | "sony-hid" | "raw" };

/** The buttons a read holds (BTN.touchpad the last). */
const NB = BTN.touchpad + 1;

/** A Sony pad (DualSense, DualShock 4) the browser lists without the standard mapping, as its HID report
 *  lays it out (WebKit's and Firefox's HID path on a Mac): Square, Cross, Circle, Triangle, L1, R1, L2, R2,
 *  Create, Options, L3, R3, PS, the touchpad; the sticks on axes 0, 1 (left) and 2, 5 (right), the
 *  triggers' pull on axes 3 (L2) and 4 (R2) from -1 at rest to 1, the d-pad a hat on axis 9 (-1 up, then
 *  clockwise in steps of 2/7; over 1 when let go). Each entry: the raw button for BTN's index. */
const SONY_HID = [1, 2, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11, -1, -1, -1, -1, 12, 13];

/** A hat axis (the HID d-pad) to up, right, down, left. */
function hat(v: number | undefined): [boolean, boolean, boolean, boolean] {
  if (v === undefined || !Number.isFinite(v) || v > 1.01 || v < -1.01) return [false, false, false, false];
  // eight directions from -1 (up) clockwise in steps of 2/7
  const k = Math.round((v + 1) * 3.5);
  if (k < 0 || k > 7) return [false, false, false, false];
  return [k === 7 || k === 0 || k === 1, k >= 1 && k <= 3, k >= 3 && k <= 5, k >= 5 && k <= 7];
}

/**
 * Any pad in the standard mapping's layout, its triggers by their analog value (TRIGGER, with `was`: the
 * last read's `pressed`, for the hysteresis). A standard pad as it is; a Sony pad without the standard
 * mapping remapped from its HID layout (its triggers' pull off their axes); any other pad without it read
 * as if it were standard (most are close: the face buttons, the bumpers, the triggers, the sticks on axes
 * 0-3). Every pad read in the game goes through here: the input, the menus, the device watcher.
 */
export function readPad(gp: PadLike, was: readonly boolean[] = []): PadRead {
  const pressed = new Array<boolean>(NB).fill(false), value = new Array<number>(NB).fill(0);
  const b = gp.buttons, ax = gp.axes;
  const n = (i: number) => (Number.isFinite(ax[i]) ? ax[i] : 0);
  let how: PadRead["how"] = "standard";
  let axes: PadRead["axes"] = [n(0), n(1), n(2), n(3)];
  // (the HID layout's signature: 14 buttons and its hat on axis 9; Firefox on Linux lists a Sony pad in
  // evdev's order with 13 buttons and 8 axes, which is read as it is)
  if (gp.mapping === "standard" || padKind(gp.id) !== "ps" || b.length < 14 || ax.length < 10) {
    if (gp.mapping !== "standard") how = "raw";
    for (let i = 0; i < NB; i++) {
      const x = b[i];
      if (!x) continue;
      const trig = i === BTN.l2 || i === BTN.r2;
      value[i] = trig ? triggerValue(x) : typeof x.value === "number" && x.value > 0 ? Math.min(1, x.value) : x.pressed ? 1 : 0;
      pressed[i] = trig ? triggerDown(value[i], !!was[i]) : !!x.pressed;
    }
  } else {
    how = "sony-hid";
    for (let i = 0; i < NB; i++) {
      const r = SONY_HID[i];
      const x = r >= 0 ? b[r] : null;
      if (!x) continue;
      value[i] = x.pressed ? 1 : typeof x.value === "number" ? Math.max(0, Math.min(1, x.value)) : 0;
      pressed[i] = !!x.pressed;
    }
    // the triggers' pull off their axes (from -1 at rest; a browser that has not seen one move yet may say 0)
    const pull = (a: number, btn: number) => Math.max(ax[a] !== undefined && Number.isFinite(ax[a]) && ax[a] > -1 ? (ax[a] + 1) / 2 : 0, b[btn]?.pressed ? 1 : 0);
    for (const [i, a, raw] of [[BTN.l2, 3, 6], [BTN.r2, 4, 7]] as const) {
      // (until an axis has moved off 0 it may be a trigger never touched: its button says)
      const v = n(a) === 0 && !b[raw]?.pressed ? 0 : pull(a, raw);
      value[i] = Math.min(1, v);
      pressed[i] = triggerDown(value[i], !!was[i]);
    }
    const [up, right, down, left] = hat(ax[9]);
    for (const [i, on] of [[BTN.up, up], [BTN.right, right], [BTN.down, down], [BTN.left, left]] as const) { pressed[i] = on; value[i] = on ? 1 : 0; }
    axes = [n(0), n(1), n(2), n(5)];
  }
  return { pressed, value, axes, how };
}

/** A hint's keys on a pad: one per action ("RMB / Q: bullet time" is one button there). */
export function padKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  return keys.filter(k => {
    const a = keyAct(k) ?? k;
    if (seen.has(a)) return false;
    seen.add(a);
    return true;
  });
}
