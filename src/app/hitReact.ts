// The struck body's reaction (view only, layered over her clips after the mixer): the upper body leans
// and twists away from the round on damped springs (a quick overshoot and settle), the head snaps back on
// a headshot, the big guns knock the whole body back a few centimetres (it springs back to the sim's
// spot), a short white flash on the struck girl, and on a kill a slide along the shot as she goes down.
// Springs run on world time (bullet time plays the flinch out slowly), the flash on real time. The
// hit feel dispatcher (HitFeelView) kicks them; EnemiesView / HeavyView apply them to their bones.
import { Vector3, type Object3D } from "three";
import { reactionOf, springKick, springStep, weaponWeight, type Hit, type Spring } from "./hitfeel.ts";
import { rotateBoneWorld } from "../anim/rig.ts";
import { setHitFlash } from "./look/tokens.ts";

export type React = {
  lean: Spring; twist: Spring; head: Spring; knock: Spring;
  /** The round's way (world, unit xz), the side it twists to, the head's turn with the snap. */
  dx: number; dz: number; side: number; headTurn: number;
  /** 0..1, real time. */
  flash: number;
  /** A kill: the slide along the shot (m) and how far through it (0..1; 1 = done). */
  slide: number; slideT: number;
  /** The last flash strength written to the materials (skip the traverse when it did not change). */
  shown: number;
};

const fresh = (): React => ({ lean: { x: 0, v: 0 }, twist: { x: 0, v: 0 }, head: { x: 0, v: 0 }, knock: { x: 0, v: 0 }, dx: 0, dz: 1, side: 1, headTurn: 0, flash: 0, slide: 0, slideT: 1, shown: 0 });

/** Per enemy index. */
export const reacts: React[] = [];
export const reactOf = (i: number): React => (reacts[i] ??= fresh());

export function resetReacts(): void {
  reacts.length = 0;
}

/** A hit landed on `h.target` (facing = her facing now); `k` = the reaction's strength, `flash` the flash's. */
export function kickReact(h: Hit, facing: number, k: number, flash: number): void {
  const r = reactOf(h.target);
  const a = reactionOf(h);
  const l = Math.hypot(h.dx, h.dz);
  if (l > 1e-3) { r.dx = h.dx / l; r.dz = h.dz / l; }
  // which way the torso turns: by the side of her the round came across (its cross with her facing)
  const fx = Math.sin(facing), fz = Math.cos(facing);
  const cy = fz * r.dx - fx * r.dz;
  r.side = Math.abs(cy) < 0.15 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(cy);
  springKick(r.lean, a.lean * k);
  springKick(r.twist, a.twist * k);
  if (h.headshot) r.headTurn = (Math.random() - 0.5) * 0.8;
  springKick(r.head, a.head * k);
  springKick(r.knock, a.knock * k);
  r.flash = Math.max(r.flash, flash * (h.kind === "kill" ? 1 : h.headshot ? 0.9 : 0.7));
  if (h.kind === "kill") { r.slide = Math.min(0.55, 0.16 + 0.16 * weaponWeight(h.weapon)) * Math.max(0.35, k); r.slideT = -1; }
}

/** Advance the springs (world seconds) and the flash (real seconds). */
export function stepReact(r: React, wdt: number, dt: number): void {
  if (wdt > 0) {
    springStep(r.lean, wdt);
    springStep(r.twist, wdt, 300, 19);
    springStep(r.head, wdt, 340, 16);
    springStep(r.knock, wdt, 120, 16);
    if (r.slideT >= 0 && r.slideT < 1) r.slideT = Math.min(1, r.slideT + wdt / 0.32);
  }
  r.flash = Math.max(0, r.flash - dt / 0.13);
}

/** The slide done so far (ease out: all the momentum at the start). */
export function slideNow(r: React): number {
  if (r.slideT < 0) return 0;
  const t = r.slideT;
  return r.slide * (1 - (1 - t) * (1 - t) * (1 - t));
}

/** Start the kill's slide (the body is shown dead now); `room` = free metres behind her along the shot. */
export function startSlide(r: React, room: number): void {
  if (r.slideT >= 0) return;
  r.slide = Math.max(0, Math.min(r.slide, room - 0.35));
  r.slideT = 0;
}

const UP = new Vector3(0, 1, 0);
const axis = new Vector3();
const dir = new Vector3();

export type ReactBones = { spine?: Object3D; chest?: Object3D; upper?: Object3D; neck?: Object3D; head?: Object3D };

/** The lean, twist and head snap onto the bones (after the clip and the aim; world axes). */
export function applyReactBones(r: React, b: ReactBones, scale = 1): void {
  const lean = r.lean.x * scale, twist = r.twist.x * scale * r.side, head = r.head.x * scale;
  if (Math.abs(lean) + Math.abs(twist) + Math.abs(head) < 1e-4) return;
  dir.set(r.dx, 0, r.dz);
  // rotating about up x dir tips the top of the bone along the round's way: away from the shooter
  axis.crossVectors(UP, dir).normalize();
  rotateBoneWorld(b.spine, axis, lean * 0.35);
  rotateBoneWorld(b.chest ?? b.upper, axis, lean * 0.5);
  rotateBoneWorld(b.upper && b.chest ? b.upper : undefined, axis, lean * 0.2);
  rotateBoneWorld(b.chest ?? b.spine, UP, twist * 0.6);
  rotateBoneWorld(b.neck, axis, head * 0.3);
  rotateBoneWorld(b.head, axis, head * 0.7);
  if (r.headTurn) rotateBoneWorld(b.head, UP, head * r.headTurn);
}

/** The knock-back and the kill's slide as a world offset for the root (xz). */
export function rootOffset(r: React, out: Vector3): Vector3 {
  const d = r.knock.x + slideNow(r);
  return out.set(r.dx * d, 0, r.dz * d);
}

/** One frame of a body's reaction: the springs and the flash (held by the kill cam: frozen, no flash
 *  yet, her round has not landed), the flash onto her materials when it changed. */
export function tickReact(i: number, root: Object3D, held: boolean, wdt: number, dt: number): React {
  const r = reactOf(i);
  stepReact(r, held ? 0 : wdt, held ? 0 : dt);
  const f = held ? 0 : r.flash;
  if (f !== r.shown && (Math.abs(f - r.shown) > 0.03 || f === 0)) { setHitFlash(root, f); r.shown = f; }
  return r;
}
