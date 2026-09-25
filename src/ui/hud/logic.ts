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

/** The corner groups' authored heights: the bottom-left plates; bottom-right, the weapon tabs + ammo plate. */
export const BL_H = 150, BR_H = 166;
/** The top-left group (room tag + tally) when it can't be measured, authored. */
export const TL_W = 350, TL_H = 73;

/** The smallest a head marker draws, in screen px across (the chevron is 32 authored). */
export const MARK_MIN_PX = 20;
/** A head marker's scale: the distance scale x --s, never under MARK_MIN_PX across (far ones at 720p). */
export const markerScale = (dist: number, s: number): number => Math.max(threatScale(dist) * s, MARK_MIN_PX / 32);

/** The edge arrow's size on screen: 40 px authored (x --s), never under 36 px (720p). */
export const ARROW_MIN_PX = 36;
export const arrowPx = (s: number): number => Math.max(40 * s, ARROW_MIN_PX);

/**
 * The edge arrow's direction from the screen centre (screen px, y down). Behind the lens a projection
 * says nothing useful (camera-space x / y follow the camera's pitch and height), so it is the
 * ground-plane bearing from the player, the damage slash's angle: 0 ahead = up, 90 right, 180
 * behind = down. In front of the lens it is the projected point (px, py), handed over to the bearing
 * as the point swings out toward the camera plane (`off`: degrees off the view axis, 90 = on the
 * plane), so the arrow never jumps when she crosses behind you.
 */
export function arrowDir(front: boolean, px: number, py: number, W: number, H: number, bearingDeg: number, off = 0): [number, number] {
  const a = (bearingDeg * Math.PI) / 180;
  const bx = Math.sin(a), by = -Math.cos(a);
  if (!front) return [bx, by];
  const dx = px - W / 2, dy = py - H / 2, l = Math.hypot(dx, dy);
  if (l < 1e-4) return [bx, by];
  const k = clamp01((off - 50) / 40);
  const x = (dx / l) * (1 - k) + bx * k, y = (dy / l) * (1 - k) + by * k;
  return Math.hypot(x, y) < 1e-3 ? [bx, by] : [x, y];
}

/**
 * The ring the edge arrows ride (arrow centres, screen px): the top edge and the two side edges,
 * 22 px (x --s) inside the screen plus half an arrow. It never uses the bottom edge (the Radbro,
 * the crosswalk under him and the subtitles are there): the side edges stop above the corner plates
 * (and above a nudge caption on the left), and the top-left corner steps round the room tag, tally
 * and objective (`tl`: that group's measured right / bottom, screen px).
 */
export type Ring = { left: number; right: number; top: number; nx: number; ny: number; lowL: number; lowR: number };
export function arrowRing(W: number, H: number, s: number, opts: { a?: number; tl?: { right: number; bottom: number } | null; nudgeTop?: number | null } = {}): Ring {
  const half = (opts.a ?? arrowPx(s)) / 2;
  const edge = 22 * s + half, cy = H / 2;
  const tlR = opts.tl ? opts.tl.right : (28 + TL_W) * s, tlB = opts.tl ? opts.tl.bottom : (28 + TL_H) * s;
  let lowL = H - (28 + BL_H + 10) * s - half;
  if (opts.nudgeTop != null) lowL = Math.min(lowL, opts.nudgeTop - 8 * s - half);
  const lowR = H - (28 + BR_H + 10) * s - half;
  return { left: edge, right: W - edge, top: edge, nx: tlR + 8 * s + half, ny: Math.min(tlB + 8 * s + half, cy - 1), lowL: Math.max(lowL, cy), lowR: Math.max(lowR, cy) };
}

/** Degrees either side of straight down where an arrow keeps the side it was on (no flicker). */
export const RING_HYST = 15;

/**
 * Pin an off-screen direction (dx, dy from the centre, screen px, y down) to the arrow ring. Above
 * the horizon it is where the ray leaves the ring (stopping where it would enter the top-left group);
 * below it, the side edge on her side, sliding from mid height (90 deg) down to the lowest point
 * above the plates (straight behind), or lower when the ray itself says so. `prevSide` is the side
 * this arrow was on last frame (-1 left, 1 right): near straight behind it stays there. Returns the
 * point, the arrow's rotation (deg, 0 = pointing up, it always points along the direction) and the side.
 */
export function ringPin(dx: number, dy: number, W: number, H: number, r: Ring, prevSide: -1 | 0 | 1 = 0): { x: number; y: number; rot: number; side: -1 | 1 } {
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  const rot = (Math.atan2(ux, -uy) * 180) / Math.PI;
  const cx = W / 2, cy = H / 2;
  if (uy > 1e-9) {
    let side: -1 | 1 = ux > 1e-9 ? 1 : ux < -1e-9 ? -1 : prevSide || 1;
    if (prevSide && prevSide !== side && 180 - Math.abs(rot) < RING_HYST) side = prevSide;
    // degrees round from straight up on that side: 90 (level) .. 180 (behind), past it inside the hysteresis
    const a = side > 0 ? (rot >= 0 ? rot : 360 + rot) : rot <= 0 ? -rot : 360 - rot;
    const x = side > 0 ? r.right : r.left, low = side > 0 ? r.lowR : r.lowL;
    const along = side * ux;
    const yRay = along > 1e-9 ? cy + (uy / along) * Math.abs(x - cx) : Infinity;
    const y = Math.min(low, Math.max(cy + (low - cy) * clamp01((a - 90) / 90), yRay));
    return { x, y, rot, side };
  }
  let t = Infinity;
  if (ux > 1e-9) t = Math.min(t, (r.right - cx) / ux);
  if (ux < -1e-9) t = Math.min(t, (cx - r.left) / -ux);
  if (uy < -1e-9) t = Math.min(t, (cy - r.top) / -uy);
  if (!Number.isFinite(t)) t = 0;
  let x = cx + ux * t, y = cy + uy * t;
  if (x < r.nx && y < r.ny) {
    // the ray runs into the top-left group: stop where it enters it
    const tx = cx < r.nx ? 0 : (cx - r.nx) / -ux, ty = cy < r.ny ? 0 : (cy - r.ny) / -uy;
    t = Math.max(tx, ty);
    x = cx + ux * t; y = cy + uy * t;
  }
  return { x, y, rot, side: ux >= 0 ? 1 : -1 };
}

// ---- the player's silhouette (head markers fade over it) ----------------------------------------

/** One hit capsule on screen: a segment and a radius, screen px. */
export type ScreenCapsule = { ax: number; ay: number; bx: number; by: number; r: number };

/** Distance from (px, py) to the segment a-b. */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
  const t = l2 > 1e-9 ? clamp01(((px - ax) * vx + (py - ay) * vy) / l2) : 0;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/** How close to the reticle (screen px) a Milady's head fades her marker: ~30 px, x --s above 1080p. */
export const reticleFadePx = (s: number): number => 30 * Math.max(1, s);
/** A faded head marker's opacity factor. */
export const MARK_FADED = 0.25;

/**
 * A head marker fades when her head (hx, hy, screen px) is inside the Radbro's drawn silhouette (his
 * hit capsules on screen, padded for the hair and the guns) or within `near` px of the reticle at the
 * screen centre: the marker would sit on him or on the crosshair, right where you are looking.
 */
export function markerFades(hx: number, hy: number, W: number, H: number, silhouette: readonly ScreenCapsule[], near: number): boolean {
  if (Math.hypot(hx - W / 2, hy - H / 2) < near) return true;
  for (const c of silhouette) if (segDist(hx, hy, c.ax, c.ay, c.bx, c.by) <= c.r) return true;
  return false;
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

/** The bottom-left strip's authored width: tank 150 + hourglass 104 + copium 176, two 8 px gaps, the 5 px shadow. */
export const STRIP_W = 451;
/**
 * The bottom-centre subtitle's authored width (it carries zoom: --s): 780, capped so it stays
 * centred between the corner strips with 12 px to spare (the left strip is the wider one). On
 * narrow screens it sits above the strips, so only the screen margins cap it.
 */
export function subtitleWidth(W: number, s: number, narrow: boolean): number {
  const side = narrow ? 28 : 28 + STRIP_W + 12;
  return Math.max(240, Math.min(780, W / s - 2 * side));
}

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
