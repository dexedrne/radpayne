// The gamepad's layout, shared by the input (what each button does), the prompts (which glyph a hint
// shows) and the controls lists. The Gamepad API's standard mapping; the layout follows the console
// shooters of the genre: L2 aims, R2 fires, R1 dives, a stick click is bullet time, L1 takes cover (in
// cover L2 pops out and Cross vaults), the d-pad's left-right change the gun, Square reloads (or uses what is in reach), Triangle throws, Circle strikes (#4764: a
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
  [["ls"], "move"], [["rs"], "aim"], [["r2"], "fire"], [["l2"], "aim (sniper: scope)"],
  [["r3", "l3"], "bullet time"], [["r1"], "shootdodge"], [["l1"], "cover (again: dash to the marked cover)"], [["l2"], "in cover: hold to pop out and aim"],
  [["cross"], "jump (in cover: vault)"], [["square"], "reload / use"],
  [["dup"], "copium"], [["dpadH"], "weapon"], [["circle"], "melee (#4764: tap cut, hold guard)"], [["triangle"], "grenade"], [["ddown"], "use"],
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

/** A trigger as a button, with hysteresis (no chatter around the threshold). */
export function triggerDown(value: number, was: boolean, on = 0.3, off = 0.2): boolean {
  return was ? value > off : value >= on;
}

/** An analog trigger's value (a pad without analog triggers reports pressed only). */
export function triggerValue(b: { pressed: boolean; value?: number } | undefined): number {
  if (!b) return 0;
  const v = typeof b.value === "number" ? b.value : 0;
  return v > 0 ? Math.min(1, v) : b.pressed ? 1 : 0;
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
