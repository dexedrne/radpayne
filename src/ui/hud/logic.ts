// Pure HUD maths (no DOM, no React): the scale, the damage slash, the caption budget, the canvas
// filter, key hints, personal bests. Node tests import this file directly.

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number): number => clamp(v, 0, 1);

export const HUD_SIZES = { s: 0.85, m: 1, l: 1.2 } as const;

/** --s: authored-at-1080p scale. max(0.72, clamp(0.667, h / 1080, 1.25) x size). */
export function hudScale(innerHeight: number, size: keyof typeof HUD_SIZES = "m"): number {
  return Math.max(0.72, clamp(innerHeight / 1080, 0.667, 1.25) * HUD_SIZES[size]);
}

/** An n-point star outline centred on (cx, cy), radii r1 (points) and r2 (valleys). */
export function starPath(cx: number, cy: number, r1: number, r2: number, n: number, rot = 0): string {
  let d = "";
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (Math.PI * i) / n, r = i % 2 ? r2 : r1;
    d += `${i ? "L" : "M"}${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)} `;
  }
  return `${d}Z`;
}

/** Degrees to wrap into (-180, 180]. */
export function wrapDeg(d: number): number {
  let a = d % 360;
  if (a <= -180) a += 360;
  if (a > 180) a -= 360;
  return a;
}

/**
 * Where a hit came from, on screen: 0 = straight ahead (screen up), clockwise positive (90 = right).
 * (px, pz) the player, (sx, sz) the shooter, (fx, fz) the camera's forward on the ground plane.
 */
export function damageAngle(px: number, pz: number, sx: number, sz: number, fx: number, fz: number): number {
  const vx = sx - px, vz = sz - pz;
  const fl = Math.hypot(fx, fz) || 1;
  const ax = fx / fl, az = fz / fl;
  // camera right on the ground = forward x up = (-fz, fx)
  const along = vx * ax + vz * az;
  const side = vx * -az + vz * ax;
  return wrapDeg((Math.atan2(side, along) * 180) / Math.PI);
}

/**
 * The comic slash: a jagged band spanning 26 deg of the damage ellipse (rx, ry around the screen
 * centre), 8 segments, teeth up to `depth` px deep pointing at the centre. `inset` pulls it in (the
 * punch). Coordinates are relative to the screen centre.
 */
export function slashPath(deg: number, rx: number, ry: number, depth = 34, band = 9, inset = 0): string {
  const span = 13, N = 8;
  const at = (d: number, off: number): [number, number] => {
    const a = (d * Math.PI) / 180, x = Math.sin(a) * rx, y = -Math.cos(a) * ry, l = Math.hypot(x, y) || 1;
    return [x + (x / l) * (off - inset), y + (y / l) * (off - inset)];
  };
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= N; i++) pts.push(at(deg - span + (2 * span * i) / N, i % 2 ? -depth * (1 - (Math.abs(i - N / 2) / (N / 2)) * 0.5) : 0));
  for (let i = N; i >= 0; i--) pts.push(at(deg - span + (2 * span * i) / N, band));
  return `M${pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L")} Z`;
}

/** Slash strength from the damage: min(1, 0.55 + amount / 40). */
export const hurtStrength = (amount: number): number => Math.min(1, 0.55 + amount / 40);

/** Slash timing (real ms since the hit): punch in 80 ms, hold 500, fade 700. null = gone. */
export function hurtPhase(age: number): { inset: number; alpha: number } | null {
  if (age < 0 || age >= 1280) return null;
  if (age < 80) return { inset: (age / 80) * 6, alpha: 1 };
  if (age < 580) return { inset: 6, alpha: 1 };
  return { inset: 6, alpha: 1 - (age - 580) / 700 };
}
export const HURT_LIFE = 1280;

/** Threat marker size from the distance: 1.0 at 12 m or closer, 0.7 at 35 m or further. */
export const threatScale = (dist: number): number => (dist <= 12 ? 1 : dist >= 35 ? 0.7 : 1 - (0.3 * (dist - 12)) / 23);

/**
 * Pin an off-screen bearing to the screen edge: the direction (dx, dy) from the centre (screen
 * pixels, y down), a W x H screen, `inset` px inside the edge. Returns the point and the arrow's
 * rotation (deg, 0 = pointing up).
 */
export function edgePin(dx: number, dy: number, W: number, H: number, inset: number): { x: number; y: number; rot: number } {
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  const hw = W / 2 - inset, hh = H / 2 - inset;
  const t = Math.min(Math.abs(ux) > 1e-6 ? hw / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? hh / Math.abs(uy) : Infinity);
  return { x: W / 2 + ux * t, y: H / 2 + uy * t, rot: (Math.atan2(ux, -uy) * 180) / Math.PI };
}

// ---- captions: the transient-text budget ---------------------------------------------------------

export type CaptionSlot = "nudge" | "subtitle" | "objective";
/**
 * Which cream captions may show: at most one per slot, at most two at once, one while the gang is
 * awake; priority nudge > subtitle > objective (lower ones fade out).
 */
export function captionBudget(active: Record<CaptionSlot, boolean>, awake: boolean): Record<CaptionSlot, boolean> {
  const order: CaptionSlot[] = ["nudge", "subtitle", "objective"];
  let left = awake ? 1 : 2;
  const out = { nudge: false, subtitle: false, objective: false };
  for (const k of order) if (active[k] && left > 0) { out[k] = true; left--; }
  return out;
}

/** Objective caption: shows 8 s after it changes (then a 300 ms fade). */
export const OBJECTIVE_HOLD = 8000;
export const NUDGE_HOLD = 4000;

/**
 * A key hint like "RMB / Q: bullet time · SHIFT: shootdodge" -> keycaps + labels. Text without a
 * "KEYS:" prefix is a plain label.
 */
export function parseHint(hint: string): Array<{ keys: string[]; label: string }> {
  return hint.split(" · ").map(part => {
    const i = part.indexOf(":");
    if (i <= 0) return { keys: [], label: part.trim() };
    return { keys: part.slice(0, i).split("/").map(k => k.trim()).filter(Boolean), label: part.slice(i + 1).trim() };
  }).filter(p => p.keys.length || p.label);
}

// ---- ammo ----------------------------------------------------------------------------------------

/** Total low: 25% of capacity or less. */
export const ammoLow = (total: number, magSize: number, hands: number): boolean => total <= magSize * hands * 0.25;
/** A row (one hand) is low at 3 or fewer. */
export const rowLow = (n: number): boolean => n <= 3;

// ---- the canvas filter ---------------------------------------------------------------------------

export type CanvasFxIn = { screen: string; timeScale: number; health: number; deadAt: number; now: number; killcam?: boolean };

/** Warm, desaturated grade while the world is slowed (bullet time, shootdodge, kill cam): 0..1. */
export const btGrade = (timeScale: number): number => clamp01((1 - timeScale) / 0.7);
/** Low-health ramp: 0 above 35 HP, 1 at 25 HP and below. */
export const lowHp = (hp: number): number => clamp01((35 - hp) / 10);

/**
 * The canvas wrapper's CSS filter (the HUD is never filtered): BT grade -> low-HP desaturation ->
 * pause blur / results dim / death greyout. One canonical function order so CSS transitions
 * interpolate; "none" when there is nothing to do (a filter on the WebGL canvas costs a pass).
 */
export function canvasFx(i: CanvasFxIn): { filter: string; transition: string } {
  const inRoom = i.screen === "play" || i.screen === "paused";
  const k = inRoom ? btGrade(i.timeScale) : 0;
  const lo = i.screen === "play" && !i.deadAt && !i.killcam ? lowHp(i.health) : 0;
  let sepia = 0.22 * k, sat = (1 - 0.15 * k) * (1 - 0.4 * lo), con = 1 + 0.05 * k, gray = 0, bri = 1 - 0.05 * lo, blur = 0;
  let transition = "filter 0.15s";
  if (i.screen === "paused") { gray = 0.75; bri *= 0.42; blur = 3; transition = "filter 0.2s"; }
  else if (i.screen === "results") { sepia = 0; sat = 1; con = 1; gray = 0.5; bri = 0.38; blur = 2; transition = "filter 0.4s"; }
  else if (i.deadAt && i.screen === "play") { gray = 1; bri *= 0.6; transition = "filter 1.2s ease-out"; }
  const id = sepia < 0.002 && Math.abs(sat - 1) < 0.002 && Math.abs(con - 1) < 0.002 && gray < 0.002 && Math.abs(bri - 1) < 0.002 && blur <= 0;
  if (id) return { filter: "none", transition };
  const f = (n: number) => n.toFixed(3);
  let filter = `sepia(${f(sepia)}) saturate(${f(sat)}) contrast(${f(con)}) grayscale(${f(gray)}) brightness(${f(bri)})`;
  if (blur > 0) filter += ` blur(${blur}px)`;
  return { filter, transition };
}

// ---- results -------------------------------------------------------------------------------------

/** 1:12.4 */
export const fmtTime = (t: number): string => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

export const bestKey = (room: string, difficulty: string): string => `radpayne.best.${room}.${difficulty}`;

type Storageish = { getItem(k: string): string | null; setItem(k: string, v: string): void };

/**
 * Record a cleared time: returns the previous best (null = none) and whether this one is a new
 * personal best (it is then saved).
 */
export function recordBest(st: Storageish | null, room: string, difficulty: string, time: number): { prev: number | null; isBest: boolean } {
  let prev: number | null = null;
  try {
    const v = st?.getItem(bestKey(room, difficulty));
    if (v != null && Number.isFinite(Number(v)) && Number(v) > 0) prev = Number(v);
  } catch {
    /* blocked storage */
  }
  const isBest = time > 0 && (prev === null || time < prev - 1e-9);
  if (isBest) {
    try {
      st?.setItem(bestKey(room, difficulty), time.toFixed(3));
    } catch {
      /* private mode */
    }
  }
  return { prev, isBest };
}
